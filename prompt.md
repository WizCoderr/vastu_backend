# Admin course Students tab — manual enroll + full payment

Build an admin UI for manually enrolling students into a course and optionally marking them as fully paid. Wire it to the existing Vastu backend APIs below. Do not invent new endpoints.

## Context

- Admin is viewing a **specific course** → **Students** tab.
- Auth: admin JWT (same as other instructor/admin routes). Send `Authorization: Bearer <token>`.
- Base paths:
  - Instructor: `/api/instructor`
  - Admin: `/api/admin`

## UX requirements

### 1. Students tab (per course)

- Show enrolled students in a table/list.
- Columns: name, email, phone, enrolled date, enrollment status, serial number, **payment status**, **fully paid**.
- Top-right (or header): **Add Student** button.

### 2. Add Student flow (modal/drawer)

- On open, fetch all students **not already enrolled** in this course.
- Searchable multi-select list (name/email/phone).
- Checkbox or toggle: **Full Payment** — if checked, enrolled users are marked as paid in full.
- Primary button: **Enroll** (disabled if none selected).
- On success: toast with counts (enrolled / already enrolled / not found / errors), close modal, refresh enrolled list.
- On error: show API error message.

### 3. Design

- Keep the UI simple and consistent with the existing admin design system.
- No cards-for-everything; one clear composition for the modal.

## APIs

### 1) List enrolled students for a course

`GET /api/instructor/courses/:courseId/students`

Response:

```json
{
  "success": true,
  "data": {
    "students": [
      {
        "id": "user-uuid",
        "name": "string | null",
        "email": "string",
        "phoneNumber": "string",
        "enrolledAt": "ISO date",
        "expiresAt": "ISO date | null",
        "status": "ACTIVE | PAYMENT_DUE | COMPLETED | CANCELLED",
        "serialNumber": "001",
        "paymentStatus": "PAID | PENDING | OVERDUE | NONE",
        "isFullyPaid": true
      }
    ],
    "count": 1
  }
}
```

UI hints:

- Badge `paymentStatus` (e.g. PAID green, PENDING amber, OVERDUE red, NONE gray).
- Show a clear “Fully paid” indicator when `isFullyPaid === true`.

### 2) Student picker (exclude already enrolled)

`GET /api/admin/students?excludeCourseId=:courseId`

Response: array of users

```json
[
  {
    "id": "user-uuid",
    "email": "string",
    "name": "string | null",
    "role": "student",
    "phoneNumber": "string",
    "createdAt": "ISO date",
    "enrollments": [
      { "id": "...", "course": { "id": "...", "title": "..." } }
    ]
  }
]
```

Use `excludeCourseId` so the picker only shows students not already in this course. Support client-side search/filter on name/email/phone.

### 3) Bulk enroll (+ optional full payment)

`POST /api/admin/enroll`

Body:

```json
{
  "courseId": "course-uuid",
  "userIds": ["user-uuid-1", "user-uuid-2"],
  "markFullPayment": true
}
```

Notes:

- Prefer `userIds` (array). Single `userId` is also accepted by the API but not needed for this UI.
- `markFullPayment: true` when Full Payment is checked; otherwise `false` or omit.

Success response (bulk):

```json
{
  "success": true,
  "markFullPayment": true,
  "enrolled": 2,
  "alreadyEnrolled": 0,
  "notFound": 0,
  "errors": 0,
  "results": [
    {
      "userId": "user-uuid",
      "outcome": "ENROLLED | ALREADY_ENROLLED | NOT_FOUND | ERROR",
      "serialNumber": "001",
      "error": "optional"
    }
  ]
}
```

Errors:

- `400` `{ "error": "..." }` validation
- `404` `{ "error": "Course not found" }`
- `500` `{ "error": "Failed to enroll user" }`

## Implementation checklist

- [ ] Students tab page/component for `courseId`
- [ ] Fetch + display enrolled students with payment fields
- [ ] Add Student button → modal
- [ ] Fetch picker via `GET /api/admin/students?excludeCourseId=...`
- [ ] Multi-select + search
- [ ] Full Payment toggle
- [ ] Submit `POST /api/admin/enroll` with `{ courseId, userIds, markFullPayment }`
- [ ] Refresh enrolled list after success
- [ ] Loading / empty / error states
- [ ] Disable Enroll when selection is empty

## Out of scope

- Razorpay / online payment UI
- Creating installment plans
- Creating new student accounts (only select existing students)
