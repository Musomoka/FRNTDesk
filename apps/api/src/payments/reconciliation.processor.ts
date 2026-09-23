import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Queue, type Job } from 'bullmq';
import { isTerminal, type PaymentStatus } from '@frntdesk/shared';
import { PaymentsService } from './payments.service.js';

export const RECONCILIATION_QUEUE = 'payment-reconciliation';

export interface ReconciliationJob {
  paymentId: string;
  attempt: number;
}

/**
 * Polls the provider until the payment reaches a terminal state.
 *
 * The schedule is explicit re-enqueueing rather than BullMQ's own retry: a
 * still-PENDING payment is the expected case, not a failure, and modelling it
 * as a thrown error would fill the logs with exceptions for the happy path.
 */
const MAX_ATTEMPTS = 20;
const DELAYS_MS = [3_000, 3_000, 5_000, 5_000, 10_000, 10_000, 15_000];

@Processor(RECONCILIATION_QUEUE)
export class ReconciliationProcessor extends WorkerHost {
  private readonly logger = new Logger(ReconciliationProcessor.name);

  constructor(
    private readonly payments: PaymentsService,
    @InjectQueue(RECONCILIATION_QUEUE) private readonly queue: Queue<ReconciliationJob>,
  ) {
    super();
  }

  async process(job: Job<ReconciliationJob>): Promise<void> {
    const { paymentId, attempt } = job.data;

    let status: PaymentStatus;
    try {
      status = await this.payments.reconcile(paymentId);
    } catch (error) {
      // A provider that is briefly unreachable must not abandon the payment.
      this.logger.warn(`Reconciliation attempt ${attempt} failed for ${paymentId}`, error);
      await this.scheduleNext(paymentId, attempt);
      return;
    }

    if (isTerminal(status)) {
      this.logger.log(`Payment ${paymentId} settled as ${status} after ${attempt} attempt(s).`);
      return;
    }

    if (attempt >= MAX_ATTEMPTS) {
      // The prompt expired on the handset without being answered. Recorded as
      // TIMEOUT through the same guarded path as any other transition.
      this.logger.warn(`Payment ${paymentId} gave up after ${attempt} attempts; marking TIMEOUT.`);
      await this.payments.recordEvent(
        paymentId,
        'POLL',
        'TIMEOUT',
        { reason: 'No response from the payer before the polling window closed.' },
        'The payment prompt was not approved in time.',
      );
      return;
    }

    await this.scheduleNext(paymentId, attempt);
  }

  private async scheduleNext(paymentId: string, attempt: number): Promise<void> {
    const delay = DELAYS_MS[Math.min(attempt, DELAYS_MS.length - 1)] ?? 15_000;
    await this.queue.add(
      'reconcile',
      { paymentId, attempt: attempt + 1 },
      { delay, removeOnComplete: true, removeOnFail: 50 },
    );
  }
}
