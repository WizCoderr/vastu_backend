# Student & User Routes

This document outlines all API routes available for students and general users in the Vastu Backend.

## Authentication
**Base URL:** `/auth`

### Register
Create a new student account.

- **Endpoint:** `POST /register`
- **Body:**
  ```json
  {
    "email": "user@example.com",
    "password": "password123", // Min 6 chars
    "name": "John Doe",        // Min 2 chars
    "role": "student"          // Optional, defaults to 'student'
  }
  ```
- **Response:** `201 Created` with token and user details.

### Login
Authenticate an existing user.

- **Endpoint:** `POST /login`
- **Body:**
  ```json
  {
    "email": "user@example.com",
    "password": "password123"
  }
  ```
- **Response:** `200 OK` with token and user details.

---

## Student Operations
**Base URL:** `/api/student`
**Auth Required:** Yes (Header: `Authorization: Bearer <token>`)

### List Courses
Get a list of all available courses.

- **Endpoint:** `GET /courses`
- **Query Params:**
  - `page`: (Optional) Page number (default 1)
  - `limit`: (Optional) Items per page (default 10)
- **Response:** List of courses with pagination info.

### Get Course Details
Get detailed information about specific course.

- **Endpoint:** `GET /courses/:id`
- **Response:** Course object including description, instructor, price, etc.

### Get Course Curriculum
Get the syllabus/chapters for a course.

- **Endpoint:** `GET /courses/:id/curriculum`
- **Response:** List of chapters and lessons.

### Update Progress
Mark a lesson or item as completed.

- **Endpoint:** `POST /progress/update`
- **Body:**
  ```json
  {
    "courseId": "uuid-string",
    "lessonId": "uuid-string", // or itemId
    "completed": true
  }
  ```
- **Response:** Updated progress object.

---

## Payments
**Base URL:** `/api/payments`
**Auth Required:** Yes

### Create Payment Intent
Initiate a payment for a course tracking.

- **Endpoint:** `POST /create-intent`
- **Body:**
  ```json
  {
    "courseId": "uuid-string"
  }
  ```
- **Response:** Stripe payment intent details (client secret).
