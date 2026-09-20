import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomBytes, createHmac } from 'node:crypto';
import ms from 'ms';
import type { UserProfile } from '@frntdesk/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Env } from '../config/env.schema.js';

export interface AccessTokenPayload {
  sub: string;
  email: string;
}

export interface IssuedSession {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  user: UserProfile;
}

/**
 * Login, session refresh, and logout.
 *
 * The access token is a real signed JWT (short-lived, stateless — any API
 * instance can verify it alone). The refresh token is deliberately NOT a JWT:
 * it's opaque random bytes, stored server-side as a keyed hash, which is what
 * makes it revocable and what makes reuse detection possible at all — a
 * stateless JWT refresh token can't be un-issued once it exists.
 *
 * `JWT_REFRESH_SECRET` is used as an HMAC key over the raw token rather than
 * a plain SHA-256 hash, the same way a password pepper works: even a full
 * database leak doesn't hand an attacker anything they can brute-force
 * offline without also having this secret.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  // Computed once, lazily, from a real argon2.hash() call — not a hand-written
  // string — so verifying against it takes genuinely the same computation as
  // a real password check. A malformed placeholder string would let argon2
  // fail parsing early, undermining the whole point of this.
  private dummyHash: Promise<string> | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async login(email: string, password: string): Promise<IssuedSession> {
    const user = await this.prisma.user.findUnique({ where: { email } });

    // Same message whether the email doesn't exist or the password is wrong —
    // distinguishing them lets an attacker enumerate registered emails.
    const invalid = () => new UnauthorizedException('Incorrect email or password.');

    if (!user) {
      // Still run a real hash verify so the response time for "no such user"
      // doesn't measurably differ from "wrong password", which would
      // otherwise leak which case occurred.
      this.dummyHash ??= argon2.hash('frntdesk-timing-safety-constant');
      await argon2.verify(await this.dummyHash, password).catch(() => false);
      throw invalid();
    }

    const passwordMatches = await argon2.verify(user.passwordHash, password).catch(() => false);
    if (!passwordMatches) throw invalid();

    return this.issueSession(user.id, user.email, user.displayName, user.phoneE164, user.emailVerifiedAt, user.createdAt);
  }

  /**
   * Exchanges a refresh token for a new session, rotating it. If the
   * presented token has already been rotated away (i.e. someone is replaying
   * a stolen, previously-used token), the entire family is revoked — the
   * legitimate user is logged out everywhere, which is the correct response
   * to suspected theft, not a false positive to route around.
   */
  async refresh(rawToken: string): Promise<IssuedSession> {
    const tokenHash = this.hashRefreshToken(rawToken);
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    const invalid = () => new UnauthorizedException('Session expired. Please log in again.');
    if (!existing) throw invalid();

    if (existing.revokedAt) {
      this.logger.warn(`Refresh token reuse detected for user ${existing.userId} — revoking session family.`);
      await this.prisma.refreshToken.updateMany({
        where: { userId: existing.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw invalid();
    }

    if (existing.expiresAt < new Date()) throw invalid();

    const session = await this.issueSession(
      existing.user.id,
      existing.user.email,
      existing.user.displayName,
      existing.user.phoneE164,
      existing.user.emailVerifiedAt,
      existing.user.createdAt,
    );

    // Record the rotation chain, then revoke the presented token. Done as two
    // steps (create the new row first) so `replacedById` always points at a
    // row that exists.
    const newTokenHash = this.hashRefreshToken(session.refreshToken);
    const newRow = await this.prisma.refreshToken.findUnique({ where: { tokenHash: newTokenHash } });
    await this.prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date(), replacedById: newRow?.id },
    });

    return session;
  }

  async logout(rawToken: string): Promise<void> {
    const tokenHash = this.hashRefreshToken(rawToken);
    // Idempotent: logging out twice, or with a token that's already expired,
    // is a no-op rather than an error.
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async getProfile(userId: string): Promise<UserProfile> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return toUserProfile(user.id, user.email, user.displayName, user.phoneE164, user.emailVerifiedAt, user.createdAt);
  }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    try {
      return await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired access token.');
    }
  }

  refreshCookieTtlMs(): number {
    return ms(this.config.get('JWT_REFRESH_TTL', { infer: true }) as ms.StringValue);
  }

  private async issueSession(
    userId: string,
    email: string,
    displayName: string,
    phoneE164: string | null,
    emailVerifiedAt: Date | null,
    createdAt: Date,
  ): Promise<IssuedSession> {
    const accessTtl = this.config.get('JWT_ACCESS_TTL', { infer: true });
    const refreshTtlMs = this.refreshCookieTtlMs();

    const accessToken = await this.jwt.signAsync(
      { sub: userId, email } satisfies AccessTokenPayload,
      { secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }), expiresIn: accessTtl as ms.StringValue },
    );

    const rawRefreshToken = randomBytes(32).toString('base64url');
    const refreshTokenExpiresAt = new Date(Date.now() + refreshTtlMs);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hashRefreshToken(rawRefreshToken),
        expiresAt: refreshTokenExpiresAt,
      },
    });

    return {
      accessToken,
      expiresIn: Math.floor(ms(accessTtl as ms.StringValue) / 1000),
      refreshToken: rawRefreshToken,
      refreshTokenExpiresAt,
      user: toUserProfile(userId, email, displayName, phoneE164, emailVerifiedAt, createdAt),
    };
  }

  private hashRefreshToken(rawToken: string): string {
    return createHmac('sha256', this.config.get('JWT_REFRESH_SECRET', { infer: true }))
      .update(rawToken)
      .digest('hex');
  }
}

function toUserProfile(
  id: string,
  email: string,
  displayName: string,
  phoneE164: string | null,
  emailVerifiedAt: Date | null,
  createdAt: Date,
): UserProfile {
  return {
    id,
    email,
    displayName,
    phoneE164,
    emailVerifiedAt: emailVerifiedAt ? emailVerifiedAt.toISOString() : null,
    createdAt: createdAt.toISOString(),
  };
}

