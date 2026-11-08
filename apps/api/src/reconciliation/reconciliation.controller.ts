import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { type ReconciliationResult, ReconciliationResultSchema } from '@reconcilia/shared';
import { toOpenApiSchema } from '../common/openapi.js';
import { ReconciliationService } from './reconciliation.service.js';

@ApiTags('casos')
@Controller('reconcile')
export class ReconciliationController {
  constructor(private readonly reconciliation: ReconciliationService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Roda a conciliação agora',
    description:
      'Compara loja, gateway (extrato) e ERP e abre um caso por divergência. Idempotente: ' +
      'divergência que já tem caso aberto é contada em alreadyOpen e não gera caso novo.',
  })
  @ApiOkResponse({
    description: 'Resultado da rodada',
    schema: toOpenApiSchema(ReconciliationResultSchema),
  })
  @ApiInternalServerErrorResponse({ description: 'Falha ao conciliar' })
  reconcile(): Promise<ReconciliationResult> {
    return this.reconciliation.run();
  }
}
