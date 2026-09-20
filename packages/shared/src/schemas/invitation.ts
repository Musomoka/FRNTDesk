import { z } from 'zod';
import {
  emailSchema,
  invitationStatusSchema,
  isoDateTimeSchema,
  uuidSchema,
} from './common.js';

/**
 * A host invites by email. `comp` waives payment entirely — used for guest
 * speakers, teaching assistants, and scholarship places — so accepting a comped
 * invite creates an ACTIVE enrollment without touching the payment flow.
 */
export const createInvitationsSchema = z.object({
  emails: z.array(emailSchema).min(1).max(100),
  comp: z.boolean().default(false),
  message: z.string().trim().max(1000).optional(),
});
export type CreateInvitationsRequest = z.input<typeof createInvitationsSchema>;

export const invitationSchema = z.object({
  id: uuidSchema,
  classroomId: uuidSchema,
  email: z.email(),
  status: invitationStatusSchema,
  comp: z.boolean(),
  expiresAt: isoDateTimeSchema,
  acceptedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
});
export type Invitation = z.infer<typeof invitationSchema>;

export const acceptInvitationSchema = z.object({
  token: z.string().min(32).max(256),
});
export type AcceptInvitationRequest = z.infer<typeof acceptInvitationSchema>;

/**
 * Accepting resolves to one of two next steps, and the UI routes on this rather
 * than re-deriving it: a comped invite lands straight in the class, a paid one
 * goes to checkout.
 */
export const acceptInvitationResultSchema = z.object({
  classroomId: uuidSchema,
  classroomTitle: z.string(),
  next: z.enum(['ENROLLED', 'PAYMENT_REQUIRED']),
  priceMinor: z.int(),
});
export type AcceptInvitationResult = z.infer<typeof acceptInvitationResultSchema>;
