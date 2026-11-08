import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { type CaseType, type Investigation, InvestigationSchema } from '@reconcilia/shared';
import request from 'supertest';
import type { LlmClient, LlmRequest, LlmTurn } from '../../src/agent/llm/llm-client.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { waitFor } from './test-app.js';

/** LlmClient trocável a cada teste, com o app montado uma vez só. */
export class SwitchableLlm implements LlmClient {
  readonly name = 'switchable';
  impl: LlmClient | null = null;

  next(request: LlmRequest): Promise<LlmTurn> {
    if (!this.impl) return Promise.reject(new Error('SwitchableLlm sem implementação'));
    return this.impl.next(request);
  }
}

export const READ_ALL: LlmTurn = {
  toolCalls: ['getOrder', 'getGatewayEvents', 'getGatewayStatement', 'getErpEvents'].map(
    (name, i) => ({ id: `call-${i}`, name, args: {} }),
  ),
};

export const submit = (args: Record<string, unknown>): LlmTurn => ({
  toolCalls: [{ id: 'call-submit', name: 'submitDiagnosis', args }],
});

export interface CaseUnderTest {
  caseId: string;
  orderExternalId: string;
  chargeId: string;
  capturedCents: number;
  erpCents: number;
  duplicateEventId: string | null;
}

/** Um caso do tipo pedido, com os dados reais que um diagnóstico correto citaria. */
export async function caseOf(
  prisma: PrismaClient,
  type: CaseType,
  skip = 0,
): Promise<CaseUnderTest> {
  const row = await prisma.case.findFirstOrThrow({
    where: { type, status: 'OPEN' },
    orderBy: { id: 'asc' },
    skip,
    include: { order: true },
  });
  const ref = row.order.externalId;
  const [capture, erp, duplicate] = await Promise.all([
    prisma.simGatewayStatementEntry.findFirstOrThrow({ where: { orderExternalId: ref } }),
    prisma.erpEvent.aggregate({
      where: { orderExternalId: ref, type: 'PAYMENT_RECORDED' },
      _sum: { amountCents: true },
    }),
    prisma.paymentEvent.findFirst({
      where: { orderExternalId: ref, receivedCount: { gt: 1 } },
      orderBy: { receivedCount: 'desc' },
    }),
  ]);
  return {
    caseId: row.id,
    orderExternalId: ref,
    chargeId: capture.chargeId,
    capturedCents: capture.amountCents,
    erpCents: erp._sum.amountCents ?? 0,
    duplicateEventId: duplicate?.eventId ?? null,
  };
}

/** O diagnóstico correto para cada tipo, com params que existem nos dados. */
export function correctDiagnosis(type: CaseType, c: CaseUnderTest): Record<string, unknown> {
  const base = {
    diagnosis: `Investigação do pedido ${c.orderExternalId} com dados das ferramentas.`,
    evidence: [`extrato: ${c.chargeId} capturado ${c.capturedCents}`],
    confidence: 0.9,
  };
  switch (type) {
    case 'PAYMENT_WITHOUT_ORDER':
      return {
        ...base,
        suggestedAction: { kind: 'MARK_ORDER_PAID', params: { chargeId: c.chargeId } },
      };
    case 'DUPLICATE_WEBHOOK':
      return {
        ...base,
        suggestedAction: { kind: 'IGNORE_DUPLICATE', params: { eventId: c.duplicateEventId } },
      };
    case 'AMOUNT_MISMATCH':
      return {
        ...base,
        suggestedAction: {
          kind: 'FLAG_ERP_DIVERGENCE',
          params: { expectedCents: c.capturedCents, erpCents: c.erpCents },
        },
      };
  }
}

export const EXPECTED_ACTION: Record<CaseType, string> = {
  PAYMENT_WITHOUT_ORDER: 'MARK_ORDER_PAID',
  DUPLICATE_WEBHOOK: 'IGNORE_DUPLICATE',
  AMOUNT_MISMATCH: 'FLAG_ERP_DIVERGENCE',
};

/** Pede a investigação e espera o worker terminar. */
export async function investigate(app: INestApplication, caseId: string): Promise<Investigation> {
  const server = app.getHttpServer() as Server;
  const res = await request(server).post(`/cases/${caseId}/investigate`).expect(202);
  const { investigationId } = res.body as { investigationId: string };
  return waitFor(
    async () =>
      InvestigationSchema.parse(
        (await request(server).get(`/investigations/${investigationId}`).expect(200)).body,
      ),
    (inv) => inv.status === 'DONE' || inv.status === 'FAILED',
  );
}
