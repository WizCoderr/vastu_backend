# Staged Payments API Documentation

This document covers the API endpoints for the new staged payment system for **Courses**, including launch-based plan expiry.

## 1. Public / Student APIs

### Get Course Payment Plan
Returns the defined payment stages for a specific course.

- **URL:** `/api/payments/courses/:courseId/payment-plan`
- **Method:** `GET`
- **Auth Required:** No (Optional)
- **Rules:** Returns `[]` (empty list) if the current date is past the course `endDate`.
- **Success Response:** `200 OK`
  ```json
  [
    {
      "id": "plan_1",
      "courseId": "course_123",
      "stageName": "Enrollment",
      "amount": 3000,
      "dueAfterDays": 0,
      "orderIndex": 0
    }
  ]
  ```

---

### Enroll in Course (Start Staged Payment)
Initiates enrollment. If the course has a payment plan AND it has not expired, it creates a Razorpay order for **Stage 1**.

- **URL:** `/api/payments/courses/:courseId/enroll`
- **Method:** `POST`
- **Auth Required:** Yes
- **Rules:** If `now > endDate`, `isInstallment` will be `false` and it will request the **Full Amount**.
- **Success Response:** `200 OK`
  ```json
  {
    "orderId": "order_PyX123...",
    "amount": 1500000, 
    "currency": "INR",
    "keyId": "rzp_test_...",
    "isInstallment": false,
    "stageName": "Full Payment"
  }
  ```

---

### Get Student Payment Status
Returns the student's payment progress and upcoming schedule for a specific course.

- **URL:** `/api/payments/student/course-payments/:courseId`
- **Method:** `GET`
- **Auth Required:** Yes
- **Success Response:** `200 OK`

---

### Pay Next Installment
Creates a Razorpay order for a pending or overdue installment.

- **URL:** `/api/payments/student/course-payments/:paymentId/pay`
- **Method:** `POST`
- **Auth Required:** Yes

---

## 2. Enrollment Status & Access Control

### Access Restriction (Payment Overdue)
If a student has an **OVERDUE** payment, they get a `403 Forbidden` on lecture APIs.

### Course Expiration (Post-Completion)
If `now > endDate`:
1.  **New buyers** must pay the **Full Amount**.
2.  **Existing students** lose access to lectures (access is revoked automatically).
3.  The course is only visible if `isVisible` is `true`.

---

## 3. Admin APIs (Implementation Guide)

### Manage Course Settings
Use these fields in your Admin Panel course editor:
- `isVisible`: (Boolean) Controls if students see the course in the app.
- `startDate`: (DateTime) Launch start.
- `endDate`: (DateTime) Completion date. Plan expires and access ends after this.

### Create Payment Plan Stage
- **Endpoint:** `POST /api/admin/courses/:courseId/payment-plans`
- **Body:**
  ```json
  {
    "stageName": "Final Payment",
    "amount": 6000,
    "dueAfterDays": 42,
    "orderIndex": 2
  }
  ```

---

## 4. Integration Details (Razorpay)

The verification flow remains the same. The backend now automatically detects if a `razorpay_order_id` belongs to a staged payment and updates the `StudentPayment` record and `Enrollment` status accordingly.
