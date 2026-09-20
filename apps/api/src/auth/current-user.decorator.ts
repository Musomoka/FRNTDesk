import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AccessTokenPayload } from './auth.service.js';

/** Reads the payload JwtAuthGuard attached to the request: `@CurrentUser() user: AccessTokenPayload`. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AccessTokenPayload => {
  const request = ctx.switchToHttp().getRequest<Request>();
  return request.user as AccessTokenPayload;
});
