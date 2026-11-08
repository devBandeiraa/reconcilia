import { Inject, Injectable } from '@nestjs/common';
import { OrderStatus, PaymentEventType } from '../generated/prisma/client.js';
import { LEDGER, type LedgerPort } from '../ledger/ledger.port.js';
import { PrismaService } from '../prisma/prisma.service.js';

export type ApplyOutcome = 'applied' | 'already-applied';

/** O pedido do evento ainda não chegou: falha de propósito para o pg-boss tentar de novo. */
export class OrderNotFoundYetError extends Error {
  constructor(orderExternalId: string) {
    super(`Pedido ${orderExternalId} ainda não existe; o evento será tentado de novo`);
    this.name = 'OrderNotFoundYetError';
  }
}

/**
 * Aplica um evento do gateway exatamente uma vez. Tudo numa transação:
 * 1. UPDATE ... SET processed_at WHERE processed_at IS NULL: 0 linhas = já aplicado, sai sem efeito.
 * 2. CAPTURED: pedido PENDING → PAID e lançamento da captura no ledger.
 *    REFUNDED: lançamento do estorno no ledger. AUTHORIZED: não move dinheiro.
 * Qualquer erro desfaz tudo, inclusive o processed_at. O transactionId do ledger vem do eventId,
 * então mesmo um reprocessamento não duplica lançamentos.
 */
@Injectable()
export class PaymentEventProcessor {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(LEDGER) private readonly ledger: LedgerPort,
  ) {}

  apply(paymentEventId: string): Promise<ApplyOutcome> {
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.paymentEvent.updateMany({
        where: { id: paymentEventId, processedAt: null },
        data: { processedAt: new Date() },
      });
      if (claimed.count === 0) return 'already-applied';

      const event = await tx.paymentEvent.findUniqueOrThrow({ where: { id: paymentEventId } });
      const movement = (kind: string) => ({
        transactionId: `${kind}:${event.eventId}`,
        orderExternalId: event.orderExternalId,
        amountCents: event.amountCents,
      });

      if (event.type === PaymentEventType.REFUNDED) {
        await this.ledger.recordRefund(tx, movement('refund'));
        return 'applied';
      }
      if (event.type !== PaymentEventType.CAPTURED) return 'applied';

      const paid = await tx.order.updateMany({
        where: { externalId: event.orderExternalId, status: OrderStatus.PENDING },
        data: { status: OrderStatus.PAID },
      });
      if (paid.count === 0) {
        const order = await tx.order.findUnique({
          where: { externalId: event.orderExternalId },
          select: { id: true },
        });
        if (!order) throw new OrderNotFoundYetError(event.orderExternalId);
      }

      await this.ledger.recordCapture(tx, movement('capture'));
      return 'applied';
    });
  }
}
