import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import type { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-login-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  template: `
    <mat-card class="login-card" appearance="outlined">
      <mat-card-header>
        <mat-card-title>Log in</mat-card-title>
      </mat-card-header>
      <mat-card-content>
        <form [formGroup]="form" (ngSubmit)="submit()">
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Email</mat-label>
            <input matInput type="email" formControlName="email" autocomplete="email" required />
            @if (form.controls.email.invalid && form.controls.email.touched) {
              <mat-error>Enter a valid email address.</mat-error>
            }
          </mat-form-field>

          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Password</mat-label>
            <input
              matInput
              [type]="showPassword() ? 'text' : 'password'"
              formControlName="password"
              autocomplete="current-password"
              required
            />
            <button
              mat-icon-button
              matSuffix
              type="button"
              (click)="showPassword.set(!showPassword())"
              [attr.aria-label]="showPassword() ? 'Hide password' : 'Show password'"
            >
              <mat-icon>{{ showPassword() ? 'visibility_off' : 'visibility' }}</mat-icon>
            </button>
            @if (form.controls.password.invalid && form.controls.password.touched) {
              <mat-error>Enter your password.</mat-error>
            }
          </mat-form-field>

          @if (errorMessage()) {
            <p class="error-banner" role="alert">{{ errorMessage() }}</p>
          }

          <button
            mat-flat-button
            color="primary"
            type="submit"
            class="full-width submit-button"
            [disabled]="form.invalid || submitting()"
          >
            {{ submitting() ? 'Signing in…' : 'Log in' }}
          </button>
        </form>

        <p class="secondary-links">
          <a routerLink="/forgot-password">Forgot password?</a>
          <span>&middot;</span>
          <a routerLink="/register">Create an account</a>
        </p>
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    .login-card {
      max-width: 400px;
      margin: 48px auto;
    }

    .full-width {
      width: 100%;
    }

    .submit-button {
      margin-top: 8px;
    }

    .error-banner {
      color: var(--mat-sys-error);
      font-size: 0.875rem;
      margin: 0 0 8px;
    }

    .secondary-links {
      display: flex;
      justify-content: space-between;
      margin-top: 16px;
      font-size: 0.875rem;
    }
  `,
})
export class LoginPage {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly form = new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  protected readonly submitting = signal(false);
  protected readonly showPassword = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected submit(): void {
    if (this.form.invalid || this.submitting()) return;

    this.submitting.set(true);
    this.errorMessage.set(null);

    this.authService.login(this.form.getRawValue()).subscribe({
      next: () => {
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
        void this.router.navigateByUrl(returnUrl || '/classes');
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        this.errorMessage.set(
          (err.error as { message?: string } | null)?.message ?? 'Something went wrong. Please try again.',
        );
      },
    });
  }
}
