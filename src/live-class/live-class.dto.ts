import { z } from 'zod';

// =============================================================================
// ADMIN SCHEMAS - Creating/Updating Live Classes
// =============================================================================

export const createLiveClassSchema = z.object({
    courseId: z.string().min(1, "Course ID is required"),
    batchId: z.string().optional(),
    sectionId: z.string().optional(), // New field
    title: z.string().min(1, "Title is required").max(200),
    description: z.string().max(2000).optional(),
    scheduledAt: z.string().datetime({ message: "Invalid datetime format. Use ISO 8601." }),
    durationMinutes: z.number().int().min(5).max(480).default(60),
    meetingUrl: z.string().url("Invalid meeting URL"),
});

export type CreateLiveClassDto = z.infer<typeof createLiveClassSchema>;

export const updateLiveClassSchema = z.object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).optional().nullable(),
    scheduledAt: z.string().datetime({ message: "Invalid datetime format" }).optional(),
    durationMinutes: z.number().int().min(5).max(480).optional(),
    meetingUrl: z.string().url("Invalid meeting URL").optional(),
    batchId: z.string().optional().nullable(),
    sectionId: z.string().optional().nullable(), // New field
});

export type UpdateLiveClassDto = z.infer<typeof updateLiveClassSchema>;

export const uploadRecordingSchema = z.object({
    recordingUrl: z.string().url("Invalid recording URL"),
});

export type UploadRecordingDto = z.infer<typeof uploadRecordingSchema>;

// =============================================================================
// DEVICE TOKEN SCHEMA - For push notifications
// =============================================================================

export const registerDeviceTokenSchema = z.object({
    token: z.string().min(1, "FCM token is required"),
    platform: z.enum(["android", "ios", "web"]).default("android"),
});

export type RegisterDeviceTokenDto = z.infer<typeof registerDeviceTokenSchema>;

// =============================================================================
// QUERY SCHEMAS
// =============================================================================

export const liveClassIdParamSchema = z.object({
    id: z.string().min(1, "Live class ID is required"),
});

export const courseIdParamSchema = z.object({
    courseId: z.string().min(1, "Course ID is required"),
});
