import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DEV_WEBHOOK_SECRET, SIGNATURE_HEADER } from '@reconcilia/shared';
import { sign } from '@reconcilia/simulator';
import request from 'supertest';
import { APP_OPTIONS, setupApp } from '../../src/app.js';
import { AppModule } from '../../src/app.module.js';
import { loadEnv } from '../../src/config/env.js';
import { LEDGER, type LedgerPort } from '../../src/ledger/ledger.port.js';
import { PAYMENT_EVENTS_DLQ, PAYMENT_EVENTS_QUEUE } from '../../src/queue/queue.constants.js';
import { QueueService } from '../../src/queue/queue.service.js';
import { TEST_DATABASE_URL } from './test-db.js';

export interface TestAppOptions {
  /** Troca o ledger (ex.: um que conta chamadas ou falha de propósito). */
  ledger?: LedgerPort;
  /** Variáveis de ambiente extras (ex.: RECONCILIATION_CRON para o teste do agendamento). */
  env?: Record<string, string>;
}

/**
 * App completo contra o banco de teste, sem logs. Retry rápido para os testes de fila:
 * 2 tentativas extras com 1s de atraso base e polling de 0,5s. Conciliação agendada desligada.
 */
export async function createTestApp(options: TestAppOptions = {}): Promise<INestApplication> {
  const env = loadEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: TEST_DATABASE_URL,
    QUEUE_RETRY_LIMIT: '2',
    QUEUE_RETRY_DELAY_SECONDS: '1',
    QUEUE_POLLING_SECONDS: '0.5',
    // Sem conciliação agendada: ela rodaria no meio dos outros testes.
    RECONCILIATION_CRON: 'off',
    ...options.env,
  });
  let builder = Test.createTestingModule({ imports: [AppModule.forRoot(env)] });
  if (options.ledger) builder = builder.overrideProvider(LEDGER).useValue(options.ledger);

  const app = setupApp((await builder.compile()).createNestApplication(APP_OPTIONS));
  // Porta real: o POST /simulate envia para a própria api, e o supertest reaproveita o servidor
  // em vez de abrir uma porta efêmera por requisição.
  await app.listen(0);
  await clearQueues(app);
  return app;
}

/**
 * Esvazia as filas do projeto, uma de cada vez. O worker já está fazendo polling, e apagar todas
 * as filas de uma vez pode cruzar locks com ele (deadlock 40P01): nesse caso, tenta de novo.
 */
export async function clearQueues(app: INestApplication): Promise<void> {
  const { boss } = app.get(QueueService);
  for (const queue of [PAYMENT_EVENTS_QUEUE, PAYMENT_EVENTS_DLQ]) {
    for (let attempt = 1; ; attempt++) {
      try {
        await boss.deleteAllJobs(queue);
        break;
      } catch (error) {
        const deadlock = (error as { code?: string }).code === '40P01';
        if (!deadlock || attempt === 5) throw error;
      }
    }
  }
}

/** POST assinado como o simulador assina: HMAC do corpo exato enviado. */
export function signedPost(
  server: Server,
  path: string,
  body: unknown,
  secret: string = DEV_WEBHOOK_SECRET,
) {
  const rawBody = JSON.stringify(body);
  return request(server)
    .post(path)
    .set('content-type', 'application/json')
    .set(SIGNATURE_HEADER, sign(secret, rawBody))
    .send(rawBody);
}

/** Espera uma condição assíncrona (ex.: o worker aplicar um evento). */
export async function waitFor<T>(
  read: () => Promise<T>,
  done: (value: T) => boolean,
  timeoutMs = 20_000,
): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = await read();
    if (done(value)) return value;
    if (Date.now() - start > timeoutMs) {
      throw new Error(`waitFor: tempo esgotado. Último valor: ${JSON.stringify(value)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}
