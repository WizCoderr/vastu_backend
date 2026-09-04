import { Response } from 'express';
import { getPaymentProvider } from './providers/provider.factory';
import { UpiPaymentService } from './upi-payment.service';
import { PaymentReducer } from './payment.reducer';
import { paymentLogger } from '../config/logger';
import { verifyRazorpayWebhookSignature } from '../core/razorpayService';

type WebhookRequest = {
  params: { bank: string };
  body: unknown;
  headers: Record<string, string | string[] | undefined>;
};

function headerValue(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string {
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

export class PaymentWebhookIntent {
  static async handleWebhook(req: WebhookRequest, res: Response) {
    const { bank } = req.params;

    if (bank === 'razorpay') {
      return PaymentWebhookIntent.handleRazorpayWebhook(req, res);
    }

    try {
      const signature = String(
        req.headers['x-signature'] ?? req.headers['x-webhook-signature'] ?? '',
      );
      const provider = getPaymentProvider();

      if (provider.name !== bank && bank !== 'mock') {
        return res.status(400).json({ error: 'Unknown bank provider' });
      }

      const result = await provider.parseWebhook(req.body, signature);
      await UpiPaymentService.applyVerificationResult(result.merchantTxnRef, result);

      paymentLogger.info('Webhook processed', {
        bank,
        merchantTxnRef: result.merchantTxnRef,
        status: result.status,
      });
      return res.json({ success: true });
    } catch (error: any) {
      paymentLogger.error('Webhook failed', { error: error.message });
      return res.status(400).json({ error: error.message });
    }
  }

  static async handleRazorpayWebhook(req: WebhookRequest, res: Response) {
    try {
      const signature = headerValue(req.headers, 'x-razorpay-signature');
      const rawBody =
        Buffer.isBuffer(req.body)
          ? req.body
          : typeof req.body === 'string'
            ? Buffer.from(req.body)
            : Buffer.from(JSON.stringify(req.body ?? {}));

      if (!verifyRazorpayWebhookSignature(rawBody, signature)) {
        paymentLogger.warn('Razorpay webhook signature invalid');
        return res.status(400).json({ error: 'Invalid webhook signature' });
      }

      const payload =
        Buffer.isBuffer(req.body) || typeof req.body === 'string'
          ? JSON.parse(rawBody.toString('utf8'))
          : (req.body as Record<string, unknown>);

      const event = String(payload?.event ?? '');
      if (event !== 'payment.captured' && event !== 'order.paid') {
        return res.json({ success: true, ignored: true, event });
      }

      const paymentEntity =
        (payload?.payload as any)?.payment?.entity ??
        (payload?.payload as any)?.order?.entity;

      const rzpPaymentId = String(paymentEntity?.id ?? '');
      const rzpOrderId = String(
        paymentEntity?.order_id ?? paymentEntity?.id ?? '',
      );

      if (!rzpOrderId) {
        return res.status(400).json({ error: 'Missing order id in webhook' });
      }

      // Prefer product payment; fall back to course/installment
      const remidies = await PaymentReducer.fulfillRemidiesPaymentByRazorpayOrder(
        rzpOrderId,
        rzpPaymentId || rzpOrderId,
      );

      if (remidies.success) {
        paymentLogger.info('Razorpay webhook fulfilled remidies payment', {
          rzpOrderId,
          rzpPaymentId,
        });
        return res.json({ success: true, type: 'PRODUCT' });
      }

      const course = await PaymentReducer.fulfillCoursePaymentByRazorpayOrder(
        rzpOrderId,
        rzpPaymentId || rzpOrderId,
      );

      if (course.success) {
        paymentLogger.info('Razorpay webhook fulfilled course payment', {
          rzpOrderId,
          rzpPaymentId,
        });
        return res.json({ success: true, type: 'COURSE' });
      }

      paymentLogger.warn('Razorpay webhook payment not found', {
        rzpOrderId,
        remidiesError: remidies.error,
        courseError: course.error,
      });
      // Ack so Razorpay does not retry forever for unknown orders
      return res.json({ success: true, matched: false });
    } catch (error: any) {
      paymentLogger.error('Razorpay webhook failed', { error: error.message });
      return res.status(400).json({ error: error.message });
    }
  }
}
