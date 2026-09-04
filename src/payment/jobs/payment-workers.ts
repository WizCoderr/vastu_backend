import { Worker, type Job } from 'bullmq';
import { config } from '../../core/config';
import { createRedisDuplicate, closeRedis } from '../../config/redis';
import { getPaymentProvider } from '../providers/provider.factory';
import { mockBankProvider } from '../providers/mock.provider';
import { UpiPaymentService } from '../upi-payment.service';
import { InvoiceService } from '../invoice/invoice.service';
import { paymentLogger } from '../../config/logger';
import { prisma } from '../../core/prisma';
import { isPaymentExpired } from '../upi/payment-ref.util';
import { withPaymentLock } from './payment-lock';
import {
  getReconciliationQueue,
  enqueuePaymentVerification,
} from './payment-queues';

const workers: Worker[] = [];

async function handlePaymentVerification(job: Job<{ merchantTxnRef: string }>) {
  const { merchantTxnRef } = job.data;

  await withPaymentLock(merchantTxnRef, async () => {
    paymentLogger.info('Verifying payment', { merchantTxnRef, attempt: job.attemptsMade + 1 });

    const payment = await prisma.payment.findFirst({ where: { merchantTxnRef } });
    const studentPayment = payment
      ? null
      : await prisma.studentPayment.findFirst({ where: { merchantTxnRef } });

    if (!payment && !studentPayment) {
      paymentLogger.warn('Payment not found for verification', { merchantTxnRef });
      return;
    }

    if (payment?.status === 'COMPLETED' || studentPayment?.status === 'PAID') {
      return;
    }

    const expiresAt = payment?.expiresAt ?? studentPayment?.expiresAt;
    if (isPaymentExpired(expiresAt)) {
      if (payment) {
        await prisma.payment.update({
          where: { id: payment.id },
          data: { status: 'FAILED', failureReason: 'Payment expired' },
        });
      } else if (studentPayment) {
        await prisma.studentPayment.update({
          where: { id: studentPayment.id },
          data: { status: 'FAILED' },
        });
      }
      return;
    }

    const provider = getPaymentProvider();
    const result = await provider.verifyPayment(merchantTxnRef);

    if (result.status === 'PENDING') {
      throw new Error('Payment still pending');
    }

    await UpiPaymentService.applyVerificationResult(merchantTxnRef, result);
  });
}

async function handleInvoiceGeneration(job: Job<{ paymentId: string }>) {
  await InvoiceService.generateForPayment(job.data.paymentId);
}

async function handleReconciliation() {
  const duplicateUtrs = await prisma.$queryRaw<Array<{ utr: string; count: bigint }>>`
    SELECT utr, COUNT(*) as count
    FROM "Payment"
    WHERE utr IS NOT NULL
    GROUP BY utr
    HAVING COUNT(*) > 1
  `;

  if (duplicateUtrs.length > 0) {
    paymentLogger.warn('Duplicate UTRs detected', { duplicateUtrs });
  }
}

export function shouldRunPaymentWorkers(): boolean {
  if (!config.redis.enabled) return false;
  if (config.process.role === 'api') return false;
  if (config.process.role === 'worker') return true;
  return config.process.runPaymentWorkers;
}

export function startPaymentWorkers() {
  if (!shouldRunPaymentWorkers() || workers.length > 0) return;

  const connection = createRedisDuplicate();
  if (!connection) {
    paymentLogger.warn('Payment workers not started — Redis unavailable');
    return;
  }

  const workerOpts = {
    connection,
    concurrency: config.queue.paymentVerifyConcurrency,
  };

  workers.push(
    new Worker('payment-verify', handlePaymentVerification, workerOpts),
    new Worker('invoice-generate', handleInvoiceGeneration, {
      connection: createRedisDuplicate()!,
      concurrency: config.queue.invoiceConcurrency,
    }),
    new Worker('reconciliation', handleReconciliation, {
      connection: createRedisDuplicate()!,
      concurrency: 1,
    }),
  );

  getReconciliationQueue().add('daily', {}, {
    repeat: { pattern: '0 2 * * *' },
    jobId: 'daily-reconciliation',
  }).catch((err) => {
    paymentLogger.error('Failed to schedule reconciliation job', { error: err.message });
  });

  paymentLogger.info('Payment workers started', {
    verifyConcurrency: config.queue.paymentVerifyConcurrency,
    invoiceConcurrency: config.queue.invoiceConcurrency,
    role: config.process.role,
  });
}

export async function stopPaymentWorkers(): Promise<void> {
  await Promise.all(workers.map((w) => w.close()));
  workers.length = 0;
  await closeRedis();
}

export function registerMockPayment(merchantTxnRef: string, amount?: number) {
  if (config.upi.bankProvider === 'mock') {
    mockBankProvider.registerPending(merchantTxnRef, amount);
  }
}

export { enqueuePaymentVerification };
