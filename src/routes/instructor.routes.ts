import { Router } from 'express';
import { InstructorIntent } from '../course/instructor.intent';
import { uploadVideo, uploadImage } from '../config/multerConfig';
import { requireAuth, requireAdmin, AuthRequest } from '../core/authMiddleware';
import { Result } from '../core/result';
import { AuthIntent } from '../auth/auth.intent';

const router = Router();

// Create a new course
router.post('/courses', requireAdmin, uploadImage.single('image'), InstructorIntent.createCourse);

// Get all courses (admin/instructor view)
router.get('/courses', requireAdmin, InstructorIntent.getInstructorCourses);

// Create a section in a course
router.post('/courses/:courseId/sections', requireAdmin, InstructorIntent.createSection);

// Create a lecture in a section (with video upload)
router.post('/sections/:sectionId/lectures', requireAdmin, uploadVideo.single('video'), InstructorIntent.createLecture);

// Admin logout (invalidate token)
router.post('/logout', requireAdmin, AuthIntent.logout);

export default router;
