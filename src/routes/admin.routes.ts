import { Router } from 'express';
import { requireAdmin } from '../core/authMiddleware';
import { AdminIntent } from '../admin/admin.intent';
import liveClassAdminRoutes from '../live-class/live-class.admin.routes';
import { remidiesAdminRouter } from '../remidies/remidies.routes';
import whatsappRoutes from '../whatsapp/whatsapp.routes';
import { walletAdminRouter } from '../wallet/wallet.routes';

const router = Router();

router.post('/enroll', requireAdmin, AdminIntent.enrollStudent);
router.get('/students', requireAdmin, AdminIntent.getAllStudents);
router.get('/videos', requireAdmin, AdminIntent.getVideoLibrary);
router.get('/storage', requireAdmin, AdminIntent.getStorageFiles);
router.delete('/storage', requireAdmin, AdminIntent.deleteStorageFile);

// DEPRECATED: Standard payments list (moved to payment module)
// router.get('/payments', requireAdmin, AdminIntent.getPaymentStats);

// =============================================================================
// LIVE CLASSES ADMIN ROUTES
// =============================================================================
router.use('/live-classes', liveClassAdminRoutes);

// =============================================================================
// REMIDIES E-COMMERCE ADMIN ROUTES
// =============================================================================
router.use('/remidies', requireAdmin, remidiesAdminRouter);

// =============================================================================
// WHATSAPP ADMIN ROUTES
// =============================================================================
router.use('/whatsapp', requireAdmin, whatsappRoutes);

// =============================================================================
// GOOGLE WALLET ADMIN
// =============================================================================
router.use('/wallet', walletAdminRouter);

export default router;
