import { type Diagnosis, DiagnosisSchema } from '@reconcilia/shared';
import { z } from 'zod';
import { ErpEventType, OrderStatus, type Prisma } from '../generated/prisma/client.js';
import type { GatewayStatementSource } from '../reconciliation/gateway-statement.source.js';

/** O que existe de fato para o pedido: contra isso os params da ação são conferidos. */
export interface CaseFacts {
  gatewayEventIds: Set<string>;
  chargeIds: Set<string>;
  capturedCents: number;
  erpPaymentCents: number;
  /** Status do pedido na loja (o REFUND_CAPTURE só vale para pedido CANCELED). */
  orderStatus: OrderStatus | null;
}

export async function loadFacts(
  tx: Prisma.TransactionClient,
  statement: GatewayStatementSource,
  orderExternalId: string,
): Promise<CaseFacts> {
  const [events, erp, captures, order] = await Promise.all([
    tx.paymentEvent.findMany({ where: { orderExternalId }, select: { eventId: true } }),
    tx.erpEvent.findMany({
      where: { orderExternalId, type: ErpEventType.PAYMENT_RECORDED },
      select: { amountCents: true },
    }),
    statement.listCaptures(orderExternalId),
    tx.order.findUnique({ where: { externalId: orderExternalId }, select: { status: true } }),
  ]);
  return {
    gatewayEventIds: new Set(events.map((e) => e.eventId)),
    chargeIds: new Set(captures.map((c) => c.chargeId)),
    capturedCents: captures.reduce((sum, c) => sum + c.amountCents, 0),
    erpPaymentCents: erp.reduce((sum, e) => sum + e.amountCents, 0),
    orderStatus: order?.status ?? null,
  };
}

export type DiagnosisCheck = { ok: true; value: Diagnosis } | { ok: false; error: string };

/**
 * Valida a saída do submitDiagnosis: o formato (Zod) e, depois, se os params apontam para dados
 * que existem. Um id inventado pelo modelo é recusado aqui.
 */
export function checkDiagnosis(args: unknown, facts: CaseFacts): DiagnosisCheck {
  const parsed = DiagnosisSchema.safeParse(args);
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };

  const { kind, params } = parsed.data.suggestedAction as {
    kind: string;
    params: Record<string, unknown>;
  };
  switch (kind) {
    case 'MARK_ORDER_PAID':
      if (!facts.chargeIds.has(String(params.chargeId))) {
        return {
          ok: false,
          error: `chargeId ${String(params.chargeId)} não está no extrato do pedido`,
        };
      }
      break;
    case 'REFUND_CAPTURE':
      if (!facts.chargeIds.has(String(params.chargeId))) {
        return {
          ok: false,
          error: `chargeId ${String(params.chargeId)} não está no extrato do pedido`,
        };
      }
      if (facts.orderStatus !== OrderStatus.CANCELED) {
        return {
          ok: false,
          error: `REFUND_CAPTURE só vale para pedido CANCELED; este está ${String(facts.orderStatus)}`,
        };
      }
      break;
    case 'REPROCESS_WEBHOOK':
    case 'IGNORE_DUPLICATE':
      if (!facts.gatewayEventIds.has(String(params.eventId))) {
        return {
          ok: false,
          error: `eventId ${String(params.eventId)} não é um webhook deste pedido`,
        };
      }
      break;
    case 'FLAG_ERP_DIVERGENCE':
      if (
        params.expectedCents !== facts.capturedCents ||
        params.erpCents !== facts.erpPaymentCents
      ) {
        return {
          ok: false,
          error:
            `valores não batem com os dados: capturado ${facts.capturedCents}, ` +
            `ERP ${facts.erpPaymentCents}`,
        };
      }
      break;
  }
  return { ok: true, value: parsed.data };
}
