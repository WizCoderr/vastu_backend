import { BaseBankProvider } from './base-bank.provider';
import type { ProviderWebhookResult } from './payment-provider.interface';

export class AxisProvider extends BaseBankProvider {
  readonly name = 'axis';

  async verifyPayment(merchantTxnRef: string) {
    return this.getPaymentStatus(merchantTxnRef);
  }

  async getPaymentStatus(merchantTxnRef: string) {
    return this.fetchStatus(merchantTxnRef, `/api/v1/payment/status?txnRef=${merchantTxnRef}`);
  }

  async parseWebhook(payload: unknown, signature: string): Promise<ProviderWebhookResult> {
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
    if (!this.verifySignature(body, signature)) {
      throw new Error('Invalid Axis webhook signature');
    }
    const data = typeof payload === 'object' && payload ? payload as Record<string, unknown> : {};
    return {
      merchantTxnRef: String(data.txnRef ?? data.orderId ?? ''),
      status: this.normalizeStatus(String(data.txnStatus ?? 'PENDING')),
      utr: data.utrNumber ? String(data.utrNumber) : undefined,
      providerPaymentId: data.axisTxnId ? String(data.axisTxnId) : undefined,
      raw: data,
    };
  }
}
