import { inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Router, type CanActivateFn } from '@angular/router';
import { filter, map, take } from 'rxjs';
import { AuthStore } from './auth-store';

/**
 * Guards every route that requires a signed-in user (checkout, host tools,
 * live room, library, account). Carries the attempted URL through so login
 * can return the user to where they were headed.
 *
 * Waits for `AuthStore.ready()` before deciding — Auth0 needs one async pass
 * (checking local session state, consuming a redirect callback) before it
 * can say whether the user is authenticated at all. Deciding synchronously
 * on the initial `false` would bounce a genuinely logged-in user to /login
 * on every hard refresh.
 *
 * Verification (e.g. gating classroom *publishing*) is deliberately not
 * enforced here — that gate applies to one action within an otherwise
 * reachable page, not to the route itself. See classroom-manage / create-
 * classroom for where that's applied.
 */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthStore);
  const router = inject(Router);

  return toObservable(auth.ready).pipe(
    filter((ready) => ready),
    take(1),
    map(() =>
      auth.isAuthenticated()
        ? true
        : router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } }),
    ),
  );
};
