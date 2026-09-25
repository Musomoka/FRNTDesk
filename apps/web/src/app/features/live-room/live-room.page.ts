import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { firstValueFrom } from 'rxjs';
import {
  RemoteTrack,
  Room,
  RoomEvent,
  Track,
  type Participant,
  type RemoteParticipant,
} from 'livekit-client';
import {
  roomDataMessageSchema,
  type ChatMessage,
  type JoinTokenResponse,
  type RoomDataMessage,
} from '@frntdesk/shared';
import { LiveApi } from '../../core/api/live-api';

interface ChatEntry {
  id: string;
  from: string;
  body: string;
  sentAt: string;
}

/**
 * Which of the two video tracks goes on the main stage and which becomes the
 * inset.
 *
 * Screen share wins the main stage by default — it is what is being taught
 * from, and the camera is the supporting view (the "sub window" of a teacher
 * demonstrating an application). With only one track there is no inset at
 * all, so a single camera fills the stage exactly as it did before screen
 * sharing existed.
 *
 * Pure and generic so the decision can be tested without a LiveKit room.
 */
export function pickStageTracks<T>(
  screen: T | null,
  camera: T | null,
  swapped: boolean,
): { main: T | null; inset: T | null } {
  if (!screen || !camera) return { main: screen ?? camera, inset: null };
  return swapped ? { main: camera, inset: screen } : { main: screen, inset: camera };
}

/**
 * The live classroom.
 *
 * Chat and hand-raising travel over LiveKit's own data channels rather than a
 * second WebSocket of ours — students hold `canPublishData` even though they
 * cannot publish media. Everything arriving that way is parsed with the
 * shared schema before it reaches the UI, because it is bytes from another
 * participant, not from our server.
 */
@Component({
  selector: 'app-live-room-page',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <div class="room">
      @if (phase() === 'joining') {
        <div class="state"><mat-spinner diameter="36" /><p>Joining the room&hellip;</p></div>
      } @else if (phase() === 'error') {
        <div class="state error">
          <mat-icon>videocam_off</mat-icon>
          <p>{{ error() }}</p>
          <button mat-stroked-button (click)="leave()">Back</button>
        </div>
      } @else {
        <div class="stage">
          <video #mainStage class="video" autoplay playsinline [hidden]="!hasMain()"></video>

          <!-- The camera riding on top of the shared screen. Muted because
               audio arrives on its own track, never through this element. -->
          @if (showPip()) {
            <button
              type="button"
              class="pip"
              (click)="swapViews()"
              [title]="swapped() ? 'Show the shared screen' : 'Show the camera'"
            >
              <video #pipStage class="pip-video" autoplay playsinline muted></video>
            </button>
          }

          @if (screenLive()) {
            <span class="sharing-badge">
              <mat-icon>screen_share</mat-icon>
              {{ isSharingMyScreen() ? 'You are sharing your screen' : 'Screen sharing' }}
            </span>
          }

          @if (recordingActive()) {
            <span class="recording-badge">
              <mat-icon>fiber_manual_record</mat-icon>
              Recording
            </span>
          }

          @if (!hasMain()) {
            <div class="placeholder">
              <mat-icon>videocam</mat-icon>
              <p>Waiting for the host to start&hellip;</p>
            </div>
          }
        </div>

        <aside class="side">
          <div class="participants">
            <h2>In the room ({{ participants().length }})</h2>
            <ul>
              @for (person of participants(); track person.identity) {
                <li>
                  <span>{{ person.name }}</span>
                  <span class="tags">
                    @if (person.isSpeaking) {
                      <mat-icon class="speaking">graphic_eq</mat-icon>
                    }
                    @if (person.handRaised) {
                      <mat-icon class="hand">back_hand</mat-icon>
                    }
                    @if (isHost() && person.identity !== myIdentity()) {
                      <button
                        mat-icon-button
                        (click)="togglePublish(person.identity, !person.canPublish)"
                        [attr.aria-label]="person.canPublish ? 'Mute' : 'Let speak'"
                      >
                        <mat-icon>{{ person.canPublish ? 'mic_off' : 'mic' }}</mat-icon>
                      </button>
                    }
                  </span>
                </li>
              }
            </ul>
          </div>

          <div class="chat">
            <h2>Chat</h2>
            <div class="messages">
              @for (message of chat(); track message.id) {
                <p class="message"><strong>{{ message.from }}</strong> {{ message.body }}</p>
              }
              @if (chat().length === 0) {
                <p class="muted">No messages yet.</p>
              }
            </div>
            <form class="composer" (submit)="sendChat($event)">
              <mat-form-field appearance="outline">
                <input matInput [formControl]="draft" placeholder="Say something" maxlength="2000" />
              </mat-form-field>
              <button mat-icon-button type="submit" aria-label="Send"><mat-icon>send</mat-icon></button>
            </form>
          </div>
        </aside>

        <footer class="controls">
          @if (canPublish()) {
            <button mat-fab extended (click)="toggleMic()">
              <mat-icon>{{ micOn() ? 'mic' : 'mic_off' }}</mat-icon>
              {{ micOn() ? 'Mute' : 'Unmute' }}
            </button>
            <button mat-fab extended (click)="toggleCam()">
              <mat-icon>{{ camOn() ? 'videocam' : 'videocam_off' }}</mat-icon>
              {{ camOn() ? 'Stop video' : 'Start video' }}
            </button>
            <!-- Only the host: the join token itself withholds the
                 screen_share source from everyone else. -->
            @if (isHost()) {
              <button
                mat-fab
                extended
                [color]="screenOn() ? 'primary' : undefined"
                (click)="toggleScreenShare()"
                [disabled]="sharePending()"
              >
                <mat-icon>{{ screenOn() ? 'stop_screen_share' : 'screen_share' }}</mat-icon>
                {{ screenOn() ? 'Stop sharing' : 'Share screen' }}
              </button>
            }
            @if (isHost() && recordingEnabled()) {
              <button
                mat-fab
                extended
                [color]="recordingActive() ? 'warn' : undefined"
                (click)="toggleRecording()"
                [disabled]="recordingPending()"
              >
                <mat-icon>{{ recordingActive() ? 'stop_circle' : 'fiber_manual_record' }}</mat-icon>
                {{ recordingActive() ? 'Stop recording' : 'Record' }}
              </button>
            }
          } @else {
            <button mat-fab extended (click)="toggleHand()">
              <mat-icon>back_hand</mat-icon>
              {{ myHandRaised() ? 'Lower hand' : 'Raise hand' }}
            </button>
          }

          @if (isHost()) {
            <button mat-fab extended color="warn" (click)="endSession()">
              <mat-icon>call_end</mat-icon>
              End session
            </button>
          } @else {
            <button mat-fab extended (click)="leave()">
              <mat-icon>logout</mat-icon>
              Leave
            </button>
          }
        </footer>
      }
    </div>
  `,
  styles: `
    .room {
      height: 100dvh;
      display: grid;
      grid-template-columns: 1fr 320px;
      grid-template-rows: 1fr auto;
      background: #101014;
      color: #f5f5f7;
    }

    .state {
      grid-column: 1 / -1;
      grid-row: 1 / -1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      text-align: center;
    }

    .state.error mat-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
    }

    .stage {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }

    .video {
      width: 100%;
      height: 100%;
      object-fit: contain;
      background: #000;
    }

    .placeholder {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      color: #8a8a94;
    }

    /* The camera inset over a shared screen. Clicking it swaps the two, which
       is the whole reason it is a button and not a bare video element. */
    .pip {
      position: absolute;
      right: 16px;
      bottom: 16px;
      width: 26%;
      max-width: 260px;
      min-width: 132px;
      aspect-ratio: 16 / 9;
      padding: 0;
      border: 1px solid #3a3a44;
      border-radius: 10px;
      overflow: hidden;
      background: #000;
      cursor: pointer;
      box-shadow: 0 6px 24px rgb(0 0 0 / 45%);
    }

    .pip:hover {
      border-color: #6b6b7a;
    }

    .pip-video {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .sharing-badge {
      position: absolute;
      top: 16px;
      left: 16px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 999px;
      background: rgb(0 0 0 / 60%);
      color: #f5f5f7;
      font-size: 0.8125rem;
    }

    .sharing-badge mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    .recording-badge {
      position: absolute;
      top: 16px;
      right: 16px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 999px;
      background: rgb(220 38 38 / 85%);
      color: #f5f5f7;
      font-size: 0.8125rem;
    }

    .recording-badge mat-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
      color: #ffffff;
    }

    .side {
      display: flex;
      flex-direction: column;
      border-left: 1px solid #26262e;
      min-height: 0;
    }

    h2 {
      font-size: 0.8125rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #8a8a94;
      margin: 12px 12px 8px;
    }

    .participants ul {
      list-style: none;
      margin: 0;
      padding: 0 12px;
      max-height: 30vh;
      overflow-y: auto;
    }

    .participants li {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 4px 0;
      font-size: 0.875rem;
    }

    .tags {
      display: inline-flex;
      align-items: center;
      gap: 2px;
    }

    .speaking {
      color: #4ade80;
    }

    .hand {
      color: #fbbf24;
    }

    .chat {
      flex: 1 1 auto;
      display: flex;
      flex-direction: column;
      min-height: 0;
      border-top: 1px solid #26262e;
    }

    .messages {
      flex: 1 1 auto;
      overflow-y: auto;
      padding: 0 12px;
      font-size: 0.875rem;
    }

    .message {
      margin: 4px 0;
    }

    .muted {
      color: #8a8a94;
    }

    .composer {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 0 8px 0 12px;
    }

    .composer mat-form-field {
      flex: 1 1 auto;
    }

    .controls {
      grid-column: 1 / -1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 12px;
      border-top: 1px solid #26262e;
    }

    @media (max-width: 840px) {
      .room {
        grid-template-columns: 1fr;
        grid-template-rows: 1fr 240px auto;
      }
    }
  `,
})
export class LiveRoomPage {
  private readonly api = inject(LiveApi);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly sessionId = input.required<string>();
  private readonly mainStage = viewChild<ElementRef<HTMLVideoElement>>('mainStage');
  private readonly pipStage = viewChild<ElementRef<HTMLVideoElement>>('pipStage');

  protected readonly phase = signal<'joining' | 'live' | 'error'>('joining');
  protected readonly error = signal<string | null>(null);
  protected readonly canPublish = signal(false);
  protected readonly isHost = signal(false);
  protected readonly myIdentity = signal('');
  protected readonly micOn = signal(false);
  protected readonly camOn = signal(false);
  protected readonly screenOn = signal(false);
  protected readonly sharePending = signal(false);
  protected readonly myHandRaised = signal(false);
  protected readonly chat = signal<ChatEntry[]>([]);
  protected readonly draft = new FormControl('', { nonNullable: true });

  protected readonly recordingEnabled = signal(false);
  protected readonly recordingActive = signal(false);
  protected readonly recordingPending = signal(false);

  /**
   * The two video tracks the stage can show, kept apart by LiveKit's own
   * `Track.Source` rather than by arrival order — a teacher sharing an
   * application *and* their webcam publishes two video tracks at once, and
   * which is which has to survive either one starting or stopping first.
   */
  protected readonly screenLive = signal(false);
  protected readonly cameraLive = signal(false);
  protected readonly isSharingMyScreen = signal(false);

  /** Viewer's own preference: tap the inset to promote it to the main stage. */
  protected readonly swapped = signal(false);

  protected readonly hasMain = computed(() => this.screenLive() || this.cameraLive());
  /** Only meaningful with two tracks; one track always occupies the main stage. */
  protected readonly showPip = computed(() => this.screenLive() && this.cameraLive());

  private readonly roster = signal<
    { identity: string; name: string; canPublish: boolean; isSpeaking: boolean; handRaised: boolean }[]
  >([]);
  protected readonly participants = computed(() => this.roster());

  private room: Room | null = null;

  constructor() {
    effect(() => {
      const id = this.sessionId();
      if (id && this.phase() === 'joining' && !this.room) void this.join(id);
    });

    // The stage <video> elements only exist once Angular has actually
    // rendered the 'live' template branch — one render pass after `phase`
    // flips. Publish events (and join() itself) can call refreshStage()
    // before that pass happens, so attachment has to be re-driven off the
    // view-child signals themselves, not off the events that precede them.
    effect(() => {
      const live = this.phase() === 'live';
      this.mainStage();
      this.pipStage();
      if (live) untracked(() => this.refreshStage());
    });

    this.destroyRef.onDestroy(() => void this.room?.disconnect());
  }

  private async join(sessionId: string): Promise<void> {
    let grant: JoinTokenResponse;
    try {
      grant = await firstValueFrom(this.api.joinToken(sessionId));
    } catch (err: unknown) {
      const body = err instanceof HttpErrorResponse ? (err.error as { message?: string }) : null;
      this.error.set(body?.message ?? 'Could not join this session.');
      this.phase.set('error');
      return;
    }

    this.canPublish.set(grant.canPublish);
    this.isHost.set(grant.role === 'HOST');
    this.myIdentity.set(grant.identity);
    this.recordingEnabled.set(grant.recordingEnabled);
    this.recordingActive.set(grant.recordingActive);

    const room = new Room({ adaptiveStream: true, dynacast: true });
    this.room = room;

    room
      .on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        this.attachAudio(track);
        this.refreshStage();
      })
      .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        track.detach();
        this.refreshStage();
      })
      // Local publications never fire TrackSubscribed, so without these the
      // host would not see their own screen share or camera.
      .on(RoomEvent.LocalTrackPublished, () => this.refreshStage())
      .on(RoomEvent.LocalTrackUnpublished, () => this.refreshStage())
      // A muted camera should surrender the stage rather than freeze on a
      // still frame, and unmuting should take it back.
      .on(RoomEvent.TrackMuted, () => this.refreshStage())
      .on(RoomEvent.TrackUnmuted, () => this.refreshStage())
      .on(RoomEvent.ParticipantConnected, () => this.syncRoster())
      .on(RoomEvent.ParticipantDisconnected, () => {
        this.syncRoster();
        this.refreshStage();
      })
      .on(RoomEvent.ActiveSpeakersChanged, () => this.syncRoster())
      .on(RoomEvent.DataReceived, (payload, participant) => this.onData(payload, participant))
      .on(RoomEvent.Disconnected, () => {
        if (this.phase() === 'live') void this.router.navigate(['/my-classes']);
      });

    try {
      await room.connect(grant.serverUrl, grant.token);
      if (grant.canPublish) {
        await room.localParticipant.enableCameraAndMicrophone();
        this.micOn.set(true);
        this.camOn.set(true);
      }
      this.phase.set('live');
      this.syncRoster();
    } catch (err: unknown) {
      this.error.set(
        err instanceof Error ? `Could not connect to the room: ${err.message}` : 'Could not connect.',
      );
      this.phase.set('error');
    }
  }

  /**
   * Rebuilds the stage from whatever is currently published.
   *
   * Driven by a full rescan rather than by patching state per event: tracks
   * start and stop in any order (a host can begin sharing before turning the
   * camera on, or drop the camera mid-share), and reconciling against the
   * room's actual publications is the only version of this that does not
   * drift out of sync after an unusual sequence.
   */
  private refreshStage(): void {
    const room = this.room;
    if (!room) return;

    // Catches a share ended from the browser's own "Stop sharing" bar, which
    // unpublishes the track without going through our button.
    this.syncShareState();

    const participants: Participant[] = [room.localParticipant, ...room.remoteParticipants.values()];

    let screen: Track | null = null;
    let camera: Track | null = null;
    let screenIsMine = false;

    for (const participant of participants) {
      for (const publication of participant.trackPublications.values()) {
        const track = publication.track;
        if (!track || track.kind !== Track.Kind.Video || publication.isMuted) continue;

        if (publication.source === Track.Source.ScreenShare && !screen) {
          screen = track;
          screenIsMine = participant === room.localParticipant;
        } else if (publication.source === Track.Source.Camera && !camera) {
          camera = track;
        }
      }
    }

    this.screenLive.set(screen !== null);
    this.cameraLive.set(camera !== null);
    this.isSharingMyScreen.set(screenIsMine);
    // With nothing to swap to, a stale preference would blank the stage.
    if (!screen || !camera) this.swapped.set(false);

    const { main, inset } = pickStageTracks(screen, camera, this.swapped());
    this.assign(this.mainStage()?.nativeElement, main);
    this.assign(this.pipStage()?.nativeElement, inset);
  }

  /** Which track each <video> currently carries, so re-attaches are skipped. */
  private readonly attached = new WeakMap<HTMLVideoElement, Track>();

  private assign(element: HTMLVideoElement | undefined, track: Track | null): void {
    if (!element) return;

    const current = this.attached.get(element);
    if (current === track) return;

    if (current) current.detach(element);
    if (track) {
      track.attach(element);
      this.attached.set(element, track);
    } else {
      this.attached.delete(element);
    }
  }

  /**
   * Remote audio (microphones, and a shared window's own sound) needs an
   * element in the document to actually play. Local tracks are deliberately
   * skipped — playing your own microphone back is an echo.
   */
  private attachAudio(track: RemoteTrack): void {
    if (track.kind !== Track.Kind.Audio) return;
    const audio = track.attach();
    audio.style.display = 'none';
    document.body.appendChild(audio);
  }

  private syncRoster(): void {
    const room = this.room;
    if (!room) return;

    const all: Participant[] = [room.localParticipant, ...room.remoteParticipants.values()];
    this.roster.set(
      all.map((p) => ({
        identity: p.identity,
        name: p.name || p.identity,
        canPublish: p.permissions?.canPublish ?? false,
        isSpeaking: p.isSpeaking,
        handRaised: this.raisedHands.has(p.identity),
      })),
    );
  }

  private readonly raisedHands = new Set<string>();

  /**
   * Untrusted bytes from another participant. Parsed with the shared schema
   * and dropped on failure, so a malformed or hostile payload never reaches
   * the template.
   */
  private onData(payload: Uint8Array, participant?: RemoteParticipant): void {
    let message: RoomDataMessage;
    try {
      const parsed = roomDataMessageSchema.safeParse(
        JSON.parse(new TextDecoder().decode(payload)) as unknown,
      );
      if (!parsed.success) return;
      message = parsed.data;
    } catch {
      return;
    }

    const from = participant?.name || participant?.identity || 'Someone';

    if (message.kind === 'chat') {
      this.chat.update((all) => [
        ...all.slice(-199),
        { id: message.id, from, body: message.body, sentAt: message.sentAt },
      ]);
      return;
    }

    if (message.kind === 'hand' && participant) {
      if (message.raised) this.raisedHands.add(participant.identity);
      else this.raisedHands.delete(participant.identity);
      this.syncRoster();
    }

    if (message.kind === 'recording') {
      this.recordingActive.set(message.active);
    }
  }

  private publishData(message: RoomDataMessage): void {
    const room = this.room;
    if (!room) return;
    void room.localParticipant.publishData(
      new TextEncoder().encode(JSON.stringify(message)),
      { reliable: true },
    );
  }

  protected sendChat(event: Event): void {
    event.preventDefault();
    const body = this.draft.value.trim();
    if (!body || !this.room) return;

    const message: ChatMessage = {
      kind: 'chat',
      id: crypto.randomUUID(),
      body,
      sentAt: new Date().toISOString(),
    };
    this.publishData(message);
    // Echoed locally: LiveKit does not loop a participant's own data back.
    this.chat.update((all) => [
      ...all.slice(-199),
      { id: message.id, from: 'You', body, sentAt: message.sentAt },
    ]);
    this.draft.setValue('');
  }

  protected toggleHand(): void {
    const raised = !this.myHandRaised();
    this.myHandRaised.set(raised);
    this.publishData({ kind: 'hand', raised, at: new Date().toISOString() });
  }

  protected async toggleMic(): Promise<void> {
    const room = this.room;
    if (!room) return;
    const next = !this.micOn();
    await room.localParticipant.setMicrophoneEnabled(next);
    this.micOn.set(next);
  }

  protected async toggleCam(): Promise<void> {
    const room = this.room;
    if (!room) return;
    const next = !this.camOn();
    await room.localParticipant.setCameraEnabled(next);
    this.camOn.set(next);
    this.refreshStage();
  }

  /**
   * Starts or stops sharing a screen, window or tab.
   *
   * `audio: true` carries the shared window's own sound, so playing a video
   * inside a demo is not silent for the class. The browser's own picker is
   * what chooses the surface — there is no way to preselect it, and a user
   * who dismisses that dialog is not an error worth reporting, which is why
   * the cancel case is swallowed rather than shown.
   */
  protected async toggleScreenShare(): Promise<void> {
    const room = this.room;
    if (!room || this.sharePending()) return;

    const next = !this.screenOn();
    this.sharePending.set(true);
    try {
      await room.localParticipant.setScreenShareEnabled(next, { audio: true });
      this.screenOn.set(next);
    } catch (err: unknown) {
      // NotAllowedError is the picker being dismissed — an ordinary choice.
      if (!(err instanceof DOMException && err.name === 'NotAllowedError')) {
        this.error.set('Could not start screen sharing.');
      }
    } finally {
      this.sharePending.set(false);
      this.refreshStage();
    }
  }

  /**
   * Keeps our own flag true to what LiveKit actually holds: stopping a share
   * from the browser's own "Stop sharing" bar unpublishes the track without
   * going through the button above.
   */
  private syncShareState(): void {
    const room = this.room;
    if (!room) return;
    const sharing = room.localParticipant.isScreenShareEnabled;
    if (sharing !== this.screenOn()) this.screenOn.set(sharing);
  }

  protected swapViews(): void {
    this.swapped.update((value) => !value);
    this.refreshStage();
  }

  protected togglePublish(identity: string, canPublish: boolean): void {
    this.api.promote(this.sessionId(), identity, canPublish).subscribe({
      next: () => this.syncRoster(),
      error: () => this.error.set('Could not change that permission.'),
    });
  }

  /**
   * Starts or stops capture. The API call is the authority — the local flag
   * only flips once it succeeds — and the host then announces the new state
   * over the data channel so everyone already in the room knows they are (or
   * are no longer) being recorded, not just the person who pressed the button.
   */
  protected toggleRecording(): void {
    if (this.recordingPending()) return;
    const next = !this.recordingActive();

    this.recordingPending.set(true);
    const call = next ? this.api.startRecording(this.sessionId()) : this.api.stopRecording(this.sessionId());
    call.subscribe({
      next: () => {
        this.recordingPending.set(false);
        this.recordingActive.set(next);
        this.publishData({ kind: 'recording', active: next });
      },
      error: (err: unknown) => {
        this.recordingPending.set(false);
        const body = err instanceof HttpErrorResponse ? (err.error as { message?: string }) : null;
        this.error.set(body?.message ?? 'Could not change recording.');
      },
    });
  }

  protected endSession(): void {
    this.api.end(this.sessionId()).subscribe({
      next: () => void this.leave(),
      error: () => this.error.set('Could not end the session.'),
    });
  }

  protected async leave(): Promise<void> {
    await this.room?.disconnect();
    this.room = null;
    void this.router.navigate(['/my-classes']);
  }
}
