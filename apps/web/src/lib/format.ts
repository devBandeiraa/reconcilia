import type { ActionKind, CaseStatus, CaseType } from '@reconcilia/shared';

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** Centavos inteiros → "R$ 1.234,56". */
export function brl(cents: number): string {
  return currency.format(cents / 100);
}

const relative = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
  ['second', 1],
];

/** "há 3 minutos". */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const seconds = (new Date(iso).getTime() - now) / 1000;
  const [unit, size] = UNITS.find(([, s]) => Math.abs(seconds) >= s) ?? ['second', 1];
  return relative.format(Math.round(seconds / size), unit);
}

/** Data e hora no fuso pedido. O dado é sempre UTC; o fuso é só para exibir. */
export function dateTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(iso));
}

export const CASE_TYPE_LABEL: Record<CaseType, string> = {
  PAYMENT_WITHOUT_ORDER: 'Pagamento sem pedido',
  DUPLICATE_WEBHOOK: 'Webhook duplicado',
  AMOUNT_MISMATCH: 'Valor divergente',
  CAPTURE_ON_CANCELED_ORDER: 'Captura em pedido cancelado',
};

export const CASE_STATUS_LABEL: Record<CaseStatus, string> = {
  OPEN: 'Aberto',
  RESOLVED: 'Resolvido',
  DISMISSED: 'Descartado',
};

export const ACTION_LABEL: Record<ActionKind, string> = {
  MARK_ORDER_PAID: 'Marcar o pedido como pago',
  REPROCESS_WEBHOOK: 'Reprocessar o webhook',
  FLAG_ERP_DIVERGENCE: 'Pedir ajuste ao ERP',
  IGNORE_DUPLICATE: 'Ignorar o duplicado',
  REFUND_CAPTURE: 'Estornar a captura',
};

/** Nome legível de cada evento da linha do tempo. */
export const EVENT_LABEL: Record<string, string> = {
  ORDER_CREATED: 'Pedido criado',
  ORDER_CANCELED: 'Pedido cancelado',
  AUTHORIZED: 'charge.authorized',
  CAPTURED: 'charge.captured',
  REFUNDED: 'charge.refunded',
  CAPTURE: 'Captura no extrato',
  PAYMENT_RECORDED: 'Pagamento registrado',
  REFUND_RECORDED: 'Estorno registrado',
  ADJUSTMENT: 'Ajuste registrado',
};

export const SOURCE_LABEL: Record<string, string> = {
  STORE: 'Loja',
  GATEWAY: 'Gateway',
  GATEWAY_STATEMENT: 'Extrato',
  ERP: 'ERP',
};
