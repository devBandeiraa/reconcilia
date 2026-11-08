import { ApiError, type Content, FunctionCallingConfigMode, GoogleGenAI } from '@google/genai';
import {
  type AgentMessage,
  type LlmClient,
  LlmError,
  LlmQuotaError,
  type LlmRequest,
  type LlmTurn,
} from './llm-client.js';

/**
 * Retry do SDK, explícito. O padrão dele é 5 tentativas com espera de até 60s, inclusive no 429:
 * uma cota esgotada deixaria a investigação minutos em RUNNING. Aqui só erros transitórios do
 * servidor (5xx) são tentados de novo, com espera curta; 429 falha na hora, com o motivo.
 */
const HTTP_OPTIONS = {
  timeout: 60_000,
  retryOptions: {
    attempts: 3,
    initialDelay: 1,
    maxDelay: 8,
    httpStatusCodes: [500, 502, 503, 504],
  },
};

/**
 * Gemini via SDK oficial. Function calling em modo ANY: o modelo sempre responde chamando uma
 * ferramenta (as de leitura ou o submitDiagnosis), nunca com texto solto.
 */
export class GeminiClient implements LlmClient {
  readonly name = 'gemini';
  private readonly ai: GoogleGenAI;

  constructor(
    apiKey: string,
    private readonly model: string,
  ) {
    this.ai = new GoogleGenAI({ apiKey, httpOptions: HTTP_OPTIONS });
  }

  async next(request: LlmRequest): Promise<LlmTurn> {
    try {
      const response = await this.ai.models.generateContent({
        model: this.model,
        contents: request.messages.map(toContent),
        config: {
          systemInstruction: request.system,
          temperature: 0,
          tools: [
            {
              functionDeclarations: request.tools.map((tool) => ({
                name: tool.name,
                description: tool.description,
                parametersJsonSchema: tool.parameters,
              })),
            },
          ],
          toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.ANY } },
        },
      });

      const calls = response.functionCalls ?? [];
      return {
        toolCalls: calls.map((call) => ({
          ...(call.id ? { id: call.id } : {}),
          name: call.name ?? '',
          args: call.args ?? {},
        })),
        // Guarda o conteúdo original: modelos com "thinking" exigem o thoughtSignature de volta.
        raw: response.candidates?.[0]?.content,
      };
    } catch (error) {
      if (error instanceof ApiError && error.status === 429) {
        throw new LlmQuotaError(error.message);
      }
      throw new LlmError(
        `Falha ao chamar o Gemini: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }
}

function toContent(message: AgentMessage): Content {
  switch (message.role) {
    case 'user':
      return { role: 'user', parts: [{ text: message.text }] };
    case 'model':
      return (
        (message.raw as Content | undefined) ?? {
          role: 'model',
          parts: message.toolCalls.map((call) => ({
            functionCall: { ...(call.id ? { id: call.id } : {}), name: call.name, args: call.args },
          })),
        }
      );
    case 'tool':
      return {
        role: 'user',
        parts: message.results.map((result) => ({
          functionResponse: {
            ...(result.callId ? { id: result.callId } : {}),
            name: result.name,
            response: { output: result.output },
          },
        })),
      };
  }
}
