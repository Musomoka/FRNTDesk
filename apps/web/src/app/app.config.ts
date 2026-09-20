import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { authHttpInterceptorFn, provideAuth0 } from '@auth0/auth0-angular';
import { provideRouter } from '@angular/router';
import { environment } from '../environment';
import { routes } from './app.routes';

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
    provideHttpClient(withFetch(), withInterceptors([authHttpInterceptorFn])),
    provideRouter(routes),
    provideAuth0({
      domain: environment.auth0.domain,
      clientId: environment.auth0.clientId,
      authorizationParams: {
        redirect_uri: typeof window === 'undefined' ? undefined : window.location.origin,
        audience: environment.auth0.audience,
      },
      // Refresh tokens rather than the legacy silent-auth iframe: browsers
      // increasingly block the third-party cookies that iframe technique
      // needs, so this is Auth0's own recommended default for a SPA that
      // isn't fronted by a custom domain.
      useRefreshTokens: true,
      cacheLocation: 'localstorage',
      // Attaches a bearer token (fetched via the above) to any request whose
      // URL matches — our API only, never a third-party asset host.
      httpInterceptor: { allowedList: ['/api/*'] },
    }),
  ],
};
