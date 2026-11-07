import { existsSync } from 'node:fs';
import { createApp } from './app.js';
import { type Env, loadEnv } from './config/env.js';

if (existsSync('.env')) process.loadEnvFile('.env');

let env: Env;
try {
  env = loadEnv();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const app = await createApp(env);
await app.listen(env.PORT);
