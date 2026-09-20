import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AuthService as Auth0Service } from '@auth0/auth0-angular';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

/**
 * Not a form — Universal Login means Auth0's own hosted page collects
 * credentials, never this app. This route exists as a stable, deep-linkable
 * `/login` for `authGuard` to bounce anonymous users to; on arrival it
 * immediately redirects to Auth0, carrying `returnUrl` through as `appState`
 * so Auth0's SDK lands the user back where they were headed once done (its
 * own default redirect-callback behavior — see AppState.target).
 */
@Component({
  selector: 'app-login-page',
  imports: [MatProgressSpinnerModule],
  template: `
    <div class="redirecting">
      <mat-spinner diameter="32" />
      <p>Taking you to log in&hellip;</p>
    </div>
  `,
  styles: `
    .redirecting {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      padding: 64px 16px;
      text-align: center;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class LoginPage {
  private readonly auth0 = inject(Auth0Service);
  private readonly route = inject(ActivatedRoute);

  constructor() {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') ?? undefined;
    void this.auth0.loginWithRedirect({ appState: { target: returnUrl } });
  }
}
