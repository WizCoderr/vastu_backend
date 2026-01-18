# Vastu Backend

A production-ready e-learning platform backend built with **Bun**, **Express**, **TypeScript**, **Prisma**, and **mongodb**.

## Architecture

This project strictly follows the **MVI (Model-View-Intent)** architecture:
- **Routes**: Define HTTP endpoints and map them to Intents.
- **Intents**: Handle request validation (Zod) and command preparation.
- **Reducers**: execute business logic and return `Result` objects.
- **Repositories**: Encapsulate database access (Prisma).

## Tech Stack

- **Runtime**: [Bun](https://bun.sh)
- **Framework**: Express.js
- **Database**: PostgreSQL
- **ORM**: Prisma (with `@prisma/adapter-pg` for serverless/edge compatibility)
- **Auth**: JWT & Bcrypt
- **Payments**: Stripe

## Features
- **Authentication**: Student registration and login.
- **Courses**: View course catalog and details.
- **Curriculum**: Access sections and lectures (protected by enrollment).
- **Enrollment**: Add-only lifetime access model.
- **Progress**: Track lecture completion.
- **Payments**: Stripe Payment Intent integration with Webhook support.

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) installed
- PostgreSQL database
- Stripe Account (for payments)

### Installation

1.  **Clone & Install**
    ```bash
    git clone <repo>
    cd vastu_backend
    bun install
    ```

2.  **Environment Setup**
    Create a `.env` file in the root:
    ```env
    PORT=3000
    DATABASE_URL="postgresql://user:password@localhost:5432/mydb?schema=public"
    JWT_SECRET="your-secret-key"
    STRIPE_SECRET_KEY="sk_test_..."
    STRIPE_WEBHOOK_SECRET="whsec_..."
    ```

3.  **Database Migration**
    ```bash
    bunx prisma migrate dev --name init
    bunx prisma generate
    ```

4.  **Run Server**
    ```bash
    bun run start
    # or for dev
    bun run dev
    ```

## API Endpoints

### Auth
- `POST /auth/register` - Create new student
- `POST /auth/login` - Get access token

### Admin (Requires Bearer Token)
- `POST /api/admin/enroll` - Manually enroll student
- `GET /api/admin/videos` - Get video library stats
- `GET /api/admin/storage` - Manage S3 files
- `GET /api/admin/payments` - View financial stats
- `/api/admin/live-classes/*` - Manage live sessions

### Student (Requires Bearer Token)
- `GET /api/student/courses` - List all courses
- `GET /api/student/enrolled-courses` - List my courses
- `GET /api/student/courses/:id/curriculum` - Access content
- `GET /api/student/lectures/:lectureId/stream-url` - Watch video
- `/api/student/live-classes/*` - Join/View live sessions

### Payments
- `POST /api/payments/create-intent` - Initialize payment
- `POST /api/payments/webhook` - Stripe webhook handler

> **Note**: For full API documentation, see [API_ROUTES.md](./API_ROUTES.md).

## Structure

```
src/
├── app.ts            # Express Config
├── server.ts         # Entry Point
├── Generated/        # Prisma Client
├── auth/             # Auth Module
├── course/           # Course Module
├── enrollment/       # Enrollment Logic
├── payment/          # Payment & Stripe
├── progress/         # Progress Tracking
├── core/             # Shared Utils (Config, Result, Prisma)
└── routes/           # API Routes
```
