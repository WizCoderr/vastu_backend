import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import logger from './logger';

const region = process.env.AWS_REGION;
const bucketName = process.env.AWS_BUCKET_NAME || process.env.S3_BUCKET_NAME;
const cloudfrontDomain = process.env.CLOUDFRONT_DOMAIN;

if (!region) throw new Error('AWS_REGION environment variable is required');
if (!bucketName) throw new Error('AWS_BUCKET_NAME environment variable is required');

const s3Client = new S3Client({
  region,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!
  }
});

export const uploadImageToS3 = async (fileBuffer: Buffer, fileName: string, contentType: string): Promise<string> => {
  const params = {
    Bucket: bucketName!,
    Key: `images/${fileName}`,
    Body: fileBuffer,
    ContentType: contentType,
    CacheControl: 'max-age=31536000',
  };

  try {
    const command = new PutObjectCommand(params);
    await s3Client.send(command);

    if (cloudfrontDomain) {
      return `https://${cloudfrontDomain}/images/${fileName}`;
    }
    return `https://${bucketName}.s3.${region}.amazonaws.com/images/${fileName}`;
  } catch (error) {
    logger.error('Error uploading image to S3:', { error });
    throw error;
  }
};

export const getImageUrlFromS3 = async (fileName: string): Promise<string> => {
  const params = {
    Bucket: bucketName!,
    Key: `images/${fileName}`
  };

  try {
    const command = new GetObjectCommand(params);
    await s3Client.send(command);

    if (cloudfrontDomain) {
      return `https://${cloudfrontDomain}/images/${fileName}`;
    }
    return `https://${bucketName}.s3.${region}.amazonaws.com/images/${fileName}`;
  } catch (error) {
    logger.error('Error getting image URL from S3:', { error });
    throw error;
  }
};
