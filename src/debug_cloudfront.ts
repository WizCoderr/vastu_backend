
import { getCloudFrontSignedUrl, isCloudFrontConfigured } from "./core/cloudFrontService";
import dotenv from 'dotenv';
dotenv.config();

console.log("Checking CloudFront Configuration...");
const configured = isCloudFrontConfigured();
console.log("isCloudFrontConfigured:", configured);

if (configured) {
    console.log("Trying to generate URL...");
    try {
        const url = getCloudFrontSignedUrl("test-key");
        console.log("Generated URL:", url);
    } catch (e) {
        console.error("Error generating URL:", e);
    }
} else {
    console.log("Missing config vars:");
    console.log("DOMAIN:", !!process.env.CLOUDFRONT_DOMAIN);
    console.log("KEY_PAIR_ID:", !!process.env.CLOUDFRONT_KEY_PAIR_ID);
    console.log("PRIVATE_KEY:", !!process.env.CLOUDFRONT_PRIVATE_KEY);
}
