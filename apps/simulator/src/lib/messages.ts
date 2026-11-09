import type {
  ErpWebhook,
  GatewayStatementEntry,
  GatewayWebhook,
  StoreWebhook,
} from '@reconcilia/shared';
import type { PlannedOrder } from './scenario.js';

export const GATEWAY_PROVIDER = 'simpay';

export interface OrderMessages {
  store: StoreWebhook;
  /** order.canceled, enviado só nos pedidos com a falha canceled. */
  canceled: StoreWebhook;
  authorized: GatewayWebhook;
  captured: GatewayWebhook;
  statement: GatewayStatementEntry;
  erp: ErpWebhook;
}

const at = (base: Date, seconds: number): string =>
  new Date(base.getTime() + seconds * 1000).toISOString();

/** Monta as mensagens dos três sistemas para um pedido, com horários a partir de `base` (UTC). */
export function buildMessages(order: PlannedOrder, base: Date): OrderMessages {
  const ref = order.externalId;
  const chargeId = `ch_${ref}`;
  const charge = (type: GatewayWebhook['type'], seconds: number): GatewayWebhook => ({
    id: `evt_${ref}_${type.split('.')[1]}`,
    provider: GATEWAY_PROVIDER,
    type,
    createdAt: at(base, seconds),
    data: {
      chargeId,
      orderReference: ref,
      amountCents: order.totalCents,
      installments: order.installments,
      currency: 'BRL',
    },
  });

  const captured = charge('charge.captured', 2);
  return {
    store: {
      id: `${ref}:order.created`,
      type: 'order.created',
      occurredAt: at(base, 0),
      order: {
        externalId: ref,
        totalCents: order.totalCents,
        installments: order.installments,
      },
    },
    canceled: {
      id: `${ref}:order.canceled`,
      type: 'order.canceled',
      occurredAt: at(base, 0.5),
      order: { externalId: ref },
    },
    authorized: charge('charge.authorized', 1),
    captured,
    statement: {
      chargeId,
      eventId: captured.id,
      orderReference: ref,
      amountCents: order.totalCents,
      capturedAt: captured.createdAt,
    },
    erp: {
      id: `erp_${ref}_payment`,
      type: 'payment.recorded',
      orderReference: ref,
      amountCents: order.erpCents,
      recordedAt: at(base, 5),
    },
  };
}
