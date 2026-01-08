import { Router, RequestHandler } from 'express';
import { requireAdmin } from '../core/authMiddleware';
import { LiveClassAdminIntent } from './live-class.admin.intent';

const router = Router();

// Apply admin auth to all routes
router.use(requireAdmin);

// CRUD operations
router.post('/', LiveClassAdminIntent.create as RequestHandler);
router.get('/course/:courseId', LiveClassAdminIntent.getAllForCourse as RequestHandler);
router.get('/:id', LiveClassAdminIntent.getById as RequestHandler);
router.patch('/:id', LiveClassAdminIntent.update as RequestHandler);
router.delete('/:id', LiveClassAdminIntent.delete as RequestHandler);

// Status transitions
router.post('/:id/live', LiveClassAdminIntent.markAsLive as RequestHandler);
router.patch('/:id/complete', LiveClassAdminIntent.markAsCompleted as RequestHandler);

// Recording
router.post('/:id/recording', LiveClassAdminIntent.uploadRecording as RequestHandler);

// Notifications
router.post('/:id/notify', LiveClassAdminIntent.triggerNotification as RequestHandler);

export default router;
