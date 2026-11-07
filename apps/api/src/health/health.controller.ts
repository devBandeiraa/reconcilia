import { Controller, Get } from '@nestjs/common';
import {
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { type HealthResponse, HealthResponseSchema } from '@reconcilia/shared';
import { toOpenApiSchema } from '../common/openapi.js';
import { API_VERSION } from '../version.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({
    summary: 'Verifica se a api está no ar',
    description: 'Usado pela web e pelo monitoramento do deploy. Não consulta o banco.',
  })
  @ApiOkResponse({ description: 'API no ar', schema: toOpenApiSchema(HealthResponseSchema) })
  @ApiInternalServerErrorResponse({ description: 'A api está no ar, mas com erro interno' })
  check(): HealthResponse {
    return HealthResponseSchema.parse({
      status: 'ok',
      service: 'reconcilia-api',
      version: API_VERSION,
      timestamp: new Date().toISOString(),
    });
  }
}
