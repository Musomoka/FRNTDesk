import { describe, expect, it } from 'vitest';
import {
  isSupportedOperator,
  maskMsisdn,
  parseZambianMsisdn,
  type MobileOperator,
} from './msisdn.js';

describe('parseZambianMsisdn', () => {
  it('normalizes every shape a user might type to the same number', () => {
    const inputs = [
      '0966123456',
      '966123456',
      '260966123456',
      '+260966123456',
      '+260 966 123 456',
      '0966-123-456',
      '(0966) 123456',
      '  0966123456  ',
    ];

    for (const input of inputs) {
      const result = parseZambianMsisdn(input);
      expect(result.ok, `expected ${input} to parse`).toBe(true);
      if (!result.ok) continue;
      expect(result.value.e164).toBe('+260966123456');
      expect(result.value.msisdnDigits).toBe('260966123456');
      expect(result.value.nationalSignificant).toBe('966123456');
    }
  });

  it.each([
    ['0966123456', 'MTN'],
    ['0761123456', 'MTN'],
    ['0977123456', 'AIRTEL'],
    ['0771123456', 'AIRTEL'],
    ['0955123456', 'ZAMTEL'],
    ['0751123456', 'ZAMTEL'],
  ] as const)('routes %s to %s', (input, operator) => {
    const result = parseZambianMsisdn(input);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.operator).toBe(operator);
  });

  it('rejects an empty number', () => {
    const result = parseZambianMsisdn('   ');
    expect(result).toMatchObject({ ok: false, reason: 'EMPTY' });
  });

  it('rejects non-numeric input', () => {
    const result = parseZambianMsisdn('0966-ABC-456');
    expect(result).toMatchObject({ ok: false, reason: 'NOT_NUMERIC' });
  });

  it.each(['09661234', '09661234567', '12345'])(
    'rejects %s as the wrong length',
    (input) => {
      const result = parseZambianMsisdn(input);
      expect(result).toMatchObject({ ok: false, reason: 'WRONG_LENGTH' });
    },
  );

  it('tells a foreign number apart from a malformed one', () => {
    // Kenyan number: right length, wrong country.
    const result = parseZambianMsisdn('+254712123456');
    expect(result).toMatchObject({ ok: false, reason: 'NOT_ZAMBIAN' });
  });

  it('rejects a Zambian-shaped number on an unassigned prefix', () => {
    const result = parseZambianMsisdn('0912123456');
    expect(result).toMatchObject({ ok: false, reason: 'UNKNOWN_OPERATOR' });
  });

  it('never throws, whatever it is handed', () => {
    const hostile = ['', '+', '++260', '0'.repeat(500), '🙂', '260'];
    for (const input of hostile) {
      expect(() => parseZambianMsisdn(input)).not.toThrow();
    }
  });
});

describe('isSupportedOperator', () => {
  it('accepts the two operators we can collect from', () => {
    expect(isSupportedOperator('MTN')).toBe(true);
    expect(isSupportedOperator('AIRTEL')).toBe(true);
  });

  it('excludes Zamtel, so those numbers fail at the edge with a clear message', () => {
    expect(isSupportedOperator('ZAMTEL' as MobileOperator)).toBe(false);
  });
});

describe('maskMsisdn', () => {
  it('keeps the prefix and last three digits only', () => {
    expect(maskMsisdn('+260966123456')).toBe('+26096****456');
  });

  it('leaves a too-short string alone rather than mangling it', () => {
    expect(maskMsisdn('+2609')).toBe('+2609');
  });
});
