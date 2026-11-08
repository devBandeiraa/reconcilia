/** Fila dos webhooks do gateway a aplicar. Policy `exclusive`: um job vivo por eventId. */
export const PAYMENT_EVENTS_QUEUE = 'payment-events';

/** Dead letter queue: eventos que esgotaram as tentativas. Consultada em GET /admin/dlq. */
export const PAYMENT_EVENTS_DLQ = 'payment-events-dlq';

export interface PaymentEventJob {
  paymentEventId: string;
  eventId: string;
  orderExternalId: string;
}

/** Conciliação agendada. Policy `singleton`: no máximo uma rodada ativa por vez. */
export const RECONCILIATION_QUEUE = 'reconciliation';

/** Investigações do agente. Sem retry: falha vira status FAILED com o motivo. */
export const INVESTIGATIONS_QUEUE = 'investigations';

export interface InvestigationJob {
  investigationId: string;
}
