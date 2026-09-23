import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  AcceptInvitationResult,
  CreateInvitationsRequest,
  Invitation,
} from '@frntdesk/shared';
import type { Env } from '../config/env.schema.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MailService } from '../mail/mail.service.js';

/** Long enough that guessing is hopeless; the plaintext never touches the database. */
const TOKEN_BYTES = 32;
const EXPIRY_DAYS = 14;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async listForClassroom(classroomId: string, hostId: string): Promise<Invitation[]> {
    await this.requireOwned(classroomId, hostId);
    const rows = await this.prisma.invitation.findMany({
      where: { classroomId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toInvitation);
  }

  /**
   * Invites by email, one row per address.
   *
   * Only the SHA-256 of each token is stored — the plaintext exists in the
   * email and nowhere else, so a database read cannot be turned into a free
   * seat. Re-inviting an address reissues its token rather than creating a
   * second row, which is what the `(classroomId, email)` unique constraint
   * is there to enforce.
   */
  async create(
    classroomId: string,
    hostId: string,
    body: CreateInvitationsRequest,
  ): Promise<Invitation[]> {
    const classroom = await this.requireOwned(classroomId, hostId);

    const expiresAt = new Date(Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000);
    const created: Invitation[] = [];

    for (const email of body.emails) {
      const token = randomBytes(TOKEN_BYTES).toString('hex');
      const tokenHash = hashToken(token);

      const row = await this.prisma.invitation.upsert({
        where: { classroomId_email: { classroomId, email } },
        update: {
          tokenHash,
          status: 'SENT',
          comp: body.comp ?? false,
          message: body.message ?? null,
          expiresAt,
        },
        create: {
          classroomId,
          email,
          tokenHash,
          invitedById: hostId,
          comp: body.comp ?? false,
          message: body.message ?? null,
          expiresAt,
        },
      });

      created.push(toInvitation(row));
      await this.sendInvite(email, token, classroom.title, body.message ?? null, row.comp);
    }

    return created;
  }

  async revoke(invitationId: string, hostId: string): Promise<Invitation> {
    const row = await this.prisma.invitation.findUnique({
      where: { id: invitationId },
      include: { classroom: { select: { hostId: true } } },
    });
    if (!row) throw new NotFoundException('Invitation not found.');
    if (row.classroom.hostId !== hostId) {
      throw new ForbiddenException('That invitation belongs to another host.');
    }
    if (row.status === 'ACCEPTED') {
      throw new BadRequestException('That invitation has already been accepted.');
    }

    return toInvitation(
      await this.prisma.invitation.update({
        where: { id: invitationId },
        data: { status: 'REVOKED' },
      }),
    );
  }

  /**
   * Redeems a token for the signed-in user.
   *
   * The invited address and the redeeming account deliberately do not have to
   * match: people forward invites, and sign up with a different address than
   * the one a host had on file. Possession of the token is the credential —
   * which is exactly why it is single-use and expiring.
   */
  async accept(token: string, userId: string): Promise<AcceptInvitationResult> {
    const row = await this.prisma.invitation.findUnique({
      where: { tokenHash: hashToken(token) },
      include: {
        classroom: { select: { id: true, title: true, priceMinor: true, status: true } },
      },
    });

    if (!row) throw new NotFoundException('That invitation link is not valid.');
    if (row.status === 'REVOKED') throw new BadRequestException('That invitation was withdrawn.');
    if (row.status === 'ACCEPTED') {
      throw new BadRequestException('That invitation has already been used.');
    }
    if (row.expiresAt < new Date()) {
      await this.prisma.invitation.update({
        where: { id: row.id },
        data: { status: 'EXPIRED' },
      });
      throw new BadRequestException('That invitation has expired. Ask the host for a new one.');
    }
    if (row.classroom.status !== 'PUBLISHED') {
      throw new BadRequestException('That class is not open at the moment.');
    }

    // A comped invite waives payment entirely and lands the user in the class;
    // a paid one only marks the invitation used and hands off to checkout.
    const comped = row.comp || row.classroom.priceMinor === 0;

    await this.prisma.$transaction(async (tx) => {
      await tx.invitation.update({
        where: { id: row.id },
        data: { status: 'ACCEPTED', acceptedAt: new Date(), acceptedById: userId },
      });

      if (comped) {
        await tx.enrollment.upsert({
          where: { classroomId_userId: { classroomId: row.classroomId, userId } },
          update: { status: 'ACTIVE', activatedAt: new Date() },
          create: {
            classroomId: row.classroomId,
            userId,
            status: 'ACTIVE',
            activatedAt: new Date(),
          },
        });
      }
    });

    return {
      classroomId: row.classroom.id,
      classroomTitle: row.classroom.title,
      next: comped ? 'ENROLLED' : 'PAYMENT_REQUIRED',
      priceMinor: row.classroom.priceMinor,
    };
  }

  private async sendInvite(
    email: string,
    token: string,
    classTitle: string,
    message: string | null,
    comp: boolean,
  ): Promise<void> {
    const link = `${this.config.get('WEB_ORIGIN', { infer: true })}/invite/${token}`;
    const preamble = comp
      ? `You have been given a free place in "${classTitle}" on FRNTDesk.`
      : `You have been invited to join "${classTitle}" on FRNTDesk.`;

    await this.mail.send({
      to: email,
      subject: `You're invited: ${classTitle}`,
      text: [preamble, message ?? '', `Accept your invitation: ${link}`]
        .filter(Boolean)
        .join('\n\n'),
      html: `
        <p>${escapeHtml(preamble)}</p>
        ${message ? `<blockquote>${escapeHtml(message)}</blockquote>` : ''}
        <p><a href="${link}">Accept your invitation</a></p>
        <p style="color:#666;font-size:12px">This link expires in ${EXPIRY_DAYS} days.</p>
      `,
    });
  }

  private async requireOwned(
    classroomId: string,
    hostId: string,
  ): Promise<{ id: string; title: string }> {
    const row = await this.prisma.classroom.findUnique({
      where: { id: classroomId },
      select: { id: true, title: true, hostId: true },
    });
    if (!row) throw new NotFoundException('Class not found.');
    if (row.hostId !== hostId) throw new ForbiddenException('That class belongs to another host.');
    return row;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toInvitation(row: {
  id: string;
  classroomId: string;
  email: string;
  status: string;
  comp: boolean;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
}): Invitation {
  return {
    id: row.id,
    classroomId: row.classroomId,
    email: row.email,
    status: row.status as Invitation['status'],
    comp: row.comp,
    expiresAt: row.expiresAt.toISOString(),
    acceptedAt: row.acceptedAt ? row.acceptedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}
