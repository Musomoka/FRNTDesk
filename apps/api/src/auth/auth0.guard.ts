import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { auth, type AuthResult } from 'express-oauth2-jwt-bearer';
import type { Request, Response } from 'express';
import type { Env } from '../config/env.schema.js';

/**
 * Protects routes that require a signed-in user. Wraps Auth0's own
 * `express-oauth2-jwt-bearer` middleware — the officially maintained package
 * for exactly this — rather than hand-rolling JWKS fetching and RS256
 * verification: Auth0 rotates its signing keys, and this handles that
 * transparently (it caches the JWKS and re-fetches on a `kid` it doesn't
 * recognize) in a way a hand-written verifier easily gets wrong.
 *
 * The access token only proves `sub` (the Auth0 user id) — see
 * AuthService.syncUser for why profile fields (email, name) are trusted from
 * the request body instead, not from this token.
 */
@Injectable()
export class Auth0Guard implements CanActivate {
  private readonly checkJwt: ReturnType<typeof auth>;

  constructor(config: ConfigService<Env, true>) {
    const domain = config.get('AUTH0_DOMAIN', { infer: true });
    this.checkJwt = auth({
      issuerBaseURL: `https://${domain}/`,
      audience: config.get('AUTH0_AUDIENCE', { infer: true }),
    });
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();

    await new Promise<void>((resolve, reject) => {
      this.checkJwt(req, res, (err?: unknown) => (err ? reject(err) : resolve()));
    }).catch((err: unknown) => {
      // Normalized to Nest's own exception shape rather than letting
      // express-oauth2-jwt-bearer's error (a different JSON shape) leak
      // straight through.
      const message = err instanceof Error ? err.message : 'Invalid or expired access token.';
      throw new UnauthorizedException(message);
    });

    return true;
  }
}

export type { AuthResult };
