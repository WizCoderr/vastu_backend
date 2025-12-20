import { Router } from 'express';
import { InstructorIntent } from '../course/instructor.intent';
import { uploadVideo } from '../config/multerConfig';
import { requireAuth, requireAdmin } from '../core/authMiddleware';

const router = Router();

// Create a new course
router.post('/courses', requireAuth, requireAdmin, InstructorIntent.createCourse);

// Create a section in a course
router.post('/courses/:courseId/sections', requireAuth, requireAdmin, InstructorIntent.createSection);

// Create a lecture in a section (with video upload)
router.post('/sections/:sectionId/lectures', requireAuth, requireAdmin, uploadVideo.single('video'), InstructorIntent.createLecture);

export default router;
