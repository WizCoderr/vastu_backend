import { prisma } from "../core/prisma";
import { Result } from '../core/result';
import logger from '../utils/logger';

export class AdminReducer {
    static async getVideoLibraryStats(): Promise<Result<any>> {
        try {
            // Fetch all lectures that have an S3 key (or videoUrl acting as one)
            const lectures = await prisma.lecture.findMany({
                where: {
                    OR: [
                        { s3Key: { not: null } },
                        { videoUrl: { not: "" } }
                    ]
                },
                include: {
                    section: {
                        include: {
                            course: true
                        }
                    },
                    progress: true
                },
                orderBy: {
                    id: 'desc'
                }
            });

            const { getPresignedReadUrl, getDirectS3Url } = await import('../core/s3Service');

            // TRANSFORM DATA
            const videoAssets = await Promise.all(lectures.map(async (l) => {
                const totalStarted = l.progress.length;
                const completedCount = l.progress.filter(p => p.completed).length;
                const completionRate = totalStarted > 0 ? Math.round((completedCount / totalStarted) * 100) : 0;
                const mockDuration = "12:45";

                const thumbKey = l.section.course.s3Key;
                const signedThumb = thumbKey ? await getDirectS3Url(thumbKey, l.section.course.s3Bucket || undefined).catch(() => null) : l.section.course.thumbnail;

                return {
                    id: l.id,
                    title: l.title,
                    courseTitle: l.section.course.title,
                    thumbnail: signedThumb,
                    duration: mockDuration,
                    stats: {
                        completion: completionRate,
                        views: l.progress.length
                    },
                    status: 'ready',
                    url: l.videoUrl
                };
            }));

            // AGGREGATE STATS
            const { getBucketStorageUsage } = await import('../core/s3Service');

            let storageUsed = "0 GB";
            try {
                const totalBytes = await getBucketStorageUsage();
                if (totalBytes > 1024 * 1024 * 1024) {
                    storageUsed = `${(totalBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
                } else if (totalBytes > 1024 * 1024) {
                    storageUsed = `${(totalBytes / (1024 * 1024)).toFixed(2)} MB`;
                } else {
                    storageUsed = `${(totalBytes / 1024).toFixed(2)} KB`;
                }
            } catch (err) {
                logger.warn('Failed to fetch storage usage, defaulting to 0', { err });
            }

            const transcoded = "100%";
            const encodingCount = 0;
            const avgViews = Math.round(videoAssets.reduce((acc, curr) => acc + curr.stats.views, 0) / (videoAssets.length || 1));

            return Result.ok({
                stats: {
                    storageUsed,
                    transcoded,
                    encoding: encodingCount,
                    avgViews
                },
                assets: videoAssets
            });

        } catch (error) {
            logger.error('AdminReducer.getVideoLibraryStats: Failed', { error });
            return Result.fail('Failed to fetch video library stats');
        }
    }

    static async getStorageFiles(limit: number, cursor?: string): Promise<Result<any>> {
        try {
            const { listBucketFiles } = await import('../core/s3Service');
            const result = await listBucketFiles(limit, cursor);
            return Result.ok(result);
        } catch (error) {
            logger.error('AdminReducer.getStorageFiles: Failed', { error });
            return Result.fail('Failed to fetch storage files');
        }
    }

    static async getPaymentStats(): Promise<Result<any>> {
        try {
            const payments = await prisma.payment.findMany({
                include: { user: true, course: true },
                orderBy: { createdAt: 'desc' }
            });

            const enrollmentsCount = await prisma.enrollment.count();

            // Calculate Stats
            const totalVolume = payments
                .filter(p => p.status === 'COMPLETED' || p.status === 'SUCCEEDED')
                .reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);

            const refundCount = payments.filter(p => p.status === 'REFUNDED').length;
            const refundRate = payments.length > 0 ? ((refundCount / payments.length) * 100).toFixed(2) + '%' : '0%';

            // Recent Transactions (Last 20)
            const recentTransactions = payments.slice(0, 20).map(p => ({
                id: p.id,
                transactionId: p.razorpayPaymentId || p.providerId || `TXN-${p.id.slice(-6)}`,
                customer: {
                    name: p.user?.name || 'Unknown',
                    email: p.user?.email || 'No Email'
                },
                course: p.course?.title || 'Unknown Course',
                amount: p.amount,
                status: p.status, // COMPLETED, REFUNDED, etc.
                date: p.createdAt.toISOString().split('T')[0] // YYYY-MM-DD
            }));

            return Result.ok({
                stats: {
                    totalVolume: totalVolume.toFixed(2),
                    activeSubscriptions: enrollmentsCount,
                    refundRate
                },
                transactions: recentTransactions
            });

        } catch (error) {
            logger.error('AdminReducer.getPaymentStats: Failed', { error });
            return Result.fail('Failed to fetch payment stats');
        }
    }

    static async deleteStorageFile(key: string): Promise<Result<any>> {
        try {
            const { deleteObject } = await import('../core/s3Service');
            await deleteObject(key);
            return Result.ok({ message: 'File deleted successfully' });
        } catch (error) {
            logger.error('AdminReducer.deleteStorageFile: Failed', { error, key });
            return Result.fail('Failed to delete file');
        }
    }
}
