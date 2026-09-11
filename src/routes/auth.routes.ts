import { Router } from 'express';
import { AuthIntent } from '../auth/auth.intent';

import { requireAuth } from '../core/authMiddleware';
import {
  authLoginRateLimit,
  authPasswordResetRateLimit,
} from '../middleware/rate-limit.middleware';

const router = Router();

router.post('/register', authLoginRateLimit, AuthIntent.register);
router.post('/login', authLoginRateLimit, AuthIntent.login);
router.post('/refresh', authLoginRateLimit, AuthIntent.refresh);
router.post('/forgot-password', authPasswordResetRateLimit, AuthIntent.forgotPassword);
router.post('/verify-reset-otp', authPasswordResetRateLimit, AuthIntent.verifyResetOtp);
router.post('/reset-password', authPasswordResetRateLimit, AuthIntent.resetPassword);
router.get('/me', requireAuth, AuthIntent.getUser);
router.get('/profile', requireAuth, AuthIntent.getUser);

export default router;
