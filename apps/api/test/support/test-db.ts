import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client.js';

/** Banco só dos testes: nunca o de desenvolvimento. No CI vem de TEST_DATABASE_URL. */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://reconcilia:reconcilia@localhost:5440/reconcilia_test';

const TABLES = [
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

/** Esvazia todas as tabelas entre os testes. */
export async function truncateAll(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`TRUNCATE ${TABLES.map((t) => `"${t}"`).join(', ')} CASCADE`);
}
