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
                instructorId: z.string(),
                s3Key: z.string().optional(),
                s3Bucket: z.string().optional()
            });

            const data = schema.parse(req.body);

            // If s3Key is provided, we use it. If not, thumbnail logic is skipped or needs fallback if required.
            // Assuming front-end now uploads to S3 and sends key.

            const course = await prisma.course.create({
                data: {
                    title: data.title,
                    description: data.description,
                    price: data.price,
                    thumbnail: null, // Legacy field, might be unused or filled with S3 URL later
                    s3Key: data.s3Key,
                    s3Bucket: data.s3Bucket || process.env.AWS_BUCKET_NAME,
                    mediaType: 'image',
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

            // Generate Presigned URLs for S3 thumbnails
            const { getPresignedReadUrl } = await import('../core/s3Service');

            const coursesWithUrls = await Promise.all(courses.map(async (course) => {
                let thumbUrl = course.thumbnail; // Fallback to legacy
                if (course.s3Key) {
                    try {
                        thumbUrl = await getPresignedReadUrl(course.s3Key, course.s3Bucket || undefined);
                    } catch (e) {
                        logger.error('Failed to sign thumbnail', { s3Key: course.s3Key });
                    }
                }
                return {
                    ...course,
                    thumbnail: thumbUrl // Overwrite local response property with secure URL
                };
            }));

            res.json(coursesWithUrls);
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


    static async getPresignedUrl(req: Request, res: Response) {
        try {
            const { fileName, contentType, fileType } = req.body; // fileType: 'image' | 'video'
            if (!fileName || !contentType) {
                res.status(400).json({ error: 'Missing fileName or contentType' });
                return;
            }

            const folder = fileType === 'video' ? 'videos' : 'images';
            const key = `vastu-courses/${folder}/${Date.now()}-${fileName}`;

            const { getPresignedUploadUrl } = await import('../core/s3Service');
            const data = await getPresignedUploadUrl(key, contentType);

            res.json({ success: true, ...data });
        } catch (error) {
            console.error('S3 Presign Error:', error);
            res.status(500).json({ error: 'Failed to generate upload URL' });
        }
    }

    static async registerS3Lecture(req: Request, res: Response) {
        try {
            const { s3Key, title, s3Bucket } = req.body;
            const { courseId, sectionId } = req.params;

            if (!s3Key || !title) {
                res.status(400).json({ error: 'Missing s3Key or title' });
                return;
            }

            const { createMuxAsset } = await import('../core/muxService');
            const { getPresignedReadUrl } = await import('../core/s3Service');
            // Using top-level prisma import


            // 1. Get Signed URL for Mux to download from S3 (if private)
            const inputUrl = await getPresignedReadUrl(s3Key, s3Bucket);

            // 2. Create Mux Asset
            const muxAsset = await createMuxAsset(inputUrl);

            // 3. Create Lecture
            const lecture = await prisma.lecture.create({
                data: {
                    title,
                    sectionId,
                    videoUrl: `s3://${s3Bucket || process.env.AWS_BUCKET_NAME}/${s3Key}`, // Store S3 URI reference
                    videoProvider: 's3-mux',
                    s3Key,
                    s3Bucket: s3Bucket || process.env.AWS_BUCKET_NAME,
                    muxAssetId: muxAsset.id,
                    muxPlaybackId: muxAsset.playback_ids?.[0]?.id,
                    muxReady: false
                }
            });

            res.json({ success: true, lecture });
        } catch (error) {
            console.error('Register S3 Video Error:', error);
            res.status(500).json({ error: 'Failed to register video' });
        }
    }
}
