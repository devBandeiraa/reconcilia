import { Controller, Get } from '@nestjs/common';
import {
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { type LedgerBalance, LedgerBalanceSchema } from '@reconcilia/shared';
import { toOpenApiSchema } from '../common/openapi.js';
import { LedgerService } from './ledger.service.js';

@ApiTags('ledger')
@Controller('ledger')
export class LedgerController {
  constructor(private readonly ledger: LedgerService) {}

  @Get('balance')
  @ApiOperation({
    summary: 'Saldo do ledger por conta',
    description:
      'Débitos, créditos e saldo (débitos - créditos) de cada conta. Em partidas dobradas, o ' +
      'total é sempre 0; qualquer outro valor indica um defeito.',
  })
  @ApiOkResponse({ description: 'Saldos', schema: toOpenApiSchema(LedgerBalanceSchema) })
  @ApiInternalServerErrorResponse({ description: 'Falha ao ler o ledger' })
  balance(): Promise<LedgerBalance> {
    return this.ledger.balance();
  }
}
