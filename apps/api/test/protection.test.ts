import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { buildMessages, generateScenario, PATHS } from '@reconcilia/simulator';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { clearQueues, createTestApp, signedPost } from './support/test-app.js';
import { createTestPrisma, truncateAll } from './support/test-db.js';

// Proteção da demo pública: limite por IP (geral e nas rotas pesadas) e teto diário de
// investigações. Os outros testes rodam com tudo isso desligado. O contador do limite fica na
// memória do app, então cada cenário sobe um app novo e começa do zero.
const prisma = createTestPrisma();

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await truncateAll(prisma);
});

async function withApp(
  env: Record<string, string>,
  run: (server: Server) => Promise<void>,
): Promise<void> {
  const app: INestApplication = await createTestApp({ env });
  try {
    await clearQueues(app);
    await run(app.getHttpServer() as Server);
  } finally {
    await app.close();
  }
}

/** Pedido com caso aberto, gravados direto no banco (sem passar pelas rotas limitadas). */
async function openCase(externalId: string): Promise<string> {
  const order = await prisma.order.create({ data: { externalId, totalCents: 1000 } });
  const row = await prisma.case.create({ data: { orderId: order.id, type: 'DUPLICATE_WEBHOOK' } });
  return row.id;
}

describe('limite por IP', () => {
  it('rotas pesadas: a terceira chamada no mesmo minuto → 429, com mensagem em português', () =>
    withApp({ THROTTLE_HEAVY_PER_MINUTE: '2' }, async (server) => {
      await request(server).post('/reconcile').expect(200);
      await request(server).post('/reconcile').expect(200);
      const blocked = await request(server).post('/reconcile').expect(429);

      expect((blocked.body as { message: string }).message).toMatch(/Muitas requisições/);
      expect(blocked.headers['retry-after-pesado']).toBeDefined();
      // A leitura não é rota pesada: segue liberada.
      await request(server).get('/cases').expect(200);
    }));

  it('demais rotas: a sétima no mesmo minuto → 429', () =>
    withApp({ THROTTLE_PER_MINUTE: '6' }, async (server) => {
      const statuses: number[] = [];
      for (let i = 0; i < 7; i++) statuses.push((await request(server).get('/cases')).status);

      expect(statuses).toEqual([200, 200, 200, 200, 200, 200, 429]);
    }));

  it('health e webhooks (autenticados por HMAC) não entram no limite', () =>
    withApp({ THROTTLE_PER_MINUTE: '3' }, async (server) => {
      for (let i = 0; i < 8; i++) await request(server).get('/health').expect(200);

      const order = generateScenario(
        { orders: 1, lost: 0, duplicate: 0, mismatch: 0, canceled: 0 },
        77,
      ).orders[0]!;
      const { store } = buildMessages(order, new Date());
      const statuses: number[] = [];
      for (let i = 0; i < 8; i++)
        statuses.push((await signedPost(server, PATHS.store, store)).status);

      expect(statuses).toEqual([202, 200, 200, 200, 200, 200, 200, 200]);
    }));
});

describe('teto diário de investigações', () => {
  it('passou do teto → 429; a investigação ativa do caso continua sendo devolvida', () =>
    withApp({ DEMO_MAX_INVESTIGATIONS_PER_DAY: '1' }, async (server) => {
      const first = await openCase('PROT-1');
      const second = await openCase('PROT-2');

      await request(server).post(`/cases/${first}/investigate`).expect(202);
      const blocked = await request(server).post(`/cases/${second}/investigate`).expect(429);

      expect((blocked.body as { message: string }).message).toMatch(/teto de 1 investigações hoje/);
      expect(await prisma.investigation.count({ where: { caseId: second } })).toBe(0);
      // A do primeiro caso já existe: devolvê-la não cria nada e não esbarra no teto.
      const again = await request(server).post(`/cases/${first}/investigate`);
      expect([200, 202]).toContain(again.status);
      expect(await prisma.investigation.count()).toBe(1);
    }));
});
