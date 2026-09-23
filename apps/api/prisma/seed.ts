import { config } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

config({ path: ['../../.env', '.env'], quiet: true });

/**
 * Development seed. Idempotent — safe to run repeatedly against the same
 * database, so it can be used to top up a local environment rather than only
 * to fill an empty one.
 *
 * Seeded users have no credentials of their own — identity is Auth0's job.
 * These rows exist with `auth0Sub: null`, and get claimed automatically the
 * first time someone logs in via Auth0 Universal Login using the matching
 * email (see apps/api/src/auth/auth.service.ts's `syncUser` — it links by
 * email whenever `auth0Sub` is still null). To use the seeded "host" demo
 * data locally, sign up in Auth0 with `host@frntdesk.local`.
 */
async function main(): Promise<void> {
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error('Refusing to seed a production database.');
  }

  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) throw new Error('DATABASE_URL is not set.');

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  const host = await prisma.user.upsert({
    where: { email: 'host@frntdesk.local' },
    update: {},
    create: {
      email: 'host@frntdesk.local',
      displayName: 'Chanda Mwale',
      phoneE164: '+260966123456',
      // Pre-verified so the seeded classrooms are publish-able without also
      // needing to drive Auth0's own email-verification flow locally.
      emailVerifiedAt: new Date(),
    },
  });

  const student = await prisma.user.upsert({
    where: { email: 'student@frntdesk.local' },
    update: {},
    create: {
      email: 'student@frntdesk.local',
      displayName: 'Mutale Banda',
      phoneE164: '+260977123456',
      emailVerifiedAt: new Date(),
    },
  });

  // A demo business and a demo school, each with two sub-courses, to exercise
  // the organisation-owned side of the catalog alongside the solo-host classes below.
  const business = await prisma.organisation.upsert({
    where: { id: '00000000-0000-4000-8000-000000000101' },
    update: {},
    create: {
      id: '00000000-0000-4000-8000-000000000101',
      name: 'Kwacha Traders Ltd',
      type: 'BUSINESS',
    },
  });

  const school = await prisma.organisation.upsert({
    where: { id: '00000000-0000-4000-8000-000000000102' },
    update: {},
    create: {
      id: '00000000-0000-4000-8000-000000000102',
      name: 'Lusaka Secondary School',
      type: 'SCHOOL',
    },
  });

  await prisma.organisationMembership.upsert({
    where: { organisationId_userId: { organisationId: business.id, userId: host.id } },
    update: {},
    create: { organisationId: business.id, userId: host.id, role: 'ADMIN' },
  });

  const [finance, hr, grade10, maths] = await Promise.all([
    prisma.subCourse.upsert({
      where: { id: '00000000-0000-4000-8000-000000000201' },
      update: {},
      create: {
        id: '00000000-0000-4000-8000-000000000201',
        organisationId: business.id,
        name: 'Finance Team',
        description: 'Internal training for the finance department.',
      },
    }),
    prisma.subCourse.upsert({
      where: { id: '00000000-0000-4000-8000-000000000202' },
      update: {},
      create: {
        id: '00000000-0000-4000-8000-000000000202',
        organisationId: business.id,
        name: 'HR',
        description: 'Internal training for the HR department.',
      },
    }),
    prisma.subCourse.upsert({
      where: { id: '00000000-0000-4000-8000-000000000203' },
      update: {},
      create: {
        id: '00000000-0000-4000-8000-000000000203',
        organisationId: school.id,
        name: 'Grade 10',
        description: 'All Grade 10 classes.',
      },
    }),
    prisma.subCourse.upsert({
      where: { id: '00000000-0000-4000-8000-000000000204' },
      update: {},
      create: {
        id: '00000000-0000-4000-8000-000000000204',
        organisationId: school.id,
        name: 'Mathematics',
        description: 'Mathematics classes across grades.',
      },
    }),
  ]);

  // A published, priced class with one upcoming session — belongs to the
  // Finance Team sub-course, to exercise an organisation-owned classroom
  // alongside the fully solo-hosted one below.
  const classroom = await prisma.classroom.upsert({
    where: { id: '00000000-0000-4000-8000-000000000001' },
    update: { subCourseId: finance.id },
    create: {
      id: '00000000-0000-4000-8000-000000000001',
      hostId: host.id,
      subCourseId: finance.id,
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

  // An ACTIVE seat is the only thing that mints a join token, so without this
  // there is no way to open the live room as a student locally — the host
  // would be talking to an empty room.
  await prisma.enrollment.upsert({
    where: { classroomId_userId: { classroomId: classroom.id, userId: student.id } },
    update: { status: 'ACTIVE', activatedAt: new Date() },
    create: {
      classroomId: classroom.id,
      userId: student.id,
      status: 'ACTIVE',
      activatedAt: new Date(),
    },
  });

  console.log('Seeded:');
  console.log(`  host    host@frntdesk.local    — not yet linked to Auth0 (${host.id})`);
  console.log(`  student student@frntdesk.local — not yet linked to Auth0 (${student.id})`);
  console.log('  Sign up in Auth0 Universal Login with either email to claim that row.');
  console.log('  2 published classrooms, 1 upcoming session');
  console.log(
    `  2 organisations (${business.name}, ${school.name}), 4 sub-courses (${finance.name}, ${hr.name}, ${grade10.name}, ${maths.name})`,
  );
  console.log(`  "${classroom.title}" now belongs to the ${finance.name} sub-course`);
  console.log(`  ${student.email} holds an ACTIVE seat in it — enough to join the live room`);

  await prisma.$disconnect();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
