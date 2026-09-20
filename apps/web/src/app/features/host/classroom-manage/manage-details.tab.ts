import { Component } from '@angular/core';
import { PagePlaceholder } from '../../../shared/page-placeholder';

@Component({
  selector: 'app-manage-details-tab',
  imports: [PagePlaceholder],
  template: `
    <app-page-placeholder
      title="Details"
      purpose="Edit classroom fields; publish, unpublish, or cancel."
      [states]="states"
    />
  `,
})
export class ManageDetailsTab {
  protected readonly states = [
    'editing',
    'publish blocked: unverified',
    'publish blocked: no sessions',
    'cancel confirmation',
  ] as const;
}
