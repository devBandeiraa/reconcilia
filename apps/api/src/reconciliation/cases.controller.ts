import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  CASE_STATUSES,
  CASE_TYPES,
  type CaseDetail,
  CaseDetailSchema,
  type CaseListQuery,
  CaseListQuerySchema,
  type CasePage,
  CasePageSchema,
} from '@reconcilia/shared';
import { z } from 'zod';
import { toOpenApiSchema } from '../common/openapi.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CasesService } from './cases.service.js';

@ApiTags('casos')
@ApiBadRequestResponse({ description: 'Parâmetro inválido' })
@Controller('cases')
export class CasesController {
  constructor(private readonly cases: CasesService) {}

  @Get()
  @ApiOperation({
    summary: 'Lista os casos de divergência',
    description: 'Mais recentes primeiro. Filtros por tipo e status, com paginação.',
  })
  @ApiQuery({ name: 'type', required: false, enum: CASE_TYPES })
  @ApiQuery({ name: 'status', required: false, enum: CASE_STATUSES })
  @ApiQuery({ name: 'limit', required: false, description: '1 a 200 (padrão 50)' })
  @ApiQuery({ name: 'offset', required: false, description: 'Padrão 0' })
  @ApiOkResponse({ description: 'Página de casos', schema: toOpenApiSchema(CasePageSchema) })
  list(@Query(new ZodValidationPipe(CaseListQuerySchema)) query: CaseListQuery): Promise<CasePage> {
    return this.cases.list(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Detalhe de um caso',
    description:
      'Pedido, linha do tempo dos três lados (loja, gateway, extrato e ERP) em ordem ' +
      'cronológica, em UTC, e o histórico do caso.',
  })
  @ApiParam({ name: 'id', description: 'UUID do caso' })
  @ApiOkResponse({ description: 'Caso', schema: toOpenApiSchema(CaseDetailSchema) })
  @ApiNotFoundResponse({ description: 'Caso não encontrado' })
  detail(@Param('id', new ZodValidationPipe(z.uuid())) id: string): Promise<CaseDetail> {
    return this.cases.detail(id);
  }
}
