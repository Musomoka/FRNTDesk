import { Controller, Get } from '@nestjs/common';
import type { OrganisationWithSubCourses } from '@frntdesk/shared';
import { OrganisationsService } from './organisations.service.js';

/** Read-only and unauthenticated, like the class catalog — browsing organisations needs no login. */
@Controller('organisations')
export class OrganisationsController {
  constructor(private readonly organisations: OrganisationsService) {}

  @Get()
  async list(): Promise<OrganisationWithSubCourses[]> {
    return this.organisations.list();
  }
}
