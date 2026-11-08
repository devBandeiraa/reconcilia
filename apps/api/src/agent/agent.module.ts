import { Module } from '@nestjs/common';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { ReconciliationModule } from '../reconciliation/reconciliation.module.js';
import { AgentRunner } from './agent.runner.js';
import { InvestigationsController } from './investigations.controller.js';
import { InvestigationsService } from './investigations.service.js';
import { InvestigationsWorker } from './investigations.worker.js';
import { GeminiClient } from './llm/gemini.client.js';
import { LLM_CLIENT, type LlmClient } from './llm/llm-client.js';
import { ReplayLlmClient } from './llm/replay.client.js';

/** DEMO_REPLAY=true: roteiros gravados (sem custo). false: Gemini (a env já exige a chave). */
function createLlmClient(env: Env): LlmClient {
  if (env.DEMO_REPLAY || !env.GEMINI_API_KEY) return new ReplayLlmClient();
  return new GeminiClient(env.GEMINI_API_KEY, env.GEMINI_MODEL);
}

@Module({
  imports: [ReconciliationModule],
  controllers: [InvestigationsController],
  providers: [
    { provide: LLM_CLIENT, useFactory: createLlmClient, inject: [ENV] },
    AgentRunner,
    InvestigationsService,
    InvestigationsWorker,
  ],
})
export class AgentModule {}
