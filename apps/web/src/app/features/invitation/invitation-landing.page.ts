import { HttpErrorResponse } from '@angular/common/http';
import { Component, effect, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { input } from '@angular/core';
import { formatMoney, type AcceptInvitationResult } from '@frntdesk/shared';
import { InvitationsApi } from '../../core/api/invitations-api';
import { AuthStore } from '../../core/auth/auth-store';

/**
 * Where an invite email lands.
 *
 * Redeeming needs an account — the seat has to belong to someone — so an
 * anonymous visitor is sent through Auth0 first with this URL as the return
 * target, and the token is redeemed once they come back.
 */
@Component({
  selector: 'app-invitation-landing-page',
  imports: [
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <div class="landing">
      <mat-card appearance="outlined">
        <mat-card-content>
          @if (!auth.ready() || working()) {
            <div class="state">
              <mat-spinner diameter="32" />
              <p>Checking your invitation&hellip;</p>
            </div>
          } @else if (!auth.isAuthenticated()) {
            <div class="state">
              <mat-icon>mail</mat-icon>
              <p>You have been invited to a class on FRNTDesk.</p>
              <p class="hint">Sign in (or create an account) to claim your seat.</p>
              <button mat-flat-button color="primary" (click)="signIn()">Continue</button>
            </div>
          } @else if (error()) {
            <div class="state failed">
              <mat-icon>error</mat-icon>
              <p>{{ error() }}</p>
              <a mat-stroked-button routerLink="/classes">Browse classes</a>
            </div>
          } @else if (result(); as outcome) {
            <div class="state success">
              <mat-icon>check_circle</mat-icon>
              @if (outcome.next === 'ENROLLED') {
                <p>You're in — "{{ outcome.classroomTitle }}" is now in My Classes.</p>
                <a mat-flat-button color="primary" routerLink="/my-classes">Go to My Classes</a>
              } @else {
                <p>Your invitation to "{{ outcome.classroomTitle }}" is confirmed.</p>
                <p class="hint">Complete payment of {{ price(outcome) }} to book the seat.</p>
                <a
                  mat-flat-button
                  color="primary"
                  [routerLink]="['/checkout/classroom', outcome.classroomId]"
                >
                  Continue to payment
                </a>
              }
            </div>
          }
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: `
    .landing {
      max-width: 480px;
      margin: 0 auto;
      padding: 32px 16px;
    }

    .state {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      padding: 24px 0;
      text-align: center;
    }

    .state mat-icon {
      font-size: 40px;
      width: 40px;
      height: 40px;
    }

    .success {
      color: var(--mat-sys-primary);
    }

    .failed {
      color: var(--mat-sys-error);
    }

    .hint {
      color: var(--mat-sys-on-surface-variant);
      font-size: 0.875rem;
      margin: 0;
    }
  `,
})
export class InvitationLandingPage {
  private readonly api = inject(InvitationsApi);
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthStore);

  readonly token = input.required<string>();

  protected readonly result = signal<AcceptInvitationResult | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly working = signal(false);

  private attempted = false;

  constructor() {
    // Waits for Auth0's startup check: deciding before `ready()` would show
    // the sign-in prompt to someone who already has a session.
    effect(() => {
      if (!this.auth.ready() || !this.auth.isAuthenticated() || this.attempted) return;
      // `currentUser` lags authentication by one sync round-trip, and the API
      // needs the local row to exist before it can attach a seat to it.
      if (!this.auth.currentUser()) return;

      this.attempted = true;
      this.redeem();
    });
  }

  private redeem(): void {
    this.working.set(true);
    this.api.accept(this.token()).subscribe({
      next: (outcome) => {
        this.working.set(false);
        this.result.set(outcome);
      },
      error: (err: unknown) => {
        this.working.set(false);
        const body = err instanceof HttpErrorResponse ? (err.error as { message?: string }) : null;
        this.error.set(body?.message ?? 'That invitation link is not valid.');
      },
    });
  }

  protected signIn(): void {
    void this.router.navigate(['/login'], {
      queryParams: { returnUrl: `/invite/${this.token()}` },
    });
  }

  protected price(outcome: AcceptInvitationResult): string {
    return formatMoney(outcome.priceMinor, 'ZMW');
  }
}
