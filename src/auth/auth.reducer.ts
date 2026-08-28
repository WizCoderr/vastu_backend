import bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomInt } from 'crypto';
import { prisma } from "../core/prisma";
import { signToken } from '../core/jwt';
import { config } from '../core/config';
import { EmailService } from '../notification/email.service';
import logger from '../utils/logger';
import {
    RegisterDto,
    LoginDto,
    ForgotPasswordDto,
    ResetPasswordDto,
    VerifyResetOtpDto,
    AuthResponse,
    AuthMessageResponse,
    VerifyResetOtpResponse,
    UserDto,
} from './auth.dto';
import { Result } from '../core/result';

export class AuthReducer {
    private static readonly forgotPasswordMessage = 'If the account exists, a reset code has been sent.';
    private static readonly invalidResetTokenMessage = 'Invalid or expired reset token';
    private static readonly invalidOtpMessage = 'Invalid or expired code';

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
        let tokenHash: string | null = null;
        let otp: string | null = null;

        try {
            const user = await prisma.user.findUnique({ where: { email: dto.email } });

            if (!user) {
                return Result.ok({ message: this.forgotPasswordMessage });
            }

            otp = this.generateOtp();
            const otpHash = this.hashResetToken(otp);
            tokenHash = otpHash;
            const now = new Date();
            const expiresMinutes = config.passwordResetOtpTtlMinutes;
            const expiresAt = new Date(now.getTime() + expiresMinutes * 60 * 1000);

            await prisma.$transaction(async (tx) => {
                await tx.passwordResetToken.updateMany({
                    where: { userId: user.id, usedAt: null },
                    data: { usedAt: now },
                });

                await tx.passwordResetToken.create({
                    data: {
                        userId: user.id,
                        tokenHash: otpHash,
                        expiresAt,
                    },
                });
            });

            let delivered = false;

            try {
                delivered = await EmailService.sendPasswordResetOtp({
                    userEmail: user.email,
                    otp,
                    expiresMinutes,
                });
            } catch (emailError) {
                if (config.env === 'development' || config.smtp.logOnly) {
                    logger.warn('AuthReducer.forgotPassword: SMTP failed, logging OTP instead', {
                        email: dto.email,
                        error: emailError,
                    });
                    return Result.ok({
                        message: this.forgotPasswordMessage,
                        devOtp: otp,
                    });
                }

                throw emailError;
            }

            const response: AuthMessageResponse = { message: this.forgotPasswordMessage };
            if (config.env === 'development' || config.smtp.logOnly || !delivered) {
                response.devOtp = otp;
            }

            return Result.ok(response);
        } catch (error) {
            if (tokenHash) {
                await prisma.passwordResetToken.deleteMany({
                    where: { tokenHash, usedAt: null },
                }).catch((cleanupError) => {
                    logger.error('AuthReducer.forgotPassword: Failed to roll back reset OTP', {
                        cleanupError,
                        email: dto.email,
                    });
                });
            }

            logger.error('AuthReducer.forgotPassword: Failed to send reset OTP email', { error, email: dto.email });
            return Result.fail('Unable to send reset email. Please try again later.');
        }
    }

    static async verifyResetOtp(dto: VerifyResetOtpDto): Promise<Result<VerifyResetOtpResponse>> {
        const user = await prisma.user.findUnique({ where: { email: dto.email } });
        if (!user) {
            return Result.fail(this.invalidOtpMessage);
        }

        const otpHash = this.hashResetToken(dto.otp);
        const now = new Date();

        const otpRecord = await prisma.passwordResetToken.findFirst({
            where: {
                userId: user.id,
                tokenHash: otpHash,
                usedAt: null,
                expiresAt: { gt: now },
            },
        });

        if (!otpRecord) {
            return Result.fail(this.invalidOtpMessage);
        }

        const resetToken = randomBytes(32).toString('hex');
        const resetTokenHash = this.hashResetToken(resetToken);
        const expiresAt = new Date(now.getTime() + config.passwordResetOtpTtlMinutes * 60 * 1000);

        await prisma.$transaction(async (tx) => {
            await tx.passwordResetToken.update({
                where: { id: otpRecord.id },
                data: { usedAt: now },
            });

            await tx.passwordResetToken.create({
                data: {
                    userId: user.id,
                    tokenHash: resetTokenHash,
                    expiresAt,
                },
            });
        });

        return Result.ok({
            message: 'Code verified. You can now set a new password.',
            resetToken,
        });
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

    private static generateOtp(): string {
        return randomInt(100000, 1000000).toString();
    }

    private static hashResetToken(token: string): string {
        return createHash('sha256').update(token).digest('hex');
    }
}
