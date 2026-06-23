import { Router, RequestHandler } from 'express';
import * as ctrl from './whatsapp.controller';

const router = Router();

router.get('/status', ctrl.getWhatsAppStatus as RequestHandler);
router.get('/qr', ctrl.getWhatsAppQr as RequestHandler);
router.get('/notifications/pending', ctrl.getPendingWhatsAppNotifications as RequestHandler);
router.post('/notifications/:id/retry', ctrl.retryWhatsAppNotification as RequestHandler);

export default router;
