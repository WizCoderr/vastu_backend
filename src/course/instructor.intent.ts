import { Request, Response } from 'express';
import { prisma } from '../core/prisma';
import { z } from 'zod';
import logger from '../utils/logger';
import { MediaService } from '../core/mediaService';
import fs from 'fs';
import path from 'path';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

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
            res.status(201).json({ success: true, data: course });
        } catch (error: any) {
            logger.error('InstructorIntent.createCourse: Failed to create course', { error });
            res.status(400).json({ error: 'Failed to create course', details: error instanceof z.ZodError ? error : error.message });
        }
    }

    // List all courses for admin/instructor
    static async getInstructorCourses(req: Request, res: Response) {
        logger.info('InstructorIntent.getInstructorCourses: Listing all courses for instructor');
        try {
            const courses = await prisma.course.findMany({
                orderBy: { id: 'desc' },
                include: {
                    sections: {
                        include: { lectures: true }
                    },
                    courseResources: true
                }
            });
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

                    // Sign Resources
                    const courseResources = await Promise.all(course.courseResources.map(async (r) => {
                        let url = '';
                        try {
                            url = await getPresignedReadUrl(r.s3Key, r.s3Bucket);
                        } catch (e) { }
                        return { ...r, url };
                    }));

                    // Sign lectures
                    const sections = await Promise.all(course.sections.map(async (section) => {
                        const lectures = await Promise.all(section.lectures.map(async (lecture) => {
                            let videoUrl = lecture.videoUrl;
                            if (lecture.s3Key) {
                                try {
                                    videoUrl = await getPresignedReadUrl(lecture.s3Key, lecture.s3Bucket || undefined);
                                } catch (e) { /* ignore signing error */ }
                            }
                            return { ...lecture, videoUrl };
                        }));
                        return { ...section, lectures };
                    }));

                    return { ...course, thumbnail: thumbUrl, sections, courseResources };
                })
            );

            res.json({ success: true, data: coursesWithUrls });
        } catch (error) {
            logger.error('InstructorIntent.getInstructorCourses: Failed to list courses', { error });
            res.status(500).json({ success: false, error: 'Failed to list courses' });
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

    // Generate a presigned URL for direct client-side S3 upload
    static async getPresignedUrl(req: Request, res: Response) {
        logger.info('InstructorIntent.getPresignedUrl: Generating presigned URL');
        try {
            const schema = z.object({
                fileName: z.string().min(1),
                fileType: z.enum(['image', 'video', 'pdf']),
                contentType: z.string().min(1) // e.g., 'image/jpeg', 'video/mp4', 'application/pdf'
            });
            const { fileName, fileType, contentType } = schema.parse(req.body);

            const folder = fileType === 'video' ? 'videos' : (fileType === 'image' ? 'images' : 'pdfs');
            const s3Key = `vastu-courses/${folder}/${Date.now()}-${fileName}`;
            const bucketName = process.env.AWS_BUCKET_NAME!;

            const command = new PutObjectCommand({
                Bucket: bucketName,
                Key: s3Key,
                ContentType: contentType,

            });

            const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 }); // URL valid for 1 hour

            // Plain JSON response structure
            const result = {
                url: presignedUrl,
                method: 'PUT',
                headers: {
                    'Content-Type': contentType
                }
            };

            logger.info('InstructorIntent.getPresignedUrl: Presigned URL generated successfully', { s3Key });
            res.status(200).json(result);

        } catch (error: any) {
            logger.error('InstructorIntent.getPresignedUrl: Failed to generate presigned URL', { error });
            res.status(400).json({ error: 'Failed to generate presigned URL', details: error.message });
        }
    }

    // Unified Upload (replacing getPresignedUrl and uploadPdfResource)
    static async unifiedUpload(req: any, res: Response) {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No file uploaded' });
        }

        const inputPath = req.file.path;
        const fileType = req.body.fileType as 'image' | 'video' | 'pdf';

        try {
            logger.info(`Unified upload processing: ${req.file.originalname} (${fileType})`);

            // 1. Determine S3 destination
            const fileName = path.basename(inputPath);
            const folder = fileType === 'video' ? 'videos' : (fileType === 'image' ? 'images' : 'pdfs');
            const s3Key = `vastu-courses/${folder}/${Date.now()}-${req.file.originalname}`;
            const bucketName = process.env.AWS_BUCKET_NAME!;

            // 2. Upload to S3
            const fileBuffer = fs.readFileSync(inputPath);
            await s3Client.send(new PutObjectCommand({
                Bucket: bucketName,
                Key: s3Key,
                Body: fileBuffer,
                ContentType: req.file.mimetype || (fileType === 'video' ? 'video/mp4' : (fileType === 'image' ? 'image/jpeg' : 'application/pdf'))
            }));

            logger.info(`Uploaded to S3: ${s3Key}`);

            // 3. Handle PDF Resource metadata (legacy support from uploadPdfResource)
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
                return res.status(201).json({ success: true, data: { resource, url: `s3://${bucketName}/${s3Key}` } });
            }

            // 4. Standard response for images/videos
            res.json({
                success: true,
                data: {
                    s3Key,
                    s3Bucket: bucketName,
                    url: `s3://${bucketName}/${s3Key}`,
                    fileType
                }
            });

        } catch (error: any) {
            logger.error('Unified upload failed', { error });
            res.status(500).json({ success: false, error: 'Upload failed', details: error.message });
        } finally {
            await MediaService.cleanup(inputPath);
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

    // Update a course (including sections, lectures, and resources)
    static async updateCourse(req: Request, res: Response) {
        const { courseId } = req.params;
        logger.info('InstructorIntent.updateCourse: Updating course', { courseId });
        try {
            // Schemas
            const lectureSchema = z.object({
                id: z.string().optional(),
                title: z.string(),
                videoUrl: z.string().optional(),
                videoProvider: z.string().optional(),
                s3Key: z.string().optional().nullable(),
                s3Bucket: z.string().optional().nullable(),
                muxAssetId: z.string().optional().nullable(),
                muxPlaybackId: z.string().optional().nullable(),
            });

            const sectionSchema = z.object({
                id: z.string().optional(),
                title: z.string(),
                lectures: z.array(lectureSchema).optional().default([]),
            });

            const resourceSchema = z.object({
                id: z.string().optional(),
                title: z.string(),
                s3Key: z.string(),
                s3Bucket: z.string().optional().nullable(),
                type: z.enum(['FREE', 'PAID']).optional().default('FREE'),
            });

            const courseSchema = z.object({
                title: z.string().optional(),
                description: z.string().optional(),
                price: z.coerce.string().optional(),
                s3Key: z.string().optional().nullable(),
                s3Bucket: z.string().optional().nullable(),
                sections: z.array(sectionSchema).optional(),
                courseResources: z.array(resourceSchema).optional(),
                resources: z.array(resourceSchema).optional(), // Alias for frontend compatibility
                published: z.boolean().optional(),
            });

            const data = courseSchema.parse(req.body);

            await prisma.$transaction(async (tx) => {
                // 1. Update Course Basic Info
                const courseUpdateIs: any = {};
                if (data.title) courseUpdateIs.title = data.title;
                if (data.description !== undefined) courseUpdateIs.description = data.description;
                if (data.price) courseUpdateIs.price = data.price;
                if (data.published !== undefined) courseUpdateIs.published = data.published;
                if (data.s3Key) {
                    courseUpdateIs.s3Key = data.s3Key;
                    courseUpdateIs.s3Bucket = data.s3Bucket || process.env.AWS_BUCKET_NAME;
                    courseUpdateIs.thumbnail = `s3://${courseUpdateIs.s3Bucket}/${courseUpdateIs.s3Key}`;
                } else if (data.s3Key === null) {
                    // Explicit removal if null passed
                }

                if (Object.keys(courseUpdateIs).length > 0) {
                    await tx.course.update({
                        where: { id: courseId },
                        data: courseUpdateIs,
                    });
                }

                // 2. Resources (Full Sync)
                const resourcesToUpdate = data.courseResources || data.resources;

                if (resourcesToUpdate) {
                    for (const resData of resourcesToUpdate) {
                        const payload = {
                            courseId,
                            title: resData.title,
                            s3Key: resData.s3Key,
                            s3Bucket: resData.s3Bucket || process.env.AWS_BUCKET_NAME!,
                            type: resData.type as any
                        };

                        if (resData.id) {
                            // Verify existence before update to avoid 500
                            const existing = await tx.courseResource.findUnique({ where: { id: resData.id } });
                            if (existing) {
                                await tx.courseResource.update({
                                    where: { id: resData.id },
                                    data: {
                                        title: resData.title,
                                        s3Key: resData.s3Key,
                                        s3Bucket: resData.s3Bucket || process.env.AWS_BUCKET_NAME!,
                                        type: resData.type as any
                                    }
                                });
                            } else {
                                // If ID provided but not found, create new (or ignore, but creating seems safer to avoid data loss)
                                await tx.courseResource.create({ data: payload });
                            }
                        } else {
                            await tx.courseResource.create({ data: payload });
                        }
                    }
                }

                // 3. Sections & Lectures (Full Sync)
                if (data.sections) {
                    const incomingSectionIds = data.sections.map(s => s.id).filter(Boolean) as string[];

                    // Find and delete removed sections (and their lectures)
                    const sectionsToDelete = await tx.section.findMany({
                        where: { courseId, id: { notIn: incomingSectionIds } },
                        select: { id: true }
                    });
                    if (sectionsToDelete.length > 0) {
                        const delIds = sectionsToDelete.map(s => s.id);
                        await tx.lecture.deleteMany({ where: { sectionId: { in: delIds } } });
                        await tx.section.deleteMany({ where: { id: { in: delIds } } });
                    }

                    for (const sectionData of data.sections) {
                        let sectionId = sectionData.id;

                        // Check if section exists if ID is provided
                        if (sectionId) {
                            const existingSection = await tx.section.findUnique({ where: { id: sectionId } });
                            if (existingSection) {
                                await tx.section.update({
                                    where: { id: sectionId },
                                    data: { title: sectionData.title }
                                });
                            } else {
                                const newSec = await tx.section.create({
                                    data: { title: sectionData.title, courseId }
                                });
                                sectionId = newSec.id;
                            }
                        } else {
                            const newSec = await tx.section.create({
                                data: { title: sectionData.title, courseId }
                            });
                            sectionId = newSec.id;
                        }

                        // Sync Lectures
                        if (sectionData.lectures) {
                            const incomingLectureIds = sectionData.lectures.map(l => l.id).filter(Boolean) as string[];
                            await tx.lecture.deleteMany({
                                where: { sectionId, id: { notIn: incomingLectureIds } }
                            });

                            for (const lecData of sectionData.lectures) {
                                // Construct videoUrl if s3Key present
                                const bucket = lecData.s3Bucket || process.env.AWS_BUCKET_NAME!;

                                const lecPayload: any = {
                                    title: lecData.title,
                                    videoProvider: lecData.videoProvider || 's3',
                                    s3Bucket: bucket,
                                    muxAssetId: lecData.muxAssetId,
                                    muxPlaybackId: lecData.muxPlaybackId,
                                };

                                if (lecData.s3Key !== undefined) {
                                    lecPayload.s3Key = lecData.s3Key;
                                    if (lecData.s3Key) {
                                        lecPayload.videoUrl = `s3://${bucket}/${lecData.s3Key}`;
                                    } else {
                                        lecPayload.videoUrl = ''; // Clear if s3Key explicitly null
                                    }
                                } else if (lecData.videoUrl !== undefined) {
                                    lecPayload.videoUrl = lecData.videoUrl;
                                }

                                if (lecData.id) {
                                    // Check if lecture exists
                                    const existingLecture = await tx.lecture.findUnique({ where: { id: lecData.id } });
                                    if (existingLecture) {
                                        await tx.lecture.update({
                                            where: { id: lecData.id },
                                            data: lecPayload
                                        });
                                    } else {
                                        await tx.lecture.create({
                                            data: { ...lecPayload, sectionId: sectionId! }
                                        });
                                    }
                                } else {
                                    await tx.lecture.create({
                                        data: { ...lecPayload, sectionId: sectionId! }
                                    });
                                }
                            }
                        }
                    }
                }
            });

            // Return updated course with URLs signed?
            // Re-using logic from getInstructorCourses would be nice, but for now just returning raw.
            // Actually user might want to see the result immediately.
            // Let's return the simplified object.

            const updatedCourse = await prisma.course.findUnique({
                where: { id: courseId },
                include: {
                    sections: { include: { lectures: true } },
                    courseResources: true
                }
            });

            let response: any = updatedCourse;

            if (updatedCourse) {
                const { getPresignedReadUrl } = await import('../core/s3Service');

                let thumbnail = updatedCourse.thumbnail;
                // Sign Thumbnail
                if (updatedCourse.s3Key) {
                    try {
                        thumbnail = await getPresignedReadUrl(updatedCourse.s3Key, updatedCourse.s3Bucket || undefined);
                    } catch (e) {
                        logger.error('Failed to sign thumbnail', { s3Key: updatedCourse.s3Key });
                    }
                }

                // Sign Resources
                const courseResources = await Promise.all(updatedCourse.courseResources.map(async (r) => {
                    let url = '';
                    try {
                        url = await getPresignedReadUrl(r.s3Key, r.s3Bucket);
                    } catch (e) { }
                    return { ...r, url };
                }));

                // Sign Lectures
                const sections = await Promise.all(updatedCourse.sections.map(async (section) => {
                    const lectures = await Promise.all(section.lectures.map(async (lecture) => {
                        let videoUrl = lecture.videoUrl;
                        if (lecture.s3Key) {
                            try {
                                videoUrl = await getPresignedReadUrl(lecture.s3Key, lecture.s3Bucket || undefined);
                            } catch (e) { }
                        }
                        return { ...lecture, videoUrl };
                    }));
                    return { ...section, lectures };
                }));

                response = {
                    ...updatedCourse,
                    thumbnail,
                    courseResources,
                    sections
                };
            }

            res.json({ success: true, data: response });

        } catch (error: any) {
            logger.error('InstructorIntent.updateCourse: Failed', { error });
            res.status(500).json({ error: 'Failed to update course', details: error instanceof z.ZodError ? error.issues : error.message });
        }
    }

    // Get full course details for instructor (including s3 keys, unpublished content)
    static async getCourseDetails(req: Request, res: Response) {
        const { courseId } = req.params;
        logger.info('InstructorIntent.getCourseDetails: Fetching details', { courseId });
        try {
            const course = await prisma.course.findUnique({
                where: { id: courseId },
                include: {
                    sections: {
                        include: { lectures: true }
                    },
                    courseResources: true
                }
            });

            if (!course) {
                return res.status(404).json({ error: 'Course not found' });
            }

            const { getPresignedReadUrl } = await import('../core/s3Service');

            // 1. Sign Course Thumbnail
            let thumbnail = course.thumbnail;
            if (course.s3Key) {
                try {
                    thumbnail = await getPresignedReadUrl(course.s3Key, course.s3Bucket || undefined);
                } catch (e) {
                    logger.error('Failed to sign thumbnail', { s3Key: course.s3Key });
                }
            }

            // 2. Sign Resource URLs
            const resources = await Promise.all(course.courseResources.map(async (r) => {
                let url = '';
                try {
                    url = await getPresignedReadUrl(r.s3Key, r.s3Bucket);
                } catch (e) { }
                return { ...r, url };
            }));

            // 3. Sign Lecture Videos (if S3) ?
            // Usually we don't sign all videos in GET details because they expire.
            // But for "Edit" view, we might need to know if they are valid or preview them.
            // For now, let's just return the metadata (s3Key, videoProvider) so UI knows it exists.
            // If UI needs to play, it calls the stream-url endpoint. Or we can sign them here if needed.
            // Let's sign them for convenience if it's the instructor viewing.

            const sections = await Promise.all(course.sections.map(async (section) => {
                const lectures = await Promise.all(section.lectures.map(async (lecture) => {
                    let videoUrl = lecture.videoUrl;
                    if (lecture.s3Key) {
                        try {
                            videoUrl = await getPresignedReadUrl(lecture.s3Key, lecture.s3Bucket || undefined);
                        } catch (e) {
                            logger.error('Failed to sign video', { s3Key: lecture.s3Key });
                        }
                    }
                    return { ...lecture, videoUrl };
                }));
                return { ...section, lectures };
            }));

            res.json({
                success: true,
                data: {
                    ...course,
                    thumbnail,
                    courseResources: resources,
                    sections
                }
            });

        } catch (error) {
            logger.error('InstructorIntent.getCourseDetails: Failed', { error });
            res.status(500).json({ error: 'Failed to get course details' });
        }
    }
}
