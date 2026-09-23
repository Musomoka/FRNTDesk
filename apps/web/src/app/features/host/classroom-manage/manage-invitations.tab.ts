import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import type { Invitation } from '@frntdesk/shared';
import { InvitationsApi } from '../../../core/api/invitations-api';
import { ManageStore } from './manage-store';

@Component({
  selector: 'app-manage-invitations-tab',
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatChipsModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <div class="invitations">
      <div class="head">
        <a mat-flat-button color="primary" [routerLink]="['/host/classrooms', store.classroomId(), 'invite']">
          <mat-icon>mail</mat-icon>
          Invite people
        </a>
      </div>

      @if (loading()) {
        <div class="loading"><mat-spinner diameter="28" /></div>
      } @else if (error()) {
        <p class="error">{{ error() }}</p>
      } @else if (rows().length === 0) {
        <p class="empty">No invitations sent yet.</p>
      } @else {
        <ul class="list">
          @for (row of rows(); track row.id) {
            <li>
              <div>
                <span class="email">{{ row.email }}</span>
                <span class="meta">
                  Expires {{ row.expiresAt | date: 'd MMM yyyy' }}
                  @if (row.comp) {
                    · free place
                  }
                </span>
              </div>
              <div class="right">
                <mat-chip-set>
                  <mat-chip>{{ row.status }}</mat-chip>
                </mat-chip-set>
                @if (row.status === 'SENT') {
                  <button mat-icon-button (click)="revoke(row)" aria-label="Revoke invitation">
                    <mat-icon>block</mat-icon>
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
    .invitations {
      padding-top: 16px;
    }

    .head {
      margin-bottom: 16px;
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
      gap: 12px;
      padding: 8px 12px;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 8px;
    }

    .right {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .email {
      display: block;
      font-weight: 500;
    }

    .meta {
      font-size: 0.875rem;
      color: var(--mat-sys-on-surface-variant);
    }

    .empty {
      color: var(--mat-sys-on-surface-variant);
    }

    .error {
      color: var(--mat-sys-error);
    }

    .loading {
      display: flex;
      justify-content: center;
      padding: 24px 0;
    }
  `,
})
export class ManageInvitationsTab {
  private readonly api = inject(InvitationsApi);
  protected readonly store = inject(ManageStore);

  protected readonly rows = signal<Invitation[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  constructor() {
    this.refresh();
  }

  private refresh(): void {
    this.loading.set(true);
    this.api.list(this.store.classroomId()).subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Could not load invitations.');
        this.loading.set(false);
      },
    });
  }

  protected revoke(row: Invitation): void {
    this.api.revoke(row.id).subscribe({
      next: (updated) => this.rows.update((all) => all.map((r) => (r.id === updated.id ? updated : r))),
      error: () => this.error.set('Could not revoke that invitation.'),
    });
  }
}
