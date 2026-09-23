import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ClassSession, CreateSessionRequest, UpdateSessionRequest } from '@frntdesk/shared';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * `livekitRoom` is omitted for anyone not entitled to join. It is not a
   * secret — a token is still required to actually connect — but publishing
   * every room name to anonymous browsers hands out a list of rooms to probe,
   * so it is withheld until there is a reason to hand it over.
   */
  async listForClassroom(classroomId: string, viewerId: string | null): Promise<ClassSession[]> {
    const rows = await this.prisma.classSession.findMany({
      where: { classroomId },
      orderBy: { startsAt: 'asc' },
      include: { recording: { select: { id: true } } },
    });

    const entitled = viewerId ? await this.isEntitled(classroomId, viewerId) : false;
    return rows.map((row) => toClassSession(row, entitled));
  }

  async schedule(
    classroomId: string,
    hostId: string,
    body: CreateSessionRequest,
  ): Promise<ClassSession> {
    await this.requireOwnedClassroom(classroomId, hostId);
    await this.assertNoOverlap(classroomId, new Date(body.startsAt), new Date(body.endsAt), null);

    const row = await this.prisma.classSession.create({
      data: {
        classroomId,
        title: body.title ?? null,
        startsAt: new Date(body.startsAt),
        endsAt: new Date(body.endsAt),
        // Unique per session and never reused, so a room can't be shared by
        // two sessions (the column is @unique for the same reason).
        livekitRoom: `class-${classroomId.slice(0, 8)}-${randomUUID().slice(0, 12)}`,
      },
      include: { recording: { select: { id: true } } },
    });
    return toClassSession(row, true);
  }

  async update(
    sessionId: string,
    hostId: string,
    body: UpdateSessionRequest,
  ): Promise<ClassSession> {
    const existing = await this.requireOwnedSession(sessionId, hostId);

    if (existing.status !== 'SCHEDULED') {
      throw new BadRequestException('Only a scheduled session can be rescheduled.');
    }

    const startsAt = body.startsAt ? new Date(body.startsAt) : existing.startsAt;
    const endsAt = body.endsAt ? new Date(body.endsAt) : existing.endsAt;
    if (endsAt <= startsAt) {
      throw new BadRequestException('A session must end after it starts.');
    }
    await this.assertNoOverlap(existing.classroomId, startsAt, endsAt, sessionId);

    const row = await this.prisma.classSession.update({
      where: { id: sessionId },
      data: {
        startsAt,
        endsAt,
        ...(body.title !== undefined ? { title: body.title ?? null } : {}),
      },
      include: { recording: { select: { id: true } } },
    });
    return toClassSession(row, true);
  }

  async cancel(sessionId: string, hostId: string): Promise<ClassSession> {
    const existing = await this.requireOwnedSession(sessionId, hostId);
    if (existing.status === 'ENDED') {
      throw new BadRequestException('That session has already ended.');
    }

    const row = await this.prisma.classSession.update({
      where: { id: sessionId },
      data: { status: 'CANCELLED' },
      include: { recording: { select: { id: true } } },
    });
    return toClassSession(row, true);
  }

  /** An ACTIVE enrollment, or being the host, is what entitles someone to a room. */
  async isEntitled(classroomId: string, userId: string): Promise<boolean> {
    const [isHost, enrollment] = await Promise.all([
      this.prisma.classroom.count({ where: { id: classroomId, hostId: userId } }),
      this.prisma.enrollment.count({
        where: { classroomId, userId, status: 'ACTIVE' },
      }),
    ]);
    return isHost > 0 || enrollment > 0;
  }

  /**
   * A host cannot be in two rooms at once, and a student reading the schedule
   * cannot tell which of two overlapping sessions is the real one. Rejected
   * at write time rather than rendered as a confusing timetable.
   */
  private async assertNoOverlap(
    classroomId: string,
    startsAt: Date,
    endsAt: Date,
    excludeSessionId: string | null,
  ): Promise<void> {
    const clash = await this.prisma.classSession.count({
      where: {
        classroomId,
        status: { in: ['SCHEDULED', 'LIVE'] },
        ...(excludeSessionId ? { id: { not: excludeSessionId } } : {}),
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
    });
    if (clash > 0) {
      throw new BadRequestException('That overlaps a session already scheduled for this class.');
    }
  }

  private async requireOwnedClassroom(classroomId: string, hostId: string): Promise<void> {
    const row = await this.prisma.classroom.findUnique({
      where: { id: classroomId },
      select: { hostId: true },
    });
    if (!row) throw new NotFoundException('Class not found.');
    if (row.hostId !== hostId) throw new ForbiddenException('That class belongs to another host.');
  }

  private async requireOwnedSession(
    sessionId: string,
    hostId: string,
  ): Promise<{ id: string; classroomId: string; status: string; startsAt: Date; endsAt: Date }> {
    const row = await this.prisma.classSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        classroomId: true,
        status: true,
        startsAt: true,
        endsAt: true,
        classroom: { select: { hostId: true } },
      },
    });
    if (!row) throw new NotFoundException('Session not found.');
    if (row.classroom.hostId !== hostId) {
      throw new ForbiddenException('That session belongs to another host.');
    }
    return row;
  }
}

export function toClassSession(
  row: {
    id: string;
    classroomId: string;
    title: string | null;
    startsAt: Date;
    endsAt: Date;
    status: string;
    livekitRoom: string;
    recording: { id: string } | null;
  },
  entitled: boolean,
): ClassSession {
  return {
    id: row.id,
    classroomId: row.classroomId,
    title: row.title,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    status: row.status as ClassSession['status'],
    livekitRoom: entitled ? row.livekitRoom : null,
    recordingId: row.recording?.id ?? null,
  };
}
