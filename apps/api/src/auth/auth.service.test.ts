import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';
import { AuthService } from './auth.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

interface FakeUserRow {
  id: string;
  email: string;
  auth0Sub: string | null;
  displayName: string;
  phoneE164: string | null;
  emailVerifiedAt: Date | null;
  createdAt: Date;
}

/**
 * A hand-rolled fake rather than a mocking library: AuthService only ever
 * calls three `prisma.user.*` methods, and a real in-memory table makes the
 * linking logic's branches (find-by-sub, find-by-email, create) exercise
 * actual read-your-writes behavior instead of pre-programmed return values.
 */
function fakePrisma(seedRows: FakeUserRow[] = []) {
  const rows = new Map(seedRows.map((r) => [r.id, { ...r }]));
  let nextId = 1;

  const user = {
    findUnique: async ({ where }: { where: { auth0Sub?: string | null; email?: string } }) => {
      for (const row of rows.values()) {
        if (where.auth0Sub !== undefined && row.auth0Sub === where.auth0Sub) return { ...row };
        if (where.email !== undefined && row.email === where.email) return { ...row };
      }
      return null;
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<FakeUserRow> }) => {
      const existing = rows.get(where.id);
      if (!existing) throw new Error('not found');
      const updated = { ...existing, ...data };
      rows.set(where.id, updated);
      return { ...updated };
    },
    create: async ({ data }: { data: Omit<FakeUserRow, 'id' | 'createdAt'> }) => {
      const row: FakeUserRow = { ...data, id: `generated-${nextId++}`, createdAt: new Date() };
      rows.set(row.id, row);
      return { ...row };
    },
  };

  return { prisma: { user } as unknown as PrismaService, rows };
}

const body = (overrides: Partial<{ email: string; displayName: string; emailVerified: boolean }> = {}) => ({
  email: 'user@frntdesk.local',
  displayName: 'A User',
  emailVerified: true,
  ...overrides,
});

describe('AuthService.syncUser', () => {
  let seedRow: FakeUserRow;

  beforeEach(() => {
    seedRow = {
      id: 'seed-1',
      email: 'host@frntdesk.local',
      auth0Sub: null,
      displayName: 'Chanda Mwale',
      phoneE164: '+260966123456',
      emailVerifiedAt: null,
      createdAt: new Date(),
    };
  });

  it('creates a new row when neither auth0Sub nor email is known', async () => {
    const { prisma, rows } = fakePrisma();
    const service = new AuthService(prisma);

    const profile = await service.syncUser('auth0|new-user', body({ email: 'new@frntdesk.local' }));

    expect(profile.email).toBe('new@frntdesk.local');
    expect(rows.size).toBe(1);
    expect([...rows.values()][0]?.auth0Sub).toBe('auth0|new-user');
  });

  it('links a seeded row by email when its auth0Sub is still null', async () => {
    const { prisma, rows } = fakePrisma([seedRow]);
    const service = new AuthService(prisma);

    const profile = await service.syncUser(
      'auth0|host-real-identity',
      body({ email: 'host@frntdesk.local', displayName: 'Chanda M.' }),
    );

    expect(profile.id).toBe('seed-1');
    expect(rows.get('seed-1')?.auth0Sub).toBe('auth0|host-real-identity');
    expect(rows.size).toBe(1); // linked, not duplicated
  });

  it('refuses to relink a row whose auth0Sub already belongs to a different identity', async () => {
    seedRow.auth0Sub = 'auth0|original-owner';
    const { prisma, rows } = fakePrisma([seedRow]);
    const service = new AuthService(prisma);

    await expect(
      service.syncUser('auth0|attacker-or-second-identity', body({ email: 'host@frntdesk.local' })),
    ).rejects.toThrow(ConflictException);

    // The original link must be untouched by the attempt.
    expect(rows.get('seed-1')?.auth0Sub).toBe('auth0|original-owner');
  });

  it('finds an already-linked row by its own auth0Sub on a repeat login', async () => {
    seedRow.auth0Sub = 'auth0|host-real-identity';
    const { prisma, rows } = fakePrisma([seedRow]);
    const service = new AuthService(prisma);

    const profile = await service.syncUser(
      'auth0|host-real-identity',
      body({ email: 'host@frntdesk.local', displayName: 'Updated Name' }),
    );

    expect(profile.id).toBe('seed-1');
    expect(profile.displayName).toBe('Updated Name');
    expect(rows.size).toBe(1);
  });

  it('sets emailVerifiedAt on first verified sync, and never unsets it on a later false claim', async () => {
    const { prisma } = fakePrisma();
    const service = new AuthService(prisma);

    const first = await service.syncUser('auth0|x', body({ emailVerified: true }));
    expect(first.emailVerifiedAt).not.toBeNull();

    const second = await service.syncUser('auth0|x', body({ emailVerified: false }));
    expect(second.emailVerifiedAt).toBe(first.emailVerifiedAt);
  });

  it('leaves emailVerifiedAt null when the token never claimed a verified email', async () => {
    const { prisma } = fakePrisma();
    const service = new AuthService(prisma);

    const profile = await service.syncUser('auth0|y', body({ emailVerified: false }));
    expect(profile.emailVerifiedAt).toBeNull();
  });
});

describe('AuthService.updateProfile', () => {
  let seedRow: FakeUserRow;

  beforeEach(() => {
    seedRow = {
      id: 'seed-1',
      email: 'host@frntdesk.local',
      auth0Sub: 'auth0|host-real-identity',
      displayName: 'Chanda Mwale',
      phoneE164: '+260966123456',
      emailVerifiedAt: new Date(),
      createdAt: new Date(),
    };
  });

  it('updates display name and phone on the row matching the caller auth0Sub', async () => {
    const { prisma, rows } = fakePrisma([seedRow]);
    const service = new AuthService(prisma);

    const profile = await service.updateProfile('auth0|host-real-identity', {
      displayName: 'Chanda M.',
      phone: '+260977654321',
    });

    expect(profile.displayName).toBe('Chanda M.');
    expect(profile.phoneE164).toBe('+260977654321');
    expect(rows.get('seed-1')?.displayName).toBe('Chanda M.');
  });

  it('clears the phone number when given an empty string', async () => {
    const { prisma, rows } = fakePrisma([seedRow]);
    const service = new AuthService(prisma);

    const profile = await service.updateProfile('auth0|host-real-identity', {
      displayName: 'Chanda Mwale',
      phone: '',
    });

    expect(profile.phoneE164).toBeNull();
    expect(rows.get('seed-1')?.phoneE164).toBeNull();
  });

  it('never touches email or verification state', async () => {
    const { prisma, rows } = fakePrisma([seedRow]);
    const service = new AuthService(prisma);

    await service.updateProfile('auth0|host-real-identity', {
      displayName: 'Chanda Mwale',
      phone: '',
    });

    expect(rows.get('seed-1')?.email).toBe('host@frntdesk.local');
    expect(rows.get('seed-1')?.emailVerifiedAt).toEqual(seedRow.emailVerifiedAt);
  });

  it('rejects a caller with no matching row rather than creating one', async () => {
    const { prisma, rows } = fakePrisma([seedRow]);
    const service = new AuthService(prisma);

    await expect(
      service.updateProfile('auth0|never-synced', { displayName: 'Someone', phone: '' }),
    ).rejects.toThrow(NotFoundException);
    expect(rows.size).toBe(1);
  });
});
