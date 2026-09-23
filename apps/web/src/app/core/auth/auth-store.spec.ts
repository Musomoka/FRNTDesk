import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService as Auth0Service } from '@auth0/auth0-angular';
import { BehaviorSubject } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';
import { AuthStore } from './auth-store';

interface FakeAuth0User {
  email?: string;
  name?: string;
  email_verified?: boolean;
  sub?: string;
  picture?: string;
}

function fakeAuth0() {
  return {
    isLoading$: new BehaviorSubject<boolean>(true),
    isAuthenticated$: new BehaviorSubject<boolean>(false),
    user$: new BehaviorSubject<FakeAuth0User | null>(null),
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

  describe('identityProvider and picture', () => {
    it('reports a database-connection account as having a password', () => {
      auth0.user$.next({ email: 'host@frntdesk.local', email_verified: true, sub: 'auth0|abc123' });
      auth0.isAuthenticated$.next(true);
      auth0.isLoading$.next(false);
      TestBed.tick();
      httpMock.expectOne('/api/auth/sync').flush(PROFILE_RESPONSE);
      TestBed.tick();

      expect(store.identityProvider()).toEqual({
        key: 'auth0',
        label: 'Email and password',
        hasPassword: true,
      });
    });

    it('reports a federated login as having no password, and exposes its picture', () => {
      auth0.user$.next({
        email: 'host@frntdesk.local',
        email_verified: true,
        sub: 'google-oauth2|456',
        picture: 'https://example.com/avatar.png',
      });
      auth0.isAuthenticated$.next(true);
      auth0.isLoading$.next(false);
      TestBed.tick();
      httpMock.expectOne('/api/auth/sync').flush(PROFILE_RESPONSE);
      TestBed.tick();

      expect(store.identityProvider()).toEqual({ key: 'google-oauth2', label: 'Google', hasPassword: false });
      expect(store.picture()).toBe('https://example.com/avatar.png');
    });
  });

  describe('saveProfile', () => {
    it('PATCHes the profile and updates currentUser from the response', () => {
      auth0.user$.next({ email: 'host@frntdesk.local', email_verified: true, sub: 'auth0|abc123' });
      auth0.isAuthenticated$.next(true);
      auth0.isLoading$.next(false);
      TestBed.tick();
      httpMock.expectOne('/api/auth/sync').flush(PROFILE_RESPONSE);
      TestBed.tick();

      const updated = { ...PROFILE_RESPONSE, displayName: 'Chanda M.', phoneE164: '+260966123456' };
      let result: unknown;
      store
        .saveProfile({ displayName: 'Chanda M.', phone: '+260966123456' })
        .subscribe((profile) => (result = profile));

      const req = httpMock.expectOne('/api/auth/profile');
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ displayName: 'Chanda M.', phone: '+260966123456' });
      req.flush(updated);

      expect(result).toEqual(updated);
      expect(store.currentUser()).toEqual(updated);
    });
  });

  describe('requestPasswordChange', () => {
    it('posts to the Auth0 dbconnections/change_password endpoint for the current email', () => {
      auth0.user$.next({ email: 'host@frntdesk.local', email_verified: true, sub: 'auth0|abc123' });
      auth0.isAuthenticated$.next(true);
      auth0.isLoading$.next(false);
      TestBed.tick();
      httpMock.expectOne('/api/auth/sync').flush(PROFILE_RESPONSE);
      TestBed.tick();

      let completed = false;
      store.requestPasswordChange().subscribe(() => (completed = true));

      const req = httpMock.expectOne(
        (r) => r.url.endsWith('/dbconnections/change_password'),
      );
      expect(req.request.body).toEqual({
        client_id: expect.any(String),
        email: 'host@frntdesk.local',
        connection: 'Username-Password-Authentication',
      });
      req.flush('We just sent you an email to reset your password.');

      expect(completed).toBe(true);
    });

    it('throws rather than call Auth0 when no email has loaded yet', () => {
      auth0.isLoading$.next(false);
      TestBed.tick();

      expect(() => store.requestPasswordChange()).toThrow();
    });
  });
});
