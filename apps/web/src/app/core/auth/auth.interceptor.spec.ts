import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { AuthStore } from './auth-store';
import { authInterceptor } from './auth.interceptor';

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let store: AuthStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    store = TestBed.inject(AuthStore);
  });

  it('attaches Authorization to /api/ requests when a session exists', () => {
    store.setSession({
      accessToken: 'token-123',
      expiresIn: 900,
      user: {
        id: '1',
        email: 'a@b.com',
        displayName: 'A',
        phoneE164: null,
        emailVerifiedAt: null,
        createdAt: new Date().toISOString(),
      },
    });

    http.get('/api/classes').subscribe();
    const req = httpMock.expectOne('/api/classes');
    expect(req.request.headers.get('Authorization')).toBe('Bearer token-123');
    req.flush({});
  });

  it('does not attach a header when there is no session', () => {
    http.get('/api/classes').subscribe();
    const req = httpMock.expectOne('/api/classes');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('never attaches the token to a non-API request, even with a session', () => {
    store.setSession({
      accessToken: 'token-123',
      expiresIn: 900,
      user: {
        id: '1',
        email: 'a@b.com',
        displayName: 'A',
        phoneE164: null,
        emailVerifiedAt: null,
        createdAt: new Date().toISOString(),
      },
    });

    http.get('https://cdn.example.com/asset.png').subscribe();
    const req = httpMock.expectOne('https://cdn.example.com/asset.png');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });
});
