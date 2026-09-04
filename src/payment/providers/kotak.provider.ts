import { BaseBankProvider } from './base-bank.provider';
import type { ProviderWebhookResult } from './payment-provider.interface';

export class KotakProvider extends BaseBankProvider {
  readonly name = 'kotak';

  async verifyPayment(merchantTxnRef: string) {
    return this.getPaymentStatus(merchantTxnRef);
  }

  async getPaymentStatus(merchantTxnRef: string) {
    return this.fetchStatus(merchantTxnRef, `/merchant/v1/txn-status/${merchantTxnRef}`);
  }

  async parseWebhook(payload: unknown, signature: string): Promise<ProviderWebhookResult> {
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
    if (!this.verifySignature(body, signature)) {
      throw new Error('Invalid Kotak webhook signature');
    }
    const data = typeof payload === 'object' && payload ? payload as Record<string, unknown> : {};
    return {
      merchantTxnRef: String(data.merchantTxnRef ?? data.orderId ?? ''),
      status: this.normalizeStatus(String(data.status ?? 'PENDING')),
      utr: data.utr ? String(data.utr) : undefined,
      providerPaymentId: data.kotakTxnId ? String(data.kotakTxnId) : undefined,
      raw: data,
    };
  }
}
