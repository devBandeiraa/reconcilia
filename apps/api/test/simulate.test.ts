import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { type SimulationResult, SimulationResultSchema } from '@reconcilia/shared';
import { generateScenario } from '@reconcilia/simulator';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './support/test-app.js';
import { createTestPrisma, truncateAll } from './support/test-db.js';

// O POST /simulate envia por HTTP para a própria api: aqui ela precisa ouvir uma porta de verdade.
const prisma = createTestPrisma();
let app: INestApplication;
let server: Server;
let result: SimulationResult;

beforeAll(async () => {
  await truncateAll(prisma);
  app = await createTestApp();
  await app.listen(0);
  server = app.getHttpServer() as Server;

  const res = await request(server).post('/simulate').send({ orders: 20, seed: 1 }).expect(200);
  result = SimulationResultSchema.parse(res.body);
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

async function counts() {
  const [orders, authorized, captured, erp, statement] = await Promise.all([
    prisma.order.count(),
    prisma.paymentEvent.count({ where: { type: 'AUTHORIZED' } }),
    prisma.paymentEvent.count({ where: { type: 'CAPTURED' } }),
    prisma.erpEvent.count(),
    prisma.simGatewayStatementEntry.count(),
  ]);
  return { orders, authorized, captured, erp, statement };
}

describe('POST /simulate', () => {
  it('devolve o gabarito da seed, igual ao do gerador', () => {
    expect(result.seed).toBe(1);
    expect(result.gabarito).toEqual(generateScenario({ orders: 20 }, 1).gabarito);
  });

  it('o banco bate com o gabarito: só os pedidos perdidos ficam sem captura', async () => {
    const lost = result.gabarito.filter((g) => g.caseType === 'PAYMENT_WITHOUT_ORDER');
    expect(await counts()).toEqual({
      orders: 20,
      authorized: 20,
      captured: 20 - lost.length,
      erp: 20,
      statement: 20,
    });

    for (const { orderExternalId } of lost) {
      expect(
        await prisma.paymentEvent.count({ where: { orderExternalId, type: 'CAPTURED' } }),
      ).toBe(0);
      expect(await prisma.simGatewayStatementEntry.count({ where: { orderExternalId } })).toBe(1);
    }
  });

  it('nos pedidos com mismatch, o ERP gravou o valor com juros', async () => {
    for (const entry of result.gabarito) {
      if (entry.caseType !== 'AMOUNT_MISMATCH') continue;
      const erp = await prisma.erpEvent.findFirstOrThrow({
        where: { orderExternalId: entry.orderExternalId },
      });
      expect(erp.amountCents).toBe(entry.erpCents);
    }
  });

  it('rodar a mesma seed de novo é um reenvio idempotente: nada novo no banco', async () => {
    const before = await counts();
    await request(server).post('/simulate').send({ orders: 20, seed: 1 }).expect(200);
    expect(await counts()).toEqual(before);
  });

  it('recusa opções inválidas com 400', async () => {
    await request(server).post('/simulate').send({ lost: 0.7, duplicate: 0.7 }).expect(400);
    await request(server).post('/simulate').send({ orders: 201 }).expect(400);
  });
});
