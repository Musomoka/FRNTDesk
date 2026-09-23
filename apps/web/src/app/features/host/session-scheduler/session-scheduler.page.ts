import { Component, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

/**
 * A standalone `/sessions/new` entry point that exists only because it is
 * linkable from elsewhere. Scheduling itself lives in the Sessions tab, next
 * to the list it changes, so this redirects rather than maintaining a second
 * copy of the same form.
 */
@Component({
  selector: 'app-session-scheduler-page',
  template: '',
})
export class SessionSchedulerPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    void this.router.navigate(['/host/classrooms', id, 'sessions'], { replaceUrl: true });
  }
}
