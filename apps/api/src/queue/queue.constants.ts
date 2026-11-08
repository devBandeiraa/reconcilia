/** Fila dos webhooks do gateway a aplicar. Policy `exclusive`: um job vivo por eventId. */
export const PAYMENT_EVENTS_QUEUE = 'payment-events';

/** Dead letter queue: eventos que esgotaram as tentativas. Consultada em GET /admin/dlq. */
export const PAYMENT_EVENTS_DLQ = 'payment-events-dlq';

export interface PaymentEventJob {
  paymentEventId: string;
  eventId: string;
  orderExternalId: string;
}
