import { Request, Response } from 'express';
import { prisma } from '../core/prisma';
import { z } from 'zod';
import logger from '../utils/logger';

export class InstructorIntent {

    static async createCourse(req: Request, res: Response) {
        logger.info('InstructorIntent.createCourse: Creating new course');
        try {
            const schema = z.object({
                title: z.string().min(3),
                description: z.string().optional(),
                price: z.coerce.string(),
                instructorId: z.string()
            });

            const data = schema.parse(req.body);

            const thumbnail = req.file ? req.file.path : undefined;

            const course = await prisma.course.create({
                data: {
                    title: data.title,
                    description: data.description,
                    price: data.price,
                    thumbnail: thumbnail,
                    instructorId: data.instructorId,
                    published: true
                }
            });

            logger.info('InstructorIntent.createCourse: Course created successfully', { courseId: course.id });
            res.status(201).json(course);
        } catch (error: any) {
            logger.error('InstructorIntent.createCourse: Failed to create course', { error });
            res.status(400).json({
                error: 'Failed to create course',
                details: error instanceof z.ZodError ? error : error.message
            });
        }
    }

    static async getInstructorCourses(req: Request, res: Response) {
        logger.info('InstructorIntent.getInstructorCourses: Listing all courses for instructor');
        try {
            // Since this is an admin route, we list all courses regardless of published status
            const courses = await prisma.course.findMany({
                orderBy: { id: 'desc' }
            });

            res.json(courses);
        } catch (error) {
            logger.error('InstructorIntent.getInstructorCourses: Failed to list courses', { error });
            res.status(500).json({ error: 'Failed to list courses' });
        }
    }

    static async createSection(req: Request, res: Response) {
        const { courseId } = req.params;
        logger.info('InstructorIntent.createSection: Creating section', { courseId });
        try {
            const schema = z.object({
                title: z.string().min(3)
            });

            const data = schema.parse(req.body);

            const section = await prisma.section.create({
                data: {
                    title: data.title,
                    courseId: courseId
                }
            });

            logger.info('InstructorIntent.createSection: Section created successfully', { sectionId: section.id, courseId });
            res.status(201).json(section);
        } catch (error) {
            logger.error('InstructorIntent.createSection: Failed to create section', { courseId, error });
            res.status(400).json({ error: 'Failed to create section' });
        }
    }

    static async createLecture(req: Request, res: Response) {
        const { sectionId } = req.params;
        logger.info('InstructorIntent.createLecture: Creating lecture', { sectionId });
        try {
            if (!req.file) {
                logger.warn('InstructorIntent.createLecture: No video file provided', { sectionId });
                res.status(400).json({ error: 'Video file is required' });
                return;
            }

            const schema = z.object({
                title: z.string().min(3)
            });

            const data = schema.parse(req.body);

            // Cloudinary storage puts the URL in 'path'
            const videoUrl = req.file.path;

            const lecture = await prisma.lecture.create({
                data: {
                    title: data.title,
                    sectionId: sectionId,
                    videoUrl: videoUrl
                }
            });

            logger.info('InstructorIntent.createLecture: Lecture created successfully', { lectureId: lecture.id, sectionId });
            res.status(201).json(lecture);

        } catch (error) {
            logger.error('InstructorIntent.createLecture: Failed to create lecture', { sectionId, error });
            res.status(400).json({ error: 'Failed to create lecture' });
        }
    }
}
