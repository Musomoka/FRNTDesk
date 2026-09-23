import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { formatMoney, type Classroom } from '@frntdesk/shared';
import { ClassroomsApi } from '../../core/api/classrooms-api';

/** Everything the signed-in user teaches, in any state — drafts included. */
@Component({
  selector: 'app-host-classrooms-page',
  imports: [
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <div class="host">
      <header class="head">
        <h1>Classes you teach</h1>
        <a mat-flat-button color="primary" routerLink="/host/classrooms/new">
          <mat-icon>add</mat-icon>
          New class
        </a>
      </header>

      @if (loading()) {
        <div class="loading"><mat-spinner diameter="32" /></div>
      } @else if (error()) {
        <p class="error">{{ error() }}</p>
      } @else if (rows().length === 0) {
        <div class="empty">
          <p>You are not teaching anything yet.</p>
          <p class="hint">Create a class, schedule a session, then publish it to the catalog.</p>
        </div>
      } @else {
        @for (row of rows(); track row.id) {
          <mat-card appearance="outlined" class="row">
            <mat-card-header>
              <mat-card-title>{{ row.title }}</mat-card-title>
              <mat-card-subtitle>
                {{ row.priceMinor === 0 ? 'Free' : price(row) }} ·
                {{ row.enrolledCount }}/{{ row.capacity }} enrolled
              </mat-card-subtitle>
            </mat-card-header>
            <mat-card-content>
              <mat-chip-set>
                <mat-chip>{{ row.status }}</mat-chip>
              </mat-chip-set>
            </mat-card-content>
            <mat-card-actions>
              <a mat-stroked-button [routerLink]="['/host/classrooms', row.id, 'details']">Manage</a>
            </mat-card-actions>
          </mat-card>
        }
      }
    </div>
  `,
  styles: `
    .host {
      max-width: 720px;
      margin: 0 auto;
      padding: 16px;
    }

    .head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    }

    .head h1 {
      font-size: 1.5rem;
      margin: 0;
    }

    .row {
      margin-top: 16px;
    }

    .empty,
    .hint {
      color: var(--mat-sys-on-surface-variant);
    }

    .error {
      color: var(--mat-sys-error);
    }

    .loading {
      display: flex;
      justify-content: center;
      padding: 32px 0;
    }
  `,
})
export class HostClassroomsPage {
  private readonly api = inject(ClassroomsApi);

  protected readonly rows = signal<Classroom[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  constructor() {
    this.api.hostClassrooms().subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Could not load your classes.');
        this.loading.set(false);
      },
    });
  }

  protected price(row: Classroom): string {
    return formatMoney(row.priceMinor, row.currency);
  }
}
