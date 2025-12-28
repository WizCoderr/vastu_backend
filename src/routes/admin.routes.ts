import { Router } from 'express';
import { requireAdmin } from '../core/authMiddleware';
import { AdminIntent } from '../admin/admin.intent';

const router = Router();

router.post('/enroll', requireAdmin, AdminIntent.enrollStudent);
router.get('/students', requireAdmin, AdminIntent.getAllStudents);
router.get('/videos', requireAdmin, AdminIntent.getVideoLibrary);
router.get('/storage', requireAdmin, AdminIntent.getStorageFiles);
router.get('/payments', requireAdmin, AdminIntent.getPaymentStats);

export default router;
