export interface IdentityProvider {
  readonly key: string;
  readonly label: string;
  readonly hasPassword: boolean;
}

const KNOWN_PROVIDERS: Readonly<Record<string, string>> = {
  'google-oauth2': 'Google',
  facebook: 'Facebook',
  windowslive: 'Microsoft',
  github: 'GitHub',
  apple: 'Apple',
  linkedin: 'LinkedIn',
};

/**
 * Auth0's `sub` claim is `<connection-strategy>|<id>` — `auth0|abc123` for
 * the database connection, `google-oauth2|456` for a federated login (see
 * schema.prisma's doc comment on `User.auth0Sub`). Reading that prefix is
 * how a SPA — which has no Management API access — tells whether an account
 * has a password to change at all, without a custom Action adding a claim
 * for it.
 */
export function identityProviderFromSub(sub: string | null | undefined): IdentityProvider | null {
  if (!sub) return null;
  const [strategy] = sub.split('|');
  if (!strategy) return null;

  if (strategy === 'auth0') {
    return { key: strategy, label: 'Email and password', hasPassword: true };
  }
  return { key: strategy, label: KNOWN_PROVIDERS[strategy] ?? strategy, hasPassword: false };
}
