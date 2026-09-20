import { config } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';

config({ path: ['../../.env', '.env'], quiet: true });

/**
 * Development seed. Idempotent — safe to run repeatedly against the same
 * database, so it can be used to top up a local environment rather than only
 * to fill an empty one.
 *
 * Refuses to run against production: this creates accounts with known
 * passwords.
 */
async function main(): Promise<void> {
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error('Refusing to seed a production database.');
  }

  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) throw new Error('DATABASE_URL is not set.');

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const password = await argon2.hash('frntdesk-dev-password');

  const host = await prisma.user.upsert({
    where: { email: 'host@frntdesk.local' },
    update: {},
    create: {
      email: 'host@frntdesk.local',
      passwordHash: password,
      displayName: 'Chanda Mwale',
      phoneE164: '+260966123456',
      emailVerifiedAt: new Date(),
    },
  });

  const student = await prisma.user.upsert({
    where: { email: 'student@frntdesk.local' },
    update: {},
    create: {
      email: 'student@frntdesk.local',
      passwordHash: password,
      displayName: 'Mutale Banda',
      phoneE164: '+260977123456',
      emailVerifiedAt: new Date(),
    },
  });

  // A published, priced class with one upcoming session.
  const classroom = await prisma.classroom.upsert({
    where: { id: '00000000-0000-4000-8000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-4000-8000-000000000001',
      hostId: host.id,
      title: 'Introduction to Financial Modelling',
      description:
        'A four-week practical course covering cash flow forecasting, valuation basics, and building a three-statement model from scratch.',
      priceMinor: 15_000, // K150.00
      currency: 'ZMW',
      capacity: 200,
      status: 'PUBLISHED',
    },
  });

  const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await prisma.classSession.upsert({
    where: { livekitRoom: 'class-seed-session-1' },
    update: {},
    create: {
      classroomId: classroom.id,
      title: 'Week 1 — Cash flow fundamentals',
      startsAt,
      endsAt: new Date(startsAt.getTime() + 90 * 60 * 1000),
      livekitRoom: 'class-seed-session-1',
    },
  });

  // A free class, to exercise the zero-price enrolment path that skips checkout.
  await prisma.classroom.upsert({
    where: { id: '00000000-0000-4000-8000-000000000002' },
    update: {},
    create: {
      id: '00000000-0000-4000-8000-000000000002',
      hostId: host.id,
      title: 'Open Q&A: Starting a Business in Zambia',
      description:
        'A free monthly session answering questions on registration, tax, and finding early customers.',
      priceMinor: 0,
      currency: 'ZMW',
      capacity: 500,
      status: 'PUBLISHED',
    },
  });

  console.log('Seeded:');
  console.log(`  host    host@frntdesk.local    / frntdesk-dev-password  (${host.id})`);
  console.log(`  student student@frntdesk.local / frntdesk-dev-password  (${student.id})`);
  console.log(`  2 published classrooms, 1 upcoming session`);

  await prisma.$disconnect();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
