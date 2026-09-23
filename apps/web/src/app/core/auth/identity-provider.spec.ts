import { describe, expect, it } from 'vitest';
import { identityProviderFromSub } from './identity-provider';

describe('identityProviderFromSub', () => {
  it('returns null when there is no sub yet', () => {
    expect(identityProviderFromSub(null)).toBeNull();
    expect(identityProviderFromSub(undefined)).toBeNull();
  });

  it('reports a database-connection account as having a password', () => {
    expect(identityProviderFromSub('auth0|abc123')).toEqual({
      key: 'auth0',
      label: 'Email and password',
      hasPassword: true,
    });
  });

  it('maps a known federated strategy to a friendly label with no password', () => {
    expect(identityProviderFromSub('google-oauth2|456')).toEqual({
      key: 'google-oauth2',
      label: 'Google',
      hasPassword: false,
    });
  });

  it('falls back to the raw strategy name for an unrecognized federated provider', () => {
    expect(identityProviderFromSub('some-enterprise-connection|789')).toEqual({
      key: 'some-enterprise-connection',
      label: 'some-enterprise-connection',
      hasPassword: false,
    });
  });
});
