export type GoogleReviewDto = {
    id: string;
    name: string;
    photo?: string;
    rating: number;
    text: string;
    date?: string;
};

export type GoogleReviewsDto = {
    aggregateRating: number;
    reviewCount: number;
    reviewsUrl: string;
    reviews: GoogleReviewDto[];
    source: 'google';
};
