import { z } from 'zod';
import { isoDateTimeSchema, participantRoleSchema, uuidSchema } from './common.js';

/**
 * Everything that happens inside a live room.
 *
 * Chat and hand-raising travel over LiveKit's own data channels rather than a
 * second WebSocket: students are granted `canPublishData` even though they
 * cannot publish media, which is enough to carry these messages. The API is
 * involved only where authority is required — minting a join token and changing
 * a participant's publish permission.
 */

export const joinTokenResponseSchema = z.object({
  token: z.string(),
  /** wss:// URL of the LiveKit deployment the client should dial. */
  serverUrl: z.url(),
  room: z.string(),
  identity: z.string(),
  role: participantRoleSchema,
  canPublish: z.boolean(),
  expiresAt: isoDateTimeSchema,
});
export type JoinTokenResponse = z.infer<typeof joinTokenResponseSchema>;

export const promoteParticipantSchema = z.object({
  identity: z.string().min(1).max(200),
  /** Also allows revoking: the host demotes a speaker by sending false. */
  canPublish: z.boolean(),
});
export type PromoteParticipantRequest = z.infer<typeof promoteParticipantSchema>;

/**
 * Data-channel payloads, as a discriminated union. The receiving client parses
 * untrusted bytes from other participants with this schema, so a malformed or
 * hostile message is rejected before it can reach the UI.
 */
export const chatMessageSchema = z.object({
  kind: z.literal('chat'),
  id: uuidSchema,
  body: z.string().trim().min(1).max(2000),
  sentAt: isoDateTimeSchema,
});

export const handRaiseSchema = z.object({
  kind: z.literal('hand'),
  raised: z.boolean(),
  at: isoDateTimeSchema,
});

export const reactionSchema = z.object({
  kind: z.literal('reaction'),
  emoji: z.enum(['👍', '👏', '❓', '🎉']),
  at: isoDateTimeSchema,
});

export const roomDataMessageSchema = z.discriminatedUnion('kind', [
  chatMessageSchema,
  handRaiseSchema,
  reactionSchema,
]);
export type RoomDataMessage = z.infer<typeof roomDataMessageSchema>;
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const sessionParticipantSchema = z.object({
  identity: z.string(),
  userId: uuidSchema,
  displayName: z.string(),
  role: participantRoleSchema,
  canPublish: z.boolean(),
  handRaisedAt: isoDateTimeSchema.nullable(),
  joinedAt: isoDateTimeSchema,
});
export type SessionParticipant = z.infer<typeof sessionParticipantSchema>;
