import { config } from '../core/config';
import logger from '../utils/logger';
import type { GoogleReviewDto, GoogleReviewsDto } from './google-reviews.dto';

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

type PlacesReview = {
    rating?: number;
    text?: { text?: string };
    relativePublishTimeDescription?: string;
    publishTime?: string;
    authorAttribution?: {
        displayName?: string;
        photoUri?: string;
    };
};

type PlaceDetailsResponse = {
    rating?: number;
    userRatingCount?: number;
    googleMapsUri?: string;
    reviews?: PlacesReview[];
};

type SearchTextResponse = {
    places?: Array<{ id?: string; googleMapsUri?: string }>;
};

let cache: { data: GoogleReviewsDto; expiresAt: number } | null = null;

function slugify(name: string): string {
    return name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

function normalizePlaceId(placeId: string): string {
    return placeId.startsWith('places/') ? placeId.slice('places/'.length) : placeId;
}

function mapReview(review: PlacesReview, index: number): GoogleReviewDto | null {
    const name = review.authorAttribution?.displayName?.trim();
    const text = review.text?.text?.trim();
    const rating = review.rating;

    if (!name || !text || rating == null) {
        return null;
    }

    return {
        id: `${slugify(name)}-${index}`,
        name,
        photo: review.authorAttribution?.photoUri,
        rating,
        text,
        date: review.relativePublishTimeDescription,
    };
}

export class GoogleReviewsService {
    static isConfigured(): boolean {
        return Boolean(config.google.placesApiKey);
    }

    static async getReviews(): Promise<GoogleReviewsDto> {
        if (cache && cache.expiresAt > Date.now()) {
            return cache.data;
        }

        const apiKey = config.google.placesApiKey;
        if (!apiKey) {
            throw new Error('Google Places API is not configured');
        }

        const placeId = await this.resolvePlaceId(apiKey);
        const details = await this.fetchPlaceDetails(placeId, apiKey);

        const reviews = (details.reviews ?? [])
            .map((review, index) => mapReview(review, index))
            .filter((review): review is GoogleReviewDto => review !== null);

        const data: GoogleReviewsDto = {
            aggregateRating: details.rating ?? 0,
            reviewCount: details.userRatingCount ?? reviews.length,
            reviewsUrl: details.googleMapsUri || config.google.reviewsUrl,
            reviews,
            source: 'google',
        };

        cache = { data, expiresAt: Date.now() + CACHE_TTL_MS };
        return data;
    }

    private static async resolvePlaceId(apiKey: string): Promise<string> {
        if (config.google.placeId) {
            return normalizePlaceId(config.google.placeId);
        }

        const query = config.google.placeSearchQuery;
        logger.info('GoogleReviewsService: resolving place id via text search', { query });

        const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': apiKey,
                'X-Goog-FieldMask': 'places.id',
            },
            body: JSON.stringify({ textQuery: query }),
        });

        if (!response.ok) {
            const body = await response.text();
            logger.error('GoogleReviewsService: place search failed', { status: response.status, body });
            throw new Error('Failed to resolve Google Business place');
        }

        const json = (await response.json()) as SearchTextResponse;
        const placeId = json.places?.[0]?.id;

        if (!placeId) {
            throw new Error('No Google Business place found for search query');
        }

        return normalizePlaceId(placeId);
    }

    private static async fetchPlaceDetails(placeId: string, apiKey: string): Promise<PlaceDetailsResponse> {
        const response = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
            headers: {
                'X-Goog-Api-Key': apiKey,
                'X-Goog-FieldMask': 'rating,userRatingCount,reviews,googleMapsUri',
            },
        });

        if (!response.ok) {
            const body = await response.text();
            logger.error('GoogleReviewsService: place details failed', { status: response.status, body });
            throw new Error('Failed to fetch Google reviews');
        }

        return (await response.json()) as PlaceDetailsResponse;
    }
}
