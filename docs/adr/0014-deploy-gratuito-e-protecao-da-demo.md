# ADR 0014: deploy gratuito (Render, Neon e Vercel) e proteção da demo pública

- Status: aceito
- Data: 2026-11-09
- Versão: v1.0.0

## Contexto

Sem um link no ar, quem avalia o projeto teria de clonar e subir Docker, e quase ninguém faz isso.
A restrição continua sendo custo zero: nenhum serviço pago e nenhuma conta que exija cartão. Uma
demo pública também convida abuso: qualquer pessoa pode gerar falhas, conciliar e investigar sem
parar, gastando o banco gratuito e a cota do modelo.

## Decisão

1. **Render Free para api + worker** (o worker roda no mesmo processo, ADR 0004), com imagem
   Docker própria:
   - multi-stage: o build compila shared, simulator e api, e `pnpm deploy --prod` monta só o que
     a api usa;
   - a imagem final roda como o usuário `node`, não root;
   - **migrations na subida** (`prisma migrate deploy && node dist/main.js`): o plano Free não tem
     pre-deploy, e o `migrate deploy` é idempotente;
   - `render.yaml` (Blueprint) descreve o serviço; os segredos de webhook e de sessão são gerados
     pelo Render (`generateValue`) e nunca passam pelo repositório.
2. **Neon Free para o Postgres**, na mesma região do Render (AWS us-east-1 e Virginia). A api usa
   a URL com pooler (`DATABASE_URL`); a CLI do Prisma, a direta (`DIRECT_URL`).
3. **Vercel Hobby para a web**, com `vercel.json` no `apps/web`: instala só a web e o que ela usa do
   workspace e compila o `shared` antes do Next. Na Vercel, `NEXT_PUBLIC_API_URL` é obrigatória e
   precisa ser https; sem ela, o bundle apontaria para localhost sem ninguém perceber.
4. **Proteção da demo**, sem serviço extra:
   - `@nestjs/throttler` por IP: um limite geral (`THROTTLE_PER_MINUTE`, 120) e um para as rotas
     pesadas (`THROTTLE_HEAVY_PER_MINUTE`, 10: simular, conciliar, investigar). Health e webhooks
     ficam fora: o Render consulta o health o tempo todo, e o `/simulate` manda os webhooks em
     rajada para a própria api, já autenticados por HMAC;
   - `trust proxy` (`TRUST_PROXY_HOPS`, 1) para o limite valer por pessoa atrás do proxy do Render;
   - teto diário de investigações (`DEMO_MAX_INVESTIGATIONS_PER_DAY`, 50), contado no banco em UTC,
     com 429 e mensagem clara;
   - `DEMO_REPLAY=true` por padrão; o Gemini real só com chave configurada;
   - CORS só para a origem da Vercel; em produção, a api não sobe com origem `http` ou `localhost`.
5. **Transações esperam até 10s por uma conexão** (`maxWait`). No aceite, um `GET /cases` durante o
   `/simulate` deu 500 (P2028): o padrão do Prisma desiste em 2s quando o pool está ocupado com as
   gravações em rajada.
6. **Release por tag:** `.github/workflows/release.yml` cria a release com a seção do CHANGELOG ao
   receber a tag `vX.Y.Z`. O passo manual de `gh release create` sai do fluxo do CLAUDE.md.

## Alternativas consideradas

- **Outras plataformas para a api (Fly.io, Railway, Koyeb):** não foram avaliadas a fundo. O
  Render atende ao que importa aqui: plano gratuito sem cartão, deploy por Docker e Blueprint
  versionado no repositório.
- **Banco do próprio Render:** o Postgres gratuito do Render expira; a Neon não.
- **Migrations num job separado ou no build:** o plano Free não tem pre-deploy, e rodar no build
  exigiria acesso ao banco durante o build da imagem.
- **Limite por IP no banco ou em Redis:** com uma instância só, a memória basta; Redis seria um
  serviço a mais, contra a restrição do projeto.
- **Autenticação de verdade para a demo:** afastaria quem só quer clicar. A identificação de
  operador (ADR 0011) e os limites cobrem o abuso que importa aqui.

## Consequências

- **Cold start:** a api dorme depois de 15 minutos sem uso e leva cerca de 1 minuto para acordar;
  a web avisa e tenta de novo por até 90 segundos.
- **Banco gratuito:** a Neon suspende o banco sem uso. O polling do worker (`QUEUE_POLLING_SECONDS`
  = 5 em produção) o mantém acordado só enquanto a api está acordada.
- **Limite em memória:** zera quando a api reinicia e valeria por instância se houvesse mais de uma.
- **Imagem grande:** cerca de 900 MB, por causa das engines do Prisma e das dependências de
  execução. O plano Free comporta.
- **Deploy pela branch da fase:** o aceite foi feito com Render e Vercel apontando para
  `fase/10-deploy`; depois do merge, os dois passam a seguir a `main`.
