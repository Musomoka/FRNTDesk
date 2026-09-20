import { z } from 'zod';
import {
  currencySchema,
  isoDateTimeSchema,
  paymentProviderSchema,
  paymentPurposeSchema,
  paymentStatusSchema,
  uuidSchema,
} from './common.js';
import { zambianPhoneSchema } from './auth.js';

/**
 * Checkout takes the buyer's number and what they are buying. The provider is
 * normally inferred from the number's prefix; an explicit choice is allowed
 * because a small number of people hold a wallet on a number that has been
 * ported between operators.
 */
export const checkoutRequestSchema = z
  .object({
    purpose: paymentPurposeSchema,
    classroomId: uuidSchema.optional(),
    recordingId: uuidSchema.optional(),
    phone: zambianPhoneSchema,
    provider: paymentProviderSchema.optional(),
  })
  .refine(
    (v) =>
      v.purpose === 'CLASS_ENROLLMENT'
        ? Boolean(v.classroomId) && !v.recordingId
        : Boolean(v.recordingId) && !v.classroomId,
    {
      message:
        'Provide classroomId for CLASS_ENROLLMENT, or recordingId for RECORDING_ACCESS — exactly one.',
      path: ['purpose'],
    },
  );
export type CheckoutRequest = z.input<typeof checkoutRequestSchema>;

/**
 * Required on every checkout. A double-tapped pay button reuses the key and
 * returns the original payment instead of charging twice.
 */
export const IDEMPOTENCY_HEADER = 'idempotency-key';
export const idempotencyKeySchema = z.string().min(8).max(128);

export const paymentSchema = z.object({
  id: uuidSchema,
  purpose: paymentPurposeSchema,
  classroomId: uuidSchema.nullable(),
  recordingId: uuidSchema.nullable(),
  amountMinor: z.int(),
  currency: currencySchema,
  provider: paymentProviderSchema,
  status: paymentStatusSchema,
  /** Masked for display — never the full number. */
  payerMsisdnMasked: z.string(),
  failureReason: z.string().nullable(),
  createdAt: isoDateTimeSchema,
  settledAt: isoDateTimeSchema.nullable(),
});
export type Payment = z.infer<typeof paymentSchema>;

/**
 * What checkout hands back to the UI. `pollAfterMs` lets the server set the
 * cadence rather than hard-coding it in the client, so the two can be tuned
 * against real operator latency without shipping a frontend release.
 */
export const checkoutResponseSchema = z.object({
  payment: paymentSchema,
  /** Shown while the USSD prompt is on the buyer's handset. */
  instruction: z.string(),
  pollAfterMs: z.int(),
  pollTimeoutMs: z.int(),
});
export type CheckoutResponse = z.infer<typeof checkoutResponseSchema>;
