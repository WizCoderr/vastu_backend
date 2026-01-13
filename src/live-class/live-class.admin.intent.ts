import { Request, Response } from "express";
import logger from "../utils/logger";
import { LiveClassReducer } from "./live-class.reducer";
import {
    createLiveClassSchema,
    updateLiveClassSchema,
    uploadRecordingSchema,
    liveClassIdParamSchema,
    courseIdParamSchema,
} from "./live-class.dto";

/**
 * Admin intent handlers for live class management
 */
export class LiveClassAdminIntent {
    /**
     * POST /admin/live-classes
     * Create a new live class
     */
    static async create(req: Request, res: Response) {
        logger.info("LiveClassAdminIntent.create: Creating live class");

        const validation = createLiveClassSchema.safeParse(req.body);
        if (!validation.success) {
            logger.warn("LiveClassAdminIntent.create: Validation failed", {
                errors: validation.error.issues,
            });
            res.status(400).json({ error: validation.error.issues[0].message });
            return;
        }

        const result = await LiveClassReducer.createLiveClass(validation.data);

        if (result.success) {
            res.status(201).json(result.data);
        } else {
            res.status(400).json({ error: result.error });
        }
    }

    /**
     * GET /admin/live-classes/:id
     * Get live class details
     */
    static async getById(req: Request, res: Response) {
        const paramValidation = liveClassIdParamSchema.safeParse(req.params);
        if (!paramValidation.success) {
            res.status(400).json({ error: "Invalid live class ID" });
            return;
        }

        const { id } = paramValidation.data;
        logger.info("LiveClassAdminIntent.getById: Fetching live class", { id });

        const result = await LiveClassReducer.getById(id);

        if (result.success) {
            res.status(200).json(result.data);
        } else {
            res.status(404).json({ error: result.error });
        }
    }

    /**
     * GET /admin/live-classes/course/:courseId
     * Get all live classes for a course
     */
    static async getAllForCourse(req: Request, res: Response) {
        const paramValidation = courseIdParamSchema.safeParse(req.params);
        if (!paramValidation.success) {
            res.status(400).json({ error: "Invalid course ID" });
            return;
        }

        const { courseId } = paramValidation.data;
        logger.info("LiveClassAdminIntent.getAllForCourse: Fetching live classes", { courseId });

        const result = await LiveClassReducer.getAllForCourse(courseId);

        if (result.success) {
            res.status(200).json(result.data);
        } else {
            res.status(500).json({ error: result.error });
        }
    }

    /**
     * PATCH /admin/live-classes/:id
     * Update live class details
     */
    static async update(req: Request, res: Response) {
        const paramValidation = liveClassIdParamSchema.safeParse(req.params);
        if (!paramValidation.success) {
            res.status(400).json({ error: "Invalid live class ID" });
            return;
        }

        const validation = updateLiveClassSchema.safeParse(req.body);
        if (!validation.success) {
            logger.warn("LiveClassAdminIntent.update: Validation failed", {
                errors: validation.error.issues,
            });
            res.status(400).json({ error: validation.error.issues[0].message });
            return;
        }

        const { id } = paramValidation.data;
        logger.info("LiveClassAdminIntent.update: Updating live class", { id });

        const result = await LiveClassReducer.updateLiveClass(id, validation.data);

        if (result.success) {
            res.status(200).json(result.data);
        } else {
            res.status(400).json({ error: result.error });
        }
    }

    /**
     * POST /admin/live-classes/:id/live
     * Mark live class as currently live
     */
    static async markAsLive(req: Request, res: Response) {
        const paramValidation = liveClassIdParamSchema.safeParse(req.params);
        if (!paramValidation.success) {
            res.status(400).json({ error: "Invalid live class ID" });
            return;
        }

        const { id } = paramValidation.data;
        logger.info("LiveClassAdminIntent.markAsLive: Marking class as live", { id });

        const result = await LiveClassReducer.markAsLive(id);

        if (result.success) {
            res.status(200).json(result.data);
        } else {
            res.status(400).json({ error: result.error });
        }
    }

    /**
     * PATCH /admin/live-classes/:id/complete
     * Mark live class as completed
     */
    static async markAsCompleted(req: Request, res: Response) {
        const paramValidation = liveClassIdParamSchema.safeParse(req.params);
        if (!paramValidation.success) {
            res.status(400).json({ error: "Invalid live class ID" });
            return;
        }

        const { id } = paramValidation.data;
        logger.info("LiveClassAdminIntent.markAsCompleted: Marking class as completed", { id });

        const result = await LiveClassReducer.markAsCompleted(id);

        if (result.success) {
            res.status(200).json(result.data);
        } else {
            res.status(400).json({ error: result.error });
        }
    }

    /**
     * POST /admin/live-classes/:id/recording
     * Upload recording URL for completed class (Creates a Lecture)
     */
    static async uploadRecording(req: Request, res: Response) {
        const paramValidation = liveClassIdParamSchema.safeParse(req.params);
        if (!paramValidation.success) {
            res.status(400).json({ error: "Invalid live class ID" });
            return;
        }

        const validation = uploadRecordingSchema.safeParse(req.body);
        if (!validation.success) {
            logger.warn("LiveClassAdminIntent.uploadRecording: Validation failed", {
                errors: validation.error.issues,
            });
            res.status(400).json({ error: validation.error.issues[0].message });
            return;
        }

        const { id } = paramValidation.data;
        const data = validation.data;
        logger.info("LiveClassAdminIntent.uploadRecording: Registering recording as lecture", { id });

        const result = await LiveClassReducer.registerRecordingAsLecture(id, data);

        if (result.success) {
            res.status(200).json(result.data);
        } else {
            res.status(400).json({ error: result.error });
        }
    }

    /**
     * POST /admin/live-classes/:id/notify
     * Manually trigger notification for a live class
     */
    static async triggerNotification(req: Request, res: Response) {
        const paramValidation = liveClassIdParamSchema.safeParse(req.params);
        if (!paramValidation.success) {
            res.status(400).json({ error: "Invalid live class ID" });
            return;
        }

        const { id } = paramValidation.data;
        logger.info("LiveClassAdminIntent.triggerNotification: Triggering notification", { id });

        const result = await LiveClassReducer.triggerNotification(id);

        if (result.success) {
            res.status(200).json(result.data);
        } else {
            res.status(400).json({ error: result.error });
        }
    }

    /**
     * DELETE /admin/live-classes/:id
     * Delete a live class
     */
    static async delete(req: Request, res: Response) {
        const paramValidation = liveClassIdParamSchema.safeParse(req.params);
        if (!paramValidation.success) {
            res.status(400).json({ error: "Invalid live class ID" });
            return;
        }

        const { id } = paramValidation.data;
        logger.info("LiveClassAdminIntent.delete: Deleting live class", { id });

        const result = await LiveClassReducer.delete(id);

        if (result.success) {
            res.status(200).json(result.data);
        } else {
            res.status(400).json({ error: result.error });
        }
    }
}
