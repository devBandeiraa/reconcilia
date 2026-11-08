import { DEV_WEBHOOK_SECRET } from '@reconcilia/shared';
import { z } from 'zod';

/** Banco do docker-compose (porta 5440 do host). Padrão só para desenvolvimento local. */
export const LOCAL_DATABASE_URL = 'postgresql://reconcilia:reconcilia@localhost:5440/reconcilia';

export const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    /** Conexão usada pelo app em runtime. Na Neon, a URL do pooler. */
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }).default(LOCAL_DATABASE_URL),
    /** Segredo do HMAC dos webhooks (loja, gateway, ERP e extrato simulado). */
    WEBHOOK_SECRET: z.string().min(16).default(DEV_WEBHOOK_SECRET),
    /** Tentativas extras de um evento antes de ir para a DLQ. */
    QUEUE_RETRY_LIMIT: z.coerce.number().int().min(0).max(10).default(5),
    /** Atraso base do retry; cresce em backoff exponencial (teto de 300s). */
    QUEUE_RETRY_DELAY_SECONDS: z.coerce.number().int().min(1).max(60).default(2),
    /** Intervalo de polling do worker. */
    QUEUE_POLLING_SECONDS: z.coerce.number().min(0.5).max(60).default(2),
  })
  .superRefine((env, ctx) => {
    if (
      env.NODE_ENV === 'production' &&
      (env.WEBHOOK_SECRET === DEV_WEBHOOK_SECRET || env.WEBHOOK_SECRET.length < 32)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['WEBHOOK_SECRET'],
        message: 'em produção, use um segredo próprio com pelo menos 32 caracteres',
      });
    }
  });

export type Env = z.infer<typeof EnvSchema>;

/** Valida as variáveis de ambiente. Lança erro legível se algo estiver inválido. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Variáveis de ambiente inválidas:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
