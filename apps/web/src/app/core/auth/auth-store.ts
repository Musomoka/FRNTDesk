import { HttpClient } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService as Auth0Service } from '@auth0/auth0-angular';
import { map, of, switchMap, take } from 'rxjs';
import type { UserProfile } from '@frntdesk/shared';

/**
 * Root-provided session state, wrapping Auth0's own `AuthService` — the rest
 * of the app (guards, the shell) reads this signal-based surface rather than
 * Auth0's RxJS observables directly, so nothing else needed to change when
 * identity moved from our own JWT/refresh-cookie system to Auth0.
 *
 * Two pieces of state settle at different speeds, and that difference is
 * deliberate, not a bug to paper over:
 *
 *   `isAuthenticated` — sourced directly from Auth0's own `isAuthenticated$`.
 *   Authoritative and immediate the moment `ready()` flips true. Every guard
 *   gates on THIS, never on `currentUser`.
 *
 *   `currentUser` — our own backend's view (has the internal UUID `id` every
 *   other table's foreign keys point at, which Auth0's `sub` is not). It's
 *   populated by a `POST /api/auth/sync` call made only after Auth0 already
 *   says authenticated, so it necessarily lags by one local network
 *   round-trip. Nothing gates access on it; features that need the internal
 *   `id` (host tools, checkout) aren't built yet, and when they are, they
 *   read `currentUser()` knowing it can briefly be null right after login.
 */
@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly auth0 = inject(Auth0Service);
  private readonly http = inject(HttpClient);

  private readonly _profile = signal<UserProfile | null>(null);

  /** Auth0 has finished its own startup check (session restore / redirect callback). */
  readonly ready = toSignal(this.auth0.isLoading$.pipe(map((loading) => !loading)), {
    initialValue: false,
  });

  readonly isAuthenticated = toSignal(this.auth0.isAuthenticated$, { initialValue: false });
  readonly currentUser = this._profile.asReadonly();
  readonly isEmailVerified = computed(() => this._profile()?.emailVerifiedAt != null);

  constructor() {
    effect(() => {
      if (!this.ready()) return;

      if (this.isAuthenticated()) {
        if (!this._profile()) this.syncProfile();
      } else {
        this._profile.set(null);
      }
    });
  }

  /**
   * Upserts our local User row from Auth0's ID token claims and populates
   * `currentUser`. `email`/`displayName`/`emailVerified` are trusted only as
   * profile metadata by the backend — the request itself is what's
   * authoritative, verified via the bearer token Auth0's HTTP interceptor
   * attaches automatically (see app.config.ts's `httpInterceptor.allowedList`).
   */
  private syncProfile(): void {
    this.auth0.user$
      .pipe(
        take(1),
        switchMap((user) => {
          if (!user?.email) return of(null);
          return this.http.post<UserProfile>('/api/auth/sync', {
            email: user.email,
            displayName: user.name ?? user.email,
            emailVerified: user.email_verified ?? false,
          });
        }),
      )
      .subscribe((profile) => {
        if (profile) this._profile.set(profile);
      });
  }
}
