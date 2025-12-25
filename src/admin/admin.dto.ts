import { z } from 'zod';

export const adminEnrollSchema = z.object({
    userId: z.string().min(1, "User ID is required"),
    courseId: z.string().min(1, "Course ID is required"),
});

export type AdminEnrollDto = z.infer<typeof adminEnrollSchema>;
