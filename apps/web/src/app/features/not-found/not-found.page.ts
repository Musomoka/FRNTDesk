import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-not-found-page',
  imports: [RouterLink, MatButtonModule, MatIconModule],
  template: `
    <div class="not-found">
      <mat-icon>explore_off</mat-icon>
      <h1>Page not found</h1>
      <p>That link doesn't lead anywhere. It may have been removed or mistyped.</p>
      <a mat-flat-button color="primary" routerLink="/classes">Browse classes</a>
    </div>
  `,
  styles: `
    .not-found {
      max-width: 420px;
      margin: 0 auto;
      padding: 64px 16px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      text-align: center;
    }

    mat-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      color: var(--mat-sys-on-surface-variant);
    }

    h1 {
      margin: 0;
      font-size: 1.5rem;
    }

    p {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class NotFoundPage {}
