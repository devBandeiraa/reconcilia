import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type HealthResponse, HealthResponseSchema } from '@reconcilia/shared';
import { toOpenApiSchema } from '../common/openapi.js';
import { API_VERSION } from '../version.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Verifica se a api está no ar' })
  @ApiOkResponse({ description: 'API no ar', schema: toOpenApiSchema(HealthResponseSchema) })
  check(): HealthResponse {
    return HealthResponseSchema.parse({
      status: 'ok',
      service: 'reconcilia-api',
      version: API_VERSION,
      timestamp: new Date().toISOString(),
    });
  }
}
