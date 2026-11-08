import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export const GATEWAY_STATEMENT_SOURCE = Symbol('GATEWAY_STATEMENT_SOURCE');

export interface StatementCapture {
  chargeId: string;
  eventId: string;
  orderExternalId: string;
  amountCents: number;
  capturedAt: Date;
}

/**
 * De onde a conciliação lê o extrato do gateway: a fonte das capturas cujo webhook se perdeu.
 * Num gateway real, só esta implementação muda (a API de conciliação dele).
 */
export interface GatewayStatementSource {
  listCaptures(orderExternalId?: string): Promise<StatementCapture[]>;
}

/** Extrato do gateway simulado (tabela sim_gateway_statement, ver ADR 0003). */
@Injectable()
export class SimulatedGatewayStatementSource implements GatewayStatementSource {
  constructor(private readonly prisma: PrismaService) {}

  listCaptures(orderExternalId?: string): Promise<StatementCapture[]> {
    return this.prisma.simGatewayStatementEntry.findMany({
      where: orderExternalId ? { orderExternalId } : {},
      orderBy: [{ capturedAt: 'asc' }, { chargeId: 'asc' }],
      select: {
        chargeId: true,
        eventId: true,
        orderExternalId: true,
        amountCents: true,
        capturedAt: true,
      },
    });
  }
}
