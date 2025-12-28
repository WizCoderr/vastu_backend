import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';
import logger from '../utils/logger';

export class MediaService {
    /**
     * Compresses an image to WebP format.
     * @param inputPath Path to the input image.
     * @returns Path to the processed WebP image.
     */
    static async compressToWebP(inputPath: string): Promise<string> {
        const outputPath = inputPath.replace(path.extname(inputPath), '.webp');
        logger.info(`Compressing image to WebP: ${inputPath} -> ${outputPath}`);

        try {
            await sharp(inputPath)
                .webp({ quality: 80 })
                .toFile(outputPath);

            return outputPath;
        } catch (error) {
            logger.error('Failed to compress image to WebP', { error, inputPath });
            throw error;
        }
    }

    /**
     * Transcodes a video to H.265 (HEVC) MP4.
     * @param inputPath Path to the input video.
     * @returns Path to the processed H.265 video.
     */
    static async transcodeToH265(inputPath: string): Promise<string> {
        const ext = path.extname(inputPath);
        const outputPath = inputPath.replace(ext, `_hevc.mp4`);
        logger.info(`Transcoding video to H.265: ${inputPath} -> ${outputPath}`);

        return new Promise((resolve, reject) => {
            ffmpeg(inputPath)
                .outputOptions([
                    '-c:v libx265',
                    '-crf 20',
                    '-preset slow',
                    '-c:a aac',
                    '-b:a 128k'
                ])
                .on('start', (commandLine) => {
                    logger.info('Spawned Ffmpeg with command: ' + commandLine);
                })
                .on('progress', (progress) => {
                    if (progress.percent) {
                        logger.info(`Processing: ${progress.percent.toFixed(2)}% done`);
                    }
                })
                .on('error', (err) => {
                    logger.error('Ffmpeg error: ' + err.message);
                    reject(err);
                })
                .on('end', () => {
                    logger.info('Transcoding finished !');
                    resolve(outputPath);
                })
                .save(outputPath);
        });
    }

    /**
     * Utility to delete temporary local files.
     */
    static async cleanup(filePath: string) {
        try {
            if (fs.existsSync(filePath)) {
                await fs.promises.unlink(filePath);
                logger.debug(`Cleaned up temp file: ${filePath}`);
            }
        } catch (error) {
            logger.error(`Failed to cleanup file: ${filePath}`, { error });
        }
    }
}
