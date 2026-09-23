import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatToolbarModule } from '@angular/material/toolbar';
import { AuthService as Auth0Service } from '@auth0/auth0-angular';
import { AuthStore } from '../auth/auth-store';

interface NavDestination {
  path: string;
  icon: string;
  label: string;
}

/**
 * The one shell for everything except the live room (which deliberately
 * renders outside this component entirely — see app.routes.ts — for a true
 * chrome-free immersive view).
 *
 * There's no separate Public/App shell component pair. A single top app bar
 * and a single nav element cover both: the nav only renders once
 * `isAuthenticated()`, and its layout — bottom bar vs. side rail — is pure
 * CSS media query, not two components or a BreakpointObserver subscription,
 * because the destinations and their behavior never differ by platform, only
 * their position does.
 */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatToolbarModule, MatButtonModule, MatIconModule, MatMenuModule],
  template: `
    <div class="shell" [class.shell--authed]="auth.isAuthenticated()">
      <mat-toolbar class="topbar">
        <a routerLink="/" class="brand">FRNTDesk</a>
        <span class="spacer"></span>
        @if (auth.isAuthenticated()) {
          <button mat-icon-button [matMenuTriggerFor]="accountMenu" aria-label="Account menu">
            <mat-icon>account_circle</mat-icon>
          </button>
          <mat-menu #accountMenu="matMenu">
            <a mat-menu-item routerLink="/account">
              <mat-icon>settings</mat-icon>
              <span>Account</span>
            </a>
            <!-- Hosting is per-class rather than a role, so this is offered to
                 everyone rather than gated behind a flag the user cannot set. -->
            <a mat-menu-item routerLink="/host/classrooms">
              <mat-icon>cast_for_education</mat-icon>
              <span>Teach a class</span>
            </a>
            <button mat-menu-item (click)="logout()">
              <mat-icon>logout</mat-icon>
              <span>Log out</span>
            </button>
          </mat-menu>
        } @else {
          <a mat-button routerLink="/login">Log in</a>
        }
      </mat-toolbar>

      <div class="body">
        @if (auth.isAuthenticated()) {
          <nav class="nav" aria-label="Primary">
            @for (item of destinations; track item.path) {
              <a class="nav-item" [routerLink]="item.path" routerLinkActive="nav-item--active">
                <mat-icon>{{ item.icon }}</mat-icon>
                <span>{{ item.label }}</span>
              </a>
            }
          </nav>
        }

        <main class="content">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
  styles: `
    .shell {
      min-height: 100dvh;
      display: flex;
      flex-direction: column;
    }

    .topbar {
      position: sticky;
      top: 0;
      z-index: 10;
    }

    .brand {
      font-family: Manrope, sans-serif;
      font-weight: 700;
      font-size: 1.125rem;
      text-decoration: none;
      color: inherit;
    }

    .spacer {
      flex: 1 1 auto;
    }

    .body {
      flex: 1 1 auto;
      display: flex;
      flex-direction: column;
    }

    .content {
      flex: 1 1 auto;
      min-width: 0;
    }

    .nav {
      display: flex;
      order: 2;
    }

    .nav-item {
      flex: 1 1 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      padding: 8px 0 6px;
      font-size: 0.6875rem;
      text-decoration: none;
      color: var(--mat-sys-on-surface-variant);
    }

    .nav-item--active {
      color: var(--mat-sys-primary);
    }

    /* Mobile (default): bottom navigation bar. */
    .shell--authed .body {
      flex-direction: column;
      padding-bottom: 64px; /* clears the fixed bottom nav */
    }

    .shell--authed .nav {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      background: var(--mat-sys-surface-container);
      border-top: 1px solid var(--mat-sys-outline-variant);
    }

    /* Desktop: the same destinations relayout into a left-hand rail. */
    @media (min-width: 840px) {
      .shell--authed .body {
        flex-direction: row;
        padding-bottom: 0;
      }

      .shell--authed .nav {
        position: sticky;
        top: 64px;
        bottom: auto;
        left: auto;
        right: auto;
        order: 0;
        flex-direction: column;
        width: 96px;
        height: calc(100dvh - 64px);
        border-top: none;
        border-right: 1px solid var(--mat-sys-outline-variant);
        flex-shrink: 0;
      }

      .shell--authed .nav-item {
        padding: 16px 0;
        font-size: 0.75rem;
      }
    }
  `,
})
export class AppShell {
  protected readonly auth = inject(AuthStore);
  private readonly auth0 = inject(Auth0Service);

  protected logout(): void {
    // Clears Auth0's own session too (not just this app's), so a re-visit
    // doesn't silently restore it via a still-valid refresh token.
    this.auth0.logout({ logoutParams: { returnTo: window.location.origin } }).subscribe();
  }

  protected readonly destinations: readonly NavDestination[] = [
    { path: '/classes', icon: 'explore', label: 'Discover' },
    { path: '/organisations', icon: 'apartment', label: 'Organisations' },
    { path: '/my-classes', icon: 'school', label: 'My Classes' },
    { path: '/library', icon: 'video_library', label: 'Library' },
    { path: '/account', icon: 'account_circle', label: 'Account' },
  ];
}
