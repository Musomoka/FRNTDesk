import { inject } from '@angular/core';
import type { HttpInterceptorFn } from '@angular/common/http';
import { AuthStore } from './auth-store';

/**
 * Attaches `Authorization: Bearer <token>` to our own API calls when a
 * session exists. Scoped to `/api/` so a future call to some other origin
 * (e.g. an S3-hosted asset) never leaks the token.
 *
 * Deliberately does NOT yet handle a 401 by refreshing and retrying the
 * request — that needs a single in-flight refresh shared across any requests
 * that land concurrently (so five 401s don't trigger five refresh calls), and
 * is real, separate work for whichever feature first calls a protected
 * endpoint from the UI (host tools, checkout). Today only `/api/auth/me` is
 * guarded, and nothing in the app calls it yet.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(AuthStore).accessToken();

  if (!token || !req.url.startsWith('/api/')) {
    return next(req);
  }

  return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
};
