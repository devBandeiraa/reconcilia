import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import {
  type ActionDecision,
  ActionDecisionSchema,
  type ActionView,
  ActionViewSchema,
  type DecisionRequest,
  DecisionRequestSchema,
  type RejectRequest,
  RejectRequestSchema,
} from '@reconcilia/shared';
import { z } from 'zod';
import { toOpenApiSchema } from '../common/openapi.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ActionsService } from './actions.service.js';

const UUID = new ZodValidationPipe(z.uuid());
const DECISION_SCHEMA = toOpenApiSchema(ActionDecisionSchema);

@ApiTags('aprovação')
@ApiParam({ name: 'id', description: 'UUID da ação' })
@ApiBadRequestResponse({ description: 'Id ou corpo inválido' })
@ApiNotFoundResponse({ description: 'Ação não encontrada' })
@Controller('actions')
export class ActionsController {
  constructor(private readonly actions: ActionsService) {}

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Aprova a ação sugerida pelo agente e o backend executa',
    description:
      'Idempotente: aprovar de novo (ou duas vezes ao mesmo tempo) executa uma única vez. Com a ' +
      'execução, o caso fica RESOLVED. Tudo vai para a trilha de auditoria.',
  })
  @ApiBody({ schema: toOpenApiSchema(DecisionRequestSchema) })
  @ApiOkResponse({ description: 'Ação aprovada e executada', schema: DECISION_SCHEMA })
  @ApiConflictResponse({ description: 'A ação já foi recusada' })
  @ApiUnprocessableEntityResponse({
    description: 'A execução falhou; nada foi alterado e a ação segue APPROVED',
  })
  approve(
    @Param('id', UUID) id: string,
    @Body(new ZodValidationPipe(DecisionRequestSchema)) body: DecisionRequest,
  ): Promise<ActionDecision> {
    return this.actions.approve(id, body.decidedBy);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Recusa a ação sugerida',
    description: 'Nada é executado; o caso continua OPEN e pode ser investigado de novo.',
  })
  @ApiBody({ schema: toOpenApiSchema(RejectRequestSchema) })
  @ApiOkResponse({ description: 'Ação recusada', schema: DECISION_SCHEMA })
  @ApiConflictResponse({ description: 'A ação já foi aprovada' })
  reject(
    @Param('id', UUID) id: string,
    @Body(new ZodValidationPipe(RejectRequestSchema)) body: RejectRequest,
  ): Promise<ActionDecision> {
    return this.actions.reject(id, body.decidedBy, body.reason);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Ação com a decisão, o resultado da execução e a trilha de auditoria' })
  @ApiOkResponse({ description: 'Ação', schema: toOpenApiSchema(ActionViewSchema) })
  get(@Param('id', UUID) id: string): Promise<ActionView> {
    return this.actions.get(id);
  }
}
