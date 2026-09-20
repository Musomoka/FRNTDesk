import { Component } from '@angular/core';
import { PagePlaceholder } from '../../shared/page-placeholder';

@Component({
  selector: 'app-account-page',
  imports: [PagePlaceholder],
  template: `
    <app-page-placeholder
      title="Account"
      purpose="Manage profile, password, and verification."
      [states]="states"
    />
  `,
})
export class AccountPage {
  protected readonly states = [
    'unverified banner',
    'saving',
    'error',
  ] as const;
}
