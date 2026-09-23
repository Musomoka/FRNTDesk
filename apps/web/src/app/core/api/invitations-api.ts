import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import type {
  AcceptInvitationResult,
  CreateInvitationsRequest,
  Invitation,
} from '@frntdesk/shared';

@Injectable({ providedIn: 'root' })
export class InvitationsApi {
  private readonly http = inject(HttpClient);

  list(classroomId: string): Observable<Invitation[]> {
    return this.http.get<Invitation[]>(`/api/host/classrooms/${classroomId}/invitations`);
  }

  create(classroomId: string, body: CreateInvitationsRequest): Observable<Invitation[]> {
    return this.http.post<Invitation[]>(`/api/host/classrooms/${classroomId}/invitations`, body);
  }

  revoke(invitationId: string): Observable<Invitation> {
    return this.http.post<Invitation>(`/api/host/invitations/${invitationId}/revoke`, {});
  }

  accept(token: string): Observable<AcceptInvitationResult> {
    return this.http.post<AcceptInvitationResult>('/api/invitations/accept', { token });
  }
}
