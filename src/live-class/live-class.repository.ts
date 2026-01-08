import { prisma } from "../core/prisma";
import type { LiveClassStatus } from "../generated/prisma/client";
import type { CreateLiveClassDto, UpdateLiveClassDto } from "./live-class.dto";

export class LiveClassRepository {
    /**
     * Create a new live class
     */
    static async create(data: CreateLiveClassDto) {
        return prisma.liveClass.create({
            data: {
                courseId: data.courseId,
                batchId: data.batchId,
                sectionId: data.sectionId, // Added
                title: data.title,
                description: data.description,
                scheduledAt: new Date(data.scheduledAt),
                durationMinutes: data.durationMinutes,
                meetingUrl: data.meetingUrl,
            },
            include: {
                course: {
                    select: { id: true, title: true },
                },
            },
        });
    }

    /**
     * Find live class by ID
     */
    static async findById(id: string) {
        return prisma.liveClass.findUnique({
            where: { id },
            include: {
                course: {
                    select: { id: true, title: true },
                },
            },
        });
    }

    /**
     * Update live class
     */
    static async update(id: string, data: UpdateLiveClassDto) {
        return prisma.liveClass.update({
            where: { id },
            data: {
                ...(data.title && { title: data.title }),
                ...(data.description !== undefined && { description: data.description }),
                ...(data.scheduledAt && { scheduledAt: new Date(data.scheduledAt) }),
                ...(data.durationMinutes && { durationMinutes: data.durationMinutes }),
                ...(data.meetingUrl && { meetingUrl: data.meetingUrl }),
                ...(data.batchId !== undefined && { batchId: data.batchId }),
                ...(data.sectionId !== undefined && { sectionId: data.sectionId }), // Added
            },
            include: {
                course: {
                    select: { id: true, title: true },
                },
            },
        });
    }

    /**
     * Update live class status
     */
    static async updateStatus(id: string, status: LiveClassStatus) {
        return prisma.liveClass.update({
            where: { id },
            data: { status },
        });
    }

    /**
     * Set recording URL and mark as completed
     */
    static async setRecording(id: string, recordingUrl: string) {
        return prisma.liveClass.update({
            where: { id },
            data: {
                recordingUrl,
                status: "COMPLETED",
            },
        });
    }

    /**
     * Mark notification as sent
     */
    static async markNotifySent(id: string) {
        return prisma.liveClass.update({
            where: { id },
            data: { notifySent: true },
        });
    }

    /**
     * Mark recording notification as sent
     */
    static async markRecordingNotifySent(id: string) {
        return prisma.liveClass.update({
            where: { id },
            data: { recordingNotifySent: true },
        });
    }

    /**
     * Find live classes pending notification (30 min before scheduled)
     */
    static async findPendingNotifications() {
        const now = new Date();
        const thirtyMinutesFromNow = new Date(now.getTime() + 30 * 60 * 1000);

        return prisma.liveClass.findMany({
            where: {
                notifySent: false,
                status: "SCHEDULED",
                scheduledAt: {
                    gte: now,
                    lte: thirtyMinutesFromNow,
                },
            },
            include: {
                course: {
                    select: { id: true, title: true },
                },
            },
        });
    }

    /**
     * Find completed classes with recordings that haven't sent notifications
     */
    static async findPendingRecordingNotifications() {
        return prisma.liveClass.findMany({
            where: {
                status: "COMPLETED",
                recordingUrl: { not: null },
                recordingNotifySent: false,
            },
            include: {
                course: {
                    select: { id: true, title: true },
                },
            },
        });
    }

    /**
     * Get today's live classes for enrolled courses
     */
    static async getTodayForCourses(courseIds: string[]) {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        return prisma.liveClass.findMany({
            where: {
                courseId: { in: courseIds },
                scheduledAt: {
                    gte: startOfDay,
                    lte: endOfDay,
                },
            },
            include: {
                course: {
                    select: { id: true, title: true },
                },
            },
            orderBy: { scheduledAt: "asc" },
        });
    }

    /**
     * Get upcoming live classes for enrolled courses
     */
    static async getUpcomingForCourses(courseIds: string[], limit = 20) {
        const now = new Date();

        return prisma.liveClass.findMany({
            where: {
                courseId: { in: courseIds },
                scheduledAt: { gte: now },
                status: { in: ["SCHEDULED", "LIVE"] },
            },
            include: {
                course: {
                    select: { id: true, title: true },
                },
            },
            orderBy: { scheduledAt: "asc" },
            take: limit,
        });
    }

    /**
     * Get recordings for a course
     */
    static async getRecordingsForCourse(courseId: string) {
        return prisma.liveClass.findMany({
            where: {
                courseId,
                status: "COMPLETED",
                recordingUrl: { not: null },
            },
            select: {
                id: true,
                title: true,
                description: true,
                scheduledAt: true,
                durationMinutes: true,
                recordingUrl: true,
            },
            orderBy: { scheduledAt: "desc" },
        });
    }

    /**
     * Get all live classes for a course (admin view)
     */
    static async getAllForCourse(courseId: string) {
        return prisma.liveClass.findMany({
            where: { courseId },
            orderBy: { scheduledAt: "desc" },
        });
    }

    /**
     * Delete a live class
     */
    static async delete(id: string) {
        return prisma.liveClass.delete({
            where: { id },
        });
    }
}
