import type { IncomingMessage } from 'node:http';
import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  type RawBodyRequest,
  UnauthorizedException,
} from '@nestjs/common';
import { SIGNATURE_HEADER } from '@reconcilia/shared';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { verifyWebhookSignature } from './webhook-signature.js';

/**
 * Recusa (401) qualquer chamada sem `X-Signature` válido e dentro da janela de tempo
 * (WEBHOOK_TOLERANCE_SECONDS). Roda antes da validação do corpo e de qualquer gravação: com
 * assinatura inválida ou antiga, nada chega ao banco.
 */
@Injectable()
export class WebhookSignatureGuard implements CanActivate {
  constructor(@Inject(ENV) private readonly env: Env) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RawBodyRequest<IncomingMessage>>();
    const header = request.headers[SIGNATURE_HEADER];
    if (typeof header !== 'string' || !request.rawBody) {
      throw new UnauthorizedException('Assinatura X-Signature ausente');
    }
    const check = verifyWebhookSignature(
      this.env.WEBHOOK_SECRET,
      request.rawBody,
      header,
      this.env.WEBHOOK_TOLERANCE_SECONDS,
    );
    if (!check.ok) {
      throw new UnauthorizedException(
        check.reason === 'fora-da-janela'
          ? `Assinatura X-Signature fora da janela de ${this.env.WEBHOOK_TOLERANCE_SECONDS}s`
          : 'Assinatura X-Signature inválida (esperado t=<unix>,v1=<hmac>)',
      );
    }
    return true;
  }
}
