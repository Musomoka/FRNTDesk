import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, type ParamMap } from '@angular/router';
import { PagePlaceholder } from '../../shared/page-placeholder';

/**
 * Serves both `/checkout/classroom/:classroomId` and
 * `/checkout/recording/:recordingId` — one component, not two, and
 * deliberately not split further into per-status routes either (see plan
 * §3): a Back-button resubmission mid-poll must not be able to double-charge,
 * which a URL-addressable "pending" state would risk.
 *
 * `purpose` comes from route `data` (set in app.routes.ts), so this component
 * never has to guess which param name is present.
 */
@Component({
  selector: 'app-checkout-page',
  imports: [PagePlaceholder],
  template: `
    <app-page-placeholder
      title="Checkout"
      [purpose]="purposeDescription()"
      [states]="states"
    />
  `,
})
export class CheckoutPage {
  private readonly route = inject(ActivatedRoute);

  private readonly paramMap = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap satisfies ParamMap,
  });

  protected readonly purpose = computed(
    () => this.route.snapshot.data['purpose'] as 'CLASS_ENROLLMENT' | 'RECORDING_ACCESS',
  );

  protected readonly targetId = computed(() =>
    this.purpose() === 'CLASS_ENROLLMENT'
      ? this.paramMap().get('classroomId')
      : this.paramMap().get('recordingId'),
  );

  protected readonly purposeDescription = computed(
    () =>
      `Collect phone, drive the mobile-money push, confirm the outcome. ` +
      `Purpose: ${this.purpose()}. Target: ${this.targetId()}.`,
  );

  protected readonly states = [
    'pre-submit (form)',
    'INITIATED',
    'PENDING (polling at pollAfterMs, stop at pollTimeoutMs)',
    'SUCCESSFUL',
    'FAILED (with failureReason, retry actions)',
    'TIMEOUT (explicit: no money was taken)',
    'network error submitting (distinct from FAILED)',
  ] as const;
}
