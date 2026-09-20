/**
 * The payment lifecycle, as a pure guarded state machine.
 *
 * Mobile money integrations receive callbacks that are late, duplicated, and
 * out of order as a matter of routine. Rather than treat those as errors, this
 * module classifies every proposed transition into one of three outcomes so the
 * caller can react proportionately:
 *
 *   APPLY  — a real advance; write it.
 *   NOOP   — a duplicate of the state we are already in; record the event, change nothing.
 *   REJECT — illegal, almost always a stale message arriving after a terminal
 *            state. Record the event, change nothing, do not raise an error.
 *
 * Terminal states are final. Once a payment is SUCCESSFUL, nothing can move it
 * back to PENDING — which is what makes a replayed callback harmless.
 */

export const PAYMENT_STATUSES = [
  'INITIATED',
  'PENDING',
  'SUCCESSFUL',
  'FAILED',
  'TIMEOUT',
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export type TerminalPaymentStatus = Extract<
  PaymentStatus,
  'SUCCESSFUL' | 'FAILED' | 'TIMEOUT'
>;

const TERMINAL: ReadonlySet<PaymentStatus> = new Set<PaymentStatus>([
  'SUCCESSFUL',
  'FAILED',
  'TIMEOUT',
]);

/**
 * INITIATED can resolve straight to a terminal state: some providers reject a
 * collection synchronously, and a status poll can land after the user has
 * already approved on their handset.
 */
const ALLOWED: Readonly<Record<PaymentStatus, ReadonlySet<PaymentStatus>>> = {
  INITIATED: new Set<PaymentStatus>(['PENDING', 'SUCCESSFUL', 'FAILED', 'TIMEOUT']),
  PENDING: new Set<PaymentStatus>(['SUCCESSFUL', 'FAILED', 'TIMEOUT']),
  SUCCESSFUL: new Set<PaymentStatus>(),
  FAILED: new Set<PaymentStatus>(),
  TIMEOUT: new Set<PaymentStatus>(),
};

export type TransitionOutcome =
  | { kind: 'APPLY'; from: PaymentStatus; to: PaymentStatus }
  | { kind: 'NOOP'; from: PaymentStatus; to: PaymentStatus; reason: string }
  | { kind: 'REJECT'; from: PaymentStatus; to: PaymentStatus; reason: string };

export function isTerminal(status: PaymentStatus): status is TerminalPaymentStatus {
  return TERMINAL.has(status);
}

/**
 * Classifies a proposed transition. Never throws: every input, including
 * nonsense from a spoofed callback, maps to one of the three outcomes.
 */
export function transition(from: PaymentStatus, to: PaymentStatus): TransitionOutcome {
  if (from === to) {
    return {
      kind: 'NOOP',
      from,
      to,
      reason: `Payment is already ${from}.`,
    };
  }

  if (isTerminal(from)) {
    return {
      kind: 'REJECT',
      from,
      to,
      reason: `${from} is terminal; refusing to move to ${to}. This is normally a late or replayed provider message.`,
    };
  }

  if (!ALLOWED[from].has(to)) {
    return {
      kind: 'REJECT',
      from,
      to,
      reason: `${from} -> ${to} is not a legal transition.`,
    };
  }

  return { kind: 'APPLY', from, to };
}

/** True when the payment has settled and the buyer should be granted access. */
export function grantsAccess(status: PaymentStatus): boolean {
  return status === 'SUCCESSFUL';
}

/**
 * Whether the reconciliation worker should keep polling the provider. Stopping
 * on terminal states is what makes the retry schedule finite.
 */
export function needsReconciliation(status: PaymentStatus): boolean {
  return !isTerminal(status);
}
