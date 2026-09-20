import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, type UrlTree } from '@angular/router';
import { AuthService as Auth0Service } from '@auth0/auth0-angular';
import { BehaviorSubject, firstValueFrom, isObservable, of } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';
import { authGuard } from './auth.guard';
import { redirectIfAuthenticatedGuard } from './redirect-if-authenticated.guard';

function fakeAuth0(isLoading: boolean, isAuthenticated: boolean) {
  return {
    isLoading$: new BehaviorSubject(isLoading),
    isAuthenticated$: new BehaviorSubject(isAuthenticated),
    user$: new BehaviorSubject(null),
  };
}

function fakeRouteState(url: string) {
  return { url };
}

describe('authGuard', () => {
  it('completes (does not hang) once ready, resolving to true when authenticated', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: Auth0Service, useValue: fakeAuth0(false, true) },
      ],
    });

    const result = TestBed.runInInjectionContext(() =>
      authGuard({} as never, fakeRouteState('/host/classrooms/new') as never),
    );

    const resolved = isObservable(result) ? await firstValueFrom(result) : result;
    expect(resolved).toBe(true);
  });

  it('redirects to /login with returnUrl when not authenticated', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: Auth0Service, useValue: fakeAuth0(false, false) },
      ],
    });

    const result = TestBed.runInInjectionContext(() =>
      authGuard({} as never, fakeRouteState('/host/classrooms/new') as never),
    );

    const resolved = isObservable(result) ? await firstValueFrom(result) : result;
    const tree = resolved as UrlTree;
    expect(tree.toString()).toBe('/login?returnUrl=%2Fhost%2Fclassrooms%2Fnew');
  });

  it('waits for Auth0 to finish loading before deciding', async () => {
    const auth0 = fakeAuth0(true, false);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: Auth0Service, useValue: auth0 },
      ],
    });

    const result = TestBed.runInInjectionContext(() =>
      authGuard({} as never, fakeRouteState('/library') as never),
    );
    expect(isObservable(result)).toBe(true);

    // Not resolved yet — still loading.
    let settled = false;
    (result as ReturnType<typeof of>).subscribe(() => (settled = true));
    expect(settled).toBe(false);

    auth0.isAuthenticated$.next(true);
    auth0.isLoading$.next(false);
    // toSignal/toObservable propagate through Angular's effect scheduler,
    // not synchronously on next() — tick() flushes that queue.
    TestBed.tick();
    expect(settled).toBe(true);
  });
});

describe('redirectIfAuthenticatedGuard', () => {
  it('sends an authenticated user to /classes', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: Auth0Service, useValue: fakeAuth0(false, true) },
      ],
    });

    const result = TestBed.runInInjectionContext(() => redirectIfAuthenticatedGuard({} as never, {} as never));
    const resolved = isObservable(result) ? await firstValueFrom(result) : result;
    const tree = resolved as UrlTree;
    expect(tree.toString()).toBe('/classes');
  });

  it('lets an anonymous visitor through', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: Auth0Service, useValue: fakeAuth0(false, false) },
      ],
    });

    const result = TestBed.runInInjectionContext(() => redirectIfAuthenticatedGuard({} as never, {} as never));
    const resolved = isObservable(result) ? await firstValueFrom(result) : result;
    expect(resolved).toBe(true);
  });
});
