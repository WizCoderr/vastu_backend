import { Router } from 'express';
import { AuthIntent } from '../auth/auth.intent';

const router = Router();

router.post('/register', AuthIntent.register);
router.post('/login', AuthIntent.login);

export default router;
