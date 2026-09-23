import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { RecordingsModule } from '../recordings/recordings.module.js';
import { LiveController } from './live.controller.js';
import { LiveService } from './live.service.js';

@Module({
  imports: [AuthModule, RecordingsModule],
  controllers: [LiveController],
  providers: [LiveService],
  exports: [LiveService],
})
export class LiveModule {}
