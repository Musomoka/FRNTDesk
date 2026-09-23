import { ConflictException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { EgressStatus, type EgressInfo } from '@livekit/protocol';
import { LiveService, mapEgressToRecordingUpdate } from './live.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { RecordingsService } from '../recordings/recordings.service.js';

const SESSION_ID = 'session-1';
const HOST_ID = 'host-1';
const STUDENT_ID = 'student-1';

const { startRoomCompositeEgress, stopEgress } = vi.hoisted(() => ({
  startRoomCompositeEgress: vi.fn(),
  stopEgress: vi.fn(),
}));

vi.mock('livekit-server-sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('livekit-server-sdk')>();
  return {
    ...actual,
    EgressClient: vi.fn().mockImplementation(function EgressClient() {
      return { startRoomCompositeEgress, stopEgress };
    }),
  };
});

/** Decodes the `video` grant out of a minted LiveKit JWT. */
function grantOf(token: string): Record<string, unknown> {
  const payload = token.split('.')[1] ?? '';
  const json = Buffer.from(payload, 'base64url').toString('utf8');
  return (JSON.parse(json) as { video: Record<string, unknown> }).video;
}

function fakePrisma(
  options: {
    enrolled?: boolean;
    existingCanPublish?: boolean;
    sessionStatus?: string;
    recording?: { status: string; egressId?: string | null } | null;
  } = {},
) {
  const sessionUpdates: Record<string, unknown>[] = [];
  const participantWrites: Record<string, unknown>[] = [];
  const recordingUpserts: Record<string, unknown>[] = [];
  const recordingUpdateManyCalls: { where: Record<string, unknown>; data: Record<string, unknown> }[] = [];

  const recordingRow = options.recording
    ? { id: 'recording-1', egressId: null, ...options.recording }
    : null;

  const prisma = {
    classSession: {
      findUnique: async () => ({
        id: SESSION_ID,
        classroomId: 'classroom-1',
        status: options.sessionStatus ?? 'SCHEDULED',
        livekitRoom: 'class-abc-123',
        classroom: { id: 'classroom-1', hostId: HOST_ID },
      }),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        sessionUpdates.push(data);
        return data;
      },
    },
    user: {
      findUnique: async () => ({ displayName: 'Chanda Mwale' }),
    },
    enrollment: {
      count: async () => (options.enrolled ? 1 : 0),
    },
    classParticipant: {
      findUnique: async () =>
        options.existingCanPublish === undefined
          ? null
          : { canPublish: options.existingCanPublish, role: 'STUDENT' },
      upsert: async ({ update }: { update: Record<string, unknown> }) => {
        participantWrites.push(update);
        return update;
      },
    },
    recording: {
      findUnique: async () => recordingRow,
      upsert: async ({
        create,
        update,
      }: {
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => {
        const data = recordingRow ? update : create;
        recordingUpserts.push(data);
        return { id: 'recording-1', ...data };
      },
      updateMany: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        recordingUpdateManyCalls.push(args);
        return { count: recordingRow ? 1 : 0 };
      },
    },
  };

  return {
    prisma: prisma as unknown as PrismaService,
    sessionUpdates,
    participantWrites,
    recordingUpserts,
    recordingUpdateManyCalls,
  };
}

function makeService(
  db: ReturnType<typeof fakePrisma>,
  envOverrides: Record<string, string | boolean> = {},
) {
  const values: Record<string, string | boolean> = {
    LIVEKIT_API_KEY: 'devkey',
    LIVEKIT_API_SECRET: 'secret',
    LIVEKIT_URL: 'ws://localhost:7880',
    LIVEKIT_TOKEN_TTL: '15m',
    RECORDING_ENABLED: false,
    S3_BUCKET: 'frntdesk-recordings',
    S3_ACCESS_KEY: 'key',
    S3_SECRET_KEY: 'secret',
    S3_REGION: 'af-south-1',
    ...envOverrides,
  };
  const config = { get: (key: string) => values[key] } as unknown as ConfigService<never, true>;
  const recordings = new RecordingsService(db.prisma, config as never);
  return new LiveService(db.prisma, config as never, recordings);
}

describe('LiveService.joinToken', () => {
  let db: ReturnType<typeof fakePrisma>;

  beforeEach(() => {
    db = fakePrisma({ enrolled: true });
  });

  it('lets the host publish camera, microphone and screen share', async () => {
    const result = await makeService(db).joinToken(SESSION_ID, HOST_ID);
    const grant = grantOf(result.token);

    expect(grant['canPublish']).toBe(true);
    expect(grant['canPublishSources']).toEqual([
      'camera',
      'microphone',
      'screen_share',
      'screen_share_audio',
    ]);
    expect(result.role).toBe('HOST');
  });

  /**
   * The security property behind the whole feature: screen sharing is the
   * host's alone. A student who has been given the floor can speak and show
   * their face, and cannot put their desktop in front of the class — enforced
   * in the token, so hiding the button is not what is holding the line.
   */
  it('withholds screen share from a student promoted to speak', async () => {
    const promoted = fakePrisma({ enrolled: true, existingCanPublish: true });
    const result = await makeService(promoted).joinToken(SESSION_ID, STUDENT_ID);
    const grant = grantOf(result.token);

    expect(grant['canPublish']).toBe(true);
    expect(grant['canPublishSources']).toEqual(['camera', 'microphone']);
    expect(grant['canPublishSources']).not.toContain('screen_share');
  });

  it('gives an ordinary student no publish rights at all', async () => {
    const result = await makeService(db).joinToken(SESSION_ID, STUDENT_ID);
    const grant = grantOf(result.token);

    expect(grant['canPublish']).toBe(false);
    // Data is still allowed: chat and hand-raising ride the data channel.
    expect(grant['canPublishData']).toBe(true);
    expect(result.canPublish).toBe(false);
  });

  it('refuses someone with no active enrollment', async () => {
    const outsider = fakePrisma({ enrolled: false });
    await expect(
      makeService(outsider).joinToken(SESSION_ID, STUDENT_ID),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('takes the session live when the host arrives', async () => {
    await makeService(db).joinToken(SESSION_ID, HOST_ID);
    expect(db.sessionUpdates[0]).toMatchObject({ status: 'LIVE' });
  });

  it('does not take the session live merely because a student arrived', async () => {
    await makeService(db).joinToken(SESSION_ID, STUDENT_ID);
    expect(db.sessionUpdates).toHaveLength(0);
  });

  it('scopes the token to this session\'s room only', async () => {
    const result = await makeService(db).joinToken(SESSION_ID, HOST_ID);
    expect(grantOf(result.token)['room']).toBe('class-abc-123');
    expect(result.room).toBe('class-abc-123');
  });

  it('tells the client whether capture is configured and already running', async () => {
    const recording = fakePrisma({ enrolled: true, recording: { status: 'ACTIVE' } });
    const result = await makeService(recording, { RECORDING_ENABLED: true }).joinToken(
      SESSION_ID,
      HOST_ID,
    );
    expect(result.recordingEnabled).toBe(true);
    expect(result.recordingActive).toBe(true);
  });
});

describe('LiveService without LiveKit configured', () => {
  it('says so plainly instead of failing deep inside the SDK', async () => {
    const db = fakePrisma({ enrolled: true });
    const config = { get: () => undefined } as unknown as ConfigService<never, true>;
    const recordings = new RecordingsService(db.prisma, config as never);
    const service = new LiveService(db.prisma, config as never, recordings);

    await expect(service.joinToken(SESSION_ID, HOST_ID)).rejects.toThrow(/not configured/i);
  });
});

describe('LiveService.startRecording', () => {
  beforeEach(() => {
    startRoomCompositeEgress.mockReset().mockResolvedValue({ egressId: 'egress-1' });
    stopEgress.mockReset().mockResolvedValue({});
  });

  it('refuses when recording is switched off on this server', async () => {
    const db = fakePrisma({ sessionStatus: 'LIVE' });
    await expect(
      makeService(db, { RECORDING_ENABLED: false }).startRecording(SESSION_ID, HOST_ID),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('refuses a non-host', async () => {
    const db = fakePrisma({ sessionStatus: 'LIVE' });
    await expect(
      makeService(db, { RECORDING_ENABLED: true }).startRecording(SESSION_ID, STUDENT_ID),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses a session that is not live yet', async () => {
    const db = fakePrisma({ sessionStatus: 'SCHEDULED' });
    await expect(
      makeService(db, { RECORDING_ENABLED: true }).startRecording(SESSION_ID, HOST_ID),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses a second start while one is already running', async () => {
    const db = fakePrisma({ sessionStatus: 'LIVE', recording: { status: 'ACTIVE' } });
    await expect(
      makeService(db, { RECORDING_ENABLED: true }).startRecording(SESSION_ID, HOST_ID),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(startRoomCompositeEgress).not.toHaveBeenCalled();
  });

  it('refuses to record a session a second time', async () => {
    const db = fakePrisma({ sessionStatus: 'LIVE', recording: { status: 'COMPLETE' } });
    await expect(
      makeService(db, { RECORDING_ENABLED: true }).startRecording(SESSION_ID, HOST_ID),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('starts egress and stores the resulting egress id as STARTING', async () => {
    const db = fakePrisma({ sessionStatus: 'LIVE' });
    const result = await makeService(db, { RECORDING_ENABLED: true }).startRecording(
      SESSION_ID,
      HOST_ID,
    );

    expect(startRoomCompositeEgress).toHaveBeenCalledWith(
      'class-abc-123',
      expect.anything(),
      expect.objectContaining({ layout: 'speaker' }),
    );
    expect(result.status).toBe('STARTING');
    expect(db.recordingUpserts[0]).toMatchObject({ egressId: 'egress-1', status: 'STARTING' });
  });

  it('lets a previously failed attempt retry', async () => {
    const db = fakePrisma({ sessionStatus: 'LIVE', recording: { status: 'FAILED' } });
    const result = await makeService(db, { RECORDING_ENABLED: true }).startRecording(
      SESSION_ID,
      HOST_ID,
    );
    expect(result.status).toBe('STARTING');
  });
});

describe('LiveService.stopRecording', () => {
  beforeEach(() => {
    stopEgress.mockReset().mockResolvedValue({});
  });

  it('refuses when nothing is recording', async () => {
    const db = fakePrisma({ sessionStatus: 'LIVE' });
    await expect(
      makeService(db, { RECORDING_ENABLED: true }).stopRecording(SESSION_ID, HOST_ID),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('stops the egress for the session\'s recording', async () => {
    const db = fakePrisma({
      sessionStatus: 'LIVE',
      recording: { status: 'ACTIVE', egressId: 'egress-1' },
    });
    await makeService(db, { RECORDING_ENABLED: true }).stopRecording(SESSION_ID, HOST_ID);
    expect(stopEgress).toHaveBeenCalledWith('egress-1');
  });
});

describe('mapEgressToRecordingUpdate', () => {
  function fakeEgressInfo(overrides: Partial<EgressInfo>): EgressInfo {
    return { status: EgressStatus.EGRESS_ACTIVE, fileResults: [], error: '', ...overrides } as EgressInfo;
  }

  it('leaves file details untouched while capture is still running', () => {
    const update = mapEgressToRecordingUpdate(fakeEgressInfo({ status: EgressStatus.EGRESS_ACTIVE }));
    expect(update).toEqual({
      status: 'ACTIVE',
      completedAt: null,
      storageKey: null,
      durationSec: null,
      sizeBytes: null,
      failureReason: null,
    });
  });

  it('records the file details once capture completes', () => {
    const update = mapEgressToRecordingUpdate(
      fakeEgressInfo({
        status: EgressStatus.EGRESS_COMPLETE,
        fileResults: [
          {
            filename: 'recordings/class-abc-123-1700000000.mp4',
            duration: 90_000_000_000n,
            size: 12_345n,
          },
        ] as EgressInfo['fileResults'],
      }),
    );

    expect(update.status).toBe('COMPLETE');
    expect(update.storageKey).toBe('recordings/class-abc-123-1700000000.mp4');
    expect(update.durationSec).toBe(90);
    expect(update.sizeBytes).toBe(12_345n);
    expect(update.failureReason).toBeNull();
    expect(update.completedAt).toBeInstanceOf(Date);
  });

  it('carries the error through when capture fails', () => {
    const update = mapEgressToRecordingUpdate(
      fakeEgressInfo({ status: EgressStatus.EGRESS_FAILED, error: 'no space left on device' }),
    );
    expect(update.status).toBe('FAILED');
    expect(update.failureReason).toBe('no space left on device');
  });
});
