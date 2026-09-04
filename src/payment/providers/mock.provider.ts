import type {
  PaymentProvider,
  ProviderStatusResult,
  ProviderVerificationResult,
  ProviderWebhookResult,
} from './payment-provider.interface';

const mockStore = new Map<string, { createdAt: number; amount?: number }>();

export class MockBankProvider implements PaymentProvider {
  readonly name = 'mock';

  registerPending(merchantTxnRef: string, amount?: number) {
    mockStore.set(merchantTxnRef, { createdAt: Date.now(), amount });
  }

  async verifyPayment(merchantTxnRef: string): Promise<ProviderVerificationResult> {
    return this.getPaymentStatus(merchantTxnRef);
  }

  async getPaymentStatus(merchantTxnRef: string): Promise<ProviderStatusResult> {
    const entry = mockStore.get(merchantTxnRef);
    if (!entry) {
      return { merchantTxnRef, status: 'FAILED' };
    }

    const elapsed = Date.now() - entry.createdAt;
    if (elapsed < 15_000) {
      return { merchantTxnRef, status: 'PENDING' };
    }

    return {
      merchantTxnRef,
      status: 'COMPLETED',
      utr: `UTR${merchantTxnRef.slice(-8)}${Date.now().toString().slice(-6)}`,
      providerPaymentId: `MOCK${merchantTxnRef}`,
      raw: { mock: true, amount: entry.amount },
    };
  }

  async parseWebhook(payload: unknown, _signature: string): Promise<ProviderWebhookResult> {
    const data = typeof payload === 'object' && payload ? payload as Record<string, unknown> : {};
    const merchantTxnRef = String(data.merchantTxnRef ?? '');
    mockStore.delete(merchantTxnRef);
    return {
      merchantTxnRef,
      status: 'COMPLETED',
      utr: data.utr ? String(data.utr) : `UTR${merchantTxnRef}`,
      providerPaymentId: `MOCK${merchantTxnRef}`,
      raw: data,
    };
  }
}

export const mockBankProvider = new MockBankProvider();
