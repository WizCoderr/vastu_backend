import { prisma } from "../core/prisma";
import { Result } from "../core/result";
import logger from "../utils/logger";
import { LiveClassRepository } from "./live-class.repository";
import type { CreateLiveClassDto, UpdateLiveClassDto } from "./live-class.dto";

// Window in minutes before class start when meeting URL becomes visible
const MEETING_URL_WINDOW_MINUTES = 15;

export class LiveClassReducer {
    // =========================================================================
    // ADMIN OPERATIONS
    // =========================================================================

    /**
     * Create a new live class (Admin only)
     */
    static async createLiveClass(data: CreateLiveClassDto): Promise<Result<any>> {
        try {
            // Verify course exists
            const course = await prisma.course.findUnique({
                where: { id: data.courseId },
            });

            if (!course) {
                return Result.fail("Course not found");
            }

            // Validate scheduled time is in the future
            const scheduledAt = new Date(data.scheduledAt);
            if (scheduledAt <= new Date()) {
                return Result.fail("Scheduled time must be in the future");
            }

            const liveClass = await LiveClassRepository.create(data);

            logger.info("LiveClass created", { liveClassId: liveClass.id, courseId: data.courseId });

            return Result.ok(liveClass);
        } catch (error) {
            logger.error("LiveClassReducer.createLiveClass: Failed", { error, data });
            return Result.fail("Failed to create live class");
        }
    }

    /**
     * Update live class details (Admin only)
     */
    static async updateLiveClass(id: string, data: UpdateLiveClassDto): Promise<Result<any>> {
        try {
            const existing = await LiveClassRepository.findById(id);
            if (!existing) {
                return Result.fail("Live class not found");
            }

            // If updating scheduledAt, validate it's in the future
            if (data.scheduledAt) {
                const scheduledAt = new Date(data.scheduledAt);
                if (scheduledAt <= new Date()) {
                    return Result.fail("Scheduled time must be in the future");
                }
            }

            const updated = await LiveClassRepository.update(id, data);

            logger.info("LiveClass updated", { liveClassId: id });

            return Result.ok(updated);
        } catch (error) {
            logger.error("LiveClassReducer.updateLiveClass: Failed", { error, id, data });
            return Result.fail("Failed to update live class");
        }
    }

    /**
     * Mark live class as live (Admin only)
     */
    static async markAsLive(id: string): Promise<Result<any>> {
        try {
            const existing = await LiveClassRepository.findById(id);
            if (!existing) {
                return Result.fail("Live class not found");
            }

            if (existing.status !== "SCHEDULED") {
                return Result.fail("Can only mark scheduled classes as live");
            }

            const updated = await LiveClassRepository.updateStatus(id, "LIVE");

            logger.info("LiveClass marked as LIVE", { liveClassId: id });

            return Result.ok(updated);
        } catch (error) {
            logger.error("LiveClassReducer.markAsLive: Failed", { error, id });
            return Result.fail("Failed to mark class as live");
        }
    }

    /**
     * Mark live class as completed (Admin only)
     */
    static async markAsCompleted(id: string): Promise<Result<any>> {
        try {
            const existing = await LiveClassRepository.findById(id);
            if (!existing) {
                return Result.fail("Live class not found");
            }

            if (existing.status === "COMPLETED") {
                return Result.fail("Class is already completed");
            }

            const updated = await LiveClassRepository.updateStatus(id, "COMPLETED");

            logger.info("LiveClass marked as COMPLETED", { liveClassId: id });

            return Result.ok(updated);
        } catch (error) {
            logger.error("LiveClassReducer.markAsCompleted: Failed", { error, id });
            return Result.fail("Failed to mark class as completed");
        }
    }

    /**
     * Upload recording URL (Admin only)
     */
    static async uploadRecording(id: string, recordingUrl: string): Promise<Result<any>> {
        try {
            const existing = await LiveClassRepository.findById(id);
            if (!existing) {
                return Result.fail("Live class not found");
            }

            const updated = await LiveClassRepository.setRecording(id, recordingUrl);

            logger.info("LiveClass recording uploaded", { liveClassId: id });

            return Result.ok(updated);
        } catch (error) {
            logger.error("LiveClassReducer.uploadRecording: Failed", { error, id });
            return Result.fail("Failed to upload recording");
        }
    }

    /**
     * Manually trigger notification for a live class (Admin only)
     */
    static async triggerNotification(id: string): Promise<Result<any>> {
        try {
            const liveClass = await LiveClassRepository.findById(id);
            if (!liveClass) {
                return Result.fail("Live class not found");
            }

            // Import notification service dynamically to avoid circular dependencies
            const { NotificationService } = await import("../notification/notification.service");

            await NotificationService.sendLiveClassNotification(liveClass);
            await LiveClassRepository.markNotifySent(id);

            logger.info("LiveClass notification triggered manually", { liveClassId: id });

            return Result.ok({ message: "Notification sent successfully" });
        } catch (error) {
            logger.error("LiveClassReducer.triggerNotification: Failed", { error, id });
            return Result.fail("Failed to send notification");
        }
    }

    /**
     * Get all live classes for a course (Admin only)
     */
    static async getAllForCourse(courseId: string): Promise<Result<any>> {
        try {
            const liveClasses = await LiveClassRepository.getAllForCourse(courseId);
            return Result.ok(liveClasses);
        } catch (error) {
            logger.error("LiveClassReducer.getAllForCourse: Failed", { error, courseId });
            return Result.fail("Failed to fetch live classes");
        }
    }

    /**
     * Get live class details (Admin only)
     */
    static async getById(id: string): Promise<Result<any>> {
        try {
            const liveClass = await LiveClassRepository.findById(id);
            if (!liveClass) {
                return Result.fail("Live class not found");
            }
            return Result.ok(liveClass);
        } catch (error) {
            logger.error("LiveClassReducer.getById: Failed", { error, id });
            return Result.fail("Failed to fetch live class");
        }
    }

    /**
     * Delete a live class (Admin only)
     */
    static async delete(id: string): Promise<Result<any>> {
        try {
            const existing = await LiveClassRepository.findById(id);
            if (!existing) {
                return Result.fail("Live class not found");
            }

            await LiveClassRepository.delete(id);

            logger.info("LiveClass deleted", { liveClassId: id });

            return Result.ok({ message: "Live class deleted successfully" });
        } catch (error) {
            logger.error("LiveClassReducer.delete: Failed", { error, id });
            return Result.fail("Failed to delete live class");
        }
    }

    // =========================================================================
    // STUDENT OPERATIONS
    // =========================================================================

    /**
     * Get today's live classes for an enrolled student
     */
    static async getTodayForStudent(userId: string): Promise<Result<any>> {
        try {
            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: { enrolledCourseIds: true },
            });

            if (!user || user.enrolledCourseIds.length === 0) {
                return Result.ok([]);
            }

            const liveClasses = await LiveClassRepository.getTodayForCourses(user.enrolledCourseIds);

            // Filter meeting URL based on class status and time window
            const sanitized = liveClasses.map((lc) => this.sanitizeForStudent(lc));

            return Result.ok(sanitized);
        } catch (error) {
            logger.error("LiveClassReducer.getTodayForStudent: Failed", { error, userId });
            return Result.fail("Failed to fetch today's live classes");
        }
    }

    /**
     * Get upcoming live classes for an enrolled student
     */
    static async getUpcomingForStudent(userId: string): Promise<Result<any>> {
        try {
            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: { enrolledCourseIds: true },
            });

            if (!user || user.enrolledCourseIds.length === 0) {
                return Result.ok([]);
            }

            const liveClasses = await LiveClassRepository.getUpcomingForCourses(user.enrolledCourseIds);

            // Filter meeting URL based on class status and time window
            const sanitized = liveClasses.map((lc) => this.sanitizeForStudent(lc));

            return Result.ok(sanitized);
        } catch (error) {
            logger.error("LiveClassReducer.getUpcomingForStudent: Failed", { error, userId });
            return Result.fail("Failed to fetch upcoming live classes");
        }
    }

    /**
     * Get recordings for a course (only for enrolled students)
     */
    static async getRecordingsForCourse(userId: string, courseId: string): Promise<Result<any>> {
        try {
            // Verify enrollment
            const enrollment = await prisma.enrollment.findUnique({
                where: {
                    userId_courseId: { userId, courseId },
                },
            });

            if (!enrollment) {
                return Result.fail("You are not enrolled in this course");
            }

            const recordings = await LiveClassRepository.getRecordingsForCourse(courseId);

            return Result.ok(recordings);
        } catch (error) {
            logger.error("LiveClassReducer.getRecordingsForCourse: Failed", { error, userId, courseId });
            return Result.fail("Failed to fetch recordings");
        }
    }

    // =========================================================================
    // HELPER METHODS
    // =========================================================================

    /**
     * Sanitize live class data for student view
     * Only show meeting URL if class is live or within allowed time window
     */
    private static sanitizeForStudent(liveClass: any) {
        const now = new Date();
        const scheduledAt = new Date(liveClass.scheduledAt);
        const windowStart = new Date(scheduledAt.getTime() - MEETING_URL_WINDOW_MINUTES * 60 * 1000);
        const classEnd = new Date(scheduledAt.getTime() + liveClass.durationMinutes * 60 * 1000);

        // Show meeting URL if:
        // 1. Class is currently LIVE, or
        // 2. Current time is within the window (15 min before to end of class)
        const isWithinWindow = now >= windowStart && now <= classEnd;
        const isLive = liveClass.status === "LIVE";
        const showMeetingUrl = isLive || isWithinWindow;

        return {
            id: liveClass.id,
            courseId: liveClass.courseId,
            courseName: liveClass.course?.title,
            batchId: liveClass.batchId,
            title: liveClass.title,
            description: liveClass.description,
            scheduledAt: liveClass.scheduledAt,
            durationMinutes: liveClass.durationMinutes,
            status: liveClass.status,
            meetingUrl: showMeetingUrl ? liveClass.meetingUrl : null,
            canJoin: showMeetingUrl,
            startsIn: scheduledAt > now ? Math.round((scheduledAt.getTime() - now.getTime()) / 60000) : 0,
        };
    }
}
