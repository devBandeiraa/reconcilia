# ADR 0009: a web chama a api direto do navegador, com CORS e estado "acordando"

- Status: aceito
- Data: 2026-11-08
- Fase: 9 (v0.9.0)

## Contexto

A interface em Next.js precisa ler casos, investigações, o ledger e a fila de mortos, e disparar
ações: simular, conciliar, investigar, aprovar e recusar. A api roda no Render Free, que dorme
depois de 15 minutos sem uso e leva até um minuto para acordar. A web roda na Vercel Hobby.
Tudo precisa custar zero e continuar simples de rodar localmente.

Havia três caminhos:

1. **Server Components buscando na api.** O servidor da Vercel faria a chamada. Uma api
   dormindo prenderia a renderização até um minuto, sem como mostrar progresso, e cada clique
   de polling viraria uma função serverless.
2. **Proxy na própria web** (rewrites ou route handlers). Esconde a origem da api, mas cada
   chamada passa duas vezes pela rede e conta como invocação na Vercel. A api ainda dormiria do
   mesmo jeito.
3. **Navegador chamando a api direto.** A web vira um conjunto de páginas estáticas mais
   componentes cliente; a api libera a origem da web em CORS.

## Decisão

1. **O navegador chama a api direto.** `NEXT_PUBLIC_API_URL` diz onde ela está, validada com Zod
   no build (`apps/web/src/env.ts`). As páginas são componentes de servidor finos que só
   definem o título; todo o dado vem de componentes cliente.
2. **CORS restrito na api.** `CORS_ORIGIN` é uma lista de origens separadas por vírgula,
   validada como URLs, com padrão `http://localhost:3000`. Só `GET` e `POST` são liberados. Não
   há cookies nem credenciais, então não há `credentials: true`.
3. **Toda resposta é validada com o schema de `packages/shared`** (`apiRequest`). Se a api mudar
   o contrato, a tela mostra um erro em vez de dados errados.
4. **Estado "acordando" explícito.** O hook `useApi` mostra "Acordando o servidor…" quando a
   resposta passa de 3 segundos e, em erro de rede ou 502/503/504, tenta de novo a cada 3
   segundos por até 90 segundos. Erros 4xx aparecem na hora, com "Tentar de novo". O cabeçalho
   mostra o status da api (`GET /health` a cada 30 segundos).
5. **Polling só enquanto o agente trabalha.** A tela do caso busca `GET /investigations/:id` a
   cada 1,5 segundo enquanto a investigação está `QUEUED` ou `RUNNING` e para quando ela
   termina, recarregando o caso para o histórico.
6. **Fuso só na interface.** O detalhe do caso recebe `storeTimezone` da api e alterna entre UTC
   e o fuso da loja; o dado continua UTC.

## Consequências

- A primeira visita depois de a api dormir mostra o aviso e se recupera sozinha, sem recarregar.
- A web não tem servidor próprio de dados: pode ir para a Vercel como páginas estáticas mais uma
  rota dinâmica (`/casos/[id]`), sem custo de funções.
- A origem da web precisa estar em `CORS_ORIGIN` no deploy. Esquecer isso aparece como erro de
  rede no navegador, não como erro da api.
- A url da api fica visível no navegador. Como não há segredo no cliente e a api valida tudo,
  isso não muda o que um usuário consegue fazer; a proteção da demo pública fica para a fase 10.
- `NEXT_PUBLIC_API_URL` é embutida no build. Trocar a api exige um novo build da web.
