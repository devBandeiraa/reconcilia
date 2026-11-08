/**
 * Interface neutra entre o agente e o modelo. O loop do agente só conhece estes tipos: trocar
 * Gemini por outro provedor (ou por um roteiro nos testes) não muda nada fora daqui.
 */
export const LLM_CLIENT = Symbol('LLM_CLIENT');

/** Declaração de uma ferramenta: nome, descrição e parâmetros em JSON Schema. */
export interface ToolDeclaration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  /** Id da chamada, quando o provedor dá um (o Gemini casa a resposta por ele). */
  id?: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ToolResult {
  callId?: string;
  name: string;
  output: unknown;
}

export type AgentMessage =
  | { role: 'user'; text: string }
  /** `raw` guarda a resposta original do provedor (ex.: o thoughtSignature do Gemini). */
  | { role: 'model'; toolCalls: ToolCall[]; text?: string; raw?: unknown }
  | { role: 'tool'; results: ToolResult[] };

export interface LlmRequest {
  system: string;
  messages: AgentMessage[];
  tools: ToolDeclaration[];
}

export interface LlmTurn {
  toolCalls: ToolCall[];
  text?: string;
  raw?: unknown;
}

export interface LlmClient {
  /** Nome curto do cliente (gemini, replay, fake), registrado na investigação. */
  readonly name: string;
  next(request: LlmRequest): Promise<LlmTurn>;
}

/** Cota do provedor esgotada (HTTP 429): a investigação falha com motivo claro, sem retry. */
export class LlmQuotaError extends Error {
  constructor(detail: string) {
    super(`Cota do modelo esgotada (429). Tente mais tarde ou use DEMO_REPLAY=true. ${detail}`);
    this.name = 'LlmQuotaError';
  }
}

/** Qualquer outra falha do provedor (rede, 5xx, resposta inesperada). */
export class LlmError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'LlmError';
  }
}
