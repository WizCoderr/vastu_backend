import { Router, RequestHandler } from 'express';
import { InstructorIntent } from '../course/instructor.intent';

import { requireAdmin } from '../core/authMiddleware';
import { AuthIntent } from '../auth/auth.intent';

const router = Router();

// Create a new course
router.post('/courses', requireAdmin, InstructorIntent.createCourse as RequestHandler);

// Get all courses (admin/instructor view)
router.get('/courses', requireAdmin, InstructorIntent.getInstructorCourses as RequestHandler);

// Create a section in a course
router.post('/courses/:courseId/sections', requireAdmin, InstructorIntent.createSection as RequestHandler);





router.post('/courses/:courseId/sections/:sectionId/lectures/register-mux', requireAdmin, InstructorIntent.registerMuxLecture as RequestHandler);

// --- S3 Migration Endpoints ---

// Get S3 Pre-signed URL for Upload

router.post('/upload/presigned-url', requireAdmin, InstructorIntent.getPresignedUrl as RequestHandler);

// Register S3 Video (Backend triggers Mux)
router.post('/courses/:courseId/sections/:sectionId/lectures/register-s3-video', requireAdmin, InstructorIntent.registerS3Lecture as RequestHandler);

// Admin logout (invalidate token)
router.post('/logout', requireAdmin, AuthIntent.logout as RequestHandler);

export default router;
