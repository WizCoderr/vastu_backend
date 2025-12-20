import { Router } from 'express';
import { InstructorIntent } from '../course/instructor.intent';
import { uploadVideo } from '../config/multerConfig';

const router = Router();

// Create a new course
router.post('/courses', InstructorIntent.createCourse);

// Create a section in a course
router.post('/courses/:courseId/sections', InstructorIntent.createSection);

// Create a lecture in a section (with video upload)
router.post('/sections/:sectionId/lectures', uploadVideo.single('video'), InstructorIntent.createLecture);

export default router;
