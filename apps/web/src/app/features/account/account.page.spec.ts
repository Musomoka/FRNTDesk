import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { signal } from '@angular/core';
import { By } from '@angular/platform-browser';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UpdateProfileRequest, UserProfile } from '@frntdesk/shared';
import type { IdentityProvider } from '../../core/auth/identity-provider';
import { AuthStore } from '../../core/auth/auth-store';
import { AccountPage } from './account.page';

const PROFILE: UserProfile = {
  id: 'internal-uuid-1',
  email: 'host@frntdesk.local',
  displayName: 'Chanda Mwale',
  phoneE164: '+260966123456',
  emailVerifiedAt: '2026-01-01T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
};

function fakeAuthStore() {
  const currentUser = signal<UserProfile | null>(null);
  const identityProvider = signal<IdentityProvider | null>(null);
  const picture = signal<string | null>(null);
  const isEmailVerified = signal(true);

  return {
    currentUser: currentUser.asReadonly(),
    identityProvider: identityProvider.asReadonly(),
    picture: picture.asReadonly(),
    isEmailVerified: isEmailVerified.asReadonly(),
    saveProfile: vi.fn((input: UpdateProfileRequest) =>
      of({ ...PROFILE, displayName: input.displayName, phoneE164: input.phone || null }),
    ),
    requestPasswordChange: vi.fn(() => of(undefined)),
    // Test-only setters — the real AuthStore derives these from Auth0/HTTP.
    _currentUser: currentUser,
    _identityProvider: identityProvider,
    _isEmailVerified: isEmailVerified,
  };
}

function buttonWithText(fixture: ComponentFixture<AccountPage>, text: string) {
  return fixture.debugElement
    .queryAll(By.css('button'))
    .find((el) => (el.nativeElement.textContent ?? '').trim().includes(text));
}

function inputFor(fixture: ComponentFixture<AccountPage>, name: string): HTMLInputElement {
  return fixture.debugElement.query(By.css(`[formcontrolname="${name}"]`)).nativeElement as HTMLInputElement;
}

function setInputValue(fixture: ComponentFixture<AccountPage>, name: string, value: string): void {
  const input = inputFor(fixture, name);
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

function submitButton(fixture: ComponentFixture<AccountPage>) {
  return fixture.debugElement.query(By.css('button[type="submit"]'));
}

function submitForm(fixture: ComponentFixture<AccountPage>): void {
  const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
  form.dispatchEvent(new Event('submit'));
}

describe('AccountPage', () => {
  let auth: ReturnType<typeof fakeAuthStore>;

  beforeEach(() => {
    auth = fakeAuthStore();
    TestBed.configureTestingModule({
      imports: [AccountPage],
      providers: [{ provide: AuthStore, useValue: auth }],
    });
  });

  it('shows a loading state until the synced profile arrives', () => {
    const fixture = TestBed.createComponent(AccountPage);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('host@frntdesk.local');
  });

  it('populates the form and shows profile details once the profile loads', () => {
    const fixture = TestBed.createComponent(AccountPage);
    fixture.detectChanges();

    auth._currentUser.set(PROFILE);
    fixture.detectChanges();

    expect(inputFor(fixture, 'displayName').value).toBe('Chanda Mwale');
    expect(inputFor(fixture, 'phone').value).toBe('+260966123456');
    expect(fixture.nativeElement.textContent).toContain('host@frntdesk.local');
  });

  it('shows the unverified-email banner only when the profile is unverified', () => {
    const fixture = TestBed.createComponent(AccountPage);
    auth._currentUser.set(PROFILE);
    auth._isEmailVerified.set(false);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain("isn't verified");
  });

  it('does not patch the form again once the profile has already loaded once', () => {
    const fixture = TestBed.createComponent(AccountPage);
    auth._currentUser.set(PROFILE);
    fixture.detectChanges();

    setInputValue(fixture, 'displayName', 'Someone Else');
    fixture.detectChanges();

    // A background resync arriving mid-edit must not clobber the draft.
    auth._currentUser.set({ ...PROFILE, displayName: 'Server Value' });
    fixture.detectChanges();

    expect(inputFor(fixture, 'displayName').value).toBe('Someone Else');
  });

  it('saves the profile and re-disables the submit button once pristine', () => {
    const fixture = TestBed.createComponent(AccountPage);
    auth._currentUser.set(PROFILE);
    fixture.detectChanges();

    setInputValue(fixture, 'displayName', 'Chanda M.');
    setInputValue(fixture, 'phone', '+260977654321');
    fixture.detectChanges();
    submitForm(fixture);
    fixture.detectChanges();

    expect(auth.saveProfile).toHaveBeenCalledWith({ displayName: 'Chanda M.', phone: '+260977654321' });
    expect(submitButton(fixture).nativeElement.disabled).toBe(true);
  });

  it('surfaces a save error and leaves the submit button enabled for retry', () => {
    auth.saveProfile.mockReturnValueOnce(throwError(() => new Error('boom')));
    const fixture = TestBed.createComponent(AccountPage);
    auth._currentUser.set(PROFILE);
    fixture.detectChanges();

    setInputValue(fixture, 'displayName', 'Chanda M.');
    fixture.detectChanges();
    submitForm(fixture);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.form-error')?.textContent).toBeTruthy();
    expect(submitButton(fixture).nativeElement.disabled).toBe(false);
  });

  it('shows a change-password button for a database-connection account, and requests it on click', () => {
    const fixture = TestBed.createComponent(AccountPage);
    auth._currentUser.set(PROFILE);
    auth._identityProvider.set({ key: 'auth0', label: 'Email and password', hasPassword: true });
    fixture.detectChanges();

    const button = buttonWithText(fixture, 'Change password');
    expect(button).toBeTruthy();

    button!.nativeElement.click();
    fixture.detectChanges();

    expect(auth.requestPasswordChange).toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('for a link to set a new password');
  });

  it('hides the change-password button for a federated (social) account', () => {
    const fixture = TestBed.createComponent(AccountPage);
    auth._currentUser.set(PROFILE);
    auth._identityProvider.set({ key: 'google-oauth2', label: 'Google', hasPassword: false });
    fixture.detectChanges();

    expect(buttonWithText(fixture, 'Change password')).toBeUndefined();
    expect(fixture.nativeElement.textContent).toContain('You sign in with Google');
  });
});
