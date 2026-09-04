import { BaseBankProvider } from './base-bank.provider';
import type { ProviderWebhookResult } from './payment-provider.interface';

export class SbiProvider extends BaseBankProvider {
  readonly name = 'sbi';

  async verifyPayment(merchantTxnRef: string) {
    return this.getPaymentStatus(merchantTxnRef);
  }

  async getPaymentStatus(merchantTxnRef: string) {
    return this.fetchStatus(merchantTxnRef, `/sbiepay/status/${merchantTxnRef}`);
  }

  async parseWebhook(payload: unknown, signature: string): Promise<ProviderWebhookResult> {
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
    if (!this.verifySignature(body, signature)) {
      throw new Error('Invalid SBI webhook signature');
    }
    const data = typeof payload === 'object' && payload ? payload as Record<string, unknown> : {};
    return {
      merchantTxnRef: String(data.merchantRef ?? data.orderId ?? ''),
      status: this.normalizeStatus(String(data.paymentStatus ?? 'PENDING')),
      utr: data.utr ? String(data.utr) : undefined,
      providerPaymentId: data.sbiTxnId ? String(data.sbiTxnId) : undefined,
      raw: data,
    };
  }
}
