# Changelog

Todas as mudanças relevantes deste projeto são registradas aqui.

O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto usa
[Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [Não lançado]

## [0.2.0] - 2026-11-07

### Adicionado

- Prisma 7 com o modelo de dados: `orders`, `payment_events`, `erp_events`, `ledger_entries`,
  `cases`, `investigations` e `actions` (snake_case, UUID v7, `timestamptz`, enums no Postgres).
- Migration inicial com garantias no banco: `event_id` único em `payment_events` e `erp_events`,
  índice único parcial para um só caso `OPEN` por (pedido, tipo), CHECKs de valor
  (`amount_cents > 0` no ledger, `>= 0` nos demais), `installments`, `received_count` e
  `confidence`, e FKs com `ON DELETE RESTRICT`.
- `erp_events` com `event_id` e `received_count`, para a ingestão do ERP ter a mesma idempotência
  do gateway.
- `PrismaService` (driver adapter `pg`) como módulo global do Nest.
- `DATABASE_URL` (runtime, pooler na Neon) e `DIRECT_URL` (CLI e migrations) no
  `apps/api/.env.example`; a `DATABASE_URL` é validada com Zod.
- Seed idempotente com 3 pedidos e os scripts `db:generate`, `db:migrate`, `db:deploy`,
  `db:seed` e `db:reset` (`pnpm db:reset` na raiz).
- Testes das garantias contra o banco real `reconcilia_test`, criado e migrado pelo
  `globalSetup` do Vitest.
- ADR 0002: garantias no banco.

### Alterado

- O CI expõe o Postgres na porta 5440, igual ao docker-compose, e define `TEST_DATABASE_URL`.
- O script `codegen` (shared + Prisma Client) roda antes de dev, build, lint, typecheck e
  testes, e também no `prepare`.

## [0.1.0] - 2026-11-07

### Adicionado

- Monorepo pnpm com `apps/api`, `apps/web`, `apps/simulator` e `packages/shared`, TypeScript
  strict e configs compartilhadas na raiz (tsconfig, ESLint com lint tipado, Prettier,
  EditorConfig).
- `packages/shared` com `HealthResponseSchema` (Zod), usado pela api e pela web.
- API NestJS com `GET /health`, env validado com Zod (a api não sobe com env inválido), logs com
  pino e Swagger em `/docs`, com o schema OpenAPI gerado do próprio Zod.
- Testes com Vitest e Supertest: contrato do `/health`, OpenAPI e validação do env.
- Web Next.js com Tailwind mostrando o status da api.
- Esqueleto do simulador com tsx.
- `docker-compose.yml` com PostgreSQL 17 (volume nomeado e healthcheck), na porta 5440 do host.
- husky + lint-staged + commitlint (Conventional Commits).
- CI no GitHub Actions (format, lint, typecheck e testes com serviço postgres), modelo de PR e
  formulários de issue.
- ADR 0001: monorepo com pnpm workspaces.

[Não lançado]: https://github.com/devBandeiraa/reconcilia/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/devBandeiraa/reconcilia/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/devBandeiraa/reconcilia/releases/tag/v0.1.0
