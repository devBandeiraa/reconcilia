import { createHmac } from 'node:crypto';
import { SIGNATURE_HEADER } from '@reconcilia/shared';
import type { Transport } from './deliver.js';

/**
 * `t=<unix>,v1=<hex>`: v1 é o HMAC-SHA256 de `${t}.${corpo bruto}`. O timestamp vai assinado
 * junto, então uma assinatura antiga não serve para reenviar o corpo depois da janela da api.
 */
export function sign(secret: string, rawBody: string, now: Date = new Date()): string {
  const timestamp = Math.floor(now.getTime() / 1000);
  const v1 = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  return `t=${timestamp},v1=${v1}`;
}

/** Envia por HTTP para a api, assinando cada corpo na hora do envio. */
export function createHttpTransport(baseUrl: string, secret: string): Transport {
  return {
    async post(path, body) {
      const rawBody = JSON.stringify(body);
      const response = await fetch(new URL(path, baseUrl), {
        method: 'POST',
        headers: { 'content-type': 'application/json', [SIGNATURE_HEADER]: sign(secret, rawBody) },
        body: rawBody,
      });
      if (!response.ok) {
        throw new Error(`POST ${path} respondeu ${response.status}: ${await response.text()}`);
      }
    },
  };
}
