import { describe, expect, it } from 'vitest';
import { generateScenario, INTEREST_PER_INSTALLMENT } from '../src/lib/index.js';

describe('generateScenario', () => {
  it('a mesma seed gera exatamente o mesmo cenário', () => {
    expect(generateScenario({ orders: 50 }, 42)).toEqual(generateScenario({ orders: 50 }, 42));
  });

  it('seeds diferentes geram cenários diferentes', () => {
    const totals = (seed: number) =>
      generateScenario({ orders: 50 }, seed).orders.map((o) => o.totalCents);
    expect(totals(1)).not.toEqual(totals(2));
  });

  it('--orders 20 é exatamente o começo de --orders 50', () => {
    const small = generateScenario({ orders: 20 }, 7);
    const large = generateScenario({ orders: 50 }, 7);
    expect(large.orders.slice(0, 20)).toEqual(small.orders);
  });

  it('a frequência das falhas acompanha as taxas pedidas', () => {
    const { orders } = generateScenario(
      { orders: 200, lost: 0.1, duplicate: 0.2, mismatch: 0.1, canceled: 0.1 },
      3,
    );
    const count = (failure: string) => orders.filter((o) => o.failure === failure).length;
    expect(count('lost')).toBeGreaterThan(8);
    expect(count('lost')).toBeLessThan(35);
    expect(count('duplicate')).toBeGreaterThan(22);
    expect(count('duplicate')).toBeLessThan(60);
    expect(count('mismatch')).toBeGreaterThan(8);
    expect(count('mismatch')).toBeLessThan(35);
    expect(count('canceled')).toBeGreaterThan(8);
    expect(count('canceled')).toBeLessThan(35);
  });

  it('cada falha tem o efeito esperado no pedido', () => {
    const { orders } = generateScenario({ orders: 200 }, 11);
    for (const order of orders) {
      if (order.failure === 'lost') expect(order.captureCopies).toBe(0);
      else if (order.failure === 'duplicate') {
        expect(order.captureCopies).toBeGreaterThanOrEqual(2);
        expect(order.captureCopies).toBeLessThanOrEqual(5);
      } else expect(order.captureCopies).toBe(1);

      if (order.failure === 'mismatch') {
        const factor = 1 + INTEREST_PER_INSTALLMENT * Math.max(order.installments, 2);
        expect(order.erpCents).toBe(Math.round(order.totalCents * factor));
        expect(order.erpCents).toBeGreaterThan(order.totalCents);
      } else {
        expect(order.erpCents).toBe(order.totalCents);
      }
    }
  });

  it('o gabarito lista exatamente os pedidos com falha, com o tipo de caso certo', () => {
    const scenario = generateScenario({ orders: 100 }, 5);
    const withFailure = scenario.orders.filter((o) => o.failure !== null);
    expect(scenario.gabarito.map((g) => g.orderExternalId)).toEqual(
      withFailure.map((o) => o.externalId),
    );
    const expectedType = {
      lost: 'PAYMENT_WITHOUT_ORDER',
      duplicate: 'DUPLICATE_WEBHOOK',
      mismatch: 'AMOUNT_MISMATCH',
      canceled: 'CAPTURE_ON_CANCELED_ORDER',
    };
    scenario.gabarito.forEach((entry, i) => {
      expect(entry.caseType).toBe(expectedType[withFailure[i]!.failure!]);
    });
  });

  it('sem taxas, nenhum pedido tem falha', () => {
    const scenario = generateScenario(
      { orders: 30, lost: 0, duplicate: 0, mismatch: 0, canceled: 0 },
      1,
    );
    expect(scenario.gabarito).toEqual([]);
  });

  it('recusa taxas que somam mais de 1', () => {
    expect(() => generateScenario({ lost: 0.6, duplicate: 0.5 }, 1)).toThrow(/no máximo 1/);
  });
});
