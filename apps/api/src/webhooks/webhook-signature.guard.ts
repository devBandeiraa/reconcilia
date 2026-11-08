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
import { isValidSignature } from './webhook-signature.js';

/**
 * Recusa (401) qualquer chamada sem `X-Signature` válido. Roda antes da validação do corpo e de
 * qualquer gravação: com assinatura inválida, nada chega ao banco.
 */
@Injectable()
export class WebhookSignatureGuard implements CanActivate {
  constructor(@Inject(ENV) private readonly env: Env) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RawBodyRequest<IncomingMessage>>();
    const header = request.headers[SIGNATURE_HEADER];
    if (
      typeof header !== 'string' ||
      !request.rawBody ||
      !isValidSignature(this.env.WEBHOOK_SECRET, request.rawBody, header)
    ) {
      throw new UnauthorizedException('Assinatura X-Signature ausente ou inválida');
    }
    return true;
  }
}
