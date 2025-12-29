import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import authRoutes from './routes/auth.routes';
import studentRoutes from './routes/student.routes';
import paymentRoutes from './routes/payment.routes';
import instructorRoutes from './routes/instructor.routes';
import adminRoutes from './routes/admin.routes';
import publicRoutes from './routes/public.routes';
import { config } from './config';

const app = express();

// Middleware
app.use(helmet());
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));
app.use(morgan('dev'));

// Webhook route - needs raw body for payment providers if needed
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));

// For everything else using JSON
app.use(express.json());

// Routes
app.use('/api/public', publicRoutes); // /api/public/courses

app.use('/auth', authRoutes); // /auth/register, /auth/login
app.use('/api/student', studentRoutes); // /api/student/courses
app.use('/api/instructor', instructorRoutes); // /api/instructor/courses
app.use('/api/admin', adminRoutes); // /api/admin/enroll
app.use('/api/payments', paymentRoutes); // /api/payments/create-intent

// Serve uploaded files
app.use('/uploads', express.static('uploads'));

// Health check
app.get('/health', (req, res) => {
    res.send('OK');
});

// Root route
app.get('/', (req, res) => {
    res.json({ message: 'Welcome to Vastu Backend API', version: '1.0.0' });
});

// Global error handler
import { NextFunction, Request, Response } from 'express';
import logger from './utils/logger';

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    logger.error('Unhandled error', { error: err });
    res.status(500).json({
        success: false,
        error: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message || 'Unknown Error'
    });
});

export default app;
