import { Router } from 'express';
import { CourseIntent } from '../course/course.intent';

const router = Router();

// Public route to get all published courses
router.get('/courses', CourseIntent.listCourses);

export default router;
