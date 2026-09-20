import { Component } from '@angular/core';
import { PagePlaceholder } from '../../shared/page-placeholder';

@Component({
  selector: 'app-forgot-password-page',
  imports: [PagePlaceholder],
  template: `
    <app-page-placeholder
      title="Forgot password"
      purpose="Request a password reset email."
      [states]="states"
    />
  `,
})
export class ForgotPasswordPage {
  protected readonly states = [
    'submitting',
    'error',
    'success (check your email)',
  ] as const;
}
