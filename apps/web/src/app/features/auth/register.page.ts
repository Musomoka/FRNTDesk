import { Component } from '@angular/core';
import { PagePlaceholder } from '../../shared/page-placeholder';

@Component({
  selector: 'app-register-page',
  imports: [PagePlaceholder],
  template: `
    <app-page-placeholder
      title="Register"
      purpose="Create a new account."
      [states]="states"
    />
  `,
})
export class RegisterPage {
  protected readonly states = [
    'validating',
    'submitting',
    'duplicate email',
    'success → redirect',
  ] as const;
}
