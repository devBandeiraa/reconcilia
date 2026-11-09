import { Inject, Injectable, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

export const DATABASE_URL = Symbol('DATABASE_URL');

/** PrismaClient com o driver adapter do pg. Conecta e desconecta junto com o ciclo de vida do Nest. */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnApplicationShutdown {
  constructor(@Inject(DATABASE_URL) databaseUrl: string) {
    super({
      adapter: new PrismaPg({ connectionString: databaseUrl }),
      // Num pico (o /simulate grava dezenas de webhooks em paralelo), as conexões do pool ficam
      // ocupadas. O padrão do Prisma desiste de abrir a transação em 2s (P2028) e a requisição
      // vira 500; aqui ela espera a vez por até 10s. O tempo da transação em si não muda.
      transactionOptions: { maxWait: 10_000 },
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  /** Depois do pg-boss parar (onModuleDestroy), para o worker não perder a conexão no meio. */
  async onApplicationShutdown(): Promise<void> {
    await this.$disconnect();
  }
}
