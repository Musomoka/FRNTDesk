/**
 * Money handling. Every amount that crosses a boundary in this system is an
 * integer count of minor units (ngwee; 100 to the kwacha). Floats never touch a
 * balance — they are introduced only at the display edge and at the provider
 * wire format, both of which are one-way conversions out of the integer.
 */

export const SUPPORTED_CURRENCIES = ['ZMW', 'EUR'] as const;
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

/** All currencies in play use two decimal places. */
const MINOR_UNITS_PER_MAJOR = 100;

export class MoneyError extends Error {}

/**
 * Converts user-facing kwacha to storage ngwee. Rejects fractional ngwee
 * outright rather than rounding silently — a price of K10.005 is a mistake in
 * the host's input, not something to guess at.
 */
export function majorToMinor(major: number): number {
  if (!Number.isFinite(major)) {
    throw new MoneyError('Amount must be a finite number.');
  }
  const minor = Math.round(major * MINOR_UNITS_PER_MAJOR);
  if (Math.abs(major * MINOR_UNITS_PER_MAJOR - minor) > 1e-6) {
    throw new MoneyError('Amount cannot be smaller than one ngwee.');
  }
  return minor;
}

export function minorToMajor(minor: number): number {
  assertValidMinor(minor);
  return minor / MINOR_UNITS_PER_MAJOR;
}

export function assertValidMinor(minor: number): void {
  if (!Number.isInteger(minor)) {
    throw new MoneyError('Minor-unit amounts must be integers.');
  }
  if (minor < 0) {
    throw new MoneyError('Amounts cannot be negative.');
  }
  if (!Number.isSafeInteger(minor)) {
    throw new MoneyError('Amount is too large.');
  }
}

/**
 * The decimal string the mobile money APIs expect, e.g. `150.00`.
 * Built from the integer so no float rounding can creep into a charge.
 */
export function minorToProviderAmount(minor: number): string {
  assertValidMinor(minor);
  const whole = Math.floor(minor / MINOR_UNITS_PER_MAJOR);
  const fraction = minor % MINOR_UNITS_PER_MAJOR;
  return `${whole}.${String(fraction).padStart(2, '0')}`;
}

/** Display form for the UI and receipts, e.g. `K150.00`. */
export function formatMoney(minor: number, currency: Currency = 'ZMW'): string {
  assertValidMinor(minor);
  return new Intl.NumberFormat('en-ZM', {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
  }).format(minorToMajor(minor));
}

export function isSupportedCurrency(value: string): value is Currency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(value);
}
