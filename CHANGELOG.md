# Changelog

Todas as mudanças relevantes deste projeto são registradas aqui.

O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto usa
[Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [Não lançado]

## [1.0.0] - 2026-11-09

### Adicionado

- No ar, com custo zero (ADR 0014): web em https://reconcilia-seven.vercel.app, api e worker em
  https://reconcilia-api.onrender.com (Swagger em `/docs`) e Postgres 17 na Neon.
- Imagem Docker da api (`apps/api/Dockerfile`): multi-stage, usuário não root e
  `prisma migrate deploy` na subida.
- `render.yaml` (Blueprint do Render, com os segredos gerados pelo Render) e
  `apps/web/vercel.json` (build do monorepo na Vercel).
- Proteção da demo pública:
  - limite por IP com `@nestjs/throttler`: geral (`THROTTLE_PER_MINUTE`, 120) e nas rotas pesadas
    (`THROTTLE_HEAVY_PER_MINUTE`, 10); health e webhooks ficam de fora;
  - teto diário de investigações (`DEMO_MAX_INVESTIGATIONS_PER_DAY`, 50), com 429;
  - `TRUST_PROXY_HOPS` para o IP real atrás do proxy.
- Workflow de release (`.github/workflows/release.yml`): a tag `vX.Y.Z` publica a release com a
  seção do CHANGELOG.
- Seção "No ar" no README, com a arquitetura de deploy, e links reais para a demo e o Swagger.

### Alterado

- Em produção, `CORS_ORIGIN` só aceita origens https que não sejam `localhost`.
- Na Vercel, o build da web falha sem `NEXT_PUBLIC_API_URL` https.
- `prisma` passa a dependência de execução da api (as migrations rodam no container).
- O passo 8 do fluxo no CLAUDE.md: a release sai do workflow ao enviar a tag.
- 115 testes (97 da api e 18 do simulador).

### Corrigido

- Um `GET /cases` durante o `/simulate` podia responder 500 (P2028): as transações agora esperam
  até 10 s por uma conexão do pool, em vez de 2 s.
- Teste de "timestamp trocado" com corrida na virada do segundo.

## [0.11.0] - 2026-11-09

### Adicionado

- Identidade visual (ADR 0013):
  - símbolo do sinal de igual cujo traço de baixo vira um visto, favicon (`app/icon.svg`), logo
    no cabeçalho e `docs/img/logo.svg` no topo do README;
  - tokens de cor no `globals.css`: `--primary` e `--ring` no verde da marca e os semânticos
    `--status-attention`, `--status-ok` e `--status-muted`, nos temas claro e escuro.
- Prévia de link: `app/opengraph-image.tsx` e `app/twitter-image.tsx` (1200×630, com o símbolo,
  "A IA sugere. Uma pessoa aprova." e "loja · gateway · ERP") e metadata `openGraph` e
  `twitter` (`summary_large_image`).
- Script de capturas com Playwright (`pnpm --filter @reconcilia/web capturas`), que grava as
  quatro capturas e o `fluxo.gif` a partir de um banco vazio. Dependências de desenvolvimento:
  `playwright`, `pngjs` e `gifenc`.

### Alterado

- Regra de cor nas telas: cor só para status (Aberto em atenção, Resolvido em ok, Descartado em
  cinza). Tipos de divergência viram ícone e rótulo, sem cor própria. Com o filtro já fixando o
  status, a linha mostra o status como texto, sem selo.
- Contadores do topo com número neutro e o ícone do tipo, em uma linha a partir da tela média.
- Barra de confiança do agente na cor da marca; nomes das ferramentas nos passos em cinza.
- O tema passa a seguir o sistema (`prefers-color-scheme`) em vez de forçar o escuro.
- Anel de foco dos componentes na cor cheia da marca (era 50%).
- Capturas e GIF do README refeitos com a identidade nova (o GIF caiu de 830 KB para 260 KB).

### Removido

- Todas as cores fixas do Tailwind nas telas (`sky`, `amber`, `fuchsia`, `rose`, `orange`,
  `emerald`, `zinc`, `red`) e os tokens não usados do shadcn (`chart-*`, `sidebar-*`).

## [0.10.0] - 2026-11-08

### Adicionado

- Caso `CAPTURE_ON_CANCELED_ORDER`: o pedido está `CANCELED` na loja, mas o extrato do gateway
  tem captura dele que os estornos não cobrem. O ledger continua registrando a captura; a
  conciliação abre o caso (ADR 0010).
- Webhook da loja `order.canceled`: cancela só pedido `PENDING` (UPDATE condicional, com
  `canceled_at`); reenvio não muda nada; pedido que ainda não existe responde 409.
- Ação `REFUND_CAPTURE { chargeId }`: aceita só se a cobrança está no extrato e o pedido está
  `CANCELED`. Aprovada, lança débito `REFUNDS` / crédito `GATEWAY_RECEIVABLE` com o valor do
  extrato e `transactionId = refund-capture:<chargeId>`, um estorno por cobrança.
- Simulador: falha `--canceled` (padrão 0.1) e o tipo novo no gabarito; `cancellations` nos
  totais.
- Prompt do agente `system.v2.md` e roteiro do modo demonstração para o tipo novo.
- `POST /session { operator }`: token de operador assinado (HMAC-SHA256, 24h). Aprovar e recusar
  exigem `Authorization: Bearer`; sem token válido, 401 (ADR 0011).
- `SESSION_SECRET` e `WEBHOOK_TOLERANCE_SECONDS` no `apps/api/.env.example`, validados na subida.
- Web: nome de operador escolhido uma vez (lembrado por 24h), operador no cabeçalho, e o tipo novo
  de caso com filtro, contador, selo, a ação "Estornar a captura" e o cancelamento na linha do
  tempo.
- Hook `commit-msg` que remove linhas de coautoria do Claude antes do commitlint.

### Alterado

- **Quebra de contrato:** `X-Signature` passa ao formato `t=<unix>,v1=<hmac de "<t>.<corpo>">`.
  Assinaturas fora da janela de 300s (passado ou futuro) são recusadas com 401, e mais de um `v1`
  é aceito para trocar o segredo. O formato `sha256=` deixa de valer (ADR 0012).
- **Quebra de contrato:** `decidedBy` no corpo de aprovar e recusar é ignorado; quem decide é o
  operador do token, inclusive na trilha de auditoria.
- `POST /reconcile` devolve `opened.CAPTURE_ON_CANCELED_ORDER`, e `GET /cases/:id` traz
  `order.canceledAt`.
- README e CHANGELOG com o número exato de testes: 110 (92 da api e 18 do simulador). O README
  dizia 92 no total.

### Segurança

- Webhooks com timestamp assinado: um corpo capturado não serve mais para reenviar depois de 5
  minutos.
- A auditoria deixa de confiar num nome digitado em cada requisição.

## [0.9.0] - 2026-11-08

### Adicionado

- Interface em Next.js 16 com shadcn/ui (Radix) e Tailwind 4, em português e no tema escuro:
  - `/casos`: contadores de abertos por tipo e de resolvidos (clicar filtra), filtros de tipo e
    status, paginação de 20 em 20, tabela no desktop e cartões no celular. Os botões "Gerar
    falhas" (`POST /simulate`) e "Conciliar agora" (`POST /reconcile`) mostram o resultado numa
    mensagem lida pelo leitor de tela.
  - `/casos/[id]`: loja, gateway (com o extrato) e ERP lado a lado, linha do tempo com
    duplicados em âmbar (×N), alternância entre UTC e o fuso da loja e histórico do caso.
  - Painel do agente: "Investigar" com polling a cada 1,5s enquanto a investigação roda; passos,
    diagnóstico, evidências, barra de confiança e a ação sugerida. "Aprovar" e "Recusar" (com
    motivo, num diálogo) pedem o nome de quem decide, lembrado no navegador.
  - `/saude`: saldo do ledger por conta com a conferência da soma zero, fila de mortos e
    `GET /health`.
- Estados de carregando, vazio, erro com "Tentar de novo" e "Acordando o servidor…" (api do
  plano gratuito dormindo), com novas tentativas por até 90s.
- Status da api no cabeçalho, link para pular para o conteúdo, foco visível e rótulos em todos
  os campos.
- Na api: `CORS_ORIGIN` (lista de origens), e o `GET /cases/:id` passa a trazer as
  investigações do caso e o fuso da loja (`storeTimezone`).
- `NEXT_PUBLIC_API_URL` na web, validada com Zod no build.
- GIF do fluxo completo e capturas em `docs/img/`, e ADR 0009.

## [0.8.0] - 2026-11-08

### Adicionado

- `POST /actions/:id/approve` (`{ decidedBy }`): aprova e o backend executa uma única vez, com
  transições condicionais no banco; efeito, caso `RESOLVED` e auditoria no mesmo COMMIT.
- `POST /actions/:id/reject` (`{ decidedBy, reason? }`): nada é executado e o caso segue `OPEN`.
- `GET /actions/:id`: decisão, resultado da execução e trilha de auditoria.
- Efeitos das ações: `MARK_ORDER_PAID` (pedido `PAID` e captura no ledger com o mesmo
  `transactionId` do worker), `REPROCESS_WEBHOOK` (reenfileira se não foi aplicado),
  `FLAG_ERP_DIVERGENCE` (pedido de ajuste ao ERP simulado, idempotente por ação) e
  `IGNORE_DUPLICATE` (encerra o caso).
- Falha no efeito: nada é gravado, a ação segue `APPROVED` e a resposta é 422.
- Trilha de auditoria `audit_log` (append-only por trigger) e o histórico do caso com as decisões
  e execuções.
- ERP simulado: tabela `sim_erp_adjustments` atrás da interface `ErpAdjustmentSink`.
- Seção "Aprovação humana" no README e ADR 0008.

### Alterado

- A conciliação não reabre casos resolvidos ou descartados; o resultado ganha `alreadyResolved`.
- O ledger devolve o que fez (`posted`, `already-posted` ou `skipped`).

## [0.7.0] - 2026-11-08

### Adicionado

- Agente de IA investigador: loop de function calling com no máximo 8 rodadas, prompt de
  sistema versionado (`prompts/system.v1.md`) e as ferramentas `getOrder`, `getGatewayEvents`,
  `getGatewayStatement` e `getErpEvents` (sem parâmetros; o pedido vem do caso), mais o
  `submitDiagnosis`.
- Ferramentas em transação `READ ONLY`: o Postgres recusa qualquer escrita feita por elas.
- `submitDiagnosis` validado com Zod (`params` estritos por tipo de ação, sem `orderId`) e
  conferido contra os dados do pedido; inválido volta ao modelo uma vez e, na segunda, a
  investigação fica `FAILED`.
- Interface `LlmClient` com `GeminiClient` (`@google/genai` 3.0.0), `FakeLlmClient` (testes) e
  `ReplayLlmClient` (modo demonstração com roteiros JSON por tipo de caso).
- `POST /cases/:id/investigate` (202; 200 se já há investigação ativa; 409 se o caso não está
  `OPEN`) e `GET /investigations/:id` para polling; o worker grava `DONE` + action `PENDING` ou
  `FAILED` com o motivo.
- Coluna `investigations.evidence` e índice único parcial: uma investigação ativa por caso.
- Investigações interrompidas (a api reiniciou) viram `FAILED` na subida.
- O histórico do caso mostra as investigações.
- `DEMO_REPLAY` (padrão `true`), `GEMINI_API_KEY`, `GEMINI_MODEL` (padrão `gemini-3.5-flash`) e
  `STORE_TIMEZONE` no `apps/api/.env.example`.
- Seção "Agente de IA" no README e ADR 0007.

### Alterado

- Retry do SDK do Gemini só em 5xx (3 tentativas, até 8s) e timeout de 60s; 429 falha na hora.

## [0.6.0] - 2026-11-08

### Adicionado

- Conciliação entre loja, gateway e ERP por pedido, com três tipos de caso:
  `PAYMENT_WITHOUT_ORDER` (captura no extrato, pedido `PENDING` e nenhum `charge.captured`
  recebido), `DUPLICATE_WEBHOOK` (`received_count > 1`) e `AMOUNT_MISMATCH` (extrato, pedido e ERP
  não batem).
- Abertura idempotente de casos: `ON CONFLICT DO NOTHING` contra o índice único parcial; a
  divergência que já tem caso aberto conta em `alreadyOpen`.
- `POST /reconcile`: roda na hora e devolve os casos abertos por tipo.
- Conciliação agendada no pg-boss (cron em UTC, padrão a cada 5 minutos) numa fila `singleton`;
  `RECONCILIATION_CRON` no `.env.example` (`off` desliga).
- `GET /cases` (filtros por tipo e status, paginação) e `GET /cases/:id` (pedido, linha do tempo
  dos três lados em UTC e ordem cronológica, duplicado destacado, histórico).
- Interface `GatewayStatementSource`: a conciliação lê o extrato sem depender da tabela simulada.
- Seção "Conciliação" no README e ADR 0006.

## [0.5.0] - 2026-11-08

### Adicionado

- Ledger em partidas dobradas: `LedgerService.post(tx, transactionId, lançamentos, descrição)`
  exige 2+ lançamentos, centavos inteiros positivos e débitos = créditos; senão lança
  `LedgerUnbalancedError` antes de gravar.
- Tabela `ledger_transactions` (`transaction_id` como PK): postar a mesma transação de novo
  devolve `already-posted` sem gravar lançamentos.
- Garantias no banco: trigger diferido que confere no COMMIT a soma zero e os 2+ lançamentos por
  transação, e triggers que tornam o ledger append-only (UPDATE e DELETE recusados).
- Worker lança a captura (débito `GATEWAY_RECEIVABLE` / crédito `ORDER_REVENUE`) e o estorno
  (débito `REFUNDS` / crédito `GATEWAY_RECEIVABLE`) na mesma transação que aplica o evento, com
  `transactionId` derivado do `eventId`.
- `GET /ledger/balance`: débitos, créditos e saldo por conta e o total (sempre 0), lidos num
  snapshot `REPEATABLE READ`.
- Seção "Ledger" no README e ADR 0005.

### Alterado

- O `LedgerService` substitui o ledger no-op da v0.4.0.

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

[Não lançado]: https://github.com/devBandeiraa/reconcilia/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/devBandeiraa/reconcilia/compare/v0.11.0...v1.0.0
[0.11.0]: https://github.com/devBandeiraa/reconcilia/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/devBandeiraa/reconcilia/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/devBandeiraa/reconcilia/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/devBandeiraa/reconcilia/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/devBandeiraa/reconcilia/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/devBandeiraa/reconcilia/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/devBandeiraa/reconcilia/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/devBandeiraa/reconcilia/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/devBandeiraa/reconcilia/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/devBandeiraa/reconcilia/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/devBandeiraa/reconcilia/releases/tag/v0.1.0
