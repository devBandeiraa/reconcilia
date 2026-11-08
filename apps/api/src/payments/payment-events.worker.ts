import { Inject, Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { InjectPinoLogger, type PinoLogger } from 'nestjs-pino';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { PAYMENT_EVENTS_QUEUE, type PaymentEventJob } from '../queue/queue.constants.js';
import { QueueService } from '../queue/queue.service.js';
import { PaymentEventProcessor } from './payment-event.processor.js';

/** Worker da fila de eventos do gateway, no mesmo processo da api. */
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
      { batchSize: 1, pollingIntervalSeconds: this.env.QUEUE_POLLING_SECONDS },
      async ([job]) => {
        if (!job) return;
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
        } catch (error) {
          this.logger.warn({ ...context, err: error }, 'falha ao aplicar; o pg-boss tenta de novo');
          throw error;
        }
      },
    );
  }
}
