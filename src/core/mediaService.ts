import fs from 'fs';
import logger from '../utils/logger';

export class MediaService {
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
