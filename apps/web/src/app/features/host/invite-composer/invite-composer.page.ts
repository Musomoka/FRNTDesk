import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { InvitationsApi } from '../../../core/api/invitations-api';

/** Split on commas, semicolons, spaces and newlines — however the host pasted them. */
function parseEmails(raw: string): string[] {
  return [...new Set(raw.split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean))];
}

const EMAIL_PATTERN = /^[^@\s]+@[^@\s.]+\.[^@\s]+$/;

@Component({
  selector: 'app-invite-composer-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatChipsModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <div class="composer">
      <mat-card appearance="outlined">
        <mat-card-header>
          <mat-card-title>Invite people</mat-card-title>
          <mat-card-subtitle>They get an email with a link that books their seat.</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          <form [formGroup]="form" (ngSubmit)="send()">
            <mat-form-field appearance="outline">
              <mat-label>Email addresses</mat-label>
              <textarea
                matInput
                formControlName="emails"
                rows="4"
                placeholder="one@example.com, two@example.com"
              ></textarea>
              <mat-hint>Separate with commas, spaces or new lines. Up to 100.</mat-hint>
            </mat-form-field>

            @if (invalidEmails().length > 0) {
              <p class="error">Not valid: {{ invalidEmails().join(', ') }}</p>
            } @else if (validEmails().length > 0) {
              <mat-chip-set>
                @for (email of validEmails(); track email) {
                  <mat-chip>{{ email }}</mat-chip>
                }
              </mat-chip-set>
            }

            <mat-form-field appearance="outline">
              <mat-label>Message (optional)</mat-label>
              <textarea matInput formControlName="message" rows="3" maxlength="1000"></textarea>
            </mat-form-field>

            <mat-checkbox formControlName="comp">
              Give a free place — skips payment entirely
            </mat-checkbox>

            @if (error()) {
              <p class="error">{{ error() }}</p>
            }
            @if (sentCount() > 0) {
              <p class="sent">Sent {{ sentCount() }} invitation(s).</p>
            }

            <div class="actions">
              <a mat-stroked-button [routerLink]="['/host/classrooms', classroomId, 'invitations']">
                Back
              </a>
              <button
                mat-flat-button
                color="primary"
                type="submit"
                [disabled]="!canSend() || sending()"
              >
                @if (sending()) {
                  <mat-spinner diameter="18" />
                } @else {
                  Send invitations
                }
              </button>
            </div>
          </form>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: `
    .composer {
      max-width: 620px;
      margin: 0 auto;
      padding: 16px;
    }

    form {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    mat-form-field {
      width: 100%;
    }

    .error {
      color: var(--mat-sys-error);
      font-size: 0.875rem;
    }

    .sent {
      color: var(--mat-sys-primary);
      font-size: 0.875rem;
    }

    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      margin-top: 8px;
    }
  `,
})
export class InviteComposerPage {
  private readonly api = inject(InvitationsApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly classroomId = this.route.snapshot.paramMap.get('id') ?? '';

  protected readonly sending = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly sentCount = signal(0);

  protected readonly form = new FormGroup({
    emails: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    message: new FormControl('', { nonNullable: true }),
    comp: new FormControl(false, { nonNullable: true }),
  });

  private readonly raw = signal('');

  protected readonly validEmails = computed(() =>
    parseEmails(this.raw()).filter((e) => EMAIL_PATTERN.test(e)),
  );
  protected readonly invalidEmails = computed(() =>
    parseEmails(this.raw()).filter((e) => !EMAIL_PATTERN.test(e)),
  );
  protected readonly canSend = computed(
    () => this.validEmails().length > 0 && this.invalidEmails().length === 0,
  );

  constructor() {
    this.form.controls.emails.valueChanges.subscribe((value) => this.raw.set(value));
  }

  protected send(): void {
    if (!this.canSend() || this.sending()) return;

    this.sending.set(true);
    this.error.set(null);

    const { message, comp } = this.form.getRawValue();
    this.api
      .create(this.classroomId, {
        emails: this.validEmails(),
        comp,
        ...(message.trim() ? { message: message.trim() } : {}),
      })
      .subscribe({
        next: (created) => {
          this.sending.set(false);
          this.sentCount.set(created.length);
          void this.router.navigate(['/host/classrooms', this.classroomId, 'invitations']);
        },
        error: (err: unknown) => {
          this.sending.set(false);
          const body =
            err instanceof HttpErrorResponse ? (err.error as { message?: string }) : null;
          this.error.set(body?.message ?? 'Could not send those invitations.');
        },
      });
  }
}
