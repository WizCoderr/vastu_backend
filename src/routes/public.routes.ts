import { Router } from 'express';
import { CourseIntent } from '../course/course.intent';
import { GoogleReviewsIntent } from '../google-reviews/google-reviews.intent';
import logger from '../utils/logger';

const router = Router();
logger.info('Public routes loaded');

router.get('/courses', CourseIntent.listCourses);
router.get('/courses/:id', CourseIntent.getCourse as any);
router.get('/google-reviews', GoogleReviewsIntent.getReviews);



export default router;
