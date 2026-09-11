import { Router } from "express";
import { requireAuth, requireAdmin } from "../core/authMiddleware";
import { PaymentIntent } from "../payment/payment.intent";
import { PaymentWebhookIntent } from "../payment/payment-webhook.intent";
import {
  paymentCreateRateLimit,
  paymentVerifyRateLimit,
  webhookRateLimit,
} from "../middleware/rate-limit.middleware";

const router = Router();

// API Discovery
router.get("/", PaymentIntent.getPaymentApis);

// Webhooks (no auth — signature verified in handler)
router.post("/webhook/:bank", webhookRateLimit, PaymentWebhookIntent.handleWebhook);

// PayU browser callback + S2S webhook (form-urlencoded)
router.post("/payu/callback", webhookRateLimit, PaymentIntent.handlePayuCallback);
router.post("/payu/webhook", webhookRateLimit, PaymentIntent.handlePayuWebhook);
router.post("/payu/hash", requireAuth, paymentCreateRateLimit, PaymentIntent.generatePayuHash);
router.get("/payu/status/:txnid", requireAuth, paymentVerifyRateLimit, PaymentIntent.getPayuStatus);

// =============================================================================
//  UPI PAYMENTS (STUDENT) — legacy when PAYMENT_PROVIDER=upi
// =============================================================================
router.post("/create", requireAuth, paymentCreateRateLimit, PaymentIntent.createPayment);
router.post("/verify", requireAuth, paymentVerifyRateLimit, PaymentIntent.verifyPayment);
router.get("/status/:transactionId", requireAuth, paymentVerifyRateLimit, PaymentIntent.getPaymentStatus);
router.get("/history", requireAuth, PaymentIntent.getPaymentHistory);
router.get("/invoices/:id/download", requireAuth, PaymentIntent.downloadInvoice);

// =============================================================================
//  COURSE PAYMENTS (STUDENT)
// =============================================================================
router.post("/free-enroll", requireAuth, PaymentIntent.freeEnroll);
router.post("/course/order", requireAuth, paymentCreateRateLimit, PaymentIntent.createCourseOrder);
router.post("/course/verify", requireAuth, paymentVerifyRateLimit, PaymentIntent.verifyCoursePayment);
router.get("/course/plan/:courseId", PaymentIntent.getCoursePaymentPlan);
router.get("/course/:courseId/my-payments", requireAuth, PaymentIntent.getStudentPayments);
router.post(
  "/course/installment/:paymentId",
  requireAuth,
  paymentCreateRateLimit,
  PaymentIntent.payInstallment,
);
// Plan aliases
router.get("/plan/:courseId", PaymentIntent.getCoursePaymentPlan);
router.post(
  "/installment/order",
  requireAuth,
  paymentCreateRateLimit,
  PaymentIntent.payInstallment,
);

// =============================================================================
//  REMIDIES PAYMENTS (STUDENT)
// =============================================================================
router.post("/remidies/order", requireAuth, paymentCreateRateLimit, PaymentIntent.createRemidiesOrder);
router.post("/remidies/verify", requireAuth, paymentVerifyRateLimit, PaymentIntent.verifyRemidiesPayment);

// =============================================================================
//  ADMIN ROUTES
// =============================================================================
router.get("/admin/transactions", requireAdmin, PaymentIntent.getAdminTransactions);
router.post("/admin/reconcile", requireAdmin, PaymentIntent.reconcilePayment);
router.post(
  "/admin/refund/:paymentId",
  requireAdmin,
  paymentCreateRateLimit,
  PaymentIntent.refundPayment,
);
router.get("/admin/export", requireAdmin, PaymentIntent.exportTransactions);
router.get("/admin/course-payments", requireAdmin, PaymentIntent.getAllCoursePayments);
router.get("/admin/remidies-payments", requireAdmin, PaymentIntent.getAllRemidiesPayments);
router.get("/admin/all", requireAdmin, PaymentIntent.getAllPayments);

export default router;
