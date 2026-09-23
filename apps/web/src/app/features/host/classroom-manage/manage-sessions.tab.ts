import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatNativeDateModule } from '@angular/material/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import type { ClassSession } from '@frntdesk/shared';
import { ClassroomsApi } from '../../../core/api/classrooms-api';
import { ManageStore } from './manage-store';

function combineDateAndTime(date: Date | null, time: string): Date {
  if (!date || !time) throw new Error('Date and time are required');
  const [hours, minutes] = time.split(':').map(Number);
  const combined = new Date(date);
  combined.setHours(hours, minutes, 0, 0);
  return combined;
}

@Component({
  selector: 'app-manage-sessions-tab',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatNativeDateModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <div class="sessions">
      <form [formGroup]="form" (ngSubmit)="schedule()" class="scheduler">
        <h2>Schedule a session</h2>

        <div class="session-times">
          <label class="group-label starts-label">Starts</label>
          <label class="group-label ends-label">Ends</label>

          <mat-form-field appearance="outline" class="date-field starts-date">
            <mat-label>Date</mat-label>
            <input matInput [matDatepicker]="startDatePicker" formControlName="startsDate" readonly />
            <mat-datepicker-toggle matSuffix [for]="startDatePicker"></mat-datepicker-toggle>
            <mat-datepicker #startDatePicker></mat-datepicker>
          </mat-form-field>
          <mat-form-field appearance="outline" class="time-field starts-time">
            <mat-label>Time</mat-label>
            <input matInput type="time" formControlName="startsTime" />
          </mat-form-field>

          <mat-form-field appearance="outline" class="date-field ends-date">
            <mat-label>Date</mat-label>
            <input matInput [matDatepicker]="endDatePicker" formControlName="endsDate" readonly />
            <mat-datepicker-toggle matSuffix [for]="endDatePicker"></mat-datepicker-toggle>
            <mat-datepicker #endDatePicker></mat-datepicker>
          </mat-form-field>
          <mat-form-field appearance="outline" class="time-field ends-time">
            <mat-label>Time</mat-label>
            <input matInput type="time" formControlName="endsTime" />
          </mat-form-field>
        </div>

        <mat-form-field appearance="outline">
          <mat-label>Title (optional)</mat-label>
          <input matInput formControlName="title" maxlength="120" placeholder="Week 1 — Fundamentals" />
        </mat-form-field>

        @if (error()) {
          <p class="error">{{ error() }}</p>
        }

        <div class="actions">
          <button mat-flat-button color="primary" type="submit" [disabled]="form.invalid || saving()">
            @if (saving()) {
              <mat-spinner diameter="18" />
            } @else {
              Add session
            }
          </button>
        </div>
      </form>

      <h2>Scheduled</h2>
      @if (loading()) {
        <div class="loading"><mat-spinner diameter="28" /></div>
      } @else if (sessions().length === 0) {
        <p class="empty">No sessions yet. A class needs at least one before it can be published.</p>
      } @else {
        <ul class="list">
          @for (session of sessions(); track session.id) {
            <li [class.cancelled]="session.status === 'CANCELLED'">
              <div>
                <span class="title">{{ session.title ?? 'Session' }}</span>
                <span class="time">
                  {{ session.startsAt | date: 'EEE d MMM yyyy, HH:mm' }} –
                  {{ session.endsAt | date: 'HH:mm' }}
                </span>
                <span class="status">{{ session.status }}</span>
              </div>

              <div class="row-actions">
                <!-- The host's way in. A session is SCHEDULED until someone
                     opens the room, and the host arriving is what flips it to
                     LIVE — so this cannot be gated on it already being live. -->
                @if (session.status === 'SCHEDULED' || session.status === 'LIVE') {
                  <a
                    mat-flat-button
                    color="primary"
                    [routerLink]="['/live', session.id]"
                  >
                    <mat-icon>videocam</mat-icon>
                    {{ session.status === 'LIVE' ? 'Rejoin' : 'Start class' }}
                  </a>
                }
                @if (session.status === 'SCHEDULED') {
                  <button mat-icon-button (click)="cancel(session)" aria-label="Cancel session">
                    <mat-icon>delete_outline</mat-icon>
                  </button>
                }
              </div>
            </li>
          }
        </ul>
      }
    </div>
  `,
  styles: `
    .sessions {
      padding-top: 16px;
    }

    h2 {
      font-size: 1rem;
      margin: 16px 0 8px;
    }

    .scheduler {
      display: flex;
      flex-direction: column;
      padding: 16px;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 12px;
      gap: 12px;
    }

    .scheduler h2 {
      margin-top: 0;
      margin-bottom: 8px;
    }

    mat-form-field {
      width: 100%;
    }

    /* A single flat grid rather than a grid-of-flexes: Chromium has a paint
     * bug where closing a mat-datepicker overlay can leave a sibling
     * mat-form-field's outline mispainted (border bleeding into the next
     * field) when that field sits inside a flex row nested in a grid column
     * — the layout geometry is correct throughout, only the raster is stale.
     * Flattening to one grid, so each field's width comes from a single
     * fractional calculation instead of two compounding ones, avoids
     * triggering it. */
    .session-times {
      display: grid;
      grid-template-columns: 2fr 1fr 24px 2fr 1fr;
      column-gap: 12px;
      row-gap: 8px;
      padding: 16px;
      background: var(--mat-sys-surface-dim);
      border-radius: 8px;
    }

    .group-label {
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--mat-sys-on-surface);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .starts-label {
      grid-column: 1 / 3;
    }

    .ends-label {
      grid-column: 4 / 6;
    }

    .starts-date {
      grid-column: 1;
    }

    .starts-time {
      grid-column: 2;
    }

    .ends-date {
      grid-column: 4;
    }

    .ends-time {
      grid-column: 5;
    }

    @media (max-width: 768px) {
      .session-times {
        grid-template-columns: 2fr 1fr;
      }

      .starts-label {
        grid-area: 1 / 1 / 2 / 3;
      }

      .starts-date {
        grid-area: 2 / 1;
      }

      .starts-time {
        grid-area: 2 / 2;
      }

      .ends-label {
        grid-area: 3 / 1 / 4 / 3;
        margin-top: 8px;
      }

      .ends-date {
        grid-area: 4 / 1;
      }

      .ends-time {
        grid-area: 4 / 2;
      }
    }

    .row {
      display: flex;
      gap: 16px;
    }

    .row mat-form-field {
      flex: 1 1 0;
    }

    .actions {
      display: flex;
      justify-content: flex-end;
    }

    .error {
      color: var(--mat-sys-error);
      font-size: 0.875rem;
    }

    .empty {
      color: var(--mat-sys-on-surface-variant);
    }

    .loading {
      display: flex;
      justify-content: center;
      padding: 16px 0;
    }

    .list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .list li {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 8px;
    }

    .list li.cancelled {
      opacity: 0.6;
    }

    .title {
      display: block;
      font-weight: 500;
    }

    .row-actions {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
    }

    .time,
    .status {
      font-size: 0.875rem;
      color: var(--mat-sys-on-surface-variant);
      margin-right: 8px;
    }
  `,
})
export class ManageSessionsTab {
  private readonly api = inject(ClassroomsApi);
  private readonly store = inject(ManageStore);

  protected readonly sessions = signal<ClassSession[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = new FormGroup({
    startsDate: new FormControl<Date | null>(null, { validators: [Validators.required] }),
    startsTime: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    endsDate: new FormControl<Date | null>(null, { validators: [Validators.required] }),
    endsTime: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    title: new FormControl('', { nonNullable: true }),
  });

  constructor() {
    this.refresh();
  }

  private refresh(): void {
    this.loading.set(true);
    this.api.hostSessions(this.store.classroomId()).subscribe({
      next: (rows) => {
        this.sessions.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Could not load sessions.');
        this.loading.set(false);
      },
    });
  }

  protected schedule(): void {
    if (this.form.invalid || this.saving()) return;

    this.saving.set(true);
    this.error.set(null);

    try {
      const { startsDate, startsTime, endsDate, endsTime, title } = this.form.getRawValue();
      const startsAtDate = combineDateAndTime(startsDate, startsTime);
      const endsAtDate = combineDateAndTime(endsDate, endsTime);

      this.api
        .scheduleSession(this.store.classroomId(), {
          startsAt: startsAtDate.toISOString(),
          endsAt: endsAtDate.toISOString(),
          ...(title.trim() ? { title: title.trim() } : {}),
        })
        .subscribe({
          next: () => {
            this.saving.set(false);
            this.form.reset();
            this.refresh();
          },
          error: (err: unknown) => {
            this.saving.set(false);
            const body =
              err instanceof HttpErrorResponse ? (err.error as { message?: string; errors?: { message: string }[] }) : null;
            this.error.set(
              body?.errors?.map((e) => e.message).join(' ') ??
                body?.message ??
                'Could not schedule that session.',
            );
          },
        });
    } catch (err) {
      this.saving.set(false);
      this.error.set('Please fill in all date and time fields.');
    }
  }

  protected cancel(session: ClassSession): void {
    this.api.cancelSession(session.id).subscribe({
      next: () => this.refresh(),
      error: () => this.error.set('Could not cancel that session.'),
    });
  }
}
