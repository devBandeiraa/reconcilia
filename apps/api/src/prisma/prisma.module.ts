import { type DynamicModule, Module } from '@nestjs/common';
import { DATABASE_URL, PrismaService } from './prisma.service.js';

@Module({})
export class PrismaModule {
  static forRoot(databaseUrl: string): DynamicModule {
    return {
      module: PrismaModule,
      global: true,
      providers: [{ provide: DATABASE_URL, useValue: databaseUrl }, PrismaService],
      exports: [PrismaService],
    };
  }
}
