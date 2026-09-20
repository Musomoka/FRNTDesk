import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Reads the Auth0 `sub` claim Auth0Guard verified: `@CurrentAuth0Sub() sub: string`.
 * Only `sub` is exposed — it's the one claim on the access token this app
 * actually trusts; everything else about the user comes from our own User
 * row via AuthService.syncUser.
 */
export const CurrentAuth0Sub = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest<Request>();
  const sub = request.auth?.payload.sub;
  if (!sub) {
    // Auth0Guard runs first and would already have rejected the request if
    // this were ever reachable without a verified `sub` — a thrown error
    // here means the guard was skipped, not that the token was invalid.
    throw new Error('CurrentAuth0Sub used without Auth0Guard on the route.');
  }
  return sub;
});
