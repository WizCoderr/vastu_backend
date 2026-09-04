import { createHmac } from 'crypto';
import type {
  PaymentProvider,
  ProviderPaymentStatus,
  ProviderStatusResult,
  ProviderVerificationResult,
  ProviderWebhookResult,
} from './payment-provider.interface';

export interface BankProviderConfig {
  apiKey: string;
  apiSecret: string;
  merchantId: string;
  baseUrl: string;
}

export abstract class BaseBankProvider implements PaymentProvider {
  abstract readonly name: string;

  constructor(protected readonly config: BankProviderConfig) {}

  abstract verifyPayment(merchantTxnRef: string): Promise<ProviderVerificationResult>;
  abstract getPaymentStatus(merchantTxnRef: string): Promise<ProviderStatusResult>;
  abstract parseWebhook(payload: unknown, signature: string): Promise<ProviderWebhookResult>;

  protected verifySignature(payload: string, signature: string): boolean {
    const expected = createHmac('sha256', this.config.apiSecret)
      .update(payload)
      .digest('hex');
    return expected === signature;
  }

  protected normalizeStatus(raw: string): ProviderPaymentStatus {
    const value = raw.toUpperCase();
    if (['SUCCESS', 'COMPLETED', 'CAPTURED', 'PAID'].includes(value)) return 'COMPLETED';
    if (['FAILED', 'FAILURE', 'DECLINED', 'REJECTED'].includes(value)) return 'FAILED';
    return 'PENDING';
  }

  protected async fetchStatus(merchantTxnRef: string, endpoint: string): Promise<ProviderStatusResult> {
    const response = await fetch(`${this.config.baseUrl}${endpoint}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': this.config.apiKey,
        'X-MERCHANT-ID': this.config.merchantId,
      },
    });

    if (!response.ok) {
      return { merchantTxnRef, status: 'PENDING' };
    }

    const data = await response.json() as Record<string, unknown>;
    const status = this.normalizeStatus(String(data.status ?? data.paymentStatus ?? 'PENDING'));
    return {
      merchantTxnRef,
      status,
      utr: data.utr ? String(data.utr) : data.rrn ? String(data.rrn) : undefined,
      providerPaymentId: data.transactionId ? String(data.transactionId) : undefined,
      raw: data,
    };
  }
}
