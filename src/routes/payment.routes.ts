import { Router } from "express";
import { requireAuth, requireAdmin } from "../core/authMiddleware";
import { PaymentIntent } from "../payment/payment.intent";

const router = Router();

router.post("/razorpay/order", requireAuth, PaymentIntent.createRazorpayOrder);
router.post("/razorpay/verify", requireAuth, PaymentIntent.verifyRazorpayPayment);

// Admin-only: list all payments and total amount
router.get("/admin/payments", requireAdmin, PaymentIntent.getAllPayments);

export default router;
