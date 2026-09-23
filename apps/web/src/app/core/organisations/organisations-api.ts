import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import type { OrganisationWithSubCourses } from '@frntdesk/shared';

@Injectable({ providedIn: 'root' })
export class OrganisationsApi {
  private readonly http = inject(HttpClient);

  list(): Observable<OrganisationWithSubCourses[]> {
    return this.http.get<OrganisationWithSubCourses[]>('/api/organisations');
  }
}
