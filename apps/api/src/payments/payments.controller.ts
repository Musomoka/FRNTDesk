import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Throttle } from '@nestjs/throttler';
import { Queue } from 'bullmq';
import {
  IDEMPOTENCY_HEADER,
  checkoutRequestSchema,
  idempotencyKeySchema,
  type CheckoutRequest,
  type CheckoutResponse,
  type Payment,
} from '@frntdesk/shared';
import { zodBody } from '../common/pipes/zod-validation.pipe.js';
import { Auth0Guard } from '../auth/auth0.guard.js';
import { AuthService } from '../auth/auth.service.js';
import { CurrentAuth0Sub } from '../auth/current-user.decorator.js';
import { PaymentsService } from './payments.service.js';
import { RECONCILIATION_QUEUE, type ReconciliationJob } from './reconciliation.processor.js';

@Controller()
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly auth: AuthService,
    @InjectQueue(RECONCILIATION_QUEUE) private readonly queue: Queue<ReconciliationJob>,
  ) {}

  /**
   * Tighter than the global limit: this is the endpoint that puts a prompt on
   * someone's handset, so it is the one worth abusing.
   */
  @Post('checkout')
  @UseGuards(Auth0Guard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async checkout(
    @CurrentAuth0Sub() auth0Sub: string,
    @Headers(IDEMPOTENCY_HEADER) idempotencyKey: string | undefined,
    @Body(zodBody(checkoutRequestSchema)) body: CheckoutRequest,
  ): Promise<CheckoutResponse> {
    const key = idempotencyKeySchema.safeParse(idempotencyKey);
    if (!key.success) {
      throw new BadRequestException(
        `An ${IDEMPOTENCY_HEADER} header of 8-128 characters is required.`,
      );
    }

    const user = await this.auth.requireUser(auth0Sub);
    const response = await this.payments.checkout(user.id, body, key.data);

    // Polling starts immediately; the handset prompt is already out.
    await this.queue.add(
      'reconcile',
      { paymentId: response.payment.id, attempt: 1 },
      { delay: response.pollAfterMs, removeOnComplete: true, removeOnFail: 50 },
    );

    return response;
  }

  @Get('payments/:id')
  @UseGuards(Auth0Guard)
  async status(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth0Sub() auth0Sub: string,
  ): Promise<Payment> {
    const user = await this.auth.requireUser(auth0Sub);
    return this.payments.findForUser(id, user.id);
  }

  /**
   * MTN's callback. Unauthenticated by design — MTN does not sign it — so it
   * is treated as a hint and nothing more: the body is recorded for audit and
   * a reconciliation job is queued. Authority to settle comes solely from
   * polling MTN's own status endpoint, so a forged callback achieves nothing
   * beyond causing us to ask MTN a question we were going to ask anyway.
   */
  @Post('payments/callback/mtn')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async mtnCallback(@Body() body: unknown): Promise<{ received: true }> {
    const paymentId = await this.payments.noteCallback(body);
    if (paymentId) {
      await this.queue.add(
        'reconcile',
        { paymentId, attempt: 1 },
        { delay: 0, removeOnComplete: true, removeOnFail: 50 },
      );
    }
    return { received: true };
  }
}
