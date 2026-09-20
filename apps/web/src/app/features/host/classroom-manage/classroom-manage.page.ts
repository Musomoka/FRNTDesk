import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatTabsModule } from '@angular/material/tabs';

/**
 * Command center for one classroom. A `mat-tab-nav-bar` bound to child
 * routes (not a `mat-tab-group` over inline content) — chosen so each tab is
 * independently loadable/erroring (per plan §3: one tab failing must not
 * blank the others) and deep-linkable, e.g. a direct link to the
 * Enrollments tab.
 */
@Component({
  selector: 'app-classroom-manage-page',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, MatTabsModule],
  template: `
    <h1>Manage classroom {{ classroomId }}</h1>

    <nav mat-tab-nav-bar [tabPanel]="tabPanel">
      @for (tab of tabs; track tab.path) {
        <a
          mat-tab-link
          [routerLink]="tab.path"
          routerLinkActive
          #rla="routerLinkActive"
          [active]="rla.isActive"
        >
          {{ tab.label }}
        </a>
      }
    </nav>
    <mat-tab-nav-panel #tabPanel>
      <router-outlet />
    </mat-tab-nav-panel>
  `,
})
export class ClassroomManagePage {
  private readonly route = inject(ActivatedRoute);

  protected readonly classroomId = this.route.snapshot.paramMap.get('id');

  protected readonly tabs = [
    { path: 'details', label: 'Details' },
    { path: 'sessions', label: 'Sessions' },
    { path: 'enrollments', label: 'Enrollments' },
    { path: 'invitations', label: 'Invitations' },
  ] as const;
}
