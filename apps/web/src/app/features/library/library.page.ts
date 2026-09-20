import { Component } from '@angular/core';
import { PagePlaceholder } from '../../shared/page-placeholder';

@Component({
  selector: 'app-library-page',
  imports: [PagePlaceholder],
  template: `
    <app-page-placeholder
      title="Library"
      purpose="Everything you can play back, regardless of how you got access."
      [states]="states"
    />
  `,
})
export class LibraryPage {
  protected readonly states = [
    'loading',
    'empty',
    'populated',
  ] as const;
}
