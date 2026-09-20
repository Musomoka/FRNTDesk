import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from './prisma/prisma.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Liveness: the process is up. Deliberately does not touch the database. */
  @Get()
  @SkipThrottle()
  live(): { status: string } {
    return { status: 'ok' };
  }

  /** Readiness: the process can actually serve traffic. */
  @Get('ready')
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  async ready(): Promise<{ status: string; database: boolean }> {
    const database = await this.prisma.isHealthy();
    return { status: database ? 'ok' : 'degraded', database };
  }
}
