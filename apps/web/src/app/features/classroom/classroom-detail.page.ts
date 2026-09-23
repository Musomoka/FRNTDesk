import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { formatMoney, type ClassSession, type Classroom, type EnrolledClass } from '@frntdesk/shared';
import { ClassroomsApi } from '../../core/api/classrooms-api';
import { AuthStore } from '../../core/auth/auth-store';

/**
 * The decision point: read what the class is, then either enrol (free),
 * check out (paid), or join a session already under way. Which of those it
 * offers depends on the seat the viewer holds, which is why it asks the API
 * about the viewer's own enrollment rather than inferring from local state.
 */
@Component({
  selector: 'app-classroom-detail-page',
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatDividerModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <div class="detail">
      @if (loading()) {
        <div class="loading"><mat-spinner diameter="32" /></div>
      } @else if (error()) {
        <p class="error">{{ error() }}</p>
      } @else if (classroom(); as item) {
        <mat-card appearance="outlined">
          <mat-card-header>
            <mat-card-title>{{ item.title }}</mat-card-title>
            <mat-card-subtitle>by {{ item.hostDisplayName }}</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            @if (item.organisationName) {
              <mat-chip-set>
                <mat-chip>{{ item.organisationName }} · {{ item.subCourseName }}</mat-chip>
              </mat-chip-set>
            }

            <p class="description">{{ item.description }}</p>

            <div class="facts">
              <div>
                <p class="label">Price</p>
                <p class="value">{{ item.priceMinor === 0 ? 'Free' : formatPrice(item) }}</p>
              </div>
              <div>
                <p class="label">Seats</p>
                <p class="value">{{ item.capacity - item.enrolledCount }} left</p>
              </div>
            </div>

            <mat-divider />

            <h2>Sessions</h2>
            @if (sessions().length === 0) {
              <p class="empty">No sessions scheduled yet.</p>
            } @else {
              <ul class="sessions">
                @for (session of sessions(); track session.id) {
                  <li [class.cancelled]="session.status === 'CANCELLED'">
                    <div>
                      <span class="session-title">{{ session.title ?? 'Session' }}</span>
                      <span class="session-time">
                        {{ session.startsAt | date: 'EEE d MMM, HH:mm' }} –
                        {{ session.endsAt | date: 'HH:mm' }}
                      </span>
                    </div>
                    @if (canJoin(session)) {
                      <a mat-flat-button color="primary" [routerLink]="['/live', session.id]">
                        <mat-icon>videocam</mat-icon>
                        {{ session.status === 'LIVE' ? 'Join now' : isHost() ? 'Start class' : 'Join' }}
                      </a>
                    } @else if (session.status === 'CANCELLED') {
                      <span class="badge">Cancelled</span>
                    } @else if (session.status === 'ENDED') {
                      <span class="badge">Ended</span>
                    }
                  </li>
                }
              </ul>
            }

            @if (actionError()) {
              <p class="error">{{ actionError() }}</p>
            }
          </mat-card-content>

          <mat-card-actions class="actions">
            @if (isHost()) {
              <span class="enrolled">
                <mat-icon>cast_for_education</mat-icon>
                You teach this class
              </span>
              <a mat-stroked-button [routerLink]="['/host/classrooms', item.id, 'sessions']">
                Manage sessions
              </a>
            } @else if (isEnrolled()) {
              <span class="enrolled">
                <mat-icon>check_circle</mat-icon>
                You have a seat in this class
              </span>
              <a mat-stroked-button routerLink="/my-classes">Go to My Classes</a>
            } @else if (isFull()) {
              <button mat-flat-button disabled>Class is full</button>
            } @else if (item.priceMinor === 0) {
              <button mat-flat-button color="primary" (click)="enroll()" [disabled]="working()">
                @if (working()) {
                  <mat-spinner diameter="18" />
                } @else {
                  Enrol for free
                }
              </button>
            } @else {
              <a mat-flat-button color="primary" [routerLink]="['/checkout/classroom', item.id]">
                Enrol — {{ formatPrice(item) }}
              </a>
            }
          </mat-card-actions>
        </mat-card>
      }
    </div>
  `,
  styles: `
    .detail {
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
      color: var(--mat-sys-on-surface-variant);
    }

    .description {
      white-space: pre-wrap;
      margin: 16px 0;
    }

    .facts {
      display: flex;
      gap: 32px;
      margin-bottom: 16px;
    }

    .label {
      margin: 0;
      font-size: 0.875rem;
      color: var(--mat-sys-on-surface-variant);
    }

    .value {
      margin: 2px 0 0;
      font-weight: 600;
    }

    h2 {
      font-size: 1rem;
      margin: 16px 0 8px;
    }

    .sessions {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .sessions li {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 8px 12px;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 8px;
    }

    .sessions li.cancelled {
      opacity: 0.6;
    }

    .session-title {
      display: block;
      font-weight: 500;
    }

    .session-time {
      font-size: 0.875rem;
      color: var(--mat-sys-on-surface-variant);
    }

    .badge {
      font-size: 0.75rem;
      color: var(--mat-sys-on-surface-variant);
    }

    .actions {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px;
    }

    .enrolled {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--mat-sys-primary);
      font-size: 0.875rem;
    }
  `,
})
export class ClassroomDetailPage {
  private readonly api = inject(ClassroomsApi);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);

  /** Bound from the `classes/:classroomId` route parameter. */
  readonly classroomId = input.required<string>();

  protected readonly classroom = signal<Classroom | null>(null);
  protected readonly sessions = signal<ClassSession[]>([]);
  protected readonly mySeat = signal<EnrolledClass | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);
  protected readonly working = signal(false);

  protected readonly isEnrolled = computed(
    () => this.mySeat()?.enrollment.status === 'ACTIVE',
  );

  /** Compared against our own user id, which is what the API's hostId holds. */
  protected readonly isHost = computed(() => {
    const me = this.auth.currentUser();
    const item = this.classroom();
    return Boolean(me && item && item.hostId === me.id);
  });
  protected readonly isFull = computed(() => {
    const item = this.classroom();
    return item ? item.enrolledCount >= item.capacity : false;
  });

  constructor() {
    // An effect, not a constructor call: a required route input has no value
    // yet at construction time, and this also re-runs if the id changes
    // while the component stays mounted.
    effect(() => this.load(this.classroomId()));
  }

  private load(id = this.classroomId()): void {
    this.loading.set(true);

    forkJoin({
      classroom: this.api.detail(id),
      sessions: this.api.sessions(id),
      // Only meaningful when signed in, and a 404/401 here must not take the
      // whole page down — an anonymous visitor still gets the class.
      seat: this.auth.isAuthenticated()
        ? this.api.myClass(id).pipe(catchError(() => of(null)))
        : of(null),
    }).subscribe({
      next: ({ classroom, sessions, seat }) => {
        this.classroom.set(classroom);
        this.sessions.set(sessions);
        this.mySeat.set(seat);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(
          err instanceof HttpErrorResponse && err.status === 404
            ? 'That class does not exist, or is no longer published.'
            : 'Could not load this class. Try again.',
        );
        this.loading.set(false);
      },
    });
  }

  protected enroll(): void {
    if (!this.auth.isAuthenticated()) {
      void this.router.navigate(['/login'], {
        queryParams: { returnUrl: `/classes/${this.classroomId()}` },
      });
      return;
    }

    this.working.set(true);
    this.actionError.set(null);
    this.api.enrollFree(this.classroomId()).subscribe({
      next: () => {
        this.working.set(false);
        this.load();
      },
      error: (err: unknown) => {
        this.working.set(false);
        const body = err instanceof HttpErrorResponse ? (err.error as { message?: string }) : null;
        this.actionError.set(body?.message ?? 'Could not enrol you. Try again.');
      },
    });
  }

  protected formatPrice(item: Classroom): string {
    return formatMoney(item.priceMinor, item.currency);
  }

  /**
   * Who may open the room, and when.
   *
   * Deliberately not gated on the session already being LIVE: a session stays
   * SCHEDULED until someone opens the room, and it is the *host arriving*
   * that flips it (see LiveService.joinToken). Requiring LIVE to show the
   * button would mean nobody could ever start a class.
   *
   * Students are let in on a scheduled session too rather than being made to
   * refresh until the teacher shows up — the room's own "waiting for the
   * host" state covers the gap.
   */
  protected canJoin(session: ClassSession): boolean {
    if (session.status === 'CANCELLED' || session.status === 'ENDED') return false;
    return this.isHost() || this.isEnrolled();
  }
}
