import type { z } from 'zod';
import { env } from '@/env';

/** Resposta da api fora de 2xx, com a mensagem que ela devolveu. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function messageFrom(body: unknown, status: number): string {
  const message = (body as { message?: unknown } | null)?.message;
  if (typeof message === 'string') return message;
  if (Array.isArray(message)) return message.join('; ');
  return `A api respondeu ${status}`;
}

interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  signal?: AbortSignal;
  /** Token de operador (POST /session), mandado em Authorization: Bearer. */
  token?: string;
}

/** Chama a api e valida a resposta com o schema de packages/shared. */
export async function apiRequest<T>(
  path: string,
  schema: z.ZodType<T>,
  { method = 'GET', body, signal, token }: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`${env.apiUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
    cache: 'no-store',
  });
  const text = await response.text();
  const json: unknown = text ? JSON.parse(text) : null;
  if (!response.ok) throw new ApiError(response.status, messageFrom(json, response.status));
  return schema.parse(json);
}

/** Erro de rede ou 502/503/504: típico do servidor acordando (Render Free dorme). */
export function isWakingError(error: unknown): boolean {
  return !(error instanceof ApiError) || error.status >= 502;
}
