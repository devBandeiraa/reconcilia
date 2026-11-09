import { createHmac, timingSafeEqual } from 'node:crypto';
import { SESSION_TTL_SECONDS } from '@reconcilia/shared';
import { z } from 'zod';

/**
 * Token de operador da demo: `<payload>.<assinatura>`, os dois em base64url. O payload é
 * `{ op, exp }` (nome e expiração em segundos Unix); a assinatura é HMAC-SHA256 do payload com o
 * SESSION_SECRET. Sem dependência: só node:crypto.
 */
const PayloadSchema = z.strictObject({
  op: z.string().min(1).max(60),
  exp: z.number().int(),
});

export interface OperatorToken {
  token: string;
  operator: string;
  expiresAt: Date;
}

function hmac(secret: string, payload: string): Buffer {
  return createHmac('sha256', secret).update(payload).digest();
}

export function issueOperatorToken(
  secret: string,
  operator: string,
  now: Date = new Date(),
  ttlSeconds: number = SESSION_TTL_SECONDS,
): OperatorToken {
  const exp = Math.floor(now.getTime() / 1000) + ttlSeconds;
  const payload = Buffer.from(JSON.stringify({ op: operator, exp })).toString('base64url');
  const signature = hmac(secret, payload).toString('base64url');
  return { token: `${payload}.${signature}`, operator, expiresAt: new Date(exp * 1000) };
}

/** O operador do token, ou null se a assinatura não bate, o formato é inválido ou expirou. */
export function verifyOperatorToken(
  secret: string,
  token: string,
  now: Date = new Date(),
): string | null {
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra !== undefined) return null;

  const expected = hmac(secret, payload);
  const received = Buffer.from(signature, 'base64url');
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  const parsed = PayloadSchema.safeParse(decoded);
  if (!parsed.success) return null;
  if (parsed.data.exp <= Math.floor(now.getTime() / 1000)) return null;
  return parsed.data.op;
}
