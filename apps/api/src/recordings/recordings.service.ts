import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PriceRecordingRequest, Recording } from '@frntdesk/shared';
import type { Env } from '../config/env.schema.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * The read side of replays: what a viewer may play back, and what a host
 * charges for it.
 *
 * Capture itself (LiveKit egress into S3) is gated behind RECORDING_ENABLED
 * and is not wired up here — with no storage credentials configured there is
 * nothing for it to write to, and a half-configured egress that fails
 * mid-session is worse than one that was never started.
 */
@Injectable()
export class RecordingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Everything this user can play: bought outright, or included with a seat. */
  async library(userId: string): Promise<Recording[]> {
    const rows = await this.prisma.recording.findMany({
      where: {
        status: 'COMPLETE',
        OR: [
          { access: { some: { userId } } },
          { session: { classroom: { enrollments: { some: { userId, status: 'ACTIVE' } } } } },
          { session: { classroom: { hostId: userId } } },
        ],
      },
      orderBy: { recordedAt: 'desc' },
      include: {
        session: { select: { classroomId: true, classroom: { select: { title: true } } } },
      },
    });

    return rows.map((row) => this.toRecording(row, true));
  }

  async detail(recordingId: string, userId: string): Promise<Recording> {
    const row = await this.prisma.recording.findUnique({
      where: { id: recordingId },
      include: {
        session: {
          select: {
            classroomId: true,
            classroom: { select: { title: true, hostId: true } },
          },
        },
      },
    });
    if (!row) throw new NotFoundException('Recording not found.');

    const entitled = await this.isEntitled(row, userId);
    return this.toRecording(row, entitled);
  }

  async price(
    recordingId: string,
    hostId: string,
    body: PriceRecordingRequest,
  ): Promise<Recording> {
    const row = await this.prisma.recording.findUnique({
      where: { id: recordingId },
      include: {
        session: {
          select: { classroomId: true, classroom: { select: { title: true, hostId: true } } },
        },
      },
    });
    if (!row) throw new NotFoundException('Recording not found.');
    if (row.session.classroom.hostId !== hostId) {
      throw new ForbiddenException('That recording belongs to another host.');
    }

    const updated = await this.prisma.recording.update({
      where: { id: recordingId },
      data: { priceMinor: body.priceMinor },
      include: {
        session: {
          select: { classroomId: true, classroom: { select: { title: true, hostId: true } } },
        },
      },
    });
    return this.toRecording(updated, true);
  }

  private async isEntitled(
    row: { id: string; session: { classroomId: string; classroom: { hostId?: string } } },
    userId: string,
  ): Promise<boolean> {
    if (row.session.classroom.hostId === userId) return true;

    const [purchased, enrolled] = await Promise.all([
      this.prisma.recordingAccess.count({ where: { recordingId: row.id, userId } }),
      this.prisma.enrollment.count({
        where: { classroomId: row.session.classroomId, userId, status: 'ACTIVE' },
      }),
    ]);
    return purchased > 0 || enrolled > 0;
  }

  private toRecording(
    row: {
      id: string;
      classSessionId: string;
      status: string;
      durationSec: number | null;
      storageKey: string | null;
      priceMinor: number | null;
      currency: string;
      recordedAt: Date;
      session: { classroomId: string; classroom: { title: string } };
    },
    entitled: boolean,
  ): Recording {
    return {
      id: row.id,
      classSessionId: row.classSessionId,
      classroomId: row.session.classroomId,
      classroomTitle: row.session.classroom.title,
      status: row.status as Recording['status'],
      durationSec: row.durationSec,
      playbackUrl: entitled ? this.playbackUrl(row.storageKey) : null,
      priceMinor: row.priceMinor,
      currency: row.currency as Recording['currency'],
      recordedAt: row.recordedAt.toISOString(),
    };
  }

  /**
   * Built from the configured bucket. Returns null rather than a broken URL
   * when storage is not configured, so the UI can say "not available" instead
   * of handing the player something that 404s.
   */
  private playbackUrl(storageKey: string | null): string | null {
    if (!storageKey) return null;

    const endpoint = this.config.get('S3_ENDPOINT', { infer: true });
    const bucket = this.config.get('S3_BUCKET', { infer: true });
    if (!bucket) return null;

    const base = endpoint
      ? `${endpoint.replace(/\/$/, '')}/${bucket}`
      : `https://${bucket}.s3.${this.config.get('S3_REGION', { infer: true })}.amazonaws.com`;
    return `${base}/${storageKey}`;
  }

  /** Whether this server has capture configured at all, for the join token's own flag. */
  isCaptureConfigured(): boolean {
    return this.config.get('RECORDING_ENABLED', { infer: true });
  }

  /** Surfaced by the host UI so "start recording" is not offered when it cannot work. */
  assertCaptureConfigured(): void {
    if (!this.isCaptureConfigured()) {
      throw new ServiceUnavailableException(
        'Session recording is switched off on this server (RECORDING_ENABLED).',
      );
    }
  }
}
