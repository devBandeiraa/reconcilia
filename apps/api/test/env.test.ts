import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config/env.js';

describe('loadEnv', () => {
  it('aplica os padrões de desenvolvimento', () => {
    expect(loadEnv({})).toEqual({ NODE_ENV: 'development', PORT: 3001, LOG_LEVEL: 'info' });
  });

  it('recusa env inválido com mensagem legível', () => {
    expect(() => loadEnv({ PORT: 'abc', LOG_LEVEL: 'verbose' })).toThrow(
      /Variáveis de ambiente inválidas[\s\S]*PORT[\s\S]*LOG_LEVEL/,
    );
  });
});
