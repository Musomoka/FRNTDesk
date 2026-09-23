import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { EnrolledClass, Enrollment } from '@frntdesk/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { toClassroom } from './classrooms.service.js';
import { toClassSession } from './sessions.service.js';

@Injectable()
export class EnrollmentsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The free path only. A priced class must go through checkout, because an
   * ACTIVE enrollment is the thing that mints a join token — handing one out
   * here would be giving the class away.
   */
  async enrollFree(classroomId: string, userId: string): Promise<Enrollment> {
    const classroom = await this.prisma.classroom.findUnique({
      where: { id: classroomId },
      select: {
        id: true,
        hostId: true,
        status: true,
        priceMinor: true,
        capacity: true,
        _count: { select: { enrollments: { where: { status: 'ACTIVE' } } } },
      },
    });
    if (!classroom) throw new NotFoundException('Class not found.');
    if (classroom.status !== 'PUBLISHED') {
      throw new BadRequestException('That class is not open for enrollment.');
    }
    if (classroom.hostId === userId) {
      throw new BadRequestException('You are hosting this class — you do not need to enroll.');
    }
    if (classroom.priceMinor > 0) {
      throw new BadRequestException('This class is paid. Complete checkout to enroll.');
    }
    if (classroom._count.enrollments >= classroom.capacity) {
      throw new ConflictException('This class is full.');
    }

    const existing = await this.prisma.enrollment.findUnique({
      where: { classroomId_userId: { classroomId, userId } },
    });
    if (existing) {
      if (existing.status === 'ACTIVE') return toEnrollment(existing);
      // A previously cancelled/refunded seat is reactivated rather than
      // inserted again — the unique constraint means there is only ever one
      // enrollment row per person per class.
      return toEnrollment(
        await this.prisma.enrollment.update({
          where: { id: existing.id },
          data: { status: 'ACTIVE', activatedAt: new Date() },
        }),
      );
    }

    return toEnrollment(
      await this.prisma.enrollment.create({
        data: { classroomId, userId, status: 'ACTIVE', activatedAt: new Date() },
      }),
    );
  }

  /** "My Classes" — every class this user holds a seat in, upcoming first. */
  async listMine(userId: string): Promise<EnrolledClass[]> {
    const rows = await this.prisma.enrollment.findMany({
      where: { userId, status: { in: ['ACTIVE', 'PENDING_PAYMENT'] } },
      orderBy: { createdAt: 'desc' },
      include: {
        classroom: {
          include: {
            host: { select: { displayName: true } },
            subCourse: { select: { name: true, organisation: { select: { name: true } } } },
            _count: { select: { enrollments: { where: { status: 'ACTIVE' } } } },
            sessions: {
              where: { status: { in: ['SCHEDULED', 'LIVE'] }, endsAt: { gte: new Date() } },
              orderBy: { startsAt: 'asc' },
              take: 1,
              include: { recording: { select: { id: true } } },
            },
          },
        },
      },
    });

    return rows.map((row) => ({
      enrollment: toEnrollment(row),
      classroom: toClassroom(row.classroom),
      // Entitled to the room name only once the seat is actually ACTIVE —
      // a PENDING_PAYMENT row is not a seat yet.
      nextSession: row.classroom.sessions[0]
        ? toClassSession(row.classroom.sessions[0], row.status === 'ACTIVE')
        : null,
    }));
  }

  /** The host's roster for one class. */
  async listForClassroom(
    classroomId: string,
    hostId: string,
  ): Promise<{ enrollment: Enrollment; displayName: string; email: string }[]> {
    const classroom = await this.prisma.classroom.findUnique({
      where: { id: classroomId },
      select: { hostId: true },
    });
    if (!classroom) throw new NotFoundException('Class not found.');
    if (classroom.hostId !== hostId) {
      throw new NotFoundException('Class not found.');
    }

    const rows = await this.prisma.enrollment.findMany({
      where: { classroomId },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { displayName: true, email: true } } },
    });

    return rows.map((row) => ({
      enrollment: toEnrollment(row),
      displayName: row.user.displayName,
      email: row.user.email,
    }));
  }
}

export function toEnrollment(row: {
  id: string;
  classroomId: string;
  userId: string;
  status: string;
  createdAt: Date;
}): Enrollment {
  return {
    id: row.id,
    classroomId: row.classroomId,
    userId: row.userId,
    status: row.status as Enrollment['status'],
    createdAt: row.createdAt.toISOString(),
  };
}
