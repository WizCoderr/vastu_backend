import { Router } from 'express';
import { requireAdmin } from '../core/authMiddleware';
import { AdminIntent } from '../admin/admin.intent';
import liveClassAdminRoutes from '../live-class/live-class.admin.routes';

const router = Router();

router.post('/enroll', requireAdmin, AdminIntent.enrollStudent);
router.get('/students', requireAdmin, AdminIntent.getAllStudents);
router.get('/videos', requireAdmin, AdminIntent.getVideoLibrary);
router.get('/storage', requireAdmin, AdminIntent.getStorageFiles);
router.delete('/storage', requireAdmin, AdminIntent.deleteStorageFile);
router.get('/payments', requireAdmin, AdminIntent.getPaymentStats);

// =============================================================================
// LIVE CLASSES ADMIN ROUTES
// =============================================================================
router.use('/live-classes', liveClassAdminRoutes);

export default router;
