import { describe, expect, it } from 'vitest';
import {
  PAYMENT_STATUSES,
  grantsAccess,
  isTerminal,
  needsReconciliation,
  transition,
  type PaymentStatus,
} from './payment-state.js';

const TERMINAL: PaymentStatus[] = ['SUCCESSFUL', 'FAILED', 'TIMEOUT'];
const NON_TERMINAL: PaymentStatus[] = ['INITIATED', 'PENDING'];

describe('transition', () => {
  it('advances INITIATED to PENDING', () => {
    expect(transition('INITIATED', 'PENDING')).toMatchObject({ kind: 'APPLY' });
  });

  it.each(TERMINAL)('lets INITIATED resolve straight to %s', (to) => {
    // Providers can reject synchronously, and a status poll can land after the
    // buyer has already approved on the handset.
    expect(transition('INITIATED', to)).toMatchObject({ kind: 'APPLY' });
  });

  it.each(TERMINAL)('settles PENDING to %s', (to) => {
    expect(transition('PENDING', to)).toMatchObject({ kind: 'APPLY' });
  });

  it('treats a repeat of the current state as a no-op, not an error', () => {
    const outcome = transition('PENDING', 'PENDING');
    expect(outcome.kind).toBe('NOOP');
  });

  it('refuses to move backwards out of a terminal state', () => {
    // This is the guard that makes a replayed callback harmless.
    const outcome = transition('SUCCESSFUL', 'PENDING');
    expect(outcome.kind).toBe('REJECT');
    if (outcome.kind === 'REJECT') {
      expect(outcome.reason).toContain('terminal');
    }
  });

  it.each([
    ['SUCCESSFUL', 'FAILED'],
    ['FAILED', 'SUCCESSFUL'],
    ['TIMEOUT', 'SUCCESSFUL'],
    ['SUCCESSFUL', 'TIMEOUT'],
  ] as const)('refuses %s -> %s', (from, to) => {
    expect(transition(from, to).kind).toBe('REJECT');
  });

  it('refuses to move backwards to INITIATED from anywhere', () => {
    for (const from of PAYMENT_STATUSES) {
      if (from === 'INITIATED') continue;
      expect(transition(from, 'INITIATED').kind).toBe('REJECT');
    }
  });

  it('classifies every possible pair without throwing', () => {
    // Exhaustive sweep: a spoofed callback can name any status, and none of
    // them may crash the handler.
    for (const from of PAYMENT_STATUSES) {
      for (const to of PAYMENT_STATUSES) {
        const outcome = transition(from, to);
        expect(['APPLY', 'NOOP', 'REJECT']).toContain(outcome.kind);
        expect(outcome.from).toBe(from);
        expect(outcome.to).toBe(to);
      }
    }
  });

  it('never applies a transition out of a terminal state', () => {
    for (const from of TERMINAL) {
      for (const to of PAYMENT_STATUSES) {
        if (from === to) continue;
        expect(transition(from, to).kind).toBe('REJECT');
      }
    }
  });
});

describe('isTerminal', () => {
  it.each(TERMINAL)('%s is terminal', (s) => expect(isTerminal(s)).toBe(true));
  it.each(NON_TERMINAL)('%s is not terminal', (s) =>
    expect(isTerminal(s)).toBe(false),
  );
});

describe('grantsAccess', () => {
  it('grants only on SUCCESSFUL', () => {
    for (const status of PAYMENT_STATUSES) {
      expect(grantsAccess(status)).toBe(status === 'SUCCESSFUL');
    }
  });
});

describe('needsReconciliation', () => {
  it('keeps polling while non-terminal and stops once settled', () => {
    for (const status of PAYMENT_STATUSES) {
      expect(needsReconciliation(status)).toBe(!isTerminal(status));
    }
  });
});
