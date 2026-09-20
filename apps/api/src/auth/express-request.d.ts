import type { AccessTokenPayload } from './auth.service.js';

// Augments Express's Request with the field JwtAuthGuard attaches, so
// `request.user` type-checks at both the guard and `@CurrentUser()`.
declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}
