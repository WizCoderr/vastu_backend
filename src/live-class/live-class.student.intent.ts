import { Request, Response } from "express";
import logger from "../utils/logger";
import { LiveClassReducer } from "./live-class.reducer";
import { courseIdParamSchema, registerDeviceTokenSchema } from "./live-class.dto";
import { prisma } from "../core/prisma";

// Extend Express Request to include user from auth middleware
interface AuthenticatedRequest extends Request {
    user?: { userId: string; role: string };
}

/**
 * Student intent handlers for live class access
 */
export class LiveClassStudentIntent {
    /**
     * GET /user/live-classes/today
     * Get today's live classes for enrolled courses
     */
    static async getToday(req: AuthenticatedRequest, res: Response) {
        const userId = req.user?.userId;

        if (!userId) {
            res.status(401).json({ error: "Unauthorized" });
            return;
        }

        logger.info("LiveClassStudentIntent.getToday: Fetching today's classes", { userId });

        const result = await LiveClassReducer.getTodayForStudent(userId);

        if (result.success) {
            res.status(200).json(result.data);
        } else {
            res.status(500).json({ error: result.error });
        }
    }

    /**
     * GET /user/live-classes/upcoming
     * Get upcoming live classes for enrolled courses
     */
    static async getUpcoming(req: AuthenticatedRequest, res: Response) {
        const userId = req.user?.userId;

        if (!userId) {
            res.status(401).json({ error: "Unauthorized" });
            return;
        }

        logger.info("LiveClassStudentIntent.getUpcoming: Fetching upcoming classes", { userId });

        const result = await LiveClassReducer.getUpcomingForStudent(userId);

        if (result.success) {
            res.status(200).json(result.data);
        } else {
            res.status(500).json({ error: result.error });
        }
    }

    /**
     * GET /course/:courseId/recordings
     * Get recordings for a course (must be enrolled)
     */
    static async getRecordings(req: AuthenticatedRequest, res: Response) {
        const userId = req.user?.userId;

        if (!userId) {
            res.status(401).json({ error: "Unauthorized" });
            return;
        }

        const paramValidation = courseIdParamSchema.safeParse(req.params);
        if (!paramValidation.success) {
            res.status(400).json({ error: "Invalid course ID" });
            return;
        }

        const { courseId } = paramValidation.data;
        logger.info("LiveClassStudentIntent.getRecordings: Fetching recordings", { userId, courseId });

        const result = await LiveClassReducer.getRecordingsForCourse(userId, courseId);

        if (result.success) {
            res.status(200).json(result.data);
        } else {
            res.status(403).json({ error: result.error });
        }
    }

    /**
     * POST /user/device-token
     * Register FCM device token for push notifications
     */
    static async registerDeviceToken(req: AuthenticatedRequest, res: Response) {
        const userId = req.user?.userId;

        if (!userId) {
            res.status(401).json({ error: "Unauthorized" });
            return;
        }

        const validation = registerDeviceTokenSchema.safeParse(req.body);
        if (!validation.success) {
            logger.warn("LiveClassStudentIntent.registerDeviceToken: Validation failed", {
                errors: validation.error.issues,
            });
            res.status(400).json({ error: validation.error.issues[0].message });
            return;
        }

        const { token, platform } = validation.data;
        logger.info("LiveClassStudentIntent.registerDeviceToken: Registering token", { userId, platform });

        try {
            // Upsert device token
            await prisma.deviceToken.upsert({
                where: {
                    userId_token: { userId, token },
                },
                update: {
                    platform,
                    updatedAt: new Date(),
                },
                create: {
                    userId,
                    token,
                    platform,
                },
            });

            res.status(200).json({ success: true, message: "Device token registered" });
        } catch (error) {
            logger.error("LiveClassStudentIntent.registerDeviceToken: Failed", { error, userId });
            res.status(500).json({ error: "Failed to register device token" });
        }
    }

    /**
     * DELETE /user/device-token
     * Remove FCM device token (for logout)
     */
    static async removeDeviceToken(req: AuthenticatedRequest, res: Response) {
        const userId = req.user?.userId;

        if (!userId) {
            res.status(401).json({ error: "Unauthorized" });
            return;
        }

        const { token } = req.body;

        if (!token) {
            res.status(400).json({ error: "Token is required" });
            return;
        }

        logger.info("LiveClassStudentIntent.removeDeviceToken: Removing token", { userId });

        try {
            await prisma.deviceToken.deleteMany({
                where: { userId, token },
            });

            res.status(200).json({ success: true, message: "Device token removed" });
        } catch (error) {
            logger.error("LiveClassStudentIntent.removeDeviceToken: Failed", { error, userId });
            res.status(500).json({ error: "Failed to remove device token" });
        }
    }
}
