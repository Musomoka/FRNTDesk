import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import {
  priceRecordingSchema,
  type PriceRecordingRequest,
  type Recording,
} from '@frntdesk/shared';
import { zodBody } from '../common/pipes/zod-validation.pipe.js';
import { Auth0Guard } from '../auth/auth0.guard.js';
import { AuthService } from '../auth/auth.service.js';
import { CurrentAuth0Sub } from '../auth/current-user.decorator.js';
import { RecordingsService } from './recordings.service.js';

@Controller()
@UseGuards(Auth0Guard)
export class RecordingsController {
  constructor(
    private readonly recordings: RecordingsService,
    private readonly auth: AuthService,
  ) {}

  @Get('me/library')
  async library(@CurrentAuth0Sub() auth0Sub: string): Promise<Recording[]> {
    const user = await this.auth.requireUser(auth0Sub);
    return this.recordings.library(user.id);
  }

  @Get('recordings/:id')
  async detail(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth0Sub() auth0Sub: string,
  ): Promise<Recording> {
    const user = await this.auth.requireUser(auth0Sub);
    return this.recordings.detail(id, user.id);
  }

  @Patch('host/recordings/:id')
  async price(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth0Sub() auth0Sub: string,
    @Body(zodBody(priceRecordingSchema)) body: PriceRecordingRequest,
  ): Promise<Recording> {
    const user = await this.auth.requireUser(auth0Sub);
    return this.recordings.price(id, user.id, body);
  }
}
