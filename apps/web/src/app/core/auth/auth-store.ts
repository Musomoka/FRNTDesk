import { Injectable, computed, signal } from '@angular/core';
import type { AuthSession, UserProfile } from '@frntdesk/shared';

/**
 * Root-provided, signal-based session state — the one piece of cross-cutting
 * state in the app. Guards, the shell, and the HTTP layer all read from this
 * rather than each holding their own copy.
 *
 * No NgRx: at this app's size, a single store plus per-feature signals (e.g.
 * checkout's payment-poll state, the live room's participant list) is
 * sufficient. Introduce a heavier store only if state genuinely needs to be
 * shared across more than a couple of features.
 *
 * The access token lives only in memory (never localStorage — that's an XSS
 * exfiltration target) and is lost on a hard refresh by design. The httpOnly
 * refresh cookie is what survives a reload; `AuthService.tryRestoreSession()`
 * exchanges it for a fresh access token during app bootstrap (see
 * app.config.ts's `provideAppInitializer`), before any route or guard runs.
 */
@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly _currentUser = signal<UserProfile | null>(null);
  private readonly _accessToken = signal<string | null>(null);

  readonly currentUser = this._currentUser.asReadonly();
  readonly isAuthenticated = computed(() => this._currentUser() !== null);
  readonly isEmailVerified = computed(() => this._currentUser()?.emailVerifiedAt != null);

  /** Read by the HTTP interceptor to attach `Authorization: Bearer <token>`. */
  accessToken(): string | null {
    return this._accessToken();
  }

  setSession(session: AuthSession): void {
    this._currentUser.set(session.user);
    this._accessToken.set(session.accessToken);
  }

  clear(): void {
    this._currentUser.set(null);
    this._accessToken.set(null);
  }
}
