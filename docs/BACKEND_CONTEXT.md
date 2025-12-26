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
  - **Streaming**: **Mux** (Video processing & HLS streaming)
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
    - **`muxService.ts`**: Mux Asset creation and JWT signing for secure streaming.
    - **`prisma.ts`**: Prisma Client instance.
  - **`course/`**: Course management logic (Intent/Reducer pattern).
    - **`instructor.intent.ts`**: Handles logic for Course/Section/Lecture creation.
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
      - **Lecture (Video)**: Call `POST .../lectures/register-s3-video` with `{ s3Key, ... }`. Backend triggers Mux ingestion.

### 2. Student (`/api/student`)
- **File**: `src/routes/student.routes.ts`
- **Purpose**: Viewing courses and progress.
- **Streaming**:
  - `GET /lectures/:lectureId/stream-url`: Returns a signed Mux HLS URL for secure video streaming.

### 3. Payments (`/api/payments`)
- **File**: `src/routes/payment.routes.ts`
- **Purpose**: Handling Razorpay transactions.
- **Flow**:
  1.  `POST /razorpay/order`: Creates a Razorpay Order.
  2.  Frontend collects payment.
  3.  `POST /razorpay/verify`: Verifies payment signature and enrolls student.

### 4. Authentication (`/auth`)
- **File**: `src/routes/auth.routes.ts`
- **Purpose**: User registration and login.

## Configuration & Setup

### Environment Variables
Managed via `.env`. Key variables include:
- **Core**: `PORT`, `DATABASE_URL`, `JWT_SECRET`
- **AWS S3**: `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_BUCKET_NAME`
- **Razorpay**: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`
- **Mux**: `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET`, `MUX_SIGNING_KEY`, `MUX_PRIVATE_KEY`

### Scripts
- **`bun run dev`**: Start the development server.
- **`bun run build`**: Build the project to `./dist`.
- **`bun scripts/test-s3.ts`**: Verify S3 connection.
- **`bun scripts/debug-presigned.ts`**: Test presigned URL generation.
- **`bun scripts/debug-course-create.ts`**: Test backend course creation logic.

## Notes
- **Legacy Removal**: Cloudinary and Stripe integrations have been fully removed.
- **Direct Uploads**: The backend no longer accepts file uploads (multipart/form-data) directly. All files must go through the Pre-signed URL flow.
