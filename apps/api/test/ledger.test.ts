import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { type LedgerBalance, LedgerBalanceSchema } from '@reconcilia/shared';
import { buildMessages, generateScenario, PATHS } from '@reconcilia/simulator';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { LedgerService, LedgerUnbalancedError } from '../src/ledger/ledger.service.js';
import { PaymentEventProcessor } from '../src/payments/payment-event.processor.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { clearQueues, createTestApp, signedPost, waitFor } from './support/test-app.js';
import { createTestPrisma, TEST_DATABASE_URL, truncateAll } from './support/test-db.js';

const prisma = createTestPrisma();
let app: INestApplication;
let server: Server;
let ledger: LedgerService;

beforeAll(async () => {
  app = await createTestApp();
  server = app.getHttpServer() as Server;
  ledger = app.get(LedgerService);
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await truncateAll(prisma);
  await clearQueues(app);
});

const counts = async () => ({
  transactions: await prisma.ledgerTransaction.count(),
  entries: await prisma.ledgerEntry.count(),
});

async function balance(): Promise<LedgerBalance> {
  return LedgerBalanceSchema.parse((await request(server).get('/ledger/balance').expect(200)).body);
}

const accountBalance = (b: LedgerBalance, account: string) =>
  b.accounts.find((a) => a.account === account)?.balanceCents;

/** Espera o worker aplicar todos os eventos do gateway gravados até agora. */
const queueDrained = () =>
  waitFor(
    () => prisma.paymentEvent.count({ where: { processedAt: null } }),
    (pending) => pending === 0,
  );

describe('LedgerService.post', () => {
  it.each([
    [
      'débitos ≠ créditos',
      [
        { account: 'GATEWAY_RECEIVABLE', direction: 'DEBIT', amountCents: 1000 },
        { account: 'ORDER_REVENUE', direction: 'CREDIT', amountCents: 999 },
      ],
    ],
    [
      'só um lançamento',
      [{ account: 'GATEWAY_RECEIVABLE', direction: 'DEBIT', amountCents: 1000 }],
    ],
    [
      'valor zero',
      [
        { account: 'GATEWAY_RECEIVABLE', direction: 'DEBIT', amountCents: 0 },
        { account: 'ORDER_REVENUE', direction: 'CREDIT', amountCents: 0 },
      ],
    ],
  ] as const)('transação desbalanceada (%s) lança erro e não grava nada', async (_, lines) => {
    await expect(
      app.get(PrismaService).$transaction((tx) => ledger.post(tx, 'tx:invalida', lines, 'teste')),
    ).rejects.toBeInstanceOf(LedgerUnbalancedError);
    expect(await counts()).toEqual({ transactions: 0, entries: 0 });
  });

  it('postar o mesmo transactionId de novo não duplica lançamentos', async () => {
    const lines = [
      { account: 'GATEWAY_RECEIVABLE', direction: 'DEBIT', amountCents: 5000 },
      { account: 'ORDER_REVENUE', direction: 'CREDIT', amountCents: 5000 },
    ] as const;
    const post = () =>
      app.get(PrismaService).$transaction((tx) => ledger.post(tx, 'tx:unica', lines, 'teste'));

    expect(await post()).toBe('posted');
    expect(await post()).toBe('already-posted');
    expect(await counts()).toEqual({ transactions: 1, entries: 2 });
  });
});

describe('garantias do ledger no banco (por fora do serviço)', () => {
  async function withClient<T>(run: (client: pg.Client) => Promise<T>): Promise<T> {
    const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await client.connect();
    try {
      return await run(client);
    } finally {
      await client.end();
    }
  }

  // Valores fixos dos próprios testes: interpolar aqui não abre injeção.
  const insertTransaction = (client: pg.Client, id: string, debit: number, credit: number) =>
    client.query(
      `INSERT INTO ledger_transactions (transaction_id, description) VALUES ('${id}', 'sql puro');
       INSERT INTO ledger_entries (id, transaction_id, account, direction, amount_cents) VALUES
         (gen_random_uuid(), '${id}', 'GATEWAY_RECEIVABLE', 'DEBIT', ${debit}),
         (gen_random_uuid(), '${id}', 'ORDER_REVENUE', 'CREDIT', ${credit});`,
    );

  it('um INSERT desbalanceado em SQL puro falha no COMMIT e não deixa nada', async () => {
    await withClient(async (client) => {
      await client.query('BEGIN');
      await insertTransaction(client, 'sql:desbalanceada', 1000, 999);
      await expect(client.query('COMMIT')).rejects.toThrow(/desbalanceada/);
    });
    expect(await counts()).toEqual({ transactions: 0, entries: 0 });
  });

  it('o ledger é append-only: UPDATE e DELETE são recusados', async () => {
    await withClient(async (client) => {
      await insertTransaction(client, 'sql:balanceada', 700, 700);
      await expect(client.query('UPDATE ledger_entries SET amount_cents = 1')).rejects.toThrow(
        /append-only/,
      );
      await expect(client.query('DELETE FROM ledger_entries')).rejects.toThrow(/append-only/);
      await expect(client.query('DELETE FROM ledger_transactions')).rejects.toThrow(/append-only/);
    });
    expect(await counts()).toEqual({ transactions: 1, entries: 2 });
  });
});

describe('ledger integrado ao worker', () => {
  const planned = generateScenario(
    { orders: 1, lost: 0, duplicate: 0, mismatch: 0, canceled: 0 },
    21,
  ).orders[0]!;
  const messages = buildMessages(planned, new Date('2026-01-03T09:00:00.000Z'));

  async function captureOnce(): Promise<void> {
    await signedPost(server, PATHS.store, messages.store).expect(202);
    await signedPost(server, PATHS.gateway, messages.captured).expect(202);
    await queueDrained();
  }

  it('captura: débito GATEWAY_RECEIVABLE / crédito ORDER_REVENUE, total 0', async () => {
    await captureOnce();

    const b = await balance();
    expect(b.totalCents).toBe(0);
    expect(accountBalance(b, 'GATEWAY_RECEIVABLE')).toBe(planned.totalCents);
    expect(accountBalance(b, 'ORDER_REVENUE')).toBe(-planned.totalCents);
    expect(b).toMatchObject({ transactions: 1, entries: 2 });
    expect(await prisma.ledgerTransaction.findFirstOrThrow()).toMatchObject({
      id: `capture:${messages.captured.id}`,
    });
  });

  it('reprocessar o mesmo evento não duplica lançamentos', async () => {
    await captureOnce();
    const event = await prisma.paymentEvent.findUniqueOrThrow({
      where: { eventId: messages.captured.id },
    });

    // Simula um reprocessamento: o evento volta a "não aplicado" e é aplicado de novo.
    await prisma.paymentEvent.update({ where: { id: event.id }, data: { processedAt: null } });
    expect(await app.get(PaymentEventProcessor).apply(event.id)).toBe('applied');

    expect(await counts()).toEqual({ transactions: 1, entries: 2 });
    expect((await balance()).totalCents).toBe(0);
  });

  it('estorno: débito REFUNDS / crédito GATEWAY_RECEIVABLE, total 0', async () => {
    await captureOnce();
    const refund = {
      ...messages.captured,
      id: `evt_${planned.externalId}_refunded`,
      type: 'charge.refunded' as const,
    };
    await signedPost(server, PATHS.gateway, refund).expect(202);
    await queueDrained();

    const b = await balance();
    expect(b.totalCents).toBe(0);
    expect(accountBalance(b, 'REFUNDS')).toBe(planned.totalCents);
    expect(accountBalance(b, 'GATEWAY_RECEIVABLE')).toBe(0);
    expect(b).toMatchObject({ transactions: 2, entries: 4 });
  });

  it('depois do simulador completo, o total é 0 e o a receber bate com as capturas', async () => {
    const res = await request(server).post('/simulate').send({ orders: 30, seed: 8 }).expect(200);
    const lost = new Set(
      (res.body as { gabarito: { caseType: string; orderExternalId: string }[] }).gabarito
        .filter((g) => g.caseType === 'PAYMENT_WITHOUT_ORDER')
        .map((g) => g.orderExternalId),
    );
    await queueDrained();

    const captured = generateScenario({ orders: 30 }, 8)
      .orders.filter((o) => !lost.has(o.externalId))
      .reduce((sum, o) => sum + o.totalCents, 0);

    const b = await balance();
    expect(b.totalCents).toBe(0);
    expect(accountBalance(b, 'GATEWAY_RECEIVABLE')).toBe(captured);
    expect(accountBalance(b, 'ORDER_REVENUE')).toBe(-captured);
    expect(b.transactions).toBe(30 - lost.size);
  });
});
