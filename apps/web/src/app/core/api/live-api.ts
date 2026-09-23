import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import type {
  JoinTokenResponse,
  RecordingControlResponse,
  SessionParticipant,
} from '@frntdesk/shared';

@Injectable({ providedIn: 'root' })
export class LiveApi {
  private readonly http = inject(HttpClient);

  joinToken(sessionId: string): Observable<JoinTokenResponse> {
    return this.http.post<JoinTokenResponse>(`/api/live/sessions/${sessionId}/token`, {});
  }

  participants(sessionId: string): Observable<SessionParticipant[]> {
    return this.http.get<SessionParticipant[]>(`/api/live/sessions/${sessionId}/participants`);
  }

  promote(sessionId: string, identity: string, canPublish: boolean): Observable<SessionParticipant[]> {
    return this.http.post<SessionParticipant[]>(`/api/live/sessions/${sessionId}/promote`, {
      identity,
      canPublish,
    });
  }

  end(sessionId: string): Observable<{ ended: true }> {
    return this.http.post<{ ended: true }>(`/api/live/sessions/${sessionId}/end`, {});
  }

  startRecording(sessionId: string): Observable<RecordingControlResponse> {
    return this.http.post<RecordingControlResponse>(
      `/api/live/sessions/${sessionId}/recording/start`,
      {},
    );
  }

  stopRecording(sessionId: string): Observable<RecordingControlResponse> {
    return this.http.post<RecordingControlResponse>(
      `/api/live/sessions/${sessionId}/recording/stop`,
      {},
    );
  }
}
