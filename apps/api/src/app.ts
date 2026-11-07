import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { addWebhookSignature } from './common/openapi-security.js';
import type { Env } from './config/env.js';
import { API_VERSION } from './version.js';

/** Monta a aplicação sem abrir porta. Usado pelo main.ts e pelos testes. */
export async function createApp(env: Env): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule.forRoot(env), { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();

  const config = addWebhookSignature(
    new DocumentBuilder()
      .setTitle('Reconcilia API')
      .setDescription('Conciliação de pagamentos entre loja, gateway e ERP.')
      .setVersion(API_VERSION)
      .addServer('/', 'Mesma origem desta documentação'),
  ).build();
  SwaggerModule.setup('docs', app, () => SwaggerModule.createDocument(app, config));

  return app;
}
