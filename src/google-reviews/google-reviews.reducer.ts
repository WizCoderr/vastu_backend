import { Result } from '../core/result';
import type { GoogleReviewsDto } from './google-reviews.dto';
import { GoogleReviewsService } from './google-reviews.service';

export class GoogleReviewsReducer {
    static async getReviews(): Promise<Result<GoogleReviewsDto>> {
        try {
            if (!GoogleReviewsService.isConfigured()) {
                return Result.fail('Google Places API is not configured on the server');
            }

            const data = await GoogleReviewsService.getReviews();
            return Result.ok(data);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to load Google reviews';
            return Result.fail(message);
        }
    }
}
