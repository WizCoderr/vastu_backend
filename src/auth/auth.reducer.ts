import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { prisma } from "../core/prisma";
import { signToken } from '../core/jwt';
import { config } from '../core/config';
import { EmailService } from '../notification/email.service';
import { RegisterDto, LoginDto, ForgotPasswordDto, ResetPasswordDto, AuthResponse, AuthMessageResponse, UserDto } from './auth.dto';
import { Result } from '../core/result';

export class AuthReducer {
    private static readonly forgotPasswordMessage = 'If the account exists, a reset link has been sent.';
    private static readonly invalidResetTokenMessage = 'Invalid or expired reset token';

    static async register(dto: RegisterDto): Promise<Result<AuthResponse>> {
        const existingUser = await prisma.user.findUnique({ where: { email: dto.email } });

        if (existingUser) {
            return Result.fail('User already exists');
        }

        const hashedPassword = await bcrypt.hash(dto.password, 10);

        const user = await prisma.user.create({
            data: {
                email: dto.email,
                password: hashedPassword,
                name: dto.name,
                role: dto.role || 'student',
                phoneNumber: dto.phoneNumber,
            },
        });

        const token = signToken({ userId: user.id, role: user.role });

        return Result.ok({
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                phoneNumber: user.phoneNumber,
                enrolledCourseIds: user.enrolledCourseIds
            },
        });
    }

    static async login(dto: LoginDto): Promise<Result<AuthResponse>> {
        const user = await prisma.user.findUnique({ where: { email: dto.email } });

        if (!user) {
            return Result.fail('Invalid credentials');
        }

        const isMatch = await bcrypt.compare(dto.password, user.password);

        if (!isMatch) {
            return Result.fail('Invalid credentials');
        }

        const token = signToken({ userId: user.id, role: user.role });

        return Result.ok({
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                phoneNumber: user.phoneNumber,
                enrolledCourseIds: user.enrolledCourseIds
            },
        });
    }

    static async getUser(userId: string): Promise<Result<UserDto>> {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) return Result.fail('User not found');

        return Result.ok({
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            phoneNumber: user.phoneNumber,
            enrolledCourseIds: user.enrolledCourseIds
        });
    }

    static async updateProfile(userId: string, data: { name?: string, phoneNumber?: string }): Promise<Result<UserDto>> {
        try {
            const user = await prisma.user.update({
                where: { id: userId },
                data: {
                    ...data
                }
            });

            return Result.ok({
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                phoneNumber: user.phoneNumber,
                enrolledCourseIds: user.enrolledCourseIds
            });
        } catch (error) {
            return Result.fail('Failed to update profile');
        }
    }

    static async forgotPassword(dto: ForgotPasswordDto): Promise<Result<AuthMessageResponse>> {
        const user = await prisma.user.findUnique({ where: { email: dto.email } });

        if (!user) {
            return Result.ok({ message: this.forgotPasswordMessage });
        }

        const rawToken = randomBytes(32).toString('hex');
        const tokenHash = this.hashResetToken(rawToken);
        const now = new Date();
        const expiresAt = new Date(now.getTime() + config.passwordResetTtlMinutes * 60 * 1000);

        await prisma.$transaction(async (tx) => {
            await tx.passwordResetToken.updateMany({
                where: { userId: user.id, usedAt: null },
                data: { usedAt: now },
            });

            await tx.passwordResetToken.create({
                data: {
                    userId: user.id,
                    tokenHash,
                    expiresAt,
                },
            });
        });

        await EmailService.sendPasswordReset({
            userName: user.name ?? 'there',
            userEmail: user.email,
            resetUrl: this.buildPasswordResetUrl(rawToken),
            expiresAt,
        });

        return Result.ok({ message: this.forgotPasswordMessage });
    }

    static async resetPassword(dto: ResetPasswordDto): Promise<Result<AuthMessageResponse>> {
        const tokenHash = this.hashResetToken(dto.token);
        const passwordHash = await bcrypt.hash(dto.password, 10);
        const now = new Date();

        const result = await prisma.$transaction(async (tx) => {
            const claimedToken = await tx.passwordResetToken.updateMany({
                where: {
                    tokenHash,
                    usedAt: null,
                    expiresAt: { gt: now },
                },
                data: { usedAt: now },
            });

            if (claimedToken.count === 0) {
                return Result.fail(this.invalidResetTokenMessage);
            }

            const resetToken = await tx.passwordResetToken.findUnique({
                where: { tokenHash },
            });

            if (!resetToken) {
                return Result.fail(this.invalidResetTokenMessage);
            }

            await tx.user.update({
                where: { id: resetToken.userId },
                data: { password: passwordHash },
            });

            await tx.passwordResetToken.updateMany({
                where: {
                    userId: resetToken.userId,
                    usedAt: null,
                },
                data: { usedAt: now },
            });

            return Result.ok({ message: 'Password reset successful' });
        });

        return result;
    }

    private static hashResetToken(token: string): string {
        return createHash('sha256').update(token).digest('hex');
    }

    private static buildPasswordResetUrl(token: string): string {
        const resetUrl = new URL(config.passwordResetBaseUrl);
        resetUrl.searchParams.set('token', token);
        return resetUrl.toString();
    }
}
