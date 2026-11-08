import { Inject, Injectable, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

export const DATABASE_URL = Symbol('DATABASE_URL');

/** PrismaClient com o driver adapter do pg. Conecta e desconecta junto com o ciclo de vida do Nest. */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnApplicationShutdown {
  constructor(@Inject(DATABASE_URL) databaseUrl: string) {
    super({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  /** Depois do pg-boss parar (onModuleDestroy), para o worker não perder a conexão no meio. */
  async onApplicationShutdown(): Promise<void> {
    await this.$disconnect();
  }
}
