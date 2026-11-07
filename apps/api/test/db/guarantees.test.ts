import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestPrisma, truncateAll } from '../support/test-db.js';

// Garantias que o BANCO impõe, independentemente do código da aplicação (ADR 0002).
const prisma = createTestPrisma();

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await truncateAll(prisma);
});

function paymentEvent(eventId: string) {
  return {
    provider: 'simulador',
    eventId,
    orderExternalId: 'LOJA-1001',
    type: 'CAPTURED' as const,
    amountCents: 15990,
    payload: { eventId },
  };
}

describe('garantias do banco', () => {
  it('recusa eventId duplicado em payment_events', async () => {
    await prisma.paymentEvent.create({ data: paymentEvent('evt_1') });

    await expect(prisma.paymentEvent.create({ data: paymentEvent('evt_1') })).rejects.toMatchObject(
      { code: 'P2002' },
    );
    expect(await prisma.paymentEvent.count()).toBe(1);
  });

  it('recusa dois cases OPEN para o mesmo (pedido, tipo)', async () => {
    const order = await prisma.order.create({ data: { externalId: 'LOJA-1', totalCents: 1000 } });
    const openCase = { orderId: order.id, type: 'AMOUNT_MISMATCH' as const };
    await prisma.case.create({ data: openCase });

    await expect(prisma.case.create({ data: openCase })).rejects.toMatchObject({ code: 'P2002' });
    expect(await prisma.case.count()).toBe(1);
  });

  it('aceita um case OPEN quando o anterior do mesmo tipo já foi resolvido (índice parcial)', async () => {
    const order = await prisma.order.create({ data: { externalId: 'LOJA-2', totalCents: 1000 } });
    await prisma.case.create({
      data: { orderId: order.id, type: 'AMOUNT_MISMATCH', status: 'RESOLVED' },
    });

    await prisma.case.create({ data: { orderId: order.id, type: 'AMOUNT_MISMATCH' } });
    expect(await prisma.case.count({ where: { orderId: order.id } })).toBe(2);
  });

  it('recusa lançamento de ledger com valor 0', async () => {
    await expect(
      prisma.ledgerEntry.create({
        data: {
          transactionId: 'tx_1',
          account: 'ORDER_REVENUE',
          direction: 'CREDIT',
          amountCents: 0,
        },
      }),
    ).rejects.toThrow(/ledger_entries_amount_cents_check/);
    expect(await prisma.ledgerEntry.count()).toBe(0);
  });
});
