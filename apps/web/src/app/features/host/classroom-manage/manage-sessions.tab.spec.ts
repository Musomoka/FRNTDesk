import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { By } from '@angular/platform-browser';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClassSession } from '@frntdesk/shared';
import { ClassroomsApi } from '../../../core/api/classrooms-api';
import { ManageStore } from './manage-store';
import { ManageSessionsTab } from './manage-sessions.tab';

const CLASSROOM_ID = '00000000-0000-4000-8000-0000000000c1';

function session(overrides: Partial<ClassSession> = {}): ClassSession {
  return {
    id: '00000000-0000-4000-8000-0000000000s1',
    classroomId: CLASSROOM_ID,
    title: 'Week 1 — Cash flow fundamentals',
    startsAt: '2026-10-01T09:00:00.000Z',
    endsAt: '2026-10-01T10:30:00.000Z',
    status: 'SCHEDULED',
    livekitRoom: 'class-abc-123',
    recordingId: null,
    ...overrides,
  };
}

function render(sessions: ClassSession[]): ComponentFixture<ManageSessionsTab> {
  const api = {
    hostSessions: vi.fn(() => of(sessions)),
    scheduleSession: vi.fn(() => of(sessions[0]!)),
    cancelSession: vi.fn(() => of(sessions[0]!)),
  };
  const store = { classroomId: signal(CLASSROOM_ID) };

  TestBed.configureTestingModule({
    imports: [ManageSessionsTab],
    providers: [
      provideRouter([]),
      { provide: ClassroomsApi, useValue: api },
      { provide: ManageStore, useValue: store },
    ],
  });

  const fixture = TestBed.createComponent(ManageSessionsTab);
  fixture.detectChanges();
  return fixture;
}

function linkWithText(fixture: ComponentFixture<ManageSessionsTab>, text: string) {
  return fixture.debugElement
    .queryAll(By.css('a'))
    .find((el) => ((el.nativeElement as HTMLElement).textContent ?? '').includes(text));
}

describe('ManageSessionsTab', () => {
  beforeEach(() => TestBed.resetTestingModule());

  /**
   * The regression this exists for: a session stays SCHEDULED until the host
   * opens the room, so gating this button on the session already being LIVE
   * left no way to ever start a class.
   */
  it('offers a way into the room for a session that has not started yet', () => {
    const fixture = render([session({ status: 'SCHEDULED' })]);

    const start = linkWithText(fixture, 'Start class');
    expect(start).toBeTruthy();
    expect(start!.attributes['href']).toContain('/live/');
  });

  it('offers to rejoin a session that is already live', () => {
    const fixture = render([session({ status: 'LIVE' })]);

    expect(linkWithText(fixture, 'Rejoin')).toBeTruthy();
    expect(linkWithText(fixture, 'Start class')).toBeUndefined();
  });

  it('offers no way into a cancelled session', () => {
    const fixture = render([session({ status: 'CANCELLED' })]);

    expect(linkWithText(fixture, 'Start class')).toBeUndefined();
    expect(linkWithText(fixture, 'Rejoin')).toBeUndefined();
  });

  it('offers no way into a session that has already ended', () => {
    const fixture = render([session({ status: 'ENDED' })]);

    expect(linkWithText(fixture, 'Start class')).toBeUndefined();
    expect(linkWithText(fixture, 'Rejoin')).toBeUndefined();
  });

  it('says so plainly when nothing is scheduled, since publishing needs a session', () => {
    const fixture = render([]);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No sessions yet');
  });
});
