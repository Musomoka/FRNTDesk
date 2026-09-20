import { describe, expect, it } from 'vitest';
import { validateEnv } from './env.schema.js';

/** A minimal environment that passes, which each test then perturbs. */
const base = {
  NODE_ENV: 'development',
  WEB_ORIGIN: 'http://localhost:4200',
  API_PUBLIC_URL: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://u:p@localhost:5433/db',
  REDIS_URL: 'redis://localhost:6380',
  AUTH0_DOMAIN: 'frntdesk-dev.us.auth0.com',
  AUTH0_AUDIENCE: 'https://api.frntdesk.zm',
  MAIL_TRANSPORT: 'smtp',
  MAIL_FROM: 'FRNTDesk <no-reply@frntdesk.local>',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
};

describe('validateEnv', () => {
  it('accepts a minimal valid environment and applies defaults', () => {
    const env = validateEnv(base);
    expect(env.API_PORT).toBe(3000);
    expect(env.CURRENCY).toBe('ZMW');
    expect(env.LIVEKIT_TOKEN_TTL).toBe('15m');
  });

  it('requires an Auth0 domain and audience', () => {
    expect(() => validateEnv({ ...base, AUTH0_DOMAIN: '' })).toThrow(/AUTH0_DOMAIN/);
    expect(() => validateEnv({ ...base, AUTH0_AUDIENCE: '' })).toThrow(/AUTH0_AUDIENCE/);
  });

  it('reports every problem at once rather than one per boot', () => {
    // A misconfigured deploy should be fixable in a single pass.
    try {
      validateEnv({ ...base, AUTH0_DOMAIN: '', AUTH0_AUDIENCE: '' });
      expect.unreachable('should have thrown');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('AUTH0_DOMAIN');
      expect(message).toContain('AUTH0_AUDIENCE');
    }
  });

  it('only demands MTN credentials once MTN is switched on', () => {
    expect(() => validateEnv({ ...base, PROVIDER_MTN_ENABLED: 'false' })).not.toThrow();
    expect(() => validateEnv({ ...base, PROVIDER_MTN_ENABLED: 'true' })).toThrow(
      /MTN_SUBSCRIPTION_KEY/,
    );
  });

  it('only demands Airtel credentials once Airtel is switched on', () => {
    expect(() => validateEnv({ ...base, PROVIDER_AIRTEL_ENABLED: 'true' })).toThrow(
      /AIRTEL_CLIENT_ID/,
    );
  });

  it('demands a Resend key when mail is sent through Resend', () => {
    expect(() =>
      validateEnv({ ...base, MAIL_TRANSPORT: 'resend', SMTP_HOST: undefined }),
    ).toThrow(/RESEND_API_KEY/);
  });

  it('refuses to charge EUR in production', () => {
    // EUR is a MoMo sandbox workaround. Shipping it would bill Zambian
    // students in the wrong currency.
    expect(() =>
      validateEnv({ ...base, NODE_ENV: 'production', MTN_WIRE_CURRENCY: 'EUR' }),
    ).toThrow(/MTN_WIRE_CURRENCY/);
  });

  it('refuses to run the fake payment provider in production', () => {
    expect(() =>
      validateEnv({
        ...base,
        NODE_ENV: 'production',
        MTN_WIRE_CURRENCY: 'ZMW',
        PROVIDER_FAKE_ENABLED: 'true',
      }),
    ).toThrow(/PROVIDER_FAKE_ENABLED/);
  });

  it('accepts a correctly configured production environment', () => {
    expect(() =>
      validateEnv({ ...base, NODE_ENV: 'production', MTN_WIRE_CURRENCY: 'ZMW' }),
    ).not.toThrow();
  });

  it('demands storage credentials once recording is switched on', () => {
    expect(() => validateEnv({ ...base, RECORDING_ENABLED: 'true' })).toThrow(
      /S3_BUCKET/,
    );
  });
});
