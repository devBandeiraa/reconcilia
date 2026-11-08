import { createHmac, timingSafeEqual } from 'node:crypto';

/** `sha256=<hex>`: HMAC-SHA256 do corpo bruto com o segredo. Mesmo formato do simulador. */
export function signBody(secret: string, rawBody: Buffer | string): string {
  return `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
}

/** Compara em tempo constante. Tamanhos diferentes já são inválidos (e não vazam o conteúdo). */
export function isValidSignature(secret: string, rawBody: Buffer, header: string): boolean {
  const expected = Buffer.from(signBody(secret, rawBody));
  const received = Buffer.from(header);
  return expected.length === received.length && timingSafeEqual(expected, received);
}
