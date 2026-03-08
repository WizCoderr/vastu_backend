import { prisma } from "../core/prisma";
import { NotificationService } from "../notification/notification.service";
import logger from "../utils/logger";

export async function checkPaymentReminders() {
    logger.info("Cron: Checking payment reminders...");

    const now = new Date();
    // Normalize to start of day to avoid time discrepancies
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    // -------------------------------------------------------------------------
    // 1. Mark Overdue Payments
    // -------------------------------------------------------------------------
    const overduePayments = await prisma.studentPayment.findMany({
        where: {
            status: "PENDING",
            dueDate: { lt: todayStart }
        },
        include: { course: true }
    });

    logger.info(`Cron: Found ${overduePayments.length} overdue payments.`);

    for (const payment of overduePayments) {
        try {
            await prisma.studentPayment.update({
                where: { id: payment.id },
                data: { status: "OVERDUE" }
            });

            // Update Enrollment Status to restrict access
            try {
                await prisma.enrollment.update({
                    where: { userId_courseId: { userId: payment.userId, courseId: payment.courseId } },
                    data: { status: "PAYMENT_DUE" }
                });
            } catch (err: any) {
                // P2025: Record to update not found. 
                // This happens if the user started payment for Stage 1 but never completed enrollment.
                if (err.code !== 'P2025') {
                    throw err; 
                }
                // If enrollment doesn't exist, we might want to mark this payment as FAILED/EXPIRED instead of OVERDUE
                // But for now, just ignoring the enrollment update is safe.
            }

            // Send Notification
            if (payment.dueDate) {
                 await NotificationService.sendPaymentReminder(
                    payment.userId, 
                    payment.course.title, 
                    payment.amount, 
                    payment.dueDate, 
                    true
                );
            }
           
            logger.info(`Cron: Marked payment ${payment.id} as OVERDUE for user ${payment.userId}`);
        } catch (error) {
            logger.error(`Cron: Failed to process overdue payment ${payment.id}`, { error });
        }
    }

    // -------------------------------------------------------------------------
    // 2. Send Reminders for Upcoming Payments (Due in 3 days)
    // -------------------------------------------------------------------------
    const reminderDate = new Date(todayStart);
    reminderDate.setDate(reminderDate.getDate() + 3);
    
    const reminderStart = reminderDate;
    const reminderEnd = new Date(reminderDate);
    reminderEnd.setHours(23, 59, 59, 999);

    const upcomingPayments = await prisma.studentPayment.findMany({
        where: {
            status: "PENDING",
            dueDate: {
                gte: reminderStart,
                lte: reminderEnd
            }
        },
        include: { course: true }
    });

    logger.info(`Cron: Found ${upcomingPayments.length} upcoming payments for reminders.`);

    for (const payment of upcomingPayments) {
        try {
            if (payment.dueDate) {
                await NotificationService.sendPaymentReminder(
                    payment.userId, 
                    payment.course.title, 
                    payment.amount, 
                    payment.dueDate, 
                    false
                );
                 logger.info(`Cron: Sent reminder for payment ${payment.id} to user ${payment.userId}`);
            }
        } catch (error) {
            logger.error(`Cron: Failed to send reminder for payment ${payment.id}`, { error });
        }
    }
}

// Execute if run directly
// @ts-ignore
if (import.meta.main) {
    checkPaymentReminders()
        .then(() => process.exit(0))
        .catch((e) => {
            console.error(e);
            process.exit(1);
        });
}
