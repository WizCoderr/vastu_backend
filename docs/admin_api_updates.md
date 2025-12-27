
# Backend API Updates Summary

## 1. Course Resources Management (Instructor/Admin)
The following endpoints allow instructors to manage course resources (e.g., PDF cheat sheets, guides).

### List Resources
- **Endpoint**: `GET /api/instructor/courses/:courseId/resources`
- **Auth**: Admin/Instructor
- **Response**: Returns a list of resources for the course. Each resource includes a short-lived **Signed S3 URL** for secure access.

### Delete Resource
- **Endpoint**: `DELETE /api/instructor/resources/:resourceId`
- **Auth**: Admin/Instructor
- **Action**: Deletes the resource record from the database AND the file from AWS S3.

## 2. Public Student Access
Students can now browse all courses and view full details without logging in. Authentication is only required for enrollment and accessing paid content.

### Get Course Details (Public)
- **Endpoint**: `GET /api/public/courses/:id`
- **Auth**: Optional (Public)
- **Behavior**:
    - **Unauthenticated**: Returns full course details (Curriculum, Instructor info). `isEnrolled` is `false`. Only `FREE` resources are visible. `PAID` resources are hidden.
    - **Authenticated**: If a valid Bearer token is provided, the backend checks enrollment status. If enrolled, `isEnrolled` is `true`, and `PAID` resources are included in the response.

### List All Courses (Public)
- **Endpoint**: `GET /api/public/courses`
- **Auth**: Public
- **Response**: Lists all published courses with thumbnails.

## 3. Enrollment & Payments
Authentication is still strictly required for purchasing courses.
- `POST /api/payments/create-intent` (Login Required)
- `POST /api/payments/razorpay/verify` (Login Required)
