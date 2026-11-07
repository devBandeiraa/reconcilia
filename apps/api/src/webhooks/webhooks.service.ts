import { Injectable } from '@nestjs/common';
import type {
  ErpEventType as ExternalErpType,
  ErpWebhook,
  GatewayEventType,
  GatewayWebhook,
  StoreWebhook,
} from '@reconcilia/shared';
import { ErpEventType, PaymentEventType } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

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

/**
 * Grava os eventos brutos traduzidos para o modelo interno. Até a v0.4.0, um reenvio é só
 * ignorado (ON CONFLICT DO NOTHING via skipDuplicates); a contagem de reenvios e a fila chegam
 * na fase 4.
 */
@Injectable()
export class WebhooksService {
  constructor(private readonly prisma: PrismaService) {}

  async receiveStore(event: StoreWebhook): Promise<void> {
    const { externalId, totalCents, installments } = event.order;
    await this.prisma.order.createMany({
      data: [{ externalId, totalCents, installments }],
      skipDuplicates: true,
    });
  }

  async receiveGateway(event: GatewayWebhook): Promise<void> {
    await this.prisma.paymentEvent.createMany({
      data: [
        {
          provider: event.provider,
          eventId: event.id,
          orderExternalId: event.data.orderReference,
          type: GATEWAY_TYPES[event.type],
          amountCents: event.data.amountCents,
          payload: event,
        },
      ],
      skipDuplicates: true,
    });
  }

  async receiveErp(event: ErpWebhook): Promise<void> {
    await this.prisma.erpEvent.createMany({
      data: [
        {
          eventId: event.id,
          orderExternalId: event.orderReference,
          type: ERP_TYPES[event.type],
          amountCents: event.amountCents,
          payload: event,
        },
      ],
      skipDuplicates: true,
    });
  }
}
