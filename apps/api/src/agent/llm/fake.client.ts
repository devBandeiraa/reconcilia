import type { LlmClient, LlmRequest, LlmTurn } from './llm-client.js';

/** Um passo do roteiro: a resposta pronta ou uma função que olha a conversa até aqui. */
export type ScriptStep = LlmTurn | ((request: LlmRequest) => LlmTurn | Promise<LlmTurn>);

/**
 * LlmClient roteirizado para os testes (que nunca chamam o modelo real). Cada chamada consome o
 * próximo passo; acabou o roteiro, repete o último.
 */
export class FakeLlmClient implements LlmClient {
  readonly name = 'fake';
  calls = 0;

  constructor(private readonly script: ScriptStep[]) {}

  async next(request: LlmRequest): Promise<LlmTurn> {
    const step = this.script[Math.min(this.calls, this.script.length - 1)];
    this.calls++;
    if (!step) throw new Error('FakeLlmClient sem roteiro');
    return typeof step === 'function' ? step(request) : step;
  }
}
