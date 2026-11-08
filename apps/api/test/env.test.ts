import { DEV_WEBHOOK_SECRET } from '@reconcilia/shared';
import { describe, expect, it } from 'vitest';
import { LOCAL_DATABASE_URL, loadEnv } from '../src/config/env.js';

describe('loadEnv', () => {
  it('aplica os padrões de desenvolvimento', () => {
    expect(loadEnv({})).toEqual({
      NODE_ENV: 'development',
      PORT: 3001,
      LOG_LEVEL: 'info',
      DATABASE_URL: LOCAL_DATABASE_URL,
      WEBHOOK_SECRET: DEV_WEBHOOK_SECRET,
      QUEUE_RETRY_LIMIT: 5,
      QUEUE_RETRY_DELAY_SECONDS: 2,
      QUEUE_POLLING_SECONDS: 2,
      RECONCILIATION_CRON: '*/5 * * * *',
      DEMO_REPLAY: true,
      GEMINI_MODEL: 'gemini-3.8-flash',
      STORE_TIMEZONE: 'America/Sao_Paulo',
    });
  });

  it('recusa env inválido com mensagem legível', () => {
    expect(() => loadEnv({ PORT: 'abc', LOG_LEVEL: 'verbose' })).toThrow(
      /Variáveis de ambiente inválidas[\s\S]*PORT[\s\S]*LOG_LEVEL/,
    );
  });

  it('recusa DATABASE_URL que não é Postgres', () => {
    expect(() => loadEnv({ DATABASE_URL: 'mysql://user:pass@localhost:3306/db' })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('em produção, recusa o segredo de webhook de desenvolvimento', () => {
    expect(() => loadEnv({ NODE_ENV: 'production' })).toThrow(/WEBHOOK_SECRET/);
    expect(loadEnv({ NODE_ENV: 'production', WEBHOOK_SECRET: 'x'.repeat(32) }).NODE_ENV).toBe(
      'production',
    );
  });

  it('sem DEMO_REPLAY, exige GEMINI_API_KEY (vazia conta como ausente)', () => {
    expect(() => loadEnv({ DEMO_REPLAY: 'false', GEMINI_API_KEY: '' })).toThrow(/GEMINI_API_KEY/);
    expect(loadEnv({ DEMO_REPLAY: 'false', GEMINI_API_KEY: 'chave-de-teste' }).DEMO_REPLAY).toBe(
      false,
    );
  });

  it('recusa fuso horário inválido', () => {
    expect(() => loadEnv({ STORE_TIMEZONE: 'Marte/Olympus' })).toThrow(/STORE_TIMEZONE/);
  });
});
