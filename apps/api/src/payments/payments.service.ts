import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  grantsAccess,
  maskMsisdn,
  needsReconciliation,
  parseZambianMsisdn,
  transition,
  type CheckoutRequest,
  type CheckoutResponse,
  type Payment,
  type PaymentStatus,
} from '@frntdesk/shared';
import type { Env } from '../config/env.schema.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaymentProviderRegistry } from './providers/provider.registry.js';

/** How long the UI should keep polling before giving up on the handset prompt. */
const POLL_AFTER_MS = 3_000;
const POLL_TIMEOUT_MS = 120_000;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: PaymentProviderRegistry,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * Starts a collection against the buyer's wallet.
   *
   * The idempotency key does the heavy lifting: a double-tapped pay button
   * arrives twice with the same key and the second call returns the first
   * payment untouched rather than putting a second prompt on the handset.
   */
  async checkout(
    userId: string,
    body: CheckoutRequest,
    idempotencyKey: string,
  ): Promise<CheckoutResponse> {
    const existing = await this.prisma.payment.findUnique({
      where: { idempotencyKey },
      select: PAYMENT_SELECT,
    });
    if (existing) {
      if (existing.userId !== userId) {
        // Someone else's key. Never return their payment.
        throw new ConflictException('That idempotency key belongs to another request.');
      }
      return this.toCheckoutResponse(existing);
    }

    const parsed = parseZambianMsisdn(body.phone);
    if (!parsed.ok) throw new BadRequestException(parsed.message);

    const target = await this.resolveTarget(userId, body);
    const adapter = this.providers.resolve(parsed.value.operator, body.provider);
    const externalId = `frntdesk-${randomUUID()}`;

    // The row exists before the provider is called, so a request that dies
    // mid-flight still leaves something for reconciliation to find.
    const payment = await this.prisma.payment.create({
      data: {
        userId,
        purpose: body.purpose,
        classroomId: target.classroomId,
        recordingId: target.recordingId,
        amountMinor: target.amountMinor,
        currency: 'ZMW',
        provider: adapter.key,
        status: 'INITIATED',
        externalId,
        idempotencyKey,
        payerMsisdn: parsed.value.e164,
      },
      select: PAYMENT_SELECT,
    });

    // A seat is reserved as PENDING_PAYMENT, not ACTIVE. Only a settled
    // payment activates it — see applyProviderStatus.
    if (target.classroomId) {
      await this.prisma.enrollment.upsert({
        where: { classroomId_userId: { classroomId: target.classroomId, userId } },
        update: {},
        create: { classroomId: target.classroomId, userId, status: 'PENDING_PAYMENT' },
      });
    }

    let collected;
    try {
      collected = await adapter.collect({
        externalId,
        amountMinor: target.amountMinor,
        wireCurrency: this.config.get('MTN_WIRE_CURRENCY', { infer: true }),
        payer: parsed.value,
        description: target.description,
      });
    } catch (error) {
      this.logger.error(`Collection could not be started for ${payment.id}`, error);
      const failed = await this.recordEvent(payment.id, 'MANUAL', 'FAILED', {
        error: error instanceof Error ? error.message : String(error),
      });
      return this.toCheckoutResponse(failed);
    }

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { providerRef: collected.providerRef },
    });

    const advanced = await this.recordEvent(
      payment.id,
      'MANUAL',
      collected.status,
      { providerRef: collected.providerRef },
      collected.failureReason,
    );

    return this.toCheckoutResponse(advanced);
  }

  async findForUser(paymentId: string, userId: string): Promise<Payment> {
    const row = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: PAYMENT_SELECT,
    });
    if (!row || row.userId !== userId) throw new NotFoundException('Payment not found.');
    return toPayment(row);
  }

  /**
   * Asks the provider what actually happened and applies the answer. This is
   * the only path that can settle a payment — a callback merely schedules a
   * call to this, because a callback is unauthenticated and therefore
   * spoofable (see the README).
   */
  async reconcile(paymentId: string): Promise<PaymentStatus> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: PAYMENT_SELECT,
    });
    if (!payment) throw new NotFoundException('Payment not found.');
    if (!needsReconciliation(payment.status as PaymentStatus)) {
      return payment.status as PaymentStatus;
    }
    if (!payment.providerRef) {
      // Never reached the provider. Nothing to ask about yet.
      return payment.status as PaymentStatus;
    }

    const adapter = this.providers.byKey(payment.provider);
    const result = await adapter.status(payment.providerRef);

    await this.prisma.payment.update({
      where: { id: paymentId },
      data: { pollAttempts: { increment: 1 } },
    });

    const updated = await this.recordEvent(
      paymentId,
      'POLL',
      result.status,
      result.raw,
      result.failureReason,
    );
    return updated.status as PaymentStatus;
  }

  /**
   * Writes a PaymentEvent for every proposed transition — including the ones
   * the state machine rejects, so a spoofing attempt or a replayed callback
   * leaves a trace rather than vanishing.
   */
  async recordEvent(
    paymentId: string,
    source: 'CALLBACK' | 'POLL' | 'MANUAL',
    proposed: PaymentStatus,
    payload: unknown,
    failureReason?: string,
  ): Promise<PaymentRow> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: PAYMENT_SELECT,
    });
    if (!payment) throw new NotFoundException('Payment not found.');

    const outcome = transition(payment.status as PaymentStatus, proposed);

    await this.prisma.paymentEvent.create({
      data: {
        paymentId,
        source,
        outcome: outcome.kind,
        fromStatus: payment.status,
        toStatus: proposed,
        payload: (payload ?? {}) as object,
      },
    });

    if (outcome.kind !== 'APPLY') {
      if (outcome.kind === 'REJECT') {
        this.logger.warn(`Rejected ${payment.status} -> ${proposed} on ${paymentId}: ${outcome.reason}`);
      }
      return payment;
    }

    const settled = grantsAccess(proposed);
    const updated = await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: proposed,
        ...(settled ? { settledAt: new Date() } : {}),
        ...(failureReason ? { failureReason } : {}),
      },
      select: PAYMENT_SELECT,
    });

    if (settled) await this.grantAccess(updated);
    return updated;
  }

  /**
   * Records an inbound provider callback without acting on it, and returns
   * the payment it refers to so a reconciliation job can be queued.
   *
   * Deliberately does not call `recordEvent`: that would apply the status the
   * callback claims, and this body is unauthenticated. The event is written
   * with no proposed transition, so the audit trail shows the callback
   * arrived while the status stays whatever polling last proved.
   */
  async noteCallback(body: unknown): Promise<string | null> {
    const providerRef = extractProviderRef(body);
    if (!providerRef) {
      this.logger.warn('Ignoring a provider callback with no recognizable reference.');
      return null;
    }

    const payment = await this.prisma.payment.findUnique({
      where: { providerRef },
      select: { id: true },
    });
    if (!payment) {
      // A reference we have never issued. Worth noticing, not worth erroring.
      this.logger.warn(`Callback for unknown providerRef ${providerRef}.`);
      return null;
    }

    await this.prisma.paymentEvent.create({
      data: {
        paymentId: payment.id,
        source: 'CALLBACK',
        outcome: 'NOOP',
        fromStatus: null,
        toStatus: null,
        payload: (body ?? {}) as object,
      },
    });

    return payment.id;
  }

  /** What a settled payment actually buys. */
  private async grantAccess(payment: PaymentRow): Promise<void> {
    if (payment.classroomId) {
      await this.prisma.enrollment.upsert({
        where: {
          classroomId_userId: { classroomId: payment.classroomId, userId: payment.userId },
        },
        update: { status: 'ACTIVE', activatedAt: new Date() },
        create: {
          classroomId: payment.classroomId,
          userId: payment.userId,
          status: 'ACTIVE',
          activatedAt: new Date(),
        },
      });
      this.logger.log(`Enrollment activated for payment ${payment.id}`);
      return;
    }

    if (payment.recordingId) {
      await this.prisma.recordingAccess.upsert({
        where: {
          recordingId_userId: { recordingId: payment.recordingId, userId: payment.userId },
        },
        update: {},
        create: {
          recordingId: payment.recordingId,
          userId: payment.userId,
          grantedVia: 'PURCHASE',
          paymentId: payment.id,
        },
      });
      this.logger.log(`Recording access granted for payment ${payment.id}`);
    }
  }

  /** Validates what is being bought and prices it from the database, never the request. */
  private async resolveTarget(
    userId: string,
    body: CheckoutRequest,
  ): Promise<{
    classroomId: string | null;
    recordingId: string | null;
    amountMinor: number;
    description: string;
  }> {
    if (body.purpose === 'CLASS_ENROLLMENT') {
      const classroom = await this.prisma.classroom.findUnique({
        where: { id: body.classroomId! },
        select: {
          id: true,
          title: true,
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
        throw new BadRequestException('You are hosting this class.');
      }
      if (classroom.priceMinor === 0) {
        throw new BadRequestException('This class is free — enrol without checkout.');
      }
      if (classroom._count.enrollments >= classroom.capacity) {
        throw new ConflictException('This class is full.');
      }

      const seat = await this.prisma.enrollment.findUnique({
        where: { classroomId_userId: { classroomId: classroom.id, userId } },
        select: { status: true },
      });
      if (seat?.status === 'ACTIVE') {
        throw new ConflictException('You already have a seat in this class.');
      }

      return {
        classroomId: classroom.id,
        recordingId: null,
        amountMinor: classroom.priceMinor,
        description: `FRNTDesk: ${classroom.title}`,
      };
    }

    const recording = await this.prisma.recording.findUnique({
      where: { id: body.recordingId! },
      select: {
        id: true,
        priceMinor: true,
        session: { select: { classroom: { select: { title: true } } } },
      },
    });
    if (!recording) throw new NotFoundException('Recording not found.');
    if (recording.priceMinor === null || recording.priceMinor === 0) {
      throw new BadRequestException('That replay is not sold separately.');
    }

    const access = await this.prisma.recordingAccess.count({
      where: { recordingId: recording.id, userId },
    });
    if (access > 0) throw new ConflictException('You already have access to this replay.');

    return {
      classroomId: null,
      recordingId: recording.id,
      amountMinor: recording.priceMinor,
      description: `FRNTDesk replay: ${recording.session.classroom.title}`,
    };
  }

  private toCheckoutResponse(row: PaymentRow): CheckoutResponse {
    return {
      payment: toPayment(row),
      instruction:
        row.status === 'FAILED'
          ? 'The payment could not be started. Check the number and try again.'
          : `Approve the prompt on ${maskMsisdn(row.payerMsisdn)} to confirm the payment.`,
      pollAfterMs: POLL_AFTER_MS,
      pollTimeoutMs: POLL_TIMEOUT_MS,
    };
  }
}

const PAYMENT_SELECT = {
  id: true,
  userId: true,
  purpose: true,
  classroomId: true,
  recordingId: true,
  amountMinor: true,
  currency: true,
  provider: true,
  status: true,
  providerRef: true,
  payerMsisdn: true,
  failureReason: true,
  createdAt: true,
  settledAt: true,
} as const;

export type PaymentRow = {
  id: string;
  userId: string;
  purpose: string;
  classroomId: string | null;
  recordingId: string | null;
  amountMinor: number;
  currency: string;
  provider: 'MTN_MOMO' | 'AIRTEL_MONEY' | 'FAKE';
  status: string;
  providerRef: string | null;
  payerMsisdn: string;
  failureReason: string | null;
  createdAt: Date;
  settledAt: Date | null;
};

/**
 * MTN echoes our `X-Reference-Id` back under one of a few names depending on
 * the product. Tried in order rather than assuming one shape, since a missed
 * reference silently drops the callback.
 */
function extractProviderRef(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const record = body as Record<string, unknown>;
  for (const key of ['referenceId', 'reference_id', 'externalId', 'financialTransactionId']) {
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return null;
}

export function toPayment(row: PaymentRow): Payment {
  return {
    id: row.id,
    purpose: row.purpose as Payment['purpose'],
    classroomId: row.classroomId,
    recordingId: row.recordingId,
    amountMinor: row.amountMinor,
    currency: row.currency as Payment['currency'],
    provider: row.provider,
    status: row.status as Payment['status'],
    // Never the full number — see the schema comment on paymentSchema.
    payerMsisdnMasked: maskMsisdn(row.payerMsisdn),
    failureReason: row.failureReason,
    createdAt: row.createdAt.toISOString(),
    settledAt: row.settledAt ? row.settledAt.toISOString() : null,
  };
}
