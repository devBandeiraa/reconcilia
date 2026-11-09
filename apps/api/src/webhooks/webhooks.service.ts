import { ConflictException, Injectable } from '@nestjs/common';
import type {
  ErpEventType as ExternalErpType,
  ErpWebhook,
  GatewayEventType,
  GatewayWebhook,
  StoreWebhook,
} from '@reconcilia/shared';
import { fromPrisma } from 'pg-boss';
import { ErpEventType, OrderStatus, PaymentEventType } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PAYMENT_EVENTS_QUEUE, type PaymentEventJob } from '../queue/queue.constants.js';
import { QueueService } from '../queue/queue.service.js';

const GATEWAY_TYPES: Record<GatewayEventType, PaymentEventType> = {
  'charge.authorized': PaymentEventType.AUTHORIZED,
  'charge.captured': PaymentEventType.CAPTURED,
  'charge.refunded': PaymentEventType.REFUNDED,
};

const ERP_TYPES: Record<ExternalErpType, ErpEventType> = {
  'payment.recorded': ErpEventType.PAYMENT_RECORDED,
  'refund.recorded': ErpEventType.REFUND_RECORDED,
  'adjustment.recorded': ErpEventType.ADJUSTMENT,
};

export interface IngestResult {
  duplicate: boolean;
}

/**
 * Ingestão idempotente. O upsert vira um único `INSERT ... ON CONFLICT (event_id) DO UPDATE SET
 * received_count = received_count + 1` (upsert nativo do Prisma): com N cópias em paralelo, o
 * Postgres serializa pelo lock da linha e só uma vê received_count = 1, ou seja, só uma é nova.
 */
@Injectable()
export class WebhooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
  ) {}

  async receiveStore(event: StoreWebhook): Promise<IngestResult> {
    if (event.type === 'order.canceled') return this.cancelOrder(event);
    const { externalId, totalCents, installments } = event.order;
    const { count } = await this.prisma.order.createMany({
      data: [{ externalId, totalCents, installments }],
      skipDuplicates: true,
    });
    return { duplicate: count === 0 };
  }

  /**
   * Cancela só um pedido PENDING (UPDATE condicional): reenviar o cancelamento não muda nada.
   * Cancelar um pedido já pago exigiria estorno na loja, fora do escopo: também não muda nada.
   */
  private async cancelOrder(
    event: Extract<StoreWebhook, { type: 'order.canceled' }>,
  ): Promise<IngestResult> {
    const { externalId } = event.order;
    const { count } = await this.prisma.order.updateMany({
      where: { externalId, status: OrderStatus.PENDING },
      data: { status: OrderStatus.CANCELED, canceledAt: new Date(event.occurredAt) },
    });
    if (count === 1) return { duplicate: false };
    const exists = await this.prisma.order.count({ where: { externalId } });
    if (!exists) {
      throw new ConflictException(`Pedido ${externalId} ainda não existe; reenvie o cancelamento`);
    }
    return { duplicate: true };
  }

  /** Grava e enfileira na MESMA transação: nunca sobra evento sem job nem job sem evento. */
  receiveGateway(event: GatewayWebhook): Promise<IngestResult> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.paymentEvent.upsert({
        where: { eventId: event.id },
        create: {
          provider: event.provider,
          eventId: event.id,
          orderExternalId: event.data.orderReference,
          type: GATEWAY_TYPES[event.type],
          amountCents: event.data.amountCents,
          payload: event,
        },
        update: { receivedCount: { increment: 1 } },
        select: { id: true, receivedCount: true },
      });
      if (row.receivedCount > 1) return { duplicate: true };

      const job: PaymentEventJob = {
        paymentEventId: row.id,
        eventId: event.id,
        orderExternalId: event.data.orderReference,
      };
      await this.queue.boss.send(PAYMENT_EVENTS_QUEUE, job, {
        ...this.queue.paymentEventJobOptions(),
        singletonKey: event.id,
        db: fromPrisma(tx),
      });
      return { duplicate: false };
    });
  }

  /** Mesma ingestão idempotente. Sem fila: evento do ERP não muda estado, a conciliação só lê. */
  async receiveErp(event: ErpWebhook): Promise<IngestResult> {
    const row = await this.prisma.erpEvent.upsert({
      where: { eventId: event.id },
      create: {
        eventId: event.id,
        orderExternalId: event.orderReference,
        type: ERP_TYPES[event.type],
        amountCents: event.amountCents,
        payload: event,
      },
      update: { receivedCount: { increment: 1 } },
      select: { receivedCount: true },
    });
    return { duplicate: row.receivedCount > 1 };
  }
}
