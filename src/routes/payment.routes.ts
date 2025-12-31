import { Router } from "express";
import { requireAuth } from "../core/authMiddleware";
import { PaymentIntent } from "../payment/payment.intent";

const router = Router();

router.post("/razorpay/order", requireAuth, PaymentIntent.createRazorpayOrder);
router.post("/razorpay/verify", requireAuth, PaymentIntent.verifyRazorpayPayment);

export default router;
