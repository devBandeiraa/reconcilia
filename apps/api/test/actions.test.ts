import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import {
  type ActionDecision,
  ActionDecisionSchema,
  ActionViewSchema,
  CaseDetailSchema,
  DEV_SESSION_SECRET,
  LedgerBalanceSchema,
  ReconciliationResultSchema,
  SessionResponseSchema,
} from '@reconcilia/shared';
import { buildMessages, generateScenario, PATHS } from '@reconcilia/simulator';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ActionKind, Prisma } from '../src/generated/prisma/client.js';
import { issueOperatorToken } from '../src/session/operator-token.js';
import { type CaseUnderTest, caseOf } from './support/agent-fixtures.js';
import { clearQueues, createTestApp, signedPost, waitFor } from './support/test-app.js';
import { createTestPrisma, TEST_DATABASE_URL, truncateAll } from './support/test-db.js';

const prisma = createTestPrisma();
let app: INestApplication;
let server: Server;

// Casos escolhidos antes de qualquer mudança: cada teste usa o seu.
const cases: Record<string, CaseUnderTest> = {};
// Token de operador por nome, emitido pelo POST /session.
const tokens: Record<string, string> = {};

beforeAll(async () => {
  app = await createTestApp();
  server = app.getHttpServer() as Server;
  await truncateAll(prisma);
  await clearQueues(app);
  await request(server).post('/simulate').send({ orders: 50, seed: 42 }).expect(200);
  await queueDrained();
  await request(server).post('/reconcile').expect(200);

  for (let i = 0; i < 4; i++) cases[`pwo${i}`] = await caseOf(prisma, 'PAYMENT_WITHOUT_ORDER', i);
  cases.dup0 = await caseOf(prisma, 'DUPLICATE_WEBHOOK', 0);
  cases.mis0 = await caseOf(prisma, 'AMOUNT_MISMATCH', 0);
  cases.mis1 = await caseOf(prisma, 'AMOUNT_MISMATCH', 1);
  cases.can0 = await caseOf(prisma, 'CAPTURE_ON_CANCELED_ORDER', 0);
  cases.can1 = await caseOf(prisma, 'CAPTURE_ON_CANCELED_ORDER', 1);
  cases.dup1 = await caseOf(prisma, 'DUPLICATE_WEBHOOK', 1);

  for (const operator of ['ana@loja.com', 'bruno@loja.com']) {
    const res = await request(server).post('/session').send({ operator }).expect(200);
    tokens[operator] = SessionResponseSchema.parse(res.body).token;
  }
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

function queueDrained() {
  return waitFor(
    () => prisma.paymentEvent.count({ where: { processedAt: null } }),
    (pending) => pending === 0,
  );
}

/** Uma ação PENDING como se o agente tivesse sugerido (investigação DONE). */
async function pendingAction(caseId: string, kind: ActionKind, params: Prisma.InputJsonObject) {
  const investigation = await prisma.investigation.create({
    data: {
      caseId,
      status: 'DONE',
      diagnosis: 'Diagnóstico de teste com dados das ferramentas.',
      suggestedAction: { kind, params },
      confidence: 0.9,
    },
  });
  return prisma.action.create({ data: { investigationId: investigation.id, kind, params } });
}

const bearer = (operator: string) => `Bearer ${tokens[operator]}`;
const approve = (id: string, operator = 'ana@loja.com') =>
  request(server).post(`/actions/${id}/approve`).set('authorization', bearer(operator)).send({});
const reject = (id: string, operator = 'ana@loja.com', reason?: string) =>
  request(server)
    .post(`/actions/${id}/reject`)
    .set('authorization', bearer(operator))
    .send(reason ? { reason } : {});

const ledgerEntriesOf = (transactionId: string) =>
  prisma.ledgerEntry.count({ where: { transactionId } });
/** Saldo do GATEWAY_RECEIVABLE (débitos - créditos) só nas transações do pedido. */
async function receivableOf(orderExternalId: string, chargeId: string): Promise<number> {
  const entries = await prisma.ledgerEntry.findMany({
    where: {
      account: 'GATEWAY_RECEIVABLE',
      transactionId: {
        in: [`capture:evt_${orderExternalId}_captured`, `refund-capture:${chargeId}`],
      },
    },
  });
  return entries.reduce(
    (sum, e) => sum + (e.direction === 'DEBIT' ? e.amountCents : -e.amountCents),
    0,
  );
}
const auditEvents = async (actionId: string) =>
  (await prisma.auditEntry.findMany({ where: { actionId }, orderBy: { at: 'asc' } })).map(
    (a) => a.event,
  );

describe('aprovar: o backend executa', () => {
  it('MARK_ORDER_PAID: pedido PAID, captura no ledger, caso RESOLVED e auditoria', async () => {
    const c = cases.pwo0!;
    const action = await pendingAction(c.caseId, 'MARK_ORDER_PAID', { chargeId: c.chargeId });

    const res = ActionDecisionSchema.parse((await approve(action.id).expect(200)).body);

    expect(res.case.status).toBe('RESOLVED');
    expect(res.action).toMatchObject({ status: 'EXECUTED', decidedBy: 'ana@loja.com' });
    expect(res.action.executionResult).toMatchObject({ orderStatus: 'PAID', ledger: 'posted' });
    expect(
      await prisma.order.findUniqueOrThrow({ where: { externalId: c.orderExternalId } }),
    ).toMatchObject({
      status: 'PAID',
    });
    expect(await ledgerEntriesOf(`capture:evt_${c.orderExternalId}_captured`)).toBe(2);
    expect(await auditEvents(action.id)).toEqual(['APPROVED', 'EXECUTED']);
  });

  it('o webhook perdido que chega depois não lança em dobro no ledger', async () => {
    const c = cases.pwo0!;
    const planned = generateScenario({ orders: 50 }, 42).orders.find(
      (o) => o.externalId === c.orderExternalId,
    )!;
    const late = buildMessages(planned, new Date('2026-01-05T10:00:00.000Z')).captured;

    await signedPost(server, PATHS.gateway, late).expect(202);
    await queueDrained();

    expect(await ledgerEntriesOf(`capture:${late.id}`)).toBe(2);
    expect(
      LedgerBalanceSchema.parse((await request(server).get('/ledger/balance').expect(200)).body)
        .totalCents,
    ).toBe(0);
  });

  it('aprovar duas vezes em paralelo executa uma única vez', async () => {
    const c = cases.pwo1!;
    const action = await pendingAction(c.caseId, 'MARK_ORDER_PAID', { chargeId: c.chargeId });

    const responses = await Promise.all([approve(action.id), approve(action.id, 'bruno@loja.com')]);

    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    const states = responses.map((r) => (r.body as ActionDecision).action.status);
    expect(states).toEqual(['EXECUTED', 'EXECUTED']);
    expect(await auditEvents(action.id)).toEqual(['APPROVED', 'EXECUTED']);
    expect(await ledgerEntriesOf(`capture:evt_${c.orderExternalId}_captured`)).toBe(2);
  });

  it('REPROCESS_WEBHOOK: reenfileira o evento não aplicado e o worker aplica uma vez', async () => {
    const c = cases.mis1!;
    const eventId = `evt_${c.orderExternalId}_captured`;
    // O evento "ficou na DLQ": volta a não aplicado.
    await prisma.paymentEvent.update({ where: { eventId }, data: { processedAt: null } });
    const action = await pendingAction(c.caseId, 'REPROCESS_WEBHOOK', { eventId });

    const res = ActionDecisionSchema.parse((await approve(action.id).expect(200)).body);

    expect(res.action.executionResult).toMatchObject({ enqueued: true });
    const applied = await waitFor(
      () => prisma.paymentEvent.findUniqueOrThrow({ where: { eventId } }),
      (e) => e.processedAt !== null,
    );
    expect(applied.processedAt).not.toBeNull();
    expect(await ledgerEntriesOf(`capture:${eventId}`)).toBe(2);
    expect(res.case.status).toBe('RESOLVED');
  });

  it('FLAG_ERP_DIVERGENCE: pede o ajuste ao ERP uma vez só, sem mexer no ledger', async () => {
    const c = cases.mis0!;
    const action = await pendingAction(c.caseId, 'FLAG_ERP_DIVERGENCE', {
      expectedCents: c.capturedCents,
      erpCents: c.erpCents,
    });
    const ledgerBefore = await prisma.ledgerEntry.count();

    const res = ActionDecisionSchema.parse((await approve(action.id).expect(200)).body);
    await approve(action.id).expect(200);

    expect(res.case.status).toBe('RESOLVED');
    expect(await prisma.simErpAdjustment.findMany({ where: { actionId: action.id } })).toEqual([
      expect.objectContaining({
        orderExternalId: c.orderExternalId,
        differenceCents: c.erpCents - c.capturedCents,
      }),
    ]);
    expect(await prisma.ledgerEntry.count()).toBe(ledgerBefore);
  });

  it('IGNORE_DUPLICATE: só encerra o caso', async () => {
    const c = cases.dup0!;
    const action = await pendingAction(c.caseId, 'IGNORE_DUPLICATE', {
      eventId: c.duplicateEventId,
    });

    const res = ActionDecisionSchema.parse((await approve(action.id).expect(200)).body);

    expect(res.case.status).toBe('RESOLVED');
    expect(res.action.executionResult).toMatchObject({ ignored: true });
  });

  it('REFUND_CAPTURE: estorna a captura do pedido cancelado e zera o recebível dele', async () => {
    const c = cases.can0!;
    expect(await receivableOf(c.orderExternalId, c.chargeId)).toBe(c.capturedCents);
    const action = await pendingAction(c.caseId, 'REFUND_CAPTURE', { chargeId: c.chargeId });

    const res = ActionDecisionSchema.parse((await approve(action.id).expect(200)).body);

    expect(res.case.status).toBe('RESOLVED');
    expect(res.action.executionResult).toMatchObject({
      ledger: 'posted',
      ledgerTransactionId: `refund-capture:${c.chargeId}`,
      amountCents: c.capturedCents,
    });
    expect(await receivableOf(c.orderExternalId, c.chargeId)).toBe(0);
    const refund = await prisma.ledgerEntry.findMany({
      where: { transactionId: `refund-capture:${c.chargeId}` },
      select: { account: true, direction: true, amountCents: true },
      orderBy: { direction: 'asc' }, // ordem do enum: DEBIT antes de CREDIT
    });
    expect(refund).toEqual([
      { account: 'REFUNDS', direction: 'DEBIT', amountCents: c.capturedCents },
      { account: 'GATEWAY_RECEIVABLE', direction: 'CREDIT', amountCents: c.capturedCents },
    ]);
    expect(
      await prisma.order.findUniqueOrThrow({ where: { externalId: c.orderExternalId } }),
    ).toMatchObject({ status: 'CANCELED' });
    expect(await auditEvents(action.id)).toEqual(['APPROVED', 'EXECUTED']);
  });

  it('REFUND_CAPTURE: duas aprovações em paralelo e uma segunda ação estornam uma vez só', async () => {
    const c = cases.can1!;
    const first = await pendingAction(c.caseId, 'REFUND_CAPTURE', { chargeId: c.chargeId });
    await Promise.all([approve(first.id).expect(200), approve(first.id).expect(200)]);
    // Outra investigação sugeriu o mesmo estorno: o transactionId é da cobrança, não da ação.
    const second = await pendingAction(c.caseId, 'REFUND_CAPTURE', { chargeId: c.chargeId });
    const res = ActionDecisionSchema.parse((await approve(second.id).expect(200)).body);

    expect(res.action.executionResult).toMatchObject({ ledger: 'already-posted' });
    expect(await ledgerEntriesOf(`refund-capture:${c.chargeId}`)).toBe(2);
    expect(await receivableOf(c.orderExternalId, c.chargeId)).toBe(0);
  });

  it('a conciliação não reabre os casos resolvidos', async () => {
    const result = ReconciliationResultSchema.parse(
      (await request(server).post('/reconcile').expect(200)).body,
    );

    expect(result.alreadyResolved).toBeGreaterThanOrEqual(2);
    for (const [c, type] of [
      [cases.dup0!, 'DUPLICATE_WEBHOOK'],
      [cases.mis0!, 'AMOUNT_MISMATCH'],
      [cases.can0!, 'CAPTURE_ON_CANCELED_ORDER'],
    ] as const) {
      expect(
        await prisma.case.count({
          where: { type, status: 'OPEN', order: { externalId: c.orderExternalId } },
        }),
      ).toBe(0);
    }
  });
});

describe('recusar e erros', () => {
  async function checksum(): Promise<string> {
    const [row] = await prisma.$queryRawUnsafe<{ sum: string }[]>(
      `SELECT md5(
         coalesce((SELECT string_agg(o::text, '|' ORDER BY o::text) FROM orders o), '') ||
         coalesce((SELECT string_agg(l::text, '|' ORDER BY l::text) FROM ledger_entries l), '') ||
         coalesce((SELECT string_agg(t::text, '|' ORDER BY t::text) FROM ledger_transactions t), '')
       ) AS sum`,
    );
    return row!.sum;
  }

  it('recusar não altera pedido nem ledger e o caso segue OPEN', async () => {
    const c = cases.pwo2!;
    const action = await pendingAction(c.caseId, 'MARK_ORDER_PAID', { chargeId: c.chargeId });
    const before = await checksum();

    const res = ActionDecisionSchema.parse(
      (await reject(action.id, 'ana@loja.com', 'quero conferir com o gateway').expect(200)).body,
    );

    expect(await checksum()).toBe(before);
    expect(res.case.status).toBe('OPEN');
    expect(res.action).toMatchObject({
      status: 'REJECTED',
      rejectionReason: 'quero conferir com o gateway',
    });
    await reject(action.id).expect(200); // recusar de novo: idempotente
    await approve(action.id).expect(409);
    expect(await auditEvents(action.id)).toEqual(['REJECTED']);
  });

  it('efeito que não pode ser aplicado → 422, nada muda e a ação segue APPROVED', async () => {
    const c = cases.pwo3!;
    const action = await pendingAction(c.caseId, 'MARK_ORDER_PAID', { chargeId: 'ch_inexistente' });
    const before = await checksum();

    const res = await approve(action.id).expect(422);

    expect((res.body as { message: string }).message).toMatch(/ch_inexistente não está no extrato/);
    expect(await checksum()).toBe(before);
    const view = ActionViewSchema.parse(
      (await request(server).get(`/actions/${action.id}`).expect(200)).body,
    );
    expect(view.status).toBe('APPROVED');
    expect(view.audit.map((a) => a.event)).toEqual(['APPROVED', 'EXECUTION_FAILED']);
    expect(await prisma.case.findUniqueOrThrow({ where: { id: c.caseId } })).toMatchObject({
      status: 'OPEN',
    });
  });

  it('REFUND_CAPTURE num pedido que não está cancelado → 422 e nada muda', async () => {
    const c = cases.pwo3!;
    const action = await pendingAction(c.caseId, 'REFUND_CAPTURE', { chargeId: c.chargeId });
    const before = await checksum();

    const res = await approve(action.id).expect(422);

    expect((res.body as { message: string }).message).toMatch(/só se estorna pedido CANCELED/);
    expect(await checksum()).toBe(before);
  });

  it('ação inexistente → 404; motivo vazio → 400', async () => {
    await approve('0195f2a0-0000-7000-8000-000000000000').expect(404);
    const action = await prisma.action.findFirstOrThrow({ where: { status: 'EXECUTED' } });
    await request(server)
      .post(`/actions/${action.id}/reject`)
      .set('authorization', bearer('ana@loja.com'))
      .send({ reason: '' })
      .expect(400);
  });
});

describe('identidade de quem decide (token de operador)', () => {
  it('POST /session emite um token de 24h; nome vazio → 400', async () => {
    const res = await request(server).post('/session').send({ operator: '  Carla  ' }).expect(200);
    const session = SessionResponseSchema.parse(res.body);
    expect(session.operator).toBe('Carla');
    const hours = (Date.parse(session.expiresAt) - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(23.9);
    expect(hours).toBeLessThanOrEqual(24);
    await request(server).post('/session').send({ operator: ' ' }).expect(400);
  });

  it('aprovar ou recusar sem token válido → 401 e nada muda', async () => {
    const c = cases.dup1!;
    const action = await pendingAction(c.caseId, 'IGNORE_DUPLICATE', {
      eventId: c.duplicateEventId,
    });
    const [payload, signature] = tokens['ana@loja.com']!.split('.');
    const forged = Buffer.from(JSON.stringify({ op: 'chefe', exp: 4_102_444_800 })).toString(
      'base64url',
    );
    const expired = issueOperatorToken(
      DEV_SESSION_SECRET,
      'ana@loja.com',
      new Date(Date.now() - 25 * 3_600_000),
    ).token;
    const otherSecret = issueOperatorToken('outro-segredo-qualquer-123', 'ana@loja.com').token;

    const url = `/actions/${action.id}/approve`;
    await request(server).post(url).send({ decidedBy: 'ana@loja.com' }).expect(401);
    for (const token of [
      'lixo',
      `${forged}.${signature}`, // payload trocado, assinatura antiga
      `${payload}.${signature}x`,
      expired,
      otherSecret,
    ]) {
      await request(server).post(url).set('authorization', `Bearer ${token}`).send({}).expect(401);
    }
    await request(server).post(`/actions/${action.id}/reject`).send({}).expect(401);

    expect(await prisma.action.findUniqueOrThrow({ where: { id: action.id } })).toMatchObject({
      status: 'PENDING',
      decidedBy: null,
    });
    expect(await auditEvents(action.id)).toEqual([]);
  });

  it('quem fica na ação e na auditoria é o operador do token, não o decidedBy do corpo', async () => {
    const c = cases.dup1!;
    const action = await prisma.action.findFirstOrThrow({
      where: { investigation: { caseId: c.caseId }, status: 'PENDING' },
    });

    const res = await request(server)
      .post(`/actions/${action.id}/approve`)
      .set('authorization', bearer('bruno@loja.com'))
      .send({ decidedBy: 'diretor-financeiro' })
      .expect(200);

    expect(ActionDecisionSchema.parse(res.body).action.decidedBy).toBe('bruno@loja.com');
    const actors = await prisma.auditEntry.findMany({
      where: { actionId: action.id },
      select: { event: true, actor: true },
      orderBy: { at: 'asc' },
    });
    expect(actors).toEqual([
      { event: 'APPROVED', actor: 'bruno@loja.com' },
      { event: 'EXECUTED', actor: 'bruno@loja.com' },
    ]);
  });
});

describe('trilha de auditoria', () => {
  it('aparece no histórico do caso', async () => {
    const detail = CaseDetailSchema.parse(
      (await request(server).get(`/cases/${cases.pwo0!.caseId}`).expect(200)).body,
    );
    expect(detail.history.map((h) => h.kind)).toEqual(
      expect.arrayContaining(['DETECTED', 'APPROVED', 'EXECUTED', 'RESOLVED']),
    );
    expect(detail.history).toContainEqual(
      expect.objectContaining({
        kind: 'APPROVED',
        description: 'ana@loja.com aprovou MARK_ORDER_PAID',
      }),
    );
  });

  it('é append-only: UPDATE e DELETE são recusados pelo banco', async () => {
    const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await client.connect();
    try {
      await expect(client.query(`UPDATE audit_log SET actor = 'outra pessoa'`)).rejects.toThrow(
        /append-only/,
      );
      await expect(client.query('DELETE FROM audit_log')).rejects.toThrow(/append-only/);
    } finally {
      await client.end();
    }
  });

  it('o ledger segue somando zero depois de todas as aprovações', async () => {
    const balance = LedgerBalanceSchema.parse(
      (await request(server).get('/ledger/balance').expect(200)).body,
    );
    expect(balance.totalCents).toBe(0);
  });
});
