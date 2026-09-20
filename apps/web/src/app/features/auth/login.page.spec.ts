import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginPage } from './login.page';
import { AuthStore } from '../../core/auth/auth-store';

function activatedRouteStub(returnUrl: string | null) {
  return {
    snapshot: { queryParamMap: convertToParamMap(returnUrl ? { returnUrl } : {}) },
  };
}

const SUCCESSFUL_LOGIN_RESPONSE = {
  accessToken: 'tok',
  expiresIn: 900,
  user: {
    id: '1',
    email: 'host@frntdesk.local',
    displayName: 'Host',
    phoneE164: null,
    emailVerifiedAt: null,
    createdAt: new Date().toISOString(),
  },
};

describe('LoginPage', () => {
  let httpMock: HttpTestingController;

  async function setup(returnUrl: string | null = null) {
    await TestBed.configureTestingModule({
      imports: [LoginPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: activatedRouteStub(returnUrl) },
      ],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(LoginPage);
    fixture.detectChanges();
    return fixture;
  }

  function fillAndSubmit(fixture: ReturnType<typeof TestBed.createComponent<LoginPage>>, email: string, password: string) {
    const el = fixture.nativeElement as HTMLElement;
    const emailInput = el.querySelector<HTMLInputElement>('input[formcontrolname="email"]')!;
    const passwordInput = el.querySelector<HTMLInputElement>('input[formcontrolname="password"]')!;

    emailInput.value = email;
    emailInput.dispatchEvent(new Event('input'));
    passwordInput.value = password;
    passwordInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  }

  it('disables the submit button until the form is valid', async () => {
    const fixture = await setup();
    const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    )!;

    expect(button.disabled).toBe(true);
    httpMock.expectNone('/api/auth/login');
  });

  it('logs in, updates AuthStore, and navigates to returnUrl on success', async () => {
    const fixture = await setup('/host/classrooms/new');
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    fillAndSubmit(fixture, 'host@frntdesk.local', 'frntdesk-dev-password');

    const req = httpMock.expectOne('/api/auth/login');
    expect(req.request.body).toEqual({ email: 'host@frntdesk.local', password: 'frntdesk-dev-password' });
    req.flush(SUCCESSFUL_LOGIN_RESPONSE);
    fixture.detectChanges();

    expect(TestBed.inject(AuthStore).isAuthenticated()).toBe(true);
    expect(navigateSpy).toHaveBeenCalledWith('/host/classrooms/new');
  });

  it('defaults to /classes when there is no returnUrl', async () => {
    const fixture = await setup(null);
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    fillAndSubmit(fixture, 'host@frntdesk.local', 'frntdesk-dev-password');
    httpMock.expectOne('/api/auth/login').flush(SUCCESSFUL_LOGIN_RESPONSE);
    fixture.detectChanges();

    expect(navigateSpy).toHaveBeenCalledWith('/classes');
  });

  it('shows the server error message and re-enables the form on a failed login', async () => {
    const fixture = await setup();

    fillAndSubmit(fixture, 'host@frntdesk.local', 'wrong-password');
    httpMock
      .expectOne('/api/auth/login')
      .flush({ message: 'Incorrect email or password.' }, { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const button = el.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(button.disabled).toBe(false);
    expect(button.textContent).toContain('Log in');
    expect(el.querySelector('.error-banner')?.textContent).toContain('Incorrect email or password.');
    expect(TestBed.inject(AuthStore).isAuthenticated()).toBe(false);
  });
});
