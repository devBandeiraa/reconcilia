import type {
  DeliveryTotals,
  GatewayStatementEntry,
  SimulationOptionsInput,
  SimulationResult,
} from '@reconcilia/shared';
import { buildMessages } from './messages.js';
import { generateScenario, type Scenario } from './scenario.js';

/** Como as mensagens chegam à api. Lança erro se a api não aceitar. */
export interface Transport {
  post(path: string, body: unknown): Promise<void>;
}

export const PATHS = {
  store: '/webhooks/store',
  gateway: '/webhooks/gateway',
  erp: '/webhooks/erp',
  statement: '/sim/gateway/statement',
} as const;

const STATEMENT_BATCH = 200;

export interface DeliveryOptions {
  /** Pedidos enviados ao mesmo tempo. */
  concurrency?: number;
  /** Horário (UTC) do primeiro pedido; os seguintes vêm a cada minuto. */
  startAt?: Date;
}

/**
 * Envia o cenário. Por pedido, em ordem: loja → gateway (authorized, captured) → ERP.
 * - lost: o captured nunca é enviado, mas a captura entra no extrato do gateway.
 * - duplicate: a primeira cópia vai sozinha e as demais em paralelo.
 * O extrato é publicado em lotes no fim.
 */
export async function deliverScenario(
  scenario: Scenario,
  transport: Transport,
  { concurrency = 8, startAt = new Date() }: DeliveryOptions = {},
): Promise<DeliveryTotals> {
  const totals: DeliveryTotals = {
    orders: 0,
    authorizations: 0,
    captures: 0,
    duplicateCopies: 0,
    erpEvents: 0,
    statementEntries: 0,
  };
  const statement: GatewayStatementEntry[] = [];
  let next = 0;

  const worker = async (): Promise<void> => {
    while (next < scenario.orders.length) {
      const index = next++;
      const order = scenario.orders[index]!;
      const messages = buildMessages(order, new Date(startAt.getTime() + index * 60_000));

      await transport.post(PATHS.store, messages.store);
      totals.orders++;
      await transport.post(PATHS.gateway, messages.authorized);
      totals.authorizations++;
      statement[index] = messages.statement;

      if (order.captureCopies > 0) {
        await transport.post(PATHS.gateway, messages.captured);
        const extraCopies = order.captureCopies - 1;
        await Promise.all(
          Array.from({ length: extraCopies }, () =>
            transport.post(PATHS.gateway, messages.captured),
          ),
        );
        totals.captures++;
        totals.duplicateCopies += extraCopies;
      }

      await transport.post(PATHS.erp, messages.erp);
      totals.erpEvents++;
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, scenario.orders.length) }, worker));

  for (let i = 0; i < statement.length; i += STATEMENT_BATCH) {
    await transport.post(PATHS.statement, { entries: statement.slice(i, i + STATEMENT_BATCH) });
  }
  totals.statementEntries = statement.length;

  return totals;
}

/** Gera e envia o cenário: o que o CLI e o POST /simulate fazem. */
export async function simulate(
  input: SimulationOptionsInput,
  seed: number,
  transport: Transport,
  options?: DeliveryOptions,
): Promise<SimulationResult> {
  const scenario = generateScenario(input, seed);
  const totals = await deliverScenario(scenario, transport, options);
  return { seed, orders: scenario.orders.length, gabarito: scenario.gabarito, totals };
}
