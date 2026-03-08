import { Router } from "express";
import { requireAuth, requireAdmin } from "../core/authMiddleware";
import { PaymentIntent } from "../payment/payment.intent";

const router = Router();

router.post("/razorpay/order", requireAuth, PaymentIntent.createRazorpayOrder);
router.post("/razorpay/verify", requireAuth, PaymentIntent.verifyRazorpayPayment);
router.post("/free-enroll", requireAuth, PaymentIntent.createFreeEnrollment);

// Payment Plans
router.get("/courses/:courseId/payment-plan", PaymentIntent.getCoursePaymentPlan);
router.post("/courses/:courseId/enroll", requireAuth, PaymentIntent.createRazorpayOrder); // Alias for enrollment

// Student Payments
router.get("/student/course-payments/:courseId", requireAuth, PaymentIntent.getStudentPayments);
router.post("/student/course-payments/:paymentId/pay", requireAuth, PaymentIntent.payInstallment);

// Admin-only: list all payments and total amount
router.get("/admin/payments", requireAdmin, PaymentIntent.getAllPayments);

export default router;
