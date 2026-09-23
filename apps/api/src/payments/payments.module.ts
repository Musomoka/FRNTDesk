import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';
import { FakePaymentProvider } from './providers/fake.provider.js';
import { MtnPaymentProvider } from './providers/mtn.provider.js';
import { PaymentProviderRegistry } from './providers/provider.registry.js';
import { RECONCILIATION_QUEUE, ReconciliationProcessor } from './reconciliation.processor.js';

@Module({
  imports: [AuthModule, BullModule.registerQueue({ name: RECONCILIATION_QUEUE })],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    PaymentProviderRegistry,
    FakePaymentProvider,
    MtnPaymentProvider,
    ReconciliationProcessor,
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
