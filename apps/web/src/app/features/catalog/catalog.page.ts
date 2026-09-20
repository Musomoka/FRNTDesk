import { Component } from '@angular/core';
import { PagePlaceholder } from '../../shared/page-placeholder';

@Component({
  selector: 'app-catalog-page',
  imports: [PagePlaceholder],
  template: `
    <app-page-placeholder
      title="Catalog"
      purpose="Discover published classes to enroll in. Doubles as the authenticated home."
      [states]="states"
    />
  `,
})
export class CatalogPage {
  protected readonly states = [
    'loading',
    'empty (no results for query)',
    'error',
    'authenticated: personalization strip',
  ] as const;
}
