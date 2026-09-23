import { Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import {
  catalogQuerySchema,
  paginationQuerySchema,
  type CatalogQuery,
  type ClassSession,
  type Classroom,
  type EnrolledClass,
  type Enrollment,
  type PaginationQuery,
} from '@frntdesk/shared';
import { zodQuery } from '../common/pipes/zod-validation.pipe.js';
import { Auth0Guard } from '../auth/auth0.guard.js';
import { AuthService } from '../auth/auth.service.js';
import { CurrentAuth0Sub } from '../auth/current-user.decorator.js';
import { ClassroomsService } from './classrooms.service.js';
import { EnrollmentsService } from './enrollments.service.js';
import { SessionsService } from './sessions.service.js';

/**
 * The public, browse-side of the catalog plus the signed-in user's own view
 * of what they are enrolled in. Host-side writes live in
 * HostClassroomsController instead, so "can publish" and "can browse" never
 * share a route by accident.
 */
@Controller()
export class ClassroomsController {
  constructor(
    private readonly classrooms: ClassroomsService,
    private readonly sessions: SessionsService,
    private readonly enrollments: EnrollmentsService,
    private readonly auth: AuthService,
  ) {}

  @Get('classrooms')
  async catalog(
    @Query(zodQuery(catalogQuerySchema)) query: CatalogQuery,
    @Query(zodQuery(paginationQuerySchema)) page: PaginationQuery,
  ): Promise<{ items: Classroom[]; page: number; pageSize: number; total: number }> {
    return this.classrooms.catalog(query, page);
  }

  @Get('classrooms/:id')
  async detail(@Param('id', ParseUUIDPipe) id: string): Promise<Classroom> {
    return this.classrooms.publicDetail(id);
  }

  /** Room names are withheld here — see SessionsService.listForClassroom. */
  @Get('classrooms/:id/sessions')
  async sessionsFor(@Param('id', ParseUUIDPipe) id: string): Promise<ClassSession[]> {
    await this.classrooms.publicDetail(id);
    return this.sessions.listForClassroom(id, null);
  }

  @Post('classrooms/:id/enroll')
  @UseGuards(Auth0Guard)
  async enroll(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth0Sub() auth0Sub: string,
  ): Promise<Enrollment> {
    const user = await this.auth.requireUser(auth0Sub);
    return this.enrollments.enrollFree(id, user.id);
  }

  @Get('me/classes')
  @UseGuards(Auth0Guard)
  async myClasses(@CurrentAuth0Sub() auth0Sub: string): Promise<EnrolledClass[]> {
    const user = await this.auth.requireUser(auth0Sub);
    return this.enrollments.listMine(user.id);
  }

  /**
   * One class as the signed-in viewer sees it: present only when they hold a
   * seat. The class detail page calls this to decide between "Enroll" and
   * "Join", and to get the room name it is entitled to.
   */
  @Get('me/classes/:classroomId')
  @UseGuards(Auth0Guard)
  async myClass(
    @Param('classroomId', ParseUUIDPipe) classroomId: string,
    @CurrentAuth0Sub() auth0Sub: string,
  ): Promise<EnrolledClass | null> {
    const user = await this.auth.requireUser(auth0Sub);
    const mine = await this.enrollments.listMine(user.id);
    return mine.find((row) => row.classroom.id === classroomId) ?? null;
  }
}
