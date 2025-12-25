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

router.post('/sections/:sectionId/lectures',
    requireAdmin,
    (req, res, next) => {
        uploadVideo.single('video')(req, res, (err) => {
            if (err) {
                console.error("❌ Video Upload Error:", err);
                return res.status(400).json({
                    error: 'Video upload failed',
                    details: err.message
                });
            }
            console.log(req.file ? `✅ File uploaded: ${req.file.originalname}` : '⚠️ No file uploaded');
            next();
        });
    },
    InstructorIntent.createLecture
);

// Admin logout (invalidate token)
router.post('/logout', requireAdmin, AuthIntent.logout);

export default router;
