import { HttpErrorResponse } from '@angular/common/http';
import { Component, effect, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { majorToMinor, minorToMajor } from '@frntdesk/shared';
import { ClassroomsApi } from '../../../core/api/classrooms-api';
import { ManageStore } from './manage-store';

@Component({
  selector: 'app-manage-details-tab',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <form [formGroup]="form" (ngSubmit)="save()" class="details">
      <mat-form-field appearance="outline">
        <mat-label>Title</mat-label>
        <input matInput formControlName="title" maxlength="120" />
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>Description</mat-label>
        <textarea matInput formControlName="description" rows="6" maxlength="4000"></textarea>
      </mat-form-field>

      <div class="row">
        <mat-form-field appearance="outline">
          <mat-label>Price (ZMW)</mat-label>
          <input matInput type="number" formControlName="price" min="0" step="0.01" />
          @if (priceLocked()) {
            <mat-hint>Locked — people have already started enrolling.</mat-hint>
          }
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
        <button
          mat-flat-button
          color="primary"
          type="submit"
          [disabled]="form.invalid || !form.dirty || saving()"
        >
          @if (saving()) {
            <mat-spinner diameter="18" />
          } @else {
            Save changes
          }
        </button>
      </div>
    </form>
  `,
  styles: `
    .details {
      display: flex;
      flex-direction: column;
      padding-top: 16px;
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
    }
  `,
})
export class ManageDetailsTab {
  private readonly api = inject(ClassroomsApi);
  private readonly store = inject(ManageStore);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly priceLocked = signal(false);

  protected readonly form = new FormGroup({
    title: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(4)],
    }),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(20)],
    }),
    price: new FormControl(0, { nonNullable: true }),
    capacity: new FormControl(100, { nonNullable: true, validators: [Validators.min(1)] }),
  });

  private filled = false;

  constructor() {
    // Fills once, the first time the shared store resolves — never again, so
    // a background refresh cannot overwrite an edit in progress.
    effect(() => {
      const item = this.store.classroom();
      if (!item || this.filled) return;
      this.form.setValue({
        title: item.title,
        description: item.description,
        price: minorToMajor(item.priceMinor),
        capacity: item.capacity,
      });
      // The API rejects a price change once anyone has enrolled; reflected
      // here so the field is visibly locked rather than failing on submit.
      if (item.enrolledCount > 0) {
        this.priceLocked.set(true);
        this.form.controls.price.disable();
      }
      this.filled = true;
    });
  }

  protected save(): void {
    if (this.form.invalid || this.saving()) return;

    this.saving.set(true);
    this.error.set(null);

    const { title, description, price, capacity } = this.form.getRawValue();
    this.api
      .updateClassroom(this.store.classroomId(), {
        title: title.trim(),
        description: description.trim(),
        ...(this.priceLocked() ? {} : { priceMinor: majorToMinor(price) }),
        capacity,
      })
      .subscribe({
        next: (updated) => {
          this.saving.set(false);
          this.store.set(updated);
          this.form.markAsPristine();
          this.snackBar.open('Class updated.', undefined, { duration: 3000 });
        },
        error: (err: unknown) => {
          this.saving.set(false);
          const body =
            err instanceof HttpErrorResponse ? (err.error as { message?: string }) : null;
          this.error.set(body?.message ?? 'Could not save. Try again.');
        },
      });
  }
}
