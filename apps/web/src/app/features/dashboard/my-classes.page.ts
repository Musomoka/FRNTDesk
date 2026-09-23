import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import type { EnrolledClass } from '@frntdesk/shared';
import { ClassroomsApi } from '../../core/api/classrooms-api';

/**
 * Everything the signed-in user holds a seat in. A class whose payment has
 * not settled is shown too, marked as pending, rather than hidden — someone
 * who has just paid needs to see that something happened.
 */
@Component({
  selector: 'app-my-classes-page',
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <div class="my-classes">
      <h1>My Classes</h1>

      @if (loading()) {
        <div class="loading"><mat-spinner diameter="32" /></div>
      } @else if (error()) {
        <p class="error">{{ error() }}</p>
      } @else if (rows().length === 0) {
        <div class="empty">
          <p>You have not enrolled in any classes yet.</p>
          <a mat-flat-button color="primary" routerLink="/classes">Browse classes</a>
        </div>
      } @else {
        @for (row of rows(); track row.enrollment.id) {
          <mat-card appearance="outlined" class="row">
            <mat-card-header>
              <mat-card-title>{{ row.classroom.title }}</mat-card-title>
              <mat-card-subtitle>by {{ row.classroom.hostDisplayName }}</mat-card-subtitle>
            </mat-card-header>
            <mat-card-content>
              @if (row.enrollment.status === 'PENDING_PAYMENT') {
                <p class="pending">
                  <mat-icon>schedule</mat-icon>
                  Payment not confirmed yet — approve the prompt on your phone.
                </p>
              }

              @if (row.nextSession; as session) {
                <p class="next">
                  Next: {{ session.startsAt | date: 'EEE d MMM, HH:mm' }}
                  @if (session.status === 'LIVE') {
                    <span class="live">· live now</span>
                  }
                </p>
              } @else {
                <p class="next muted">No upcoming sessions scheduled.</p>
              }
            </mat-card-content>
            <mat-card-actions>
              <a mat-stroked-button [routerLink]="['/classes', row.classroom.id]">Details</a>
              <!-- SCHEDULED counts too: the room opens before it is marked
                   live, and waiting inside it beats refreshing this page. -->
              @if (canJoin(row)) {
                <a mat-flat-button color="primary" [routerLink]="['/live', row.nextSession!.id]">
                  <mat-icon>videocam</mat-icon>
                  {{ row.nextSession!.status === 'LIVE' ? 'Join now' : 'Join' }}
                </a>
              }
            </mat-card-actions>
          </mat-card>
        }
      }
    </div>
  `,
  styles: `
    .my-classes {
      max-width: 720px;
      margin: 0 auto;
      padding: 16px;
    }

    .loading {
      display: flex;
      justify-content: center;
      padding: 32px 0;
    }

    .error {
      color: var(--mat-sys-error);
    }

    .empty {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 12px;
      color: var(--mat-sys-on-surface-variant);
    }

    .row {
      margin-bottom: 16px;
    }

    .pending {
      display: flex;
      align-items: center;
      gap: 6px;
      color: var(--mat-sys-on-surface-variant);
      font-size: 0.875rem;
    }

    .next {
      margin: 8px 0 0;
    }

    .next.muted {
      color: var(--mat-sys-on-surface-variant);
    }

    .live {
      color: var(--mat-sys-primary);
      font-weight: 600;
    }
  `,
})
export class MyClassesPage {
  private readonly api = inject(ClassroomsApi);

  protected readonly rows = signal<EnrolledClass[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  /** A confirmed seat plus a session that has not already come and gone. */
  protected canJoin(row: EnrolledClass): boolean {
    if (row.enrollment.status !== 'ACTIVE') return false;
    const session = row.nextSession;
    return Boolean(session && (session.status === 'SCHEDULED' || session.status === 'LIVE'));
  }

  constructor() {
    this.api.myClasses().subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Could not load your classes. Try again.');
        this.loading.set(false);
      },
    });
  }
}
