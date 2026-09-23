import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module.js';
import { HealthController } from './health.controller.js';
import { validateEnv, type Env } from './config/env.schema.js';
import { AuthModule } from './auth/auth.module.js';
import { OrganisationsModule } from './organisations/organisations.module.js';
import { ClassroomsModule } from './classrooms/classrooms.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { InvitationsModule } from './invitations/invitations.module.js';
import { LiveModule } from './live/live.module.js';
import { RecordingsModule } from './recordings/recordings.module.js';
import { MailModule } from './mail/mail.module.js';

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
    // One Redis connection for every queue, built from the same REDIS_URL the
    // compose stack exposes.
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        connection: { url: config.get('REDIS_URL', { infer: true }) },
      }),
    }),
    PrismaModule,
    MailModule,
    AuthModule,
    OrganisationsModule,
    ClassroomsModule,
    PaymentsModule,
    InvitationsModule,
    LiveModule,
    RecordingsModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
