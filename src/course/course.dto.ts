import { z } from 'zod';

export interface CourseDto {
    id: string;
    title: string;
    description: string | null;
    price: number;
    instructorId: string;
    isEnrolled?: boolean;
}

export const progressUpdateSchema = z.object({
    lectureId: z.string().uuid(),
    completed: z.boolean(),
});

export type ProgressUpdateDto = z.infer<typeof progressUpdateSchema>;
