import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { CASE_TYPES } from '@reconcilia/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AgentRunner, MAX_ROUNDS } from '../src/agent/agent.runner.js';
import { FakeLlmClient } from '../src/agent/llm/fake.client.js';
import { LlmQuotaError } from '../src/agent/llm/llm-client.js';
import { readOnly } from '../src/agent/read-only.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  caseOf,
  correctDiagnosis,
  EXPECTED_ACTION,
  investigate,
  READ_ALL,
  submit,
  SwitchableLlm,
} from './support/agent-fixtures.js';
import { clearQueues, createTestApp, waitFor } from './support/test-app.js';
import { createTestPrisma, truncateAll } from './support/test-db.js';

// Nenhum teste chama o modelo real: o LlmClient é trocado por roteiros (FakeLlmClient).
const prisma = createTestPrisma();
const llm = new SwitchableLlm();
let app: INestApplication;
let server: Server;

beforeAll(async () => {
  app = await createTestApp({ llm });
  server = app.getHttpServer() as Server;
  await truncateAll(prisma);
  await clearQueues(app);

  // Cenário com casos dos 3 tipos: simulação com seed fixa, fila aplicada e conciliação.
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

beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE "actions", "investigations"');
  llm.impl = null;
});

describe('agente: cada tipo de caso termina com a ação esperada', () => {
  it.each(CASE_TYPES)('%s → DONE com a ação certa e a action PENDING criada', async (type) => {
    const target = await caseOf(prisma, type);
    llm.impl = new FakeLlmClient([READ_ALL, submit(correctDiagnosis(type, target))]);

    const investigation = await investigate(app, target.caseId);

    expect(investigation.status).toBe('DONE');
    expect(investigation.suggestedAction?.kind).toBe(EXPECTED_ACTION[type]);
    expect(investigation.evidence.length).toBeGreaterThan(0);
    expect(investigation.steps.map((s) => s.tool)).toEqual([
      'getOrder',
      'getGatewayEvents',
      'getGatewayStatement',
      'getErpEvents',
      'submitDiagnosis',
    ]);
    expect(investigation.action).toMatchObject({ kind: EXPECTED_ACTION[type], status: 'PENDING' });
    const action = await prisma.action.findFirstOrThrow({
      where: { investigationId: investigation.id },
    });
    const expected = correctDiagnosis(type, target).suggestedAction as { params: unknown };
    expect(action.params).toEqual(expected.params);
  });
});

describe('agente: limites', () => {
  it(`passar de ${MAX_ROUNDS} rodadas → FAILED`, async () => {
    const target = await caseOf(prisma, 'DUPLICATE_WEBHOOK');
    const looping = new FakeLlmClient([{ toolCalls: [{ name: 'getOrder', args: {} }] }]);
    llm.impl = looping;

    const investigation = await investigate(app, target.caseId);

    expect(investigation.status).toBe('FAILED');
    expect(investigation.failureReason).toMatch(new RegExp(`${MAX_ROUNDS} rodadas`));
    expect(looping.calls).toBe(MAX_ROUNDS);
    expect(investigation.action).toBeNull();
  });

  it('diagnóstico com id inventado é recusado uma vez e o corrigido é aceito', async () => {
    const target = await caseOf(prisma, 'DUPLICATE_WEBHOOK');
    const invented = {
      ...correctDiagnosis('DUPLICATE_WEBHOOK', target),
      suggestedAction: { kind: 'IGNORE_DUPLICATE', params: { eventId: 'evt_inventado' } },
    };
    llm.impl = new FakeLlmClient([
      READ_ALL,
      submit(invented),
      submit(correctDiagnosis('DUPLICATE_WEBHOOK', target)),
    ]);

    const investigation = await investigate(app, target.caseId);

    expect(investigation.status).toBe('DONE');
    expect(investigation.steps.map((s) => s.summary)).toContainEqual(
      expect.stringMatching(/recusado: eventId evt_inventado não é um webhook deste pedido/),
    );
  });

  it('diagnóstico inválido duas vezes → FAILED com o motivo', async () => {
    const target = await caseOf(prisma, 'AMOUNT_MISMATCH');
    const wrongValues = {
      ...correctDiagnosis('AMOUNT_MISMATCH', target),
      suggestedAction: { kind: 'FLAG_ERP_DIVERGENCE', params: { expectedCents: 1, erpCents: 2 } },
    };
    llm.impl = new FakeLlmClient([READ_ALL, submit(wrongValues), submit({ diagnosis: 'curto' })]);

    const investigation = await investigate(app, target.caseId);

    expect(investigation.status).toBe('FAILED');
    expect(investigation.failureReason).toMatch(/Diagnóstico inválido duas vezes/);
  });

  it('cota esgotada (429) → FAILED com motivo claro, e o worker segue funcionando', async () => {
    const first = await caseOf(prisma, 'PAYMENT_WITHOUT_ORDER');
    llm.impl = new FakeLlmClient([
      () => {
        throw new LlmQuotaError('RESOURCE_EXHAUSTED');
      },
    ]);
    const failed = await investigate(app, first.caseId);
    expect(failed.status).toBe('FAILED');
    expect(failed.failureReason).toMatch(/Cota do modelo esgotada \(429\)/);

    const second = await caseOf(prisma, 'AMOUNT_MISMATCH');
    llm.impl = new FakeLlmClient([READ_ALL, submit(correctDiagnosis('AMOUNT_MISMATCH', second))]);
    expect((await investigate(app, second.caseId)).status).toBe('DONE');
  });
});

describe('agente: só leitura', () => {
  const TABLES = [
    'orders',
    'payment_events',
    'erp_events',
    'ledger_transactions',
    'ledger_entries',
    'cases',
    'investigations',
    'actions',
    'sim_gateway_statement',
  ];

  async function checksum(): Promise<Record<string, string>> {
    const sums: Record<string, string> = {};
    for (const table of TABLES) {
      const [row] = await prisma.$queryRawUnsafe<{ sum: string | null }[]>(
        `SELECT md5(string_agg(t::text, '|' ORDER BY t::text)) AS sum FROM "${table}" t`,
      );
      sums[table] = row?.sum ?? 'vazia';
    }
    return sums;
  }

  it('o banco está idêntico antes e depois das ferramentas', async () => {
    const target = await caseOf(prisma, 'PAYMENT_WITHOUT_ORDER');
    const order = await prisma.order.findUniqueOrThrow({
      where: { externalId: target.orderExternalId },
    });
    const caseRow = await prisma.case.findUniqueOrThrow({ where: { id: target.caseId } });
    llm.impl = new FakeLlmClient([
      READ_ALL,
      READ_ALL,
      submit(correctDiagnosis('PAYMENT_WITHOUT_ORDER', target)),
    ]);

    const before = await checksum();
    const outcome = await app.get(AgentRunner).run({
      caseId: target.caseId,
      caseType: caseRow.type,
      detectedAt: caseRow.detectedAt,
      orderExternalId: order.externalId,
      storeTimezone: 'America/Sao_Paulo',
    });
    const after = await checksum();

    expect(outcome.status).toBe('DONE');
    expect(outcome.steps.filter((s) => s.tool !== 'submitDiagnosis')).toHaveLength(8);
    expect(after).toEqual(before);
  });

  it('dentro da transação das ferramentas, o Postgres recusa escrita', async () => {
    await expect(
      readOnly(app.get(PrismaService), (tx) => tx.order.updateMany({ data: { installments: 1 } })),
    ).rejects.toThrow(/read-only transaction/);
  });
});

describe('endpoints de investigação', () => {
  it('pedir de novo com uma investigação ativa devolve a mesma (200)', async () => {
    const target = await caseOf(prisma, 'DUPLICATE_WEBHOOK');
    const slow = async () => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return READ_ALL;
    };
    llm.impl = new FakeLlmClient([slow, submit(correctDiagnosis('DUPLICATE_WEBHOOK', target))]);

    const first = await request(server).post(`/cases/${target.caseId}/investigate`).expect(202);
    const second = await request(server).post(`/cases/${target.caseId}/investigate`).expect(200);
    expect((second.body as { investigationId: string }).investigationId).toBe(
      (first.body as { investigationId: string }).investigationId,
    );
    await waitFor(
      () => prisma.investigation.count({ where: { status: { in: ['QUEUED', 'RUNNING'] } } }),
      (active) => active === 0,
    );
  });

  it('caso que não está OPEN → 409; caso inexistente → 404; id inválido → 400', async () => {
    const target = await caseOf(prisma, 'AMOUNT_MISMATCH');
    await prisma.case.update({ where: { id: target.caseId }, data: { status: 'DISMISSED' } });
    try {
      await request(server).post(`/cases/${target.caseId}/investigate`).expect(409);
    } finally {
      await prisma.case.update({ where: { id: target.caseId }, data: { status: 'OPEN' } });
    }
    await request(server)
      .post('/cases/0195f2a0-0000-7000-8000-000000000000/investigate')
      .expect(404);
    await request(server).post('/cases/nao-e-uuid/investigate').expect(400);
    await request(server).get('/investigations/0195f2a0-0000-7000-8000-000000000000').expect(404);
  });

  it('o histórico do caso mostra a investigação', async () => {
    const target = await caseOf(prisma, 'PAYMENT_WITHOUT_ORDER');
    llm.impl = new FakeLlmClient([
      READ_ALL,
      submit(correctDiagnosis('PAYMENT_WITHOUT_ORDER', target)),
    ]);
    await investigate(app, target.caseId);

    const detail = (await request(server).get(`/cases/${target.caseId}`).expect(200)).body as {
      history: { kind: string; description: string }[];
    };
    expect(detail.history).toContainEqual(
      expect.objectContaining({
        kind: 'INVESTIGATION',
        description: 'Investigação do agente DONE: sugeriu MARK_ORDER_PAID',
      }),
    );
  });
});
