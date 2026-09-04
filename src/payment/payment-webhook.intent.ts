import { Response } from 'express';
import { getPaymentProvider } from './providers/provider.factory';
import { UpiPaymentService } from './upi-payment.service';
import { paymentLogger } from '../config/logger';

export class PaymentWebhookIntent {
  static async handleWebhook(req: { params: { bank: string }; body: unknown; headers: Record<string, string | string[] | undefined> }, res: Response) {
    try {
      const { bank } = req.params;
      const signature = String(req.headers['x-signature'] ?? req.headers['x-webhook-signature'] ?? '');
      const provider = getPaymentProvider();

      if (provider.name !== bank && bank !== 'mock') {
        return res.status(400).json({ error: 'Unknown bank provider' });
      }

      const result = await provider.parseWebhook(req.body, signature);
      await UpiPaymentService.applyVerificationResult(result.merchantTxnRef, result);

      paymentLogger.info('Webhook processed', { bank, merchantTxnRef: result.merchantTxnRef, status: result.status });
      return res.json({ success: true });
    } catch (error: any) {
      paymentLogger.error('Webhook failed', { error: error.message });
      return res.status(400).json({ error: error.message });
    }
  }
}
