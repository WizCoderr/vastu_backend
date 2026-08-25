import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import authRoutes from "./routes/auth.routes";
import studentRoutes from "./routes/student.routes";
import paymentRoutes from "./routes/payment.routes";
import instructorRoutes from "./routes/instructor.routes";
import adminRoutes from "./routes/admin.routes";
import publicRoutes from "./routes/public.routes";
import remidiesRoutes from "./routes/remidies.route";
import { config } from "./config";

const app = express();

// Middleware
app.use(helmet());
const allowedOrigins = [
  "https://admin.vastuarunsharma.com",
  "https://vastuarunsharma.com",
  "https://api.vastuarunsharma.com",
  "http://127.0.0.1:3001",
  "http://localhost:3001",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
];

app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    credentials: true,
    exposedHeaders: ["Content-Range", "X-Content-Range"],
  }),
);
app.set("trust proxy", 1);
app.use(morgan("dev"));

// Webhook route - needs raw body for payment providers if needed
app.use("/api/payments/webhook", express.raw({ type: "application/json" }));

// For everything else using JSON
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Routes
app.use("/api/public", publicRoutes); // /api/public/courses

app.use("/auth", authRoutes); // /auth/register, /auth/login
app.use("/api/student", studentRoutes); // /api/student/courses
app.use("/api/instructor", instructorRoutes); // /api/instructor/courses
app.use("/api/admin", adminRoutes); // /api/admin/enroll
app.use("/api/payments", paymentRoutes); // /api/payments/create-intent
app.use("/api/remidies", remidiesRoutes); // /api/remidies/user/* and /api/remidies/admin/*

// Serve uploaded files
app.use("/uploads", express.static("uploads"));

// Health check
app.get("/health", (req, res) => {
  res.send("OK");
});

// Root route
app.get("/", (req, res) => {
  res.json({ message: "Welcome to Vastu Backend API", version: "1.0.0" });
});

// Global error handler
import { NextFunction, Request, Response } from "express";
import logger from "./utils/logger";

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  const message =
    err?.message ||
    (typeof err === 'string' ? err : null) ||
    'Unknown Error';
  logger.error('Unhandled error', {
    message,
    name: err?.name,
    code: err?.code,
    stack: err?.stack,
  });

  const isClientError =
    typeof message === 'string' &&
    (message.startsWith('Cannot delete') ||
      message.startsWith('Only RESTOCK') ||
      message.startsWith('Stock movement not found') ||
      message.startsWith('At least one movement') ||
      message.startsWith('Product not found') ||
      message.startsWith('Insufficient stock') ||
      message.startsWith('Unit purchase cost') ||
      message.startsWith('Set opening unit cost') ||
      message.startsWith('Opening cost'));

  res.status(isClientError ? 400 : 500).json({
    success: false,
    error:
      process.env.NODE_ENV === 'production' && !isClientError
        ? 'Internal Server Error'
        : message,
  });
});

export default app;
