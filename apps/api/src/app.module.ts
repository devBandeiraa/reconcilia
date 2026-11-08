import { type DynamicModule, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { AgentModule } from './agent/agent.module.js';
import { ConfigModule } from './config/config.module.js';
import type { Env } from './config/env.js';
import { HealthController } from './health/health.controller.js';
import { LedgerModule } from './ledger/ledger.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ReconciliationModule } from './reconciliation/reconciliation.module.js';
import { QueueModule } from './queue/queue.module.js';
import { SimulationModule } from './simulation/simulation.module.js';
import { WebhooksModule } from './webhooks/webhooks.module.js';

@Module({})
export class AppModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(env),
        LoggerModule.forRoot({
          pinoHttp: {
            level: env.LOG_LEVEL,
            transport:
              env.NODE_ENV === 'development'
                ? { target: 'pino-pretty', options: { singleLine: true } }
                : undefined,
          },
        }),
        PrismaModule.forRoot(env.DATABASE_URL),
        QueueModule,
        LedgerModule,
        WebhooksModule,
        PaymentsModule,
        ReconciliationModule,
        AgentModule,
        SimulationModule,
      ],
      controllers: [HealthController],
    };
  }
}
