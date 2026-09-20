import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

interface Step {
  icon: string;
  title: string;
  body: string;
}

/**
 * The one route a signed-in user never sees — `redirectIfAuthenticatedGuard`
 * sends them straight to `/classes` instead (see app.routes.ts). Content and
 * tone follow the visual-identity plan: warm and peer-to-peer, plain copy,
 * ZMW/mobile-money named explicitly rather than left implicit.
 */
@Component({
  selector: 'app-marketing-page',
  imports: [RouterLink, MatButtonModule, MatIconModule],
  template: `
    <section class="hero">
      <h1>Teach or learn, live — pay with the money in your pocket.</h1>
      <p class="subhead">
        FRNTDesk is where anyone in Zambia can host a paid, live class or join one — priced in
        Kwacha, paid with MTN or Airtel Money.
      </p>
      <div class="cta-row">
        <a mat-flat-button color="primary" routerLink="/classes">Browse classes</a>
        <a mat-stroked-button routerLink="/register">Start hosting</a>
      </div>
    </section>

    <section class="how-it-works">
      <h2>How it works</h2>
      <div class="steps">
        @for (step of steps; track step.title) {
          <div class="step">
            <mat-icon>{{ step.icon }}</mat-icon>
            <h3>{{ step.title }}</h3>
            <p>{{ step.body }}</p>
          </div>
        }
      </div>
    </section>

    <section class="trust">
      <p>
        <mat-icon inline>payments</mat-icon>
        Priced in ZMW. Pay by MTN Mobile Money or Airtel Money — no card required.
      </p>
    </section>
  `,
  styles: `
    section {
      max-width: 960px;
      margin: 0 auto;
      padding: 32px 16px;
    }

    .hero {
      text-align: center;
      padding-top: 48px;
      padding-bottom: 48px;
      background: linear-gradient(
        180deg,
        var(--mat-sys-primary-container) 0%,
        var(--mat-sys-surface) 100%
      );
      max-width: none;
      border-radius: 0 0 24px 24px;
    }

    .hero h1 {
      font-family: Manrope, sans-serif;
      font-weight: 700;
      font-size: 1.75rem;
      line-height: 1.25;
      max-width: 640px;
      margin: 0 auto 12px;
      color: var(--mat-sys-on-primary-container);
    }

    .subhead {
      max-width: 480px;
      margin: 0 auto 24px;
      color: var(--mat-sys-on-primary-container);
      opacity: 0.85;
    }

    .cta-row {
      display: flex;
      flex-direction: column;
      gap: 12px;
      max-width: 280px;
      margin: 0 auto;
    }

    .how-it-works h2 {
      font-family: Manrope, sans-serif;
      text-align: center;
      margin-bottom: 24px;
    }

    .steps {
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    .step {
      text-align: center;
    }

    .step mat-icon {
      color: var(--mat-sys-primary);
      font-size: 32px;
      width: 32px;
      height: 32px;
    }

    .step h3 {
      font-family: Manrope, sans-serif;
      margin: 8px 0 4px;
    }

    .step p {
      color: var(--mat-sys-on-surface-variant);
      margin: 0;
    }

    .trust {
      text-align: center;
      color: var(--mat-sys-on-surface-variant);
      font-size: 0.875rem;
    }

    /* Desktop: hero CTAs side by side, steps in a row. */
    @media (min-width: 840px) {
      .hero h1 {
        font-size: 2.5rem;
      }

      .cta-row {
        flex-direction: row;
        max-width: none;
        justify-content: center;
      }

      .steps {
        flex-direction: row;
      }

      .step {
        flex: 1 1 0;
      }
    }
  `,
})
export class MarketingPage {
  protected readonly steps: readonly Step[] = [
    {
      icon: 'explore',
      title: 'Find a class',
      body: 'Browse live classes from tutors across Zambia, priced in Kwacha.',
    },
    {
      icon: 'payments',
      title: 'Pay by mobile money',
      body: 'Check out with MTN or Airtel Money — approve the PIN prompt on your phone.',
    },
    {
      icon: 'video_camera_front',
      title: 'Join or watch later',
      body: 'Attend the live session, or catch the replay in your library afterward.',
    },
  ];
}
