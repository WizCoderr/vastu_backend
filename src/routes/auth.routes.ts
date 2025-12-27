import { Router } from 'express';
import { AuthIntent } from '../auth/auth.intent';

import { requireAuth } from '../core/authMiddleware';

const router = Router();

router.post('/register', AuthIntent.register);
router.post('/login', AuthIntent.login);
router.get('/me', requireAuth, AuthIntent.getUser);

export default router;
