import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service.js';

/**
 * Protects routes that require a signed-in user. Reads the access token from
 * the `Authorization: Bearer <token>` header — not Passport, since verifying
 * one JWT against one secret doesn't need a strategy framework on top of it.
 * Attaches the decoded payload to `request.user` for `@CurrentUser()` to read.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers.authorization;

    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token.');
    }

    const token = header.slice('Bearer '.length);
    request.user = await this.auth.verifyAccessToken(token);
    return true;
  }
}
