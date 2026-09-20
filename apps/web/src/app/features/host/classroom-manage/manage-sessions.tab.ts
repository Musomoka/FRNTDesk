import { Component } from '@angular/core';
import { PagePlaceholder } from '../../../shared/page-placeholder';

@Component({
  selector: 'app-manage-sessions-tab',
  imports: [PagePlaceholder],
  template: `
    <app-page-placeholder
      title="Sessions"
      purpose="Schedule and run this classroom's sessions."
      [states]="states"
    />
  `,
})
export class ManageSessionsTab {
  protected readonly states = [
    'empty (blocks publish)',
    'per-row: scheduled/live/ended/cancelled',
    'recording status',
    'price replay (once complete)',
  ] as const;
}
