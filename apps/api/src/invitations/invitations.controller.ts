import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  acceptInvitationSchema,
  createInvitationsSchema,
  type AcceptInvitationRequest,
  type AcceptInvitationResult,
  type CreateInvitationsRequest,
  type Invitation,
} from '@frntdesk/shared';
import { zodBody } from '../common/pipes/zod-validation.pipe.js';
import { Auth0Guard } from '../auth/auth0.guard.js';
import { AuthService } from '../auth/auth.service.js';
import { CurrentAuth0Sub } from '../auth/current-user.decorator.js';
import { InvitationsService } from './invitations.service.js';

@Controller()
@UseGuards(Auth0Guard)
export class InvitationsController {
  constructor(
    private readonly invitations: InvitationsService,
    private readonly auth: AuthService,
  ) {}

  @Get('host/classrooms/:classroomId/invitations')
  async list(
    @Param('classroomId', ParseUUIDPipe) classroomId: string,
    @CurrentAuth0Sub() auth0Sub: string,
  ): Promise<Invitation[]> {
    const user = await this.auth.requireUser(auth0Sub);
    return this.invitations.listForClassroom(classroomId, user.id);
  }

  /** Rate-limited well below the global floor: this one sends email. */
  @Post('host/classrooms/:classroomId/invitations')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async create(
    @Param('classroomId', ParseUUIDPipe) classroomId: string,
    @CurrentAuth0Sub() auth0Sub: string,
    @Body(zodBody(createInvitationsSchema)) body: CreateInvitationsRequest,
  ): Promise<Invitation[]> {
    const user = await this.auth.requireUser(auth0Sub);
    return this.invitations.create(classroomId, user.id, body);
  }

  @Post('host/invitations/:invitationId/revoke')
  async revoke(
    @Param('invitationId', ParseUUIDPipe) invitationId: string,
    @CurrentAuth0Sub() auth0Sub: string,
  ): Promise<Invitation> {
    const user = await this.auth.requireUser(auth0Sub);
    return this.invitations.revoke(invitationId, user.id);
  }

  /**
   * Redeeming requires a signed-in account — the seat has to belong to
   * someone — so the invite landing page sends people through Auth0 first
   * and posts the token afterwards.
   */
  @Post('invitations/accept')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async accept(
    @CurrentAuth0Sub() auth0Sub: string,
    @Body(zodBody(acceptInvitationSchema)) body: AcceptInvitationRequest,
  ): Promise<AcceptInvitationResult> {
    const user = await this.auth.requireUser(auth0Sub);
    return this.invitations.accept(body.token, user.id);
  }
}
