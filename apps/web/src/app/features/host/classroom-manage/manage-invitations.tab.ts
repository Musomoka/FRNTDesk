import { Component } from '@angular/core';
import { PagePlaceholder } from '../../../shared/page-placeholder';

@Component({
  selector: 'app-manage-invitations-tab',
  imports: [PagePlaceholder],
  template: `
    <app-page-placeholder
      title="Invitations"
      purpose="See sent invitations and revoke them."
      [states]="states"
    />
  `,
})
export class ManageInvitationsTab {
  protected readonly states = [
    'empty',
    'per-row status',
    'revoke',
  ] as const;
}
