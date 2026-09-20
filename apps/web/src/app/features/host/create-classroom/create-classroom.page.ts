import { Component } from '@angular/core';
import { PagePlaceholder } from '../../../shared/page-placeholder';

@Component({
  selector: 'app-create-classroom-page',
  imports: [PagePlaceholder],
  template: `
    <app-page-placeholder
      title="New class"
      purpose="Define a sellable class as a draft."
      [states]="states"
    />
  `,
})
export class CreateClassroomPage {
  protected readonly states = [
    'step: basics',
    'step: pricing & capacity',
    'step: review',
    'validation errors',
    'publish blocked: unverified',
    'publish blocked: no sessions',
    'saved',
  ] as const;
}
