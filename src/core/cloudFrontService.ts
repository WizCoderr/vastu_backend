import { getSignedUrl } from "@aws-sdk/cloudfront-signer";
import logger from "../utils/logger";

const CLOUDFRONT_DOMAIN = process.env.CLOUDFRONT_DOMAIN;
const CLOUDFRONT_KEY_PAIR_ID = process.env.CLOUDFRONT_KEY_PAIR_ID;
const CLOUDFRONT_PRIVATE_KEY_BASE64 = process.env.CLOUDFRONT_PRIVATE_KEY;

export const getCloudFrontSignedUrl = (key: string): string => {
    try {
        if (!CLOUDFRONT_DOMAIN || !CLOUDFRONT_KEY_PAIR_ID || !CLOUDFRONT_PRIVATE_KEY_BASE64) {
             throw new Error("CloudFront credentials are missing");
        }

        const url = `https://${CLOUDFRONT_DOMAIN}/${key}`;

        // Decode the base64 private key
        const privateKey = Buffer.from(CLOUDFRONT_PRIVATE_KEY_BASE64, 'base64').toString('utf-8');

        // The dateLess option creates a URL that doesn't expire (or uses default),
        // but usually we want an expiration.
        // S3 presigned URLs were 1 hour (3600s). Let's match that.
        // CloudFront signer uses dateLessThan string (e.g. "2024-01-01") or epoch time?
        // Checking docs (mental model): getSignedUrl({ url, keyPairId, privateKey, dateLessThan })

        const dateLessThan = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(); // 24 hours expiry for better UX, or stick to 1h?
        // The S3 service used 1 hour. Let's stick to 1 hour to match behavior, or maybe slightly longer.
        // Let's do 1 day (24 hours) to reduce broken links if user keeps page open.

        // Actually, let's verify the library signature.
        // import { getSignedUrl } from "@aws-sdk/cloudfront-signer";
        // getSignedUrl({ url, keyPairId, dateLessThan, privateKey })

        const signedUrl = getSignedUrl({
            url,
            keyPairId: CLOUDFRONT_KEY_PAIR_ID,
            dateLessThan: new Date(Date.now() + 1000 * 60 * 60 * 1).toISOString(), // 1 hour
            privateKey,
        });

        return signedUrl;
    } catch (error) {
        logger.error("Failed to generate CloudFront signed URL", { error, key });
        throw error;
    }
};

export const isCloudFrontConfigured = (): boolean => {
    return !!(CLOUDFRONT_DOMAIN && CLOUDFRONT_KEY_PAIR_ID && CLOUDFRONT_PRIVATE_KEY_BASE64);
};
