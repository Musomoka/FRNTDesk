import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService as Auth0Service } from '@auth0/auth0-angular';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { AuthStore } from '../auth/auth-store';
import { AppShell } from './app-shell';

describe('AppShell', () => {
  it('logs out through Auth0 and sends the browser back to this origin (the homepage)', () => {
    const logout = vi.fn().mockReturnValue(of(undefined));

    TestBed.configureTestingModule({
      imports: [AppShell],
      providers: [
        provideRouter([]),
        { provide: Auth0Service, useValue: { logout } },
        { provide: AuthStore, useValue: { isAuthenticated: signal(true) } },
      ],
    });

    const fixture = TestBed.createComponent(AppShell);
    fixture.detectChanges();

    // `logout` is a protected template handler, not part of the component's
    // public API — reached the same way the "Log out" menu item's (click)
    // binding reaches it.
    (fixture.componentInstance as unknown as { logout(): void }).logout();

    // `/` is the marketing page whenever signed out (redirectIfAuthenticatedGuard
    // only ever redirects *away* from it, and never when unauthenticated), so
    // returning to the app's own origin is what lands the user on the homepage.
    // This must exactly match an "Allowed Logout URL" in the Auth0 application's
    // dashboard settings, or Auth0 refuses the redirect and shows its own page
    // instead — see README's "Auth0 setup".
    expect(logout).toHaveBeenCalledWith({ logoutParams: { returnTo: window.location.origin } });
  });
});
