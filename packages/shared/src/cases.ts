import { z } from 'zod';
import { CASE_TYPES } from './simulation.js';

/** Status de um caso (mesmos valores do enum CaseStatus do banco). */
export const CASE_STATUSES = ['OPEN', 'RESOLVED', 'DISMISSED'] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

const isoDateTime = z.iso.datetime();
const cents = z.number().int();

/** Resultado de uma rodada de conciliação. */
export const ReconciliationResultSchema = z.object({
  /** Casos novos abertos nesta rodada, por tipo. */
  opened: z.object({
    PAYMENT_WITHOUT_ORDER: z.number().int(),
    DUPLICATE_WEBHOOK: z.number().int(),
    AMOUNT_MISMATCH: z.number().int(),
    CAPTURE_ON_CANCELED_ORDER: z.number().int(),
  }),
  /** Divergências detectadas que já tinham caso aberto (ignoradas pelo índice parcial). */
  alreadyOpen: z.number().int(),
  /** Divergências cujo caso uma pessoa já resolveu ou descartou: não são reabertas. */
  alreadyResolved: z.number().int(),
  ranAt: isoDateTime,
});
export type ReconciliationResult = z.infer<typeof ReconciliationResultSchema>;

/** Linha da lista de casos. amountCents é o total do pedido. */
export const CaseSummarySchema = z.object({
  id: z.uuid(),
  type: z.enum(CASE_TYPES),
  status: z.enum(CASE_STATUSES),
  orderExternalId: z.string(),
  amountCents: cents,
  detectedAt: isoDateTime,
  resolvedAt: isoDateTime.nullable(),
});
export type CaseSummary = z.infer<typeof CaseSummarySchema>;

export const CaseListQuerySchema = z.object({
  type: z.enum(CASE_TYPES).optional(),
  status: z.enum(CASE_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type CaseListQuery = z.infer<typeof CaseListQuerySchema>;

export const CasePageSchema = z.object({
  data: z.array(CaseSummarySchema),
  pagination: z.object({
    limit: z.number().int(),
    offset: z.number().int(),
    total: z.number().int(),
  }),
});
export type CasePage = z.infer<typeof CasePageSchema>;

/** De onde veio cada evento da linha do tempo. */
export const TIMELINE_SOURCES = ['STORE', 'GATEWAY', 'GATEWAY_STATEMENT', 'ERP'] as const;

/** Um evento de um dos três lados. `at` é sempre UTC; o fuso só existe na interface. */
export const TimelineItemSchema = z.object({
  at: isoDateTime,
  source: z.enum(TIMELINE_SOURCES),
  type: z.string(),
  amountCents: cents,
  eventId: z.string().nullable(),
  /** Quantas vezes o evento chegou (só eventos de webhook). */
  receivedCount: z.number().int().nullable(),
  duplicate: z.boolean(),
  /** Quando o worker aplicou o evento (só eventos do gateway). */
  processedAt: isoDateTime.nullable(),
});
export type TimelineItem = z.infer<typeof TimelineItemSchema>;

export const CaseHistoryItemSchema = z.object({
  at: isoDateTime,
  kind: z.enum([
    'DETECTED',
    'INVESTIGATION',
    'APPROVED',
    'REJECTED',
    'EXECUTED',
    'EXECUTION_FAILED',
    'RESOLVED',
    'DISMISSED',
  ]),
  description: z.string(),
});
export type CaseHistoryItem = z.infer<typeof CaseHistoryItemSchema>;

export const CaseDetailSchema = z.object({
  case: CaseSummarySchema,
  order: z.object({
    externalId: z.string(),
    status: z.enum(['PENDING', 'PAID', 'CANCELED']),
    totalCents: cents,
    installments: z.number().int(),
    createdAt: isoDateTime,
    /** Quando a loja cancelou (só pedidos CANCELED que vieram de um order.canceled). */
    canceledAt: isoDateTime.nullable(),
  }),
  /** Loja, gateway, extrato e ERP em ordem cronológica. */
  timeline: z.array(TimelineItemSchema),
  history: z.array(CaseHistoryItemSchema),
  /** Investigações do caso, mais recente primeiro (o detalhe está em GET /investigations/:id). */
  investigations: z.array(
    z.object({
      id: z.uuid(),
      status: z.enum(['QUEUED', 'RUNNING', 'DONE', 'FAILED']),
      createdAt: isoDateTime,
    }),
  ),
  /** Fuso da loja (IANA). Os horários são UTC; a interface usa este fuso só para exibir. */
  storeTimezone: z.string(),
});
export type CaseDetail = z.infer<typeof CaseDetailSchema>;
