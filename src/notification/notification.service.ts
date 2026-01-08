import { prisma } from "../core/prisma";
import logger from "../utils/logger";

// =============================================================================
// FCM HTTP API NOTIFICATION SERVICE
// Uses direct HTTP calls to FCM - NO Firebase SDK required
// =============================================================================

// FCM Legacy HTTP API endpoint
const FCM_ENDPOINT = "https://fcm.googleapis.com/fcm/send";

// Get server key from environment
const FCM_SERVER_KEY = process.env.FCM_SERVER_KEY;

// Notification types
export type NotificationType = "LIVE_CLASS" | "RECORDING_AVAILABLE";

interface FCMNotificationPayload {
    title: string;
    body: string;
    icon?: string;
    click_action?: string;
}

interface FCMDataPayload {
    type: NotificationType;
    classId?: string;
    courseId?: string;
    meetingUrl?: string;
    recordingUrl?: string;
    [key: string]: string | undefined;
}

interface FCMMessage {
    to?: string;
    registration_ids?: string[];
    notification: FCMNotificationPayload;
    data: Record<string, string>;
    priority?: "high" | "normal";
    time_to_live?: number;
}

interface FCMResponse {
    multicast_id: number;
    success: number;
    failure: number;
    results: Array<{
        message_id?: string;
        error?: string;
    }>;
}

export class NotificationService {
    /**
     * Send notification to multiple device tokens via FCM HTTP API
     */
    private static async sendToTokens(
        tokens: string[],
        notification: FCMNotificationPayload,
        data: FCMDataPayload
    ): Promise<{ success: number; failure: number; failedTokens: string[] }> {
        if (!FCM_SERVER_KEY) {
            logger.warn("NotificationService: FCM_SERVER_KEY not configured, skipping notification");
            return { success: 0, failure: tokens.length, failedTokens: tokens };
        }

        if (tokens.length === 0) {
            logger.info("NotificationService: No tokens to send to");
            return { success: 0, failure: 0, failedTokens: [] };
        }

        // FCM supports up to 1000 tokens per request
        const batchSize = 1000;
        let totalSuccess = 0;
        let totalFailure = 0;
        const allFailedTokens: string[] = [];

        for (let i = 0; i < tokens.length; i += batchSize) {
            const batch = tokens.slice(i, i + batchSize);

            const message: FCMMessage = {
                registration_ids: batch,
                notification,
                data: this.sanitizeDataPayload(data),
                priority: "high",
                time_to_live: 3600, // 1 hour
            };

            try {
                const response = await fetch(FCM_ENDPOINT, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `key=${FCM_SERVER_KEY}`,
                    },
                    body: JSON.stringify(message),
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    logger.error("NotificationService: FCM request failed", {
                        status: response.status,
                        error: errorText,
                    });
                    totalFailure += batch.length;
                    allFailedTokens.push(...batch);
                    continue;
                }

                const result: FCMResponse = await response.json();

                totalSuccess += result.success;
                totalFailure += result.failure;

                // Track failed tokens for cleanup
                if (result.failure > 0) {
                    result.results.forEach((r, index) => {
                        if (r.error) {
                            allFailedTokens.push(batch[index]);
                            // Log specific errors for debugging
                            if (r.error === "NotRegistered" || r.error === "InvalidRegistration") {
                                logger.info("NotificationService: Invalid token detected", {
                                    token: batch[index].substring(0, 20) + "...",
                                    error: r.error,
                                });
                            }
                        }
                    });
                }

                logger.info("NotificationService: FCM batch sent", {
                    batchSize: batch.length,
                    success: result.success,
                    failure: result.failure,
                });
            } catch (error) {
                logger.error("NotificationService: FCM request error", { error });
                totalFailure += batch.length;
                allFailedTokens.push(...batch);
            }
        }

        return {
            success: totalSuccess,
            failure: totalFailure,
            failedTokens: allFailedTokens,
        };
    }

    /**
     * Sanitize data payload - FCM data values must be strings
     */
    private static sanitizeDataPayload(data: FCMDataPayload): Record<string, string> {
        const sanitized: Record<string, string> = {};
        for (const [key, value] of Object.entries(data)) {
            if (value !== undefined && value !== null) {
                sanitized[key] = String(value);
            }
        }
        return sanitized;
    }

    /**
     * Send live class notification to all enrolled users
     */
    static async sendLiveClassNotification(liveClass: {
        id: string;
        title: string;
        courseId: string;
        meetingUrl: string;
        course?: { title?: string };
    }): Promise<void> {
        try {
            const courseName = liveClass.course?.title || "Your course";

            // Find all enrolled users for this course
            const enrollments = await prisma.enrollment.findMany({
                where: { courseId: liveClass.courseId },
                select: { userId: true },
            });

            const userIds = enrollments.map((e) => e.userId);

            if (userIds.length === 0) {
                logger.info("NotificationService: No enrolled users for live class notification", {
                    liveClassId: liveClass.id,
                });
                return;
            }

            // Get device tokens for these users
            const deviceTokens = await prisma.deviceToken.findMany({
                where: { userId: { in: userIds } },
                select: { token: true, userId: true },
            });

            if (deviceTokens.length === 0) {
                logger.info("NotificationService: No device tokens for enrolled users", {
                    liveClassId: liveClass.id,
                    userCount: userIds.length,
                });
                return;
            }

            const tokens = deviceTokens.map((dt) => dt.token);

            const notification: FCMNotificationPayload = {
                title: "🔴 Live Class Starting Soon!",
                body: `${liveClass.title} - ${courseName} is starting in 30 minutes`,
                click_action: "OPEN_LIVE_CLASS",
            };

            const data: FCMDataPayload = {
                type: "LIVE_CLASS",
                classId: liveClass.id,
                courseId: liveClass.courseId,
                meetingUrl: liveClass.meetingUrl,
            };

            const result = await this.sendToTokens(tokens, notification, data);

            // Log notification to database
            await this.logNotifications(userIds, "LIVE_CLASS", notification, data, liveClass.id);

            // Clean up invalid tokens
            if (result.failedTokens.length > 0) {
                await this.cleanupInvalidTokens(result.failedTokens);
            }

            logger.info("NotificationService: Live class notification sent", {
                liveClassId: liveClass.id,
                totalTokens: tokens.length,
                success: result.success,
                failure: result.failure,
            });
        } catch (error) {
            logger.error("NotificationService: Failed to send live class notification", {
                error,
                liveClassId: liveClass.id,
            });
            throw error;
        }
    }

    /**
     * Send recording available notification to all enrolled users
     */
    static async sendRecordingNotification(liveClass: {
        id: string;
        title: string;
        courseId: string;
        recordingUrl: string | null;
        course?: { title?: string };
    }): Promise<void> {
        try {
            if (!liveClass.recordingUrl) {
                logger.warn("NotificationService: No recording URL for notification", {
                    liveClassId: liveClass.id,
                });
                return;
            }

            const courseName = liveClass.course?.title || "Your course";

            // Find all enrolled users for this course
            const enrollments = await prisma.enrollment.findMany({
                where: { courseId: liveClass.courseId },
                select: { userId: true },
            });

            const userIds = enrollments.map((e) => e.userId);

            if (userIds.length === 0) {
                return;
            }

            // Get device tokens for these users
            const deviceTokens = await prisma.deviceToken.findMany({
                where: { userId: { in: userIds } },
                select: { token: true },
            });

            if (deviceTokens.length === 0) {
                return;
            }

            const tokens = deviceTokens.map((dt) => dt.token);

            const notification: FCMNotificationPayload = {
                title: "📹 Recording Available!",
                body: `The recording for "${liveClass.title}" is now available`,
                click_action: "OPEN_RECORDING",
            };

            const data: FCMDataPayload = {
                type: "RECORDING_AVAILABLE",
                classId: liveClass.id,
                courseId: liveClass.courseId,
                recordingUrl: liveClass.recordingUrl,
            };

            const result = await this.sendToTokens(tokens, notification, data);

            // Log notification to database
            await this.logNotifications(userIds, "RECORDING_AVAILABLE", notification, data, liveClass.id);

            // Clean up invalid tokens
            if (result.failedTokens.length > 0) {
                await this.cleanupInvalidTokens(result.failedTokens);
            }

            logger.info("NotificationService: Recording notification sent", {
                liveClassId: liveClass.id,
                success: result.success,
                failure: result.failure,
            });
        } catch (error) {
            logger.error("NotificationService: Failed to send recording notification", {
                error,
                liveClassId: liveClass.id,
            });
            throw error;
        }
    }

    /**
     * Log notifications to database for tracking
     */
    private static async logNotifications(
        userIds: string[],
        type: NotificationType,
        notification: FCMNotificationPayload,
        data: FCMDataPayload,
        liveClassId?: string
    ): Promise<void> {
        try {
            const logs = userIds.map((userId) => ({
                userId,
                type,
                title: notification.title,
                body: notification.body,
                data: JSON.stringify(data),
                liveClassId,
                sent: true,
                sentAt: new Date(),
            }));

            await prisma.notificationLog.createMany({
                data: logs,
            });
        } catch (error) {
            logger.error("NotificationService: Failed to log notifications", { error });
            // Don't throw - logging failure shouldn't break notification flow
        }
    }

    /**
     * Remove invalid/expired device tokens from database
     */
    private static async cleanupInvalidTokens(tokens: string[]): Promise<void> {
        try {
            const result = await prisma.deviceToken.deleteMany({
                where: { token: { in: tokens } },
            });

            logger.info("NotificationService: Cleaned up invalid tokens", {
                count: result.count,
            });
        } catch (error) {
            logger.error("NotificationService: Failed to cleanup invalid tokens", { error });
        }
    }

    /**
     * Send a test notification to a specific token (for debugging)
     */
    static async sendTestNotification(token: string): Promise<boolean> {
        const notification: FCMNotificationPayload = {
            title: "Test Notification",
            body: "This is a test notification from the Vastu backend",
        };

        const data: FCMDataPayload = {
            type: "LIVE_CLASS",
            classId: "test",
            courseId: "test",
        };

        const result = await this.sendToTokens([token], notification, data);
        return result.success > 0;
    }
}
