import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CatalogQuery,
  Classroom,
  CreateClassroomRequest,
  PaginationQuery,
  UpdateClassroomRequest,
} from '@frntdesk/shared';
import { PrismaService } from '../prisma/prisma.service.js';

/** Everything a Classroom response needs, in one query shape. */
const classroomInclude = {
  host: { select: { displayName: true } },
  subCourse: { select: { name: true, organisation: { select: { name: true } } } },
  _count: { select: { enrollments: { where: { status: 'ACTIVE' as const } } } },
};

@Injectable()
export class ClassroomsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The public catalog. Only PUBLISHED classes are ever visible here — a
   * draft is not "a class nobody found yet", it is one the host has not
   * agreed to sell, so it must not be reachable by guessing a query.
   */
  async catalog(
    query: CatalogQuery,
    page: PaginationQuery,
  ): Promise<{ items: Classroom[]; page: number; pageSize: number; total: number }> {
    const where = {
      status: 'PUBLISHED' as const,
      ...(query.hostId ? { hostId: query.hostId } : {}),
      ...(query.maxPriceMinor !== undefined ? { priceMinor: { lte: query.maxPriceMinor } } : {}),
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: 'insensitive' as const } },
              { description: { contains: query.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.classroom.findMany({
        where,
        include: classroomInclude,
        orderBy: { createdAt: 'desc' },
        skip: (page.page - 1) * page.pageSize,
        take: page.pageSize,
      }),
      this.prisma.classroom.count({ where }),
    ]);

    return {
      items: rows.map(toClassroom),
      page: page.page,
      pageSize: page.pageSize,
      total,
    };
  }

  /** Public detail. Mirrors the catalog's rule: published or nothing. */
  async publicDetail(id: string): Promise<Classroom> {
    const row = await this.prisma.classroom.findFirst({
      where: { id, status: 'PUBLISHED' },
      include: classroomInclude,
    });
    if (!row) throw new NotFoundException('Class not found.');
    return toClassroom(row);
  }

  async listForHost(hostId: string): Promise<Classroom[]> {
    const rows = await this.prisma.classroom.findMany({
      where: { hostId },
      include: classroomInclude,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toClassroom);
  }

  /** A host's own view of one class — unlike publicDetail, drafts included. */
  async detailForHost(id: string, hostId: string): Promise<Classroom> {
    const row = await this.prisma.classroom.findUnique({ where: { id }, include: classroomInclude });
    if (!row) throw new NotFoundException('Class not found.');
    if (row.hostId !== hostId) throw new ForbiddenException('That class belongs to another host.');
    return toClassroom(row);
  }

  async create(hostId: string, body: CreateClassroomRequest): Promise<Classroom> {
    if (body.subCourseId) await this.assertSubCourseExists(body.subCourseId);

    const row = await this.prisma.classroom.create({
      data: {
        hostId,
        title: body.title,
        description: body.description,
        priceMinor: body.priceMinor,
        currency: body.currency ?? 'ZMW',
        capacity: body.capacity ?? 100,
        coverImageUrl: body.coverImageUrl ?? null,
        subCourseId: body.subCourseId ?? null,
      },
      include: classroomInclude,
    });
    return toClassroom(row);
  }

  async update(id: string, hostId: string, body: UpdateClassroomRequest): Promise<Classroom> {
    const existing = await this.requireOwned(id, hostId);

    // Price is what a buyer already agreed to. Changing it under people who
    // are mid-checkout (or already paid) would silently rewrite that deal,
    // so it is frozen as soon as the class has any enrollment at all.
    if (body.priceMinor !== undefined && body.priceMinor !== existing.priceMinor) {
      const enrolled = await this.prisma.enrollment.count({ where: { classroomId: id } });
      if (enrolled > 0) {
        throw new BadRequestException(
          'The price cannot change once people have started enrolling. Cancel this class and publish a new one instead.',
        );
      }
    }

    if (body.subCourseId) await this.assertSubCourseExists(body.subCourseId);

    const row = await this.prisma.classroom.update({
      where: { id },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.priceMinor !== undefined ? { priceMinor: body.priceMinor } : {}),
        ...(body.capacity !== undefined ? { capacity: body.capacity } : {}),
        ...(body.coverImageUrl !== undefined ? { coverImageUrl: body.coverImageUrl ?? null } : {}),
        ...(body.subCourseId !== undefined ? { subCourseId: body.subCourseId ?? null } : {}),
      },
      include: classroomInclude,
    });
    return toClassroom(row);
  }

  /**
   * Publishing is the one action gated on a verified email (see the User
   * model's comment) — it is what keeps unverified throwaway accounts from
   * filling the catalog with spam classes.
   */
  async publish(
    id: string,
    host: { id: string; emailVerifiedAt: Date | null },
  ): Promise<Classroom> {
    const existing = await this.requireOwned(id, host.id);

    if (!host.emailVerifiedAt) {
      throw new ForbiddenException(
        'Verify your email address before publishing a class to the catalog.',
      );
    }
    if (existing.status === 'CANCELLED') {
      throw new BadRequestException('A cancelled class cannot be published again.');
    }

    const sessions = await this.prisma.classSession.count({
      where: { classroomId: id, status: { in: ['SCHEDULED', 'LIVE'] } },
    });
    if (sessions === 0) {
      throw new BadRequestException('Schedule at least one session before publishing.');
    }

    const row = await this.prisma.classroom.update({
      where: { id },
      data: { status: 'PUBLISHED' },
      include: classroomInclude,
    });
    return toClassroom(row);
  }

  /**
   * Cancels rather than deletes, always. A class with payments against it is
   * a financial record — the Payment table's `onDelete: Restrict` would block
   * the delete anyway, and refunds need the row to still exist.
   */
  async cancel(id: string, hostId: string): Promise<Classroom> {
    await this.requireOwned(id, hostId);

    const [row] = await this.prisma.$transaction([
      this.prisma.classroom.update({
        where: { id },
        data: { status: 'CANCELLED' },
        include: classroomInclude,
      }),
      this.prisma.classSession.updateMany({
        where: { classroomId: id, status: 'SCHEDULED' },
        data: { status: 'CANCELLED' },
      }),
    ]);
    return toClassroom(row);
  }

  private async requireOwned(
    id: string,
    hostId: string,
  ): Promise<{ id: string; hostId: string; status: string; priceMinor: number }> {
    const row = await this.prisma.classroom.findUnique({
      where: { id },
      select: { id: true, hostId: true, status: true, priceMinor: true },
    });
    if (!row) throw new NotFoundException('Class not found.');
    if (row.hostId !== hostId) throw new ForbiddenException('That class belongs to another host.');
    return row;
  }

  private async assertSubCourseExists(subCourseId: string): Promise<void> {
    const exists = await this.prisma.subCourse.count({ where: { id: subCourseId } });
    if (exists === 0) throw new NotFoundException('That sub-course does not exist.');
  }
}

export function toClassroom(row: {
  id: string;
  hostId: string;
  subCourseId: string | null;
  title: string;
  description: string;
  priceMinor: number;
  currency: string;
  capacity: number;
  coverImageUrl: string | null;
  status: string;
  createdAt: Date;
  host: { displayName: string };
  subCourse: { name: string; organisation: { name: string } } | null;
  _count: { enrollments: number };
}): Classroom {
  return {
    id: row.id,
    hostId: row.hostId,
    hostDisplayName: row.host.displayName,
    subCourseId: row.subCourseId,
    subCourseName: row.subCourse?.name ?? null,
    organisationName: row.subCourse?.organisation.name ?? null,
    title: row.title,
    description: row.description,
    priceMinor: row.priceMinor,
    currency: row.currency as Classroom['currency'],
    capacity: row.capacity,
    coverImageUrl: row.coverImageUrl,
    status: row.status as Classroom['status'],
    enrolledCount: row._count.enrollments,
    createdAt: row.createdAt.toISOString(),
  };
}
