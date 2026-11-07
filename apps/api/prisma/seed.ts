// Seed de desenvolvimento: 3 pedidos, um em cada status. Idempotente (upsert por externalId).
import { PrismaPg } from '@prisma/adapter-pg';
import { OrderStatus, PrismaClient } from '../src/generated/prisma/client.js';
import { LOCAL_DATABASE_URL } from '../src/config/env.js';

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? LOCAL_DATABASE_URL;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const orders = [
  { externalId: 'LOJA-1001', status: OrderStatus.PAID, totalCents: 15990, installments: 1 },
  { externalId: 'LOJA-1002', status: OrderStatus.PENDING, totalCents: 32900, installments: 3 },
  { externalId: 'LOJA-1003', status: OrderStatus.CANCELED, totalCents: 8990, installments: 1 },
];

try {
  for (const order of orders) {
    await prisma.order.upsert({
      where: { externalId: order.externalId },
      create: order,
      update: {},
    });
  }
  console.log(`Seed: ${orders.length} pedidos (${orders.map((o) => o.externalId).join(', ')}).`);
} finally {
  await prisma.$disconnect();
}
