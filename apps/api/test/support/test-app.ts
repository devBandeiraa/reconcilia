import type { INestApplication } from '@nestjs/common';
import { createApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { TEST_DATABASE_URL } from './test-db.js';

/** App completo apontando para o banco de teste, sem logs. */
export async function createTestApp(): Promise<INestApplication> {
  const app = await createApp(
    loadEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', DATABASE_URL: TEST_DATABASE_URL }),
  );
  await app.init();
  return app;
}
