import { Body, Controller, HttpCode, HttpStatus, Inject, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  type SessionRequest,
  SessionRequestSchema,
  type SessionResponse,
  SessionResponseSchema,
} from '@reconcilia/shared';
import { toOpenApiSchema } from '../common/openapi.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { issueOperatorToken } from './operator-token.js';

@ApiTags('aprovação')
@Controller('session')
export class SessionController {
  constructor(@Inject(ENV) private readonly env: Env) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Escolhe um nome de operador e recebe o token das decisões',
    description:
      'Identificação de demonstração, não autenticação: não há cadastro nem senha. O token ' +
      '(HMAC, válido por 24h) vai em `Authorization: Bearer` no aprovar e no recusar, e quem ' +
      'decide passa a ser o nome do token.',
  })
  @ApiBody({ schema: toOpenApiSchema(SessionRequestSchema) })
  @ApiOkResponse({ description: 'Token emitido', schema: toOpenApiSchema(SessionResponseSchema) })
  @ApiBadRequestResponse({ description: 'Nome vazio ou com mais de 60 caracteres' })
  create(@Body(new ZodValidationPipe(SessionRequestSchema)) body: SessionRequest): SessionResponse {
    const issued = issueOperatorToken(this.env.SESSION_SECRET, body.operator);
    return {
      token: issued.token,
      operator: issued.operator,
      expiresAt: issued.expiresAt.toISOString(),
    };
  }
}
