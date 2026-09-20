import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import type { Env } from './config/env.schema.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService<Env, true>);

  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use(cookieParser());

  // Credentials are on: the refresh token travels as an httpOnly cookie, so the
  // browser must be allowed to send it cross-origin to the API.
  app.enableCors({
    origin: config.get('WEB_ORIGIN', { infer: true }),
    credentials: true,
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
