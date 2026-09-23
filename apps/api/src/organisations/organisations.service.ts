import { Injectable } from '@nestjs/common';
import type { OrganisationWithSubCourses } from '@frntdesk/shared';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class OrganisationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Every organisation with its sub-courses nested — the whole catalog listing in one round trip. */
  async list(): Promise<OrganisationWithSubCourses[]> {
    const organisations = await this.prisma.organisation.findMany({
      include: { subCourses: { orderBy: { name: 'asc' } } },
      orderBy: { name: 'asc' },
    });

    return organisations.map(toOrganisationWithSubCourses);
  }
}

function toOrganisationWithSubCourses(org: {
  id: string;
  name: string;
  type: 'BUSINESS' | 'SCHOOL';
  createdAt: Date;
  subCourses: {
    id: string;
    organisationId: string;
    name: string;
    description: string | null;
    createdAt: Date;
  }[];
}): OrganisationWithSubCourses {
  return {
    id: org.id,
    name: org.name,
    type: org.type,
    createdAt: org.createdAt.toISOString(),
    subCourses: org.subCourses.map((sc) => ({
      id: sc.id,
      organisationId: sc.organisationId,
      name: sc.name,
      description: sc.description,
      createdAt: sc.createdAt.toISOString(),
    })),
  };
}
