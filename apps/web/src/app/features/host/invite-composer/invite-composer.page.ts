import { Component } from '@angular/core';
import { PagePlaceholder } from '../../../shared/page-placeholder';

@Component({
  selector: 'app-invite-composer-page',
  imports: [PagePlaceholder],
  template: `
    <app-page-placeholder
      title="Invite people"
      purpose="Invite specific people by email, paid or comped."
      [states]="states"
    />
  `,
})
export class InviteComposerPage {
  protected readonly states = [
    'composing',
    'invalid email chip',
    'sending (progress)',
    'partial failure',
    'success',
  ] as const;
}
