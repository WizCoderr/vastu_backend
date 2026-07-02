import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import os from 'os';
import path from 'path';
import logger from '../utils/logger';
import { compressPdfIfNeeded } from '../utils/pdfCompress';

export const CLOUDINARY_PROVIDER = 'cloudinary';
export const CLOUDFRONT_PROVIDER = 'cloudfront';

export const CLOUDINARY_IMAGE_FOLDER = 'vastu-courses/images';
export const CLOUDINARY_PDF_FOLDER = 'vastu-courses/pdfs';

export const CLOUDINARY_MAX_BYTES = 10 * 1024 * 1024;

export type CloudinaryResourceType = 'image' | 'raw' | 'video';

export interface UploadResult {
    url: string;
    publicId: string;
}

const configureCloudinary = () => {
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
    });
};

configureCloudinary();

const ensureConfigured = () => {
    configureCloudinary();
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
        throw new Error('Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.');
    }
};

const uploadBuffer = (
    buffer: Buffer,
    folder: string,
    filename: string,
    resourceType: CloudinaryResourceType,
    contentType?: string
): Promise<UploadResult> => {
    ensureConfigured();
    const baseName = filename.replace(/\.[^/.]+$/, '');
    const publicId = `${Date.now()}-${baseName}`;
    const options = {
        folder,
        public_id: publicId,
        resource_type: resourceType,
        overwrite: false,
    };

    const handleResult = (error: any, result: any, reject: (err: Error) => void, resolve: (value: UploadResult) => void) => {
        if (error || !result) {
            const message = error?.message || error?.error?.message || 'Cloudinary upload failed';
            logger.error('Cloudinary upload failed', { error, folder, filename, message });
            reject(error ?? new Error(message));
            return;
        }
        resolve({
            url: result.secure_url,
            publicId: result.public_id,
        });
    };

    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            options,
            (error, result) => handleResult(error, result, reject, resolve)
        );
        uploadStream.end(buffer);
    });
};

export const uploadImage = (buffer: Buffer, folder: string, filename: string, contentType?: string): Promise<UploadResult> =>
    uploadBuffer(buffer, folder, filename, 'image', contentType);

export const uploadRaw = async (buffer: Buffer, folder: string, filename: string, contentType?: string): Promise<UploadResult> => {
    ensureConfigured();
    const compressed = await compressPdfIfNeeded(buffer);
    const baseName = filename.replace(/\.[^/.]+$/, '');
    const publicId = `${Date.now()}-${baseName}`;
    const options = {
        folder,
        public_id: publicId,
        resource_type: 'raw' as const,
        overwrite: false,
    };

    if (compressed.byteLength > CLOUDINARY_MAX_BYTES) {
        const tmpPath = path.join(os.tmpdir(), `cloudinary-raw-${Date.now()}-${baseName}.pdf`);
        try {
            fs.writeFileSync(tmpPath, compressed);
            const result = await new Promise<any>((resolve, reject) => {
                cloudinary.uploader.upload_large(tmpPath, options, (error, res) => {
                    if (error) reject(error);
                    else resolve(res);
                });
            });
            return { url: result.secure_url, publicId: result.public_id };
        } finally {
            if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
        }
    }

    const mime = contentType || 'application/pdf';
    const result = await cloudinary.uploader.upload(
        `data:${mime};base64,${compressed.toString('base64')}`,
        options
    );
    return { url: result.secure_url, publicId: result.public_id };
};

export const deleteAsset = async (publicId: string, resourceType: CloudinaryResourceType = 'image'): Promise<void> => {
    ensureConfigured();
    try {
        await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
        logger.info('Deleted Cloudinary asset', { publicId, resourceType });
    } catch (error) {
        logger.error('Failed to delete Cloudinary asset', { publicId, resourceType, error });
    }
};

export const isCloudinaryProvider = (provider?: string | null): boolean =>
    provider === CLOUDINARY_PROVIDER;

export const isCloudFrontProvider = (provider?: string | null): boolean =>
    provider === CLOUDFRONT_PROVIDER;

export const buildCloudFrontUrl = (key: string): string | null => {
    const cloudFrontDomain = process.env.CLOUDFRONT_DOMAIN;
    if (!cloudFrontDomain || !key || key.startsWith('http')) return null;
    const encodedKey = key.replace(/^\//, '').split('/').map(encodeURIComponent).join('/');
    return `https://${cloudFrontDomain}/${encodedKey}`;
};

export const isCloudinaryUrl = (url?: string | null): boolean =>
    !!url && (url.includes('res.cloudinary.com') || url.includes('cloudinary.com'));

export const extractPublicId = (url: string): { publicId: string; resourceType: CloudinaryResourceType } | null => {
    if (!isCloudinaryUrl(url)) return null;

    try {
        const uploadSegment = '/upload/';
        const idx = url.indexOf(uploadSegment);
        if (idx === -1) return null;

        let path = url.slice(idx + uploadSegment.length);
        // Strip version prefix e.g. v1234567890/
        path = path.replace(/^v\d+\//, '');
        // Strip transformations e.g. w_300,h_200/
        const parts = path.split('/');
        const resourceIdx = parts.findIndex((p) => !p.includes(',') && !p.includes('_') || p.includes('.'));
        const publicIdParts = resourceIdx >= 0 ? parts.slice(resourceIdx) : parts;
        const publicId = publicIdParts.join('/').replace(/\.[^/.]+$/, '');

        const resourceType: CloudinaryResourceType = url.includes('/raw/') ? 'raw' : url.includes('/video/') ? 'video' : 'image';
        return { publicId, resourceType };
    } catch {
        return null;
    }
};

export const buildCloudinaryUrl = (publicId: string, resourceType: CloudinaryResourceType = 'image'): string =>
    cloudinary.url(publicId, { secure: true, resource_type: resourceType });

export const resolveMediaUrl = async (
    stored?: string | null,
    publicId?: string | null,
    provider?: string | null,
    resourceType: CloudinaryResourceType = 'image'
): Promise<string | null> => {
    if (stored && isCloudinaryUrl(stored)) return stored;
    if (stored && stored.startsWith('http') && !stored.includes('amazonaws.com') && !stored.startsWith('s3://')) {
        return stored;
    }
    if (publicId && isCloudinaryProvider(provider)) {
        return buildCloudinaryUrl(publicId, resourceType);
    }
    if (publicId && !provider) {
        return buildCloudinaryUrl(publicId, resourceType);
    }
    // Legacy S3 HTTPS URLs — return as-is until migration script updates them
    if (stored && (stored.startsWith('http') || stored.startsWith('s3://'))) {
        return stored.startsWith('s3://') ? null : stored;
    }
    return stored ?? null;
};

export const resolveResourceUrl = async (s3Key: string, s3Bucket?: string | null): Promise<string> => {
    if (isCloudinaryProvider(s3Bucket)) {
        const url = await resolveMediaUrl(null, s3Key, s3Bucket, 'raw');
        return url ?? '';
    }

    if (isCloudFrontProvider(s3Bucket) || s3Bucket === process.env.AWS_BUCKET_NAME) {
        return buildCloudFrontUrl(s3Key) ?? '';
    }

    const url = await resolveMediaUrl(null, s3Key, s3Bucket, 'image');
    return url ?? '';
};

export const resolveThumbnailUrl = async (
    thumbnail?: string | null,
    publicId?: string | null,
    provider?: string | null
): Promise<string | null> => resolveMediaUrl(thumbnail, publicId, provider, 'image');

export interface SignedUploadParams {
    url: string;
    method: 'POST';
    headers: Record<string, string>;
    s3Key: string;
    s3Bucket: string;
    fields: Record<string, string>;
}

export const getSignedUploadParams = (
    fileName: string,
    fileType: 'image' | 'video' | 'pdf',
    _contentType: string
): SignedUploadParams => {
    ensureConfigured();
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME!;
    const apiKey = process.env.CLOUDINARY_API_KEY!;
    const apiSecret = process.env.CLOUDINARY_API_SECRET!;

    if (fileType === 'video') {
        throw new Error('Video upload is no longer supported. Please provide a video URL instead.');
    }

    const folder = fileType === 'image' ? CLOUDINARY_IMAGE_FOLDER : CLOUDINARY_PDF_FOLDER;
    const resourceType = fileType === 'image' ? 'image' : 'raw';
    const publicId = `${Date.now()}-${fileName.replace(/\.[^/.]+$/, '')}`;
    const timestamp = Math.round(Date.now() / 1000);

    const paramsToSign: Record<string, string | number> = {
        timestamp,
        folder,
        public_id: publicId,
    };

    const signature = cloudinary.utils.api_sign_request(paramsToSign, apiSecret);
    const fullPublicId = `${folder}/${publicId}`;

    return {
        url: `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`,
        method: 'POST',
        headers: {},
        s3Key: fullPublicId,
        s3Bucket: CLOUDINARY_PROVIDER,
        fields: {
            api_key: apiKey,
            timestamp: String(timestamp),
            signature,
            folder,
            public_id: publicId,
        },
    };
};

export type StorageFileKind = 'pdf' | 'image' | 'video' | 'other';

export interface StorageFileEntry {
    key: string;
    size: number;
    lastModified: string;
    url: string;
    resourceType: string;
    fileKind: StorageFileKind;
}

const mapResourceToFile = (resource: any): StorageFileEntry => {
    const resourceType = resource.resource_type as string;
    const publicId = resource.public_id as string;
    let fileKind: StorageFileKind = 'other';
    if (resourceType === 'raw' || publicId.startsWith(`${CLOUDINARY_PDF_FOLDER}/`) || publicId.includes('/pdfs/')) {
        fileKind = 'pdf';
    } else if (resourceType === 'video') {
        fileKind = 'video';
    } else if (resourceType === 'image') {
        fileKind = 'image';
    }

    return {
        key: publicId,
        size: resource.bytes,
        lastModified: resource.created_at,
        url: resource.secure_url,
        resourceType,
        fileKind,
    };
};

export const listResourcesByType = async (
    resourceType: CloudinaryResourceType,
    prefix?: string,
    limit = 20,
    cursor?: string
) => {
    ensureConfigured();
    const response = await cloudinary.api.resources({
        type: 'upload',
        resource_type: resourceType,
        ...(prefix ? { prefix } : {}),
        max_results: limit,
        next_cursor: cursor,
    });

    return {
        files: (response.resources ?? []).map(mapResourceToFile),
        nextCursor: response.next_cursor as string | undefined,
    };
};

export const listAllStorageFiles = async (
    limit = 20,
    cursor?: string,
    fileTypeFilter?: 'pdf' | 'image' | 'all'
): Promise<{ files: StorageFileEntry[]; nextCursor?: string }> => {
    if (fileTypeFilter === 'pdf') {
        return listResourcesByType('raw', CLOUDINARY_PDF_FOLDER, limit, cursor);
    }
    if (fileTypeFilter === 'image') {
        return listResourcesByType('image', CLOUDINARY_IMAGE_FOLDER, limit, cursor);
    }

    const halfLimit = Math.ceil(limit / 2);
    const [images, raws] = await Promise.all([
        listResourcesByType('image', undefined, halfLimit, cursor),
        listResourcesByType('raw', CLOUDINARY_PDF_FOLDER, halfLimit, cursor),
    ]);

    const files = [...images.files, ...raws.files]
        .sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime())
        .slice(0, limit);

    return {
        files,
        nextCursor: images.nextCursor || raws.nextCursor,
    };
};

export const listResources = async (limit = 20, cursor?: string) =>
    listAllStorageFiles(limit, cursor, 'all');

export const getStorageUsage = async (): Promise<number> => {
    ensureConfigured();
    try {
        const usage = await cloudinary.api.usage();
        return usage.storage?.usage ?? usage.bytes ?? 0;
    } catch (error) {
        logger.warn('Failed to fetch Cloudinary storage usage', { error });
        return 0;
    }
};

export const deleteByPublicId = async (publicId: string, resourceType: CloudinaryResourceType = 'image'): Promise<void> => {
    await deleteAsset(publicId, resourceType);
};
