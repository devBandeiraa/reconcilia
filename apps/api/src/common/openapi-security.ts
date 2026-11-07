import { SIGNATURE_HEADER } from '@reconcilia/shared';
import type { DocumentBuilder } from '@nestjs/swagger';

/** Nome do esquema de segurança dos webhooks no OpenAPI. */
export const WEBHOOK_SIGNATURE = 'webhookSignature';

/** Documenta a assinatura HMAC dos webhooks. A verificação (401) entra na v0.4.0. */
export function addWebhookSignature(builder: DocumentBuilder): DocumentBuilder {
  return builder.addApiKey(
    {
      type: 'apiKey',
      in: 'header',
      name: SIGNATURE_HEADER,
      description:
        '`sha256=<hex>`: HMAC-SHA256 do corpo bruto com o WEBHOOK_SECRET. ' +
        'Enviada pelo simulador; verificada pela api a partir da v0.4.0.',
    },
    WEBHOOK_SIGNATURE,
  );
}
