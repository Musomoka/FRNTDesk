import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { AuthStore } from './auth-store';

/**
 * Guards routes that only make sense while signed out: the marketing landing
 * page, login, register, forgot/reset password. A signed-in user is sent to
 * the catalog instead — logged-in users never see marketing copy or an
 * auth form they don't need.
 */
export const redirectIfAuthenticatedGuard: CanActivateFn = () => {
  const auth = inject(AuthStore);
  const router = inject(Router);

  return auth.isAuthenticated() ? router.createUrlTree(['/classes']) : true;
};
