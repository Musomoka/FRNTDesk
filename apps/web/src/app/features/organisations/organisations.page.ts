import { Component, inject, signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import type { OrganisationWithSubCourses } from '@frntdesk/shared';
import { OrganisationsApi } from '../../core/organisations/organisations-api';

/** Businesses and schools, each with their sub-courses (teams/departments, or grades/subjects). */
@Component({
  selector: 'app-organisations-page',
  imports: [MatCardModule, MatProgressSpinnerModule],
  template: `
    <div class="organisations-page">
      <h1>Organisations</h1>

      @if (loading()) {
        <div class="loading"><mat-spinner diameter="28" /></div>
      } @else if (error()) {
        <p class="error">{{ error() }}</p>
      } @else if (organisations().length === 0) {
        <p class="empty">No organisations yet.</p>
      } @else {
        @for (org of organisations(); track org.id) {
          <mat-card appearance="outlined" class="org-card">
            <mat-card-header>
              <mat-card-title>{{ org.name }}</mat-card-title>
              <mat-card-subtitle>{{ org.type === 'BUSINESS' ? 'Business' : 'School' }}</mat-card-subtitle>
            </mat-card-header>
            <mat-card-content>
              @if (org.subCourses.length === 0) {
                <p class="empty">No sub-courses yet.</p>
              } @else {
                <ul class="sub-courses">
                  @for (subCourse of org.subCourses; track subCourse.id) {
                    <li>
                      <span class="sub-course-name">{{ subCourse.name }}</span>
                      @if (subCourse.description) {
                        <span class="sub-course-description"> — {{ subCourse.description }}</span>
                      }
                    </li>
                  }
                </ul>
              }
            </mat-card-content>
          </mat-card>
        }
      }
    </div>
  `,
  styles: `
    .organisations-page {
      max-width: 640px;
      margin: 0 auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    h1 {
      margin: 0;
    }

    .loading {
      display: flex;
      justify-content: center;
      padding: 24px 0;
    }

    .error {
      color: var(--mat-sys-error);
    }

    .empty {
      color: var(--mat-sys-on-surface-variant);
    }

    .sub-courses {
      margin: 0;
      padding-left: 20px;
    }

    .sub-course-name {
      font-weight: 500;
    }

    .sub-course-description {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class OrganisationsPage {
  private readonly api = inject(OrganisationsApi);

  protected readonly organisations = signal<OrganisationWithSubCourses[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  constructor() {
    this.api.list().subscribe({
      next: (organisations) => {
        this.organisations.set(organisations);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Could not load organisations. Try again.');
        this.loading.set(false);
      },
    });
  }
}
