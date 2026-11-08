import { readFileSync } from 'node:fs';
import { Inject, Injectable } from '@nestjs/common';
import type { Diagnosis, InvestigationStep } from '@reconcilia/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  GATEWAY_STATEMENT_SOURCE,
  type GatewayStatementSource,
} from '../reconciliation/gateway-statement.source.js';
import { checkDiagnosis, loadFacts } from './diagnosis-check.js';
import {
  type AgentMessage,
  LLM_CLIENT,
  type LlmClient,
  LlmQuotaError,
  type ToolResult,
} from './llm/llm-client.js';
import { readOnly } from './read-only.js';
import { type CaseContext, READ_TOOLS, SUBMIT_DIAGNOSIS, TOOL_DECLARATIONS } from './tools.js';

/** Limite de chamadas ao modelo por investigação. */
export const MAX_ROUNDS = 8;
/** Diagnósticos inválidos aceitos antes de desistir (o primeiro volta com o erro). */
const MAX_INVALID_DIAGNOSES = 2;

export const PROMPT_VERSION = 'system.v1';
export const SYSTEM_PROMPT = readFileSync(
  new URL(`./prompts/${PROMPT_VERSION}.md`, import.meta.url),
  'utf8',
);

const CASE_DESCRIPTIONS: Record<CaseContext['caseType'], string> = {
  PAYMENT_WITHOUT_ORDER:
    'o extrato do gateway mostra uma captura, mas o pedido segue PENDING e nenhum webhook de captura chegou',
  DUPLICATE_WEBHOOK: 'um webhook do gateway chegou mais de uma vez',
  AMOUNT_MISMATCH: 'valor capturado, total do pedido e valor do ERP não batem',
};

export type AgentOutcome =
  | { status: 'DONE'; diagnosis: Diagnosis; steps: InvestigationStep[]; rounds: number }
  | { status: 'FAILED'; failureReason: string; steps: InvestigationStep[]; rounds: number };

/**
 * Loop de function calling. O modelo só lê (ferramentas em transação READ ONLY) e entrega um
 * diagnóstico; quem grava qualquer coisa é o backend, depois, a partir do resultado.
 */
@Injectable()
export class AgentRunner {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(GATEWAY_STATEMENT_SOURCE) private readonly statement: GatewayStatementSource,
    @Inject(LLM_CLIENT) private readonly llm: LlmClient,
  ) {}

  async run(context: CaseContext): Promise<AgentOutcome> {
    const steps: InvestigationStep[] = [];
    const messages: AgentMessage[] = [
      {
        role: 'user',
        text:
          `Tipo do caso: ${context.caseType}\n` +
          `Divergência detectada: ${CASE_DESCRIPTIONS[context.caseType]}.\n` +
          `Caso aberto em: ${context.detectedAt.toISOString()}\n` +
          'Investigue com as ferramentas e termine chamando submitDiagnosis.',
      },
    ];
    let invalidDiagnoses = 0;

    for (let round = 1; round <= MAX_ROUNDS; round++) {
      let turn;
      try {
        turn = await this.llm.next({ system: SYSTEM_PROMPT, messages, tools: TOOL_DECLARATIONS });
      } catch (error) {
        const reason =
          error instanceof LlmQuotaError
            ? error.message
            : `Erro do modelo (${this.llm.name}): ${error instanceof Error ? error.message : String(error)}`;
        return { status: 'FAILED', failureReason: reason, steps, rounds: round };
      }
      messages.push({ role: 'model', toolCalls: turn.toolCalls, text: turn.text, raw: turn.raw });

      if (turn.toolCalls.length === 0) {
        messages.push({
          role: 'user',
          text: 'Responda chamando as ferramentas; termine com submitDiagnosis.',
        });
        continue;
      }

      const results: ToolResult[] = [];
      for (const call of turn.toolCalls) {
        const step = (summary: string) =>
          steps.push({
            round,
            tool: call.name,
            args: call.args,
            summary,
            at: new Date().toISOString(),
          });

        if (call.name === SUBMIT_DIAGNOSIS) {
          const facts = await readOnly(this.prisma, (tx) =>
            loadFacts(tx, this.statement, context.orderExternalId),
          );
          const check = checkDiagnosis(call.args, facts);
          if (check.ok) {
            step(`diagnóstico aceito: ${check.value.suggestedAction.kind}`);
            return { status: 'DONE', diagnosis: check.value, steps, rounds: round };
          }
          step(`diagnóstico recusado: ${check.error}`);
          invalidDiagnoses++;
          if (invalidDiagnoses >= MAX_INVALID_DIAGNOSES) {
            return {
              status: 'FAILED',
              failureReason: `Diagnóstico inválido duas vezes. Último erro: ${check.error}`,
              steps,
              rounds: round,
            };
          }
          results.push({
            callId: call.id,
            name: call.name,
            output: { error: check.error, instruction: 'Corrija e chame submitDiagnosis de novo.' },
          });
          continue;
        }

        const tool = READ_TOOLS[call.name];
        if (!tool) {
          step('ferramenta desconhecida');
          results.push({
            callId: call.id,
            name: call.name,
            output: { error: 'ferramenta desconhecida' },
          });
          continue;
        }
        const output = await readOnly(this.prisma, (tx) =>
          tool.read({ tx, statement: this.statement, context }),
        );
        step(tool.summarize(output));
        results.push({ callId: call.id, name: call.name, output });
      }
      messages.push({ role: 'tool', results });
    }

    return {
      status: 'FAILED',
      failureReason: `Limite de ${MAX_ROUNDS} rodadas atingido sem um diagnóstico válido`,
      steps,
      rounds: MAX_ROUNDS,
    };
  }
}
