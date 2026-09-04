import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth, requireAdmin } from "../core/authMiddleware";
import { PaymentIntent } from "../payment/payment.intent";
import { PaymentWebhookIntent } from "../payment/payment-webhook.intent";

const router = Router();

const paymentRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many payment requests' },
});

// API Discovery
router.get("/", PaymentIntent.getPaymentApis);

// Webhooks (no auth — signature verified in handler)
router.post("/webhook/:bank", PaymentWebhookIntent.handleWebhook);

// =============================================================================
//  UPI PAYMENTS (STUDENT)
// =============================================================================
router.post("/create", requireAuth, paymentRateLimit, PaymentIntent.createPayment);
router.post("/verify", requireAuth, paymentRateLimit, PaymentIntent.verifyPayment);
router.get("/status/:transactionId", requireAuth, paymentRateLimit, PaymentIntent.getPaymentStatus);
router.get("/history", requireAuth, PaymentIntent.getPaymentHistory);
router.get("/invoices/:id/download", requireAuth, PaymentIntent.downloadInvoice);

// =============================================================================
//  COURSE PAYMENTS (STUDENT)
// =============================================================================
router.post("/free-enroll", requireAuth, PaymentIntent.freeEnroll);
router.post("/course/order", requireAuth, PaymentIntent.createRazorpayOrder);
router.post("/course/verify", requireAuth, PaymentIntent.verifyRazorpayPayment);

// =============================================================================
//  REMIDIES PAYMENTS (STUDENT)
// =============================================================================
router.post("/remidies/order", requireAuth, PaymentIntent.createRemidiesOrder);
router.post("/remidies/verify", requireAuth, PaymentIntent.verifyRemidiesPayment);

// =============================================================================
//  ADMIN ROUTES
// =============================================================================
router.get("/admin/transactions", requireAdmin, PaymentIntent.getAdminTransactions);
router.post("/admin/reconcile", requireAdmin, PaymentIntent.reconcilePayment);
router.get("/admin/export", requireAdmin, PaymentIntent.exportTransactions);
router.get("/admin/course-payments", requireAdmin, PaymentIntent.getAllCoursePayments);
router.get("/admin/remidies-payments", requireAdmin, PaymentIntent.getAllRemidiesPayments);
router.get("/admin/all", requireAdmin, PaymentIntent.getAllPayments);

export default router;
