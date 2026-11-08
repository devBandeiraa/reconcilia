import type { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';

/**
 * Roda a leitura numa transação READ ONLY: o próprio Postgres recusa qualquer INSERT, UPDATE
 * ou DELETE ali dentro. É a garantia de que as ferramentas do agente não escrevem no banco,
 * mesmo que um bug tente.
 */
export function readOnly<T>(
  prisma: PrismaService,
  read: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    return read(tx);
  });
}
