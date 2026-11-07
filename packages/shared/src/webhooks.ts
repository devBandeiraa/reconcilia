import { z } from 'zod';

/**
 * Contratos dos sistemas externos (loja, gateway e ERP). Cada um fala no formato dele; a api
 * traduz para o modelo interno. Todos chegam assinados: `X-Signature: sha256=<hex>`, HMAC-SHA256
 * do corpo bruto com o WEBHOOK_SECRET.
 */
export const SIGNATURE_HEADER = 'x-signature';

const isoDateTime = z.iso.datetime();
const cents = z.number().int().nonnegative();
const reference = z.string().min(1).max(64);
const eventId = z.string().min(1).max(128);
const installments = z.number().int().min(1).max(24);

/** Loja → api: pedido criado. */
export const StoreWebhookSchema = z.object({
  id: eventId,
  type: z.literal('order.created'),
  occurredAt: isoDateTime,
  order: z.object({
    externalId: reference,
    totalCents: cents,
    installments,
  }),
});
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

/** Resposta dos webhooks. */
export const WebhookAckSchema = z.object({ received: z.literal(true) });
export type WebhookAck = z.infer<typeof WebhookAckSchema>;
