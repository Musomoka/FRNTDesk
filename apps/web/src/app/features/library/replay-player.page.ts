import { Component } from '@angular/core';
import { PagePlaceholder } from '../../shared/page-placeholder';

@Component({
  selector: 'app-replay-player-page',
  imports: [PagePlaceholder],
  template: `
    <app-page-placeholder
      title="Watch replay"
      purpose="Watch a recorded session."
      [states]="states"
    />
  `,
})
export class ReplayPlayerPage {
  protected readonly states = [
    'processing (no player)',
    'complete with access',
    'complete without access (upsell)',
    'failed (terminal)',
  ] as const;
}
