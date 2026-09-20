import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter } from '@angular/router';
import { provideAuth0 } from '@auth0/auth0-angular';
import { routes } from './app.routes';
import { AuthService } from './core/auth/auth.service';
import { authInterceptor } from './core/auth/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Explicit, not just "no zone.js in package.json" — the whole app's state
    // (AuthStore, live-room participants, checkout polling) is modeled as
    // signals specifically so this holds.
    provideZonelessChangeDetection(),
    // Async-loaded so Material's ripple/dialog/overlay animations don't force
    // the animations engine into the initial bundle for a route that never
    // opens a dialog.
    provideAnimationsAsync(),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
    provideRouter(routes),
    provideAuth0({
      domain: "musomoka.au.auth0.com",
      clientId: "kHBupDSO4dJE7UjVRLBWlAdhBl8gSsNO",
      authorizationParams: {
        redirect_uri: window.location.origin,
      }
    }),
    // Blocks first render on one round trip to /api/auth/refresh, so by the
    // time any guard runs, AuthStore already reflects a real session (or
    // really doesn't) — never a flash of "signed out" on a reload while a
    // valid refresh cookie is still being exchanged.
    provideAppInitializer(() => inject(AuthService).tryRestoreSession()),
  ],
};
