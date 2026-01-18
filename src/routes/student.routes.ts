import { Router, RequestHandler } from 'express';
import { requireAuth, AuthRequest } from '../core/authMiddleware';
import { CourseIntent } from '../course/course.intent';
import { ProgressIntent } from '../progress/progress.intent';
import { Result } from '../core/result';
import { AuthIntent } from '../auth/auth.intent';
import { LiveClassStudentIntent } from '../live-class/live-class.student.intent';

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

// Get today's live classes for enrolled courses
router.get('/live-classes/today', LiveClassStudentIntent.getToday as RequestHandler);

// Get upcoming live classes for enrolled courses
router.get('/live-classes/upcoming', LiveClassStudentIntent.getUpcoming as RequestHandler);

// Get recordings for a specific course
router.get('/course/:courseId/recordings', LiveClassStudentIntent.getRecordings as RequestHandler);

// =============================================================================
// DEVICE TOKEN ROUTES (for push notifications)
// =============================================================================

// Register FCM device token
router.post('/device-token', LiveClassStudentIntent.registerDeviceToken as RequestHandler);

// Remove FCM device token (on logout)
router.delete('/device-token', LiveClassStudentIntent.removeDeviceToken as RequestHandler);

export default router;