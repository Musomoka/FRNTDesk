import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import type { PriceRecordingRequest, Recording } from '@frntdesk/shared';

@Injectable({ providedIn: 'root' })
export class RecordingsApi {
  private readonly http = inject(HttpClient);

  library(): Observable<Recording[]> {
    return this.http.get<Recording[]>('/api/me/library');
  }

  detail(id: string): Observable<Recording> {
    return this.http.get<Recording>(`/api/recordings/${id}`);
  }

  price(id: string, body: PriceRecordingRequest): Observable<Recording> {
    return this.http.patch<Recording>(`/api/host/recordings/${id}`, body);
  }
}
