import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CaseDetail,
  CaseHistoryItem,
  CaseListQuery,
  CasePage,
  CaseSummary,
  TimelineItem,
} from '@reconcilia/shared';
import { z } from 'zod';
import type { Prisma } from '../generated/prisma/client.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  GATEWAY_STATEMENT_SOURCE,
  type GatewayStatementSource,
} from './gateway-statement.source.js';

const caseWithOrder = { order: true } satisfies Prisma.CaseInclude;
type CaseWithOrder = Prisma.CaseGetPayload<{ include: typeof caseWithOrder }>;

/** Horário que o próprio sistema externo informou no payload, se houver. */
const PayloadTime = z.looseObject({
  createdAt: z.iso.datetime().optional(),
  recordedAt: z.iso.datetime().optional(),
});

function sourceTime(payload: unknown, fallback: Date): string {
  const parsed = PayloadTime.safeParse(payload);
  return (
    (parsed.success && (parsed.data.createdAt ?? parsed.data.recordedAt)) || fallback.toISOString()
  );
}

function toSummary(row: CaseWithOrder): CaseSummary {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    orderExternalId: row.order.externalId,
    amountCents: row.order.totalCents,
    detectedAt: row.detectedAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
  };
}

const AUDIT_VERBS: Record<string, string> = {
  APPROVED: 'aprovou',
  REJECTED: 'recusou',
  EXECUTED: 'backend executou',
  EXECUTION_FAILED: 'execução falhou',
};

function describeAudit(event: string, actor: string, kind: string, details: unknown): string {
  const extra =
    event === 'EXECUTION_FAILED' ? `: ${String((details as { error?: unknown }).error)}` : '';
  return event === 'EXECUTED' || event === 'EXECUTION_FAILED'
    ? `${AUDIT_VERBS[event]} ${kind} (aprovada por ${actor})${extra}`
    : `${actor} ${AUDIT_VERBS[event]} ${kind}`;
}

const SOURCE_ORDER = { STORE: 0, GATEWAY: 1, GATEWAY_STATEMENT: 2, ERP: 3 } as const;

/** Leitura dos casos para a api e a interface. Nada aqui escreve no banco. */
@Injectable()
export class CasesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(GATEWAY_STATEMENT_SOURCE) private readonly statement: GatewayStatementSource,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async list(query: CaseListQuery): Promise<CasePage> {
    const where: Prisma.CaseWhereInput = {
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.case.findMany({
        where,
        include: caseWithOrder,
        orderBy: [{ detectedAt: 'desc' }, { id: 'desc' }],
        skip: query.offset,
        take: query.limit,
      }),
      this.prisma.case.count({ where }),
    ]);
    return {
      data: rows.map(toSummary),
      pagination: { limit: query.limit, offset: query.offset, total },
    };
  }

  async detail(id: string): Promise<CaseDetail> {
    const row = await this.prisma.case.findUnique({ where: { id }, include: caseWithOrder });
    if (!row) throw new NotFoundException(`Caso ${id} não encontrado`);

    const ref = row.order.externalId;
    const [paymentEvents, erpEvents, captures, investigations, audit] = await Promise.all([
      this.prisma.paymentEvent.findMany({ where: { orderExternalId: ref } }),
      this.prisma.erpEvent.findMany({ where: { orderExternalId: ref } }),
      this.statement.listCaptures(ref),
      this.prisma.investigation.findMany({
        where: { caseId: id },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          createdAt: true,
          status: true,
          suggestedAction: true,
          failureReason: true,
        },
      }),
      this.prisma.auditEntry.findMany({
        where: { caseId: id },
        orderBy: { at: 'asc' },
        include: { action: { select: { kind: true } } },
      }),
    ]);

    const orderCreated: TimelineItem = {
      at: row.order.createdAt.toISOString(),
      source: 'STORE',
      type: 'ORDER_CREATED',
      amountCents: row.order.totalCents,
      eventId: null,
      receivedCount: null,
      duplicate: false,
      processedAt: null,
    };
    const timeline: TimelineItem[] = [
      orderCreated,
      ...paymentEvents.map((event): TimelineItem => ({
        at: sourceTime(event.payload, event.receivedAt),
        source: 'GATEWAY',
        type: event.type,
        amountCents: event.amountCents,
        eventId: event.eventId,
        receivedCount: event.receivedCount,
        duplicate: event.receivedCount > 1,
        processedAt: event.processedAt?.toISOString() ?? null,
      })),
      ...captures.map((capture): TimelineItem => ({
        at: capture.capturedAt.toISOString(),
        source: 'GATEWAY_STATEMENT',
        type: 'CAPTURE',
        amountCents: capture.amountCents,
        eventId: capture.eventId,
        receivedCount: null,
        duplicate: false,
        processedAt: null,
      })),
      ...erpEvents.map((event): TimelineItem => ({
        at: sourceTime(event.payload, event.receivedAt),
        source: 'ERP',
        type: event.type,
        amountCents: event.amountCents,
        eventId: event.eventId,
        receivedCount: event.receivedCount,
        duplicate: event.receivedCount > 1,
        processedAt: null,
      })),
    ].sort((a, b) => a.at.localeCompare(b.at) || SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source]);

    const history: CaseHistoryItem[] = [
      {
        at: row.detectedAt.toISOString(),
        kind: 'DETECTED',
        description: 'Detectado pela conciliação',
      },
    ];
    for (const investigation of investigations) {
      const kind = (investigation.suggestedAction as { kind?: string } | null)?.kind;
      const detail =
        investigation.status === 'DONE' && kind
          ? `: sugeriu ${kind}`
          : investigation.failureReason
            ? `: ${investigation.failureReason}`
            : '';
      history.push({
        at: investigation.createdAt.toISOString(),
        kind: 'INVESTIGATION',
        description: `Investigação do agente ${investigation.status}${detail}`,
      });
    }
    for (const entry of audit) {
      history.push({
        at: entry.at.toISOString(),
        kind: entry.event,
        description: describeAudit(entry.event, entry.actor, entry.action.kind, entry.details),
      });
    }
    if (row.resolvedAt && row.status !== 'OPEN') {
      history.push({
        at: row.resolvedAt.toISOString(),
        kind: row.status === 'RESOLVED' ? 'RESOLVED' : 'DISMISSED',
        description: row.status === 'RESOLVED' ? 'Resolvido' : 'Descartado',
      });
    }

    history.sort((x, y) => x.at.localeCompare(y.at));

    return {
      case: toSummary(row),
      order: {
        externalId: ref,
        status: row.order.status,
        totalCents: row.order.totalCents,
        installments: row.order.installments,
        createdAt: row.order.createdAt.toISOString(),
      },
      timeline,
      history,
      investigations: [...investigations].reverse().map((i) => ({
        id: i.id,
        status: i.status,
        createdAt: i.createdAt.toISOString(),
      })),
      storeTimezone: this.env.STORE_TIMEZONE,
    };
  }
}
