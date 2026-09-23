import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTabsModule } from '@angular/material/tabs';
import type { Classroom } from '@frntdesk/shared';
import { ClassroomsApi } from '../../../core/api/classrooms-api';
import { ManageStore } from './manage-store';

/**
 * Command center for one classroom. A `mat-tab-nav-bar` bound to child
 * routes (not a `mat-tab-group` over inline content) — chosen so each tab is
 * independently loadable/erroring (per plan §3: one tab failing must not
 * blank the others) and deep-linkable, e.g. a direct link to the
 * Enrollments tab.
 */
@Component({
  selector: 'app-classroom-manage-page',
  imports: [
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    MatButtonModule,
    MatChipsModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTabsModule,
  ],
  template: `
    <div class="manage">
      @if (store.classroom(); as item) {
        <header class="head">
          <div>
            <h1>{{ item.title }}</h1>
            <mat-chip-set>
              <mat-chip [class.published]="item.status === 'PUBLISHED'">{{ item.status }}</mat-chip>
            </mat-chip-set>
          </div>
          <div class="head-actions">
            @if (item.status === 'DRAFT') {
              <button mat-flat-button color="primary" (click)="publish()" [disabled]="working()">
                Publish
              </button>
            }
            @if (item.status !== 'CANCELLED') {
              <button mat-stroked-button (click)="cancel()" [disabled]="working()">
                Cancel class
              </button>
            }
          </div>
        </header>

        @if (actionError()) {
          <p class="error">{{ actionError() }}</p>
        }
      } @else if (store.loading()) {
        <div class="loading"><mat-spinner diameter="28" /></div>
      } @else if (store.error()) {
        <p class="error">{{ store.error() }}</p>
      }

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
    </div>
  `,
  styles: `
    .manage {
      max-width: 800px;
      margin: 0 auto;
      padding: 16px;
    }

    .head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    }

    .head h1 {
      margin: 0 0 8px;
      font-size: 1.5rem;
    }

    .head-actions {
      display: flex;
      gap: 8px;
    }

    .published {
      background: var(--mat-sys-primary-container);
    }

    .loading {
      display: flex;
      justify-content: center;
      padding: 24px 0;
    }

    .error {
      color: var(--mat-sys-error);
    }
  `,
  // One store per manage screen, shared with the tabs below it, so switching
  // tabs does not refetch the same classroom four times.
  providers: [ManageStore],
})
export class ClassroomManagePage {
  private readonly api = inject(ClassroomsApi);
  private readonly route = inject(ActivatedRoute);
  protected readonly store = inject(ManageStore);

  protected readonly working = signal(false);
  protected readonly actionError = signal<string | null>(null);

  protected readonly tabs = [
    { path: 'details', label: 'Details' },
    { path: 'sessions', label: 'Sessions' },
    { path: 'enrollments', label: 'Enrollments' },
    { path: 'invitations', label: 'Invitations' },
  ] as const;

  constructor() {
    this.store.load(this.route.snapshot.paramMap.get('id') ?? '');
  }

  protected publish(): void {
    this.run(this.api.publishClassroom(this.store.classroomId()));
  }

  protected cancel(): void {
    this.run(this.api.cancelClassroom(this.store.classroomId()));
  }

  private run(request: ReturnType<ClassroomsApi['publishClassroom']>): void {
    this.working.set(true);
    this.actionError.set(null);
    request.subscribe({
      next: (updated: Classroom) => {
        this.working.set(false);
        this.store.set(updated);
      },
      error: (err: unknown) => {
        this.working.set(false);
        const body = err instanceof HttpErrorResponse ? (err.error as { message?: string }) : null;
        this.actionError.set(body?.message ?? 'That did not work. Try again.');
      },
    });
  }
}
