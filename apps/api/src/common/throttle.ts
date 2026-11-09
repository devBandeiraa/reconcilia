import { type ExecutionContext, SetMetadata } from '@nestjs/common';
import { SkipThrottle, type ThrottlerModuleOptions } from '@nestjs/throttler';
import type { Env } from '../config/env.js';

/**
 * Proteção da demo pública, por IP (memória do processo: há uma instância só).
 * - `geral`: todas as rotas, exceto as marcadas com @NoThrottle (health e webhooks, que já
 *   são autenticados por HMAC e chegam em rajada pelo próprio /simulate).
 * - `pesado`: só as rotas marcadas com @HeavyRoute (simular, conciliar, investigar), com um
 *   limite menor, porque cada chamada escreve bastante no banco gratuito.
 */
const HEAVY_ROUTE = 'reconcilia:heavy-route';
const MINUTE_MS = 60_000;

/**
 * Tira a rota (ou o controller) dos dois limites. O @SkipThrottle() puro só pula o throttler
 * chamado "default", que aqui não existe.
 */
export const NoThrottle = () => SkipThrottle({ geral: true, pesado: true });

/** Marca a rota como pesada: passa também pelo limite `pesado`. */
export const HeavyRoute = () => SetMetadata(HEAVY_ROUTE, true);

const isHeavy = (context: ExecutionContext): boolean =>
  Reflect.getMetadata(HEAVY_ROUTE, context.getHandler()) === true;

export function throttlerOptions(env: Env): ThrottlerModuleOptions {
  return {
    errorMessage: 'Muitas requisições deste endereço. Espere um minuto e tente de novo.',
    throttlers: [
      { name: 'geral', ttl: MINUTE_MS, limit: env.THROTTLE_PER_MINUTE },
      {
        name: 'pesado',
        ttl: MINUTE_MS,
        limit: env.THROTTLE_HEAVY_PER_MINUTE,
        skipIf: (context) => !isHeavy(context),
      },
    ],
  };
}
