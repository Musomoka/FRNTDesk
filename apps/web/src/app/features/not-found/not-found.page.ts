import { Component } from '@angular/core';
import { PagePlaceholder } from '../../shared/page-placeholder';

@Component({
  selector: 'app-not-found-page',
  imports: [PagePlaceholder],
  template: `
    <app-page-placeholder
      title="Page not found"
      purpose="The requested page doesn't exist."
      [states]="states"
    />
  `,
})
export class NotFoundPage {
  protected readonly states = [] as const;
}
