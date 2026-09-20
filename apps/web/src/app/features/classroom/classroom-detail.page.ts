import { Component } from '@angular/core';
import { PagePlaceholder } from '../../shared/page-placeholder';

/**
 * The highest-complexity screen in the app (see UI/UX plan §3). When this is
 * built out for real, its ~10 states below must be modeled as ONE
 * discriminated `viewState` computed signal, not independent booleans —
 * that's what makes "enrolled" and "session ended" mutually exclusive by
 * construction instead of a bug waiting to happen.
 */
@Component({
  selector: 'app-classroom-detail-page',
  imports: [PagePlaceholder],
  template: `
    <app-page-placeholder
      title="Classroom detail"
      purpose="Convert a browser into a buyer, or a buyer into an attendee."
      [states]="states"
    />
  `,
})
export class ClassroomDetailPage {
  protected readonly states = [
    'owner viewing own draft',
    'published / unauthenticated',
    'published / not enrolled',
    'checkout in flight for this classroom (resume, don’t restart)',
    'enrolled / session not yet joinable',
    'enrolled / session joinable or live (pulsing CTA)',
    'ended / recording processing',
    'ended / replay included via enrollment',
    'ended / replay priced separately, no access',
    'cancelled',
    'loading',
    'error',
    'not found',
  ] as const;
}
