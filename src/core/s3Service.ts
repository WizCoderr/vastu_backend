import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import logger from '../utils/logger';

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
        const bucketName = bucket || process.env.AWS_BUCKET_NAME;
        if (!bucketName) throw new Error('AWS_BUCKET_NAME is not configured');

        const command = new GetObjectCommand({
            Bucket: bucketName,
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
        throw error;
    }
};
