import { Component } from '@angular/core';
import { PagePlaceholder } from '../../shared/page-placeholder';

@Component({
  selector: 'app-reset-password-page',
  imports: [PagePlaceholder],
  template: `
    <app-page-placeholder
      title="Reset password"
      purpose="Set a new password from a reset link."
      [states]="states"
    />
  `,
})
export class ResetPasswordPage {
  protected readonly states = [
    'token valid',
    'token expired/consumed',
    'submitting',
    'success',
  ] as const;
}
