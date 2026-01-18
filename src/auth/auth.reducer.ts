import bcrypt from 'bcryptjs';
import { prisma } from "../core/prisma";
import { signToken } from '../core/jwt';
import { RegisterDto, LoginDto, AuthResponse, UserDto } from './auth.dto';
import { Result } from '../core/result';

export class AuthReducer {
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
}

