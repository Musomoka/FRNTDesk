import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { AbstractControl, ReactiveFormsModule, ValidationErrors, Validators, FormControl, FormGroup } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { parseZambianMsisdn } from '@frntdesk/shared';
import { AuthStore } from '../../core/auth/auth-store';

function zambianPhoneValidator(control: AbstractControl): ValidationErrors | null {
  const value = ((control.value as string | null) ?? '').trim();
  if (value === '') return null; // optional field — empty clears the number
  return parseZambianMsisdn(value).ok ? null : { invalidPhone: true };
}

function extractErrorMessage(err: unknown): string | null {
  if (!(err instanceof HttpErrorResponse)) return null;
  const body = err.error as { message?: string; errors?: { message: string }[] } | null;
  if (body?.errors?.length) return body.errors.map((e) => e.message).join(' ');
  return body?.message ?? null;
}

/**
 * User info + security in one page. "Security" here means what a SPA
 * without Management API access actually can show/do — sign-in method and a
 * password-reset trigger — since Auth0 Universal Login, not this app, owns
 * credentials end to end (see AuthStore.requestPasswordChange).
 */
@Component({
  selector: 'app-account-page',
  imports: [
    ReactiveFormsModule,
    DatePipe,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <div class="account-page">
      <mat-card appearance="outlined" class="section">
        <mat-card-header>
          <mat-card-title>Profile</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          @if (!profile()) {
            <div class="loading"><mat-spinner diameter="28" /></div>
          } @else {
            <div class="identity-row">
              <div class="avatar">
                @if (picture()) {
                  <img [src]="picture()" alt="" />
                } @else {
                  <span>{{ initials() }}</span>
                }
              </div>
              <div>
                <p class="email">{{ profile()!.email }}</p>
                <p class="member-since">Member since {{ profile()!.createdAt | date: 'MMMM yyyy' }}</p>
              </div>
            </div>

            @if (!auth.isEmailVerified()) {
              <div class="banner banner--warn">
                <mat-icon>mark_email_unread</mat-icon>
                <span
                  >Your email isn't verified yet. Check your inbox for the message from when you
                  signed up (it may be in spam).</span
                >
              </div>
            }

            <form [formGroup]="form" (ngSubmit)="save()" class="profile-form">
              <mat-form-field appearance="outline">
                <mat-label>Display name</mat-label>
                <input matInput formControlName="displayName" maxlength="80" />
                @if (form.controls.displayName.hasError('required')) {
                  <mat-error>Enter your name.</mat-error>
                }
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Phone number</mat-label>
                <input matInput formControlName="phone" placeholder="0966 123 456" />
                <mat-hint>Zambian mobile — used for payment prompts.</mat-hint>
                @if (form.controls.phone.hasError('invalidPhone')) {
                  <mat-error>That doesn't look like a Zambian mobile number.</mat-error>
                }
              </mat-form-field>

              @if (saveError()) {
                <p class="form-error">{{ saveError() }}</p>
              }

              <div class="actions">
                <button
                  mat-flat-button
                  color="primary"
                  type="submit"
                  [disabled]="form.invalid || !form.dirty || saving()"
                >
                  @if (saving()) {
                    <mat-spinner diameter="18" />
                  } @else {
                    Save changes
                  }
                </button>
              </div>
            </form>
          }
        </mat-card-content>
      </mat-card>

      <mat-card appearance="outlined" class="section">
        <mat-card-header>
          <mat-card-title>Security</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          @if (!identityProvider()) {
            <div class="loading"><mat-spinner diameter="28" /></div>
          } @else {
            <div class="security-row">
              <div>
                <p class="security-label">Sign-in method</p>
                <p class="security-value">{{ identityProvider()!.label }}</p>
              </div>
              @if (identityProvider()!.hasPassword) {
                <button
                  mat-stroked-button
                  type="button"
                  (click)="changePassword()"
                  [disabled]="changingPassword()"
                >
                  @if (changingPassword()) {
                    <mat-spinner diameter="18" />
                  } @else {
                    Change password
                  }
                </button>
              }
            </div>

            @if (!identityProvider()!.hasPassword) {
              <p class="hint">
                You sign in with {{ identityProvider()!.label }} — manage your password through
                that provider's account settings, not here.
              </p>
            }

            @if (passwordRequestSent()) {
              <div class="banner banner--success">
                <mat-icon>check_circle</mat-icon>
                <span>Check {{ profile()?.email }} for a link to set a new password.</span>
              </div>
            }
            @if (passwordRequestError()) {
              <p class="form-error">{{ passwordRequestError() }}</p>
            }
          }
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: `
    .account-page {
      max-width: 640px;
      margin: 0 auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .loading {
      display: flex;
      justify-content: center;
      padding: 24px 0;
    }

    .identity-row {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 16px;
    }

    .avatar {
      width: 56px;
      height: 56px;
      flex-shrink: 0;
      border-radius: 50%;
      overflow: hidden;
      background: var(--mat-sys-primary-container);
      color: var(--mat-sys-on-primary-container);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
    }

    .avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .email {
      font-weight: 500;
      margin: 0;
    }

    .member-since {
      margin: 2px 0 0;
      font-size: 0.875rem;
      color: var(--mat-sys-on-surface-variant);
    }

    .banner {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 12px;
      border-radius: 8px;
      margin-bottom: 16px;
      font-size: 0.875rem;
    }

    .banner--warn {
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
    }

    .banner--success {
      background: var(--mat-sys-tertiary-container, var(--mat-sys-primary-container));
      color: var(--mat-sys-on-tertiary-container, var(--mat-sys-on-primary-container));
      margin-top: 16px;
      margin-bottom: 0;
    }

    .banner mat-icon {
      flex-shrink: 0;
    }

    .profile-form {
      display: flex;
      flex-direction: column;
    }

    .profile-form mat-form-field {
      width: 100%;
    }

    .form-error {
      color: var(--mat-sys-error);
      font-size: 0.875rem;
      margin: -8px 0 12px;
    }

    .actions {
      display: flex;
      justify-content: flex-end;
    }

    .actions button mat-spinner {
      display: inline-block;
    }

    .security-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }

    .security-label {
      margin: 0;
      font-size: 0.875rem;
      color: var(--mat-sys-on-surface-variant);
    }

    .security-value {
      margin: 2px 0 0;
      font-weight: 500;
    }

    .hint {
      margin: 12px 0 0;
      font-size: 0.875rem;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class AccountPage {
  protected readonly auth = inject(AuthStore);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly profile = this.auth.currentUser;
  protected readonly picture = this.auth.picture;
  protected readonly identityProvider = this.auth.identityProvider;

  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);

  protected readonly changingPassword = signal(false);
  protected readonly passwordRequestSent = signal(false);
  protected readonly passwordRequestError = signal<string | null>(null);

  protected readonly form = new FormGroup({
    displayName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(80)],
    }),
    phone: new FormControl('', { nonNullable: true, validators: [zambianPhoneValidator] }),
  });

  protected readonly initials = computed(() => {
    const initials = (this.profile()?.displayName ?? '')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]!.toUpperCase())
      .join('');
    return initials || '?';
  });

  private formInitialized = false;

  constructor() {
    // Patches the form once, the first time the synced profile arrives —
    // deliberately not on every change, so a background resync (or the
    // response from `save()` itself) can never stomp on an in-progress edit.
    effect(() => {
      const profile = this.profile();
      if (!profile || this.formInitialized) return;
      this.form.setValue({ displayName: profile.displayName, phone: profile.phoneE164 ?? '' });
      this.formInitialized = true;
    });
  }

  protected save(): void {
    if (this.form.invalid || this.saving()) return;

    this.saving.set(true);
    this.saveError.set(null);

    const { displayName, phone } = this.form.getRawValue();
    this.auth.saveProfile({ displayName: displayName.trim(), phone: phone.trim() }).subscribe({
      next: () => {
        this.saving.set(false);
        this.form.markAsPristine();
        this.snackBar.open('Profile saved.', undefined, { duration: 3000 });
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.saveError.set(extractErrorMessage(err) ?? 'Could not save your changes. Try again.');
      },
    });
  }

  protected changePassword(): void {
    if (this.changingPassword()) return;

    this.changingPassword.set(true);
    this.passwordRequestError.set(null);
    this.passwordRequestSent.set(false);

    this.auth.requestPasswordChange().subscribe({
      next: () => {
        this.changingPassword.set(false);
        this.passwordRequestSent.set(true);
      },
      error: () => {
        this.changingPassword.set(false);
        this.passwordRequestError.set(
          'Could not send the password reset email. Try again in a moment.',
        );
      },
    });
  }
}
