import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  type GatewayStatementPage,
  GatewayStatementPageSchema,
  type GatewayStatementQuery,
  GatewayStatementQuerySchema,
  type GatewayStatementUpload,
  GatewayStatementUploadSchema,
  type WebhookAck,
  WebhookAckSchema,
} from '@reconcilia/shared';
import { toOpenApiSchema } from '../common/openapi.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { GatewayStatementService } from './gateway-statement.service.js';

@ApiTags('simulador')
@ApiBadRequestResponse({ description: 'Entrada fora do contrato' })
@Controller('sim/gateway/statement')
export class GatewayStatementController {
  constructor(private readonly statement: GatewayStatementService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Publica linhas do extrato do gateway simulado',
    description: 'Idempotente por chargeId: reenviar a mesma linha não duplica o extrato.',
  })
  @ApiBody({ schema: toOpenApiSchema(GatewayStatementUploadSchema) })
  @ApiAcceptedResponse({
    description: 'Linhas recebidas',
    schema: toOpenApiSchema(WebhookAckSchema),
  })
  async upload(
    @Body(new ZodValidationPipe(GatewayStatementUploadSchema)) body: GatewayStatementUpload,
  ): Promise<WebhookAck> {
    await this.statement.upload(body.entries);
    return { received: true };
  }

  @Get()
  @ApiOperation({
    summary: 'Consulta o extrato do gateway simulado',
    description: 'Usado pela conciliação para achar capturas cujo webhook se perdeu.',
  })
  @ApiQuery({ name: 'orderReference', required: false, description: 'Filtra por pedido' })
  @ApiQuery({ name: 'limit', required: false, description: '1 a 1000 (padrão 100)' })
  @ApiQuery({ name: 'offset', required: false, description: 'Padrão 0' })
  @ApiOkResponse({
    description: 'Página do extrato',
    schema: toOpenApiSchema(GatewayStatementPageSchema),
  })
  list(
    @Query(new ZodValidationPipe(GatewayStatementQuerySchema)) query: GatewayStatementQuery,
  ): Promise<GatewayStatementPage> {
    return this.statement.list(query);
  }
}
