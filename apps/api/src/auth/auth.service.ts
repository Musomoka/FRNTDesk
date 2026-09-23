import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { SyncUserRequest, UpdateProfileRequest, UserProfile } from '@frntdesk/shared';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Just-in-time user provisioning against Auth0.
 *
 * There is no local login/register/refresh anymore — Auth0 owns the whole
 * credential lifecycle. This is the one thing our own database still needs
 * to do: make sure a local `User` row (the thing every other table's foreign
 * keys point at) exists for whoever just authenticated, and keep its profile
 * fields reasonably fresh.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * `auth0Sub` is trusted — it came from a token Auth0Guard already verified.
   * `email`/`displayName`/`emailVerified` are trusted only as profile
   * metadata (see the schema doc comment); a forged one at worst mislabels a
   * user's own display name, since it can never attach to a *different*
   * `auth0Sub` than the one on the caller's own verified token.
   *
   * Linking logic, in order:
   *   1. A row already wearing this `auth0Sub` — the ordinary case for
   *      everyone after their first login. Refresh its profile fields.
   *   2. No such row, but one exists with this email and `auth0Sub IS NULL`
   *      — a demo/seeded row (or one pre-created by an invite) waiting to be
   *      claimed. Attach this `auth0Sub` to it. This is the *only* time
   *      `auth0Sub` is ever set on an existing row, which is what makes it
   *      safe: a row that already has a (different) `auth0Sub` is never
   *      touched by this branch.
   *   3. Neither — a brand new user. Create the row.
   */
  async syncUser(auth0Sub: string, body: SyncUserRequest): Promise<UserProfile> {
    const existingBySub = await this.prisma.user.findUnique({ where: { auth0Sub } });
    if (existingBySub) {
      return toUserProfile(
        await this.prisma.user.update({
          where: { id: existingBySub.id },
          data: {
            email: body.email,
            displayName: body.displayName,
            emailVerifiedAt: resolveEmailVerifiedAt(body.emailVerified, existingBySub.emailVerifiedAt),
          },
        }),
      );
    }

    const existingByEmail = await this.prisma.user.findUnique({ where: { email: body.email } });
    if (existingByEmail) {
      if (existingByEmail.auth0Sub !== null) {
        // A different Auth0 identity already owns this email. Refusing
        // rather than silently reassigning ownership — that would be an
        // account-takeover bug, not a convenience.
        this.logger.warn(
          `Refusing to link auth0Sub ${auth0Sub} to email ${body.email}: already linked to a different identity.`,
        );
        throw new ConflictException(
          'This email is already linked to a different account. Log in with the original method, or contact support.',
        );
      }

      return toUserProfile(
        await this.prisma.user.update({
          where: { id: existingByEmail.id },
          data: {
            auth0Sub,
            displayName: body.displayName,
            emailVerifiedAt: resolveEmailVerifiedAt(body.emailVerified, existingByEmail.emailVerifiedAt),
          },
        }),
      );
    }

    return toUserProfile(
      await this.prisma.user.create({
        data: {
          auth0Sub,
          email: body.email,
          displayName: body.displayName,
          emailVerifiedAt: body.emailVerified ? new Date() : null,
        },
      }),
    );
  }

  /**
   * Account-settings edit: display name and phone only. Email, password and
   * verification are deliberately absent — those stay Auth0's job, changed
   * (if at all) through Universal Login / the hosted change-password flow,
   * never through this API.
   */
  async updateProfile(auth0Sub: string, body: UpdateProfileRequest): Promise<UserProfile> {
    const user = await this.prisma.user.findUnique({ where: { auth0Sub } });
    if (!user) {
      // Auth0Guard already verified the token; reaching here with no row
      // means the frontend called this before its one-time `sync` call.
      throw new NotFoundException('No profile yet — sync must run before it can be updated.');
    }

    return toUserProfile(
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          displayName: body.displayName,
          phoneE164: body.phone === '' ? null : body.phone,
        },
      }),
    );
  }

  /**
   * Resolves the internal User row behind a verified Auth0 subject — the id
   * every other table's foreign keys point at, which the access token itself
   * never carries. Every authenticated feature module goes through this
   * rather than reading `auth0Sub` off a row itself, so the "sync hasn't run
   * yet" case has exactly one error message.
   */
  async requireUser(auth0Sub: string): Promise<{
    id: string;
    email: string;
    displayName: string;
    emailVerifiedAt: Date | null;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { auth0Sub },
      select: { id: true, email: true, displayName: true, emailVerifiedAt: true },
    });
    if (!user) {
      throw new NotFoundException('No profile yet — sync must run before this call.');
    }
    return user;
  }
}

/**
 * Never unsets a verification that already happened just because one sync
 * call's token claims `email_verified: false` — Auth0's own claim shouldn't
 * realistically flip true→false, but this keeps a transient/misconfigured
 * claim from silently revoking someone's ability to publish a class.
 */
function resolveEmailVerifiedAt(emailVerified: boolean, current: Date | null): Date | null {
  if (current) return current;
  return emailVerified ? new Date() : null;
}

function toUserProfile(user: {
  id: string;
  email: string;
  displayName: string;
  phoneE164: string | null;
  emailVerifiedAt: Date | null;
  createdAt: Date;
}): UserProfile {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    phoneE164: user.phoneE164,
    emailVerifiedAt: user.emailVerifiedAt ? user.emailVerifiedAt.toISOString() : null,
    createdAt: user.createdAt.toISOString(),
  };
}
