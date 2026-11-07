import type { CaseType, GabaritoEntry } from '@reconcilia/shared';

const LABEL_WIDTH = 'PAYMENT_WITHOUT_ORDER'.length;

function describe(entry: GabaritoEntry): string {
  switch (entry.caseType) {
    case 'PAYMENT_WITHOUT_ORDER':
      return entry.orderExternalId;
    case 'DUPLICATE_WEBHOOK':
      return `${entry.orderExternalId} ×${entry.copies}`;
    case 'AMOUNT_MISMATCH':
      return `${entry.orderExternalId} (pedido ${entry.orderCents}, ERP ${entry.erpCents})`;
  }
}

/** Gabarito em texto: quais pedidos devem virar qual caso na conciliação. */
export function formatGabarito(seed: number, orders: number, gabarito: GabaritoEntry[]): string {
  const types: CaseType[] = ['PAYMENT_WITHOUT_ORDER', 'DUPLICATE_WEBHOOK', 'AMOUNT_MISMATCH'];
  const lines = [`GABARITO · seed ${seed} · ${orders} pedidos`];
  for (const type of types) {
    const entries = gabarito.filter((entry) => entry.caseType === type);
    const label = `${type.padEnd(LABEL_WIDTH)} (${entries.length})`;
    lines.push(entries.length ? `${label}: ${entries.map(describe).join(', ')}` : label);
  }
  lines.push(`${'sem falha'.padEnd(LABEL_WIDTH)} (${orders - gabarito.length})`);
  return lines.join('\n');
}
