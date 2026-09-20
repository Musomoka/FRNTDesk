import { Component } from '@angular/core';
import { PagePlaceholder } from '../../shared/page-placeholder';

@Component({
  selector: 'app-invitation-landing-page',
  imports: [PagePlaceholder],
  template: `
    <app-page-placeholder
      title="You're invited"
      purpose="Resolve an invite link to enrollment."
      [states]="states"
    />
  `,
})
export class InvitationLandingPage {
  protected readonly states = [
    'valid + pending',
    'expired',
    'revoked',
    'already accepted',
    'loading',
    'error',
  ] as const;
}
