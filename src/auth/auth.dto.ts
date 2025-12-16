import { z } from 'zod';

export const registerSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
    name: z.string().min(2),
    role: z.enum(['student', 'admin']).optional(), // Optional, default to student in logic
});

export const loginSchema = z.object({
    email: z.string().email(),
    password: z.string(),
});

export type RegisterDto = z.infer<typeof registerSchema>;
export type LoginDto = z.infer<typeof loginSchema>;

export interface AuthResponse {
    token: string;
    user: {
        id: string;
        email: string;
        name: string | null;
        role: string;
    };
}
