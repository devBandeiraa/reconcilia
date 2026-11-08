import { Inject, Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { InjectPinoLogger, type PinoLogger } from 'nestjs-pino';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { RECONCILIATION_QUEUE } from '../queue/queue.constants.js';
import { QueueService } from '../queue/queue.service.js';
import { ReconciliationService } from './reconciliation.service.js';

/**
 * Conciliação agendada pelo pg-boss (cron em UTC, padrão a cada 5 min). Rodadas concorrentes
 * (o agendamento e um POST /reconcile ao mesmo tempo) são seguras: abrir caso é ON CONFLICT.
 */
@Injectable()
export class ReconciliationScheduler implements OnApplicationBootstrap {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly queue: QueueService,
    private readonly reconciliation: ReconciliationService,
    @InjectPinoLogger(ReconciliationScheduler.name) private readonly logger: PinoLogger,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this.env.RECONCILIATION_CRON === 'off') return;

    await this.queue.boss.schedule(RECONCILIATION_QUEUE, this.env.RECONCILIATION_CRON);
    await this.queue.boss.work(RECONCILIATION_QUEUE, async () => {
      const result = await this.reconciliation.run();
      this.logger.info({ ...result, trigger: 'cron' }, 'conciliação agendada concluída');
    });
  }
}
