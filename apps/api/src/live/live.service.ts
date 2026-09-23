import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EgressStatus,
  EncodedFileOutput,
  EncodedFileType,
  S3Upload,
  TrackSource,
  type EgressInfo,
} from '@livekit/protocol';
import { AccessToken, EgressClient, RoomServiceClient, WebhookReceiver } from 'livekit-server-sdk';
import type {
  JoinTokenResponse,
  ParticipantRole,
  PromoteParticipantRequest,
  RecordingControlResponse,
  SessionParticipant,
} from '@frntdesk/shared';
import type { Env } from '../config/env.schema.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RecordingsService } from '../recordings/recordings.service.js';

/**
 * What a publisher may send. The host adds screen share (and its audio, so
 * playing a video in the shared window carries sound); everyone else who can
 * publish is limited to their own camera and microphone.
 */
function publishableSources(isHost: boolean): TrackSource[] {
  const base = [TrackSource.CAMERA, TrackSource.MICROPHONE];
  return isHost
    ? [...base, TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO]
    : base;
}

/** `15m` / `24h` / `30d` as the env schema validates it, in seconds for the SDK. */
function durationToSeconds(value: string): number {
  const amount = Number(value.slice(0, -1));
  const unit = value.slice(-1);
  const multiplier = unit === 's' ? 1 : unit === 'm' ? 60 : unit === 'h' ? 3600 : 86_400;
  return amount * multiplier;
}

/** Our four-state model is coarser than LiveKit's seven — ENDING collapses
 *  into ACTIVE, and anything that isn't a clean COMPLETE reads as FAILED. */
function mapEgressStatus(status: EgressStatus): 'STARTING' | 'ACTIVE' | 'COMPLETE' | 'FAILED' {
  switch (status) {
    case EgressStatus.EGRESS_STARTING:
      return 'STARTING';
    case EgressStatus.EGRESS_ACTIVE:
    case EgressStatus.EGRESS_ENDING:
      return 'ACTIVE';
    case EgressStatus.EGRESS_COMPLETE:
      return 'COMPLETE';
    default:
      return 'FAILED';
  }
}

/**
 * What a `egress_started` / `egress_updated` / `egress_ended` webhook becomes
 * in the `Recording` row. Pure so the mapping is testable without a signed
 * webhook body — `handleWebhook` is the only caller that needs one of those.
 */
export function mapEgressToRecordingUpdate(info: EgressInfo): {
  status: 'STARTING' | 'ACTIVE' | 'COMPLETE' | 'FAILED';
  completedAt: Date | null;
  storageKey: string | null;
  durationSec: number | null;
  sizeBytes: bigint | null;
  failureReason: string | null;
} {
  const status = mapEgressStatus(info.status);
  if (status !== 'COMPLETE' && status !== 'FAILED') {
    return {
      status,
      completedAt: null,
      storageKey: null,
      durationSec: null,
      sizeBytes: null,
      failureReason: null,
    };
  }

  const file = info.fileResults[0];
  return {
    status,
    completedAt: new Date(),
    storageKey: file?.filename ?? null,
    durationSec: file ? Number(file.duration / 1_000_000_000n) : null,
    sizeBytes: file?.size ?? null,
    failureReason: status === 'FAILED' ? info.error || 'Recording failed.' : null,
  };
}

@Injectable()
export class LiveService {
  private readonly logger = new Logger(LiveService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly recordings: RecordingsService,
  ) {}

  /**
   * Mints a join token.
   *
   * The authority chain matters here: an ACTIVE enrollment (or being the
   * host) is the only thing that produces a token, and the token itself
   * carries the publish permission — a student gets `canPublish: false` but
   * `canPublishData: true`, which is what lets chat and hand-raising travel
   * over LiveKit's data channels without a second WebSocket of our own.
   */
  async joinToken(sessionId: string, userId: string): Promise<JoinTokenResponse> {
    const { apiKey, apiSecret, serverUrl } = this.requireConfig();

    const session = await this.prisma.classSession.findUnique({
      where: { id: sessionId },
      include: {
        classroom: { select: { id: true, hostId: true } },
      },
    });
    if (!session) throw new NotFoundException('Session not found.');
    if (session.status === 'CANCELLED' || session.status === 'ENDED') {
      throw new ForbiddenException('That session is over.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true },
    });
    if (!user) throw new NotFoundException('User not found.');

    const isHost = session.classroom.hostId === userId;
    if (!isHost) {
      const seat = await this.prisma.enrollment.count({
        where: { classroomId: session.classroomId, userId, status: 'ACTIVE' },
      });
      if (seat === 0) {
        throw new ForbiddenException('You need an active enrollment to join this session.');
      }
    }

    // Stable across rejoins, so a reconnect replaces the old participant
    // rather than appearing twice in the room.
    const identity = `user-${userId}`;
    const role: ParticipantRole = isHost ? 'HOST' : 'STUDENT';

    const existing = await this.prisma.classParticipant.findUnique({
      where: { classSessionId_userId: { classSessionId: sessionId, userId } },
      select: { canPublish: true, role: true },
    });
    // A student promoted to speak earlier in the session keeps that right
    // across a reconnect — losing it on a dropped call would be its own bug.
    const canPublish = isHost || existing?.canPublish === true;

    const ttlSeconds = durationToSeconds(this.config.get('LIVEKIT_TOKEN_TTL', { infer: true }));
    const token = new AccessToken(apiKey, apiSecret, {
      identity,
      name: user.displayName,
      ttl: ttlSeconds,
    });
    token.addGrant({
      roomJoin: true,
      room: session.livekitRoom,
      canPublish,
      canSubscribe: true,
      canPublishData: true,
      // Screen sharing is the host's alone. A student promoted to speak gets
      // camera and microphone only — enforced in the token rather than by
      // hiding a button, so it holds even against a hand-built client.
      ...(canPublish ? { canPublishSources: publishableSources(isHost) } : {}),
    });

    await this.prisma.classParticipant.upsert({
      where: { classSessionId_userId: { classSessionId: sessionId, userId } },
      update: { identity, role, canPublish, leftAt: null },
      create: { classSessionId: sessionId, userId, identity, role, canPublish },
    });

    // The host arriving is what takes a session live — no separate "start"
    // button to forget to press.
    if (isHost && session.status === 'SCHEDULED') {
      await this.prisma.classSession.update({
        where: { id: sessionId },
        data: { status: 'LIVE', startedAt: new Date() },
      });
    }

    const recording = await this.prisma.recording.findUnique({
      where: { classSessionId: sessionId },
      select: { status: true },
    });

    return {
      token: await token.toJwt(),
      serverUrl,
      room: session.livekitRoom,
      identity,
      role,
      canPublish,
      expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
      recordingEnabled: this.recordings.isCaptureConfigured(),
      recordingActive: recording?.status === 'STARTING' || recording?.status === 'ACTIVE',
    };
  }

  async participants(sessionId: string, viewerId: string): Promise<SessionParticipant[]> {
    await this.requireHostOrEnrolled(sessionId, viewerId);

    const rows = await this.prisma.classParticipant.findMany({
      where: { classSessionId: sessionId, leftAt: null },
      include: { user: { select: { displayName: true } } },
      orderBy: { joinedAt: 'asc' },
    });

    return rows.map((row) => ({
      identity: row.identity,
      userId: row.userId,
      displayName: row.user.displayName,
      role: row.role as ParticipantRole,
      canPublish: row.canPublish,
      handRaisedAt: row.handRaisedAt ? row.handRaisedAt.toISOString() : null,
      joinedAt: row.joinedAt.toISOString(),
    }));
  }

  /**
   * The host letting a student speak (or taking it back). Updates LiveKit's
   * own view of the participant as well as ours — changing only our row would
   * leave the student still muted by the SFU until they reconnected.
   */
  async promote(
    sessionId: string,
    hostId: string,
    body: PromoteParticipantRequest,
  ): Promise<SessionParticipant[]> {
    const { apiKey, apiSecret, serverUrl } = this.requireConfig();

    const session = await this.prisma.classSession.findUnique({
      where: { id: sessionId },
      include: { classroom: { select: { hostId: true } } },
    });
    if (!session) throw new NotFoundException('Session not found.');
    if (session.classroom.hostId !== hostId) {
      throw new ForbiddenException('Only the host can change who may speak.');
    }

    const participant = await this.prisma.classParticipant.findFirst({
      where: { classSessionId: sessionId, identity: body.identity },
    });
    if (!participant) throw new NotFoundException('That participant is not in this session.');

    const rooms = new RoomServiceClient(serverUrl.replace(/^ws/, 'http'), apiKey, apiSecret);
    try {
      await rooms.updateParticipant(session.livekitRoom, body.identity, undefined, {
        canPublish: body.canPublish,
        canSubscribe: true,
        canPublishData: true,
        // Same restriction as the join token: being given the floor means
        // camera and microphone, never the host's screen share.
        canPublishSources: publishableSources(false),
      });
    } catch (error) {
      // Our row is still the source of truth for the next join, so a
      // participant who has already dropped is not an error worth failing on.
      this.logger.warn(`Could not update ${body.identity} in LiveKit`, error);
    }

    await this.prisma.classParticipant.update({
      where: { id: participant.id },
      data: {
        canPublish: body.canPublish,
        role: body.canPublish ? 'CO_HOST' : 'STUDENT',
        // Granting the floor answers the raised hand.
        ...(body.canPublish ? { handRaisedAt: null } : {}),
      },
    });

    return this.participants(sessionId, hostId);
  }

  /** The host ending the session, which is also what stops any recording. */
  async end(sessionId: string, hostId: string): Promise<void> {
    const session = await this.prisma.classSession.findUnique({
      where: { id: sessionId },
      include: { classroom: { select: { hostId: true } } },
    });
    if (!session) throw new NotFoundException('Session not found.');
    if (session.classroom.hostId !== hostId) {
      throw new ForbiddenException('Only the host can end this session.');
    }

    await this.prisma.classSession.update({
      where: { id: sessionId },
      data: { status: 'ENDED', endedAt: new Date() },
    });

    const { apiKey, apiSecret, serverUrl } = this.requireConfig();
    const rooms = new RoomServiceClient(serverUrl.replace(/^ws/, 'http'), apiKey, apiSecret);
    try {
      await rooms.deleteRoom(session.livekitRoom);
    } catch (error) {
      this.logger.warn(`Could not close room ${session.livekitRoom}`, error);
    }
  }

  /**
   * Starts capturing the room to S3 via LiveKit's room-composite egress.
   *
   * One recording per session (the schema enforces it), so this is a no-op
   * error rather than a queue: a session already being captured, or already
   * captured once, refuses a second start rather than silently doing nothing
   * or clobbering the earlier attempt. A prior FAILED attempt is the one
   * exception — that row is reused rather than left as permanent dead weight.
   */
  async startRecording(sessionId: string, hostId: string): Promise<RecordingControlResponse> {
    this.recordings.assertCaptureConfigured();
    const { apiKey, apiSecret, serverUrl } = this.requireConfig();

    const session = await this.requireLiveSessionForHost(sessionId, hostId, 'record');

    const existing = await this.prisma.recording.findUnique({
      where: { classSessionId: sessionId },
      select: { status: true },
    });
    if (existing?.status === 'STARTING' || existing?.status === 'ACTIVE') {
      throw new ConflictException('Recording is already in progress.');
    }
    if (existing?.status === 'COMPLETE') {
      throw new ConflictException('This session has already been recorded.');
    }

    const output = new EncodedFileOutput({
      fileType: EncodedFileType.MP4,
      filepath: 'recordings/{room_name}-{time}.mp4',
      output: {
        case: 's3',
        value: new S3Upload({
          accessKey: this.config.get('S3_ACCESS_KEY', { infer: true }) ?? '',
          secret: this.config.get('S3_SECRET_KEY', { infer: true }) ?? '',
          bucket: this.config.get('S3_BUCKET', { infer: true }) ?? '',
          region: this.config.get('S3_REGION', { infer: true }),
          endpoint: this.config.get('S3_ENDPOINT', { infer: true }) ?? '',
          forcePathStyle: !!this.config.get('S3_ENDPOINT', { infer: true }),
        }),
      },
    });

    const egress = new EgressClient(serverUrl.replace(/^ws/, 'http'), apiKey, apiSecret);
    const info = await egress.startRoomCompositeEgress(session.livekitRoom, output, {
      layout: 'speaker',
    });

    const recording = await this.prisma.recording.upsert({
      where: { classSessionId: sessionId },
      create: { classSessionId: sessionId, egressId: info.egressId, status: 'STARTING' },
      update: {
        egressId: info.egressId,
        status: 'STARTING',
        failureReason: null,
        completedAt: null,
        recordedAt: new Date(),
      },
    });

    return { id: recording.id, status: recording.status };
  }

  /** Stops capture; the final status and storage key land via the `egress_ended` webhook. */
  async stopRecording(sessionId: string, hostId: string): Promise<RecordingControlResponse> {
    const { apiKey, apiSecret, serverUrl } = this.requireConfig();
    await this.requireLiveSessionForHost(sessionId, hostId, 'stop the recording for');

    const recording = await this.prisma.recording.findUnique({ where: { classSessionId: sessionId } });
    if (
      !recording?.egressId ||
      (recording.status !== 'STARTING' && recording.status !== 'ACTIVE')
    ) {
      throw new ConflictException('No recording is in progress.');
    }

    const egress = new EgressClient(serverUrl.replace(/^ws/, 'http'), apiKey, apiSecret);
    await egress.stopEgress(recording.egressId);

    return { id: recording.id, status: recording.status };
  }

  private async requireLiveSessionForHost(sessionId: string, hostId: string, verb: string) {
    const session = await this.prisma.classSession.findUnique({
      where: { id: sessionId },
      include: { classroom: { select: { hostId: true } } },
    });
    if (!session) throw new NotFoundException('Session not found.');
    if (session.classroom.hostId !== hostId) {
      throw new ForbiddenException(`Only the host can ${verb} this session.`);
    }
    if (session.status !== 'LIVE') {
      throw new ConflictException('The session must be live to do that.');
    }
    return session;
  }

  /**
   * LiveKit's own webhook, verified against the API secret it is signed with.
   * `room_finished` is the authoritative "everyone left" signal — more
   * reliable than trusting the last client to tell us it closed the tab.
   * Egress events keep a `Recording` row's status and file details in step
   * with what LiveKit is actually doing, from the moment capture starts to
   * the moment the file lands in S3 (or fails to).
   */
  async handleWebhook(body: string, authorization: string): Promise<void> {
    const { apiKey, apiSecret } = this.requireConfig();
    const receiver = new WebhookReceiver(apiKey, apiSecret);

    const event = await receiver.receive(body, authorization);

    if (event.event === 'room_finished' && event.room?.name) {
      await this.handleRoomFinished(event.room.name);
      return;
    }

    const egressEvents = ['egress_started', 'egress_updated', 'egress_ended'];
    if (egressEvents.includes(event.event) && event.egressInfo) {
      await this.handleEgressUpdate(event.egressInfo);
    }
  }

  private async handleRoomFinished(roomName: string): Promise<void> {
    const session = await this.prisma.classSession.findUnique({
      where: { livekitRoom: roomName },
      select: { id: true, status: true },
    });
    if (!session || session.status === 'ENDED') return;

    await this.prisma.$transaction([
      this.prisma.classSession.update({
        where: { id: session.id },
        data: { status: 'ENDED', endedAt: new Date() },
      }),
      this.prisma.classParticipant.updateMany({
        where: { classSessionId: session.id, leftAt: null },
        data: { leftAt: new Date() },
      }),
    ]);

    this.logger.log(`Session ${session.id} ended via LiveKit webhook.`);
  }

  /**
   * `updateMany` rather than `update`: an `egress_started` webhook can beat
   * our own write of the just-minted `egressId` back to the database, and a
   * webhook for a row that doesn't exist yet should be a no-op, not a crash.
   */
  private async handleEgressUpdate(info: EgressInfo): Promise<void> {
    const data = mapEgressToRecordingUpdate(info);
    const { count } = await this.prisma.recording.updateMany({
      where: { egressId: info.egressId },
      data,
    });
    if (count === 0) {
      this.logger.warn(`Egress webhook for unknown egress ${info.egressId}`);
    }
  }

  private async requireHostOrEnrolled(sessionId: string, userId: string): Promise<void> {
    const session = await this.prisma.classSession.findUnique({
      where: { id: sessionId },
      select: { classroomId: true, classroom: { select: { hostId: true } } },
    });
    if (!session) throw new NotFoundException('Session not found.');
    if (session.classroom.hostId === userId) return;

    const seat = await this.prisma.enrollment.count({
      where: { classroomId: session.classroomId, userId, status: 'ACTIVE' },
    });
    if (seat === 0) throw new ForbiddenException('You are not part of this session.');
  }

  /**
   * Fails loudly and specifically when LiveKit is not configured. Without
   * this the SDK throws something opaque about a missing key deep inside a
   * join attempt, which is a miserable thing to debug from the frontend.
   */
  private requireConfig(): { apiKey: string; apiSecret: string; serverUrl: string } {
    const apiKey = this.config.get('LIVEKIT_API_KEY', { infer: true });
    const apiSecret = this.config.get('LIVEKIT_API_SECRET', { infer: true });
    const serverUrl = this.config.get('LIVEKIT_URL', { infer: true });

    if (!apiKey || !apiSecret || !serverUrl) {
      throw new ServiceUnavailableException(
        'Live video is not configured on this server (LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET).',
      );
    }
    return { apiKey, apiSecret, serverUrl };
  }
}
