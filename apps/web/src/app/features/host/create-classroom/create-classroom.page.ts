import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { majorToMinor } from '@frntdesk/shared';
import { ClassroomsApi } from '../../../core/api/classrooms-api';

/**
 * Creates a DRAFT. Publishing is deliberately a separate, later action from
 * the manage screen — a class cannot go live until it has at least one
 * session, and forcing both into one form would mean asking for a schedule
 * before the host has decided what they are teaching.
 */
@Component({
  selector: 'app-create-classroom-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <div class="create">
      <mat-card appearance="outlined">
        <mat-card-header>
          <mat-card-title>New class</mat-card-title>
          <mat-card-subtitle>Saved as a draft — you publish it once it has a session.</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          <form [formGroup]="form" (ngSubmit)="save()">
            <mat-form-field appearance="outline">
              <mat-label>Title</mat-label>
              <input matInput formControlName="title" maxlength="120" />
              @if (form.controls.title.hasError('required') && form.controls.title.touched) {
                <mat-error>Give the class a title.</mat-error>
              }
              @if (form.controls.title.hasError('minlength')) {
                <mat-error>At least 4 characters.</mat-error>
              }
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Description</mat-label>
              <textarea matInput formControlName="description" rows="6" maxlength="4000"></textarea>
              <mat-hint>What will people learn, and what do they need to bring?</mat-hint>
              @if (form.controls.description.hasError('minlength')) {
                <mat-error>At least 20 characters.</mat-error>
              }
            </mat-form-field>

            <div class="row">
              <mat-form-field appearance="outline">
                <mat-label>Price (ZMW)</mat-label>
                <input matInput type="number" formControlName="price" min="0" step="0.01" />
                <mat-hint>Enter 0 for a free class.</mat-hint>
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Capacity</mat-label>
                <input matInput type="number" formControlName="capacity" min="1" max="500" />
              </mat-form-field>
            </div>

            @if (error()) {
              <p class="error">{{ error() }}</p>
            }

            <div class="actions">
              <a mat-stroked-button routerLink="/my-classes">Cancel</a>
              <button mat-flat-button color="primary" type="submit" [disabled]="form.invalid || saving()">
                @if (saving()) {
                  <mat-spinner diameter="18" />
                } @else {
                  Create draft
                }
              </button>
            </div>
          </form>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: `
    .create {
      max-width: 640px;
      margin: 0 auto;
      padding: 16px;
    }

    form {
      display: flex;
      flex-direction: column;
    }

    mat-form-field {
      width: 100%;
    }

    .row {
      display: flex;
      gap: 16px;
    }

    .row mat-form-field {
      flex: 1 1 0;
    }

    .error {
      color: var(--mat-sys-error);
      font-size: 0.875rem;
    }

    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
    }
  `,
})
export class CreateClassroomPage {
  private readonly api = inject(ClassroomsApi);
  private readonly router = inject(Router);

  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = new FormGroup({
    title: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(4), Validators.maxLength(120)],
    }),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(20), Validators.maxLength(4000)],
    }),
    price: new FormControl(0, { nonNullable: true, validators: [Validators.min(0)] }),
    capacity: new FormControl(100, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(1), Validators.max(500)],
    }),
  });

  protected save(): void {
    if (this.form.invalid || this.saving()) return;

    this.saving.set(true);
    this.error.set(null);

    const { title, description, price, capacity } = this.form.getRawValue();
    this.api
      .createClassroom({
        title: title.trim(),
        description: description.trim(),
        // The form takes kwacha; everything below this line is minor units.
        priceMinor: majorToMinor(price),
        capacity,
      })
      .subscribe({
        next: (created) => {
          this.saving.set(false);
          void this.router.navigate(['/host/classrooms', created.id, 'sessions']);
        },
        error: (err: unknown) => {
          this.saving.set(false);
          const body =
            err instanceof HttpErrorResponse ? (err.error as { message?: string }) : null;
          this.error.set(body?.message ?? 'Could not create the class. Try again.');
        },
      });
  }
}
