import { z } from 'zod';

/**
 * Contratos dos sistemas externos (loja, gateway e ERP). Cada um fala no formato dele; a api
 * traduz para o modelo interno. Todos chegam assinados: `X-Signature: sha256=<hex>`, HMAC-SHA256
 * do corpo bruto com o WEBHOOK_SECRET.
 */
export const SIGNATURE_HEADER = 'x-signature';

/** Segredo padrão SÓ para desenvolvimento local. A api recusa subir com ele em produção. */
export const DEV_WEBHOOK_SECRET = 'dev-only-webhook-secret-troque-em-producao';

const isoDateTime = z.iso.datetime();
const cents = z.number().int().nonnegative();
const reference = z.string().min(1).max(64);
const eventId = z.string().min(1).max(128);
const installments = z.number().int().min(1).max(24);

/** Loja → api: pedido criado ou cancelado. */
export const StoreWebhookSchema = z.discriminatedUnion('type', [
  z.object({
    id: eventId,
    type: z.literal('order.created'),
    occurredAt: isoDateTime,
    order: z.object({
      externalId: reference,
      totalCents: cents,
      installments,
    }),
  }),
  z.object({
    id: eventId,
    type: z.literal('order.canceled'),
    occurredAt: isoDateTime,
    order: z.object({ externalId: reference }),
  }),
]);
export type StoreWebhook = z.infer<typeof StoreWebhookSchema>;

export const GATEWAY_EVENT_TYPES = [
  'charge.authorized',
  'charge.captured',
  'charge.refunded',
] as const;
export type GatewayEventType = (typeof GATEWAY_EVENT_TYPES)[number];

/** Gateway → api: evento de cobrança. */
export const GatewayWebhookSchema = z.object({
  id: eventId,
  provider: z.string().min(1).max(32),
  type: z.enum(GATEWAY_EVENT_TYPES),
  createdAt: isoDateTime,
  data: z.object({
    chargeId: reference,
    orderReference: reference,
    amountCents: cents,
    installments,
    currency: z.literal('BRL'),
  }),
});
export type GatewayWebhook = z.infer<typeof GatewayWebhookSchema>;

export const ERP_EVENT_TYPES = [
  'payment.recorded',
  'refund.recorded',
  'adjustment.recorded',
] as const;
export type ErpEventType = (typeof ERP_EVENT_TYPES)[number];

/** ERP → api: lançamento financeiro. */
export const ErpWebhookSchema = z.object({
  id: eventId,
  type: z.enum(ERP_EVENT_TYPES),
  orderReference: reference,
  amountCents: cents,
  recordedAt: isoDateTime,
});
export type ErpWebhook = z.infer<typeof ErpWebhookSchema>;

/**
 * Resposta dos webhooks. Evento novo: 202 com `duplicate: false`. Evento já recebido (mesmo id):
 * 200 com `duplicate: true`, sem efeito além de contar o reenvio.
 */
export const WebhookAckSchema = z.object({
  received: z.literal(true),
  duplicate: z.boolean(),
});
export type WebhookAck = z.infer<typeof WebhookAckSchema>;

/** Resposta do upload do extrato simulado. */
export const StatementAckSchema = z.object({ received: z.literal(true) });
export type StatementAck = z.infer<typeof StatementAckSchema>;

/** Job da dead letter queue: evento que esgotou as tentativas de aplicação. */
export const DeadLetterJobSchema = z.object({
  jobId: z.string(),
  eventId: z.string(),
  orderExternalId: z.string(),
  retryCount: z.number().int(),
  createdOn: isoDateTime,
  error: z.string().nullable(),
});
export type DeadLetterJob = z.infer<typeof DeadLetterJobSchema>;

export const DeadLetterPageSchema = z.object({
  data: z.array(DeadLetterJobSchema),
  limit: z.number().int(),
});
export type DeadLetterPage = z.infer<typeof DeadLetterPageSchema>;
