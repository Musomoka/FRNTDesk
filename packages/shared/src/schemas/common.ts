import { z } from 'zod';
import { SUPPORTED_CURRENCIES } from '../money.js';
import { PAYMENT_STATUSES } from '../payment-state.js';

/** Domain enums. Kept here so Prisma, the API, and the UI cannot drift apart. */

export const classroomStatusSchema = z.enum(['DRAFT', 'PUBLISHED', 'CANCELLED']);
export type ClassroomStatus = z.infer<typeof classroomStatusSchema>;

export const classSessionStatusSchema = z.enum([
  'SCHEDULED',
  'LIVE',
  'ENDED',
  'CANCELLED',
]);
export type ClassSessionStatus = z.infer<typeof classSessionStatusSchema>;

export const enrollmentStatusSchema = z.enum([
  'PENDING_PAYMENT',
  'ACTIVE',
  'CANCELLED',
  'REFUNDED',
]);
export type EnrollmentStatus = z.infer<typeof enrollmentStatusSchema>;

export const invitationStatusSchema = z.enum([
  'SENT',
  'ACCEPTED',
  'EXPIRED',
  'REVOKED',
]);
export type InvitationStatus = z.infer<typeof invitationStatusSchema>;

export const paymentProviderSchema = z.enum(['MTN_MOMO', 'AIRTEL_MONEY', 'FAKE']);
export type PaymentProvider = z.infer<typeof paymentProviderSchema>;

export const paymentPurposeSchema = z.enum(['CLASS_ENROLLMENT', 'RECORDING_ACCESS']);
export type PaymentPurpose = z.infer<typeof paymentPurposeSchema>;

export const paymentStatusSchema = z.enum(PAYMENT_STATUSES);

export const participantRoleSchema = z.enum(['HOST', 'CO_HOST', 'STUDENT']);
export type ParticipantRole = z.infer<typeof participantRoleSchema>;

export const recordingStatusSchema = z.enum([
  'STARTING',
  'ACTIVE',
  'COMPLETE',
  'FAILED',
]);
export type RecordingStatus = z.infer<typeof recordingStatusSchema>;

export const currencySchema = z.enum(SUPPORTED_CURRENCIES);

export const organisationTypeSchema = z.enum(['BUSINESS', 'SCHOOL']);
export type OrganisationType = z.infer<typeof organisationTypeSchema>;

export const organisationRoleSchema = z.enum(['ADMIN', 'MEMBER']);
export type OrganisationRole = z.infer<typeof organisationRoleSchema>;

/** Reusable primitives. */

export const uuidSchema = z.uuid();
export const emailSchema = z.email().trim().toLowerCase().max(254);
export const isoDateTimeSchema = z.iso.datetime({ offset: true });

/**
 * Amounts always cross the wire as integer minor units. Capped at K1,000,000 —
 * far above any plausible class price, and low enough that a misplaced decimal
 * is caught at the edge instead of reaching a provider.
 */
export const amountMinorSchema = z
  .int()
  .min(0)
  .max(100_000_000);

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export function pageResponseSchema<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    page: z.int(),
    pageSize: z.int(),
    total: z.int(),
  });
}
