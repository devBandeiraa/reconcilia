import { DEV_SESSION_SECRET, DEV_WEBHOOK_SECRET } from '@reconcilia/shared';
import { z } from 'zod';

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

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
    /** Segredo do HMAC do token de operador (quem aprova ou recusa na demo). */
    SESSION_SECRET: z.string().min(16).default(DEV_SESSION_SECRET),
    /** Tentativas extras de um evento antes de ir para a DLQ. */
    QUEUE_RETRY_LIMIT: z.coerce.number().int().min(0).max(10).default(5),
    /** Atraso base do retry; cresce em backoff exponencial (teto de 300s). */
    QUEUE_RETRY_DELAY_SECONDS: z.coerce.number().int().min(1).max(60).default(2),
    /** Intervalo de polling do worker. */
    QUEUE_POLLING_SECONDS: z.coerce.number().min(0.5).max(60).default(2),
    /** Cron (UTC) da conciliação agendada; `off` desliga (usado nos testes). */
    RECONCILIATION_CRON: z
      .string()
      .regex(/^(off|\S+(\s+\S+){4})$/, 'cron de 5 campos ou off')
      .default('*/5 * * * *'),
    /** true: o agente segue roteiros gravados (sem Gemini e sem custo). false: usa o Gemini. */
    DEMO_REPLAY: z.stringbool().default(true),
    /** Chave do Google AI Studio. Obrigatória quando DEMO_REPLAY=false. Vazia = ausente. */
    GEMINI_API_KEY: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().optional(),
    ),
    /** Modelo do Gemini. 3.5-flash respondeu de forma estável no aceite; o 3.8 deu 503/504. */
    GEMINI_MODEL: z.string().min(1).default('gemini-3.5-flash'),
    /** Origens que podem chamar a api pelo navegador (a web), separadas por vírgula. */
    CORS_ORIGIN: z
      .string()
      .default('http://localhost:3000')
      .transform((value) => value.split(',').map((origin) => origin.trim()))
      .pipe(z.array(z.url()).min(1)),
    /** Fuso da loja: só para exibir horários locais; no banco tudo é UTC. */
    STORE_TIMEZONE: z
      .string()
      .refine(isValidTimeZone, 'fuso horário IANA inválido (ex.: America/Sao_Paulo)')
      .default('America/Sao_Paulo'),
  })
  .superRefine((env, ctx) => {
    if (!env.DEMO_REPLAY && !env.GEMINI_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['GEMINI_API_KEY'],
        message:
          'obrigatória com DEMO_REPLAY=false (ou use DEMO_REPLAY=true para o modo demonstração)',
      });
    }
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
    if (
      env.NODE_ENV === 'production' &&
      (env.SESSION_SECRET === DEV_SESSION_SECRET || env.SESSION_SECRET.length < 32)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['SESSION_SECRET'],
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
