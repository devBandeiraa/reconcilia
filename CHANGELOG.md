# Changelog

Todas as mudanças relevantes deste projeto são registradas aqui.

O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto usa
[Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [Não lançado]

## [0.4.0] - 2026-11-07

### Adicionado

- Verificação da assinatura `X-Signature` (HMAC-SHA256 do corpo bruto, comparação em tempo
  constante) em todos os webhooks e no upload do extrato: assinatura ausente ou inválida
  responde `401` sem gravar nada.
- Ingestão idempotente: `INSERT ... ON CONFLICT (event_id) DO UPDATE SET received_count + 1` num
  único statement. Evento novo responde `202 {duplicate: false}`; reenvio responde
  `200 {duplicate: true}` e não enfileira.
- Fila pg-boss no próprio Postgres, com o job criado na mesma transação do evento; policy
  `exclusive` com `singletonKey = eventId`; retry com backoff exponencial e dead letter queue.
- Worker no mesmo processo da api, em lote e com liquidação por job: aplica cada evento do
  gateway uma única vez (`UPDATE ... WHERE processed_at IS NULL`), marca o pedido como `PAID` na
  captura e chama o ponto de extensão do ledger (no-op até a fase 5).
- `GET /admin/dlq`: eventos que esgotaram as tentativas, com a mensagem do último erro.
- `eventId` e `orderExternalId` em todas as linhas de log da requisição e do worker.
- `QUEUE_RETRY_LIMIT`, `QUEUE_RETRY_DELAY_SECONDS` e `QUEUE_POLLING_SECONDS` no
  `apps/api/.env.example`.
- Seção "Idempotência" no README e ADR 0004: fila no Postgres.

### Alterado

- `WebhookAck` ganha `duplicate`; o upload do extrato passa a responder `StatementAck`.
- O Prisma desconecta no `onApplicationShutdown`, depois do pg-boss parar.

## [0.3.0] - 2026-11-07

### Adicionado

- Simulador de loja, gateway e ERP (`apps/simulator`): gerador determinístico por seed (PRNG
  sem dependência), as três falhas (`lost`, `duplicate`, `mismatch`, no máximo uma por pedido) e
  o gabarito com os tipos de caso da conciliação.
- CLI `pnpm --filter simulator start` com `--orders`, `--lost`, `--duplicate`, `--mismatch`,
  `--seed`, `--json` e `--dry-run`; lê `API_URL` e `WEBHOOK_SECRET`.
- Contratos externos em `packages/shared`: `StoreWebhook` (`order.created`), `GatewayWebhook`
  (`charge.*`), `ErpWebhook` (`*.recorded`), extrato do gateway e opções/resultado da simulação.
- `POST /webhooks/store`, `/webhooks/gateway` e `/webhooks/erp`: validam com Zod, traduzem para
  o modelo interno, gravam o evento bruto e respondem `202`; reenvio é ignorado.
- Extrato do gateway simulado: tabela `sim_gateway_statement` (`charge_id` único, CHECK de
  valor) e `POST`/`GET /sim/gateway/statement` com filtro e paginação.
- `POST /simulate`: roda o mesmo gerador e devolve a seed e o gabarito.
- Mensagens assinadas com HMAC-SHA256 no header `X-Signature`, documentado no OpenAPI como
  esquema `webhookSignature`.
- `WEBHOOK_SECRET` validado: em produção, a api não sobe com o segredo de desenvolvimento nem
  com menos de 32 caracteres.
- ADR 0003: simulador determinístico e sistemas externos simulados.

### Corrigido

- A api se anunciava `0.1.0` no `/health` e no OpenAPI mesmo depois da v0.2.0: as versões dos
  pacotes passam a acompanhar a release. A web deixa de exibir versão fixa.

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

[Não lançado]: https://github.com/devBandeiraa/reconcilia/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/devBandeiraa/reconcilia/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/devBandeiraa/reconcilia/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/devBandeiraa/reconcilia/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/devBandeiraa/reconcilia/releases/tag/v0.1.0
