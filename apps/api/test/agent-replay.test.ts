import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { CASE_TYPES } from '@reconcilia/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InvestigationsService } from '../src/agent/investigations.service.js';
import { caseOf, EXPECTED_ACTION, investigate } from './support/agent-fixtures.js';
import { clearQueues, createTestApp, waitFor } from './support/test-app.js';
import { createTestPrisma, truncateAll } from './support/test-db.js';

// Modo demonstração (DEMO_REPLAY=true, o padrão dos testes): sem Gemini, com o cliente de verdade.
const prisma = createTestPrisma();
let app: INestApplication;

beforeAll(async () => {
  app = await createTestApp();
  const server = app.getHttpServer() as Server;
  await truncateAll(prisma);
  await clearQueues(app);
  await request(server).post('/simulate').send({ orders: 50, seed: 42 }).expect(200);
  await waitFor(
    () => prisma.paymentEvent.count({ where: { processedAt: null } }),
    (pending) => pending === 0,
  );
  await request(server).post('/reconcile').expect(200);
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe('investigação interrompida', () => {
  it('RUNNING de uma execução anterior vira FAILED e libera o caso', async () => {
    const target = await caseOf(prisma, 'AMOUNT_MISMATCH', 1);
    const stuck = await prisma.investigation.create({
      data: { caseId: target.caseId, status: 'RUNNING' },
    });

    expect(await app.get(InvestigationsService).recoverInterrupted()).toBe(1);

    expect(await prisma.investigation.findUniqueOrThrow({ where: { id: stuck.id } })).toMatchObject(
      { status: 'FAILED', failureReason: expect.stringMatching(/Interrompida/) as unknown },
    );
    expect((await investigate(app, target.caseId)).status).toBe('DONE');
  });
});

describe('modo demonstração (DEMO_REPLAY)', () => {
  it.each(CASE_TYPES)(
    '%s: o roteiro roda as ferramentas e o diagnóstico sai preenchido com os dados reais',
    async (type) => {
      const target = await caseOf(prisma, type);

      const investigation = await investigate(app, target.caseId);

      expect(investigation.status).toBe('DONE');
      expect(investigation.suggestedAction?.kind).toBe(EXPECTED_ACTION[type]);
      expect(investigation.diagnosis).toContain(target.orderExternalId);
      expect(JSON.stringify(investigation)).not.toContain('{{');
      expect(investigation.action).toMatchObject({ status: 'PENDING' });
    },
  );
});
