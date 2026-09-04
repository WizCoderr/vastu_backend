import { Router } from 'express';
import { requireAuth, requireAdmin } from '../core/authMiddleware';
import { WalletIntent } from './wallet.intent';

const router = Router();

router.get('/passes', requireAuth, WalletIntent.listPasses);
router.get('/passes/:id', requireAuth, WalletIntent.getPass);
router.post('/passes/:id/google-wallet/refresh', requireAuth, WalletIntent.refreshPass);
router.get('/orders/:orderId', requireAuth, WalletIntent.getPassForOrder);
router.post('/orders/:orderId/google-wallet', requireAuth, WalletIntent.issueForOrder);

export const walletAdminRouter = Router();
walletAdminRouter.get('/passes', requireAdmin, WalletIntent.adminList);
walletAdminRouter.patch('/passes/:id', requireAdmin, WalletIntent.adminUpdate);
walletAdminRouter.get('/passes/:id/events', requireAdmin, WalletIntent.adminEvents);
walletAdminRouter.post('/passes/:id/google-wallet/reissue', requireAdmin, WalletIntent.adminReissue);

export default router;
