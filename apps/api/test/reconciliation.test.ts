import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import {
  CaseDetailSchema,
  CasePageSchema,
  type GabaritoEntry,
  type ReconciliationResult,
  ReconciliationResultSchema,
  SimulationResultSchema,
} from '@reconcilia/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { QueueService } from '../src/queue/queue.service.js';
import { RECONCILIATION_QUEUE } from '../src/queue/queue.constants.js';
import { clearQueues, createTestApp, waitFor } from './support/test-app.js';
import { createTestPrisma, truncateAll } from './support/test-db.js';

const prisma = createTestPrisma();
let app: INestApplication;
let server: Server;

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
  await clearQueues(app);
});

async function simulate(seed: number, orders = 50): Promise<GabaritoEntry[]> {
  const res = await request(server).post('/simulate').send({ orders, seed }).expect(200);
  return SimulationResultSchema.parse(res.body).gabarito;
}

async function reconcile(): Promise<ReconciliationResult> {
  const res = await request(server).post('/reconcile').expect(200);
  return ReconciliationResultSchema.parse(res.body);
}

const queueDrained = () =>
  waitFor(
    () => prisma.paymentEvent.count({ where: { processedAt: null } }),
    (pending) => pending === 0,
  );

/** Casos abertos como "pedido|tipo", ordenados: comparável com o gabarito. */
async function openCases(): Promise<string[]> {
  const rows = await prisma.case.findMany({
    where: { status: 'OPEN' },
    select: { type: true, order: { select: { externalId: true } } },
  });
  return rows.map((r) => `${r.order.externalId}|${r.type}`).sort();
}

const expected = (gabarito: GabaritoEntry[]) =>
  gabarito.map((g) => `${g.orderExternalId}|${g.caseType}`).sort();

describe('conciliação contra o gabarito do simulador', () => {
  it('com seed fixa, os casos abertos são EXATAMENTE os do gabarito', async () => {
    const gabarito = await simulate(42);
    await queueDrained();

    const result = await reconcile();

    expect(await openCases()).toEqual(expected(gabarito));
    const count = (type: string) => gabarito.filter((g) => g.caseType === type).length;
    expect(result.opened).toEqual({
      PAYMENT_WITHOUT_ORDER: count('PAYMENT_WITHOUT_ORDER'),
      DUPLICATE_WEBHOOK: count('DUPLICATE_WEBHOOK'),
      AMOUNT_MISMATCH: count('AMOUNT_MISMATCH'),
      CAPTURE_ON_CANCELED_ORDER: count('CAPTURE_ON_CANCELED_ORDER'),
    });
    expect(count('CAPTURE_ON_CANCELED_ORDER')).toBeGreaterThan(0);
    expect(result.alreadyOpen).toBe(0);
  });

  it('rodar duas vezes não cria casos novos', async () => {
    const gabarito = await simulate(7);
    await queueDrained();

    await reconcile();
    const second = await reconcile();

    expect(second.opened).toEqual({
      PAYMENT_WITHOUT_ORDER: 0,
      DUPLICATE_WEBHOOK: 0,
      AMOUNT_MISMATCH: 0,
      CAPTURE_ON_CANCELED_ORDER: 0,
    });
    expect(second.alreadyOpen).toBe(gabarito.length);
    expect(await prisma.case.count()).toBe(gabarito.length);
  });

  it('conciliar sem esperar a fila do worker dá o mesmo resultado', async () => {
    const gabarito = await simulate(99);

    await reconcile();

    expect(await openCases()).toEqual(expected(gabarito));
    await queueDrained(); // não deixa o worker trabalhando para o próximo teste
  });
});

describe('GET /cases e GET /cases/:id', () => {
  it('lista com filtro por tipo e status e paginação', async () => {
    const gabarito = await simulate(42);
    await reconcile();
    const duplicates = gabarito.filter((g) => g.caseType === 'DUPLICATE_WEBHOOK');

    const filtered = CasePageSchema.parse(
      (
        await request(server)
          .get('/cases')
          .query({ type: 'DUPLICATE_WEBHOOK', status: 'OPEN' })
          .expect(200)
      ).body,
    );
    expect(filtered.pagination.total).toBe(duplicates.length);
    expect(filtered.data.every((c) => c.type === 'DUPLICATE_WEBHOOK' && c.status === 'OPEN')).toBe(
      true,
    );

    const page = CasePageSchema.parse(
      (await request(server).get('/cases').query({ limit: 2, offset: 1 }).expect(200)).body,
    );
    expect(page.data).toHaveLength(2);
    expect(page.pagination).toEqual({ limit: 2, offset: 1, total: gabarito.length });

    await request(server).get('/cases').query({ type: 'NOPE' }).expect(400);
  });

  it('o detalhe traz os três lados em ordem cronológica e destaca o duplicado', async () => {
    const gabarito = await simulate(42);
    await queueDrained();
    await reconcile();
    const duplicate = gabarito.find((g) => g.caseType === 'DUPLICATE_WEBHOOK')!;
    const caseRow = await prisma.case.findFirstOrThrow({
      where: { type: 'DUPLICATE_WEBHOOK', order: { externalId: duplicate.orderExternalId } },
    });

    const detail = CaseDetailSchema.parse(
      (await request(server).get(`/cases/${caseRow.id}`).expect(200)).body,
    );

    expect(detail.case).toMatchObject({
      id: caseRow.id,
      orderExternalId: duplicate.orderExternalId,
    });
    expect(new Set(detail.timeline.map((t) => t.source))).toEqual(
      new Set(['STORE', 'GATEWAY', 'GATEWAY_STATEMENT', 'ERP']),
    );
    const times = detail.timeline.map((t) => t.at);
    expect(times).toEqual([...times].sort());
    const captured = detail.timeline.find((t) => t.source === 'GATEWAY' && t.type === 'CAPTURED')!;
    expect(captured).toMatchObject({
      duplicate: true,
      receivedCount: (duplicate as { copies: number }).copies,
    });
    expect(detail.history).toEqual([expect.objectContaining({ kind: 'DETECTED' })]);
    expect(detail.storeTimezone).toBe('America/Sao_Paulo');
    expect(detail.investigations).toEqual([]);
  });

  it('caso inexistente → 404; id que não é UUID → 400', async () => {
    await request(server).get('/cases/0195f2a0-0000-7000-8000-000000000000').expect(404);
    await request(server).get('/cases/nao-e-uuid').expect(400);
  });
});

describe('conciliação agendada', () => {
  it('registra no pg-boss o job a cada 5 minutos', async () => {
    const scheduled = await createTestApp({ env: { RECONCILIATION_CRON: '*/5 * * * *' } });
    try {
      const { boss } = scheduled.get(QueueService);
      await waitFor(
        () => boss.getSchedules(RECONCILIATION_QUEUE),
        (schedules) => schedules.length > 0,
      );
      const [schedule] = await boss.getSchedules(RECONCILIATION_QUEUE);
      expect(schedule).toMatchObject({ name: RECONCILIATION_QUEUE, cron: '*/5 * * * *' });
      await boss.unschedule(RECONCILIATION_QUEUE);
    } finally {
      await scheduled.close();
    }
  });
});
