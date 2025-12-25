import { Request, Response } from 'express';
import { adminEnrollSchema } from './admin.dto';
import { EnrollmentRepository } from '../enrollment/enrollment.repository';
import { prisma } from '../core/prisma';
import logger from '../utils/logger';

export class AdminIntent {
    static async enrollStudent(req: Request, res: Response) {
        logger.info('AdminIntent.enrollStudent: Attempting to enroll student');
        const validation = adminEnrollSchema.safeParse(req.body);

        if (!validation.success) {
            logger.warn('AdminIntent.enrollStudent: Validation failed', { errors: validation.error.issues });
            res.status(400).json({ error: validation.error.issues[0].message });
            return;
        }

        const { userId, courseId } = validation.data;

        try {
            // Check if user exists
            const user = await prisma.user.findUnique({ where: { id: userId } });
            if (!user) {
                logger.warn('AdminIntent.enrollStudent: User not found', { userId });
                res.status(404).json({ error: 'User not found' });
                return;
            }

            // Check if course exists
            const course = await prisma.course.findUnique({ where: { id: courseId } });
            if (!course) {
                logger.warn('AdminIntent.enrollStudent: Course not found', { courseId });
                res.status(404).json({ error: 'Course not found' });
                return;
            }

            // Create enrollment
            const enrollment = await EnrollmentRepository.createEnrollment(userId, courseId);

            logger.info('AdminIntent.enrollStudent: Student enrolled successfully', { userId, courseId });
            res.status(200).json({ success: true, enrollment });
        } catch (error: any) {
            logger.error('AdminIntent.enrollStudent: Internal error', { error });
            res.status(500).json({ error: 'Failed to enroll user' });
        }
    }

    static async getAllStudents(req: Request, res: Response) {
        logger.info('AdminIntent.getAllStudents: Listing all students');
        try {
            const students = await prisma.user.findMany({
                where: { role: 'student' },
                select: {
                    id: true,
                    email: true,
                    name: true,
                    role: true,
                    createdAt: true
                },
                orderBy: { createdAt: 'desc' }
            });

            res.status(200).json(students);
        } catch (error: any) {
            logger.error('AdminIntent.getAllStudents: Failed to list students', { error });
            res.status(500).json({ error: 'Failed to list students' });
        }
    }
}
