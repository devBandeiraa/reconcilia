import { Inject, Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { INVESTIGATIONS_QUEUE, type InvestigationJob } from '../queue/queue.constants.js';
import { QueueService } from '../queue/queue.service.js';
import { InvestigationsService } from './investigations.service.js';

/** Worker das investigações, no mesmo processo da api. Duas por vez no máximo (cota do modelo). */
@Injectable()
export class InvestigationsWorker implements OnApplicationBootstrap {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly queue: QueueService,
    private readonly investigations: InvestigationsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.investigations.recoverInterrupted();
    await this.queue.boss.work<InvestigationJob>(
      INVESTIGATIONS_QUEUE,
      {
        batchSize: 1,
        localConcurrency: 2,
        pollingIntervalSeconds: this.env.QUEUE_POLLING_SECONDS,
      },
      async ([job]) => {
        if (job) await this.investigations.execute(job.data.investigationId);
      },
    );
  }
}
