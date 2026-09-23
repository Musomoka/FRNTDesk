import { Component, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { debounceTime, distinctUntilChanged, startWith, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { formatMoney, type Classroom } from '@frntdesk/shared';
import { ClassroomsApi } from '../../core/api/classrooms-api';
import { AuthStore } from '../../core/auth/auth-store';

/**
 * Discovery, and the authenticated home. Deliberately readable signed-out:
 * the whole point of a public catalog is that someone can see what is on
 * offer before deciding to create an account.
 */
@Component({
  selector: 'app-catalog-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <div class="catalog">
      <header class="head">
        <h1>{{ auth.isAuthenticated() ? 'Discover classes' : 'Live classes, taught by people near you' }}</h1>
        @if (!auth.isAuthenticated()) {
          <p class="tagline">
            Join a live session from your phone. Pay with MTN or Airtel Money.
          </p>
        }
      </header>

      <mat-form-field appearance="outline" class="search">
        <mat-label>Search classes</mat-label>
        <input matInput [formControl]="search" placeholder="e.g. financial modelling" />
        <mat-icon matPrefix>search</mat-icon>
      </mat-form-field>

      @if (loading()) {
        <div class="loading"><mat-spinner diameter="32" /></div>
      } @else if (error()) {
        <p class="error">{{ error() }}</p>
      } @else if (classes().length === 0) {
        <p class="empty">
          {{ search.value ? 'No classes match that search.' : 'No classes have been published yet.' }}
        </p>
      } @else {
        <div class="grid">
          @for (item of classes(); track item.id) {
            <mat-card appearance="outlined" class="card">
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
                <div class="meta">
                  <span class="price">{{ price(item) }}</span>
                  <span class="seats">{{ seatsLeft(item) }}</span>
                </div>
              </mat-card-content>
              <mat-card-actions>
                <a mat-flat-button color="primary" [routerLink]="['/classes', item.id]">View class</a>
              </mat-card-actions>
            </mat-card>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .catalog {
      max-width: 960px;
      margin: 0 auto;
      padding: 16px;
    }

    .head h1 {
      margin: 8px 0 4px;
    }

    .tagline {
      margin: 0 0 8px;
      color: var(--mat-sys-on-surface-variant);
    }

    .search {
      width: 100%;
      max-width: 420px;
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

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 16px;
    }

    .card {
      display: flex;
      flex-direction: column;
    }

    .card mat-card-content {
      flex: 1 1 auto;
    }

    .description {
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
      color: var(--mat-sys-on-surface-variant);
      margin: 12px 0;
    }

    .meta {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 8px;
    }

    .price {
      font-weight: 600;
      font-size: 1.125rem;
    }

    .seats {
      font-size: 0.875rem;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class CatalogPage {
  private readonly api = inject(ClassroomsApi);
  protected readonly auth = inject(AuthStore);

  protected readonly search = new FormControl('', { nonNullable: true });
  protected readonly classes = signal<Classroom[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  constructor() {
    // Debounced so typing is one request per pause rather than per keystroke,
    // and `switchMap` so a slow earlier response can never land on top of a
    // newer one and show results for a query the user has moved on from.
    this.search.valueChanges
      .pipe(
        startWith(''),
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((q) => {
          this.loading.set(true);
          this.error.set(null);
          return this.api.catalog({ q: q.trim() || undefined });
        }),
        takeUntilDestroyed(),
      )
      .subscribe({
        next: (page) => {
          this.classes.set(page.items);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('Could not load classes. Try again.');
          this.loading.set(false);
        },
      });
  }

  protected price(item: Classroom): string {
    return item.priceMinor === 0 ? 'Free' : formatMoney(item.priceMinor, item.currency);
  }

  protected seatsLeft(item: Classroom): string {
    const left = item.capacity - item.enrolledCount;
    if (left <= 0) return 'Full';
    return `${left} of ${item.capacity} seats left`;
  }
}
