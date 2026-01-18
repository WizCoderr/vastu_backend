import { z } from 'zod';

export const registerSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
    name: z.string().min(2),
    role: z.enum(['student', 'admin']).optional(), // Optional, default to student in logic
    phoneNumber: z.string().min(10),
});

export const updateProfileSchema = z.object({
    name: z.string().optional(),
    phoneNumber: z.string().min(10).optional(),
});

export const loginSchema = z.object({
    email: z.string().email(),
    password: z.string(),
});

export type RegisterDto = z.infer<typeof registerSchema>;
export type UpdateProfileDto = z.infer<typeof updateProfileSchema>;
export type LoginDto = z.infer<typeof loginSchema>;

export interface UserDto {
    id: string;
    email: string;
    name: string | null;
    role: string;
    phoneNumber: string | null;
    enrolledCourseIds: string[];
}

export interface AuthResponse {
    token: string;
    user: UserDto;
}
