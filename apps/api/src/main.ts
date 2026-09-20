import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import type { Env } from './config/env.schema.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService<Env, true>);

  app.setGlobalPrefix('api');
  app.use(helmet());

  // No cookies to carry: Auth0's SDK holds its own session client-side and
  // attaches the access token via an Authorization header, so `credentials`
  // doesn't need to be on here the way it did for the old cookie-based
  // refresh token.
  app.enableCors({
    origin: config.get('WEB_ORIGIN', { infer: true }),
  });

  // No global validation pipe: payloads are validated per route against the
  // zod schemas in @frntdesk/shared via ZodValidationPipe, which keeps one
  // definition shared with the web app rather than a parallel set of DTO
  // classes for class-validator.
  app.enableShutdownHooks();

  const port = config.get('API_PORT', { infer: true });
  await app.listen(port);
  new Logger('Bootstrap').log(`API listening on http://localhost:${port}/api`);
}

void bootstrap();
