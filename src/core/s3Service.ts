import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import logger from '../utils/logger';
import { getCloudFrontSignedUrl, isCloudFrontConfigured } from './cloudFrontService';

const s3Client = new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
    }
});

export const getPresignedUploadUrl = async (key: string, contentType: string, bucket?: string) => {
    try {
        const bucketName = bucket || process.env.AWS_BUCKET_NAME;
        if (!bucketName) throw new Error('AWS_BUCKET_NAME is not configured');

        const command = new PutObjectCommand({
            Bucket: bucketName,
            Key: key,
            ContentType: contentType,
        });

        const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 }); // 1 hour
        return { url, key, bucket: bucketName };
    } catch (error) {
        logger.error('Failed to generate S3 pre-signed upload URL', { error });
        throw error;
    }
};

export const getPresignedReadUrl = async (key: string, bucket?: string) => {
    try {
        const defaultBucket = process.env.AWS_BUCKET_NAME;
        const targetBucket = bucket || defaultBucket;

        // If CloudFront is configured AND we are targeting the default bucket, try CloudFront
        if (isCloudFrontConfigured() && targetBucket === defaultBucket) {
            try {
                return getCloudFrontSignedUrl(key);
            } catch (err) {
                // Fall back to S3 pre-signed URL if CloudFront signing fails
                logger.warn('CloudFront signing failed, falling back to S3 signed URL', { key, error: err });
            }
        }

        if (!targetBucket) throw new Error('AWS_BUCKET_NAME is not configured');

        const command = new GetObjectCommand({
            Bucket: targetBucket,
            Key: key
        });

        const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
        return url;
    } catch (error) {
        logger.error('Failed to generate S3 pre-signed read URL', { error });
        throw error;
    }
};
export const deleteObject = async (key: string, bucket?: string) => {
    try {
        const bucketName = bucket || process.env.AWS_BUCKET_NAME;
        if (!bucketName) throw new Error('AWS_BUCKET_NAME is not configured');
        const command = new DeleteObjectCommand({
            Bucket: bucketName,
            Key: key,
        });
        await s3Client.send(command);
        logger.info('Deleted S3 object', { key, bucket: bucketName });
    } catch (error) {
        logger.error('Failed to delete S3 object', { error, key });
        // throw error; // Allow deletion to proceed even if S3 fails
    }
};

export const getBucketStorageUsage = async (bucket?: string) => {
    try {
        const bucketName = bucket || process.env.AWS_BUCKET_NAME;
        if (!bucketName) throw new Error('AWS_BUCKET_NAME is not configured');

        let totalSize = 0;
        let continuationToken: string | undefined = undefined;

        do {
            const command: ListObjectsV2Command = new ListObjectsV2Command({
                Bucket: bucketName,
                ContinuationToken: continuationToken
            });

            const response = await s3Client.send(command);

            if (response.Contents) {
                for (const object of response.Contents) {
                    totalSize += object.Size || 0;
                }
            }

            continuationToken = response.NextContinuationToken;
        } while (continuationToken);

        return totalSize;
    } catch (error) {
        logger.error('Failed to calculate S3 bucket storage usage', { error });
        throw error;
    }
};

export const listBucketFiles = async (limit: number = 20, cursor?: string, bucket?: string) => {
    try {
        const bucketName = bucket || process.env.AWS_BUCKET_NAME;
        if (!bucketName) throw new Error('AWS_BUCKET_NAME is not configured');

        const command = new ListObjectsV2Command({
            Bucket: bucketName,
            MaxKeys: limit,
            ContinuationToken: cursor
        });

        const response = await s3Client.send(command);

        const files = await Promise.all((response.Contents || []).map(async (obj) => {
            // Generate signed URL for each file so admin can view/download
            const url = obj.Key ? await getPresignedReadUrl(obj.Key, bucketName).catch(() => null) : null;
            return {
                key: obj.Key,
                size: obj.Size,
                lastModified: obj.LastModified,
                url
            };
        }));

        return {
            files,
            nextCursor: response.NextContinuationToken
        };
    } catch (error) {
        logger.error('Failed to list S3 bucket files', { error });
        throw error;
    }
};
