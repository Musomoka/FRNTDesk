import type { PaymentStatus } from '@frntdesk/shared';

export interface CollectRequest {
  /** Our own reference, echoed back by the provider for cross-checking. */
  externalId: string;
  amountMinor: number;
  /** What actually goes on the wire — the MoMo sandbox only accepts EUR. */
  wireCurrency: string;
  payer: { e164: string; msisdnDigits: string; nationalSignificant: string };
  description: string;
}

export interface CollectResult {
  /** The provider's own transaction identifier. */
  providerRef: string;
  /** Some providers reject synchronously; most return PENDING. */
  status: PaymentStatus;
  failureReason?: string;
}

export interface StatusResult {
  status: PaymentStatus;
  failureReason?: string;
  /** The raw provider body, stored verbatim on the PaymentEvent for audit. */
  raw: unknown;
}

/**
 * What every mobile money integration must provide. Deliberately two methods:
 * a callback is only ever a hint that something changed — `status` is the sole
 * authority on whether money moved (see the README's note on callbacks).
 */
export interface PaymentProviderAdapter {
  readonly key: 'MTN_MOMO' | 'AIRTEL_MONEY' | 'FAKE';
  collect(request: CollectRequest): Promise<CollectResult>;
  status(providerRef: string): Promise<StatusResult>;
}
