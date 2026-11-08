import { Injectable } from '@nestjs/common';
import { LEDGER_ACCOUNTS, type LedgerBalance } from '@reconcilia/shared';
import { LedgerAccount, LedgerDirection, type Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { LedgerPort, MoneyMovement } from './ledger.port.js';

export interface PostingLine {
  account: LedgerAccount;
  direction: LedgerDirection;
  amountCents: number;
}

export type PostOutcome = 'posted' | 'already-posted';

/** Transação que não fecha: lançada antes de qualquer gravação. */
export class LedgerUnbalancedError extends Error {
  constructor(transactionId: string, reason: string) {
    super(`ledger: transação ${transactionId} recusada: ${reason}`);
    this.name = 'LedgerUnbalancedError';
  }
}

function assertBalanced(transactionId: string, lines: readonly PostingLine[]): void {
  if (lines.length < 2) {
    throw new LedgerUnbalancedError(transactionId, 'precisa de pelo menos 2 lançamentos');
  }
  const invalid = lines.find((l) => !Number.isSafeInteger(l.amountCents) || l.amountCents <= 0);
  if (invalid) {
    throw new LedgerUnbalancedError(
      transactionId,
      `valor ${invalid.amountCents} inválido (centavos inteiros e positivos)`,
    );
  }
  const sum = (direction: LedgerDirection) =>
    lines.filter((l) => l.direction === direction).reduce((total, l) => total + l.amountCents, 0);
  const debits = sum(LedgerDirection.DEBIT);
  const credits = sum(LedgerDirection.CREDIT);
  if (debits !== credits) {
    throw new LedgerUnbalancedError(transactionId, `débitos ${debits} ≠ créditos ${credits}`);
  }
}

/**
 * Ledger em partidas dobradas. O serviço valida antes de gravar (erro legível); o banco garante
 * de qualquer jeito: PK em ledger_transactions (idempotência), trigger de soma zero no COMMIT e
 * tabelas append-only (ver ADR 0005).
 */
@Injectable()
export class LedgerService implements LedgerPort {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Grava uma transação dentro da transação do chamador. Se o transactionId já existe, não grava
   * nada e devolve 'already-posted'.
   */
  async post(
    tx: Prisma.TransactionClient,
    transactionId: string,
    lines: readonly PostingLine[],
    description: string,
  ): Promise<PostOutcome> {
    assertBalanced(transactionId, lines);

    const { count } = await tx.ledgerTransaction.createMany({
      data: [{ id: transactionId, description }],
      skipDuplicates: true,
    });
    if (count === 0) return 'already-posted';

    await tx.ledgerEntry.createMany({
      data: lines.map((line) => ({ transactionId, ...line })),
    });
    return 'posted';
  }

  /** Captura: o gateway passa a nos dever o valor. Débito a receber / crédito receita. */
  async recordCapture(tx: Prisma.TransactionClient, movement: MoneyMovement): Promise<void> {
    if (movement.amountCents === 0) return;
    await this.post(
      tx,
      movement.transactionId,
      [
        {
          account: LedgerAccount.GATEWAY_RECEIVABLE,
          direction: LedgerDirection.DEBIT,
          amountCents: movement.amountCents,
        },
        {
          account: LedgerAccount.ORDER_REVENUE,
          direction: LedgerDirection.CREDIT,
          amountCents: movement.amountCents,
        },
      ],
      `Captura do pedido ${movement.orderExternalId}`,
    );
  }

  /** Estorno: reduz a receita (REFUNDS é redutora) e o que o gateway nos deve. */
  async recordRefund(tx: Prisma.TransactionClient, movement: MoneyMovement): Promise<void> {
    if (movement.amountCents === 0) return;
    await this.post(
      tx,
      movement.transactionId,
      [
        {
          account: LedgerAccount.REFUNDS,
          direction: LedgerDirection.DEBIT,
          amountCents: movement.amountCents,
        },
        {
          account: LedgerAccount.GATEWAY_RECEIVABLE,
          direction: LedgerDirection.CREDIT,
          amountCents: movement.amountCents,
        },
      ],
      `Estorno do pedido ${movement.orderExternalId}`,
    );
  }

  /** Saldo por conta (débitos - créditos) e total, lidos num snapshot consistente. */
  async balance(): Promise<LedgerBalance> {
    const [groups, transactions, entries] = await this.prisma.$transaction(
      [
        this.prisma.ledgerEntry.groupBy({
          by: ['account', 'direction'],
          _sum: { amountCents: true },
          orderBy: [{ account: 'asc' }, { direction: 'asc' }],
        }),
        this.prisma.ledgerTransaction.count(),
        this.prisma.ledgerEntry.count(),
      ],
      { isolationLevel: 'RepeatableRead' },
    );

    const sumOf = (account: string, direction: LedgerDirection) =>
      groups.find((g) => g.account === account && g.direction === direction)?._sum.amountCents ?? 0;

    const accounts = LEDGER_ACCOUNTS.map((account) => {
      const debitCents = sumOf(account, LedgerDirection.DEBIT);
      const creditCents = sumOf(account, LedgerDirection.CREDIT);
      return { account, debitCents, creditCents, balanceCents: debitCents - creditCents };
    });

    return {
      accounts,
      totalCents: accounts.reduce((total, a) => total + a.balanceCents, 0),
      transactions,
      entries,
    };
  }
}
