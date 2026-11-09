import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  type ActionDecision,
  type ActionView,
  type AuditEntryView,
  SuggestedActionSchema,
} from '@reconcilia/shared';
import { InjectPinoLogger, type PinoLogger } from 'nestjs-pino';
import { fromPrisma } from 'pg-boss';
import {
  ActionStatus,
  AuditEvent,
  CaseStatus,
  OrderStatus,
  type Prisma,
} from '../generated/prisma/client.js';
import { LEDGER, type LedgerPort } from '../ledger/ledger.port.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PAYMENT_EVENTS_QUEUE, type PaymentEventJob } from '../queue/queue.constants.js';
import { QueueService } from '../queue/queue.service.js';
import {
  GATEWAY_STATEMENT_SOURCE,
  type GatewayStatementSource,
} from '../reconciliation/gateway-statement.source.js';
import { ERP_ADJUSTMENT_SINK, type ErpAdjustmentSink } from './erp-adjustment.sink.js';

const withContext = {
  investigation: { include: { case: { include: { order: true } } } },
  auditEntries: { orderBy: { at: 'asc' } },
} satisfies Prisma.ActionInclude;
type ActionWithContext = Prisma.ActionGetPayload<{ include: typeof withContext }>;

/** O efeito não pôde ser aplicado (dado mudou, id não existe mais): nada é gravado. */
class ExecutionError extends Error {}

type ExecutionResult = Record<string, string | number | boolean | null>;

/**
 * Aprovação humana e execução. A IA só sugere; aqui uma pessoa decide e o backend executa.
 *
 * Execução idempotente pelo banco: a transação começa com
 *   UPDATE actions SET status = 'EXECUTED' WHERE id = $1 AND status = 'APPROVED'
 * e, com 0 linhas, sai sem efeito (outra chamada já executou). Efeito, caso RESOLVED e
 * auditoria entram no mesmo COMMIT; se o efeito falhar, nada fica e a ação segue APPROVED.
 */
@Injectable()
export class ActionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    @Inject(LEDGER) private readonly ledger: LedgerPort,
    @Inject(GATEWAY_STATEMENT_SOURCE) private readonly statement: GatewayStatementSource,
    @Inject(ERP_ADJUSTMENT_SINK) private readonly erp: ErpAdjustmentSink,
    @InjectPinoLogger(ActionsService.name) private readonly logger: PinoLogger,
  ) {}

  async approve(actionId: string, decidedBy: string): Promise<ActionDecision> {
    const action = await this.load(actionId);
    if (action.status === ActionStatus.REJECTED) {
      throw new ConflictException('Esta ação já foi recusada.');
    }

    if (action.status === ActionStatus.PENDING) {
      const { count } = await this.prisma.action.updateMany({
        where: { id: actionId, status: ActionStatus.PENDING },
        data: { status: ActionStatus.APPROVED, decidedBy, decidedAt: new Date() },
      });
      if (count === 1) {
        await this.audit(action, AuditEvent.APPROVED, decidedBy, {});
      } else if ((await this.load(actionId)).status === ActionStatus.REJECTED) {
        throw new ConflictException('Esta ação foi recusada enquanto era aprovada.');
      }
    }

    await this.execute(actionId, decidedBy);
    return this.decision(actionId);
  }

  async reject(actionId: string, decidedBy: string, reason?: string): Promise<ActionDecision> {
    const action = await this.load(actionId);
    if (action.status === ActionStatus.APPROVED || action.status === ActionStatus.EXECUTED) {
      throw new ConflictException('Esta ação já foi aprovada.');
    }

    const { count } = await this.prisma.action.updateMany({
      where: { id: actionId, status: ActionStatus.PENDING },
      data: {
        status: ActionStatus.REJECTED,
        decidedBy,
        decidedAt: new Date(),
        rejectionReason: reason ?? null,
      },
    });
    if (count === 1) {
      await this.audit(action, AuditEvent.REJECTED, decidedBy, reason ? { reason } : {});
    } else if ((await this.load(actionId)).status !== ActionStatus.REJECTED) {
      throw new ConflictException('Esta ação foi aprovada enquanto era recusada.');
    }
    return this.decision(actionId);
  }

  async get(actionId: string): Promise<ActionView> {
    return toView(await this.load(actionId));
  }

  /** Executa uma ação APPROVED exatamente uma vez. Falha → 422, ação continua APPROVED. */
  private async execute(actionId: string, approvedBy: string): Promise<void> {
    const action = await this.load(actionId);
    if (action.status !== ActionStatus.APPROVED) return;

    try {
      await this.prisma.$transaction(async (tx) => {
        // Um único horário para a execução, o caso RESOLVED e a auditoria.
        const now = new Date();
        const claimed = await tx.action.updateMany({
          where: { id: actionId, status: ActionStatus.APPROVED },
          data: { status: ActionStatus.EXECUTED, executedAt: now },
        });
        if (claimed.count === 0) return; // outra chamada executou primeiro

        const result = await this.applyEffect(tx, action, approvedBy);
        const caseId = action.investigation.caseId;
        await tx.action.update({ where: { id: actionId }, data: { executionResult: result } });
        await tx.case.updateMany({
          where: { id: caseId, status: CaseStatus.OPEN },
          data: { status: CaseStatus.RESOLVED, resolvedAt: now },
        });
        await tx.auditEntry.create({
          data: {
            actionId,
            caseId,
            event: AuditEvent.EXECUTED,
            actor: approvedBy,
            at: now,
            details: { executor: 'backend', ...result },
          },
        });
        this.logger.info({ actionId, caseId, kind: action.kind, result }, 'ação executada');
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.audit(action, AuditEvent.EXECUTION_FAILED, approvedBy, { error: message });
      this.logger.warn({ actionId, kind: action.kind, error: message }, 'execução falhou');
      throw new UnprocessableEntityException(
        `A execução falhou e nada foi alterado: ${message}. A ação segue APPROVED; aprove de novo para tentar outra vez.`,
      );
    }
  }

  /** O efeito de cada tipo de ação. O pedido vem SEMPRE do caso, nunca dos params. */
  private async applyEffect(
    tx: Prisma.TransactionClient,
    action: ActionWithContext,
    approvedBy: string,
  ): Promise<ExecutionResult> {
    const order = action.investigation.case.order;
    const parsed = SuggestedActionSchema.safeParse({ kind: action.kind, params: action.params });
    if (!parsed.success) throw new ExecutionError('params da ação inválidos');
    const suggested = parsed.data;

    switch (suggested.kind) {
      case 'MARK_ORDER_PAID': {
        const capture = (await this.statement.listCaptures(order.externalId)).find(
          (c) => c.chargeId === suggested.params.chargeId,
        );
        if (!capture) {
          throw new ExecutionError(`${suggested.params.chargeId} não está no extrato do pedido`);
        }
        const paid = await tx.order.updateMany({
          where: { id: order.id, status: OrderStatus.PENDING },
          data: { status: OrderStatus.PAID },
        });
        // Mesmo transactionId do worker: se o webhook perdido chegar depois, não lança em dobro.
        const ledger = await this.ledger.recordCapture(tx, {
          transactionId: `capture:${capture.eventId}`,
          orderExternalId: order.externalId,
          amountCents: capture.amountCents,
        });
        return {
          orderStatus: paid.count === 1 ? 'PAID' : `já estava ${order.status}`,
          ledger,
          ledgerTransactionId: `capture:${capture.eventId}`,
          amountCents: capture.amountCents,
        };
      }

      case 'REPROCESS_WEBHOOK': {
        const event = await tx.paymentEvent.findFirst({
          where: { eventId: suggested.params.eventId, orderExternalId: order.externalId },
        });
        if (!event) {
          throw new ExecutionError(`${suggested.params.eventId} não é um webhook do pedido`);
        }
        if (event.processedAt) {
          return {
            eventId: event.eventId,
            enqueued: false,
            reason: 'o evento já tinha sido aplicado',
          };
        }
        const job: PaymentEventJob = {
          paymentEventId: event.id,
          eventId: event.eventId,
          orderExternalId: event.orderExternalId,
        };
        const jobId = await this.queue.boss.send(PAYMENT_EVENTS_QUEUE, job, {
          ...this.queue.paymentEventJobOptions(),
          singletonKey: event.eventId,
          db: fromPrisma(tx),
        });
        return {
          eventId: event.eventId,
          enqueued: jobId !== null,
          reason: jobId ? 'reenfileirado' : 'já havia um job vivo para o evento',
        };
      }

      case 'FLAG_ERP_DIVERGENCE': {
        const adjustment = await this.erp.requestAdjustment(tx, {
          actionId: action.id,
          orderExternalId: order.externalId,
          expectedCents: suggested.params.expectedCents,
          erpCents: suggested.params.erpCents,
        });
        return {
          erpAdjustmentRequested: adjustment.created,
          differenceCents: adjustment.differenceCents,
          requestedBy: approvedBy,
        };
      }

      case 'REFUND_CAPTURE': {
        if (order.status !== OrderStatus.CANCELED) {
          throw new ExecutionError(`o pedido está ${order.status}; só se estorna pedido CANCELED`);
        }
        const capture = (await this.statement.listCaptures(order.externalId)).find(
          (c) => c.chargeId === suggested.params.chargeId,
        );
        if (!capture) {
          throw new ExecutionError(`${suggested.params.chargeId} não está no extrato do pedido`);
        }
        // Um estorno por cobrança: o transactionId vem do chargeId, não da ação. Mesmo que o caso
        // seja investigado e aprovado de novo, o ledger devolve already-posted.
        const transactionId = `refund-capture:${capture.chargeId}`;
        const ledger = await this.ledger.recordRefund(tx, {
          transactionId,
          orderExternalId: order.externalId,
          amountCents: capture.amountCents,
        });
        return { ledger, ledgerTransactionId: transactionId, amountCents: capture.amountCents };
      }

      case 'IGNORE_DUPLICATE':
        return { eventId: suggested.params.eventId, ignored: true };
    }
  }

  private async audit(
    action: ActionWithContext,
    event: AuditEvent,
    actor: string,
    details: Prisma.InputJsonObject,
  ): Promise<void> {
    await this.prisma.auditEntry.create({
      data: { actionId: action.id, caseId: action.investigation.caseId, event, actor, details },
    });
  }

  private async load(actionId: string): Promise<ActionWithContext> {
    const action = await this.prisma.action.findUnique({
      where: { id: actionId },
      include: withContext,
    });
    if (!action) throw new NotFoundException(`Ação ${actionId} não encontrada`);
    return action;
  }

  private async decision(actionId: string): Promise<ActionDecision> {
    const action = await this.load(actionId);
    const caseRow = await this.prisma.case.findUniqueOrThrow({
      where: { id: action.investigation.caseId },
      select: { id: true, status: true },
    });
    return { action: toView(action), case: caseRow };
  }
}

function toView(action: ActionWithContext): ActionView {
  return {
    id: action.id,
    investigationId: action.investigationId,
    caseId: action.investigation.caseId,
    kind: action.kind,
    params: action.params as Record<string, unknown>,
    status: action.status,
    decidedBy: action.decidedBy,
    decidedAt: action.decidedAt?.toISOString() ?? null,
    executedAt: action.executedAt?.toISOString() ?? null,
    rejectionReason: action.rejectionReason,
    executionResult: action.executionResult as Record<string, unknown> | null,
    audit: action.auditEntries.map((entry): AuditEntryView => ({
      event: entry.event,
      actor: entry.actor,
      at: entry.at.toISOString(),
      details: entry.details as Record<string, unknown>,
    })),
  };
}
