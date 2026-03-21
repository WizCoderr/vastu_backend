import { Router } from "express";
import { requireAuth, requireAdmin } from "../core/authMiddleware";
import { PaymentIntent } from "../payment/payment.intent";

const router = Router();

// =============================================================================
//  COURSE PAYMENTS (STUDENT)
// =============================================================================
router.post("/course/order", requireAuth, PaymentIntent.createRazorpayOrder);
router.post("/course/verify", requireAuth, PaymentIntent.verifyRazorpayPayment);
router.get("/course/:courseId/plan", PaymentIntent.getCoursePaymentPlan);
router.get("/course/:courseId/my-payments", requireAuth, PaymentIntent.getStudentPayments);
router.post("/course/installment/:paymentId/pay", requireAuth, PaymentIntent.payInstallment);

// =============================================================================
//  REMIDIES PAYMENTS (STUDENT)
// =============================================================================
router.post("/remidies/order", requireAuth, PaymentIntent.createRemidiesOrder);
router.post("/remidies/verify", requireAuth, PaymentIntent.verifyRemidiesPayment);

// =============================================================================
//  ADMIN ROUTES
// =============================================================================
// Admin Course Payments
router.get("/admin/course-payments", requireAdmin, PaymentIntent.getAllCoursePayments);

// Admin Remidies Payments
router.get("/admin/remidies-payments", requireAdmin, PaymentIntent.getAllRemidiesPayments);

// Centralized Admin Payments (Unified)
router.get("/admin/all", requireAdmin, PaymentIntent.getAllPayments);

export default router;
