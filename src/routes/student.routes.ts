import { Router, RequestHandler } from 'express';
import { requireAuth, AuthRequest } from '../core/authMiddleware';
import { CourseIntent } from '../course/course.intent';
import { ProgressIntent } from '../progress/progress.intent';
import { AuthIntent } from '../auth/auth.intent';
import { LiveClassStudentIntent } from '../live-class/live-class.student.intent';
import { remidiesUserRouter } from '../remidies/remidies.routes';

const router = Router();

// Apply auth middleware to all student routes as per requirements
router.use(requireAuth);

// Logout route for students (invalidate token)
router.post('/logout', AuthIntent.logout as RequestHandler);

router.get('/courses', CourseIntent.listCourses as RequestHandler);
router.get('/enrolled-courses', CourseIntent.listEnrolledCourses as RequestHandler);
router.get('/courses/:id', CourseIntent.getCourse as RequestHandler);
router.get('/courses/:id/curriculum', CourseIntent.getCurriculum as RequestHandler);
router.post('/progress/update', ProgressIntent.updateProgress as RequestHandler);
router.put('/profile', AuthIntent.updateProfile as RequestHandler);
router.get('/lectures/:lectureId/stream-url', CourseIntent.getLectureStreamUrl as RequestHandler);

// =============================================================================
// LIVE CLASSES STUDENT ROUTES
// =============================================================================
router.get('/live-classes/today', LiveClassStudentIntent.getToday as RequestHandler);
router.get('/live-classes/upcoming', LiveClassStudentIntent.getUpcoming as RequestHandler);
router.get('/course/:courseId/recordings', LiveClassStudentIntent.getRecordings as RequestHandler);

// =============================================================================
// DEVICE TOKEN ROUTES (for push notifications)
// =============================================================================
router.post('/device-token', LiveClassStudentIntent.registerDeviceToken as RequestHandler);
router.delete('/device-token', LiveClassStudentIntent.removeDeviceToken as RequestHandler);

// =============================================================================
// REMIDIES E-COMMERCE CATALOG ROUTES (Non-payment)
// =============================================================================
router.use('/remidies', remidiesUserRouter);

export default router;
