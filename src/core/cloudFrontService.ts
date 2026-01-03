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

        // Ensure the domain doesn't have a trailing slash
        const domain = CLOUDFRONT_DOMAIN.replace(/\/$/, "");

        // Encode the key by splitting path segments
        // strict encoding for each segment (handles ?, #, +, etc.)
        const encodedKey = key.split('/').map(segment => encodeURIComponent(segment)).join('/');

        const url = `https://${domain}/${encodedKey}`;

        // Support either a raw PEM or a base64-encoded PEM in the env var.
        // If the env var contains the PEM directly (starts with '-----BEGIN'),
        // use it as-is; otherwise try base64 decoding.
        let privateKey = CLOUDFRONT_PRIVATE_KEY_BASE64 || "";
        if (!privateKey.startsWith("-----BEGIN")) {
            try {
                privateKey = Buffer.from(privateKey, "base64").toString("utf-8");
            } catch (e) {
                throw new Error("Invalid CloudFront private key format; expected PEM or base64-encoded PEM");
            }
        }
        if (!privateKey.includes("PRIVATE KEY")) {
            throw new Error("Decoded CloudFront private key does not appear to be a valid PEM private key");
        }

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

        const expires = Math.floor(Date.now() / 1000) + 60 * 60; // 1 hour from now (epoch seconds)
        const signedUrl = getSignedUrl({
            url,
            keyPairId: CLOUDFRONT_KEY_PAIR_ID,
            dateLessThan: expires,
            privateKey,
        });

        // Sanity-check the generated signed URL contains CloudFront query params
        if (typeof signedUrl !== 'string' || !signedUrl.includes('Key-Pair-Id') || !signedUrl.includes('Signature')) {
            logger.error('CloudFront signed URL missing expected query params', { domain, keyPairId: CLOUDFRONT_KEY_PAIR_ID });
            throw new Error('Failed to generate a valid CloudFront signed URL');
        }

        return signedUrl;
    } catch (error) {
        logger.error("Failed to generate CloudFront signed URL", { error, key });
        throw error;
    }
};

export const getCloudFrontPublicUrl = (key: string): string => {
    if (!CLOUDFRONT_DOMAIN) {
        throw new Error("CloudFront domain is missing");
    }

    // Ensure the domain doesn't have a trailing slash
    const domain = CLOUDFRONT_DOMAIN.replace(/\/$/, "");

    // Encode the key by splitting path segments
    const encodedKey = key.split('/').map(segment => encodeURIComponent(segment)).join('/');

    return `https://${domain}/${encodedKey}`;
};

export const isCloudFrontConfigured = (): boolean => {
    return !!CLOUDFRONT_DOMAIN;
};
