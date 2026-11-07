import { createHmac } from 'node:crypto';
import { SIGNATURE_HEADER } from '@reconcilia/shared';
import type { Transport } from './deliver.js';

/** `sha256=<hex>`: HMAC-SHA256 do corpo bruto. */
export function sign(secret: string, rawBody: string): string {
  return `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
}

/** Envia por HTTP para a api, assinando cada corpo. */
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
