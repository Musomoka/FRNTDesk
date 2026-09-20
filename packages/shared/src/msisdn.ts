/**
 * Zambian mobile number parsing and operator routing.
 *
 * Lives in `shared` so the checkout form validates a number with exactly the
 * same rules the payment service uses to pick a provider — a number the UI
 * accepts can never be one the API rejects.
 *
 * Zambia is +260. A mobile national significant number (NSN) is 9 digits and
 * its first two identify the operator.
 */

export const ZAMBIA_COUNTRY_CODE = '260';

export type MobileOperator = 'MTN' | 'AIRTEL' | 'ZAMTEL';

/** Operators we can actually collect money from today. */
export type SupportedOperator = Extract<MobileOperator, 'MTN' | 'AIRTEL'>;

const OPERATOR_PREFIXES: Readonly<Record<string, MobileOperator>> = {
  '96': 'MTN',
  '76': 'MTN',
  '97': 'AIRTEL',
  '77': 'AIRTEL',
  '95': 'ZAMTEL',
  '75': 'ZAMTEL',
};

export interface ParsedMsisdn {
  /** Display / storage form, e.g. `+260966123456`. */
  e164: string;
  /** Digits only with country code, e.g. `260966123456`. MTN wants this as `partyId`. */
  msisdnDigits: string;
  /** The 9-digit national significant number, e.g. `966123456`. Airtel wants this. */
  nationalSignificant: string;
  operator: MobileOperator;
}

export type MsisdnParseFailure =
  | 'EMPTY'
  | 'NOT_NUMERIC'
  | 'WRONG_LENGTH'
  | 'NOT_ZAMBIAN'
  | 'UNKNOWN_OPERATOR';

export type MsisdnParseResult =
  | { ok: true; value: ParsedMsisdn }
  | { ok: false; reason: MsisdnParseFailure; message: string };

/**
 * Accepts every form a Zambian user might reasonably type — `0966 123 456`,
 * `966123456`, `260966123456`, `+260-966-123456` — and normalizes it.
 *
 * Returns a result rather than throwing, because a bad phone number is
 * ordinary user input, not an exceptional condition.
 */
export function parseZambianMsisdn(input: string): MsisdnParseResult {
  const trimmed = (input ?? '').trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: 'EMPTY', message: 'Enter a mobile number.' };
  }

  // Strip everything a human might use as a separator, plus a leading +.
  const digits = trimmed.replace(/^\+/, '').replace(/[\s\-().]/g, '');

  if (!/^\d+$/.test(digits)) {
    return {
      ok: false,
      reason: 'NOT_NUMERIC',
      message: 'A mobile number can only contain digits.',
    };
  }

  const nsn = toNationalSignificant(digits);
  if (nsn === null) {
    // A leading 0 is the national trunk prefix, so the user is clearly typing a
    // Zambian number and simply got the length wrong. Only an international-
    // format attempt on another country code counts as foreign.
    const looksForeign =
      !digits.startsWith('0') &&
      digits.length >= 11 &&
      !digits.startsWith(ZAMBIA_COUNTRY_CODE);
    return looksForeign
      ? {
          ok: false,
          reason: 'NOT_ZAMBIAN',
          message: 'Only Zambian mobile numbers are supported.',
        }
      : {
          ok: false,
          reason: 'WRONG_LENGTH',
          message: 'A Zambian mobile number has 9 digits after the 0, e.g. 0966 123 456.',
        };
  }

  const operator = OPERATOR_PREFIXES[nsn.slice(0, 2)];
  if (operator === undefined) {
    return {
      ok: false,
      reason: 'UNKNOWN_OPERATOR',
      message: 'That does not look like a Zambian mobile number.',
    };
  }

  return {
    ok: true,
    value: {
      e164: `+${ZAMBIA_COUNTRY_CODE}${nsn}`,
      msisdnDigits: `${ZAMBIA_COUNTRY_CODE}${nsn}`,
      nationalSignificant: nsn,
      operator,
    },
  };
}

/**
 * Reduces any accepted input shape to the 9-digit NSN, or null if the length
 * cannot be made sense of.
 */
function toNationalSignificant(digits: string): string | null {
  // 260966123456
  if (digits.length === 12 && digits.startsWith(ZAMBIA_COUNTRY_CODE)) {
    return digits.slice(ZAMBIA_COUNTRY_CODE.length);
  }
  // 0966123456
  if (digits.length === 10 && digits.startsWith('0')) {
    return digits.slice(1);
  }
  // 966123456
  if (digits.length === 9) {
    return digits;
  }
  return null;
}

/**
 * Zamtel has no collections integration yet. Callers use this to fail loudly at
 * the edge with a clear message, rather than letting a Zamtel number reach a
 * provider that will simply reject the charge.
 */
export function isSupportedOperator(operator: MobileOperator): operator is SupportedOperator {
  return operator === 'MTN' || operator === 'AIRTEL';
}

/** Masks all but the last three digits for logs and receipts: `+26096****456`. */
export function maskMsisdn(e164: string): string {
  if (e164.length <= 7) return e164;
  const head = e164.slice(0, 6);
  const tail = e164.slice(-3);
  return `${head}${'*'.repeat(Math.max(0, e164.length - 9))}${tail}`;
}
