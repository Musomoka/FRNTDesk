import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

@Module({
  // Registered with no default secret/options: AuthService signs and verifies
  // explicitly per-call with the access-token secret from ConfigService,
  // since the module is also handed the (differently-keyed) refresh secret.
  // A single implicit default here would be easy to reach for by mistake.
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard],
  exports: [AuthService, JwtAuthGuard],
})
export class AuthModule {}
