import { z } from 'zod';

export const createPaymentSchema = z.object({
  amount: z.number().positive().max(10_000_000).optional(),
  description: z.string().min(1).max(120),
  orderId: z.string().uuid().optional(),
  courseId: z.string().uuid().optional(),
}).refine(
  (data) => Boolean(data.orderId || data.courseId),
  { message: 'orderId or courseId is required' },
);

export const verifyPaymentSchema = z.object({
  transactionId: z.string().regex(/^[A-Z0-9_-]{8,64}$/i),
});

export const reconcilePaymentSchema = z.object({
  paymentId: z.string().uuid(),
  utr: z.string().regex(/^[A-Z0-9]{6,32}$/i),
});

export const transactionIdParamSchema = z.object({
  transactionId: z.string().regex(/^[A-Z0-9_-]{8,64}$/i),
});

export const adminTransactionsQuerySchema = z.object({
  status: z.enum(['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
