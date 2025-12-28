import { Router, RequestHandler } from 'express';
import { InstructorIntent } from '../course/instructor.intent';

import { requireAdmin } from '../core/authMiddleware';
import { AuthIntent } from '../auth/auth.intent';
import multer from 'multer';
import path from 'path';

const router = Router();

// Configure Multer for processing
const tempDir = 'temp_uploads/';
if (!require('fs').existsSync(tempDir)) {
    require('fs').mkdirSync(tempDir);
}
const upload = multer({ dest: tempDir });

// Create a new course
router.post('/courses', requireAdmin, InstructorIntent.createCourse as RequestHandler);

// Get all courses (admin/instructor view)
router.get('/courses', requireAdmin, InstructorIntent.getInstructorCourses as RequestHandler);

// Create a section in a course
router.post('/courses/:courseId/sections', requireAdmin, InstructorIntent.createSection as RequestHandler);





// --- S3 Migration Endpoints ---

// Consolidated Upload (handles Image, Video, PDF)
router.post('/upload', requireAdmin, upload.single('file') as any, InstructorIntent.unifiedUpload as RequestHandler);

router.get('/courses/:courseId/resources', requireAdmin, InstructorIntent.getCourseResources as RequestHandler);
router.delete('/resources/:resourceId', requireAdmin, InstructorIntent.deleteResource as RequestHandler);

// Register S3 Video
router.post('/courses/:courseId/sections/:sectionId/lectures/register-s3-video', requireAdmin, InstructorIntent.registerS3Lecture as RequestHandler);

// Admin logout (invalidate token)
router.post('/logout', requireAdmin, AuthIntent.logout as RequestHandler);

router.delete('/courses/:courseId/sections/:sectionId', requireAdmin, InstructorIntent.deleteSection as RequestHandler);
router.delete('/courses/:courseId', requireAdmin, InstructorIntent.deleteCourse as RequestHandler);

export default router;
