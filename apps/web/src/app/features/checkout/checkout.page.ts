import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, input, signal } from '@angular/core';
import {
  AbstractControl,
  FormControl,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Subscription, interval, switchMap } from 'rxjs';
import {
  formatMoney,
  parseZambianMsisdn,
  type Classroom,
  type Payment,
  type PaymentPurpose,
} from '@frntdesk/shared';
import { ClassroomsApi } from '../../core/api/classrooms-api';
import { PaymentsApi } from '../../core/api/payments-api';
import { AuthStore } from '../../core/auth/auth-store';

function zambianPhoneValidator(control: AbstractControl): ValidationErrors | null {
  const value = ((control.value as string | null) ?? '').trim();
  if (value === '') return null;
  return parseZambianMsisdn(value).ok ? null : { invalidPhone: true };
}

/**
 * Mobile money checkout. The shape of this screen follows the shape of the
 * payment: the money moves on the buyer's handset, not in this tab, so after
 * submitting there is nothing to do but wait and poll — which is why the
 * waiting state is a first-class part of the page rather than a spinner on a
 * button.
 */
@Component({
  selector: 'app-checkout-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <div class="checkout">
      <mat-card appearance="outlined">
        <mat-card-header>
          <mat-card-title>Checkout</mat-card-title>
          @if (classroom(); as item) {
            <mat-card-subtitle>{{ item.title }}</mat-card-subtitle>
          }
        </mat-card-header>

        <mat-card-content>
          @if (classroom(); as item) {
            <div class="amount">
              <span class="label">Amount</span>
              <span class="value">{{ formatPrice(item) }}</span>
            </div>
          }

          @switch (phase()) {
            @case ('form') {
              <p class="hint">
                Enter the mobile money number to charge. You will get a prompt on that
                handset to approve the payment.
              </p>
              <mat-form-field appearance="outline" class="phone">
                <mat-label>Mobile money number</mat-label>
                <input matInput [formControl]="phone" placeholder="0966 123 456" />
                <mat-hint>MTN or Airtel, registered for mobile money.</mat-hint>
                @if (phone.hasError('required') && phone.touched) {
                  <mat-error>Enter the number to charge.</mat-error>
                }
                @if (phone.hasError('invalidPhone')) {
                  <mat-error>That doesn't look like a Zambian mobile number.</mat-error>
                }
              </mat-form-field>
            }

            @case ('waiting') {
              <div class="waiting">
                <mat-spinner diameter="36" />
                <p class="instruction">{{ instruction() }}</p>
                <p class="hint">Keep this page open — it updates by itself.</p>
              </div>
            }

            @case ('done') {
              <div class="result success">
                <mat-icon>check_circle</mat-icon>
                <p>Payment confirmed. Your seat is booked.</p>
              </div>
            }

            @case ('failed') {
              <div class="result failed">
                <mat-icon>error</mat-icon>
                <p>{{ failureMessage() }}</p>
              </div>
            }
          }

          @if (error()) {
            <p class="error">{{ error() }}</p>
          }
        </mat-card-content>

        <mat-card-actions class="actions">
          @switch (phase()) {
            @case ('form') {
              <button
                mat-flat-button
                color="primary"
                (click)="pay()"
                [disabled]="phone.invalid || submitting()"
              >
                @if (submitting()) {
                  <mat-spinner diameter="18" />
                } @else {
                  Pay now
                }
              </button>
            }
            @case ('done') {
              <a mat-flat-button color="primary" routerLink="/my-classes">Go to My Classes</a>
            }
            @case ('failed') {
              <button mat-flat-button color="primary" (click)="tryAgain()">Try again</button>
            }
          }
        </mat-card-actions>
      </mat-card>
    </div>
  `,
  styles: `
    .checkout {
      max-width: 520px;
      margin: 0 auto;
      padding: 16px;
    }

    .amount {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      padding: 12px 0;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
      margin-bottom: 16px;
    }

    .label {
      color: var(--mat-sys-on-surface-variant);
    }

    .value {
      font-size: 1.25rem;
      font-weight: 600;
    }

    .hint {
      color: var(--mat-sys-on-surface-variant);
      font-size: 0.875rem;
    }

    .phone {
      width: 100%;
    }

    .waiting {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      padding: 24px 0;
      text-align: center;
    }

    .instruction {
      margin: 0;
      font-weight: 500;
    }

    .result {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 24px 0;
      text-align: center;
    }

    .result.success {
      color: var(--mat-sys-primary);
    }

    .result.failed {
      color: var(--mat-sys-error);
    }

    .result mat-icon {
      font-size: 40px;
      width: 40px;
      height: 40px;
    }

    .error {
      color: var(--mat-sys-error);
      font-size: 0.875rem;
    }

    .actions {
      padding: 16px;
    }
  `,
})
export class CheckoutPage {
  private readonly classroomsApi = inject(ClassroomsApi);
  private readonly paymentsApi = inject(PaymentsApi);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthStore);

  readonly classroomId = input<string>();
  readonly recordingId = input<string>();

  protected readonly classroom = signal<Classroom | null>(null);
  protected readonly payment = signal<Payment | null>(null);
  protected readonly instruction = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly submitting = signal(false);

  protected readonly phone = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, zambianPhoneValidator],
  });

  protected readonly phase = computed<'form' | 'waiting' | 'done' | 'failed'>(() => {
    const current = this.payment();
    if (!current) return 'form';
    if (current.status === 'SUCCESSFUL') return 'done';
    if (current.status === 'FAILED' || current.status === 'TIMEOUT') return 'failed';
    return 'waiting';
  });

  protected readonly failureMessage = computed(
    () => this.payment()?.failureReason ?? 'The payment did not go through.',
  );

  private readonly purpose: PaymentPurpose =
    (this.route.snapshot.data['purpose'] as PaymentPurpose | undefined) ?? 'CLASS_ENROLLMENT';

  /**
   * Held for the life of one attempt so a retried submit reuses it, and
   * regenerated only when the buyer deliberately starts over.
   */
  private idempotencyKey = crypto.randomUUID();
  private poll: Subscription | null = null;

  constructor() {
    // Prefills from the profile: the number that receives the prompt is
    // usually the same one already on the account.
    const existing = this.auth.currentUser()?.phoneE164;
    if (existing) this.phone.setValue(existing);

    const id = this.classroomId();
    if (id) {
      this.classroomsApi.detail(id).subscribe({
        next: (item) => this.classroom.set(item),
        error: () => this.error.set('Could not load what you are paying for.'),
      });
    }
  }

  protected pay(): void {
    if (this.phone.invalid || this.submitting()) return;

    this.submitting.set(true);
    this.error.set(null);

    this.paymentsApi
      .checkout(
        {
          purpose: this.purpose,
          ...(this.classroomId() ? { classroomId: this.classroomId() } : {}),
          ...(this.recordingId() ? { recordingId: this.recordingId() } : {}),
          phone: this.phone.value.trim(),
        },
        this.idempotencyKey,
      )
      .subscribe({
        next: (response) => {
          this.submitting.set(false);
          this.payment.set(response.payment);
          this.instruction.set(response.instruction);
          this.startPolling(response.payment.id, response.pollAfterMs);
        },
        error: (err: unknown) => {
          this.submitting.set(false);
          const body =
            err instanceof HttpErrorResponse ? (err.error as { message?: string }) : null;
          this.error.set(body?.message ?? 'Could not start the payment. Try again.');
        },
      });
  }

  /**
   * The server sets the cadence (`pollAfterMs`) rather than the client
   * hard-coding one, so it can be tuned against real operator latency without
   * shipping a frontend release.
   */
  private startPolling(paymentId: string, everyMs: number): void {
    this.poll?.unsubscribe();
    this.poll = interval(everyMs)
      .pipe(switchMap(() => this.paymentsApi.status(paymentId)))
      .subscribe({
        next: (current) => {
          this.payment.set(current);
          if (current.status !== 'PENDING' && current.status !== 'INITIATED') {
            this.poll?.unsubscribe();
            this.poll = null;
          }
        },
        error: () => {
          // A dropped poll is not a failed payment — reconciliation continues
          // server-side either way, so the page just stops updating.
          this.poll?.unsubscribe();
          this.poll = null;
          this.error.set('Lost contact while confirming. Check My Classes in a moment.');
        },
      });
  }

  protected tryAgain(): void {
    this.poll?.unsubscribe();
    this.poll = null;
    this.payment.set(null);
    this.error.set(null);
    // A genuinely new attempt, so it must not be collapsed into the failed one.
    this.idempotencyKey = crypto.randomUUID();
  }

  protected formatPrice(item: Classroom): string {
    return formatMoney(item.priceMinor, item.currency);
  }
}
