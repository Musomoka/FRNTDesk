import { z } from 'zod';
import {
  isoDateTimeSchema,
  organisationRoleSchema,
  organisationTypeSchema,
  uuidSchema,
} from './common.js';

/**
 * An Organisation is an optional grouping above Classroom — a business or a
 * school. A SubCourse is the team/department (business) or course/grade/
 * subject (school) within it. A Classroom reaches its organisation only
 * through a SubCourse; a solo host has neither and keeps working unchanged.
 */

export const createOrganisationSchema = z.object({
  name: z.string().trim().min(2).max(120),
  type: organisationTypeSchema,
});
export type CreateOrganisationRequest = z.input<typeof createOrganisationSchema>;

export const organisationSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  type: organisationTypeSchema,
  createdAt: isoDateTimeSchema,
});
export type Organisation = z.infer<typeof organisationSchema>;

export const organisationMembershipSchema = z.object({
  id: uuidSchema,
  organisationId: uuidSchema,
  userId: uuidSchema,
  role: organisationRoleSchema,
  createdAt: isoDateTimeSchema,
});
export type OrganisationMembership = z.infer<typeof organisationMembershipSchema>;

export const createSubCourseSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).optional(),
});
export type CreateSubCourseRequest = z.input<typeof createSubCourseSchema>;

export const updateSubCourseSchema = createSubCourseSchema.partial();
export type UpdateSubCourseRequest = z.input<typeof updateSubCourseSchema>;

export const subCourseSchema = z.object({
  id: uuidSchema,
  organisationId: uuidSchema,
  name: z.string(),
  description: z.string().nullable(),
  createdAt: isoDateTimeSchema,
});
export type SubCourse = z.infer<typeof subCourseSchema>;

/** An organisation with its sub-courses nested — the shape the catalog listing returns. */
export const organisationWithSubCoursesSchema = organisationSchema.extend({
  subCourses: z.array(subCourseSchema),
});
export type OrganisationWithSubCourses = z.infer<typeof organisationWithSubCoursesSchema>;
