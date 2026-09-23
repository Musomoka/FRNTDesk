import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import type { Recording } from '@frntdesk/shared';
import { RecordingsApi } from '../../core/api/recordings-api';

@Component({
  selector: 'app-library-page',
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <div class="library">
      <h1>Library</h1>

      @if (loading()) {
        <div class="loading"><mat-spinner diameter="32" /></div>
      } @else if (error()) {
        <p class="error">{{ error() }}</p>
      } @else if (rows().length === 0) {
        <div class="empty">
          <mat-icon>video_library</mat-icon>
          <p>No replays yet.</p>
          <p class="hint">
            Recordings of sessions you attend show up here once the host publishes them.
          </p>
          <a mat-stroked-button routerLink="/my-classes">My Classes</a>
        </div>
      } @else {
        <div class="grid">
          @for (row of rows(); track row.id) {
            <mat-card appearance="outlined">
              <mat-card-header>
                <mat-card-title>{{ row.classroomTitle }}</mat-card-title>
                <mat-card-subtitle>
                  {{ row.recordedAt | date: 'd MMM yyyy' }}
                  @if (row.durationSec) {
                    · {{ minutes(row) }} min
                  }
                </mat-card-subtitle>
              </mat-card-header>
              <mat-card-actions>
                <a mat-flat-button color="primary" [routerLink]="['/library', row.id]">
                  <mat-icon>play_arrow</mat-icon>
                  Watch
                </a>
              </mat-card-actions>
            </mat-card>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .library {
      max-width: 800px;
      margin: 0 auto;
      padding: 16px;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 16px;
    }

    .empty {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
      color: var(--mat-sys-on-surface-variant);
    }

    .empty mat-icon {
      font-size: 40px;
      width: 40px;
      height: 40px;
    }

    .hint {
      font-size: 0.875rem;
      margin: 0;
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
export class LibraryPage {
  private readonly api = inject(RecordingsApi);

  protected readonly rows = signal<Recording[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  constructor() {
    this.api.library().subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Could not load your library.');
        this.loading.set(false);
      },
    });
  }

  protected minutes(row: Recording): number {
    return Math.round((row.durationSec ?? 0) / 60);
  }
}
