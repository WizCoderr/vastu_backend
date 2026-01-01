import { z } from 'zod';

export interface LectureDto {
    id: string;
    title: string;
    videoUrl: string;
    videoProvider?: string | null;
    freePreview?: boolean;
}

export interface SectionDto {
    id: string;
    title: string;
    lectures: LectureDto[];
}

export interface CourseResourceDto {
    id: string;
    title: string;
    url: string;
    type: 'FREE' | 'PAID';
}

export interface CourseDto {
    id: string;
    title: string;
    description: string | null;
    price: number;
    instructorId: string;
    thumbnail?: string | null;
    isEnrolled?: boolean;
    sections?: SectionDto[];
    resources?: CourseResourceDto[];
    // Number of students enrolled in this course (computed)
    studentCount?: number;
}

export const progressUpdateSchema = z.object({
    lectureId: z.string().uuid(),
    completed: z.boolean(),
});

export type ProgressUpdateDto = z.infer<typeof progressUpdateSchema>;
