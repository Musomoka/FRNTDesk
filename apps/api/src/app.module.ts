import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module.js';
import { HealthController } from './health.controller.js';
import { validateEnv } from './config/env.schema.js';
import { AuthModule } from './auth/auth.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // One .env at the repo root, shared with the compose stack and the web app.
      envFilePath: ['../../.env', '.env'],
      validate: validateEnv,
      cache: true,
    }),
    // A global floor. Auth and checkout tighten this further with their own
    // per-route limits, since those are the endpoints worth attacking.
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 120 }],
    }),
    PrismaModule,
    AuthModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
