import { describe, expect, it } from 'vitest';
import { LOCAL_DATABASE_URL, loadEnv } from '../src/config/env.js';

describe('loadEnv', () => {
  it('aplica os padrões de desenvolvimento', () => {
    expect(loadEnv({})).toEqual({
      NODE_ENV: 'development',
      PORT: 3001,
      LOG_LEVEL: 'info',
      DATABASE_URL: LOCAL_DATABASE_URL,
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
});
