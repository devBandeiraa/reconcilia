import type { CaseType } from '@reconcilia/shared';
import { ErpEventType, type Prisma } from '../generated/prisma/client.js';
import type { GatewayStatementSource } from '../reconciliation/gateway-statement.source.js';
import type { ToolDeclaration } from './llm/llm-client.js';

/** O caso sendo investigado. O pedido vem daqui, nunca dos argumentos do modelo. */
export interface CaseContext {
  caseId: string;
  caseType: CaseType;
  detectedAt: Date;
  orderExternalId: string;
  storeTimezone: string;
}

/** "2026-11-07 20:10:02" no fuso da loja. Só para leitura humana; o banco é UTC. */
export function localTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(date);
}

function sourceTime(payload: unknown, key: 'createdAt' | 'recordedAt', fallback: Date): Date {
  const value = (payload as Record<string, unknown> | null)?.[key];
  return typeof value === 'string' ? new Date(value) : fallback;
}

const NO_PARAMS = { type: 'object', properties: {}, additionalProperties: false };

export interface ReadToolDeps {
  tx: Prisma.TransactionClient;
  statement: GatewayStatementSource;
  context: CaseContext;
}

export interface ReadTool {
  declaration: ToolDeclaration;
  read(deps: ReadToolDeps): Promise<Record<string, unknown>>;
  summarize(output: Record<string, unknown>): string;
}

const getOrder: ReadTool = {
  declaration: {
    name: 'getOrder',
    description:
      'Pedido do caso na loja: status, total em centavos, parcelas, quando foi criado e, se foi ' +
      'cancelado, quando (UTC e horário local da loja).',
    parameters: NO_PARAMS,
  },
  async read({ tx, context }) {
    const order = await tx.order.findUniqueOrThrow({
      where: { externalId: context.orderExternalId },
    });
    return {
      externalId: order.externalId,
      status: order.status,
      totalCents: order.totalCents,
      installments: order.installments,
      createdAt: order.createdAt.toISOString(),
      createdAtLocal: localTime(order.createdAt, context.storeTimezone),
      canceledAt: order.canceledAt?.toISOString() ?? null,
      canceledAtLocal: order.canceledAt ? localTime(order.canceledAt, context.storeTimezone) : null,
      storeTimezone: context.storeTimezone,
    };
  },
  summarize: (o) =>
    `pedido ${String(o.externalId)} ${String(o.status)}, total ${String(o.totalCents)}`,
};

const getGatewayEvents: ReadTool = {
  declaration: {
    name: 'getGatewayEvents',
    description:
      'Webhooks do gateway recebidos para o pedido: tipo, valor, quantas vezes chegou ' +
      '(receivedCount), quando ocorreu e chegou (UTC e local) e quando foi aplicado (processedAt).',
    parameters: NO_PARAMS,
  },
  async read({ tx, context }) {
    const events = await tx.paymentEvent.findMany({
      where: { orderExternalId: context.orderExternalId },
      orderBy: { receivedAt: 'asc' },
    });
    return {
      events: events.map((event) => {
        const occurredAt = sourceTime(event.payload, 'createdAt', event.receivedAt);
        return {
          eventId: event.eventId,
          type: event.type,
          amountCents: event.amountCents,
          receivedCount: event.receivedCount,
          occurredAt: occurredAt.toISOString(),
          occurredAtLocal: localTime(occurredAt, context.storeTimezone),
          receivedAt: event.receivedAt.toISOString(),
          receivedAtLocal: localTime(event.receivedAt, context.storeTimezone),
          processedAt: event.processedAt?.toISOString() ?? null,
        };
      }),
    };
  },
  summarize: (o) => {
    const events = o.events as { type: string; receivedCount: number }[];
    const resent = events.filter((e) => e.receivedCount > 1).length;
    return `${events.length} webhooks (${events.map((e) => e.type).join(', ') || 'nenhum'}); ${resent} com reenvio`;
  },
};

const getGatewayStatement: ReadTool = {
  declaration: {
    name: 'getGatewayStatement',
    description:
      'Extrato do gateway para o pedido: as capturas que o gateway registrou, com chargeId, ' +
      'valor e horário (UTC e local). Mostra capturas mesmo quando o webhook nunca chegou.',
    parameters: NO_PARAMS,
  },
  async read({ statement, context }) {
    const captures = await statement.listCaptures(context.orderExternalId);
    return {
      captures: captures.map((capture) => ({
        chargeId: capture.chargeId,
        eventId: capture.eventId,
        amountCents: capture.amountCents,
        capturedAt: capture.capturedAt.toISOString(),
        capturedAtLocal: localTime(capture.capturedAt, context.storeTimezone),
      })),
    };
  },
  summarize: (o) => {
    const captures = o.captures as { amountCents: number }[];
    const total = captures.reduce((sum, c) => sum + c.amountCents, 0);
    return `${captures.length} captura(s) no extrato, soma ${total}`;
  },
};

const getErpEvents: ReadTool = {
  declaration: {
    name: 'getErpEvents',
    description:
      'Lançamentos do ERP para o pedido: tipo, valor, quantas vezes chegou e quando foi ' +
      'registrado (UTC e local).',
    parameters: NO_PARAMS,
  },
  async read({ tx, context }) {
    const events = await tx.erpEvent.findMany({
      where: { orderExternalId: context.orderExternalId },
      orderBy: { receivedAt: 'asc' },
    });
    return {
      events: events.map((event) => {
        const recordedAt = sourceTime(event.payload, 'recordedAt', event.receivedAt);
        return {
          eventId: event.eventId,
          type: event.type,
          amountCents: event.amountCents,
          receivedCount: event.receivedCount,
          recordedAt: recordedAt.toISOString(),
          recordedAtLocal: localTime(recordedAt, context.storeTimezone),
        };
      }),
    };
  },
  summarize: (o) => {
    const events = o.events as { type: string; amountCents: number }[];
    const payments = events
      .filter((e) => e.type === ErpEventType.PAYMENT_RECORDED)
      .reduce((sum, e) => sum + e.amountCents, 0);
    return `${events.length} lançamento(s) no ERP; pagamentos somam ${payments}`;
  },
};

export const READ_TOOLS: Record<string, ReadTool> = Object.fromEntries(
  [getOrder, getGatewayEvents, getGatewayStatement, getErpEvents].map((tool) => [
    tool.declaration.name,
    tool,
  ]),
);

export const SUBMIT_DIAGNOSIS = 'submitDiagnosis';

/** Declaração do submitDiagnosis. A validação estrita (por tipo de ação) é feita com Zod. */
export const SUBMIT_DIAGNOSIS_DECLARATION: ToolDeclaration = {
  name: SUBMIT_DIAGNOSIS,
  description:
    'Entrega o diagnóstico final e a ação recomendada. Chame uma única vez, no fim. Os ids e ' +
    'valores dos params precisam existir nos dados que as ferramentas retornaram.',
  parameters: {
    type: 'object',
    properties: {
      diagnosis: {
        type: 'string',
        description: 'O que aconteceu, em português (10 a 2000 caracteres).',
      },
      evidence: {
        type: 'array',
        items: { type: 'string' },
        description: '1 a 10 evidências, cada uma citando um dado concreto das ferramentas.',
      },
      suggestedAction: {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            enum: [
              'MARK_ORDER_PAID',
              'REPROCESS_WEBHOOK',
              'IGNORE_DUPLICATE',
              'FLAG_ERP_DIVERGENCE',
              'REFUND_CAPTURE',
            ],
          },
          params: {
            type: 'object',
            description:
              'MARK_ORDER_PAID e REFUND_CAPTURE: { chargeId }. REPROCESS_WEBHOOK e ' +
              'IGNORE_DUPLICATE: { eventId }. FLAG_ERP_DIVERGENCE: { expectedCents, erpCents }.',
            properties: {
              chargeId: { type: 'string' },
              eventId: { type: 'string' },
              expectedCents: { type: 'integer' },
              erpCents: { type: 'integer' },
            },
          },
        },
        required: ['kind', 'params'],
      },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
    },
    required: ['diagnosis', 'evidence', 'suggestedAction', 'confidence'],
  },
};

export const TOOL_DECLARATIONS: ToolDeclaration[] = [
  ...Object.values(READ_TOOLS).map((tool) => tool.declaration),
  SUBMIT_DIAGNOSIS_DECLARATION,
];
