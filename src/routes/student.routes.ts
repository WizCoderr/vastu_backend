import { Router } from 'express';
import { requireAuth, AuthRequest } from '../core/authMiddleware';
import { CourseIntent } from '../course/course.intent';
import { ProgressIntent } from '../progress/progress.intent';
import { Result } from '../core/result';
import { AuthIntent } from '../auth/auth.intent';

const router = Router();

// Apply auth middleware to all student routes as per requirements
router.use(requireAuth);

// Logout route for students (invalidate token)
router.post('/logout', AuthIntent.logout);

router.get('/courses', CourseIntent.listCourses);
router.get('/enrolled-courses', CourseIntent.listEnrolledCourses);
router.get('/courses/:id', CourseIntent.getCourse);
router.get('/courses/:id/curriculum', CourseIntent.getCurriculum);
router.post('/progress/update', ProgressIntent.updateProgress);

export default router;
