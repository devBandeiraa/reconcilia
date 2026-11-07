import { Injectable } from '@nestjs/common';
import type {
  GatewayStatementEntry,
  GatewayStatementPage,
  GatewayStatementQuery,
} from '@reconcilia/shared';
import { PrismaService } from '../prisma/prisma.service.js';

/** Extrato do gateway simulado: o simulador publica, a conciliação (fase 6) consulta. */
@Injectable()
export class GatewayStatementService {
  constructor(private readonly prisma: PrismaService) {}

  async upload(entries: GatewayStatementEntry[]): Promise<void> {
    await this.prisma.simGatewayStatementEntry.createMany({
      data: entries.map((entry) => ({
        chargeId: entry.chargeId,
        eventId: entry.eventId,
        orderExternalId: entry.orderReference,
        amountCents: entry.amountCents,
        capturedAt: new Date(entry.capturedAt),
      })),
      skipDuplicates: true,
    });
  }

  async list(query: GatewayStatementQuery): Promise<GatewayStatementPage> {
    const where = query.orderReference ? { orderExternalId: query.orderReference } : {};
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.simGatewayStatementEntry.findMany({
        where,
        orderBy: [{ capturedAt: 'asc' }, { chargeId: 'asc' }],
        skip: query.offset,
        take: query.limit,
      }),
      this.prisma.simGatewayStatementEntry.count({ where }),
    ]);

    return {
      data: rows.map((row) => ({
        chargeId: row.chargeId,
        eventId: row.eventId,
        orderReference: row.orderExternalId,
        amountCents: row.amountCents,
        capturedAt: row.capturedAt.toISOString(),
      })),
      pagination: { limit: query.limit, offset: query.offset, total },
    };
  }
}
