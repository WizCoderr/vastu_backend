import { Request, Response } from 'express';
import { prisma } from '../core/prisma';
import { z } from 'zod';

export class InstructorIntent {

    static async createCourse(req: Request, res: Response) {
        try {
            const schema = z.object({
                title: z.string().min(3),
                description: z.string().optional(),
                price: z.string(),
                // In a real app, instructorId would come from the authenticated user
                instructorId: z.string()
            });

            const data = schema.parse(req.body);

            const course = await prisma.course.create({
                data: {
                    title: data.title,
                    description: data.description,
                    price: data.price,
                    instructorId: data.instructorId,
                    published: false
                }
            });

            res.status(201).json(course);
        } catch (error) {
            console.error('Create course error:', error);
            res.status(400).json({ error: 'Failed to create course' });
        }
    }

    static async createSection(req: Request, res: Response) {
        try {
            const { courseId } = req.params;
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

            res.status(201).json(section);
        } catch (error) {
            console.error('Create section error:', error);
            res.status(400).json({ error: 'Failed to create section' });
        }
    }

    static async createLecture(req: Request, res: Response) {
        try {
            const { sectionId } = req.params;

            if (!req.file) {
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

            res.status(201).json(lecture);

        } catch (error) {
            console.error('Create lecture error:', error);
            res.status(400).json({ error: 'Failed to create lecture' });
        }
    }
}
