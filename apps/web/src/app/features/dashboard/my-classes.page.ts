import { Component } from '@angular/core';
import { PagePlaceholder } from '../../shared/page-placeholder';

@Component({
  selector: 'app-my-classes-page',
  imports: [PagePlaceholder],
  template: `
    <app-page-placeholder
      title="My Classes"
      purpose="Single home for what you've bought and what you run."
      [states]="states"
    />
  `,
})
export class MyClassesPage {
  protected readonly states = [
    'loading',
    'empty: learning',
    'empty: hosting',
    'populated',
  ] as const;
}
