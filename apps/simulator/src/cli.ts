import { randomInt } from 'node:crypto';
import { parseArgs } from 'node:util';
import { DEV_WEBHOOK_SECRET, type SimulationOptionsInput } from '@reconcilia/shared';
import { z } from 'zod';
import { createHttpTransport, formatGabarito, generateScenario, simulate } from './lib/index.js';

const USAGE = `Uso: pnpm --filter simulator start [opções]

  --orders N      pedidos (1 a 200, padrão 50)
  --lost P        fração com o webhook de captura perdido (padrão 0.1)
  --duplicate P   fração com o webhook de captura duplicado (padrão 0.15)
  --mismatch P    fração com valor divergente no ERP (padrão 0.1)
  --seed N        semente: a mesma semente gera o mesmo cenário (padrão: aleatória)
  --json          imprime o resultado em JSON
  --dry-run       só gera e imprime o gabarito, sem enviar nada
  --help          mostra esta ajuda

Env: API_URL (padrão http://localhost:3001) e WEBHOOK_SECRET.`;

const EnvSchema = z.object({
  API_URL: z.url().default('http://localhost:3001'),
  WEBHOOK_SECRET: z.string().min(16).default(DEV_WEBHOOK_SECRET),
});

const toNumber = (value: string | undefined): number | undefined =>
  value === undefined ? undefined : Number(value);

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      orders: { type: 'string' },
      lost: { type: 'string' },
      duplicate: { type: 'string' },
      mismatch: { type: 'string' },
      seed: { type: 'string' },
      json: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
    strict: true,
  });

  if (values.help) {
    console.log(USAGE);
    return;
  }

  const env = EnvSchema.parse(process.env);
  const options: SimulationOptionsInput = {
    orders: toNumber(values.orders),
    lost: toNumber(values.lost),
    duplicate: toNumber(values.duplicate),
    mismatch: toNumber(values.mismatch),
  };
  const seed = toNumber(values.seed) ?? randomInt(0, 2_147_483_647);
  if (!Number.isInteger(seed) || seed < 0) throw new Error('--seed deve ser um inteiro >= 0');

  if (values['dry-run']) {
    const scenario = generateScenario(options, seed);
    console.log(
      values.json
        ? JSON.stringify({ seed, orders: scenario.orders.length, gabarito: scenario.gabarito })
        : formatGabarito(seed, scenario.orders.length, scenario.gabarito),
    );
    return;
  }

  const transport = createHttpTransport(env.API_URL, env.WEBHOOK_SECRET);
  let result;
  try {
    result = await simulate(options, seed, transport);
  } catch (error) {
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : '';
    throw new Error(
      `Falha ao enviar para ${env.API_URL}. A api está no ar (pnpm dev)?\n${String(error)} ${cause}`,
      { cause: error },
    );
  }

  if (values.json) {
    console.log(JSON.stringify(result));
    return;
  }
  const t = result.totals;
  console.log(formatGabarito(result.seed, result.orders, result.gabarito));
  console.log(
    `\nEnviado para ${env.API_URL}: ${t.orders} pedidos, ${t.authorizations} autorizações, ` +
      `${t.captures} capturas (+${t.duplicateCopies} cópias duplicadas), ` +
      `${t.erpEvents} eventos do ERP, ${t.statementEntries} linhas no extrato.`,
  );
}

main().catch((error: unknown) => {
  if (error instanceof z.ZodError) {
    console.error(`Opções inválidas:\n${z.prettifyError(error)}\n\n${USAGE}`);
  } else {
    console.error(error instanceof Error ? error.message : error);
  }
  process.exitCode = 1;
});
