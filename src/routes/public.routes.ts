import { Router } from 'express';
import { CourseIntent } from '../course/course.intent';
import logger from '../utils/logger';

const router = Router();
logger.info('Public routes loaded');

// Public route to get all published courses
router.get('/courses', CourseIntent.listCourses);

import { extractUser } from '../core/authMiddleware';
// Public route to get course details (with optional auth for enrollment status)
router.get('/courses/:id', extractUser, CourseIntent.getCourse as any);

// Test route to verify public routes are reachable
router.get('/test', (req, res) => {
    res.json({ message: 'Public test route works' });
});

export default router;
