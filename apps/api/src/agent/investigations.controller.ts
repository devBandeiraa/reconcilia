import { Controller, Get, HttpCode, HttpStatus, Param, Post, Res } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import {
  type InvestigateResponse,
  InvestigateResponseSchema,
  type Investigation,
  InvestigationSchema,
} from '@reconcilia/shared';
import { z } from 'zod';
import { toOpenApiSchema } from '../common/openapi.js';
import { HeavyRoute } from '../common/throttle.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { InvestigationsService } from './investigations.service.js';

interface JsonResponse {
  status(code: number): { json(body: InvestigateResponse): void };
}

const UUID = new ZodValidationPipe(z.uuid());

@ApiTags('agente')
@ApiBadRequestResponse({ description: 'Id inválido' })
@Controller()
export class InvestigationsController {
  constructor(private readonly investigations: InvestigationsService) {}

  @Post('cases/:id/investigate')
  @HttpCode(HttpStatus.ACCEPTED)
  @HeavyRoute()
  @ApiTooManyRequestsResponse({ description: 'Limite por IP ou teto diário da demo atingido' })
  @ApiOperation({
    summary: 'Pede ao agente de IA que investigue o caso',
    description:
      'Cria a investigação (QUEUED) e enfileira; o worker roda o agente. Se o caso já tem uma ' +
      'investigação ativa, devolve ela com 200. Acompanhe por GET /investigations/:id.',
  })
  @ApiParam({ name: 'id', description: 'UUID do caso' })
  @ApiAcceptedResponse({
    description: 'Investigação criada',
    schema: toOpenApiSchema(InvestigateResponseSchema),
  })
  @ApiOkResponse({
    description: 'Já havia uma investigação ativa',
    schema: toOpenApiSchema(InvestigateResponseSchema),
  })
  @ApiNotFoundResponse({ description: 'Caso não encontrado' })
  @ApiConflictResponse({ description: 'O caso não está OPEN' })
  async investigate(@Param('id', UUID) caseId: string, @Res() res: JsonResponse): Promise<void> {
    const result = await this.investigations.start(caseId);
    res
      .status(result.created ? HttpStatus.ACCEPTED : HttpStatus.OK)
      .json({ investigationId: result.investigationId, status: result.status });
  }

  @Get('investigations/:id')
  @ApiOperation({
    summary: 'Estado e resultado de uma investigação',
    description:
      'Passos do agente (ferramenta, argumentos, resumo), diagnóstico, evidências, ação sugerida, ' +
      'confiança e a ação criada para aprovação. Use para polling enquanto está QUEUED/RUNNING.',
  })
  @ApiParam({ name: 'id', description: 'UUID da investigação' })
  @ApiOkResponse({ description: 'Investigação', schema: toOpenApiSchema(InvestigationSchema) })
  @ApiNotFoundResponse({ description: 'Investigação não encontrada' })
  get(@Param('id', UUID) id: string): Promise<Investigation> {
    return this.investigations.get(id);
  }
}
