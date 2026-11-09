import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import {
  DEV_WEBHOOK_SECRET,
  GatewayStatementPageSchema,
  SIGNATURE_HEADER,
} from '@reconcilia/shared';
import { buildMessages, generateScenario, PATHS, sign } from '@reconcilia/simulator';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, signedPost } from './support/test-app.js';
import { createTestPrisma, truncateAll } from './support/test-db.js';

// Webhooks assinados: evento novo → 202; reenvio do mesmo id → 200 com duplicate=true.
const prisma = createTestPrisma();
let app: INestApplication;
let server: Server;

const order = generateScenario({ orders: 1, lost: 0, duplicate: 0, mismatch: 1, canceled: 0 }, 99)
  .orders[0]!;
const messages = buildMessages(order, new Date('2026-01-01T12:00:00.000Z'));

beforeAll(async () => {
  app = await createTestApp();
  server = app.getHttpServer() as Server;
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await truncateAll(prisma);
});

const post = (path: string, body: unknown, options?: Parameters<typeof signedPost>[3]) =>
  signedPost(server, path, body, options);

describe('webhooks', () => {
  it('loja: cria o pedido e um reenvio não duplica', async () => {
    await post(PATHS.store, messages.store).expect(202, { received: true, duplicate: false });
    await post(PATHS.store, messages.store).expect(200, { received: true, duplicate: true });

    const orders = await prisma.order.findMany();
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({
      externalId: order.externalId,
      totalCents: order.totalCents,
      installments: order.installments,
      status: 'PENDING',
    });
  });

  it('loja: cancela o pedido PENDING uma vez; reenvio não muda nada', async () => {
    await post(PATHS.store, messages.store).expect(202);
    await post(PATHS.store, messages.canceled).expect(202, { received: true, duplicate: false });
    await post(PATHS.store, messages.canceled).expect(200, { received: true, duplicate: true });

    expect(
      await prisma.order.findUniqueOrThrow({ where: { externalId: order.externalId } }),
    ).toMatchObject({ status: 'CANCELED', canceledAt: new Date(messages.canceled.occurredAt) });
  });

  it('loja: cancelar um pedido que ainda não existe → 409, para a loja reenviar', async () => {
    await post(PATHS.store, messages.canceled).expect(409);
    expect(await prisma.order.count()).toBe(0);
  });

  it('gateway: grava o evento traduzido para o modelo interno e um reenvio não duplica', async () => {
    await post(PATHS.gateway, messages.captured).expect(202);
    await post(PATHS.gateway, messages.captured).expect(200);

    const events = await prisma.paymentEvent.findMany();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventId: messages.captured.id,
      provider: 'simpay',
      type: 'CAPTURED',
      orderExternalId: order.externalId,
      amountCents: order.totalCents,
      payload: messages.captured,
      receivedCount: 2,
    });
  });

  it('ERP: grava o evento traduzido para o modelo interno', async () => {
    await post(PATHS.erp, messages.erp).expect(202);

    const events = await prisma.erpEvent.findMany();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventId: messages.erp.id,
      type: 'PAYMENT_RECORDED',
      amountCents: order.erpCents,
    });
  });

  it('recusa payload fora do contrato com 400 e a lista de problemas, sem gravar nada', async () => {
    const res = await post(PATHS.gateway, {
      ...messages.captured,
      type: 'charge.exploded',
      data: { ...messages.captured.data, amountCents: -1 },
    }).expect(400);

    const body = res.body as { issues: { path: string }[] };
    expect(body.issues.map((i) => i.path)).toEqual(
      expect.arrayContaining(['type', 'data.amountCents']),
    );
    expect(await prisma.paymentEvent.count()).toBe(0);
  });
});

describe('assinatura com timestamp (janela de 300s)', () => {
  const secondsAgo = (seconds: number) => new Date(Date.now() - seconds * 1000);
  const withHeader = (header: string, raw = JSON.stringify(messages.store)) =>
    request(server)
      .post(PATHS.store)
      .set('content-type', 'application/json')
      .set(SIGNATURE_HEADER, header)
      .send(raw);

  it('dentro da janela (assinada há 4 minutos ou 4 minutos no futuro) → aceita', async () => {
    await post(PATHS.store, messages.store, { signedAt: secondsAgo(240) }).expect(202);
    await post(PATHS.store, messages.store, { signedAt: secondsAgo(-240) }).expect(200);
  });

  it('fora da janela, mesmo com o HMAC certo → 401 e nada gravado', async () => {
    const old = await post(PATHS.store, messages.store, { signedAt: secondsAgo(301) }).expect(401);
    expect((old.body as { message: string }).message).toMatch(/fora da janela de 300s/);
    await post(PATHS.store, messages.store, { signedAt: secondsAgo(-301) }).expect(401);
    expect(await prisma.order.count()).toBe(0);
  });

  it('corpo alterado, timestamp trocado ou formato antigo → 401', async () => {
    const raw = JSON.stringify(messages.store);
    const header = sign(DEV_WEBHOOK_SECRET, raw);
    await withHeader(header, raw.replace(String(order.totalCents), '1')).expect(401);
    const [t, v1] = header.split(',');
    // Um segundo antes do t assinado (derivado do header, não do relógio: sem corrida na virada).
    const otherSecond = Number(t!.slice(2)) - 1;
    await withHeader(`t=${otherSecond},${v1}`, raw).expect(401);
    await withHeader(`sha256=${v1!.slice(3)}`, raw).expect(401);
    await withHeader(header.replace('v1=', 'v0='), raw).expect(401);
    expect(await prisma.order.count()).toBe(0);
  });

  it('aceita mais de um v1 se um deles confere (troca de segredo)', async () => {
    const raw = JSON.stringify(messages.store);
    const now = new Date();
    const fromOldSecret = sign('segredo-antigo-ja-trocado', raw, now).split(',')[1]!;
    await withHeader(`${sign(DEV_WEBHOOK_SECRET, raw, now)},${fromOldSecret}`, raw).expect(202);
  });
});

describe('extrato do gateway simulado', () => {
  it('publica, ignora reenvio por chargeId e consulta com filtro e paginação', async () => {
    const other = buildMessages(
      { ...order, externalId: 'S99-0002' },
      new Date('2026-01-01T13:00:00.000Z'),
    );
    const entries = [messages.statement, other.statement];

    await post(PATHS.statement, { entries }).expect(202);
    await post(PATHS.statement, { entries }).expect(202);
    expect(await prisma.simGatewayStatementEntry.count()).toBe(2);

    const filtered = GatewayStatementPageSchema.parse(
      (
        await request(server)
          .get(PATHS.statement)
          .query({ orderReference: order.externalId })
          .expect(200)
      ).body,
    );
    expect(filtered.data).toEqual([messages.statement]);
    expect(filtered.pagination.total).toBe(1);

    const page = GatewayStatementPageSchema.parse(
      (await request(server).get(PATHS.statement).query({ limit: 1, offset: 1 }).expect(200)).body,
    );
    expect(page.data).toEqual([other.statement]);
    expect(page.pagination).toEqual({ limit: 1, offset: 1, total: 2 });
  });

  it('recusa limite fora da faixa', async () => {
    await request(server).get(PATHS.statement).query({ limit: 5000 }).expect(400);
  });
});
