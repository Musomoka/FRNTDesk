import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import type { OrganisationWithSubCourses } from '@frntdesk/shared';
import { OrganisationsApi } from '../../core/organisations/organisations-api';
import { OrganisationsPage } from './organisations.page';

const ORGANISATIONS: OrganisationWithSubCourses[] = [
  {
    id: 'org-1',
    name: 'Kwacha Traders Ltd',
    type: 'BUSINESS',
    createdAt: '2026-01-01T00:00:00.000Z',
    subCourses: [
      {
        id: 'sub-1',
        organisationId: 'org-1',
        name: 'Finance Team',
        description: 'Internal training for the finance department.',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ],
  },
];

function fakeApi(result = of(ORGANISATIONS)) {
  return { list: vi.fn(() => result) };
}

describe('OrganisationsPage', () => {
  it('shows a loading spinner before the response arrives', () => {
    const api = fakeApi(of());
    TestBed.configureTestingModule({
      imports: [OrganisationsPage],
      providers: [{ provide: OrganisationsApi, useValue: api }],
    });

    const fixture = TestBed.createComponent(OrganisationsPage);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('mat-spinner')).toBeTruthy();
  });

  it('renders each organisation with its sub-courses once loaded', () => {
    const api = fakeApi();
    TestBed.configureTestingModule({
      imports: [OrganisationsPage],
      providers: [{ provide: OrganisationsApi, useValue: api }],
    });

    const fixture = TestBed.createComponent(OrganisationsPage);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Kwacha Traders Ltd');
    expect(text).toContain('Finance Team');
    expect(text).toContain('Internal training for the finance department.');
  });

  it('shows an empty state when there are no organisations', () => {
    const api = fakeApi(of([]));
    TestBed.configureTestingModule({
      imports: [OrganisationsPage],
      providers: [{ provide: OrganisationsApi, useValue: api }],
    });

    const fixture = TestBed.createComponent(OrganisationsPage);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No organisations yet.');
  });

  it('shows an error message when the request fails', () => {
    const api = fakeApi(throwError(() => new Error('boom')));
    TestBed.configureTestingModule({
      imports: [OrganisationsPage],
      providers: [{ provide: OrganisationsApi, useValue: api }],
    });

    const fixture = TestBed.createComponent(OrganisationsPage);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Could not load organisations. Try again.',
    );
  });
});
