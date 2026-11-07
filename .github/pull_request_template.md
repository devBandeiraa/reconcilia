## O quê

<!-- Resumo da mudança em 1 a 3 linhas. Fase e versão, se for o caso (ex.: Fase 2, v0.2.0). -->

## Por quê

<!-- O problema que resolve ou a decisão que implementa. Link para ADR, se houver. -->

## Como testar

<!-- Comandos e o resultado esperado. -->

```bash
pnpm install
pnpm lint && pnpm typecheck && pnpm test
```

## Checklist

- [ ] `pnpm lint && pnpm typecheck && pnpm test` passam local e no CI
- [ ] Critérios de aceite demonstrados (comandos + saída) neste PR
- [ ] CHANGELOG.md atualizado (Keep a Changelog)
- [ ] README.md atualizado (roadmap e o que muda para quem roda)
- [ ] ADR em docs/adr/ para cada decisão de arquitetura
- [ ] .env.example atualizado se surgiu variável nova
- [ ] Nenhum segredo no diff
