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

    static async registerMuxLecture(req: Request, res: Response) {
        const { sectionId } = req.params;
        logger.info('InstructorIntent.registerMuxLecture: Registering Mux lecture', { sectionId });

        try {
            const schema = z.object({
                title: z.string().min(3),
                firebasePath: z.string().min(1)
            });

            const data = schema.parse(req.body);

            // Import dynamically to avoid circular issues or just use the ones we created
            const { verifyFirebaseFile, getSignedUrl } = await import('../core/firebaseService');
            const { createMuxAsset } = await import('../core/muxService');

            // 1. Verify file exists in Firebase
            const exists = await verifyFirebaseFile(data.firebasePath);
            if (!exists) {
                logger.warn('InstructorIntent.registerMuxLecture: Firebase file not found', { path: data.firebasePath });
                return res.status(400).json({ error: 'Video file not found in storage' });
            }

            // 2. Get ephemeral signed URL for Mux to download
            const signedUrl = await getSignedUrl(data.firebasePath, 60); // 1 hour
            if (!signedUrl) {
                return res.status(500).json({ error: 'Failed to generate access URL for video processing' });
            }

            // 3. Create Mux Asset
            const muxAsset = await createMuxAsset(signedUrl);

            // 4. Create Lecture Record
            const lecture = await prisma.lecture.create({
                data: {
                    title: data.title,
                    sectionId: sectionId,
                    videoUrl: data.firebasePath, // Store source path as videoUrl for reference
                    videoProvider: 'mux',
                    muxAssetId: muxAsset.id,
                    muxPlaybackId: muxAsset.playback_ids?.[0]?.id, // Usually created by default, but might be empty initially
                    muxReady: false // Webhook would ideally update this, or polling
                }
            });

            logger.info('InstructorIntent.registerMuxLecture: Mux lecture registered', { lectureId: lecture.id, muxAssetId: muxAsset.id });
            res.status(201).json(lecture);

        } catch (error: any) {
            logger.error('InstructorIntent.registerMuxLecture: Failed to register lecture', { sectionId, error });
            res.status(400).json({
                error: 'Failed to register lecture',
                details: error instanceof z.ZodError ? error : error.message
            });
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
                    videoUrl: inputUrl, // Temporary or fallback
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
