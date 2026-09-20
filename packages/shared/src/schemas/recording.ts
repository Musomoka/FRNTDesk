import { z } from 'zod';
import {
  amountMinorSchema,
  currencySchema,
  isoDateTimeSchema,
  recordingStatusSchema,
  uuidSchema,
} from './common.js';

export const recordingSchema = z.object({
  id: uuidSchema,
  classSessionId: uuidSchema,
  classroomId: uuidSchema,
  classroomTitle: z.string(),
  status: recordingStatusSchema,
  durationSec: z.int().nullable(),
  /** Set only when the caller already has access; otherwise null. */
  playbackUrl: z.url().nullable(),
  /** Null means the replay is not sold separately — enrolment is the only way in. */
  priceMinor: z.int().nullable(),
  currency: currencySchema,
  recordedAt: isoDateTimeSchema,
});
export type Recording = z.infer<typeof recordingSchema>;

/**
 * Hosts price a replay after the fact, once they know the session was worth
 * selling. Omitting the price withdraws it from sale without deleting it.
 */
export const priceRecordingSchema = z.object({
  priceMinor: amountMinorSchema.nullable(),
});
export type PriceRecordingRequest = z.infer<typeof priceRecordingSchema>;
