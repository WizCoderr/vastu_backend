# Vastu Backend Context

## Overview
This is the backend service for the Vastu application, built with **Bun**, **Express**, and **TypeScript**. It provides a RESTful API for managing courses, students, instructors, and payments.

## Tech Stack
- **Runtime**: [Bun](https://bun.sh/)
- **Framework**: [Express.js](https://expressjs.com/)
- **Language**: TypeScript
- **Database ORM**: [Prisma](https://www.prisma.io/) (PostgreSQL/MongoDB)
- **Authentication**: JWT (JSON Web Tokens)
- **Validation**: [Zod](https://zod.dev/)
- **Media**:
  - **Storage**: **AWS S3** (All raw assets: Images & Videos)
  - **Delivery**: **Cloudflare CDN** (via signed URLs)
- **Payments**: **Razorpay**
- **Logging**: Winston

## Project Structure
The source code is located in `src/`.

### Key Directories
- **`src/`**: Root of the source code.
  - **`app.ts`**: Main Express application setup, middleware configuration (CORS, Helmet, Morgan), and route mounting.
  - **`index.ts`**: Entry point. Starts the server.
  - **`routes/`**: API Route definitions.
  - **`core/`**: Core services.
    - **`s3Service.ts`**: AWS S3 integration (Presigned URLs for Upload/Read).
    - **`razorpayService.ts`**: Razorpay order creation and verification.
    - **`prisma.ts`**: Prisma Client instance.
  - **`course/`**: Course management logic (Intent/Reducer pattern).
  - **`admin/`**: Admin management logic.
  - **`enrollment/`**: Student enrollment logic.
  - **`payment/`**: Payment processing logic (Razorpay).
  - **`auth/`**: Authentication logic.

## API Modules & Routes

### 1. Instructor (`/api/instructor`)
- **File**: `src/routes/instructor.routes.ts`
- **Purpose**: Instructor actions (Creating courses, managing sections/lectures).
- **Architecture**: All routes use the `Intent` pattern (`InstructorIntent`).
- **New Media Flow (S3 + Mux)**:
  1.  **Get Presigned URL**: `POST /upload/presigned-url` ({ fileName, contentType, fileType }) -> Returns S3 URL.
  2.  **Client Upload**: Frontend uploads file directly to S3.
  3.  **Register Resource**:
      - **Course (Image)**: Call `POST /courses` with `{ ..., s3Key, s3Bucket }`.
      - **Lecture (Video)**: Call `POST .../lectures/register-s3-video` with `{ s3Key, ... }`. Backend stores S3 reference for direct playback.

### 2. Student (`/api/student`)
- **File**: `src/routes/student.routes.ts`
- **Purpose**: Viewing courses and progress.
- **Streaming**:
  - `GET /lectures/:lectureId/stream-url`: Returns a signed S3 URL for secure video playback.

### 3. Payments (`/api/payments`)
- **File**: `src/routes/payment.routes.ts`
- **Purpose**: Handling Razorpay transactions.
- **Flow**:
  1.  `POST /razorpay/order`: Creates a Razorpay Order.
  2.  Frontend collects payment.
  3.  `POST /razorpay/verify`: Verifies payment signature and enrolls student.

### 4. Admin (`/api/admin`)
- **File**: `src/routes/admin.routes.ts`
- **Purpose**: Administration tasks, including instructor management and platform oversight.

### 5. Public (`/api/public`)
- **File**: `src/routes/public.routes.ts`
- **Purpose**: Publicly accessible endpoints (e.g., health checks, public feedback).

### 6. Authentication (`/auth`)
- **File**: `src/routes/auth.routes.ts`
- **Purpose**: User registration and login.

## Mobile & KMP Compatibility
- **JSON Strictness**: The Mobile/KMP client (Ktor) requires strict JSON responses.
- **Error Handling**: All errors must return a valid JSON object (not plain text) to prevent parsing crashes in the mobile app.
- **Testing**: Use `verify_enrollment.ts` and `test_routes.ts` to ensure compatibility.

## Configuration & Setup

### Environment Variables
Managed via `.env`. Key variables include:
- **Core**: `PORT`, `DATABASE_URL`, `JWT_SECRET`
- **AWS S3**: `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_BUCKET_NAME`
- **Razorpay**: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`

### Scripts
- **`bun run dev`**: Start the development server.
- **`bun run build`**: Build the project to `./dist`.
- **`bun scripts/test-s3.ts`**: Verify S3 connection.
- **`bun scripts/create_admin.ts`**: Create a new admin user.
- **`bun scripts/verify_admin_auth.ts`**: Verify admin authentication flow.
- **`bun scripts/verify_enrollment.ts`**: Verify student enrollment logic.
- **`bun scripts/test_routes.ts`**: Comprehensive route testing.

## Notes
- **Legacy Removal**: Cloudinary, Stripe, and Mux integrations have been fully removed.
- **Direct Uploads**: The backend no longer accepts file uploads (multipart/form-data) directly. All files must go through the Pre-signed URL flow.
