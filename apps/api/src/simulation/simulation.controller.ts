import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  type SimulationOptions,
  SimulationOptionsSchema,
  type SimulationResult,
  SimulationResultSchema,
} from '@reconcilia/shared';
import { z } from 'zod';
import { toOpenApiSchema } from '../common/openapi.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { SimulationService } from './simulation.service.js';

@ApiTags('simulador')
@Controller('simulate')
export class SimulationController {
  constructor(private readonly simulation: SimulationService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Gera tráfego com as 3 falhas e devolve o gabarito',
    description:
      'Mesmo gerador do CLI. Sem seed, sorteia uma; com a mesma seed, o cenário se repete ' +
      '(e o reenvio é idempotente).',
  })
  @ApiBody({ schema: toOpenApiSchema(SimulationOptionsSchema), required: false })
  @ApiOkResponse({
    description: 'Gabarito e totais enviados',
    schema: toOpenApiSchema(SimulationResultSchema),
  })
  @ApiBadRequestResponse({ description: 'Opções inválidas' })
  simulate(
    // Corpo vazio vale como "tudo no padrão".
    @Body(new ZodValidationPipe(z.preprocess((body) => body ?? {}, SimulationOptionsSchema)))
    options: SimulationOptions,
  ): Promise<SimulationResult> {
    return this.simulation.run(options);
  }
}
