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
    index: number;
    classNumber: number;
    orderIndex: number;
    lectures: LectureDto[];
    liveClasses?: LiveClassDto[];
}

export interface CourseResourceDto {
    id: string;
    title: string;
    url: string;
    type: 'FREE' | 'PAID';
}

export interface LiveClassDto {
    id: string;
    title: string;
    description: string | null;
    scheduledAt: Date;
    durationMinutes: number;
    status: string;
    meetingUrl: string | null;
    sectionId?: string | null;
}

export interface CoursePaymentPlanDto {
    id: string;
    stageName: string;
    description: string | null;
    amount: number;
    dueAfterDays: number;
    orderIndex: number;
    startDate?: Date | null;
    endDate?: Date | null;
}

export interface CourseDto {
    id: string;
    title: string;
    description: string | null;
    price: number;
    instructorId: string;
    thumbnail?: string | null;
    isEnrolled?: boolean;
    serialNumber?: string | null;
    sections?: SectionDto[];
    resources?: CourseResourceDto[];
    // Number of students enrolled in this course (computed)
    studentCount?: number;
    // Scheduled live classes (only for authenticated users)
    liveClasses?: LiveClassDto[];
    paymentPlans?: CoursePaymentPlanDto[];
    activePaymentPlan?: CoursePaymentPlanDto | null;
}

export const progressUpdateSchema = z.object({
    lectureId: z.string(),
    completed: z.boolean(),
});

export type ProgressUpdateDto = z.infer<typeof progressUpdateSchema>;

