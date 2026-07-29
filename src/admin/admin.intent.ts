import { Request, Response } from 'express';
import { adminEnrollSchema } from './admin.dto';
import { EnrollmentRepository } from '../enrollment/enrollment.repository';
import { prisma } from '../core/prisma';
import logger from '../utils/logger';

type EnrollOutcome = 'ENROLLED' | 'ALREADY_ENROLLED' | 'NOT_FOUND' | 'ERROR';

export class AdminIntent {
    static async enrollStudent(req: Request, res: Response) {
        logger.info('AdminIntent.enrollStudent: Attempting to enroll student(s)');
        const validation = adminEnrollSchema.safeParse(req.body);

        if (!validation.success) {
            logger.warn('AdminIntent.enrollStudent: Validation failed', { errors: validation.error.issues });
            res.status(400).json({ error: validation.error.issues[0].message });
            return;
        }

        const { courseId, userIds, markFullPayment } = validation.data;

        try {
            const course = await prisma.course.findUnique({
                where: { id: courseId },
                include: {
                    paymentPlans: { orderBy: { orderIndex: 'asc' } },
                },
            });
            if (!course) {
                logger.warn('AdminIntent.enrollStudent: Course not found', { courseId });
                res.status(404).json({ error: 'Course not found' });
                return;
            }

            const results: {
                userId: string;
                outcome: EnrollOutcome;
                serialNumber?: string | null;
                error?: string;
            }[] = [];

            for (const userId of userIds) {
                try {
                    const user = await prisma.user.findUnique({ where: { id: userId } });
                    if (!user || user.role !== 'student') {
                        results.push({ userId, outcome: 'NOT_FOUND' });
                        continue;
                    }

                    const hadEnrollment = !!(await EnrollmentRepository.findEnrollment(userId, courseId));
                    const enrollment = await EnrollmentRepository.createEnrollment(userId, courseId);

                    if (markFullPayment) {
                        await EnrollmentRepository.markFullPayment(userId, courseId, course);
                    }

                    results.push({
                        userId,
                        outcome: hadEnrollment ? 'ALREADY_ENROLLED' : 'ENROLLED',
                        serialNumber: enrollment.serialNumber,
                    });
                } catch (err: any) {
                    results.push({
                        userId,
                        outcome: 'ERROR',
                        error: err?.message ?? 'Failed to enroll user',
                    });
                }
            }

            const enrolled = results.filter((r) => r.outcome === 'ENROLLED').length;
            const alreadyEnrolled = results.filter((r) => r.outcome === 'ALREADY_ENROLLED').length;
            const notFound = results.filter((r) => r.outcome === 'NOT_FOUND').length;
            const errors = results.filter((r) => r.outcome === 'ERROR').length;

            logger.info('AdminIntent.enrollStudent: Enroll completed', {
                courseId,
                markFullPayment,
                enrolled,
                alreadyEnrolled,
                notFound,
                errors,
            });

            // Backward-compatible single-user response includes `enrollment` when successful
            if (userIds.length === 1) {
                const single = results[0];
                const enrollment =
                    single?.outcome === 'ENROLLED' || single?.outcome === 'ALREADY_ENROLLED'
                        ? await EnrollmentRepository.findEnrollment(userIds[0], courseId)
                        : null;
                res.status(200).json({
                    success: true,
                    enrollment,
                    markFullPayment,
                    enrolled,
                    alreadyEnrolled,
                    notFound,
                    errors,
                    results,
                });
                return;
            }

            res.status(200).json({
                success: true,
                markFullPayment,
                enrolled,
                alreadyEnrolled,
                notFound,
                errors,
                results,
            });
        } catch (error: any) {
            logger.error('AdminIntent.enrollStudent: Internal error', { error });
            res.status(500).json({ error: 'Failed to enroll user' });
        }
    }

    static async getAllStudents(req: Request, res: Response) {
        logger.info('AdminIntent.getAllStudents: Listing all students');
        try {
            const excludeCourseId =
                typeof req.query.excludeCourseId === 'string' && req.query.excludeCourseId.trim()
                    ? req.query.excludeCourseId.trim()
                    : undefined;

            const students = await prisma.user.findMany({
                where: {
                    role: 'student',
                    ...(excludeCourseId
                        ? {
                              enrollments: {
                                  none: { courseId: excludeCourseId },
                              },
                          }
                        : {}),
                },
                select: {
                    id: true,
                    email: true,
                    name: true,
                    role: true,
                    phoneNumber: true,
                    createdAt: true,
                    enrollments: {
                        select: {
                            id: true,
                            course: {
                                select: {
                                    id: true,
                                    title: true
                                }
                            },
                        }
                    }
                },
                orderBy: { createdAt: 'desc' }
            });

            res.status(200).json(students);
        } catch (error: any) {
            logger.error('AdminIntent.getAllStudents: Failed to list students', { error });
            res.status(500).json({ error: 'Failed to list students' });
        }
    }

    static async getVideoLibrary(req: Request, res: Response) {
        logger.info('AdminIntent.getVideoLibrary: Fetching video stats');
        const { AdminReducer } = await import('./admin.reducer');
        const result = await AdminReducer.getVideoLibraryStats();

        if (result.success) {
            res.status(200).json(result.data);
        } else {
            res.status(500).json({ error: result.error });
        }
    }

    static async getStorageFiles(req: Request, res: Response) {
        logger.info('AdminIntent.getStorageFiles: Listing storage files');
        const limit = Math.min(Number(req.query.limit) || 20, 100);
        const cursor = req.query.cursor as string | undefined;
        const type = (req.query.type as 'pdf' | 'image' | 'all' | undefined) ?? 'all';

        const { AdminReducer } = await import('./admin.reducer');
        const result = await AdminReducer.getStorageFiles(limit, cursor, type);

        if (result.success) {
            res.status(200).json(result.data);
        } else {
            res.status(500).json({ error: result.error });
        }
    }

    static async deleteStorageFile(req: Request, res: Response) {
        const key = req.query.key as string;
        const resourceType = req.query.resourceType as 'image' | 'raw' | 'video' | undefined;
        logger.info('AdminIntent.deleteStorageFile: Deleting file', { key, resourceType });

        if (!key) {
            return res.status(400).json({ error: 'Missing key parameter' });
        }

        const { AdminReducer } = await import('./admin.reducer');
        const result = await AdminReducer.deleteStorageFile(key, resourceType);

        if (result.success) {
            res.status(200).json(result.data);
        } else {
            res.status(500).json({ error: result.error });
        }
    }
}
