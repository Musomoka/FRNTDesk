import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import type { Env } from '../config/env.schema.js';

/**
 * Prisma 7 requires a driver adapter rather than a connection string in the
 * schema, so the pg pool is constructed here and handed to the client.
 *
 * Pool sizing note: the reconciliation worker and the HTTP server share this
 * pool. `max` is deliberately modest — mobile money polling is IO-bound on the
 * operator, not on Postgres, so a large pool buys nothing and just holds
 * connections open.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: ConfigService<Env, true>) {
    const adapter = new PrismaPg({
      connectionString: config.get('DATABASE_URL', { infer: true }),
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });

    super({
      adapter,
      log:
        config.get('NODE_ENV', { infer: true }) === 'development'
          ? ['warn', 'error']
          : ['error'],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Database connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Used by the health endpoint; cheap enough to run on every probe. */
  async isHealthy(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      this.logger.error('Database health check failed', error);
      return false;
    }
  }
}
