import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { loginRequestSchema, type AuthSession, type UserProfile } from '@frntdesk/shared';
import { zodBody } from '../common/pipes/zod-validation.pipe.js';
import type { Env } from '../config/env.schema.js';
import { AuthService, type AccessTokenPayload, type IssuedSession } from './auth.service.js';
import { CurrentUser } from './current-user.decorator.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

/** httpOnly refresh cookie, scoped to auth endpoints only — never sent elsewhere. */
const REFRESH_COOKIE_NAME = 'frnt_rt';
const REFRESH_COOKIE_PATH = '/api/auth';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  // Tighter than the app-wide default — this is the endpoint credential
  // stuffing / brute force actually targets.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(zodBody(loginRequestSchema)) body: { email: string; password: string },
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthSession> {
    const session = await this.auth.login(body.email, body.password);
    this.setRefreshCookie(res, session);
    return this.toAuthSession(session);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<AuthSession> {
    const rawToken = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
    if (!rawToken) throw new UnauthorizedException('No session to refresh.');

    const session = await this.auth.refresh(rawToken);
    this.setRefreshCookie(res, session);
    return this.toAuthSession(session);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const rawToken = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
    if (rawToken) await this.auth.logout(rawToken);
    res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: AccessTokenPayload): Promise<UserProfile> {
    return this.auth.getProfile(user.sub);
  }

  private setRefreshCookie(res: Response, session: IssuedSession): void {
    res.cookie(REFRESH_COOKIE_NAME, session.refreshToken, {
      httpOnly: true,
      // Plain HTTP in local dev; real TLS in every deployed environment.
      secure: this.config.get('NODE_ENV', { infer: true }) === 'production',
      // 'lax' covers same-site dev (via the Angular proxy) and a same-
      // registrable-domain production split (api.frntdesk.zm + app.frntdesk.zm).
      // A genuinely cross-domain deployment would need 'none' + secure instead.
      sameSite: 'lax',
      path: REFRESH_COOKIE_PATH,
      expires: session.refreshTokenExpiresAt,
    });
  }

  private toAuthSession(session: IssuedSession): AuthSession {
    return { accessToken: session.accessToken, expiresIn: session.expiresIn, user: session.user };
  }
}
