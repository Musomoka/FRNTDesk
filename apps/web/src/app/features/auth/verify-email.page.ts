import { Component } from '@angular/core';
import { PagePlaceholder } from '../../shared/page-placeholder';

@Component({
  selector: 'app-verify-email-page',
  imports: [PagePlaceholder],
  template: `
    <app-page-placeholder
      title="Verify email"
      purpose="Consume an email verification link."
      [states]="states"
    />
  `,
})
export class VerifyEmailPage {
  protected readonly states = [
    'verifying',
    'token expired/consumed',
    'success',
    'error',
  ] as const;
}
