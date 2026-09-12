import { prisma } from "../core/prisma";
import { Result } from "../core/result";
import { EnrollmentRepository } from "../enrollment/enrollment.repository";
import { EmailService } from "../notification/email.service";
import { TelegramService } from "../notification/telegram.service";
import { TelegramMessages } from "../notification/telegram.messages";
import {
  createPayuPaymentParams,
  isPayuSuccessStatus,
  type PayuChannel,
  type PayuResponsePayload,
  verifyPaymentS2S,
  verifyResponseHash,
  generateSdkHash,
  buildPaymentHash,
  getPayuMerchantKey,
  formatPayuAmount,
  amountsEqual,
  refundPayment,
  type SdkHashRequest,
} from "../core/payuService";
import { paymentLogger } from "../config/logger";
import { StockService } from "../stock/stock.service";

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
        courseId,
        stage: p.stageName,
        stageName: p.stageName,
        title: p.stageName,
        amount: Number(p.amount),
        status: p.status,
        dueDate: p.dueDate,
        paidAt: p.paidAt,
        merchantTxnRef: p.merchantTxnRef,
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
  //  Course Payments (PayU)
  // -------------------------------------------------------------------------

  static async createCoursePayuPayment(
    userId: string,
    courseId: string,
    channel: PayuChannel = "web",
  ) {
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

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return Result.fail("User not found");

    try {
      const amountToPay = Number(course.price);
      const stageName = "Full Payment";

      const params = createPayuPaymentParams({
        amount: amountToPay,
        productinfo: course.title,
        firstname: user.name || "Student",
        email: user.email,
        phone: user.phoneNumber || undefined,
        kind: "COURSE",
        channel,
        udf3: courseId,
        udf4: userId,
        txnPrefix: "crs",
      });

      await prisma.studentPayment.create({
        data: {
          userId,
          courseId,
          planId: null,
          stageName,
          amount: amountToPay,
          merchantTxnRef: params.txnid,
          status: "PENDING",
          dueDate: new Date(),
          providerResponse: params as any,
        },
      });

      return Result.ok(params);
    } catch (error: any) {
      return Result.fail(`PayU payment creation failed: ${error.message}`);
    }
  }

  /**
   * Idempotent course/installment fulfillment after PayU success.
   * Used by callback, webhook, and status poll.
   */
  static async fulfillCoursePaymentByTxnId(
    txnid: string,
    mihpayid: string,
    expectedUserId?: string,
    expectedCourseId?: string,
    providerResponse?: unknown,
  ) {
    const studentPayment = await prisma.studentPayment.findFirst({
      where: { merchantTxnRef: txnid },
      include: { course: true, user: true },
    });

    if (!studentPayment) {
      return Result.fail("Associated payment record not found");
    }

    if (expectedUserId && studentPayment.userId !== expectedUserId) {
      return Result.fail("Unauthorized");
    }
    if (expectedCourseId && studentPayment.courseId !== expectedCourseId) {
      return Result.fail("Course mismatch");
    }

    if (studentPayment.status === "PAID") {
      const enrollment = await EnrollmentRepository.findEnrollment(
        studentPayment.userId,
        studentPayment.courseId,
      );
      return Result.ok({
        paymentId: studentPayment.id,
        status: "PAID",
        serialNumber: enrollment?.serialNumber,
        alreadyPaid: true,
        courseId: studentPayment.courseId,
        userId: studentPayment.userId,
        amount: Number(studentPayment.amount),
      });
    }

    const course = studentPayment.course;
    const user = studentPayment.user;
    if (!course || !user) return Result.fail("Course or User not found");

    const updatedPayment = await prisma.studentPayment.update({
      where: { id: studentPayment.id },
      data: {
        status: "PAID",
        providerPaymentId: mihpayid,
        paidAt: new Date(),
        verifiedAt: new Date(),
        ...(providerResponse
          ? { providerResponse: providerResponse as any }
          : {}),
      },
    });

    let enrollment = await EnrollmentRepository.findEnrollment(
      studentPayment.userId,
      studentPayment.courseId,
    );

    if (!enrollment) {
      enrollment = await EnrollmentRepository.createEnrollment(
        studentPayment.userId,
        studentPayment.courseId,
      );
    } else {
      const overdueCount = await prisma.studentPayment.count({
        where: {
          userId: studentPayment.userId,
          courseId: studentPayment.courseId,
          status: "OVERDUE",
        },
      });

      if (overdueCount === 0 && enrollment.status === "PAYMENT_DUE") {
        await prisma.enrollment.update({
          where: { id: enrollment.id },
          data: { status: "ACTIVE" },
        });
      }
    }

    await EmailService.sendPaymentReceipt({
      receiptId: mihpayid,
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
      courseId: studentPayment.courseId,
      userId: studentPayment.userId,
      amount: Number(studentPayment.amount),
    });
  }

  static async markCoursePaymentFailed(
    txnid: string,
    reason: string,
    providerResponse?: unknown,
  ) {
    const studentPayment = await prisma.studentPayment.findFirst({
      where: { merchantTxnRef: txnid },
    });
    if (!studentPayment) return Result.fail("Payment record not found");
    if (studentPayment.status === "PAID") {
      return Result.ok({ alreadyPaid: true, paymentId: studentPayment.id });
    }

    await prisma.studentPayment.update({
      where: { id: studentPayment.id },
      data: {
        status: "FAILED",
        ...(providerResponse
          ? { providerResponse: providerResponse as any }
          : {}),
      },
    });

    return Result.ok({
      paymentId: studentPayment.id,
      status: "FAILED",
      reason,
      courseId: studentPayment.courseId,
      userId: studentPayment.userId,
      amount: Number(studentPayment.amount),
    });
  }

  // -------------------------------------------------------------------------
  //  Installment Payments
  // -------------------------------------------------------------------------

  static async payInstallment(
    userId: string,
    paymentId: string,
    channel: PayuChannel = "web",
  ) {
    const payment = await prisma.studentPayment.findUnique({
      where: { id: paymentId },
      include: { course: true, user: true },
    });

    if (!payment) return Result.fail("Payment record not found");
    if (payment.userId !== userId) return Result.fail("Unauthorized");
    if (payment.status === "PAID") return Result.fail("Already paid");
    if (!payment.course || !payment.user) return Result.fail("Course or User not found");

    try {
      const params = createPayuPaymentParams({
        amount: Number(payment.amount),
        productinfo: `${payment.course.title} - ${payment.stageName}`,
        firstname: payment.user.name || "Student",
        email: payment.user.email,
        phone: payment.user.phoneNumber || undefined,
        kind: "COURSE",
        channel,
        udf3: payment.courseId,
        udf4: userId,
        udf5: paymentId,
        txnPrefix: "inst",
      });

      await prisma.studentPayment.update({
        where: { id: paymentId },
        data: {
          merchantTxnRef: params.txnid,
          status: "PENDING",
          providerResponse: params as any,
        },
      });

      return Result.ok(params);
    } catch (error: any) {
      return Result.fail(`Installment payment creation failed: ${error.message}`);
    }
  }

  // -------------------------------------------------------------------------
  //  Remidies / Order Payments
  // -------------------------------------------------------------------------

  static async createRemidiesOrder(
    userId: string,
    orderId: string,
    channel: PayuChannel = "web",
  ) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { user: true },
    });

    if (!order) return Result.fail("Order not found");
    if (order.userId !== userId) return Result.fail("Unauthorized");
    if (!order.user) return Result.fail("User not found");

    try {
      const params = createPayuPaymentParams({
        amount: Number(order.totalAmount),
        productinfo: `Order ${order.id.slice(0, 8)}`,
        firstname: order.user.name || "Customer",
        email: order.user.email,
        phone: order.shippingPhone || order.user.phoneNumber || undefined,
        kind: "PRODUCT",
        channel,
        udf3: order.id,
        udf4: userId,
        txnPrefix: "ord",
      });

      await prisma.payment.upsert({
        where: { orderId: order.id },
        update: {
          merchantTxnRef: params.txnid,
          status: "PENDING",
          provider: "PAYU",
          providerResponse: params as any,
          failureReason: null,
        },
        create: {
          userId,
          orderId: order.id,
          amount: order.totalAmount,
          type: "PRODUCT",
          provider: "PAYU",
          merchantTxnRef: params.txnid,
          status: "PENDING",
          providerResponse: params as any,
        },
      });

      return Result.ok({
        ...params,
        shopOrderId: order.id,
      });
    } catch (error: any) {
      return Result.fail(`Remidies order payment failed: ${error.message}`);
    }
  }

  /**
   * Idempotent shop-order fulfillment after PayU success.
   */
  static async fulfillRemidiesPaymentByTxnId(
    txnid: string,
    mihpayid: string,
    responseHash?: string,
    expectedUserId?: string,
    expectedShopOrderId?: string,
    providerResponse?: unknown,
  ) {
    const payment = await prisma.payment.findFirst({
      where: { merchantTxnRef: txnid },
      include: {
        user: true,
        order: {
          include: { items: { include: { product: true } } },
        },
      },
    });

    if (!payment) return Result.fail("Payment record not found");
    if (!payment.orderId) return Result.fail("Payment has no linked order");

    if (expectedUserId && payment.userId !== expectedUserId) {
      return Result.fail("Unauthorized");
    }
    if (expectedShopOrderId && payment.orderId !== expectedShopOrderId) {
      return Result.fail("Order mismatch");
    }

    if (payment.status === "COMPLETED" || payment.order?.status === "PAID") {
      return Result.ok({
        success: true,
        paymentId: payment.id,
        alreadyPaid: true,
        orderId: payment.orderId,
        userId: payment.userId,
        amount: Number(payment.amount),
      });
    }

    await prisma.$transaction([
      prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: "COMPLETED",
          providerPaymentId: mihpayid,
          provider: "PAYU",
          verifiedAt: new Date(),
          ...(responseHash ? { providerSignature: responseHash } : {}),
          ...(providerResponse
            ? { providerResponse: providerResponse as any }
            : {}),
        },
      }),
      prisma.order.update({
        where: { id: payment.orderId },
        data: { status: "PAID" },
      }),
    ]);

    if (payment.user && payment.order) {
      const order = payment.order;
      const subtotal = Number(order.subtotalAmount);
      const bulk = Number(order.bulkDiscount);
      const coupon = Number(order.couponDiscount);
      await EmailService.sendPaymentReceipt({
        receiptId: mihpayid,
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

      await TelegramService.queueAdminNotification({
        type: "ORDER_CONFIRMATION",
        message: TelegramMessages.orderConfirmation({
          orderId: order.id,
          totalAmount: Number(payment.amount),
          customerName: order.shippingName || payment.user.name,
        }),
        referenceId: order.id,
      });

      const { WalletReducer } = await import("../wallet/wallet.reducer");
      void WalletReducer.upsertPendingPassForOrder(order.id, payment.userId);
    }

    return Result.ok({
      success: true,
      paymentId: payment.id,
      orderId: payment.orderId,
      userId: payment.userId,
      amount: Number(payment.amount),
    });
  }

  static async markRemidiesPaymentFailed(
    txnid: string,
    reason: string,
    providerResponse?: unknown,
  ) {
    const payment = await prisma.payment.findFirst({
      where: { merchantTxnRef: txnid },
      include: {
        order: {
          include: { items: true },
        },
      },
    });
    if (!payment) return Result.fail("Payment record not found");
    if (payment.status === "COMPLETED") {
      return Result.ok({
        alreadyPaid: true,
        paymentId: payment.id,
        orderId: payment.orderId,
      });
    }
    if (payment.status === "FAILED" || payment.status === "REFUNDED") {
      return Result.ok({
        paymentId: payment.id,
        status: payment.status,
        reason: payment.failureReason || reason,
        orderId: payment.orderId,
        userId: payment.userId,
        amount: Number(payment.amount),
      });
    }

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "FAILED",
        failureReason: reason,
        ...(providerResponse
          ? { providerResponse: providerResponse as any }
          : {}),
      },
    });

    // Restore reserved stock + coupon usage when checkout is abandoned / fails
    if (payment.orderId && payment.order && payment.order.status === "PENDING") {
      try {
        await prisma.order.update({
          where: { id: payment.orderId },
          data: { status: "CANCELLED" },
        });

        await StockService.restoreOrderStock(
          payment.orderId,
          payment.order.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitCost:
              item.unitCostAtSale != null ? Number(item.unitCostAtSale) : null,
          })),
          undefined,
          "Payment failed / abandoned checkout",
        );

        const usage = await prisma.couponUsage.findUnique({
          where: { orderId: payment.orderId },
        });
        if (usage) {
          await prisma.$transaction([
            prisma.couponUsage.delete({ where: { id: usage.id } }),
            prisma.coupon.update({
              where: { id: usage.couponId },
              data: { usedCount: { decrement: 1 } },
            }),
          ]);
        }

        await prisma.couponGrant.updateMany({
          where: { orderId: payment.orderId, status: "REDEEMED" },
          data: {
            status: "ACTIVE",
            redeemedAt: null,
            orderId: null,
          },
        });
      } catch (error: any) {
        paymentLogger.warn("Failed to restore stock/coupon after payment failure", {
          txnid,
          orderId: payment.orderId,
          error: error?.message,
        });
      }
    }

    return Result.ok({
      paymentId: payment.id,
      status: "FAILED",
      reason,
      orderId: payment.orderId,
      userId: payment.userId,
      amount: Number(payment.amount),
    });
  }

  // -------------------------------------------------------------------------
  //  PayU callback / webhook processing
  // -------------------------------------------------------------------------

  static async processPayuResponse(payload: PayuResponsePayload) {
    if (!verifyResponseHash(payload)) {
      paymentLogger.warn("PayU response hash invalid", {
        txnid: payload.txnid,
      });
      return Result.fail("Invalid payment signature");
    }

    const txnid = String(payload.txnid ?? "");
    const mihpayid = String(payload.mihpayid ?? payload.payuMoneyId ?? txnid);
    const status = String(payload.status ?? "");
    const kind = String(payload.udf2 ?? "").toUpperCase();
    const shopOrCourseId = String(payload.udf3 ?? "");
    const userId = String(payload.udf4 ?? "");
    const reportedAmount = String(payload.amount ?? "");

    if (!txnid) return Result.fail("Missing txnid");

    // Amount tamper check against stored pending payment
    if (isPayuSuccessStatus(status) && reportedAmount) {
      const productPayment = await prisma.payment.findFirst({
        where: { merchantTxnRef: txnid },
        select: { amount: true },
      });
      const studentPayment = productPayment
        ? null
        : await prisma.studentPayment.findFirst({
            where: { merchantTxnRef: txnid },
            select: { amount: true },
          });
      const storedAmount = productPayment?.amount ?? studentPayment?.amount;
      if (
        storedAmount != null &&
        !amountsEqual(reportedAmount, Number(storedAmount))
      ) {
        paymentLogger.warn("PayU amount mismatch", {
          txnid,
          reportedAmount,
          storedAmount: Number(storedAmount),
        });
        return Result.fail("Payment amount mismatch");
      }
    }

    if (isPayuSuccessStatus(status)) {
      if (kind === "PRODUCT") {
        return this.fulfillRemidiesPaymentByTxnId(
          txnid,
          mihpayid,
          payload.hash,
          userId || undefined,
          shopOrCourseId || undefined,
          payload,
        );
      }
      return this.fulfillCoursePaymentByTxnId(
        txnid,
        mihpayid,
        userId || undefined,
        shopOrCourseId || undefined,
        payload,
      );
    }

    const reason =
      String(payload.error_Message || payload.error || status || "failed").slice(
        0,
        500,
      );

    if (kind === "PRODUCT") {
      return this.markRemidiesPaymentFailed(txnid, reason, payload);
    }
    return this.markCoursePaymentFailed(txnid, reason, payload);
  }

  /**
   * Admin-initiated PayU refund for a completed shop or course payment.
   */
  static async refundPayuPayment(paymentId: string, adminUserId: string) {
    if (!paymentId) return Result.fail("paymentId is required");

    const productPayment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: { order: { include: { items: true } } },
    });
    const studentPayment = productPayment
      ? null
      : await prisma.studentPayment.findUnique({ where: { id: paymentId } });

    if (!productPayment && !studentPayment) {
      return Result.fail("Payment not found");
    }

    const isProduct = !!productPayment;
    const status = isProduct ? productPayment!.status : studentPayment!.status;
    const amount = Number(
      isProduct ? productPayment!.amount : studentPayment!.amount,
    );
    const mihpayid = isProduct
      ? productPayment!.providerPaymentId
      : studentPayment!.providerPaymentId;
    const txnid = isProduct
      ? productPayment!.merchantTxnRef
      : studentPayment!.merchantTxnRef;

    if (status === "REFUNDED") {
      return Result.ok({
        alreadyRefunded: true,
        paymentId,
        status: "REFUNDED",
      });
    }

    const completed =
      status === "COMPLETED" || status === "PAID" || status === "success";
    if (!completed) {
      return Result.fail("Only completed payments can be refunded");
    }
    if (!mihpayid) {
      return Result.fail("Missing PayU mihpayid — cannot refund");
    }

    try {
      const refund = await refundPayment({
        mihpayid,
        amount,
        refundToken: `rf${paymentId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 20)}`,
      });

      if (refund.status !== "success") {
        paymentLogger.warn("PayU refund not accepted", {
          paymentId,
          mihpayid,
          raw: refund.raw,
        });
        return Result.fail("PayU rejected the refund request");
      }

      if (isProduct) {
        await prisma.payment.update({
          where: { id: paymentId },
          data: {
            status: "REFUNDED",
            failureReason: `Refunded by admin ${adminUserId}`,
            providerResponse: {
              ...(typeof productPayment!.providerResponse === "object" &&
              productPayment!.providerResponse
                ? (productPayment!.providerResponse as object)
                : {}),
              refund: refund.raw,
              refundedAt: new Date().toISOString(),
              refundRequestId: refund.requestId,
            } as any,
          },
        });

        if (
          productPayment!.orderId &&
          productPayment!.order &&
          productPayment!.order.status !== "CANCELLED"
        ) {
          await prisma.order.update({
            where: { id: productPayment!.orderId },
            data: { status: "CANCELLED" },
          });
          await StockService.restoreOrderStock(
            productPayment!.orderId,
            productPayment!.order.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              unitCost:
                item.unitCostAtSale != null
                  ? Number(item.unitCostAtSale)
                  : null,
            })),
            adminUserId,
            "Payment refunded",
          );
        }
      } else {
        await prisma.studentPayment.update({
          where: { id: paymentId },
          data: {
            status: "FAILED",
            providerResponse: {
              ...(typeof studentPayment!.providerResponse === "object" &&
              studentPayment!.providerResponse
                ? (studentPayment!.providerResponse as object)
                : {}),
              refund: refund.raw,
              refundedAt: new Date().toISOString(),
              refundRequestId: refund.requestId,
              note: "Refunded via PayU — marked FAILED (StudentPayment has no REFUNDED enum)",
            } as any,
          },
        });
      }

      paymentLogger.info("PayU refund completed", {
        paymentId,
        mihpayid,
        txnid,
        adminUserId,
        amount,
      });

      return Result.ok({
        paymentId,
        status: "REFUNDED",
        mihpayid,
        txnid,
        amount: formatPayuAmount(amount),
        requestId: refund.requestId,
      });
    } catch (error: any) {
      return Result.fail(error.message || "Refund failed");
    }
  }

  // -------------------------------------------------------------------------
  //  Flutter SDK hash + status
  // -------------------------------------------------------------------------

  static async generatePayuSdkHash(
    userId: string,
    input: SdkHashRequest & { txnid: string },
  ) {
    const { txnid, hashName, hashString, hashType, postSalt } = input;
    if (!txnid || !hashName) {
      return Result.fail("txnid and hashName are required");
    }

    // Ownership + pending state is the security gate. CheckoutPro requests many
    // dynamic hash names (get_checkout_details, get_sdk_configuration, etc.);
    // allow them only for the authenticated user's PENDING txn.
    const studentPayment = await prisma.studentPayment.findFirst({
      where: { merchantTxnRef: txnid, userId },
    });
    const productPayment = await prisma.payment.findFirst({
      where: { merchantTxnRef: txnid, userId },
    });

    if (!studentPayment && !productPayment) {
      return Result.fail("Payment not found or unauthorized");
    }

    const pending =
      (studentPayment && studentPayment.status === "PENDING") ||
      (productPayment && productPayment.status === "PENDING");
    if (!pending) {
      return Result.fail("Payment is not in a pending state");
    }

    try {
      // For the primary payment hash, re-derive from stored params — never trust client string.
      if (hashName === "payment" || hashName === "Payment") {
        const stored =
          (productPayment?.providerResponse as any) ||
          (studentPayment?.providerResponse as any);
        if (!stored?.txnid || !stored?.amount) {
          return Result.fail("Stored payment params missing");
        }
        const hash = buildPaymentHash({
          key: stored.key || getPayuMerchantKey(),
          txnid: stored.txnid,
          amount: String(stored.amount),
          productinfo: String(stored.productinfo ?? ""),
          firstname: String(stored.firstname ?? ""),
          email: String(stored.email ?? ""),
          udf1: String(stored.udf1 ?? ""),
          udf2: String(stored.udf2 ?? ""),
          udf3: String(stored.udf3 ?? ""),
          udf4: String(stored.udf4 ?? ""),
          udf5: String(stored.udf5 ?? ""),
        });
        return Result.ok({ hashName, hash });
      }

      if (!hashString) {
        return Result.fail("hashString is required for this hashName");
      }

      const hash = generateSdkHash({
        hashName,
        hashString,
        hashType,
        postSalt,
      });
      return Result.ok({ hashName, hash });
    } catch (error: any) {
      return Result.fail(error.message || "Hash generation failed");
    }
  }

  static async getPayuStatus(userId: string, txnid: string) {
    const studentPayment = await prisma.studentPayment.findFirst({
      where: { merchantTxnRef: txnid, userId },
      include: { course: true },
    });
    const productPayment = await prisma.payment.findFirst({
      where: { merchantTxnRef: txnid, userId },
      include: { order: true },
    });

    if (!studentPayment && !productPayment) {
      return Result.fail("Payment not found");
    }

    const localStatus = studentPayment
      ? studentPayment.status
      : productPayment!.status;

    const terminal =
      localStatus === "PAID" ||
      localStatus === "COMPLETED" ||
      localStatus === "FAILED" ||
      localStatus === "REFUNDED";

    if (!terminal) {
      try {
        const remote = await verifyPaymentS2S(txnid);
        if (isPayuSuccessStatus(remote.status)) {
          const mihpayid = remote.mihpayid || txnid;
          if (productPayment) {
            await this.fulfillRemidiesPaymentByTxnId(
              txnid,
              mihpayid,
              undefined,
              userId,
              productPayment.orderId || undefined,
              remote.raw,
            );
          } else if (studentPayment) {
            await this.fulfillCoursePaymentByTxnId(
              txnid,
              mihpayid,
              userId,
              studentPayment.courseId,
              remote.raw,
            );
          }
        } else if (
          remote.status === "failure" ||
          remote.status === "failed" ||
          remote.status === "pending"
        ) {
          // leave pending for pending; mark failed for failure
          if (remote.status === "failure" || remote.status === "failed") {
            if (productPayment) {
              await this.markRemidiesPaymentFailed(
                txnid,
                "PayU reported failure",
                remote.raw,
              );
            } else {
              await this.markCoursePaymentFailed(
                txnid,
                "PayU reported failure",
                remote.raw,
              );
            }
          }
        }
      } catch (error: any) {
        paymentLogger.warn("PayU S2S status check failed", {
          txnid,
          error: error.message,
        });
      }
    }

    const refreshedStudent = await prisma.studentPayment.findFirst({
      where: { merchantTxnRef: txnid, userId },
    });
    const refreshedProduct = await prisma.payment.findFirst({
      where: { merchantTxnRef: txnid, userId },
    });

    if (refreshedProduct) {
      return Result.ok({
        txnid,
        status: refreshedProduct.status,
        amount: formatPayuAmount(Number(refreshedProduct.amount)),
        mihpayid: refreshedProduct.providerPaymentId,
        orderId: refreshedProduct.orderId,
        type: "PRODUCT",
      });
    }

    return Result.ok({
      txnid,
      status: refreshedStudent!.status,
      amount: formatPayuAmount(Number(refreshedStudent!.amount)),
      mihpayid: refreshedStudent!.providerPaymentId,
      courseId: refreshedStudent!.courseId,
      type: "COURSE",
    });
  }

  // -------------------------------------------------------------------------
  //  Admin View
  // -------------------------------------------------------------------------

  static async getAllCoursePayments() {
    const payments = await prisma.studentPayment.findMany({
      include: { user: true, course: true },
      orderBy: { createdAt: "desc" },
    });
    return Result.ok(payments);
  }

  static async getAllRemidiesPayments() {
    const payments = await prisma.payment.findMany({
      where: { type: "PRODUCT" },
      include: { user: true, order: true },
      orderBy: { createdAt: "desc" },
    });
    return Result.ok(payments);
  }

  static async getCentralizedPayments() {
    try {
      const coursePayments = await prisma.studentPayment.findMany({
        include: { user: true, course: true },
        orderBy: { createdAt: "desc" },
        take: 100,
      });

      const productPayments = await prisma.payment.findMany({
        where: { type: "PRODUCT" },
        include: { user: true, order: true },
        orderBy: { createdAt: "desc" },
        take: 100,
      });

      const unified = [
        ...coursePayments.map((p) => ({
          id: p.id,
          date: p.createdAt,
          amount: p.amount,
          status: p.status,
          type: "COURSE_INSTALLMENT",
          customer: p.user?.name || "Unknown",
          item: p.course?.title || "Course",
          merchantTxnRef: p.merchantTxnRef,
          providerPaymentId: p.providerPaymentId,
        })),
        ...productPayments.map((p) => ({
          id: p.id,
          date: p.createdAt,
          amount: p.amount,
          status: p.status,
          type: "REMIDIES_PRODUCT",
          customer: p.user?.name || "Unknown",
          item: `Order #${p.orderId?.substring(0, 8) || "N/A"}`,
          merchantTxnRef: p.merchantTxnRef,
          providerPaymentId: p.providerPaymentId,
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
