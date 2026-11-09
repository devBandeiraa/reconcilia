# Reconcilia

Detecta pagamentos que não batem entre loja, gateway e ERP e usa um agente de IA para investigar
cada divergência. A IA sugere a correção; só uma pessoa aprova; o backend executa.
Projeto de portfólio: precisa provar idempotência e consistência (fintech), um agente com
ferramentas e limites claros (IA) e um produto no ar com demo clicável (startup).
Restrição: CUSTO ZERO. Nenhum serviço pago, nenhuma dependência que exija cartão.

## Stack
- Monorepo pnpm: apps/api (NestJS; o worker roda no mesmo processo), apps/web (Next.js App Router
  + Tailwind + shadcn/ui), apps/simulator (Node + tsx), packages/shared (schemas Zod e tipos).
- PostgreSQL + Prisma. Fila: pg-boss (no próprio Postgres). Sem Redis.
- IA: Gemini via SDK oficial @google/genai, plano gratuito, modelo em GEMINI_MODEL,
  sempre atrás da interface LlmClient.
- Testes: Vitest + Supertest, banco real via Docker Compose. Logs: pino. Docs da API: Swagger.
- Deploy: Neon (Postgres), Render Free (api + worker), Vercel Hobby (web).
- Node LTS atual, TypeScript strict em todos os pacotes.

## Regras invioláveis
- Dinheiro SEMPRE em centavos (Int). Datas SEMPRE em UTC no banco; fuso só na interface.
- Idempotência é garantida pelo BANCO (constraint única + UPDATE condicional). Código e fila
  são otimização, não garantia.
- Todo movimento de dinheiro passa pelo ledger e soma zero por transactionId.
- O modelo de IA NUNCA escreve no banco. Ferramentas do agente são somente leitura.
  O orderId vem do caso, nunca do texto do modelo. Ações só executam após aprovação humana.
- Tipos e DTOs nascem em packages/shared (Zod + z.infer). Proibido duplicar tipos.
- Variáveis de ambiente validadas com Zod na inicialização; app não sobe com env inválido.
- Testes NUNCA chamam o modelo real; use um LlmClient falso e roteirizado.
- Nenhum segredo no repositório. Só .env.example.

## Fluxo de trabalho (vale para toda fase)
1. Leia este arquivo, o README e o CHANGELOG. Mapeie o que existe.
2. Proponha um plano curto (arquivos, decisões, testes). PARE e espere meu ok.
3. Crie a branch da fase: fase/NN-nome.
4. Implemente em passos pequenos. Um commit por passo lógico, em português, Conventional
   Commits (feat, fix, test, refactor, docs, chore, ci), no meu nome (git config já configurado).
   Nunca adicione Co-Authored-By, Generated with ou qualquer atribuição de IA em commits e PRs.
5. Rode `pnpm lint && pnpm typecheck && pnpm test` antes de dizer que terminou.
6. Atualize a documentação (checklist abaixo).
7. Abra o PR para a main com o modelo .github/pull_request_template.md. PARE e espere meu ok
   para fazer o merge.
8. Depois do merge: tag anotada da versão, push da tag e release no GitHub com as notas do
   CHANGELOG (`gh release create vX.Y.Z --notes-file <arquivo>`).

## Pronto quando (Definition of Done de toda fase)
- [ ] lint, typecheck e testes passam local e no CI
- [ ] critérios de aceite da fase demonstrados (comandos + saída)
- [ ] CHANGELOG.md com a seção da versão (formato Keep a Changelog)
- [ ] README.md atualizado: status da fase no roadmap e o que mudou para quem vai rodar
- [ ] ADR em docs/adr/ para cada decisão de arquitetura tomada na fase
- [ ] .env.example atualizado se surgiu variável nova
- [ ] tag vX.Y.Z publicada e release criada

Não avance para a fase seguinte. Não instale dependência que a fase não pede.
Se algo do plano não for possível, diga antes de improvisar.
