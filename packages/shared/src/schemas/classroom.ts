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

export const catalogQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  hostId: uuidSchema.optional(),
  maxPriceMinor: amountMinorSchema.optional(),
});
export type CatalogQuery = z.infer<typeof catalogQuerySchema>;
