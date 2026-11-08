import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { type DeadLetterPage, DeadLetterPageSchema } from '@reconcilia/shared';
import { z } from 'zod';
import { toOpenApiSchema } from '../common/openapi.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { PAYMENT_EVENTS_DLQ, type PaymentEventJob } from './queue.constants.js';
import { QueueService } from './queue.service.js';

function describeError(output: unknown): string | null {
  if (output && typeof output === 'object' && 'message' in output) {
    return String(output.message);
  }
  return null;
}

@ApiTags('admin')
@Controller('admin/dlq')
export class DeadLetterController {
  constructor(private readonly queue: QueueService) {}

  @Get()
  @ApiOperation({
    summary: 'Lista os eventos que esgotaram as tentativas (dead letter queue)',
    description: 'Eventos do gateway que falharam em todas as tentativas de aplicação.',
  })
  @ApiQuery({ name: 'limit', required: false, description: '1 a 100 (padrão 50)' })
  @ApiOkResponse({ description: 'Jobs na DLQ', schema: toOpenApiSchema(DeadLetterPageSchema) })
  @ApiBadRequestResponse({ description: 'Parâmetro inválido' })
  async list(
    @Query(
      new ZodValidationPipe(
        z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) }),
      ),
    )
    query: {
      limit: number;
    },
  ): Promise<DeadLetterPage> {
    const jobs = await this.queue.boss.findJobs<PaymentEventJob>(PAYMENT_EVENTS_DLQ, {
      limit: query.limit,
    });
    return {
      limit: query.limit,
      data: jobs.map((job) => ({
        jobId: job.id,
        eventId: job.data.eventId,
        orderExternalId: job.data.orderExternalId,
        retryCount: job.retryCount,
        createdOn: job.createdOn.toISOString(),
        error: describeError(job.output),
      })),
    };
  }
}
