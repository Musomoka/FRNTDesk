import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { Auth0Guard } from './auth0.guard.js';

@Module({
  controllers: [AuthController],
  providers: [AuthService, Auth0Guard],
  exports: [AuthService, Auth0Guard],
})
export class AuthModule {}
