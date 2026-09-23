import { Injectable, inject, signal } from '@angular/core';
import type { Classroom } from '@frntdesk/shared';
import { ClassroomsApi } from '../../../core/api/classrooms-api';

/**
 * The one classroom every tab under the manage screen is looking at.
 *
 * Provided by ClassroomManagePage rather than at the root, so it lives and
 * dies with that screen — two different classes opened in two tabs of the
 * browser cannot end up sharing one instance's state.
 */
@Injectable()
export class ManageStore {
  private readonly api = inject(ClassroomsApi);

  readonly classroomId = signal('');
  readonly classroom = signal<Classroom | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  load(id: string): void {
    this.classroomId.set(id);
    this.loading.set(true);
    this.error.set(null);

    this.api.hostClassroom(id).subscribe({
      next: (item) => {
        this.classroom.set(item);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Could not load this class. It may belong to another host.');
        this.loading.set(false);
      },
    });
  }

  set(item: Classroom): void {
    this.classroom.set(item);
  }
}
