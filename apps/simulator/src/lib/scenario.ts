import {
  type GabaritoEntry,
  type SimulationOptionsInput,
  SimulationOptionsSchema,
} from '@reconcilia/shared';
import { createRandom } from './random.js';

export type Failure = 'lost' | 'duplicate' | 'mismatch' | 'canceled';

export interface PlannedOrder {
  externalId: string;
  totalCents: number;
  installments: number;
  /** canceled: a loja cancela o pedido antes da captura, mas o gateway captura assim mesmo. */
  failure: Failure | null;
  /** Quantas vezes o webhook charge.captured é enviado. 0 = perdido. */
  captureCopies: number;
  /** Valor que o ERP registra. Difere do total só nos pedidos com mismatch. */
  erpCents: number;
}

export interface Scenario {
  seed: number;
  orders: PlannedOrder[];
  gabarito: GabaritoEntry[];
}

/** Juros de parcelamento usados na falha de mismatch: 2,99% por parcela, mínimo de 2 parcelas. */
export const INTEREST_PER_INSTALLMENT = 0.0299;
const INSTALLMENT_CHOICES = [1, 1, 1, 1, 2, 3, 6, 10, 12] as const;

export function orderExternalId(seed: number, index: number): string {
  return `S${seed}-${String(index).padStart(4, '0')}`;
}

/**
 * Gera o cenário de forma determinística. Cada pedido consome sempre 4 sorteios, então
 * `--orders 20` é exatamente o começo de `--orders 50` com a mesma seed.
 */
export function generateScenario(input: SimulationOptionsInput, seed: number): Scenario {
  const options = SimulationOptionsSchema.parse(input);
  const random = createRandom(seed);
  const orders: PlannedOrder[] = [];

  for (let index = 1; index <= options.orders; index++) {
    const totalCents = (199 + Math.floor(random() * 9800)) * 10; // R$ 19,90 a R$ 999,80
    const installments = INSTALLMENT_CHOICES[Math.floor(random() * INSTALLMENT_CHOICES.length)]!;
    const roll = random();
    const copies = 2 + Math.floor(random() * 4); // 2 a 5, sorteado sempre para manter a sequência

    let failure: Failure | null = null;
    if (roll < options.lost) failure = 'lost';
    else if (roll < options.lost + options.duplicate) failure = 'duplicate';
    else if (roll < options.lost + options.duplicate + options.mismatch) failure = 'mismatch';
    else if (roll < options.lost + options.duplicate + options.mismatch + options.canceled) {
      failure = 'canceled';
    }

    orders.push({
      externalId: orderExternalId(seed, index),
      totalCents,
      installments,
      failure,
      captureCopies: failure === 'lost' ? 0 : failure === 'duplicate' ? copies : 1,
      erpCents:
        failure === 'mismatch'
          ? Math.round(totalCents * (1 + INTEREST_PER_INSTALLMENT * Math.max(installments, 2)))
          : totalCents,
    });
  }

  return { seed, orders, gabarito: orders.flatMap(toGabaritoEntry) };
}

function toGabaritoEntry(order: PlannedOrder): GabaritoEntry[] {
  switch (order.failure) {
    case 'lost':
      return [{ caseType: 'PAYMENT_WITHOUT_ORDER', orderExternalId: order.externalId }];
    case 'duplicate':
      return [
        {
          caseType: 'DUPLICATE_WEBHOOK',
          orderExternalId: order.externalId,
          copies: order.captureCopies,
        },
      ];
    case 'mismatch':
      return [
        {
          caseType: 'AMOUNT_MISMATCH',
          orderExternalId: order.externalId,
          orderCents: order.totalCents,
          erpCents: order.erpCents,
        },
      ];
    case 'canceled':
      return [
        {
          caseType: 'CAPTURE_ON_CANCELED_ORDER',
          orderExternalId: order.externalId,
          capturedCents: order.totalCents,
        },
      ];
    case null:
      return [];
  }
}
