# Final Iteration: Staged Payment & Course Lifecycle System

This document summarizes the complete implementation of the **Staged Payment System** and **Course Temporal Management** for the Vastu Backend.

---

## 1. Database Architecture Enhancements

We updated the Prisma schema to support complex payment schedules and course availability windows.

### New Models:
- **`CoursePaymentPlan`**: Defines the stages (e.g., Enrollment, 2nd Payment). Includes `amount`, `dueAfterDays`, and `orderIndex`.
- **`StudentPayment`**: Tracks the individual payment status for every student per course stage. Includes `status` (PENDING, PAID, OVERDUE, FAILED).

### New Course Fields:
- **`startDate`**: When the course/plan officially begins.
- **`endDate`**: The "Expiration Date". After this date, the payment plan is disabled, and existing students lose lecture access.
- **`isVisible`**: A boolean toggle for Admin to control if the course appears in the student app.

---

## 2. Core Features Implemented

### A. Staged Payment Logic (Installments)
- When a student enrolls, the system checks if a `CoursePaymentPlan` exists.
- **Before `endDate`**: Students can pay in installments (Stage 1 to enroll).
- **After `endDate`**: The system automatically switches to **Full Payment Only**.
- Verification logic automatically detects if a payment belongs to a specific installment stage.

### B. Automatic Access Control
- **Payment Overdue**: If a student misses a due date, their enrollment status is set to `PAYMENT_DUE`, and access to lectures is blocked.
- **Course Expiry**: Once the `endDate` passes, access is automatically revoked for all students (Admin/Instructors excluded), and the course moves to "Full Price" for new buyers.

### C. Automated Reminder Service (Cron Job)
- A daily background task (`src/cron/payment-reminder.ts`) runs to:
  1. Mark pending payments as `OVERDUE` if the date has passed.
  2. Block student access for overdue payments.
  3. Send Push Notifications for upcoming payments (3 days before) and overdue alerts.

### D. Multi-Platform Notifications
- Integrated into `NotificationService` to send FCM push notifications for:
  - "📅 Payment Reminder" (Upcoming)
  - "⚠️ Payment Overdue" (Action required)

---

## 3. API Summary

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/payments/courses/:id/payment-plan` | GET | Fetch the installment schedule. |
| `/api/payments/courses/:id/enroll` | POST | Start enrollment (Plan or Full). |
| `/api/payments/student/course-payments/:id` | GET | Student's payment history/status. |
| `/api/payments/student/course-payments/:pid/pay` | POST | Pay a specific pending installment. |

---

## 4. How to use from Admin Panel

1.  **Define the Plan**: Create `CoursePaymentPlan` entries for a course. Ensure the first stage has `dueAfterDays: 0`.
2.  **Set the Deadline**: Set the `endDate`. This is the date when the "Live" period ends. After this, the plan is gone, and the course behaves like a standard recorded course.
3.  **Control Visibility**: Use the `isVisible` toggle to launch the course to the mobile app users.

---

## 5. Technical Files Created/Updated
- `prisma/schema.prisma`: Schema definitions.
- `src/payment/payment.reducer.ts`: Core payment & enrollment logic.
- `src/course/course.reducer.ts`: Access control & temporal filtering.
- `src/cron/payment-reminder.ts`: Automated background task.
- `src/notification/notification.service.ts`: Payment reminder notifications.
- `STAGED_PAYMENTS_API.md`: Detailed developer documentation.
