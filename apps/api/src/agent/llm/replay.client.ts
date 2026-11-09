import { readFileSync } from 'node:fs';
import { CASE_TYPES, type CaseType } from '@reconcilia/shared';
import type { AgentMessage, LlmClient, LlmRequest, LlmTurn } from './llm-client.js';

interface ReplayScript {
  rounds: string[][];
  diagnosis: unknown;
}

const SCRIPTS = JSON.parse(
  readFileSync(new URL('../fixtures/replay.v1.json', import.meta.url), 'utf8'),
) as Record<CaseType, ReplayScript>;

type Facts = Record<string, string | number>;

interface GatewayEvent {
  eventId: string;
  type: string;
  receivedCount: number;
  processedAt: string | null;
}

/** Junta o que as ferramentas devolveram na conversa até aqui. */
function collectOutputs(messages: AgentMessage[]): Record<string, Record<string, unknown>> {
  const outputs: Record<string, Record<string, unknown>> = {};
  for (const message of messages) {
    if (message.role !== 'tool') continue;
    for (const result of message.results)
      outputs[result.name] = result.output as Record<string, unknown>;
  }
  return outputs;
}

function factsFrom(outputs: Record<string, Record<string, unknown>>): Facts {
  const order = (outputs.getOrder ?? {}) as {
    externalId?: string;
    status?: string;
    totalCents?: number;
    installments?: number;
    canceledAt?: string | null;
  };
  const events = (outputs.getGatewayEvents?.events ?? []) as GatewayEvent[];
  const captures = (outputs.getGatewayStatement?.captures ?? []) as {
    chargeId: string;
    amountCents: number;
    capturedAt: string;
  }[];
  const erp = (outputs.getErpEvents?.events ?? []) as { type: string; amountCents: number }[];

  const capturedCents = captures.reduce((sum, c) => sum + c.amountCents, 0);
  const erpCents = erp
    .filter((e) => e.type === 'PAYMENT_RECORDED')
    .reduce((sum, e) => sum + e.amountCents, 0);
  const duplicate = [...events].sort((a, b) => b.receivedCount - a.receivedCount)[0];

  return {
    orderExternalId: order.externalId ?? '',
    orderStatus: order.status ?? '',
    totalCents: order.totalCents ?? 0,
    installments: order.installments ?? 0,
    canceledAt: order.canceledAt ?? 'não cancelado',
    chargeId: captures[0]?.chargeId ?? '',
    capturedAt: captures[0]?.capturedAt ?? '',
    capturedCents,
    erpCents,
    differenceCents: erpCents - capturedCents,
    gatewayEventTypes: events.map((e) => e.type).join(', ') || 'nenhum',
    duplicateEventId: duplicate?.eventId ?? '',
    duplicateCount: duplicate?.receivedCount ?? 0,
    duplicateProcessedAt: duplicate?.processedAt ?? 'não aplicado',
  };
}

/** Troca {{campo}} pelo dado. Um valor que é só "{{campo}}" numérico vira número. */
function fill(template: unknown, facts: Facts): unknown {
  if (typeof template === 'string') {
    const whole = /^\{\{(\w+)\}\}$/.exec(template);
    if (whole?.[1] && typeof facts[whole[1]] === 'number') return facts[whole[1]];
    return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
      String(facts[key] ?? `{{${key}}}`),
    );
  }
  if (Array.isArray(template)) return template.map((item) => fill(item, facts));
  if (template && typeof template === 'object') {
    return Object.fromEntries(Object.entries(template).map(([k, v]) => [k, fill(v, facts)]));
  }
  return template;
}

/**
 * Modo demonstração (DEMO_REPLAY=true): segue o roteiro do tipo do caso, sem chamar o Gemini.
 * As ferramentas rodam de verdade e o diagnóstico é preenchido com os dados delas, então ele
 * passa pela mesma validação de um diagnóstico real.
 */
export class ReplayLlmClient implements LlmClient {
  readonly name = 'replay';

  next(request: LlmRequest): Promise<LlmTurn> {
    const first = request.messages[0];
    const caseType = CASE_TYPES.find(
      (type) => first?.role === 'user' && first.text.includes(`Tipo do caso: ${type}`),
    );
    if (!caseType) return Promise.reject(new Error('Replay: tipo do caso não encontrado'));

    const script = SCRIPTS[caseType];
    const round = request.messages.filter((m) => m.role === 'model').length;
    const tools = script.rounds[round];
    if (tools) {
      return Promise.resolve({ toolCalls: tools.map((name) => ({ name, args: {} })) });
    }
    const facts = factsFrom(collectOutputs(request.messages));
    return Promise.resolve({
      toolCalls: [
        { name: 'submitDiagnosis', args: fill(script.diagnosis, facts) as Record<string, unknown> },
      ],
    });
  }
}
