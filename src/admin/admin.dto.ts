import { z } from 'zod';

export const adminEnrollSchema = z
    .object({
        courseId: z.string().min(1, 'Course ID is required'),
        userId: z.string().min(1, 'User ID is required').optional(),
        userIds: z.array(z.string().min(1)).min(1).optional(),
        markFullPayment: z.boolean().optional().default(false),
    })
    .refine((data) => !!data.userId || (data.userIds && data.userIds.length > 0), {
        message: 'Either userId or userIds is required',
        path: ['userIds'],
    })
    .transform((data) => {
        const ids = [
            ...(data.userIds ?? []),
            ...(data.userId ? [data.userId] : []),
        ];
        return {
            courseId: data.courseId,
            userIds: [...new Set(ids)],
            markFullPayment: data.markFullPayment ?? false,
        };
    });

export type AdminEnrollDto = z.infer<typeof adminEnrollSchema>;
