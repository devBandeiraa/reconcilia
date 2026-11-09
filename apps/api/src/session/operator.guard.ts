import type { IncomingMessage } from 'node:http';
import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { verifyOperatorToken } from './operator-token.js';

type RequestWithOperator = IncomingMessage & { operator?: string };

/**
 * Exige `Authorization: Bearer <token de operador>` válido e não expirado (401 se não). O nome do
 * operador fica na requisição e é ele, não o corpo, que vai para decidedBy e para a auditoria.
 */
@Injectable()
export class OperatorGuard implements CanActivate {
  constructor(@Inject(ENV) private readonly env: Env) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithOperator>();
    const match = /^Bearer (\S+)$/.exec(request.headers.authorization ?? '');
    const operator = match?.[1] ? verifyOperatorToken(this.env.SESSION_SECRET, match[1]) : null;
    if (!operator) {
      throw new UnauthorizedException(
        'Token de operador ausente, inválido ou expirado. Escolha um nome em POST /session.',
      );
    }
    request.operator = operator;
    return true;
  }
}

/** O operador autenticado pelo OperatorGuard. */
export const Operator = createParamDecorator(
  (_: unknown, context: ExecutionContext): string =>
    context.switchToHttp().getRequest<RequestWithOperator>().operator!,
);
