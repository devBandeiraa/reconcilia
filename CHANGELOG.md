# Changelog

Todas as mudanças relevantes deste projeto são registradas aqui.

O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto usa
[Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [Não lançado]

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

[Não lançado]: https://github.com/devBandeiraa/reconcilia/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/devBandeiraa/reconcilia/releases/tag/v0.1.0
