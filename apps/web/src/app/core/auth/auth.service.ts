import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { catchError, map, of, tap, type Observable } from 'rxjs';
import type { AuthSession, LoginRequest } from '@frntdesk/shared';
import { AuthStore } from './auth-store';

/**
 * The only place in the app that talks to /api/auth/*. Every call sets
 * `withCredentials: true` — the refresh token travels as an httpOnly cookie,
 * so the browser must be told to send it (and to accept the `Set-Cookie` it
 * gets back) even though these are same-origin calls through the dev proxy.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly store = inject(AuthStore);

  login(credentials: LoginRequest): Observable<AuthSession> {
    return this.http
      .post<AuthSession>('/api/auth/login', credentials, { withCredentials: true })
      .pipe(tap((session) => this.store.setSession(session)));
  }

  /**
   * Called once, during app bootstrap (see `provideAppInitializer` in
   * app.config.ts), before any route or guard evaluates — so a page reload
   * never briefly renders as signed-out before snapping to signed-in.
   *
   * A failure here (no cookie yet, or an expired/reused one) is the ordinary
   * case for a first-time or logged-out visitor, not an error to surface —
   * it resolves quietly with the store left in its default signed-out state.
   */
  tryRestoreSession(): Observable<void> {
    return this.http.post<AuthSession>('/api/auth/refresh', {}, { withCredentials: true }).pipe(
      tap((session) => this.store.setSession(session)),
      map(() => undefined),
      catchError(() => of(undefined)),
    );
  }

  /**
   * Always clears local state, even if the network call fails — from the
   * user's perspective, the "log out" button must work regardless of
   * connectivity. The server-side revoke is best-effort on top of that.
   */
  logout(): Observable<void> {
    return this.http.post<void>('/api/auth/logout', {}, { withCredentials: true }).pipe(
      map(() => undefined),
      catchError(() => of(undefined)),
      tap(() => this.store.clear()),
    );
  }
}
