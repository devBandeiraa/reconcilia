import { CASE_TYPES, type GabaritoEntry } from '@reconcilia/shared';

const LABEL_WIDTH = Math.max(...CASE_TYPES.map((type) => type.length));

function describe(entry: GabaritoEntry): string {
  switch (entry.caseType) {
    case 'PAYMENT_WITHOUT_ORDER':
      return entry.orderExternalId;
    case 'DUPLICATE_WEBHOOK':
      return `${entry.orderExternalId} ×${entry.copies}`;
    case 'AMOUNT_MISMATCH':
      return `${entry.orderExternalId} (pedido ${entry.orderCents}, ERP ${entry.erpCents})`;
    case 'CAPTURE_ON_CANCELED_ORDER':
      return `${entry.orderExternalId} (capturado ${entry.capturedCents})`;
  }
}

/** Gabarito em texto: quais pedidos devem virar qual caso na conciliação. */
export function formatGabarito(seed: number, orders: number, gabarito: GabaritoEntry[]): string {
  const lines = [`GABARITO · seed ${seed} · ${orders} pedidos`];
  for (const type of CASE_TYPES) {
    const entries = gabarito.filter((entry) => entry.caseType === type);
    const label = `${type.padEnd(LABEL_WIDTH)} (${entries.length})`;
    lines.push(entries.length ? `${label}: ${entries.map(describe).join(', ')}` : label);
  }
  lines.push(`${'sem falha'.padEnd(LABEL_WIDTH)} (${orders - gabarito.length})`);
  return lines.join('\n');
}
