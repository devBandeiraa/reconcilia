import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';

export const LEDGER = Symbol('LEDGER');

export interface CaptureEntry {
  /** Derivado do eventId, para o ledger também ser idempotente (fase 5). */
  transactionId: string;
  orderExternalId: string;
  amountCents: number;
}

/**
 * Ponto de extensão do ledger. O worker chama dentro da MESMA transação que marca o evento como
 * aplicado: se o ledger falhar, nada é aplicado e o job é tentado de novo.
 */
export interface LedgerPort {
  recordCapture(tx: Prisma.TransactionClient, entry: CaptureEntry): Promise<void>;
}

/** Até a fase 5 (v0.5.0) o ledger não grava nada. */
@Injectable()
export class NoopLedger implements LedgerPort {
  recordCapture(): Promise<void> {
    return Promise.resolve();
  }
}
