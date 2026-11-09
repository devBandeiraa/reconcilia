import {
  type DeliveryTotals,
  ErpWebhookSchema,
  GatewayStatementUploadSchema,
  GatewayWebhookSchema,
  StoreWebhookSchema,
} from '@reconcilia/shared';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  deliverScenario,
  formatGabarito,
  generateScenario,
  PATHS,
  type Scenario,
  sign,
  type Transport,
} from '../src/lib/index.js';

interface Call {
  path: string;
  body: unknown;
}

describe('deliverScenario', () => {
  const calls: Call[] = [];
  const transport: Transport = {
    post: (path, body) => {
      calls.push({ path, body });
      return Promise.resolve();
    },
  };
  let scenario: Scenario;
  let totals: DeliveryTotals;

  beforeAll(async () => {
    scenario = generateScenario({ orders: 60 }, 9);
    totals = await deliverScenario(scenario, transport, {
      startAt: new Date('2026-01-01T00:00:00.000Z'),
    });
  });

  const gatewayCalls = () =>
    calls.filter((c) => c.path === PATHS.gateway).map((c) => GatewayWebhookSchema.parse(c.body));

  it('todo payload enviado segue o contrato de packages/shared', () => {
    for (const call of calls) {
      if (call.path === PATHS.store) StoreWebhookSchema.parse(call.body);
      else if (call.path === PATHS.gateway) GatewayWebhookSchema.parse(call.body);
      else if (call.path === PATHS.erp) ErpWebhookSchema.parse(call.body);
      else GatewayStatementUploadSchema.parse(call.body);
    }
  });

  it('envia o captured tantas vezes quanto o plano manda (0 para lost, 2 a 5 para duplicate)', () => {
    for (const order of scenario.orders) {
      const captured = gatewayCalls().filter(
        (e) => e.type === 'charge.captured' && e.data.orderReference === order.externalId,
      );
      expect(captured).toHaveLength(order.captureCopies);
      expect(new Set(captured.map((e) => e.id)).size).toBeLessThanOrEqual(1);
    }
  });

  it('o extrato do gateway tem uma linha por pedido, inclusive os de webhook perdido', () => {
    const entries = calls
      .filter((c) => c.path === PATHS.statement)
      .flatMap((c) => GatewayStatementUploadSchema.parse(c.body).entries);
    expect(entries.map((e) => e.orderReference)).toEqual(scenario.orders.map((o) => o.externalId));
  });

  it('o ERP registra o valor planejado (com juros nos pedidos com mismatch)', () => {
    const erp = calls
      .filter((c) => c.path === PATHS.erp)
      .map((c) => ErpWebhookSchema.parse(c.body));
    for (const order of scenario.orders) {
      expect(erp.find((e) => e.orderReference === order.externalId)?.amountCents).toBe(
        order.erpCents,
      );
    }
  });

  it('nos pedidos cancelados, o order.canceled vem logo depois do order.created e antes do gateway', () => {
    const canceled = scenario.orders.filter((o) => o.failure === 'canceled');
    expect(canceled.length).toBeGreaterThan(0);
    for (const order of canceled) {
      const mine = calls.filter(
        (c) =>
          c.path !== PATHS.statement && JSON.stringify(c.body).includes(`"${order.externalId}"`),
      );
      expect(mine.slice(0, 3).map((c) => (c.body as { type: string }).type)).toEqual([
        'order.created',
        'order.canceled',
        'charge.authorized',
      ]);
    }
    const notCanceled = scenario.orders
      .filter((o) => o.failure !== 'canceled')
      .map((o) => o.externalId);
    const cancellations = calls
      .filter((c) => c.path === PATHS.store)
      .map((c) => StoreWebhookSchema.parse(c.body))
      .filter((e) => e.type === 'order.canceled');
    expect(cancellations.some((e) => notCanceled.includes(e.order.externalId))).toBe(false);
  });

  it('para cada pedido, a loja vem antes do gateway, que vem antes do ERP', () => {
    for (const order of scenario.orders) {
      const ref = order.externalId;
      const positions = calls
        .map((c, i) => ({ c, i }))
        .filter(
          ({ c }) => JSON.stringify(c.body).includes(`"${ref}"`) && c.path !== PATHS.statement,
        )
        .map(({ c }) => c.path);
      expect(positions[0]).toBe(PATHS.store);
      expect(positions.at(-1)).toBe(PATHS.erp);
    }
  });

  it('os totais batem com o plano', () => {
    const copies = scenario.orders.reduce((sum, o) => sum + o.captureCopies, 0);
    const captured = scenario.orders.filter((o) => o.captureCopies > 0).length;
    expect(totals).toEqual({
      orders: 60,
      cancellations: scenario.orders.filter((o) => o.failure === 'canceled').length,
      authorizations: 60,
      captures: captured,
      duplicateCopies: copies - captured,
      erpEvents: 60,
      statementEntries: 60,
    });
  });
});

describe('sign', () => {
  it('gera o HMAC-SHA256 no formato sha256=<hex>', () => {
    // Vetor conhecido do HMAC-SHA256.
    expect(sign('key', 'The quick brown fox jumps over the lazy dog')).toBe(
      'sha256=f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8',
    );
  });
});

describe('formatGabarito', () => {
  it('lista cada tipo de caso com os pedidos e a contagem dos sem falha', () => {
    const text = formatGabarito(1, 4, [
      { caseType: 'PAYMENT_WITHOUT_ORDER', orderExternalId: 'S1-0001' },
      { caseType: 'DUPLICATE_WEBHOOK', orderExternalId: 'S1-0002', copies: 3 },
    ]);
    expect(text.split('\n')).toEqual([
      'GABARITO · seed 1 · 4 pedidos',
      'PAYMENT_WITHOUT_ORDER     (1): S1-0001',
      'DUPLICATE_WEBHOOK         (1): S1-0002 ×3',
      'AMOUNT_MISMATCH           (0)',
      'CAPTURE_ON_CANCELED_ORDER (0)',
      'sem falha                 (2)',
    ]);
  });
});
