import { Router } from 'express';
import { requireAdmin } from '../core/authMiddleware';
import { AdminIntent } from '../admin/admin.intent';

const router = Router();

router.post('/enroll', requireAdmin, AdminIntent.enrollStudent);
router.get('/students', requireAdmin, AdminIntent.getAllStudents);

export default router;
