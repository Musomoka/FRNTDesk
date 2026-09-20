import { describe, expect, it } from 'vitest';
import {
  MoneyError,
  assertValidMinor,
  formatMoney,
  majorToMinor,
  minorToMajor,
  minorToProviderAmount,
} from './money.js';

describe('majorToMinor', () => {
  it('converts kwacha to ngwee', () => {
    expect(majorToMinor(150)).toBe(15_000);
    expect(majorToMinor(10.5)).toBe(1050);
    expect(majorToMinor(0)).toBe(0);
  });

  it('absorbs binary float error for ordinary prices', () => {
    // 19.99 * 100 is 1998.9999999999998 in IEEE 754.
    expect(majorToMinor(19.99)).toBe(1999);
    expect(majorToMinor(0.29)).toBe(29);
  });

  it('rejects an amount finer than one ngwee instead of rounding it away', () => {
    expect(() => majorToMinor(10.005)).toThrow(MoneyError);
  });

  it('rejects non-finite input', () => {
    expect(() => majorToMinor(Number.NaN)).toThrow(MoneyError);
    expect(() => majorToMinor(Number.POSITIVE_INFINITY)).toThrow(MoneyError);
  });
});

describe('assertValidMinor', () => {
  it('rejects fractional, negative, and unsafe amounts', () => {
    expect(() => assertValidMinor(10.5)).toThrow(MoneyError);
    expect(() => assertValidMinor(-1)).toThrow(MoneyError);
    expect(() => assertValidMinor(Number.MAX_SAFE_INTEGER + 2)).toThrow(MoneyError);
  });

  it('accepts zero', () => {
    expect(() => assertValidMinor(0)).not.toThrow();
  });
});

describe('minorToProviderAmount', () => {
  it('builds the decimal string the operators expect', () => {
    expect(minorToProviderAmount(15_000)).toBe('150.00');
    expect(minorToProviderAmount(1050)).toBe('10.50');
    expect(minorToProviderAmount(5)).toBe('0.05');
    expect(minorToProviderAmount(0)).toBe('0.00');
  });

  it('always pads to two decimal places', () => {
    // A provider parsing "10.5" as 10.05 would undercharge silently.
    expect(minorToProviderAmount(1050)).toMatch(/\.\d{2}$/);
    expect(minorToProviderAmount(100)).toBe('1.00');
  });

  it('round-trips through minorToMajor', () => {
    for (const minor of [0, 1, 99, 100, 1050, 15_000, 999_999]) {
      expect(Number(minorToProviderAmount(minor))).toBeCloseTo(
        minorToMajor(minor),
        2,
      );
    }
  });
});

describe('formatMoney', () => {
  it('renders ZMW for display', () => {
    const formatted = formatMoney(15_000, 'ZMW');
    expect(formatted).toContain('150');
    expect(formatted).toMatch(/K/);
  });

  it('refuses to format an invalid amount', () => {
    expect(() => formatMoney(10.5)).toThrow(MoneyError);
  });
});
