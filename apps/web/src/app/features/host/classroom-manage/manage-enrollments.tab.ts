import { Component } from '@angular/core';
import { PagePlaceholder } from '../../../shared/page-placeholder';

@Component({
  selector: 'app-manage-enrollments-tab',
  imports: [PagePlaceholder],
  template: `
    <app-page-placeholder
      title="Enrollments"
      purpose="See who's enrolled and their payment status."
      [states]="states"
    />
  `,
})
export class ManageEnrollmentsTab {
  protected readonly states = [
    'empty',
    'near-capacity warning',
    'per-row status',
  ] as const;
}
