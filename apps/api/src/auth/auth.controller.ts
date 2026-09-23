import { Body, Controller, Patch, Post, UseGuards } from '@nestjs/common';
import { syncUserRequestSchema, updateProfileRequestSchema, type UpdateProfileRequest, type UserProfile } from '@frntdesk/shared';
import { zodBody } from '../common/pipes/zod-validation.pipe.js';
import { Auth0Guard } from './auth0.guard.js';
import { AuthService } from './auth.service.js';
import { CurrentAuth0Sub } from './current-user.decorator.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /**
   * Called once by the frontend right after Auth0 reports a successful
   * login (see apps/web/src/app/core/auth/auth-store.ts). Doubles as "get my
   * profile": idempotent, always returns the current row either way, so
   * there's no separate GET endpoint to keep in sync with this one.
   */
  @Post('sync')
  @UseGuards(Auth0Guard)
  async sync(
    @CurrentAuth0Sub() auth0Sub: string,
    @Body(zodBody(syncUserRequestSchema)) body: { email: string; displayName: string; emailVerified: boolean },
  ): Promise<UserProfile> {
    return this.auth.syncUser(auth0Sub, body);
  }

  /** Account-settings edit, from the profile page. See AuthService.updateProfile. */
  @Patch('profile')
  @UseGuards(Auth0Guard)
  async updateProfile(
    @CurrentAuth0Sub() auth0Sub: string,
    @Body(zodBody(updateProfileRequestSchema)) body: UpdateProfileRequest,
  ): Promise<UserProfile> {
    return this.auth.updateProfile(auth0Sub, body);
  }
}
