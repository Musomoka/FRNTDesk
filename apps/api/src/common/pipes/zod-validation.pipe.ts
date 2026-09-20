import {
  BadRequestException,
  Injectable,
  type ArgumentMetadata,
  type PipeTransform,
} from '@nestjs/common';
import type { ZodType } from 'zod';

/**
 * Validates a request payload against a schema from @frntdesk/shared — the same
 * schema the Angular form validates with, so the two cannot drift.
 *
 * Nest's built-in ValidationPipe is deliberately not used: it needs
 * class-validator, which would mean maintaining a second set of DTO
 * definitions alongside the zod ones.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown, _metadata: ArgumentMetadata): T {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      // Return every problem at once so a form can highlight all bad fields in
      // one round trip instead of one per submit.
      throw new BadRequestException({
        message: 'Validation failed',
        errors: result.error.issues.map((issue) => ({
          field: issue.path.join('.') || '(root)',
          message: issue.message,
        })),
      });
    }

    return result.data;
  }
}

/** Terser at call sites: `@Body(zodBody(createClassroomSchema))`. */
export function zodBody<T>(schema: ZodType<T>): ZodValidationPipe<T> {
  return new ZodValidationPipe(schema);
}
