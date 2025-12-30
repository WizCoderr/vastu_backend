import { Router } from 'express';
import { CourseIntent } from '../course/course.intent';
import logger from '../utils/logger';

const router = Router();
logger.info('Public routes loaded');

router.get('/courses', CourseIntent.listCourses);
router.get('/courses/:id', CourseIntent.getCourse as any);



export default router;
