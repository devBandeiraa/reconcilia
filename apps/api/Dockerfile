# Imagem da api (o worker roda no mesmo processo). Build a partir da RAIZ do monorepo:
#   docker build -f apps/api/Dockerfile -t reconcilia-api .
#
# Estágio 1 compila shared, simulator e api; estágio 2 leva só o necessário para rodar, como
# usuário não root. As migrations rodam na subida (no plano Free do Render não há pre-deploy):
# `prisma migrate deploy` é idempotente, então reiniciar o container não faz mal.

ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-slim AS build
# openssl: o schema engine do Prisma (migrate) depende dele.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH HUSKY=0 CI=true
RUN corepack enable
WORKDIR /repo

# Manifests primeiro: a camada de dependências só muda quando o lockfile muda.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/simulator/package.json apps/simulator/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --ignore-scripts --filter . --filter "@reconcilia/api..."

COPY packages/shared packages/shared
COPY apps/simulator apps/simulator
COPY apps/api apps/api
# Os scripts de build das dependências (engines do Prisma) rodam agora, com o código presente.
RUN pnpm rebuild --filter "@reconcilia/api..." \
  && pnpm --filter @reconcilia/shared build \
  && pnpm --filter @reconcilia/simulator build \
  && pnpm --filter @reconcilia/api build \
  && pnpm --filter @reconcilia/api deploy --prod --legacy /out

FROM node:${NODE_VERSION}-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 3001
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && exec node dist/main.js"]
