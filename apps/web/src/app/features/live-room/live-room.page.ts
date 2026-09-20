import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

/**
 * The one deliberate exception to the shared shell (see app.routes.ts — this
 * route sits outside `AppShell` entirely, not just visually suppressed
 * within it) and to the shared `PagePlaceholder` card, since a full-bleed
 * dark video surface is the actual shape of this screen, not a stand-in for
 * it.
 *
 * This is also why `live-room` is its own top-level, lazily-loaded route
 * rather than nested under `classroom`: `livekit-client` must never load for
 * someone merely browsing the catalog on a mid-range Android phone.
 */
@Component({
  selector: 'app-live-room-page',
  template: `
    <div class="stage">
      <p class="session">Live session {{ sessionId }}</p>
      <p class="note">Full-bleed video canvas + self-hiding control dock render here.</p>
      <ul class="states">
        @for (state of states; track state) {
          <li>{{ state }}</li>
        }
      </ul>
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-height: 100dvh;
    }

    .stage {
      min-height: 100dvh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      background: #111;
      color: #f5f5f5;
      padding: 24px;
      text-align: center;
    }

    .session {
      font-family: Manrope, sans-serif;
      font-weight: 700;
      font-size: 1.25rem;
    }

    .note {
      color: #b0b0b0;
    }

    .states {
      list-style: none;
      padding: 0;
      margin-top: 16px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 0.8125rem;
      color: #d0d0d0;
    }
  `,
})
export class LiveRoomPage {
  private readonly route = inject(ActivatedRoute);

  protected readonly sessionId = this.route.snapshot.paramMap.get('sessionId');

  protected readonly states = [
    'student: connecting',
    'student: viewer',
    'student: hand-raised',
    'student: promoted',
    'student: demoted',
    'student: ended',
    'student: reconnecting',
    'student: removed',
    'host: live + participants/hand-raise drawer',
    'host: promoting/demoting (optimistic, rollback on failure)',
    'host: ending (confirm → teardown)',
    'host: reconnecting',
    'baseline: join-token fetch failed',
  ] as const;
}
