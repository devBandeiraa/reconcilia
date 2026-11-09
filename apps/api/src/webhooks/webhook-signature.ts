import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Assinatura dos webhooks no formato do Stripe: `X-Signature: t=<unix>,v1=<hex>`, com
 * v1 = HMAC-SHA256 de `${t}.${corpo bruto}`. Assinar o timestamp junto impede reaproveitar uma
 * assinatura antiga: fora da janela de tolerância, a requisição é recusada mesmo com o HMAC certo.
 * Aceita mais de um v1 (troca de segredo sem janela de indisponibilidade).
 */
export type SignatureCheck =
  { ok: true; timestamp: number } | { ok: false; reason: 'formato' | 'fora-da-janela' | 'hmac' };

/** HMAC-SHA256 em hex de `${timestamp}.${rawBody}`. */
export function webhookHmac(secret: string, timestamp: number, rawBody: Buffer | string): string {
  return createHmac('sha256', secret).update(`${timestamp}.`).update(rawBody).digest('hex');
}

function parseHeader(header: string): { timestamp: number; signatures: string[] } | null {
  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of header.split(',')) {
    const separator = part.indexOf('=');
    if (separator <= 0) return null;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key === 't') {
      if (timestamp !== null || !/^\d{1,12}$/.test(value)) return null;
      timestamp = Number(value);
    } else if (key === 'v1') {
      if (!/^[0-9a-f]{64}$/.test(value)) return null;
      signatures.push(value);
    }
    // Outras chaves (ex.: um v0 antigo) são ignoradas, como no Stripe.
  }
  return timestamp !== null && signatures.length > 0 ? { timestamp, signatures } : null;
}

/**
 * Confere o header. Ordem: formato, janela de tempo (passado ou futuro) e, por último, o HMAC em
 * tempo constante contra cada v1.
 */
export function verifyWebhookSignature(
  secret: string,
  rawBody: Buffer,
  header: string,
  toleranceSeconds: number,
  now: Date = new Date(),
): SignatureCheck {
  const parsed = parseHeader(header);
  if (!parsed) return { ok: false, reason: 'formato' };

  const nowSeconds = Math.floor(now.getTime() / 1000);
  if (Math.abs(nowSeconds - parsed.timestamp) > toleranceSeconds) {
    return { ok: false, reason: 'fora-da-janela' };
  }

  const expected = Buffer.from(webhookHmac(secret, parsed.timestamp, rawBody), 'hex');
  const matches = parsed.signatures.some((signature) =>
    timingSafeEqual(expected, Buffer.from(signature, 'hex')),
  );
  return matches ? { ok: true, timestamp: parsed.timestamp } : { ok: false, reason: 'hmac' };
}
