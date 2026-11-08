import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client.js';

/** Banco só dos testes: nunca o de desenvolvimento. No CI vem de TEST_DATABASE_URL. */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://reconcilia:reconcilia@localhost:5440/reconcilia_test';

const TABLES = [
  'audit_log',
  'sim_erp_adjustments',
  'actions',
  'investigations',
  'cases',
  'ledger_entries',
  'ledger_transactions',
  'erp_events',
  'payment_events',
  'orders',
  'sim_gateway_statement',
];

export function createTestPrisma(): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: TEST_DATABASE_URL }) });
}

/**
 * Esvazia todas as tabelas entre os testes. O TRUNCATE trava as tabelas em sequência e pode
 * cruzar locks com o worker terminando um job do teste anterior (deadlock 40P01): tenta de novo.
 */
export async function truncateAll(prisma: PrismaClient): Promise<void> {
  const sql = `TRUNCATE ${TABLES.map((t) => `"${t}"`).join(', ')} CASCADE`;
  for (let attempt = 1; ; attempt++) {
    try {
      await prisma.$executeRawUnsafe(sql);
      return;
    } catch (error) {
      const deadlock = String(error).includes('40P01');
      if (!deadlock || attempt === 5) throw error;
    }
  }
}
