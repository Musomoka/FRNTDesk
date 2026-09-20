import { inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Router, type CanActivateFn } from '@angular/router';
import { filter, map, take } from 'rxjs';
import { AuthStore } from './auth-store';

/**
 * Guards routes that only make sense while signed out: the marketing landing
 * page, login, register, forgot/reset password. A signed-in user is sent to
 * the catalog instead — logged-in users never see marketing copy or an
 * auth form they don't need.
 *
 * Same `ready()` wait as authGuard, for the same reason — see there.
 */
export const redirectIfAuthenticatedGuard: CanActivateFn = () => {
  const auth = inject(AuthStore);
  const router = inject(Router);

  return toObservable(auth.ready).pipe(
    filter((ready) => ready),
    take(1),
    map(() => (auth.isAuthenticated() ? router.createUrlTree(['/classes']) : true)),
  );
};
