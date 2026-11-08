import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { InjectPinoLogger, type PinoLogger } from 'nestjs-pino';
import { PgBoss, type Queue, type SendOptions } from 'pg-boss';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import {
  INVESTIGATIONS_QUEUE,
  PAYMENT_EVENTS_DLQ,
  PAYMENT_EVENTS_QUEUE,
  RECONCILIATION_QUEUE,
} from './queue.constants.js';

/**
 * pg-boss no próprio Postgres (schema `pgboss`), no mesmo processo da api. A fila é otimização:
 * a garantia de "exatamente uma vez" está no banco (ver ADR 0004).
 */
@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  readonly boss: PgBoss;

  constructor(
    @Inject(ENV) private readonly env: Env,
    @InjectPinoLogger(QueueService.name) private readonly logger: PinoLogger,
  ) {
    this.boss = new PgBoss({
      connectionString: env.DATABASE_URL,
      schema: 'pgboss',
      // Com o agendamento desligado (testes), esta instância não dispara jobs de cron.
      schedule: env.RECONCILIATION_CRON !== 'off',
    });
    this.boss.on('error', (error) => this.logger.error({ err: error }, 'pg-boss: erro interno'));
  }

  async onModuleInit(): Promise<void> {
    await this.boss.start();
    await this.ensureQueue({ name: PAYMENT_EVENTS_DLQ, policy: 'standard' });
    await this.ensureQueue({
      name: PAYMENT_EVENTS_QUEUE,
      policy: 'exclusive',
      deadLetter: PAYMENT_EVENTS_DLQ,
    });
    await this.ensureQueue({ name: RECONCILIATION_QUEUE, policy: 'singleton' });
    await this.ensureQueue({ name: INVESTIGATIONS_QUEUE, policy: 'standard' });
  }

  async onModuleDestroy(): Promise<void> {
    await this.boss.stop();
  }

  /** Retry com backoff exponencial e DLQ, por job: vale mesmo se a fila já existia. */
  paymentEventJobOptions(): SendOptions {
    return {
      retryLimit: this.env.QUEUE_RETRY_LIMIT,
      retryDelay: this.env.QUEUE_RETRY_DELAY_SECONDS,
      retryBackoff: true,
      retryDelayMax: 300,
      deadLetter: PAYMENT_EVENTS_DLQ,
    };
  }

  async ensureQueue({ name, ...options }: Queue): Promise<void> {
    if (!(await this.boss.getQueue(name))) await this.boss.createQueue(name, options);
  }
}
