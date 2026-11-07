import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

if (existsSync('.env')) process.loadEnvFile('.env');

// A CLI (migrations, seed, introspecção) usa a conexão DIRETA. Na Neon, a DATABASE_URL do app
// passa pelo pooler, que não serve para migrations. Localmente as duas apontam para o mesmo banco.
const LOCAL_DATABASE_URL = 'postgresql://reconcilia:reconcilia@localhost:5440/reconcilia';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DIRECT_URL ?? LOCAL_DATABASE_URL,
  },
});
