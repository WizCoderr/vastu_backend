import { S3Client, ListBucketsCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
import path from 'path';

// Load .env explicitly
dotenv.config({ path: path.join(__dirname, '../.env') });

async function testS3() {
    console.log('🔍 Testing AWS S3 Connection...');

    const region = process.env.AWS_REGION;
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    const bucketName = process.env.AWS_BUCKET_NAME;

    console.log('Configuration:');
    console.log(`- Region: ${region}`);
    console.log(`- Bucket: ${bucketName}`);
    console.log(`- Key ID: ${accessKeyId ? '******' + accessKeyId.slice(-4) : 'MISSING'}`);
    console.log(`- Secret: ${secretAccessKey ? '******' : 'MISSING'}`);

    if (!region || !accessKeyId || !secretAccessKey || !bucketName) {
        console.error('❌ Missing required environment variables. Please check your .env file.');
        process.exit(1);
    }

    const client = new S3Client({
        region,
        credentials: {
            accessKeyId,
            secretAccessKey
        }
    });

    try {
        // 1. Test Connectivity (List Buckets)
        console.log('\n📡 Attempting to list buckets (Verifying Credentials)...');
        const listRes = await client.send(new ListBucketsCommand({}));
        console.log('✅ Credentials Valid. Buckets found:', listRes.Buckets?.length || 0);

        // 2. Verify Specific Bucket Access
        console.log(`\n📦 Verifying access to bucket "${bucketName}"...`);
        try {
            await client.send(new HeadBucketCommand({ Bucket: bucketName }));
            console.log(`✅ Bucket "${bucketName}" exists and is accessible.`);
        } catch (bucketParamError: any) {
            if (bucketParamError.name === 'NotFound') {
                console.error(`❌ Bucket "${bucketName}" does not exist.`);
            } else if (bucketParamError.name === 'Forbidden') {
                console.error(`❌ Access Forbidden to bucket "${bucketName}". Check policy permissions.`);
            } else {
                console.error(`❌ Error checking bucket:`, bucketParamError.message);
            }
        }

        console.log('\n🎉 S3 Connection Test Completed.');

    } catch (error: any) {
        console.error('\n❌ Connection Failed:', error.message);
        if (error.name === 'InvalidSignatureException' || error.name === 'UnrecognizedClientException') {
            console.error('👉 Check your AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.');
        }
    }
}

testS3();
