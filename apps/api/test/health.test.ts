import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { HealthResponseSchema } from '@reconcilia/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';

describe('GET /health', () => {
  let app: INestApplication;
  let server: Server;

  beforeAll(async () => {
    app = await createApp(loadEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }));
    await app.init();
    server = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app.close();
  });

  it('responde 200 seguindo o contrato de packages/shared', async () => {
    const res = await request(server).get('/health').expect(200);
    const body = HealthResponseSchema.parse(res.body);
    expect(body.status).toBe('ok');
    expect(body.service).toBe('reconcilia-api');
  });

  it('documenta o /health no OpenAPI servido em /docs', async () => {
    const res = await request(server).get('/docs-json').expect(200);
    const spec = res.body as { paths: Record<string, unknown> };
    expect(spec.paths).toHaveProperty('/health');
  });
});
