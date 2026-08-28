import { z } from 'zod';

const emailField = z.string().email().transform((value) => value.trim().toLowerCase());

export const registerSchema = z.object({
    email: emailField,
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
    email: emailField,
    password: z.string(),
});

export const forgotPasswordSchema = z.object({
    email: emailField,
});

export const resetPasswordSchema = z.object({
    token: z.string().min(1),
    password: z.string().min(6),
});

export const verifyResetOtpSchema = z.object({
    email: emailField,
    otp: z.string().regex(/^\d{6}$/, 'OTP must be a 6-digit code'),
});

export type RegisterDto = z.infer<typeof registerSchema>;
export type UpdateProfileDto = z.infer<typeof updateProfileSchema>;
export type LoginDto = z.infer<typeof loginSchema>;
export type ForgotPasswordDto = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordDto = z.infer<typeof resetPasswordSchema>;
export type VerifyResetOtpDto = z.infer<typeof verifyResetOtpSchema>;

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

export interface AuthMessageResponse {
    message: string;
    /** Present only when email could not be delivered in dev/log-only mode. */
    devOtp?: string;
}

export interface VerifyResetOtpResponse {
    message: string;
    resetToken: string;
}
