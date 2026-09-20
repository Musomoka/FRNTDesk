import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { AuthStore } from './auth-store';

/**
 * Guards every route that requires a signed-in user (checkout, host tools,
 * live room, library, account). Carries the attempted URL through so login
 * can return the user to where they were headed, per the invite/checkout
 * flows in the UX plan.
 *
 * Verification (e.g. gating classroom *publishing*) is deliberately not
 * enforced here — that gate applies to one action within an otherwise
 * reachable page, not to the route itself. See classroom-manage / create-
 * classroom for where that's applied.
 */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthStore);
  const router = inject(Router);

  if (auth.isAuthenticated()) {
    return true;
  }

  return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};
