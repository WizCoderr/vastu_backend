import { Router } from 'express';
import { requireAuth } from '../core/authMiddleware';
import { PaymentIntent } from '../payment/payment.intent';


const router = Router();



// --- Razorpay Endpoints ---

router.post('/razorpay/order', requireAuth, PaymentIntent.createRazorpayOrder as any);

router.post('/razorpay/verify', requireAuth, PaymentIntent.verifyRazorpayPayment as any);

export default router;
