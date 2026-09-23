import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { formatMoney, type Recording } from '@frntdesk/shared';
import { RecordingsApi } from '../../core/api/recordings-api';

@Component({
  selector: 'app-replay-player-page',
  imports: [DatePipe, RouterLink, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  template: `
    <div class="replay">
      @if (loading()) {
        <div class="state"><mat-spinner diameter="32" /></div>
      } @else if (error()) {
        <div class="state"><p class="error">{{ error() }}</p></div>
      } @else if (recording(); as row) {
        <h1>{{ row.classroomTitle }}</h1>
        <p class="meta">{{ row.recordedAt | date: 'd MMM yyyy' }}</p>

        @if (row.playbackUrl) {
          <video class="player" controls [src]="row.playbackUrl"></video>
        } @else if (row.priceMinor !== null) {
          <div class="locked">
            <mat-icon>lock</mat-icon>
            <p>You don't have access to this replay yet.</p>
            <a mat-flat-button color="primary" [routerLink]="['/checkout/recording', row.id]">
              Buy for {{ price(row) }}
            </a>
          </div>
        } @else {
          <div class="locked">
            <mat-icon>lock</mat-icon>
            <p>This replay is only available to people enrolled in the class.</p>
            <a mat-stroked-button [routerLink]="['/classes', row.classroomId]">View the class</a>
          </div>
        }
      }
    </div>
  `,
  styles: `
    .replay {
      max-width: 880px;
      margin: 0 auto;
      padding: 16px;
    }

    h1 {
      margin: 0 0 4px;
      font-size: 1.5rem;
    }

    .meta {
      margin: 0 0 16px;
      color: var(--mat-sys-on-surface-variant);
    }

    .player {
      width: 100%;
      border-radius: 12px;
      background: #000;
    }

    .locked {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      padding: 48px 16px;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 12px;
      text-align: center;
      color: var(--mat-sys-on-surface-variant);
    }

    .locked mat-icon {
      font-size: 40px;
      width: 40px;
      height: 40px;
    }

    .state {
      display: flex;
      justify-content: center;
      padding: 48px 0;
    }

    .error {
      color: var(--mat-sys-error);
    }
  `,
})
export class ReplayPlayerPage {
  private readonly api = inject(RecordingsApi);

  readonly recordingId = input.required<string>();

  protected readonly recording = signal<Recording | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  constructor() {
    effect(() => {
      const id = this.recordingId();
      this.loading.set(true);
      this.api.detail(id).subscribe({
        next: (row) => {
          this.recording.set(row);
          this.loading.set(false);
        },
        error: (err: unknown) => {
          this.error.set(
            err instanceof HttpErrorResponse && err.status === 404
              ? 'That replay does not exist.'
              : 'Could not load that replay.',
          );
          this.loading.set(false);
        },
      });
    });
  }

  protected price(row: Recording): string {
    return formatMoney(row.priceMinor ?? 0, row.currency);
  }
}
