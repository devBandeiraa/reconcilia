import { type DynamicModule, Module } from '@nestjs/common';
import type { Env } from './env.js';

/** Token do env já validado, para injetar com @Inject(ENV). */
export const ENV = Symbol('ENV');

@Module({})
export class ConfigModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: ConfigModule,
      global: true,
      providers: [{ provide: ENV, useValue: env }],
      exports: [ENV],
    };
  }
}
