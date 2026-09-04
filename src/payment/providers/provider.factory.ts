import { config } from '../../core/config';
import { AxisProvider } from './axis.provider';
import { HdfcProvider } from './hdfc.provider';
import { IciciProvider } from './icici.provider';
import { KotakProvider } from './kotak.provider';
import type { PaymentProvider } from './payment-provider.interface';
import { mockBankProvider } from './mock.provider';
import { SbiProvider } from './sbi.provider';

function bankConfig() {
  return {
    apiKey: config.upi.bankApiKey,
    apiSecret: config.upi.bankApiSecret,
    merchantId: config.upi.bankMerchantId,
    baseUrl: config.upi.bankBaseUrl,
  };
}

export function createPaymentProvider(): PaymentProvider {
  const provider = config.upi.bankProvider;

  switch (provider) {
    case 'hdfc':
      return new HdfcProvider(bankConfig());
    case 'icici':
      return new IciciProvider(bankConfig());
    case 'axis':
      return new AxisProvider(bankConfig());
    case 'sbi':
      return new SbiProvider(bankConfig());
    case 'kotak':
      return new KotakProvider(bankConfig());
    case 'mock':
    default:
      return mockBankProvider;
  }
}

let cachedProvider: PaymentProvider | null = null;

export function getPaymentProvider(): PaymentProvider {
  if (!cachedProvider) {
    cachedProvider = createPaymentProvider();
  }
  return cachedProvider;
}
