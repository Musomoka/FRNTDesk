import { ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { PaymentsService } from './payments.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { PaymentProviderRegistry } from './providers/provider.registry.js';
import type { PaymentProviderAdapter } from './providers/payment-provider.js';

const CLASSROOM_ID = '00000000-0000-4000-8000-0000000000c1';
const USER_ID = '00000000-0000-4000-8000-0000000000u1';

/**
 * A real in-memory stand-in rather than pre-programmed return values: the
 * behavior under test is read-your-writes (an idempotent replay must find the
 * row the first call wrote, a settled payment must flip the enrollment that
 * checkout created), which stubbed returns would assert into existence.
 */
function fakePrisma() {
  const payments = new Map<string, Record<string, unknown>>();
  const enrollments = new Map<string, Record<string, unknown>>();
  const events: Record<string, unknown>[] = [];
  let seq = 0;

  const findPayment = (where: Record<string, unknown>) => {
    for (const row of payments.values()) {
      if (where['id'] !== undefined && row['id'] === where['id']) return { ...row };
      if (where['idempotencyKey'] !== undefined && row['idempotencyKey'] === where['idempotencyKey'])
        return { ...row };
      if (where['providerRef'] !== undefined && row['providerRef'] === where['providerRef'])
        return { ...row };
    }
    return null;
  };

  const prisma = {
    payment: {
      findUnique: async ({ where }: { where: Record<string, unknown> }) => findPayment(where),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          ...data,
          id: `payment-${++seq}`,
          providerRef: null,
          failureReason: null,
          settledAt: null,
          pollAttempts: 0,
          createdAt: new Date(),
        };
        payments.set(row.id, row);
        return { ...row };
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const existing = payments.get(where.id);
        if (!existing) throw new Error('payment not found');
        const next = { ...existing };
        for (const [key, value] of Object.entries(data)) {
          // Prisma's `{ increment: n }` shorthand, as used for pollAttempts.
          if (value && typeof value === 'object' && 'increment' in value) {
            next[key] = ((next[key] as number) ?? 0) + (value as { increment: number }).increment;
          } else {
            next[key] = value;
          }
        }
        payments.set(where.id, next);
        return { ...next };
      },
    },
    paymentEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        events.push(data);
        return data;
      },
    },
    enrollment: {
      findUnique: async ({ where }: { where: Record<string, unknown> }) => {
        const key = compositeKey(where);
        return enrollments.get(key) ? { ...enrollments.get(key) } : null;
      },
      upsert: async ({
        where,
        update,
        create,
      }: {
        where: Record<string, unknown>;
        update: Record<string, unknown>;
        create: Record<string, unknown>;
      }) => {
        const key = compositeKey(where);
        const existing = enrollments.get(key);
        const row = existing ? { ...existing, ...update } : { ...create };
        enrollments.set(key, row);
        return { ...row };
      },
    },
    classroom: {
      findUnique: async () => ({
        id: CLASSROOM_ID,
        title: 'Introduction to Financial Modelling',
        hostId: 'someone-else',
        status: 'PUBLISHED',
        priceMinor: 15_000,
        capacity: 200,
        _count: { enrollments: 0 },
      }),
    },
    recordingAccess: { upsert: async () => ({}) },
  };

  return { prisma: prisma as unknown as PrismaService, payments, enrollments, events };
}

function compositeKey(where: Record<string, unknown>): string {
  const composite = where['classroomId_userId'] as
    | { classroomId: string; userId: string }
    | undefined;
  if (composite) return `${composite.classroomId}:${composite.userId}`;
  return JSON.stringify(where);
}

function fakeAdapter(overrides: Partial<PaymentProviderAdapter> = {}): PaymentProviderAdapter {
  return {
    key: 'FAKE',
    collect: vi.fn(async () => ({ providerRef: 'fake-ref-1', status: 'PENDING' as const })),
    status: vi.fn(async () => ({ status: 'SUCCESSFUL' as const, raw: {} })),
    ...overrides,
  } as PaymentProviderAdapter;
}

function makeService(adapter = fakeAdapter()) {
  const db = fakePrisma();
  const registry = {
    resolve: () => adapter,
    byKey: () => adapter,
  } as unknown as PaymentProviderRegistry;
  const config = { get: () => 'EUR' } as unknown as ConfigService<never, true>;

  const service = new PaymentsService(db.prisma, registry, config as never);
  return { service, db, adapter };
}

const checkoutBody = {
  purpose: 'CLASS_ENROLLMENT' as const,
  classroomId: CLASSROOM_ID,
  phone: '+260966123456',
};

describe('PaymentsService.checkout', () => {
  it('reserves the seat as PENDING_PAYMENT rather than granting it up front', async () => {
    const { service, db } = makeService();

    await service.checkout(USER_ID, checkoutBody, 'idem-key-0001');

    const seat = [...db.enrollments.values()][0];
    expect(seat?.['status']).toBe('PENDING_PAYMENT');
  });

  it('returns the original payment when the same idempotency key is replayed', async () => {
    const { service, adapter } = makeService();

    const first = await service.checkout(USER_ID, checkoutBody, 'idem-key-0002');
    const second = await service.checkout(USER_ID, checkoutBody, 'idem-key-0002');

    expect(second.payment.id).toBe(first.payment.id);
    // The decisive part: a second prompt never reached the handset.
    expect(adapter.collect).toHaveBeenCalledTimes(1);
  });

  it('refuses to hand someone else their payment for a reused key', async () => {
    const { service } = makeService();
    await service.checkout(USER_ID, checkoutBody, 'idem-key-0003');

    await expect(
      service.checkout('a-different-user', checkoutBody, 'idem-key-0003'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('prices from the database, not from anything the caller sent', async () => {
    const { service, db } = makeService();

    await service.checkout(USER_ID, { ...checkoutBody, phone: '+260966123456' }, 'idem-key-0004');

    expect([...db.payments.values()][0]?.['amountMinor']).toBe(15_000);
  });
});

describe('PaymentsService settlement', () => {
  it('activates the enrollment once the provider confirms the payment', async () => {
    const { service, db } = makeService();
    const { payment } = await service.checkout(USER_ID, checkoutBody, 'idem-key-0010');

    await service.reconcile(payment.id);

    const seat = [...db.enrollments.values()][0];
    expect(seat?.['status']).toBe('ACTIVE');
    expect([...db.payments.values()][0]?.['settledAt']).toBeInstanceOf(Date);
  });

  it('does not grant a seat when the payer declines', async () => {
    const adapter = fakeAdapter({
      status: vi.fn(async () => ({
        status: 'FAILED' as const,
        failureReason: 'The payer rejected the prompt.',
        raw: {},
      })),
    });
    const { service, db } = makeService(adapter);
    const { payment } = await service.checkout(USER_ID, checkoutBody, 'idem-key-0011');

    await service.reconcile(payment.id);

    expect([...db.enrollments.values()][0]?.['status']).toBe('PENDING_PAYMENT');
    expect([...db.payments.values()][0]?.['status']).toBe('FAILED');
  });

  /**
   * The property that makes a replayed or spoofed provider message harmless:
   * a terminal payment never moves again, and the attempt is still recorded.
   */
  it('rejects a late transition after a terminal state, but still records it', async () => {
    const { service, db } = makeService();
    const { payment } = await service.checkout(USER_ID, checkoutBody, 'idem-key-0012');
    await service.reconcile(payment.id);

    await service.recordEvent(payment.id, 'CALLBACK', 'FAILED', { replayed: true });

    expect([...db.payments.values()][0]?.['status']).toBe('SUCCESSFUL');
    const rejected = db.events.filter((e) => e['outcome'] === 'REJECT');
    expect(rejected).toHaveLength(1);
  });

  it('stops polling once the payment is terminal', async () => {
    const { service, adapter } = makeService();
    const { payment } = await service.checkout(USER_ID, checkoutBody, 'idem-key-0013');

    await service.reconcile(payment.id);
    await service.reconcile(payment.id);

    expect(adapter.status).toHaveBeenCalledTimes(1);
  });
});

describe('PaymentsService.noteCallback', () => {
  it('records the callback without letting it change the payment status', async () => {
    const { service, db } = makeService();
    const { payment } = await service.checkout(USER_ID, checkoutBody, 'idem-key-0020');

    const id = await service.noteCallback({ referenceId: 'fake-ref-1', status: 'SUCCESSFUL' });

    expect(id).toBe(payment.id);
    // The callback claimed success; the payment is still PENDING until a poll
    // proves it. This is the whole point of not trusting callbacks.
    expect([...db.payments.values()][0]?.['status']).toBe('PENDING');
    expect([...db.enrollments.values()][0]?.['status']).toBe('PENDING_PAYMENT');
  });

  it('ignores a callback for a reference it never issued', async () => {
    const { service } = makeService();
    expect(await service.noteCallback({ referenceId: 'not-ours' })).toBeNull();
  });
});
