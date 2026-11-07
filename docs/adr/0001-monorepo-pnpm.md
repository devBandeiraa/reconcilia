# ADR 0001: monorepo com pnpm workspaces

- Status: aceito
- Data: 2026-11-07
- Fase: 1 (v0.1.0)

## Contexto

O Reconcilia tem três aplicações (api NestJS, web Next.js e simulador) que precisam falar a mesma
língua: os payloads dos webhooks, os casos e as ações sugeridas pelo agente. Se cada app definir
seus próprios tipos, eles divergem sem ninguém notar, e o erro só aparece em produção.

A restrição de custo zero e o tamanho do projeto (uma pessoa) pedem pouca infraestrutura de build.

## Decisão

- Um único repositório com **pnpm workspaces**: `apps/api`, `apps/web`, `apps/simulator` e
  `packages/shared`.
- `packages/shared` é a única fonte de tipos e DTOs: schemas Zod e tipos via `z.infer`. Ele compila
  para `dist/` com `tsc` e as apps dependem dele por `workspace:*`.
- Configs compartilhadas na raiz (`tsconfig.base.json`, `eslint.config.js`, Prettier), que cada
  pacote estende.
- Tudo em ESM (`"type": "module"`), porque o NestJS 12 é distribuído só como ESM.
- Scripts da raiz orquestram com `pnpm -r` e `--filter`; o pacote shared é compilado antes de lint,
  typecheck e testes.
- Versões de dependências fixadas (sem `^`), com lockfile versionado e a política de idade mínima
  de release do pnpm ativa. Scripts de instalação só são liberados explicitamente
  (`allowBuilds` em `pnpm-workspace.yaml`).

## Alternativas consideradas

- **Repositórios separados**: compartilhar tipos exigiria publicar um pacote a cada mudança. Lento
  e fácil de esquecer.
- **Turborepo ou Nx**: trazem cache e builds incrementais, mas com 4 pacotes o ganho não paga a
  configuração e a dependência extra. Podem entrar depois, se o CI ficar lento.
- **npm ou Yarn workspaces**: o pnpm é mais rápido, economiza disco e é estrito com dependências
  não declaradas, o que evita importar por acidente um pacote que só existe por ser transitivo.

## Consequências

- Uma mudança em `packages/shared` quebra o typecheck da api e da web na hora, que é o objetivo.
- `packages/shared` precisa ser compilado antes das apps: o `prepare` faz isso após o
  `pnpm install` e o `pnpm dev` deixa o shared em modo watch.
- O TypeScript está fixado na 6.0, porque `typescript-eslint` e `@nestjs/swagger` ainda não aceitam
  a 7.0. A atualização fica para quando as ferramentas suportarem.
