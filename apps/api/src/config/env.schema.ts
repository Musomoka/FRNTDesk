import { z } from 'zod';

/**
 * Environment is validated once, at boot, and the process refuses to start if
 * anything is wrong. The alternative — discovering a missing MTN subscription
 * key when the first student tries to pay — is the failure mode this prevents.
 */

const durationSchema = z
  .string()
  .regex(/^\d+[smhd]$/, 'Use a duration like 15m, 24h or 30d.');

const booleanish = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((v) => v === true || v === 'true' || v === '1');

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    WEB_ORIGIN: z.url(),
    API_PUBLIC_URL: z.url(),

    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1),

    JWT_ACCESS_SECRET: z.string().min(32, 'Use at least 32 characters; generate with `openssl rand -base64 48`.'),
    JWT_REFRESH_SECRET: z.string().min(32, 'Use at least 32 characters; generate with `openssl rand -base64 48`.'),
    JWT_ACCESS_TTL: durationSchema.default('15m'),
    JWT_REFRESH_TTL: durationSchema.default('30d'),

    MAIL_TRANSPORT: z.enum(['smtp', 'resend']).default('smtp'),
    MAIL_FROM: z.string().min(3),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().optional(),
    SMTP_SECURE: booleanish.default(false),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    RESEND_API_KEY: z.string().optional(),

    CURRENCY: z.enum(['ZMW']).default('ZMW'),

    PROVIDER_MTN_ENABLED: booleanish.default(false),
    MTN_BASE_URL: z.url().optional(),
    MTN_SUBSCRIPTION_KEY: z.string().optional(),
    MTN_API_USER: z.string().optional(),
    MTN_API_KEY: z.string().optional(),
    MTN_TARGET_ENVIRONMENT: z.string().default('sandbox'),
    MTN_WIRE_CURRENCY: z.enum(['ZMW', 'EUR']).default('EUR'),
    MTN_CALLBACK_URL: z.url().optional(),

    PROVIDER_AIRTEL_ENABLED: booleanish.default(false),
    AIRTEL_BASE_URL: z.url().optional(),
    AIRTEL_CLIENT_ID: z.string().optional(),
    AIRTEL_CLIENT_SECRET: z.string().optional(),
    AIRTEL_COUNTRY: z.string().default('ZM'),
    AIRTEL_CURRENCY: z.string().default('ZMW'),
    AIRTEL_CALLBACK_URL: z.url().optional(),

    PROVIDER_FAKE_ENABLED: booleanish.default(false),

    LIVEKIT_URL: z.string().optional(),
    LIVEKIT_API_KEY: z.string().optional(),
    LIVEKIT_API_SECRET: z.string().optional(),
    LIVEKIT_WEBHOOK_ENABLED: booleanish.default(true),
    LIVEKIT_TOKEN_TTL: durationSchema.default('15m'),

    RECORDING_ENABLED: booleanish.default(false),
    S3_ENDPOINT: z.string().optional(),
    S3_REGION: z.string().default('af-south-1'),
    S3_BUCKET: z.string().optional(),
    S3_ACCESS_KEY: z.string().optional(),
    S3_SECRET_KEY: z.string().optional(),
  })
  // Each provider is only required to be fully configured when it is switched
  // on, so a developer can run the whole app on the fake provider alone.
  .superRefine((env, ctx) => {
    const require = (cond: unknown, path: string, message: string) => {
      if (!cond) ctx.addIssue({ code: 'custom', path: [path], message });
    };

    if (env.PROVIDER_MTN_ENABLED) {
      require(env.MTN_BASE_URL, 'MTN_BASE_URL', 'Required when PROVIDER_MTN_ENABLED is true.');
      require(env.MTN_SUBSCRIPTION_KEY, 'MTN_SUBSCRIPTION_KEY', 'Required when PROVIDER_MTN_ENABLED is true.');
      require(env.MTN_API_USER, 'MTN_API_USER', 'Required when PROVIDER_MTN_ENABLED is true.');
      require(env.MTN_API_KEY, 'MTN_API_KEY', 'Required when PROVIDER_MTN_ENABLED is true.');
      require(env.MTN_CALLBACK_URL, 'MTN_CALLBACK_URL', 'Required when PROVIDER_MTN_ENABLED is true.');
    }

    if (env.PROVIDER_AIRTEL_ENABLED) {
      require(env.AIRTEL_BASE_URL, 'AIRTEL_BASE_URL', 'Required when PROVIDER_AIRTEL_ENABLED is true.');
      require(env.AIRTEL_CLIENT_ID, 'AIRTEL_CLIENT_ID', 'Required when PROVIDER_AIRTEL_ENABLED is true.');
      require(env.AIRTEL_CLIENT_SECRET, 'AIRTEL_CLIENT_SECRET', 'Required when PROVIDER_AIRTEL_ENABLED is true.');
    }

    if (env.MAIL_TRANSPORT === 'smtp') {
      require(env.SMTP_HOST, 'SMTP_HOST', 'Required when MAIL_TRANSPORT is smtp.');
      require(env.SMTP_PORT, 'SMTP_PORT', 'Required when MAIL_TRANSPORT is smtp.');
    } else {
      require(env.RESEND_API_KEY, 'RESEND_API_KEY', 'Required when MAIL_TRANSPORT is resend.');
    }

    if (env.RECORDING_ENABLED) {
      require(env.S3_BUCKET, 'S3_BUCKET', 'Required when RECORDING_ENABLED is true.');
      require(env.S3_ACCESS_KEY, 'S3_ACCESS_KEY', 'Required when RECORDING_ENABLED is true.');
      require(env.S3_SECRET_KEY, 'S3_SECRET_KEY', 'Required when RECORDING_ENABLED is true.');
    }

    // The MoMo sandbox only accepts EUR, but a production deployment charging
    // EUR would bill Zambian students in the wrong currency. Catch the mismatch
    // at boot rather than in a reconciliation report.
    if (env.NODE_ENV === 'production' && env.MTN_WIRE_CURRENCY !== 'ZMW') {
      ctx.addIssue({
        code: 'custom',
        path: ['MTN_WIRE_CURRENCY'],
        message: 'Must be ZMW in production; EUR is a sandbox-only workaround.',
      });
    }

    if (env.NODE_ENV === 'production' && env.PROVIDER_FAKE_ENABLED) {
      ctx.addIssue({
        code: 'custom',
        path: ['PROVIDER_FAKE_ENABLED'],
        message: 'The fake payment provider must never be enabled in production.',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

/** Formats every problem at once, so a misconfigured deploy is fixed in one pass. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const lines = result.error.issues.map(
      (issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`,
    );
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
  }
  return result.data;
}
