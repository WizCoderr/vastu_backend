
import { getPresignedReadUrl, getDirectS3Url } from "./core/s3Service";
import { config } from "./core/config";
import dotenv from 'dotenv';
dotenv.config();

async function main() {
    console.log("Verifying CDN URL Generation...");
    console.log("CLOUDFRONT_DOMAIN:", process.env.CLOUDFRONT_DOMAIN);

    const testKey = "courses/test-course/thumbnail.jpg";
    const videoKey = "courses/test-course/videos/intro.mp4";

    console.log("\n--- Testing getPresignedReadUrl (Generic/Image) ---");
    const url1 = await getPresignedReadUrl(testKey);
    console.log("URL:", url1);
    if (url1.includes("cloudfront.net")) {
        console.log("✅ Success: Uses CloudFront");
    } else {
        console.log("❌ Failure: Uses S3 directly (Expected CloudFront)");
    }

    console.log("\n--- Testing getPresignedReadUrl (Video) ---");
    const url2 = await getPresignedReadUrl(videoKey);
    console.log("URL:", url2);
    if (url2.includes("cloudfront.net")) {
        console.log("✅ Success: Uses CloudFront");
    } else {
        console.log("❌ Failure: Uses S3 directly (Expected CloudFront)");
    }

    console.log("\n--- Testing getDirectS3Url ---");
    const url3 = await getDirectS3Url(testKey);
    console.log("URL:", url3);
    if (url3.includes("cloudfront.net")) {
        console.log("✅ Success: Uses CloudFront");
    } else {
        console.log("❌ Failure: Uses S3 directly (Expected CloudFront)");
    }
}

main().catch(console.error);
