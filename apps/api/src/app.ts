import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { addOperatorToken, addWebhookSignature } from './common/openapi-security.js';
import { ENV } from './config/config.module.js';
import type { Env } from './config/env.js';
import { API_VERSION } from './version.js';

/** rawBody: a assinatura HMAC dos webhooks é conferida sobre o corpo exato que chegou. */
export const APP_OPTIONS = { bufferLogs: true, rawBody: true } as const;

/** Monta a aplicação sem abrir porta. Usado pelo main.ts. */
export async function createApp(env: Env): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule.forRoot(env), APP_OPTIONS);
  return setupApp(app);
}

/** Logger, shutdown e Swagger. Separado para os testes montarem o app com providers trocados. */
export function setupApp(app: INestApplication): INestApplication {
  app.useLogger(app.get(Logger));
  // Atrás do proxy do Render: req.ip passa a ser o IP do cliente (X-Forwarded-For), e o limite
  // por IP do throttler vale por pessoa, não para todo mundo junto.
  const hops = app.get<Env>(ENV).TRUST_PROXY_HOPS;
  if (hops > 0) (app as NestExpressApplication).set('trust proxy', hops);
  app.enableShutdownHooks();
  // A web chama a api direto do navegador: só as origens configuradas.
  app.enableCors({ origin: app.get<Env>(ENV).CORS_ORIGIN, methods: ['GET', 'POST'] });

  const config = addOperatorToken(
    addWebhookSignature(
      new DocumentBuilder()
        .setTitle('Reconcilia API')
        .setDescription('Conciliação de pagamentos entre loja, gateway e ERP.')
        .setVersion(API_VERSION)
        .addServer('/', 'Mesma origem desta documentação'),
    ),
  ).build();
  SwaggerModule.setup('docs', app, () => SwaggerModule.createDocument(app, config));

  return app;
}
