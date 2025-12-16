import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import authRoutes from './routes/auth.routes';
import studentRoutes from './routes/student.routes';
import paymentRoutes from './routes/payment.routes';

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));

// Webhook route - needs raw body for Stripe
// We must mount this BEFORE the json parser for /api/payments/webhook
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));

// For everything else using JSON
app.use(express.json());

// Routes
app.use('/auth', authRoutes); // /auth/register, /auth/login
app.use('/api/student', studentRoutes); // /api/student/courses
app.use('/api/payments', paymentRoutes); // /api/payments/create-intent

// Health check
app.get('/health', (req, res) => {
    res.send('OK');
});

export default app;
