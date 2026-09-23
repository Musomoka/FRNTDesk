import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { ClassroomsApi, type RosterEntry } from '../../../core/api/classrooms-api';
import { ManageStore } from './manage-store';

@Component({
  selector: 'app-manage-enrollments-tab',
  imports: [DatePipe, MatChipsModule, MatProgressSpinnerModule, MatTableModule],
  template: `
    <div class="roster">
      @if (loading()) {
        <div class="loading"><mat-spinner diameter="28" /></div>
      } @else if (error()) {
        <p class="error">{{ error() }}</p>
      } @else if (rows().length === 0) {
        <p class="empty">Nobody has enrolled yet.</p>
      } @else {
        <p class="summary">{{ activeCount() }} enrolled · {{ rows().length }} total</p>
        <table mat-table [dataSource]="rows()">
          <ng-container matColumnDef="name">
            <th mat-header-cell *matHeaderCellDef>Name</th>
            <td mat-cell *matCellDef="let row">{{ row.displayName }}</td>
          </ng-container>

          <ng-container matColumnDef="email">
            <th mat-header-cell *matHeaderCellDef>Email</th>
            <td mat-cell *matCellDef="let row">{{ row.email }}</td>
          </ng-container>

          <ng-container matColumnDef="status">
            <th mat-header-cell *matHeaderCellDef>Status</th>
            <td mat-cell *matCellDef="let row">
              <mat-chip-set>
                <mat-chip>{{ row.enrollment.status }}</mat-chip>
              </mat-chip-set>
            </td>
          </ng-container>

          <ng-container matColumnDef="joined">
            <th mat-header-cell *matHeaderCellDef>Enrolled</th>
            <td mat-cell *matCellDef="let row">
              {{ row.enrollment.createdAt | date: 'd MMM yyyy' }}
            </td>
          </ng-container>

          <tr mat-header-row *matHeaderRowDef="columns"></tr>
          <tr mat-row *matRowDef="let row; columns: columns"></tr>
        </table>
      }
    </div>
  `,
  styles: `
    .roster {
      padding-top: 16px;
    }

    table {
      width: 100%;
    }

    .summary {
      color: var(--mat-sys-on-surface-variant);
      font-size: 0.875rem;
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
export class ManageEnrollmentsTab {
  private readonly api = inject(ClassroomsApi);
  private readonly store = inject(ManageStore);

  protected readonly rows = signal<RosterEntry[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly columns = ['name', 'email', 'status', 'joined'];

  protected readonly activeCount = computed(
    () => this.rows().filter((row) => row.enrollment.status === 'ACTIVE').length,
  );

  constructor() {
    this.api.roster(this.store.classroomId()).subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Could not load the roster.');
        this.loading.set(false);
      },
    });
  }
}
