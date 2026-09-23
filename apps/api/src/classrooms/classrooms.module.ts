import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ClassroomsController } from './classrooms.controller.js';
import { ClassroomsService } from './classrooms.service.js';
import { EnrollmentsService } from './enrollments.service.js';
import {
  HostClassroomsController,
  HostSessionsController,
} from './host-classrooms.controller.js';
import { SessionsService } from './sessions.service.js';

@Module({
  imports: [AuthModule],
  controllers: [ClassroomsController, HostClassroomsController, HostSessionsController],
  providers: [ClassroomsService, SessionsService, EnrollmentsService],
  // Payments activate an enrollment, and the live room needs the entitlement
  // check, so both services are reused rather than reimplemented there.
  exports: [ClassroomsService, SessionsService, EnrollmentsService],
})
export class ClassroomsModule {}
