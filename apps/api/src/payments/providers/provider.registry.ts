import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { MobileOperator, PaymentProvider } from '@frntdesk/shared';
import type { Env } from '../../config/env.schema.js';
import { FakePaymentProvider } from './fake.provider.js';
import { MtnPaymentProvider } from './mtn.provider.js';
import type { PaymentProviderAdapter } from './payment-provider.js';

/**
 * Chooses which integration handles a given number.
 *
 * The fake provider, when enabled, takes precedence over everything — a
 * developer with `PROVIDER_FAKE_ENABLED=true` wants every number to go
 * through it, not just the ones whose operator happens to be switched off.
 * The env schema refuses to let that flag survive into production.
 */
@Injectable()
export class PaymentProviderRegistry {
  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly fake: FakePaymentProvider,
    private readonly mtn: MtnPaymentProvider,
  ) {}

  /**
   * `requested` lets a caller override the routing — a small number of people
   * hold a wallet on a number that has been ported between operators, so the
   * prefix is a good default rather than the last word.
   */
  resolve(operator: MobileOperator, requested?: PaymentProvider): PaymentProviderAdapter {
    if (this.config.get('PROVIDER_FAKE_ENABLED', { infer: true })) return this.fake;

    const target = requested ?? operatorToProvider(operator);

    if (target === 'MTN_MOMO') {
      if (!this.config.get('PROVIDER_MTN_ENABLED', { infer: true })) {
        throw new BadRequestException('MTN Mobile Money is not available right now.');
      }
      return this.mtn;
    }

    if (target === 'AIRTEL_MONEY') {
      // Airtel has no self-service sandbox — credentials need full business
      // verification, so the integration stays off until onboarding completes.
      throw new BadRequestException(
        'Airtel Money is not available yet. Please use an MTN number.',
      );
    }

    throw new BadRequestException('That payment method is not available.');
  }

  /** Used when replaying a stored payment, where the provider is already known. */
  byKey(key: PaymentProvider): PaymentProviderAdapter {
    if (key === 'FAKE') return this.fake;
    if (key === 'MTN_MOMO') return this.mtn;
    throw new BadRequestException(`No adapter is configured for ${key}.`);
  }
}

function operatorToProvider(operator: MobileOperator): PaymentProvider {
  if (operator === 'MTN') return 'MTN_MOMO';
  if (operator === 'AIRTEL') return 'AIRTEL_MONEY';
  // Zamtel has no mobile money integration here; surfaced as a clear message
  // rather than a silent fallback onto someone else's wallet.
  throw new BadRequestException(
    'Zamtel numbers cannot be charged yet. Use an MTN or Airtel number.',
  );
}
