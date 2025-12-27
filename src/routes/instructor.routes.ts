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





// --- S3 Migration Endpoints ---

// Get S3 Pre-signed URL for Upload

router.post('/upload/presigned-url', requireAdmin, InstructorIntent.getPresignedUrl as RequestHandler);
router.post('/upload/pdf-resource', requireAdmin, InstructorIntent.uploadPdfResource as RequestHandler);
router.get('/courses/:courseId/resources', requireAdmin, InstructorIntent.getCourseResources as RequestHandler);
router.delete('/resources/:resourceId', requireAdmin, InstructorIntent.deleteResource as RequestHandler);

// Register S3 Video
router.post('/courses/:courseId/sections/:sectionId/lectures/register-s3-video', requireAdmin, InstructorIntent.registerS3Lecture as RequestHandler);

// Admin logout (invalidate token)
router.post('/logout', requireAdmin, AuthIntent.logout as RequestHandler);

router.delete('/courses/:courseId/sections/:sectionId', requireAdmin, InstructorIntent.deleteSection as RequestHandler);
router.delete('/courses/:courseId', requireAdmin, InstructorIntent.deleteCourse as RequestHandler);

export default router;
