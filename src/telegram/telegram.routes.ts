import { Router, RequestHandler } from 'express';
import * as ctrl from './telegram.controller';

const router = Router();

router.get('/status', ctrl.getTelegramStatus as RequestHandler);
router.get('/notifications', ctrl.listTelegramNotifications as RequestHandler);
router.post('/notifications/:id/retry', ctrl.retryTelegramNotification as RequestHandler);
router.post('/send-test', ctrl.sendTestTelegramNotification as RequestHandler);

export default router;
