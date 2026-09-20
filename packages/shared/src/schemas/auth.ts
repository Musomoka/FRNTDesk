import { z } from 'zod';
import { emailSchema, isoDateTimeSchema, uuidSchema } from './common.js';
import { parseZambianMsisdn } from '../msisdn.js';

/**
 * Passwords: length is the requirement that actually matters, so we ask for 12
 * characters and deliberately do not impose character-class rules, which push
 * people toward predictable substitutions. The upper bound exists because
 * argon2 hashing cost scales with input.
 */
export const passwordSchema = z
  .string()
  .min(12, 'Use at least 12 characters.')
  .max(200, 'That password is too long.');

/**
 * Phone numbers are optional at signup but must be Zambian when given. Reuses
 * the same parser the payment service routes on, so a number accepted here is
 * guaranteed to be chargeable later.
 */
export const zambianPhoneSchema = z
  .string()
  .transform((raw, ctx) => {
    const result = parseZambianMsisdn(raw);
    if (!result.ok) {
      ctx.addIssue({ code: 'custom', message: result.message });
      return z.NEVER;
    }
    return result.value.e164;
  });

export const registerRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(2).max(80),
  phone: zambianPhoneSchema.optional(),
});
export type RegisterRequest = z.input<typeof registerRequestSchema>;

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password.'),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const verifyEmailRequestSchema = z.object({
  token: z.string().min(16).max(256),
});
export type VerifyEmailRequest = z.infer<typeof verifyEmailRequestSchema>;

export const requestPasswordResetSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  token: z.string().min(16).max(256),
  password: passwordSchema,
});

export const userProfileSchema = z.object({
  id: uuidSchema,
  email: z.email(),
  displayName: z.string(),
  phoneE164: z.string().nullable(),
  emailVerifiedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
});
export type UserProfile = z.infer<typeof userProfileSchema>;

/**
 * Only the short-lived access token is returned in the body. The refresh token
 * is set as an httpOnly cookie by the API and is never readable by JavaScript.
 */
export const authSessionSchema = z.object({
  accessToken: z.string(),
  expiresIn: z.int(),
  user: userProfileSchema,
});
export type AuthSession = z.infer<typeof authSessionSchema>;
