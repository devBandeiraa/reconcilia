import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { DEV_WEBHOOK_SECRET, SIGNATURE_HEADER, type WebhookAck } from '@reconcilia/shared';
import { buildMessages, generateScenario, PATHS } from '@reconcilia/simulator';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { LedgerOutcome, LedgerPort } from '../src/ledger/ledger.port.js';
import { PAYMENT_EVENTS_QUEUE } from '../src/queue/queue.constants.js';
import { QueueService } from '../src/queue/queue.service.js';
import { clearQueues, createTestApp, signedPost, waitFor } from './support/test-app.js';
import { createTestPrisma, truncateAll } from './support/test-db.js';

/** Ledger de teste: conta tentativas e aplicações e pode falhar de propósito. */
class CountingLedger implements LedgerPort {
  attempts = 0;
  failuresLeft = 0;
  recordRefund(): Promise<LedgerOutcome> {
    return Promise.resolve('posted');
  }

  recordCapture(): Promise<LedgerOutcome> {
    this.attempts++;
    if (this.failuresLeft > 0) {
      this.failuresLeft--;
      return Promise.reject(new Error('falha simulada do ledger'));
    }
    return Promise.resolve('posted');
  }
}

const prisma = createTestPrisma();
const ledger = new CountingLedger();
let app: INestApplication;
let server: Server;

const planned = generateScenario({ orders: 1, lost: 0, duplicate: 0, mismatch: 0 }, 4).orders[0]!;
const messages = buildMessages(planned, new Date('2026-01-02T10:00:00.000Z'));

beforeAll(async () => {
  app = await createTestApp({ ledger });
  server = app.getHttpServer() as Server;
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await truncateAll(prisma);
  await clearQueues(app);
  ledger.attempts = 0;
  ledger.failuresLeft = 0;
});

async function createPendingOrder(): Promise<void> {
  await prisma.order.create({
    data: {
      externalId: planned.externalId,
      totalCents: planned.totalCents,
      installments: planned.installments,
    },
  });
}

const capturedEvent = () =>
  prisma.paymentEvent.findUniqueOrThrow({ where: { eventId: messages.captured.id } });

describe('ingestão idempotente', () => {
  it('o MESMO webhook 50 vezes em paralelo vira 1 linha, received_count 50, 1 aplicação e pedido PAID', async () => {
    await createPendingOrder();

    const responses = await Promise.all(
      Array.from({ length: 50 }, () => signedPost(server, PATHS.gateway, messages.captured)),
    );
    const bodies = responses.map((r) => r.body as WebhookAck);
    expect(responses.filter((r) => r.status === 202)).toHaveLength(1);
    expect(responses.filter((r) => r.status === 200)).toHaveLength(49);
    expect(bodies.filter((b) => !b.duplicate)).toHaveLength(1);

    const rows = await prisma.paymentEvent.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.receivedCount).toBe(50);

    const applied = await waitFor(capturedEvent, (e) => e.processedAt !== null);
    expect(applied.processedAt).not.toBeNull();
    expect(
      await prisma.order.findUniqueOrThrow({ where: { externalId: planned.externalId } }),
    ).toMatchObject({ status: 'PAID' });

    // Um único job foi criado e uma única aplicação aconteceu.
    expect(await app.get(QueueService).boss.findJobs(PAYMENT_EVENTS_QUEUE)).toHaveLength(1);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(ledger.attempts).toBe(1);
  });

  it.each([
    ['segredo errado', (raw: string) => ({ raw, secret: 'outro-segredo-qualquer-123' })],
    [
      'corpo alterado depois de assinado',
      (raw: string) => ({
        raw: raw.replace('BRL', 'USD'),
        secret: DEV_WEBHOOK_SECRET,
        signed: raw,
      }),
    ],
  ])('assinatura inválida (%s) → 401 e nada gravado', async (_, variant) => {
    const original = JSON.stringify(messages.captured);
    const { raw, secret, signed } = variant(original) as {
      raw: string;
      secret: string;
      signed?: string;
    };
    const { sign } = await import('@reconcilia/simulator');

    await request(server)
      .post(PATHS.gateway)
      .set('content-type', 'application/json')
      .set(SIGNATURE_HEADER, sign(secret, signed ?? raw))
      .send(raw)
      .expect(401);

    expect(await prisma.paymentEvent.count()).toBe(0);
    expect(await app.get(QueueService).boss.findJobs(PAYMENT_EVENTS_QUEUE)).toHaveLength(0);
  });

  it('sem X-Signature → 401 e nada gravado', async () => {
    await request(server).post(PATHS.gateway).send(messages.captured).expect(401);
    await request(server).post(PATHS.erp).send(messages.erp).expect(401);
    await request(server).post(PATHS.store).send(messages.store).expect(401);
    expect(await prisma.paymentEvent.count()).toBe(0);
    expect(await prisma.erpEvent.count()).toBe(0);
    expect(await prisma.order.count()).toBe(0);
  });

  it('worker que falha 2 vezes e depois funciona → aplicado uma vez', async () => {
    await createPendingOrder();
    ledger.failuresLeft = 2;

    await signedPost(server, PATHS.gateway, messages.captured).expect(202);

    const applied = await waitFor(capturedEvent, (e) => e.processedAt !== null);
    expect(applied.processedAt).not.toBeNull();
    expect(ledger.attempts).toBe(3);
    expect(
      await prisma.order.findUniqueOrThrow({ where: { externalId: planned.externalId } }),
    ).toMatchObject({ status: 'PAID' });

    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(ledger.attempts).toBe(3);
  });

  it('evento cujo pedido nunca chega esgota as tentativas e aparece em GET /admin/dlq', async () => {
    await signedPost(server, PATHS.gateway, messages.captured).expect(202);

    const dlq = await waitFor(
      async () =>
        (await request(server).get('/admin/dlq').expect(200)).body as {
          data: { eventId: string; orderExternalId: string }[];
        },
      (page) => page.data.length > 0,
    );
    expect(dlq.data).toEqual([
      expect.objectContaining({
        eventId: messages.captured.id,
        orderExternalId: planned.externalId,
      }),
    ]);
    expect((await capturedEvent()).processedAt).toBeNull();
  });

  it('ERP e loja: evento novo → 202, reenvio → 200 com duplicate e received_count incrementado', async () => {
    await signedPost(server, PATHS.erp, messages.erp).expect(202, {
      received: true,
      duplicate: false,
    });
    await signedPost(server, PATHS.erp, messages.erp).expect(200, {
      received: true,
      duplicate: true,
    });
    expect(
      await prisma.erpEvent.findUniqueOrThrow({ where: { eventId: messages.erp.id } }),
    ).toMatchObject({
      receivedCount: 2,
    });

    await signedPost(server, PATHS.store, messages.store).expect(202, {
      received: true,
      duplicate: false,
    });
    await signedPost(server, PATHS.store, messages.store).expect(200, {
      received: true,
      duplicate: true,
    });
    expect(await prisma.order.count()).toBe(1);
  });
});
