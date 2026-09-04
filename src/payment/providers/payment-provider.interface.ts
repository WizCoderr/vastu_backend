export type ProviderPaymentStatus = 'PENDING' | 'COMPLETED' | 'FAILED';

export interface ProviderVerificationResult {
  status: ProviderPaymentStatus;
  utr?: string;
  providerPaymentId?: string;
  raw?: unknown;
}

export interface ProviderStatusResult extends ProviderVerificationResult {
  merchantTxnRef: string;
}

export interface ProviderWebhookResult extends ProviderVerificationResult {
  merchantTxnRef: string;
}

export interface PaymentProvider {
  readonly name: string;
  verifyPayment(merchantTxnRef: string): Promise<ProviderVerificationResult>;
  getPaymentStatus(merchantTxnRef: string): Promise<ProviderStatusResult>;
  parseWebhook(payload: unknown, signature: string): Promise<ProviderWebhookResult>;
}
