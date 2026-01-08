import { prisma } from "../core/prisma";
import logger from "../utils/logger";
import { LiveClassRepository } from "../live-class/live-class.repository";
import { NotificationService } from "./notification.service";

// =============================================================================
// NOTIFICATION CRON WORKER
// Runs every 5 minutes to check for pending notifications
// =============================================================================

// Interval in milliseconds (5 minutes)
const CRON_INTERVAL_MS = 5 * 60 * 1000;

// Track if worker is running to prevent overlapping executions
let isRunning = false;
let intervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Process live class notifications (30 minutes before scheduled time)
 */
async function processLiveClassNotifications(): Promise<number> {
    try {
        const pendingClasses = await LiveClassRepository.findPendingNotifications();

        if (pendingClasses.length === 0) {
            return 0;
        }

        logger.info("NotificationWorker: Found pending live class notifications", {
            count: pendingClasses.length,
        });

        let successCount = 0;

        for (const liveClass of pendingClasses) {
            try {
                await NotificationService.sendLiveClassNotification(liveClass);
                await LiveClassRepository.markNotifySent(liveClass.id);
                successCount++;

                logger.info("NotificationWorker: Live class notification sent", {
                    liveClassId: liveClass.id,
                    title: liveClass.title,
                });
            } catch (error) {
                logger.error("NotificationWorker: Failed to send live class notification", {
                    error,
                    liveClassId: liveClass.id,
                });
                // Continue processing other classes
            }
        }

        return successCount;
    } catch (error) {
        logger.error("NotificationWorker: Error processing live class notifications", { error });
        return 0;
    }
}

/**
 * Process recording available notifications
 */
async function processRecordingNotifications(): Promise<number> {
    try {
        const pendingRecordings = await LiveClassRepository.findPendingRecordingNotifications();

        if (pendingRecordings.length === 0) {
            return 0;
        }

        logger.info("NotificationWorker: Found pending recording notifications", {
            count: pendingRecordings.length,
        });

        let successCount = 0;

        for (const liveClass of pendingRecordings) {
            try {
                await NotificationService.sendRecordingNotification(liveClass);
                await LiveClassRepository.markRecordingNotifySent(liveClass.id);
                successCount++;

                logger.info("NotificationWorker: Recording notification sent", {
                    liveClassId: liveClass.id,
                    title: liveClass.title,
                });
            } catch (error) {
                logger.error("NotificationWorker: Failed to send recording notification", {
                    error,
                    liveClassId: liveClass.id,
                });
                // Continue processing other recordings
            }
        }

        return successCount;
    } catch (error) {
        logger.error("NotificationWorker: Error processing recording notifications", { error });
        return 0;
    }
}

/**
 * Auto-update live class status based on scheduled time
 * - Mark as LIVE when scheduled time has passed
 * - Mark as COMPLETED when scheduled time + duration has passed
 */
async function autoUpdateClassStatus(): Promise<void> {
    try {
        const now = new Date();

        // Find classes that should be LIVE (scheduled time has passed, still SCHEDULED)
        const classesToGoLive = await prisma.liveClass.findMany({
            where: {
                status: "SCHEDULED",
                scheduledAt: { lte: now },
            },
        });

        for (const liveClass of classesToGoLive) {
            const endTime = new Date(liveClass.scheduledAt.getTime() + liveClass.durationMinutes * 60 * 1000);

            if (now >= endTime) {
                // Class has ended, mark as COMPLETED
                await prisma.liveClass.update({
                    where: { id: liveClass.id },
                    data: { status: "COMPLETED" },
                });
                logger.info("NotificationWorker: Auto-marked class as COMPLETED", {
                    liveClassId: liveClass.id,
                });
            } else {
                // Class is ongoing, mark as LIVE
                await prisma.liveClass.update({
                    where: { id: liveClass.id },
                    data: { status: "LIVE" },
                });
                logger.info("NotificationWorker: Auto-marked class as LIVE", {
                    liveClassId: liveClass.id,
                });
            }
        }

        // Find LIVE classes that should be COMPLETED
        const classesToComplete = await prisma.liveClass.findMany({
            where: {
                status: "LIVE",
            },
        });

        for (const liveClass of classesToComplete) {
            const endTime = new Date(liveClass.scheduledAt.getTime() + liveClass.durationMinutes * 60 * 1000);

            if (now >= endTime) {
                await prisma.liveClass.update({
                    where: { id: liveClass.id },
                    data: { status: "COMPLETED" },
                });
                logger.info("NotificationWorker: Auto-marked LIVE class as COMPLETED", {
                    liveClassId: liveClass.id,
                });
            }
        }
    } catch (error) {
        logger.error("NotificationWorker: Error auto-updating class status", { error });
    }
}

/**
 * Main worker tick - runs all notification jobs
 */
async function workerTick(): Promise<void> {
    if (isRunning) {
        logger.warn("NotificationWorker: Previous tick still running, skipping");
        return;
    }

    isRunning = true;
    const startTime = Date.now();

    try {
        logger.debug("NotificationWorker: Starting tick");

        // Run all jobs
        const [liveClassCount, recordingCount] = await Promise.all([
            processLiveClassNotifications(),
            processRecordingNotifications(),
        ]);

        // Auto-update class statuses
        await autoUpdateClassStatus();

        const duration = Date.now() - startTime;

        if (liveClassCount > 0 || recordingCount > 0) {
            logger.info("NotificationWorker: Tick completed", {
                liveClassNotifications: liveClassCount,
                recordingNotifications: recordingCount,
                durationMs: duration,
            });
        } else {
            logger.debug("NotificationWorker: Tick completed, no notifications sent", {
                durationMs: duration,
            });
        }
    } catch (error) {
        logger.error("NotificationWorker: Tick failed", { error });
    } finally {
        isRunning = false;
    }
}

/**
 * Start the notification worker
 */
export function startNotificationWorker(): void {
    if (intervalId) {
        logger.warn("NotificationWorker: Already running");
        return;
    }

    logger.info("NotificationWorker: Starting", {
        intervalMs: CRON_INTERVAL_MS,
        intervalMinutes: CRON_INTERVAL_MS / 60000,
    });

    // Run immediately on start
    workerTick();

    // Schedule recurring execution
    intervalId = setInterval(workerTick, CRON_INTERVAL_MS);

    // Handle process termination gracefully
    const cleanup = () => {
        stopNotificationWorker();
    };

    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
}

/**
 * Stop the notification worker
 */
export function stopNotificationWorker(): void {
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
        logger.info("NotificationWorker: Stopped");
    }
}

/**
 * Manually trigger a worker tick (for testing/debugging)
 */
export async function triggerWorkerTick(): Promise<void> {
    await workerTick();
}

/**
 * Get worker status
 */
export function getWorkerStatus(): {
    running: boolean;
    intervalMs: number;
    isProcessing: boolean;
} {
    return {
        running: intervalId !== null,
        intervalMs: CRON_INTERVAL_MS,
        isProcessing: isRunning,
    };
}
