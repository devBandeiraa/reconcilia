import { randomInt } from 'node:crypto';
import type { Server } from 'node:http';
import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { SimulationOptions, SimulationResult } from '@reconcilia/shared';
import { createHttpTransport, simulate } from '@reconcilia/simulator';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';

/**
 * Roda o mesmo gerador do CLI. Os envios vão por HTTP para a própria api, assinados, para
 * exercitar exatamente o caminho que um sistema externo usaria.
 */
@Injectable()
export class SimulationService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly adapterHost: HttpAdapterHost,
  ) {}

  run(options: SimulationOptions): Promise<SimulationResult> {
    const seed = options.seed ?? randomInt(0, 2_147_483_647);
    const transport = createHttpTransport(this.selfUrl(), this.env.WEBHOOK_SECRET);
    return simulate(options, seed, transport);
  }

  private selfUrl(): string {
    const server = this.adapterHost.httpAdapter.getHttpServer() as Server;
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new ServiceUnavailableException('A api ainda não está ouvindo uma porta.');
    }
    return `http://127.0.0.1:${address.port}`;
  }
}
