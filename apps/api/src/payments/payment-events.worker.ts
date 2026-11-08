import { Inject, Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { InjectPinoLogger, type PinoLogger } from 'nestjs-pino';
import type { Job, JobResult } from 'pg-boss';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { PAYMENT_EVENTS_QUEUE, type PaymentEventJob } from '../queue/queue.constants.js';
import { QueueService } from '../queue/queue.service.js';
import { PaymentEventProcessor } from './payment-event.processor.js';

/** Jobs buscados por vez. Com lote cheio, o worker busca de novo na hora (burst). */
const BATCH_SIZE = 10;

/**
 * Worker da fila de eventos do gateway, no mesmo processo da api. Cada job do lote é aplicado e
 * liquidado separadamente: a falha de um não faz os outros voltarem para a fila.
 */
@Injectable()
export class PaymentEventsWorker implements OnApplicationBootstrap {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly queue: QueueService,
    private readonly processor: PaymentEventProcessor,
    @InjectPinoLogger(PaymentEventsWorker.name) private readonly logger: PinoLogger,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.queue.boss.work<PaymentEventJob>(
      PAYMENT_EVENTS_QUEUE,
      {
        batchSize: BATCH_SIZE,
        burstWhenBatchFull: true,
        perJobResults: true,
        pollingIntervalSeconds: this.env.QUEUE_POLLING_SECONDS,
      },
      (jobs) => Promise.all(jobs.map((job) => this.handle(job))),
    );
  }

  private async handle(job: Job<PaymentEventJob>): Promise<JobResult> {
    const context = {
      jobId: job.id,
      eventId: job.data.eventId,
      orderExternalId: job.data.orderExternalId,
      attempt: job.retryCount + 1,
    };
    try {
      const outcome = await this.processor.apply(job.data.paymentEventId);
      this.logger.info(
        { ...context, outcome },
        outcome === 'applied' ? 'evento aplicado' : 'evento já aplicado; nada a fazer',
      );
      return { id: job.id, status: 'completed', output: { outcome } };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn({ ...context, err: error }, 'falha ao aplicar; o pg-boss tenta de novo');
      return { id: job.id, status: 'failed', output: { message } };
    }
  }
}
