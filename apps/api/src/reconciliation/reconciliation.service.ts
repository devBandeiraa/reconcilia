import { Inject, Injectable } from '@nestjs/common';
import type { CaseType as CaseTypeName, ReconciliationResult } from '@reconcilia/shared';
import { InjectPinoLogger, type PinoLogger } from 'nestjs-pino';
import {
  CaseStatus,
  CaseType,
  ErpEventType,
  OrderStatus,
  PaymentEventType,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  GATEWAY_STATEMENT_SOURCE,
  type GatewayStatementSource,
} from './gateway-statement.source.js';

/** Pedidos (por id interno) com cada tipo de divergência. */
export type Divergences = Record<CaseTypeName, string[]>;

/**
 * Compara loja, gateway (extrato) e ERP por pedido e abre um caso por divergência.
 *
 * - PAYMENT_WITHOUT_ORDER: o extrato tem a captura, o pedido está PENDING e nenhum webhook
 *   charge.captured desse pedido chegou. A última condição deixa o resultado independente do
 *   worker: uma captura recebida mas ainda na fila não é "pagamento sem pedido".
 * - DUPLICATE_WEBHOOK: algum evento do gateway do pedido chegou mais de uma vez.
 * - AMOUNT_MISMATCH: valor capturado (extrato), total do pedido e valor do ERP não são iguais.
 *
 * Abrir é idempotente pelo banco: ON CONFLICT DO NOTHING contra o índice único parcial
 * (um caso OPEN por pedido e tipo). Um caso que uma pessoa resolveu ou descartou não é reaberto.
 */
@Injectable()
export class ReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(GATEWAY_STATEMENT_SOURCE) private readonly statement: GatewayStatementSource,
    @InjectPinoLogger(ReconciliationService.name) private readonly logger: PinoLogger,
  ) {}

  async run(): Promise<ReconciliationResult> {
    const divergences = await this.detect();
    const opened = {} as ReconciliationResult['opened'];
    let detected = 0;
    let alreadyResolved = 0;

    for (const type of Object.keys(divergences) as CaseTypeName[]) {
      // Não reabre o que uma pessoa resolveu ou descartou: a divergência pode continuar no dado
      // (received_count > 1 não volta a 1; a diferença no ERP continua até o ERP ajustar).
      const decided = new Set(
        (
          await this.prisma.case.findMany({
            where: {
              type: CaseType[type],
              status: { in: [CaseStatus.RESOLVED, CaseStatus.DISMISSED] },
              orderId: { in: divergences[type] },
            },
            select: { orderId: true },
          })
        ).map((c) => c.orderId),
      );
      const orderIds = divergences[type].filter((orderId) => !decided.has(orderId));
      alreadyResolved += decided.size;
      detected += orderIds.length;

      const { count } = await this.prisma.case.createMany({
        data: orderIds.map((orderId) => ({ orderId, type: CaseType[type] })),
        skipDuplicates: true,
      });
      opened[type] = count;
    }

    const result: ReconciliationResult = {
      opened,
      alreadyOpen: detected - Object.values(opened).reduce((sum, n) => sum + n, 0),
      alreadyResolved,
      ranAt: new Date().toISOString(),
    };
    this.logger.info(result, 'conciliação concluída');
    return result;
  }

  /** Só leitura: quais pedidos têm cada divergência agora. */
  async detect(): Promise<Divergences> {
    const captures = await this.statement.listCaptures();
    const capturedByOrder = new Map<string, number>();
    for (const capture of captures) {
      capturedByOrder.set(
        capture.orderExternalId,
        (capturedByOrder.get(capture.orderExternalId) ?? 0) + capture.amountCents,
      );
    }
    const statementRefs = [...capturedByOrder.keys()];

    const [pendingWithCapture, capturedWebhooks, duplicatedEvents, erpTotals, ordersInStatement] =
      await Promise.all([
        this.prisma.order.findMany({
          where: { status: OrderStatus.PENDING, externalId: { in: statementRefs } },
          select: { id: true, externalId: true },
        }),
        this.prisma.paymentEvent.findMany({
          where: { type: PaymentEventType.CAPTURED, orderExternalId: { in: statementRefs } },
          select: { orderExternalId: true },
          distinct: ['orderExternalId'],
        }),
        this.prisma.paymentEvent.findMany({
          where: { receivedCount: { gt: 1 } },
          select: { orderExternalId: true },
          distinct: ['orderExternalId'],
        }),
        this.prisma.erpEvent.groupBy({
          by: ['orderExternalId'],
          where: {
            type: ErpEventType.PAYMENT_RECORDED,
            orderExternalId: { in: statementRefs },
          },
          _sum: { amountCents: true },
        }),
        this.prisma.order.findMany({
          where: { externalId: { in: statementRefs } },
          select: { id: true, externalId: true, totalCents: true },
        }),
      ]);

    const webhookArrived = new Set(capturedWebhooks.map((e) => e.orderExternalId));
    const paymentWithoutOrder = pendingWithCapture
      .filter((order) => !webhookArrived.has(order.externalId))
      .map((order) => order.id);

    const duplicateOrders = await this.prisma.order.findMany({
      where: { externalId: { in: duplicatedEvents.map((e) => e.orderExternalId) } },
      select: { id: true },
    });

    const erpByOrder = new Map(erpTotals.map((g) => [g.orderExternalId, g._sum.amountCents ?? 0]));
    const amountMismatch = ordersInStatement
      .filter((order) => {
        const erp = erpByOrder.get(order.externalId);
        const captured = capturedByOrder.get(order.externalId);
        if (erp === undefined || captured === undefined) return false;
        return !(captured === order.totalCents && erp === order.totalCents);
      })
      .map((order) => order.id);

    return {
      PAYMENT_WITHOUT_ORDER: paymentWithoutOrder,
      DUPLICATE_WEBHOOK: duplicateOrders.map((order) => order.id),
      AMOUNT_MISMATCH: amountMismatch,
    };
  }
}
