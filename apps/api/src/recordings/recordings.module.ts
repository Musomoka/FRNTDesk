import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { RecordingsController } from './recordings.controller.js';
import { RecordingsService } from './recordings.service.js';

@Module({
  imports: [AuthModule],
  controllers: [RecordingsController],
  providers: [RecordingsService],
  exports: [RecordingsService],
})
export class RecordingsModule {}
