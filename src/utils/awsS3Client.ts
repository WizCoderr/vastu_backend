import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

// Configure S3 client with your existing AWS credentials and region
const s3Client = new S3Client({
  region: 'your-region', // Replace with your AWS region
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

// Helper function to upload image to S3 and return CDN URL
export const uploadImageToS3 = async (fileBuffer: Buffer, fileName: string, contentType: string): Promise<string> => {
  const params = {
    Bucket: process.env.S3_BUCKET_NAME!, // Replace with your S3 bucket name
    Key: `images/${fileName}`, // Store images in 'images/' folder
    Body: fileBuffer,
    ContentType: contentType,
    ACL: 'public-read', // Make image publicly accessible
    CacheControl: 'max-age=31536000', // Cache for 1 year
    Metadata: {
      'x-amz-meta-processed-by': 'claude-code'
    }
  };

  try {
    const command = new PutObjectCommand(params);
    await s3Client.send(command);

    // Return CDN URL (assuming you're using CloudFront)
    // Replace 'your-cloudfront-domain' with your actual CloudFront domain
    return `https://your-cloudfront-domain.com/images/${fileName}`;
  } catch (error) {
    console.error('Error uploading image to S3:', error);
    throw error;
  }
};

// Helper function to get image URL from S3
export const getImageUrlFromS3 = async (fileName: string): Promise<string> => {
  const params = {
    Bucket: process.env.S3_BUCKET_NAME!,
    Key: `images/${fileName}`
  };

  try {
    const command = new GetObjectCommand(params);
    const response = await s3Client.send(command);

    // Return CDN URL
    return `https://your-cloudfront-domain.com/images/${fileName}`;
  } catch (error) {
    console.error('Error getting image URL from S3:', error);
    throw error;
  }
};