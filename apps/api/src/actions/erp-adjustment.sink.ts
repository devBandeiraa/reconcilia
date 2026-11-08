import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';

export const ERP_ADJUSTMENT_SINK = Symbol('ERP_ADJUSTMENT_SINK');

export interface ErpAdjustmentRequest {
  /** Chave de idempotência: a mesma ação nunca manda dois ajustes. */
  actionId: string;
  orderExternalId: string;
  expectedCents: number;
  erpCents: number;
}

/**
 * Para onde vai o pedido de ajuste de uma divergência com o ERP. Num ERP real, seria a API
 * dele (com o actionId como chave de idempotência); aqui é o ERP simulado.
 */
export interface ErpAdjustmentSink {
  requestAdjustment(
    tx: Prisma.TransactionClient,
    request: ErpAdjustmentRequest,
  ): Promise<{ created: boolean; differenceCents: number }>;
}

/** ERP simulado: grava na caixa de entrada sim_erp_adjustments (action_id único). */
@Injectable()
export class SimulatedErpAdjustmentSink implements ErpAdjustmentSink {
  async requestAdjustment(
    tx: Prisma.TransactionClient,
    request: ErpAdjustmentRequest,
  ): Promise<{ created: boolean; differenceCents: number }> {
    const differenceCents = request.erpCents - request.expectedCents;
    const { count } = await tx.simErpAdjustment.createMany({
      data: [{ ...request, differenceCents }],
      skipDuplicates: true,
    });
    return { created: count === 1, differenceCents };
  }
}
