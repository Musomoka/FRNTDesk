import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  RawBodyRequest,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  promoteParticipantSchema,
  type JoinTokenResponse,
  type PromoteParticipantRequest,
  type RecordingControlResponse,
  type SessionParticipant,
} from '@frntdesk/shared';
import { zodBody } from '../common/pipes/zod-validation.pipe.js';
import { Auth0Guard } from '../auth/auth0.guard.js';
import { AuthService } from '../auth/auth.service.js';
import { CurrentAuth0Sub } from '../auth/current-user.decorator.js';
import { LiveService } from './live.service.js';

@Controller('live')
export class LiveController {
  constructor(
    private readonly live: LiveService,
    private readonly auth: AuthService,
  ) {}

  @Post('sessions/:sessionId/token')
  @UseGuards(Auth0Guard)
  async token(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentAuth0Sub() auth0Sub: string,
  ): Promise<JoinTokenResponse> {
    const user = await this.auth.requireUser(auth0Sub);
    return this.live.joinToken(sessionId, user.id);
  }

  @Get('sessions/:sessionId/participants')
  @UseGuards(Auth0Guard)
  async participants(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentAuth0Sub() auth0Sub: string,
  ): Promise<SessionParticipant[]> {
    const user = await this.auth.requireUser(auth0Sub);
    return this.live.participants(sessionId, user.id);
  }

  @Post('sessions/:sessionId/promote')
  @UseGuards(Auth0Guard)
  async promote(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentAuth0Sub() auth0Sub: string,
    @Body(zodBody(promoteParticipantSchema)) body: PromoteParticipantRequest,
  ): Promise<SessionParticipant[]> {
    const user = await this.auth.requireUser(auth0Sub);
    return this.live.promote(sessionId, user.id, body);
  }

  @Post('sessions/:sessionId/end')
  @UseGuards(Auth0Guard)
  async end(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentAuth0Sub() auth0Sub: string,
  ): Promise<{ ended: true }> {
    const user = await this.auth.requireUser(auth0Sub);
    await this.live.end(sessionId, user.id);
    return { ended: true };
  }

  @Post('sessions/:sessionId/recording/start')
  @UseGuards(Auth0Guard)
  async startRecording(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentAuth0Sub() auth0Sub: string,
  ): Promise<RecordingControlResponse> {
    const user = await this.auth.requireUser(auth0Sub);
    return this.live.startRecording(sessionId, user.id);
  }

  @Post('sessions/:sessionId/recording/stop')
  @UseGuards(Auth0Guard)
  async stopRecording(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentAuth0Sub() auth0Sub: string,
  ): Promise<RecordingControlResponse> {
    const user = await this.auth.requireUser(auth0Sub);
    return this.live.stopRecording(sessionId, user.id);
  }

  /**
   * LiveKit's webhook. Unguarded by Auth0 because it is not a user — it is
   * signed with our own API secret instead, which the receiver verifies. The
   * raw body is required for that signature to check out, so it is read from
   * `rawBody` rather than the parsed JSON.
   */
  @Post('webhook')
  async webhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers('authorization') authorization: string,
  ): Promise<{ received: true }> {
    const raw = request.rawBody?.toString('utf8') ?? '';
    await this.live.handleWebhook(raw, authorization);
    return { received: true };
  }
}
