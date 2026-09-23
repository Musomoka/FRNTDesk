import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import type {
  ClassSession,
  Classroom,
  CreateClassroomRequest,
  CreateSessionRequest,
  EnrolledClass,
  Enrollment,
  UpdateClassroomRequest,
  UpdateSessionRequest,
} from '@frntdesk/shared';

export interface CatalogPage {
  items: Classroom[];
  page: number;
  pageSize: number;
  total: number;
}

export interface RosterEntry {
  enrollment: Enrollment;
  displayName: string;
  email: string;
}

/**
 * Every classroom-related call the app makes, in one place, so a route change
 * on the API is a single-file edit here rather than a hunt through pages.
 */
@Injectable({ providedIn: 'root' })
export class ClassroomsApi {
  private readonly http = inject(HttpClient);

  catalog(query: { q?: string; maxPriceMinor?: number } = {}): Observable<CatalogPage> {
    let params = new HttpParams();
    if (query.q) params = params.set('q', query.q);
    if (query.maxPriceMinor !== undefined) {
      params = params.set('maxPriceMinor', String(query.maxPriceMinor));
    }
    return this.http.get<CatalogPage>('/api/classrooms', { params });
  }

  detail(id: string): Observable<Classroom> {
    return this.http.get<Classroom>(`/api/classrooms/${id}`);
  }

  sessions(classroomId: string): Observable<ClassSession[]> {
    return this.http.get<ClassSession[]>(`/api/classrooms/${classroomId}/sessions`);
  }

  enrollFree(classroomId: string): Observable<Enrollment> {
    return this.http.post<Enrollment>(`/api/classrooms/${classroomId}/enroll`, {});
  }

  myClasses(): Observable<EnrolledClass[]> {
    return this.http.get<EnrolledClass[]>('/api/me/classes');
  }

  /** Null when the signed-in viewer holds no seat in this class. */
  myClass(classroomId: string): Observable<EnrolledClass | null> {
    return this.http.get<EnrolledClass | null>(`/api/me/classes/${classroomId}`);
  }

  hostClassrooms(): Observable<Classroom[]> {
    return this.http.get<Classroom[]>('/api/host/classrooms');
  }

  hostClassroom(id: string): Observable<Classroom> {
    return this.http.get<Classroom>(`/api/host/classrooms/${id}`);
  }

  createClassroom(body: CreateClassroomRequest): Observable<Classroom> {
    return this.http.post<Classroom>('/api/host/classrooms', body);
  }

  updateClassroom(id: string, body: UpdateClassroomRequest): Observable<Classroom> {
    return this.http.patch<Classroom>(`/api/host/classrooms/${id}`, body);
  }

  publishClassroom(id: string): Observable<Classroom> {
    return this.http.post<Classroom>(`/api/host/classrooms/${id}/publish`, {});
  }

  cancelClassroom(id: string): Observable<Classroom> {
    return this.http.post<Classroom>(`/api/host/classrooms/${id}/cancel`, {});
  }

  hostSessions(classroomId: string): Observable<ClassSession[]> {
    return this.http.get<ClassSession[]>(`/api/host/classrooms/${classroomId}/sessions`);
  }

  scheduleSession(classroomId: string, body: CreateSessionRequest): Observable<ClassSession> {
    return this.http.post<ClassSession>(`/api/host/classrooms/${classroomId}/sessions`, body);
  }

  updateSession(sessionId: string, body: UpdateSessionRequest): Observable<ClassSession> {
    return this.http.patch<ClassSession>(`/api/host/sessions/${sessionId}`, body);
  }

  cancelSession(sessionId: string): Observable<ClassSession> {
    return this.http.post<ClassSession>(`/api/host/sessions/${sessionId}/cancel`, {});
  }

  roster(classroomId: string): Observable<RosterEntry[]> {
    return this.http.get<RosterEntry[]>(`/api/host/classrooms/${classroomId}/enrollments`);
  }
}
