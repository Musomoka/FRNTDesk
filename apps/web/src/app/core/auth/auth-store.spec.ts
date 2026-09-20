import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService as Auth0Service } from '@auth0/auth0-angular';
import { BehaviorSubject } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';
import { AuthStore } from './auth-store';

function fakeAuth0() {
  return {
    isLoading$: new BehaviorSubject<boolean>(true),
    isAuthenticated$: new BehaviorSubject<boolean>(false),
    user$: new BehaviorSubject<{ email?: string; name?: string; email_verified?: boolean } | null>(null),
  };
}

const PROFILE_RESPONSE = {
  id: 'internal-uuid-1',
  email: 'host@frntdesk.local',
  displayName: 'Chanda Mwale',
  phoneE164: null,
  emailVerifiedAt: '2026-01-01T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('AuthStore', () => {
  let auth0: ReturnType<typeof fakeAuth0>;
  let httpMock: HttpTestingController;
  let store: AuthStore;

  beforeEach(() => {
    auth0 = fakeAuth0();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Auth0Service, useValue: auth0 },
      ],
    });
    store = TestBed.inject(AuthStore);
    httpMock = TestBed.inject(HttpTestingController);
  });

  it('reports not ready while Auth0 is still loading, and makes no sync call', () => {
    TestBed.tick();
    expect(store.ready()).toBe(false);
    expect(store.isAuthenticated()).toBe(false);
    httpMock.expectNone('/api/auth/sync');
  });

  it('once ready and unauthenticated, has no current user and makes no sync call', () => {
    auth0.isLoading$.next(false);
    TestBed.tick();

    expect(store.ready()).toBe(true);
    expect(store.isAuthenticated()).toBe(false);
    expect(store.currentUser()).toBeNull();
    httpMock.expectNone('/api/auth/sync');
  });

  it('once ready and authenticated, syncs the profile from Auth0 ID token claims', () => {
    auth0.user$.next({ email: 'host@frntdesk.local', name: 'Chanda Mwale', email_verified: true });
    auth0.isAuthenticated$.next(true);
    auth0.isLoading$.next(false);
    TestBed.tick();

    const req = httpMock.expectOne('/api/auth/sync');
    expect(req.request.body).toEqual({
      email: 'host@frntdesk.local',
      displayName: 'Chanda Mwale',
      emailVerified: true,
    });
    req.flush(PROFILE_RESPONSE);
    TestBed.tick();

    expect(store.currentUser()).toEqual(PROFILE_RESPONSE);
    expect(store.isEmailVerified()).toBe(true);
  });

  it('isAuthenticated flips true immediately on ready, even before the sync call resolves', () => {
    // This is the exact race authGuard relies on not existing: access control
    // must never wait on our own backend call, only on Auth0's own state.
    auth0.user$.next({ email: 'host@frntdesk.local', email_verified: true });
    auth0.isAuthenticated$.next(true);
    auth0.isLoading$.next(false);
    TestBed.tick();

    expect(store.isAuthenticated()).toBe(true);
    expect(store.currentUser()).toBeNull(); // sync hasn't resolved yet

    httpMock.expectOne('/api/auth/sync').flush(PROFILE_RESPONSE);
  });

  it('clears currentUser when Auth0 reports signed out', () => {
    auth0.user$.next({ email: 'host@frntdesk.local', email_verified: true });
    auth0.isAuthenticated$.next(true);
    auth0.isLoading$.next(false);
    TestBed.tick();
    httpMock.expectOne('/api/auth/sync').flush(PROFILE_RESPONSE);
    TestBed.tick();
    expect(store.currentUser()).not.toBeNull();

    auth0.isAuthenticated$.next(false);
    TestBed.tick();

    expect(store.currentUser()).toBeNull();
  });
});
