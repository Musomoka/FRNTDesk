import { Component, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';

/**
 * Renders a screen's spec (purpose + the states it must handle, from the
 * UI/UX plan) as a placeholder in place of real content. Every route in the
 * app currently renders one of these — as each feature is actually built,
 * its page component drops this in favor of real markup.
 *
 * Existing on purpose rather than leaving pages blank: the route tree is
 * navigable and reviewable end-to-end before any single feature is built out,
 * and the states list stays visible right where it'll be implemented.
 */
@Component({
  selector: 'app-page-placeholder',
  imports: [MatCardModule, MatChipsModule],
  template: `
    <mat-card class="placeholder" appearance="outlined">
      <mat-card-header>
        <mat-card-title>{{ title() }}</mat-card-title>
      </mat-card-header>
      <mat-card-content>
        <p class="purpose">{{ purpose() }}</p>
        @if (states().length > 0) {
          <p class="states-label">States to handle:</p>
          <mat-chip-set>
            @for (state of states(); track state) {
              <mat-chip>{{ state }}</mat-chip>
            }
          </mat-chip-set>
        }
        <ng-content />
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    .placeholder {
      max-width: 640px;
      margin: 24px auto;
    }

    .purpose {
      color: var(--mat-sys-on-surface-variant);
    }

    .states-label {
      font-weight: 500;
      margin-bottom: 8px;
    }

    mat-chip-set {
      margin-bottom: 8px;
    }
  `,
})
export class PagePlaceholder {
  readonly title = input.required<string>();
  readonly purpose = input.required<string>();
  readonly states = input<readonly string[]>([]);
}
