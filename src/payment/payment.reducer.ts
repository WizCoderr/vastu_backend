import { prisma } from "../core/prisma";
import { Result } from "../core/result";
import { EnrollmentRepository } from "../enrollment/enrollment.repository";
import { StudentPaymentStatus, EnrollmentStatus } from "../generated/prisma"; // Adjust import if needed

export class PaymentReducer {

    // -------------------------------------------------------------------------
    //  Payment Plans
    // -------------------------------------------------------------------------

    static async getCoursePaymentPlan(courseId: string) {
        const plans = await prisma.coursePaymentPlan.findMany({
            where: { courseId },
            orderBy: { orderIndex: 'asc' }
        });
        return Result.ok(plans);
    }

    static async getStudentPayments(userId: string, courseId: string) {
        const payments = await prisma.studentPayment.findMany({
            where: { userId, courseId },
            orderBy: { dueDate: 'asc' }
        });
        
        // Also get course total info
        const course = await prisma.course.findUnique({ 
            where: { id: courseId },
            select: { price: true, title: true }
        });

        return Result.ok({
            courseId,
            courseTitle: course?.title,
            totalFee: course ? Number(course.price) : 0,
            payments: payments.map(p => ({
                id: p.id,
                stage: p.stageName,
                amount: p.amount,
                status: p.status,
                dueDate: p.dueDate,
                paidAt: p.paidAt,
                razorpayOrderId: p.razorpayOrderId
            }))
        });
    }

    // -------------------------------------------------------------------------
    //  Enrollment Logic
    // -------------------------------------------------------------------------

    static async createRazorpayOrder(userId: string, courseId: string) {
        const course = await prisma.course.findUnique({ 
            where: { id: courseId },
            include: { paymentPlans: { orderBy: { orderIndex: 'asc' } } }
        });

        if (!course) return Result.fail("Course not found");
        if (!course.published) return Result.fail("Course is not available");

        const exists = await EnrollmentRepository.findEnrollment(userId, courseId);
        if (exists) return Result.fail("Already enrolled");

        try {
            const { createRazorpayOrder } = await import("../core/razorpayService");

            // Check for Payment Plans
            const now = new Date();
            const isPastEndDate = course.endDate && now > course.endDate;
            
            // Only use plan if it exists AND we haven't passed the endDate
            const hasPlan = course.paymentPlans.length > 0 && !isPastEndDate;
            
            let amountToPay = Number(course.price);
            let stageName = "Full Payment";
            let planId: string | undefined = undefined;

            if (hasPlan) {
                const firstStage = course.paymentPlans[0]; // Enrollment Stage
                amountToPay = firstStage.amount;
                stageName = firstStage.stageName;
                planId = firstStage.id;
            }

            // RECEIPT <= 40 CHAR SAFE
            const shortUser = userId.substring(0, 8);
            const receipt = `rcpt_${shortUser}_${Date.now().toString().slice(-6)}`;

            const order = await createRazorpayOrder(amountToPay, "INR", receipt);

            // If it's a payment plan, we should track the intent via StudentPayment (Stage 1)
            // But verify is separate. We can rely on verify logic or pre-create PENDING payment.
            // Let's pre-create to lock the orderId to the plan stage.
            
            if (hasPlan) {
                // Check if a pending payment exists for stage 1? No, user might retry.
                // Just create a new record.
                await prisma.studentPayment.create({
                    data: {
                        userId,
                        courseId,
                        planId: planId, // Could be null if full payment logic used, but here we have plan
                        stageName: stageName,
                        amount: amountToPay,
                        razorpayOrderId: order.id,
                        status: "PENDING",
                        // Due immediately
                        dueDate: new Date(), 
                    }
                });
            }

            return Result.ok({
                orderId: order.id,
                amount: order.amount, // razorpay amount (paise)
                currency: order.currency,
                keyId: process.env.RAZORPAY_KEY_ID,
                isInstallment: hasPlan,
                stageName: stageName
            });

        } catch (error: any) {
            return Result.fail(`Razorpay order creation failed: ${error.message}`);
        }
    }

    static async verifyRazorpayPayment(userId: string, courseId: string, orderId: string, paymentId: string, signature: string) {
        try {
            const { verifyRazorpaySignature } = await import("../core/razorpayService");
            const valid = verifyRazorpaySignature(orderId, paymentId, signature);
            if (!valid) return Result.fail("Invalid payment signature");

            const course = await prisma.course.findUnique({ 
                where: { id: courseId },
                include: { paymentPlans: { orderBy: { orderIndex: 'asc' } } }
            });

            if (!course) return Result.fail("Course not found");

            // Check if this was a staged payment
            const studentPayment = await prisma.studentPayment.findFirst({
                where: { razorpayOrderId: orderId }
            });

            if (studentPayment) {
                // 1. Update StudentPayment status
                await prisma.studentPayment.update({
                    where: { id: studentPayment.id },
                    data: {
                        status: "PAID",
                        razorpayPaymentId: paymentId,
                        paidAt: new Date()
                    }
                });

                // 2. Enrollment Logic
                const enrollmentExists = await EnrollmentRepository.findEnrollment(userId, courseId);
                
                // If this is the FIRST payment (Enrollment Stage), create enrollment
                if (!enrollmentExists) {
                     await EnrollmentRepository.createEnrollment(userId, courseId);
                     
                     // 3. Generate Future Payments
                     if (course.paymentPlans.length > 1) {
                        const enrollmentDate = new Date();
                        
                        // Skip first stage (index 0)
                        const futureStages = course.paymentPlans.slice(1);
                        
                        for (const stage of futureStages) {
                            const dueDate = new Date(enrollmentDate);
                            dueDate.setDate(dueDate.getDate() + stage.dueAfterDays);

                            await prisma.studentPayment.create({
                                data: {
                                    userId,
                                    courseId,
                                    planId: stage.id,
                                    stageName: stage.stageName,
                                    amount: stage.amount,
                                    status: "PENDING",
                                    dueDate: dueDate,
                                    // razorpayOrderId is null until they click 'Pay' for this stage
                                }
                            });
                        }
                     }
                } else {
                    // Just a regular installment payment success
                    // If any other payments were OVERDUE, re-check access?
                    // The access check relies on enrollment status.
                    // If all overdue payments are cleared, set enrollment status to ACTIVE.
                    
                    const overduePayments = await prisma.studentPayment.count({
                        where: {
                            userId,
                            courseId,
                            status: "OVERDUE"
                        }
                    });

                    if (overduePayments === 0) {
                         await prisma.enrollment.update({
                            where: { userId_courseId: { userId, courseId } },
                            data: { status: "ACTIVE" } // using string literal or enum
                         });
                    }
                }

                return Result.ok({ paymentId: studentPayment.id, status: "PAID" });

            } else {
                // LEGACY / FULL PAYMENT FLOW
                // No pre-created StudentPayment found, so it must be a direct full payment or legacy flow.
                
                // Create legacy Payment record
                const payment = await prisma.payment.create({
                    data: {
                        userId,
                        courseId,
                        amount: Number(course.price),
                        type: "COURSE",
                        provider: "RAZORPAY",
                        status: "COMPLETED",
                        providerOrderId: orderId,
                        providerPaymentId: paymentId,
                        providerSignature: signature
                    }
                });

                await EnrollmentRepository.createEnrollment(userId, courseId);

                return Result.ok(payment.id);
            }

        } catch (error: any) {
            if (error.code === "P2002") return Result.ok("Already enrolled");
            return Result.fail(`Verification failed: ${error.message}`);
        }
    }

    // -------------------------------------------------------------------------
    //  Installment Payments
    // -------------------------------------------------------------------------

    static async payInstallment(userId: string, paymentId: string) {
        // Find the pending payment
        const payment = await prisma.studentPayment.findUnique({
            where: { id: paymentId }
        });

        if (!payment) return Result.fail("Payment record not found");
        if (payment.userId !== userId) return Result.fail("Unauthorized");
        if (payment.status === "PAID") return Result.fail("Already paid");

        // Create Razorpay Order for this specific installment
        try {
            const { createRazorpayOrder } = await import("../core/razorpayService");
            
            const receipt = `inst_${payment.id.substring(0,8)}_${Date.now().toString().slice(-6)}`;
            
            const order = await createRazorpayOrder(payment.amount, "INR", receipt);
            
            // Update the record with the new order ID
            await prisma.studentPayment.update({
                where: { id: paymentId },
                data: {
                    razorpayOrderId: order.id
                }
            });

             return Result.ok({
                orderId: order.id,
                amount: order.amount,
                currency: order.currency,
                keyId: process.env.RAZORPAY_KEY_ID,
                stageName: payment.stageName
            });

        } catch (error: any) {
            return Result.fail(`Installment order creation failed: ${error.message}`);
        }
    }

    // -------------------------------------------------------------------------
    //  Legacy / Free
    // -------------------------------------------------------------------------

    static async createFreeEnrollment(userId: string, courseId: string) {
        try {
            const course = await prisma.course.findUnique({ where: { id: courseId } });
            if (!course) return Result.fail("Course not found");

            if (course.price !== "0" && course.price !== "0.00" && parseInt(course.price) !== 0) {
                return Result.fail("Course is not free");
            }

            const existing = await EnrollmentRepository.findEnrollment(userId, courseId);
            if (existing) return Result.fail("Already enrolled");

            const payment = await prisma.payment.create({
                data: {
                    userId,
                    courseId,
                    amount: 0,
                    type: "COURSE",
                    provider: "RAZORPAY",
                    status: "COMPLETED",
                    providerOrderId: "FREE_ENROLLMENT"
                }
            });

            await EnrollmentRepository.createEnrollment(userId, courseId);

            return Result.ok(payment.id);

        } catch (error: any) {
            if (error.code === "P2002") return Result.ok("Already enrolled");
            return Result.fail(`Free enrollment failed: ${error.message}`);
        }
    }

    static async getAllPayments() {
        // Admin View
        const payments = await prisma.payment.findMany({
            orderBy: { createdAt: 'desc' },
            take: 50
        });

        return Result.ok({ payments });
    }
}
