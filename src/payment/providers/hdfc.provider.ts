import { BaseBankProvider } from './base-bank.provider';
import type { ProviderVerificationResult, ProviderWebhookResult } from './payment-provider.interface';

export class HdfcProvider extends BaseBankProvider {
  readonly name = 'hdfc';

  async verifyPayment(merchantTxnRef: string) {
    return this.getPaymentStatus(merchantTxnRef);
  }

  async getPaymentStatus(merchantTxnRef: string) {
    return this.fetchStatus(merchantTxnRef, `/v1/transactions/${merchantTxnRef}`);
  }

  async parseWebhook(payload: unknown, signature: string): Promise<ProviderWebhookResult> {
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
    if (!this.verifySignature(body, signature)) {
      throw new Error('Invalid HDFC webhook signature');
    }
    const data = typeof payload === 'object' && payload ? payload as Record<string, unknown> : {};
    const merchantTxnRef = String(data.merchantTxnRef ?? data.orderId ?? '');
    return {
      merchantTxnRef,
      status: this.normalizeStatus(String(data.status ?? 'PENDING')),
      utr: data.utr ? String(data.utr) : undefined,
      providerPaymentId: data.transactionId ? String(data.transactionId) : undefined,
      raw: data,
    };
  }
}
