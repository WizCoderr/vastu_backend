import { prisma } from "../core/prisma";
import { Result } from "../core/result";
import { EnrollmentRepository } from "../enrollment/enrollment.repository";
import { EmailService } from "../notification/email.service";
import { WhatsAppService } from "../notification/whatsapp.service";
import { WhatsAppMessages } from "../notification/whatsapp.messages";

export class PaymentReducer {
  // -------------------------------------------------------------------------
  //  Payment Plans
  // -------------------------------------------------------------------------

  static async getCoursePaymentPlan(courseId: string) {
    const plans = await prisma.coursePaymentPlan.findMany({
      where: { courseId },
      orderBy: { orderIndex: "asc" },
    });
    return Result.ok(plans);
  }

  static async getStudentPayments(userId: string, courseId: string) {
    const payments = await prisma.studentPayment.findMany({
      where: { userId, courseId },
      orderBy: { dueDate: "asc" },
    });

    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { price: true, title: true },
    });

    return Result.ok({
      courseId,
      courseTitle: course?.title,
      totalFee: course ? Number(course.price) : 0,
      payments: payments.map((p) => ({
        id: p.id,
        stage: p.stageName,
        amount: p.amount,
        status: p.status,
        dueDate: p.dueDate,
        paidAt: p.paidAt,
        razorpayOrderId: p.razorpayOrderId,
      })),
    });
  }

  // -------------------------------------------------------------------------
  //  Free Enrollment
  // -------------------------------------------------------------------------

  static async freeEnroll(userId: string, courseId: string) {
    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course) return Result.fail("Course not found");
    if (!course.published) return Result.fail("Course is not available");

    const existing = await EnrollmentRepository.findEnrollment(userId, courseId);
    if (existing) return Result.fail("Already enrolled");

    await EnrollmentRepository.createEnrollment(userId, courseId);
    return Result.ok({ success: true });
  }

  // -------------------------------------------------------------------------
  //  Course Enrollment Logic (INSTALLMENT ONLY)
  // -------------------------------------------------------------------------

  static async createRazorpayOrder(userId: string, courseId: string) {
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      include: {
        paymentPlans: { orderBy: { orderIndex: "asc" } },
      },
    });

    if (!course) return Result.fail("Course not found");
    if (!course.published) return Result.fail("Course is not available");

    const exists = await EnrollmentRepository.findEnrollment(userId, courseId);
    if (exists) return Result.fail("Already enrolled");

    try {
      const { createRazorpayOrder } = await import("../core/razorpayService");

      const amountToPay = Number(course.price);
      const stageName = "Full Payment";
      const planId = null;

      const shortUser = userId.substring(0, 8);
      const receipt = `rcpt_${shortUser}_${Date.now().toString().slice(-6)}`;

      const order = await createRazorpayOrder(amountToPay, "INR", receipt);

      await prisma.studentPayment.create({
        data: {
          userId,
          courseId,
          planId: planId,
          stageName: stageName,
          amount: amountToPay,
          razorpayOrderId: order.id,
          status: "PENDING",
          dueDate: new Date(),
        },
      });

      const { getRazorpayKeyId } = await import("../core/razorpayService");
      const keyId = getRazorpayKeyId();
      if (!keyId) return Result.fail("Payment gateway is not configured");

      return Result.ok({
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        keyId,
        isInstallment: false,
        stageName: stageName,
      });
    } catch (error: any) {
      return Result.fail(`Razorpay order creation failed: ${error.message}`);
    }
  }

  static async verifyRazorpayPayment(
    userId: string,
    courseId: string,
    orderId: string,
    paymentId: string,
    signature: string,
  ) {
    try {
      const { verifyRazorpaySignature } =
        await import("../core/razorpayService");
      const valid = verifyRazorpaySignature(orderId, paymentId, signature);
      if (!valid) return Result.fail("Invalid payment signature");

      const course = await prisma.course.findUnique({ where: { id: courseId } });
      const user = await prisma.user.findUnique({ where: { id: userId } });

      if (!course || !user) return Result.fail("Course or User not found");

      const studentPayment = await prisma.studentPayment.findFirst({
        where: { razorpayOrderId: orderId },
      });

      if (!studentPayment) {
        return Result.fail("Associated payment record not found");
      }

      // 1. Update StudentPayment status
      const updatedPayment = await prisma.studentPayment.update({
        where: { id: studentPayment.id },
        data: {
          status: "PAID",
          razorpayPaymentId: paymentId,
          paidAt: new Date(),
        },
      });

      // 2. Enrollment Logic
      let enrollment = await EnrollmentRepository.findEnrollment(
        userId,
        courseId,
      );

      if (!enrollment) {
        enrollment = await EnrollmentRepository.createEnrollment(userId, courseId);
      } else {
        // Check if we need to reactivate enrollment if it was overdue
        const overdueCount = await prisma.studentPayment.count({
          where: { userId, courseId, status: "OVERDUE" },
        });

        if (overdueCount === 0 && enrollment.status === "PAYMENT_DUE") {
          await prisma.enrollment.update({
            where: { id: enrollment.id },
            data: { status: "ACTIVE" },
          });
        }
      }

      // 3. Send Receipt Email
      await EmailService.sendPaymentReceipt({
        receiptId: paymentId,
        date: new Date(),
        userName: user.name || "Student",
        userEmail: user.email,
        amount: Number(studentPayment.amount),
        courseTitle: course.title,
        serialNumber: enrollment?.serialNumber || undefined,
      });

      return Result.ok({
        paymentId: updatedPayment.id,
        status: "PAID",
        serialNumber: enrollment?.serialNumber,
      });
    } catch (error: any) {
      return Result.fail(`Verification failed: ${error.message}`);
    }
  }

  // -------------------------------------------------------------------------
  //  Installment Payments
  // -------------------------------------------------------------------------

  static async payInstallment(userId: string, paymentId: string) {
    const payment = await prisma.studentPayment.findUnique({
      where: { id: paymentId },
      include: { course: true, user: true },
    });

    if (!payment) return Result.fail("Payment record not found");
    if (payment.userId !== userId) return Result.fail("Unauthorized");
    if (payment.status === "PAID") return Result.fail("Already paid");

    try {
      const { createRazorpayOrder } = await import("../core/razorpayService");
      const receipt = `inst_${payment.id.substring(0, 8)}_${Date.now().toString().slice(-6)}`;
      const order = await createRazorpayOrder(Number(payment.amount), "INR", receipt);

      await prisma.studentPayment.update({
        where: { id: paymentId },
        data: { razorpayOrderId: order.id },
      });

      const { getRazorpayKeyId } = await import("../core/razorpayService");
      const keyId = getRazorpayKeyId();
      if (!keyId) return Result.fail("Payment gateway is not configured");

      return Result.ok({
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        keyId,
        stageName: payment.stageName,
      });
    } catch (error: any) {
      return Result.fail(`Installment order creation failed: ${error.message}`);
    }
  }

  // -------------------------------------------------------------------------
  //  Remidies / Order Payments (Normal E-commerce)
  // -------------------------------------------------------------------------

  static async createRemidiesOrder(userId: string, orderId: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { user: true },
    });

    if (!order) return Result.fail("Order not found");
    if (order.userId !== userId) return Result.fail("Unauthorized");

    try {
      const { createRazorpayOrder } = await import("../core/razorpayService");
      const receipt = `order_${order.id.substring(0, 8)}_${Date.now().toString().slice(-6)}`;
      const rzpOrder = await createRazorpayOrder(
        Number(order.totalAmount),
        "INR",
        receipt,
      );

      // Create or update Payment record
      await prisma.payment.upsert({
        where: { orderId: order.id },
        update: {
          providerOrderId: rzpOrder.id,
          status: "PENDING",
        },
        create: {
          userId,
          orderId: order.id,
          amount: order.totalAmount,
          type: "PRODUCT",
          provider: "RAZORPAY",
          providerOrderId: rzpOrder.id,
          status: "PENDING",
        },
      });

      const { getRazorpayKeyId } = await import("../core/razorpayService");
      const keyId = getRazorpayKeyId();
      if (!keyId) return Result.fail("Payment gateway is not configured");

      return Result.ok({
        orderId: rzpOrder.id,
        amount: rzpOrder.amount,
        currency: rzpOrder.currency,
        keyId,
      });
    } catch (error: any) {
      return Result.fail(`Remidies order payment failed: ${error.message}`);
    }
  }

  static async verifyRemidiesPayment(
    userId: string,
    orderId: string,
    rzpOrderId: string,
    rzpPaymentId: string,
    signature: string,
  ) {
    try {
      const { verifyRazorpaySignature } =
        await import("../core/razorpayService");
      const valid = verifyRazorpaySignature(
        rzpOrderId,
        rzpPaymentId,
        signature,
      );
      if (!valid) return Result.fail("Invalid payment signature");

      const payment = await prisma.payment.findUnique({
        where: { orderId },
        include: {
          user: true,
          order: {
            include: { items: { include: { product: true } } },
          },
        },
      });

      if (!payment) return Result.fail("Payment record not found");

      await prisma.$transaction([
        prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: "COMPLETED",
            providerPaymentId: rzpPaymentId,
            providerSignature: signature,
          },
        }),
        prisma.order.update({
          where: { id: orderId },
          data: { status: "PAID" },
        }),
      ]);

      // Send Email Receipt for Products
      if (payment.user && payment.order) {
        const order = payment.order;
        const subtotal = Number(order.subtotalAmount);
        const bulk = Number(order.bulkDiscount);
        const coupon = Number(order.couponDiscount);
        await EmailService.sendPaymentReceipt({
          receiptId: rzpPaymentId,
          date: new Date(),
          userName: payment.user.name || "Customer",
          userEmail: payment.user.email,
          amount: Number(payment.amount),
          items: order.items.map((item) => ({
            name: item.product.name,
            quantity: item.quantity,
            price: Number(item.price),
          })),
          subtotalAmount: subtotal,
          bulkDiscount: bulk > 0 ? bulk : undefined,
          couponDiscount: coupon > 0 ? coupon : undefined,
        });

        if (order.shippingPhone) {
          await WhatsAppService.queueNotification({
            type: "ORDER_CONFIRMATION",
            recipientPhone: order.shippingPhone,
            message: WhatsAppMessages.orderConfirmation({
              orderId: order.id,
              totalAmount: Number(payment.amount),
            }),
            referenceId: order.id,
          });
        }
      }

      return Result.ok({ success: true, paymentId: payment.id });
    } catch (error: any) {
      return Result.fail(`Remidies verification failed: ${error.message}`);
    }
  }

  // -------------------------------------------------------------------------
  //  Admin View
  // -------------------------------------------------------------------------

  static async getAllCoursePayments() {
    // Course payments are in StudentPayment table
    const payments = await prisma.studentPayment.findMany({
      include: { user: true, course: true },
      orderBy: { createdAt: "desc" },
    });
    return Result.ok(payments);
  }

  static async getAllRemidiesPayments() {
    // Remedies payments are in Payment table with type PRODUCT
    const payments = await prisma.payment.findMany({
      where: { type: "PRODUCT" },
      include: { user: true, order: true },
      orderBy: { createdAt: "desc" },
    });
    return Result.ok(payments);
  }

  static async getCentralizedPayments() {
    try {
      // 1. Fetch Course Installments
      const coursePayments = await prisma.studentPayment.findMany({
        include: { user: true, course: true },
        orderBy: { createdAt: "desc" },
        take: 100, // Limit for performance, pagination can be added
      });

      // 2. Fetch Product Payments
      const productPayments = await prisma.payment.findMany({
        where: { type: "PRODUCT" },
        include: { user: true, order: true },
        orderBy: { createdAt: "desc" },
        take: 100,
      });

      // 3. Normalize and Combine
      const unified = [
        ...coursePayments.map((p) => ({
          id: p.id,
          date: p.createdAt,
          amount: p.amount,
          status: p.status,
          type: "COURSE_INSTALLMENT",
          customer: p.user?.name || "Unknown",
          item: p.course?.title || "Course",
          providerOrderId: p.razorpayOrderId,
        })),
        ...productPayments.map((p) => ({
          id: p.id,
          date: p.createdAt,
          amount: p.amount,
          status: p.status,
          type: "REMIDIES_PRODUCT",
          customer: p.user?.name || "Unknown",
          item: `Order #${p.orderId?.substring(0, 8) || "N/A"}`,
          providerOrderId: p.providerOrderId,
        })),
      ].sort((a, b) => b.date.getTime() - a.date.getTime());

      return Result.ok(unified);
    } catch (error: any) {
      return Result.fail(
        `Failed to fetch centralized payments: ${error.message}`,
      );
    }
  }
}
