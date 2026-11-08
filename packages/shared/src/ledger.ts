import { z } from 'zod';

/** Contas do ledger (mesmos valores do enum LedgerAccount do banco). */
export const LEDGER_ACCOUNTS = [
  'GATEWAY_RECEIVABLE',
  'ORDER_REVENUE',
  'REFUNDS',
  'ERP_ADJUSTMENTS',
] as const;
export type LedgerAccountName = (typeof LEDGER_ACCOUNTS)[number];

const cents = z.number().int();

/** Saldo de uma conta: balanceCents = débitos - créditos. */
export const LedgerAccountBalanceSchema = z.object({
  account: z.enum(LEDGER_ACCOUNTS),
  debitCents: cents.nonnegative(),
  creditCents: cents.nonnegative(),
  balanceCents: cents,
});
export type LedgerAccountBalance = z.infer<typeof LedgerAccountBalanceSchema>;

/** Resposta do GET /ledger/balance. Em partidas dobradas, totalCents é sempre 0. */
export const LedgerBalanceSchema = z.object({
  accounts: z.array(LedgerAccountBalanceSchema),
  totalCents: cents,
  transactions: z.number().int().nonnegative(),
  entries: z.number().int().nonnegative(),
});
export type LedgerBalance = z.infer<typeof LedgerBalanceSchema>;
