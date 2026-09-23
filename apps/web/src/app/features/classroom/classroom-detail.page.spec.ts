import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClassSession, Classroom, EnrolledClass, UserProfile } from '@frntdesk/shared';
import { ClassroomsApi } from '../../core/api/classrooms-api';
import { AuthStore } from '../../core/auth/auth-store';
import { ClassroomDetailPage } from './classroom-detail.page';

const CLASSROOM_ID = '00000000-0000-4000-8000-0000000000c1';
const HOST_ID = '00000000-0000-4000-8000-0000000000h1';
const STUDENT_ID = '00000000-0000-4000-8000-0000000000u1';

const CLASSROOM: Classroom = {
  id: CLASSROOM_ID,
  hostId: HOST_ID,
  hostDisplayName: 'Chanda Mwale',
  subCourseId: null,
  subCourseName: null,
  organisationName: null,
  title: 'Introduction to Financial Modelling',
  description: 'A four-week practical course on cash flow forecasting and valuation.',
  priceMinor: 15_000,
  currency: 'ZMW',
  capacity: 200,
  coverImageUrl: null,
  status: 'PUBLISHED',
  enrolledCount: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const SESSION: ClassSession = {
  id: '00000000-0000-4000-8000-0000000000s1',
  classroomId: CLASSROOM_ID,
  title: 'Week 1',
  startsAt: '2026-10-01T09:00:00.000Z',
  endsAt: '2026-10-01T10:30:00.000Z',
  status: 'SCHEDULED',
  livekitRoom: null,
  recordingId: null,
};

function profile(id: string): UserProfile {
  return {
    id,
    email: 'someone@frntdesk.local',
    displayName: 'Someone',
    phoneE164: null,
    emailVerifiedAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function seat(status: EnrolledClass['enrollment']['status']): EnrolledClass {
  return {
    enrollment: {
      id: 'enrollment-1',
      classroomId: CLASSROOM_ID,
      userId: STUDENT_ID,
      status,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    classroom: CLASSROOM,
    nextSession: SESSION,
  };
}

function render(options: {
  viewerId: string | null;
  mySeat?: EnrolledClass | null;
  session?: ClassSession;
}): ComponentFixture<ClassroomDetailPage> {
  const api = {
    detail: vi.fn(() => of(CLASSROOM)),
    sessions: vi.fn(() => of([options.session ?? SESSION])),
    myClass: vi.fn(() => of(options.mySeat ?? null)),
    enrollFree: vi.fn(() => of(seat('ACTIVE').enrollment)),
  };
  const auth = {
    isAuthenticated: signal(options.viewerId !== null),
    currentUser: signal(options.viewerId ? profile(options.viewerId) : null),
  };

  TestBed.configureTestingModule({
    imports: [ClassroomDetailPage],
    providers: [
      provideRouter([]),
      { provide: ClassroomsApi, useValue: api },
      { provide: AuthStore, useValue: auth },
    ],
  });

  const fixture = TestBed.createComponent(ClassroomDetailPage);
  fixture.componentRef.setInput('classroomId', CLASSROOM_ID);
  fixture.detectChanges();
  return fixture;
}

const textOf = (fixture: ComponentFixture<ClassroomDetailPage>) =>
  ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ');

describe('ClassroomDetailPage', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('lets the host open the room for a session that has not started yet', () => {
    const fixture = render({ viewerId: HOST_ID });
    expect(textOf(fixture)).toContain('Start class');
  });

  /** A host was previously shown "Enrol" on a class they teach. */
  it('never asks the host to enrol in their own class', () => {
    const fixture = render({ viewerId: HOST_ID });
    const text = textOf(fixture);

    expect(text).toContain('You teach this class');
    expect(text).not.toContain('Enrol —');
  });

  it('lets an enrolled student into a scheduled session without waiting for it to go live', () => {
    const fixture = render({ viewerId: STUDENT_ID, mySeat: seat('ACTIVE') });
    expect(textOf(fixture)).toContain('Join');
  });

  it('labels the room as live once the session actually is', () => {
    const fixture = render({
      viewerId: STUDENT_ID,
      mySeat: seat('ACTIVE'),
      session: { ...SESSION, status: 'LIVE' },
    });
    expect(textOf(fixture)).toContain('Join now');
  });

  it('offers checkout, not a room, to someone with no seat', () => {
    const fixture = render({ viewerId: STUDENT_ID, mySeat: null });
    const text = textOf(fixture);

    expect(text).toContain('Enrol —');
    expect(text).not.toContain('Start class');
  });

  it('keeps an unpaid seat out of the room', () => {
    const fixture = render({ viewerId: STUDENT_ID, mySeat: seat('PENDING_PAYMENT') });
    expect(textOf(fixture)).not.toContain('Join');
  });

  it('shows a cancelled session as cancelled rather than joinable', () => {
    const fixture = render({
      viewerId: HOST_ID,
      session: { ...SESSION, status: 'CANCELLED' },
    });
    const text = textOf(fixture);

    expect(text).toContain('Cancelled');
    expect(text).not.toContain('Start class');
  });
});
