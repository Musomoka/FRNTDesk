import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AuthService as Auth0Service } from '@auth0/auth0-angular';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

/**
 * Same redirect-trigger pattern as LoginPage — Universal Login is one hosted
 * page with both a login and a sign-up tab. `screen_hint: 'signup'` opens it
 * on the sign-up tab directly, which is the whole difference from /login.
 */
@Component({
  selector: 'app-register-page',
  imports: [MatProgressSpinnerModule],
  template: `
    <div class="redirecting">
      <mat-spinner diameter="32" />
      <p>Taking you to sign up&hellip;</p>
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
export class RegisterPage {
  private readonly auth0 = inject(Auth0Service);
  private readonly route = inject(ActivatedRoute);

  constructor() {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') ?? undefined;
    void this.auth0.loginWithRedirect({
      appState: { target: returnUrl },
      authorizationParams: { screen_hint: 'signup' },
    });
  }
}
