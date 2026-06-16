import { Request, Response } from 'express';
import logger from '../utils/logger';
import { GoogleReviewsReducer } from './google-reviews.reducer';

export class GoogleReviewsIntent {
    static async getReviews(_req: Request, res: Response) {
        logger.info('GoogleReviewsIntent.getReviews: fetching Google reviews');

        const result = await GoogleReviewsReducer.getReviews();

        if (!result.success) {
            return res.status(503).json(result);
        }

        return res.json(result);
    }
}
