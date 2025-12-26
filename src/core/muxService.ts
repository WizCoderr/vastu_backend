import Mux from '@mux/mux-node';
import jwt from 'jsonwebtoken';
import logger from '../utils/logger';

// Initialize Mux Client
const muxClient = new Mux({
    tokenId: process.env.MUX_TOKEN_ID,
    tokenSecret: process.env.MUX_TOKEN_SECRET
});

export const createMuxAsset = async (inputUrl: string) => {
    try {
        const asset = await muxClient.video.assets.create({
            input: [{ url: inputUrl }],
            playback_policy: ['signed'],
            test: false // Set to true if testing in Mux test environment
        } as any);
        logger.info('Mux Asset created', { assetId: asset.id });
        return asset;
    } catch (error) {
        logger.error('Failed to create Mux asset', { error });
        throw error;
    }
};

export const signMuxPlaybackId = async (playbackId: string): Promise<string> => {
    try {
        if (!process.env.MUX_SIGNING_KEY || !process.env.MUX_PRIVATE_KEY) {
            throw new Error('Missing Mux signing keys');
        }

        // Generate a signed token using jsonwebtoken directly
        // Mux uses RS256 algorithm
        const token = jwt.sign(
            { sub: playbackId, aud: 'v' },
            Buffer.from(process.env.MUX_PRIVATE_KEY, 'base64'),
            {
                algorithm: 'RS256',
                keyid: process.env.MUX_SIGNING_KEY,
                expiresIn: '1h',
                noTimestamp: true // Mux often prefers claims exactly matching requirements
            }
        );

        return `https://stream.mux.com/${playbackId}.m3u8?token=${token}`;
    } catch (error) {
        logger.error('Failed to sign Mux playback ID', { playbackId, error });
        throw error;
    }
};

export const getMuxAsset = async (assetId: string) => {
    try {
        return await muxClient.video.assets.retrieve(assetId);
    } catch (error) {
        logger.error('Failed to retrieve Mux asset', { assetId, error });
        throw error;
    }
}
