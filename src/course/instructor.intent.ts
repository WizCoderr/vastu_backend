import { Request, Response } from 'express';
import { prisma } from '../core/prisma';
import { z } from 'zod';
import logger from '../utils/logger';
import { MediaService } from '../core/mediaService';
import fs from 'fs';
import path from 'path';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const s3Client = new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
    }
});

export class InstructorIntent {
    // Create a new course
    static async createCourse(req: Request, res: Response) {
        logger.info('InstructorIntent.createCourse: Creating new course');
        try {
            const schema = z.object({
                title: z.string().min(3),
                description: z.string().optional(),
                price: z.coerce.string(),
                instructorId: z.string(),
                s3Key: z.string().optional(),
                s3Bucket: z.string().optional(),
            });
            const data = schema.parse(req.body);

            const course = await prisma.course.create({
                data: {
                    title: data.title,
                    description: data.description,
                    price: data.price,
                    thumbnail: data.s3Key ? `s3://${data.s3Bucket || process.env.AWS_BUCKET_NAME}/${data.s3Key}` : null,
                    s3Key: data.s3Key,
                    s3Bucket: data.s3Bucket || process.env.AWS_BUCKET_NAME,
                    mediaType: 'image',
                    instructorId: data.instructorId,
                    published: true,
                },
            });

            logger.info('InstructorIntent.createCourse: Course created successfully', { courseId: course.id });
            res.status(201).json(course);
        } catch (error: any) {
            logger.error('InstructorIntent.createCourse: Failed to create course', { error });
            res.status(400).json({ error: 'Failed to create course', details: error instanceof z.ZodError ? error : error.message });
        }
    }

    // List all courses for admin/instructor
    static async getInstructorCourses(req: Request, res: Response) {
        logger.info('InstructorIntent.getInstructorCourses: Listing all courses for instructor');
        try {
            const courses = await prisma.course.findMany({ orderBy: { id: 'desc' } });
            const { getPresignedReadUrl } = await import('../core/s3Service');
            const coursesWithUrls = await Promise.all(
                courses.map(async (course) => {
                    let thumbUrl = course.thumbnail;
                    if (course.s3Key) {
                        try {
                            thumbUrl = await getPresignedReadUrl(course.s3Key, course.s3Bucket || undefined);
                        } catch (e) {
                            logger.error('Failed to sign thumbnail', { s3Key: course.s3Key });
                        }
                    }
                    return { ...course, thumbnail: thumbUrl };
                })
            );
            res.json(coursesWithUrls);
        } catch (error) {
            logger.error('InstructorIntent.getInstructorCourses: Failed to list courses', { error });
            res.status(500).json({ error: 'Failed to list courses' });
        }
    }

    // Create a section within a course
    static async createSection(req: Request, res: Response) {
        const { courseId } = req.params;
        logger.info('InstructorIntent.createSection: Creating section', { courseId });
        try {
            const schema = z.object({ title: z.string().min(3) });
            const data = schema.parse(req.body);
            const section = await prisma.section.create({ data: { title: data.title, courseId } });
            logger.info('InstructorIntent.createSection: Section created successfully', { sectionId: section.id, courseId });
            res.status(201).json(section);
        } catch (error) {
            logger.error('InstructorIntent.createSection: Failed to create section', { courseId, error });
            res.status(400).json({ error: 'Failed to create section' });
        }
    }

    // Unified Upload (replacing getPresignedUrl and uploadPdfResource)
    static async unifiedUpload(req: any, res: Response) {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const inputPath = req.file.path;
        const fileType = req.body.fileType as 'image' | 'video' | 'pdf';
        let processedPath = inputPath;

        try {
            logger.info(`Unified upload processing: ${req.file.originalname} (${fileType})`);

            // 1. Process media if needed
            if (fileType === 'image') {
                processedPath = await MediaService.compressToWebP(inputPath);
            } else if (fileType === 'video') {
                processedPath = await MediaService.transcodeToH265(inputPath);
            }

            // 2. Determine S3 destination
            const fileName = path.basename(processedPath);
            const folder = fileType === 'video' ? 'videos' : (fileType === 'image' ? 'images' : 'pdfs');
            const s3Key = `vastu-courses/${folder}/${Date.now()}-${fileName}`;
            const bucketName = process.env.AWS_BUCKET_NAME!;

            // 3. Upload to S3
            const fileBuffer = fs.readFileSync(processedPath);
            await s3Client.send(new PutObjectCommand({
                Bucket: bucketName,
                Key: s3Key,
                Body: fileBuffer,
                ContentType: fileType === 'video' ? 'video/mp4' : (fileType === 'image' ? 'image/webp' : 'application/pdf')
            }));

            logger.info(`Uploaded to S3: ${s3Key}`);

            // 4. Handle PDF Resource metadata (legacy support from uploadPdfResource)
            if (fileType === 'pdf' && req.body.courseId) {
                const resource = await prisma.courseResource.create({
                    data: {
                        courseId: req.body.courseId,
                        title: req.body.title || req.file.originalname,
                        s3Key,
                        s3Bucket: bucketName,
                        type: req.body.type || 'FREE',
                    },
                });
                return res.status(201).json({ resource, url: `s3://${bucketName}/${s3Key}` });
            }

            // 5. Standard response for images/videos
            res.json({
                success: true,
                s3Key,
                s3Bucket: bucketName,
                url: `s3://${bucketName}/${s3Key}`,
                fileType
            });

        } catch (error: any) {
            logger.error('Unified upload failed', { error });
            res.status(500).json({ error: 'Upload failed', details: error.message });
        } finally {
            await MediaService.cleanup(inputPath);
            if (processedPath !== inputPath) {
                await MediaService.cleanup(processedPath);
            }
        }
    }


    // Register a video stored in S3
    static async registerS3Lecture(req: Request, res: Response) {
        try {
            const { s3Key, title, s3Bucket } = req.body;
            const { courseId, sectionId } = req.params;
            if (!s3Key || !title) {
                res.status(400).json({ error: 'Missing s3Key or title' });
                return;
            }

            // Just register the S3 asset directly
            const lecture = await prisma.lecture.create({
                data: {
                    title,
                    sectionId,
                    videoUrl: `s3://${s3Bucket || process.env.AWS_BUCKET_NAME}/${s3Key}`,
                    videoProvider: 's3',
                    s3Key,
                    s3Bucket: s3Bucket || process.env.AWS_BUCKET_NAME,
                    muxReady: true, // Legacy field, keeping true to avoid logical breaks if checked elsewhere
                },
            });
            res.json({ success: true, lecture });
        } catch (error) {
            console.error('Register S3 Video Error:', error);
            res.status(500).json({ error: 'Failed to register video' });
        }
    }

    // Delete a section and its lectures
    static async deleteSection(req: Request, res: Response) {
        const { courseId, sectionId } = req.params;
        logger.info('InstructorIntent.deleteSection', { courseId, sectionId });
        try {
            const section = await prisma.section.findUnique({ where: { id: sectionId }, include: { lectures: true } });
            if (!section || section.courseId !== courseId) {
                return res.status(404).json({ error: 'Section not found for this course' });
            }
            const { deleteObject } = await import('../core/s3Service');
            for (const lecture of section.lectures) {
                if (lecture.s3Key) {
                    await deleteObject(lecture.s3Key, lecture.s3Bucket ?? undefined);
                }
                await prisma.lecture.delete({ where: { id: lecture.id } });
            }
            await prisma.section.delete({ where: { id: sectionId } });
            res.json({ success: true, message: 'Section and its lectures deleted' });
        } catch (error) {
            logger.error('Failed to delete section', { error });
            res.status(500).json({ error: 'Failed to delete section' });
        }
    }

    // Delete a course and all related data
    static async deleteCourse(req: Request, res: Response) {
        const { courseId } = req.params;
        logger.info('InstructorIntent.deleteCourse', { courseId });
        try {
            const course = await prisma.course.findUnique({
                where: { id: courseId },
                include: {
                    sections: { include: { lectures: true } },
                    courseResources: true
                },
            });
            if (!course) {
                return res.status(404).json({ error: 'Course not found' });
            }
            const { deleteObject } = await import('../core/s3Service');

            // 1. Delete Course Thumbnail
            if (course.s3Key) {
                await deleteObject(course.s3Key, course.s3Bucket ?? undefined);
            }

            // 2. Delete Section Lctures (Videos)
            for (const section of course.sections) {
                for (const lecture of section.lectures) {
                    if (lecture.s3Key) {
                        await deleteObject(lecture.s3Key, lecture.s3Bucket ?? undefined);
                    }
                    await prisma.lecture.delete({ where: { id: lecture.id } });
                }
                await prisma.section.delete({ where: { id: section.id } });
            }

            // 3. Delete Course Resources (PDFs)
            if (course.courseResources) {
                for (const resource of course.courseResources) {
                    if (resource.s3Key) {
                        await deleteObject(resource.s3Key, resource.s3Bucket);
                    }
                    await prisma.courseResource.delete({ where: { id: resource.id } });
                }
            }

            await prisma.course.delete({ where: { id: courseId } });
            res.json({ success: true, message: 'Course, sections, lectures, resources, and S3 assets deleted' });
        } catch (error) {
            logger.error('Failed to delete course', { error });
            res.status(500).json({ error: 'Failed to delete course' });
        }
    }

    // List all resources for a course
    static async getCourseResources(req: Request, res: Response) {
        const { courseId } = req.params;
        try {
            const resources = await prisma.courseResource.findMany({
                where: { courseId }
            });

            const { getPresignedReadUrl } = await import('../core/s3Service');

            const resourcesWithUrls = await Promise.all(resources.map(async (r) => {
                let url = '';
                try {
                    url = await getPresignedReadUrl(r.s3Key, r.s3Bucket);
                } catch (e) {
                    console.error('Failed to sign resource URL', e);
                }
                return { ...r, url };
            }));

            res.json(resourcesWithUrls);
        } catch (error) {
            logger.error('Failed to get course resources', { error });
            res.status(500).json({ error: 'Failed to get resources' });
        }
    }

    // Delete a specific resource
    static async deleteResource(req: Request, res: Response) {
        const { resourceId } = req.params;
        try {
            const resource = await prisma.courseResource.findUnique({ where: { id: resourceId } });
            if (!resource) {
                return res.status(404).json({ error: 'Resource not found' });
            }

            // Delete from S3
            const { deleteObject } = await import('../core/s3Service');
            await deleteObject(resource.s3Key, resource.s3Bucket);

            // Delete from DB
            await prisma.courseResource.delete({ where: { id: resourceId } });

            res.json({ success: true, message: 'Resource deleted' });
        } catch (error) {
            logger.error('Failed to delete resource', { error });
            res.status(500).json({ error: 'Failed to delete resource' });
        }
    }
}
