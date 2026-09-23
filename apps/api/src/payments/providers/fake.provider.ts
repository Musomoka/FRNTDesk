import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import type {
  CollectRequest,
  CollectResult,
  PaymentProviderAdapter,
  StatusResult,
} from './payment-provider.js';

/** How long a simulated handset takes to "approve" the prompt. */
const SETTLE_AFTER_MS = 6_000;

/**
 * Stands in for a real operator in development and e2e tests. It models the
 * part that matters for everything built on top: a collection is not instant,
 * it goes PENDING first and only resolves on a later status poll, so the
 * polling/reconciliation path is exercised locally rather than only in
 * production against a real wallet.
 *
 * Deliberately in-memory: the env schema refuses to enable this in
 * production, so durability across a restart buys nothing.
 */
@Injectable()
export class FakePaymentProvider implements PaymentProviderAdapter {
  readonly key = 'FAKE' as const;
  private readonly logger = new Logger(FakePaymentProvider.name);
  private readonly started = new Map<string, { at: number; fail: boolean }>();

  async collect(request: CollectRequest): Promise<CollectResult> {
    const providerRef = `fake-${randomUUID()}`;
    // A number ending in 0 always fails, which gives the UI's failure path a
    // deterministic way to be exercised without waiting for a real decline.
    const fail = request.payer.e164.endsWith('0');
    this.started.set(providerRef, { at: Date.now(), fail });
    this.logger.log(
      `Fake collection ${providerRef} for ${request.amountMinor} minor units (will ${fail ? 'fail' : 'succeed'})`,
    );
    return { providerRef, status: 'PENDING' };
  }

  async status(providerRef: string): Promise<StatusResult> {
    const record = this.started.get(providerRef);
    if (!record) {
      return {
        status: 'FAILED',
        failureReason: 'Unknown transaction.',
        raw: { providerRef, known: false },
      };
    }

    const elapsed = Date.now() - record.at;
    if (elapsed < SETTLE_AFTER_MS) {
      return { status: 'PENDING', raw: { providerRef, elapsed } };
    }

    return record.fail
      ? {
          status: 'FAILED',
          failureReason: 'The payer rejected the prompt.',
          raw: { providerRef, elapsed, outcome: 'rejected' },
        }
      : { status: 'SUCCESSFUL', raw: { providerRef, elapsed, outcome: 'approved' } };
  }
}
