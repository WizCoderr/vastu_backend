import { Router } from 'express';
import { requireAuth } from '../core/authMiddleware';
import { CourseIntent } from '../course/course.intent';
import { ProgressIntent } from '../progress/progress.intent';

const router = Router();

// Apply auth middleware to all student routes as per requirements
router.use(requireAuth);

router.get('/courses', CourseIntent.listCourses);
router.get('/courses/:id', CourseIntent.getCourse);
router.get('/courses/:id/curriculum', CourseIntent.getCurriculum);
router.post('/progress/update', ProgressIntent.updateProgress);

export default router;
