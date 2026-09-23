import { z } from 'zod';
import {
  amountMinorSchema,
  classSessionStatusSchema,
  classroomStatusSchema,
  currencySchema,
  enrollmentStatusSchema,
  isoDateTimeSchema,
  uuidSchema,
} from './common.js';

/**
 * A Classroom is the offering a host publishes and prices. A ClassSession is
 * one scheduled occurrence of it. They are separate because replays are sold
 * per session, so a session needs its own identity and price.
 */

export const createClassroomSchema = z.object({
  title: z.string().trim().min(4).max(120),
  description: z.string().trim().min(20).max(4000),
  priceMinor: amountMinorSchema,
  currency: currencySchema.default('ZMW'),
  /** Set only for an organisation-owned class; a solo host leaves it off. */
  subCourseId: uuidSchema.optional(),
  /**
   * The lecture model fans out one publisher to many subscribers, so the ceiling
   * is a product decision rather than a media constraint. 500 is well inside
   * what the SFU handles.
   */
  capacity: z.int().min(1).max(500).default(100),
  coverImageUrl: z.url().max(2048).optional(),
});
export type CreateClassroomRequest = z.input<typeof createClassroomSchema>;

export const updateClassroomSchema = createClassroomSchema.partial();
export type UpdateClassroomRequest = z.input<typeof updateClassroomSchema>;

export const classroomSchema = z.object({
  id: uuidSchema,
  hostId: uuidSchema,
  hostDisplayName: z.string(),
  subCourseId: uuidSchema.nullable(),
  /** Denormalized for display, so a catalog card needs no second request. */
  subCourseName: z.string().nullable(),
  organisationName: z.string().nullable(),
  title: z.string(),
  description: z.string(),
  priceMinor: z.int(),
  currency: currencySchema,
  capacity: z.int(),
  coverImageUrl: z.string().nullable(),
  status: classroomStatusSchema,
  enrolledCount: z.int(),
  createdAt: isoDateTimeSchema,
});
export type Classroom = z.infer<typeof classroomSchema>;

/**
 * Sessions are created with a start and end rather than a duration so a host
 * scheduling across a DST-free timezone still gets an unambiguous window.
 */
export const createSessionSchema = z
  .object({
    startsAt: isoDateTimeSchema,
    endsAt: isoDateTimeSchema,
    title: z.string().trim().min(3).max(120).optional(),
  })
  .refine((v) => new Date(v.endsAt) > new Date(v.startsAt), {
    message: 'A session must end after it starts.',
    path: ['endsAt'],
  })
  .refine(
    (v) =>
      new Date(v.endsAt).getTime() - new Date(v.startsAt).getTime() <=
      8 * 60 * 60 * 1000,
    { message: 'A session cannot run longer than 8 hours.', path: ['endsAt'] },
  );
export type CreateSessionRequest = z.infer<typeof createSessionSchema>;

/**
 * Rescheduling. Deliberately not `createSessionSchema.partial()`: the create
 * schema's cross-field checks (ends-after-starts, max 8 hours) cannot run
 * when only one of the two is being sent, so they are re-applied server-side
 * against the merged result instead.
 */
export const updateSessionSchema = z.object({
  startsAt: isoDateTimeSchema.optional(),
  endsAt: isoDateTimeSchema.optional(),
  title: z.string().trim().min(3).max(120).nullable().optional(),
});
export type UpdateSessionRequest = z.infer<typeof updateSessionSchema>;

export const classSessionSchema = z.object({
  id: uuidSchema,
  classroomId: uuidSchema,
  title: z.string().nullable(),
  startsAt: isoDateTimeSchema,
  endsAt: isoDateTimeSchema,
  status: classSessionStatusSchema,
  /** Present only for callers entitled to join — it is not a secret, but it is not public either. */
  livekitRoom: z.string().nullable(),
  recordingId: uuidSchema.nullable(),
});
export type ClassSession = z.infer<typeof classSessionSchema>;

export const enrollmentSchema = z.object({
  id: uuidSchema,
  classroomId: uuidSchema,
  userId: uuidSchema,
  status: enrollmentStatusSchema,
  createdAt: isoDateTimeSchema,
});
export type Enrollment = z.infer<typeof enrollmentSchema>;

/**
 * One row of "My Classes". The next upcoming session travels with the
 * enrollment so the dashboard can render a countdown and a Join button
 * without a follow-up request per class.
 */
export const enrolledClassSchema = z.object({
  enrollment: enrollmentSchema,
  classroom: classroomSchema,
  nextSession: classSessionSchema.nullable(),
});
export type EnrolledClass = z.infer<typeof enrolledClassSchema>;

export const catalogQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  hostId: uuidSchema.optional(),
  maxPriceMinor: amountMinorSchema.optional(),
});
export type CatalogQuery = z.infer<typeof catalogQuerySchema>;
