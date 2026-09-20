import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { AuthService as Auth0Service } from '@auth0/auth0-angular';
import { describe, expect, it, vi } from 'vitest';
import { LoginPage } from './login.page';

function activatedRouteStub(returnUrl: string | null) {
  return {
    snapshot: { queryParamMap: convertToParamMap(returnUrl ? { returnUrl } : {}) },
  };
}

describe('LoginPage', () => {
  it('redirects to Auth0 immediately, carrying returnUrl as the target', async () => {
    const loginWithRedirect = vi.fn().mockResolvedValue(undefined);

    await TestBed.configureTestingModule({
      imports: [LoginPage],
      providers: [
        { provide: Auth0Service, useValue: { loginWithRedirect } },
        { provide: ActivatedRoute, useValue: activatedRouteStub('/host/classrooms/new') },
      ],
    }).compileComponents();

    TestBed.createComponent(LoginPage);

    expect(loginWithRedirect).toHaveBeenCalledWith({
      appState: { target: '/host/classrooms/new' },
    });
  });

  it('redirects with an undefined target when there is no returnUrl', async () => {
    const loginWithRedirect = vi.fn().mockResolvedValue(undefined);

    await TestBed.configureTestingModule({
      imports: [LoginPage],
      providers: [
        { provide: Auth0Service, useValue: { loginWithRedirect } },
        { provide: ActivatedRoute, useValue: activatedRouteStub(null) },
      ],
    }).compileComponents();

    TestBed.createComponent(LoginPage);

    expect(loginWithRedirect).toHaveBeenCalledWith({ appState: { target: undefined } });
  });
});
