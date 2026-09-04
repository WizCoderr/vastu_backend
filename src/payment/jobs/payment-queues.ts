import { Queue } from 'bullmq';
import type Redis from 'ioredis';
import { config } from '../../core/config';
import { createRedisDuplicate } from '../../config/redis';

let paymentVerifyQueue: Queue | null = null;
let invoiceGenerateQueue: Queue | null = null;
let reconciliationQueue: Queue | null = null;

function getConnection(): Redis {
  const connection = createRedisDuplicate();
  if (!connection) {
    throw new Error('Redis is required for payment queues');
  }
  return connection;
}

function getPaymentVerifyQueue(): Queue {
  if (!paymentVerifyQueue) {
    paymentVerifyQueue = new Queue('payment-verify', {
      connection: getConnection(),
      defaultJobOptions: {
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 500 },
      },
    });
  }
  return paymentVerifyQueue;
}

function getInvoiceGenerateQueue(): Queue {
  if (!invoiceGenerateQueue) {
    invoiceGenerateQueue = new Queue('invoice-generate', {
      connection: getConnection(),
      defaultJobOptions: {
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 200 },
      },
    });
  }
  return invoiceGenerateQueue;
}

function getReconciliationQueue(): Queue {
  if (!reconciliationQueue) {
    reconciliationQueue = new Queue('reconciliation', {
      connection: getConnection(),
    });
  }
  return reconciliationQueue;
}

export async function enqueuePaymentVerification(merchantTxnRef: string, delayMs = 5000) {
  if (!config.redis.enabled) return;

  await getPaymentVerifyQueue().add(
    'verify',
    { merchantTxnRef },
    {
      jobId: `verify-${merchantTxnRef}`,
      delay: delayMs,
      attempts: config.queue.paymentVerifyAttempts,
      backoff: { type: 'exponential', delay: config.queue.paymentVerifyBackoffMs },
    },
  );
}

export async function enqueueInvoiceGeneration(paymentId: string) {
  if (!config.redis.enabled) return;

  await getInvoiceGenerateQueue().add('generate', { paymentId }, {
    jobId: `invoice-${paymentId}`,
  });
}

export { getPaymentVerifyQueue, getInvoiceGenerateQueue, getReconciliationQueue };
