import { execSync } from 'node:child_process';
import pg from 'pg';
import { TEST_DATABASE_URL } from './test-db.js';

/** Garante que o banco de teste existe e está com todas as migrations aplicadas. */
export default async function setup(): Promise<void> {
  const url = new URL(TEST_DATABASE_URL);
  const database = url.pathname.slice(1);
  url.pathname = '/postgres';

  const admin = new pg.Client({ connectionString: url.toString() });
  await admin.connect();
  try {
    const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      database,
    ]);
    if (rowCount === 0) await admin.query(`CREATE DATABASE "${database}"`);
  } finally {
    await admin.end();
  }

  execSync('pnpm exec prisma migrate deploy', {
    env: { ...process.env, DIRECT_URL: TEST_DATABASE_URL },
    stdio: 'ignore',
  });
}
