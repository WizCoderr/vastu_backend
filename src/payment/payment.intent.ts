import { Response } from "express";
import { AuthRequest } from "../core/authMiddleware";
import { PaymentReducer } from "./payment.reducer";

export class PaymentIntent {

    static async createRazorpayOrder(req: AuthRequest, res: Response) {
        if (!req.user) return res.status(401).json({ error: "Unauthorized" });

        try {
            const { courseId } = req.body;
            if (!courseId) return res.status(400).json({ error: "courseId is required" });

            const result = await PaymentReducer.createRazorpayOrder(req.user.userId, courseId);

            return result.success
                ? res.json(result.data)
                : res.status(400).json({ error: result.error });

        } catch {
            res.status(500).json({ error: "Internal order creation error" });
        }
    }

    static async verifyRazorpayPayment(req: AuthRequest, res: Response) {
        if (!req.user) return res.status(401).json({ error: "Unauthorized" });

        try {
            const { razorpay_order_id, razorpay_payment_id, razorpay_signature, courseId } = req.body;

            if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !courseId)
                return res.status(400).json({ error: "Incomplete payment details" });

            const result = await PaymentReducer.verifyRazorpayPayment(
                req.user.userId, courseId,
                razorpay_order_id, razorpay_payment_id, razorpay_signature
            );

            return result.success
                ? res.json(result.data)
                : res.status(400).json({ error: result.error });

        } catch {
            res.status(500).json({ error: "Payment verification failed" });
        }
    }

    // --- Remedies Payments ---

    static async createRemidiesOrder(req: AuthRequest, res: Response) {
        if (!req.user) return res.status(401).json({ error: "Unauthorized" });
        try {
            const { orderId } = req.body;
            if (!orderId) return res.status(400).json({ error: "orderId is required" });

            const result = await PaymentReducer.createRemidiesOrder(req.user.userId, orderId);
            return result.success ? res.json(result.data) : res.status(400).json({ error: result.error });
        } catch {
            res.status(500).json({ error: "Remidies order payment creation failed" });
        }
    }

    static async verifyRemidiesPayment(req: AuthRequest, res: Response) {
        if (!req.user) return res.status(401).json({ error: "Unauthorized" });
        try {
            const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;
            if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !orderId)
                return res.status(400).json({ error: "Incomplete payment details" });

            const result = await PaymentReducer.verifyRemidiesPayment(
                req.user.userId, orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature
            );
            return result.success ? res.json(result.data) : res.status(400).json({ error: result.error });
        } catch {
            res.status(500).json({ error: "Remidies payment verification failed" });
        }
    }

    // --- Admin Methods ---

    static async getAllCoursePayments(req: AuthRequest, res: Response) {
        try {
            const result = await PaymentReducer.getAllCoursePayments();
            return result.success ? res.json(result.data) : res.status(400).json({ error: result.error });
        } catch {
            res.status(500).json({ error: "Failed to fetch course payments" });
        }
    }

    static async getAllRemidiesPayments(req: AuthRequest, res: Response) {
        try {
            const result = await PaymentReducer.getAllRemidiesPayments();
            return result.success ? res.json(result.data) : res.status(400).json({ error: result.error });
        } catch {
            res.status(500).json({ error: "Failed to fetch remedies payments" });
        }
    }

    static async getAllPayments(req: AuthRequest, res: Response) {
        try {
            const result = await PaymentReducer.getCentralizedPayments();
            return result.success ? res.json(result.data) : res.status(400).json({ error: result.error });
        } catch {
            res.status(500).json({ error: "Failed to fetch centralized payments" });
        }
    }

    // --- Student Methods ---

    static async getCoursePaymentPlan(req: AuthRequest, res: Response) {
        try {
            const { courseId } = req.params;
            const result = await PaymentReducer.getCoursePaymentPlan(courseId);
            return result.success ? res.json(result.data) : res.status(400).json(result);
        } catch {
            res.status(500).json({ error: "Failed to fetch plan" });
        }
    }

    static async getStudentPayments(req: AuthRequest, res: Response) {
        if (!req.user) return res.status(401).json({ error: "Unauthorized" });
        try {
            const { courseId } = req.params;
            const result = await PaymentReducer.getStudentPayments(req.user.userId, courseId);
            return result.success ? res.json(result.data) : res.status(400).json(result);
        } catch {
            res.status(500).json({ error: "Failed to fetch student payments" });
        }
    }

    static async payInstallment(req: AuthRequest, res: Response) {
        if (!req.user) return res.status(401).json({ error: "Unauthorized" });
        try {
            const { paymentId } = req.params;
            const result = await PaymentReducer.payInstallment(req.user.userId, paymentId);
            return result.success ? res.json(result.data) : res.status(400).json(result);
        } catch {
            res.status(500).json({ error: "Failed to initiate installment payment" });
        }
    }

    static async freeEnroll(req: AuthRequest, res: Response) {
        if (!req.user) return res.status(401).json({ error: "Unauthorized" });
        try {
            const { courseId } = req.body;
            if (!courseId) return res.status(400).json({ error: "courseId is required" });

            const result = await PaymentReducer.freeEnroll(req.user.userId, courseId);
            return result.success
                ? res.json({ success: true })
                : res.status(400).json({ error: result.error });
        } catch {
            res.status(500).json({ error: "Free enrollment failed" });
        }
    }

    static async getPaymentApis(req: any, res: Response) {
        const apis = {
            student: [
                { method: "POST", path: "/api/payment/course/order", description: "Create Razorpay order for course enrollment (Full Payment)" },
                { method: "POST", path: "/api/payment/course/verify", description: "Verify Razorpay payment and enroll student" },
                { method: "GET", path: "/api/payment/course/:courseId/plan", description: "Get available payment plans for a course" },
                { method: "GET", path: "/api/payment/course/:courseId/my-payments", description: "Get student's payment history for a course" },
                { method: "POST", path: "/api/payment/course/installment/:paymentId/pay", description: "Pay a pending course installment" },
                { method: "POST", path: "/api/payment/remidies/order", description: "Create order for products" },
                { method: "POST", path: "/api/payment/remidies/verify", description: "Verify product payment" }
            ],
            admin: [
                { method: "GET", path: "/api/payment/admin/all", description: "Unified view of all payments" },
                { method: "GET", path: "/api/payment/admin/course-payments", description: "List all course enrollments" },
                { method: "GET", path: "/api/payment/admin/remidies-payments", description: "List all product sales" }
            ],
            instructor: [
                { method: "POST", path: "/api/instructor/courses", description: "Create course with enrollment windows" },
                { method: "PUT", path: "/api/instructor/courses/:courseId", description: "Update enrollment windows and fees" }
            ]
        };
        res.json({ success: true, data: apis });
    }
}
