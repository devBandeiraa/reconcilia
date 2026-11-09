import { SIGNATURE_HEADER } from '@reconcilia/shared';
import type { DocumentBuilder } from '@nestjs/swagger';

/** Nome do esquema de segurança das decisões (token de operador) no OpenAPI. */
export const OPERATOR_TOKEN = 'operatorToken';

/** Documenta o token de operador das decisões (POST /session). */
export function addOperatorToken(builder: DocumentBuilder): DocumentBuilder {
  return builder.addBearerAuth(
    {
      type: 'http',
      scheme: 'bearer',
      description:
        'Token de operador emitido por POST /session (HMAC, 24h). Identificação de demonstração, ' +
        'não autenticação real.',
    },
    OPERATOR_TOKEN,
  );
}

/** Nome do esquema de segurança dos webhooks no OpenAPI. */
export const WEBHOOK_SIGNATURE = 'webhookSignature';

/** Documenta a assinatura HMAC dos webhooks, com timestamp assinado. */
export function addWebhookSignature(builder: DocumentBuilder): DocumentBuilder {
  return builder.addApiKey(
    {
      type: 'apiKey',
      in: 'header',
      name: SIGNATURE_HEADER,
      description:
        '`t=<unix>,v1=<hex>`: v1 é o HMAC-SHA256 de `<t>.<corpo bruto>` com o WEBHOOK_SECRET. ' +
        'Assinatura com mais de WEBHOOK_TOLERANCE_SECONDS (padrão 300) de diferença do relógio ' +
        'da api é recusada com 401, mesmo com o HMAC certo.',
    },
    WEBHOOK_SIGNATURE,
  );
}
