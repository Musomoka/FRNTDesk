import { Component } from '@angular/core';
import { PagePlaceholder } from '../../../shared/page-placeholder';

@Component({
  selector: 'app-session-scheduler-page',
  imports: [PagePlaceholder],
  template: `
    <app-page-placeholder
      title="Schedule a session"
      purpose="Create one scheduled session for a classroom."
      [states]="states"
    />
  `,
})
export class SessionSchedulerPage {
  protected readonly states = [
    'validation (endsAt > startsAt, ≤ 8h)',
    'submitting',
    'error',
    'success',
  ] as const;
}
