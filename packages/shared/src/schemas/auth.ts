import { z } from 'zod';
import { isoDateTimeSchema, uuidSchema } from './common.js';
import { parseZambianMsisdn } from '../msisdn.js';

/**
 * Identity (signup, login, password reset, email verification) is owned by
 * Auth0's Universal Login — there is no local credential schema here anymore.
 * This file now covers only: the shape our own User row takes once Auth0
 * identity is synced to it, and the phone-number parser reused wherever a
 * Zambian mobile number is collected (checkout, account settings).
 */

/**
 * Phone numbers are collected separately from identity (in account settings,
 * ahead of a first checkout) and must be Zambian. Reuses the same parser the
 * payment service routes on, so a number accepted here is guaranteed to be
 * chargeable later.
 */
export const zambianPhoneSchema = z.string().transform((raw, ctx) => {
  const result = parseZambianMsisdn(raw);
  if (!result.ok) {
    ctx.addIssue({ code: 'custom', message: result.message });
    return z.NEVER;
  }
  return result.value.e164;
});

/**
 * Sent once, right after Auth0 reports a successful login, to upsert the
 * local User row (see apps/api/src/auth/auth.service.ts for the linking
 * logic). `sub` is never in this body — it comes from the caller's verified
 * access token, not from anything the client asserts. `email`/`displayName`/
 * `emailVerified` are trusted as profile metadata only; they never gate an
 * authorization decision by themselves.
 */
export const syncUserRequestSchema = z.object({
  email: z.email(),
  displayName: z.string().trim().min(1).max(80),
  emailVerified: z.boolean(),
});
export type SyncUserRequest = z.infer<typeof syncUserRequestSchema>;

export const userProfileSchema = z.object({
  id: uuidSchema,
  email: z.email(),
  displayName: z.string(),
  phoneE164: z.string().nullable(),
  emailVerifiedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
});
export type UserProfile = z.infer<typeof userProfileSchema>;
