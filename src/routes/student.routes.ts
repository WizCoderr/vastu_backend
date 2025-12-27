import { Router, RequestHandler } from 'express';
import { requireAuth, AuthRequest } from '../core/authMiddleware';
import { CourseIntent } from '../course/course.intent';
import { ProgressIntent } from '../progress/progress.intent';
import { Result } from '../core/result';
import { AuthIntent } from '../auth/auth.intent';

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
router.get('/lectures/:lectureId/stream-url', CourseIntent.getLectureStreamUrl as RequestHandler);

export default router;