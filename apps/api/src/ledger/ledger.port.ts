import type { Prisma } from '../generated/prisma/client.js';

export const LEDGER = Symbol('LEDGER');

export interface MoneyMovement {
  /** Derivado do eventId ("capture:<eventId>"): reprocessar o evento não duplica lançamentos. */
  transactionId: string;
  orderExternalId: string;
  amountCents: number;
}

/**
 * O que o worker pede ao ledger. As chamadas rodam dentro da MESMA transação que marca o evento
 * como aplicado: se o ledger falhar, nada é aplicado e o job é tentado de novo.
 */
/** posted: lançou agora; already-posted: o transactionId já existia; skipped: valor 0, nada a lançar. */
export type LedgerOutcome = 'posted' | 'already-posted' | 'skipped';

export interface LedgerPort {
  recordCapture(tx: Prisma.TransactionClient, movement: MoneyMovement): Promise<LedgerOutcome>;
  recordRefund(tx: Prisma.TransactionClient, movement: MoneyMovement): Promise<LedgerOutcome>;
}
