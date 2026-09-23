import { describe, expect, it } from 'vitest';
import { OrganisationsService } from './organisations.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

function fakePrisma(rows: unknown[]) {
  return {
    organisation: {
      findMany: async () => rows,
    },
  } as unknown as PrismaService;
}

describe('OrganisationsService.list', () => {
  it('maps organisations and their sub-courses, converting dates to ISO strings', async () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const service = new OrganisationsService(
      fakePrisma([
        {
          id: 'org-1',
          name: 'Kwacha Traders Ltd',
          type: 'BUSINESS',
          createdAt,
          subCourses: [
            {
              id: 'sub-1',
              organisationId: 'org-1',
              name: 'Finance Team',
              description: 'Internal training for the finance department.',
              createdAt,
            },
          ],
        },
      ]),
    );

    const result = await service.list();

    expect(result).toEqual([
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
    ]);
  });

  it('returns an empty sub-courses array for an organisation that has none', async () => {
    const service = new OrganisationsService(
      fakePrisma([
        {
          id: 'org-2',
          name: 'Lusaka Secondary School',
          type: 'SCHOOL',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          subCourses: [],
        },
      ]),
    );

    const [result] = await service.list();

    expect(result?.subCourses).toEqual([]);
  });
});
