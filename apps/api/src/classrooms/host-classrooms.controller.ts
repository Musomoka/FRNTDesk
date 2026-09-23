import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  createClassroomSchema,
  createSessionSchema,
  updateClassroomSchema,
  updateSessionSchema,
  type ClassSession,
  type Classroom,
  type CreateClassroomRequest,
  type CreateSessionRequest,
  type Enrollment,
  type UpdateClassroomRequest,
  type UpdateSessionRequest,
} from '@frntdesk/shared';
import { zodBody } from '../common/pipes/zod-validation.pipe.js';
import { Auth0Guard } from '../auth/auth0.guard.js';
import { AuthService } from '../auth/auth.service.js';
import { CurrentAuth0Sub } from '../auth/current-user.decorator.js';
import { ClassroomsService } from './classrooms.service.js';
import { EnrollmentsService } from './enrollments.service.js';
import { SessionsService } from './sessions.service.js';

/**
 * Everything that writes to a class the caller hosts. Hosting is per-class,
 * not a global role, so there is no "host" guard — each handler resolves the
 * caller and the service checks that this particular class is theirs.
 */
@Controller('host/classrooms')
@UseGuards(Auth0Guard)
export class HostClassroomsController {
  constructor(
    private readonly classrooms: ClassroomsService,
    private readonly sessions: SessionsService,
    private readonly enrollments: EnrollmentsService,
    private readonly auth: AuthService,
  ) {}

  @Get()
  async mine(@CurrentAuth0Sub() auth0Sub: string): Promise<Classroom[]> {
    const user = await this.auth.requireUser(auth0Sub);
    return this.classrooms.listForHost(user.id);
  }

  @Post()
  async create(
    @CurrentAuth0Sub() auth0Sub: string,
    @Body(zodBody(createClassroomSchema)) body: CreateClassroomRequest,
  ): Promise<Classroom> {
    const user = await this.auth.requireUser(auth0Sub);
    return this.classrooms.create(user.id, body);
  }

  @Get(':id')
  async detail(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth0Sub() auth0Sub: string,
  ): Promise<Classroom> {
    const user = await this.auth.requireUser(auth0Sub);
    return this.classrooms.detailForHost(id, user.id);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth0Sub() auth0Sub: string,
    @Body(zodBody(updateClassroomSchema)) body: UpdateClassroomRequest,
  ): Promise<Classroom> {
    const user = await this.auth.requireUser(auth0Sub);
    return this.classrooms.update(id, user.id, body);
  }

  @Post(':id/publish')
  async publish(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth0Sub() auth0Sub: string,
  ): Promise<Classroom> {
    const user = await this.auth.requireUser(auth0Sub);
    return this.classrooms.publish(id, user);
  }

  @Post(':id/cancel')
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth0Sub() auth0Sub: string,
  ): Promise<Classroom> {
    const user = await this.auth.requireUser(auth0Sub);
    return this.classrooms.cancel(id, user.id);
  }

  @Get(':id/sessions')
  async sessionsFor(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth0Sub() auth0Sub: string,
  ): Promise<ClassSession[]> {
    const user = await this.auth.requireUser(auth0Sub);
    await this.classrooms.detailForHost(id, user.id);
    return this.sessions.listForClassroom(id, user.id);
  }

  @Post(':id/sessions')
  async schedule(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth0Sub() auth0Sub: string,
    @Body(zodBody(createSessionSchema)) body: CreateSessionRequest,
  ): Promise<ClassSession> {
    const user = await this.auth.requireUser(auth0Sub);
    return this.sessions.schedule(id, user.id, body);
  }

  @Get(':id/enrollments')
  async roster(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth0Sub() auth0Sub: string,
  ): Promise<{ enrollment: Enrollment; displayName: string; email: string }[]> {
    const user = await this.auth.requireUser(auth0Sub);
    return this.enrollments.listForClassroom(id, user.id);
  }
}

/** Session edits are addressed by session id, so they get their own route root. */
@Controller('host/sessions')
@UseGuards(Auth0Guard)
export class HostSessionsController {
  constructor(
    private readonly sessions: SessionsService,
    private readonly auth: AuthService,
  ) {}

  @Patch(':sessionId')
  async update(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentAuth0Sub() auth0Sub: string,
    @Body(zodBody(updateSessionSchema)) body: UpdateSessionRequest,
  ): Promise<ClassSession> {
    const user = await this.auth.requireUser(auth0Sub);
    return this.sessions.update(sessionId, user.id, body);
  }

  @Post(':sessionId/cancel')
  async cancel(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentAuth0Sub() auth0Sub: string,
  ): Promise<ClassSession> {
    const user = await this.auth.requireUser(auth0Sub);
    return this.sessions.cancel(sessionId, user.id);
  }
}
