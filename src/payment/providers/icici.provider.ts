import { BaseBankProvider } from './base-bank.provider';
import type { ProviderWebhookResult } from './payment-provider.interface';

export class IciciProvider extends BaseBankProvider {
  readonly name = 'icici';

  async verifyPayment(merchantTxnRef: string) {
    return this.getPaymentStatus(merchantTxnRef);
  }

  async getPaymentStatus(merchantTxnRef: string) {
    return this.fetchStatus(merchantTxnRef, `/composite/v1/status/${merchantTxnRef}`);
  }

  async parseWebhook(payload: unknown, signature: string): Promise<ProviderWebhookResult> {
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
    if (!this.verifySignature(body, signature)) {
      throw new Error('Invalid ICICI webhook signature');
    }
    const data = typeof payload === 'object' && payload ? payload as Record<string, unknown> : {};
    return {
      merchantTxnRef: String(data.merchantTxnId ?? data.orderId ?? ''),
      status: this.normalizeStatus(String(data.status ?? 'PENDING')),
      utr: data.bankRRN ? String(data.bankRRN) : undefined,
      providerPaymentId: data.epayId ? String(data.epayId) : undefined,
      raw: data,
    };
  }
}
