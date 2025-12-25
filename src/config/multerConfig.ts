import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

console.log('Cloudinary Config:', {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY ? 'EXISTS' : 'MISSING',
    api_secret: process.env.CLOUDINARY_API_SECRET ? 'EXISTS' : 'MISSING'
});

const videoStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'vastu-courses/videos',
        resource_type: 'video',
        allowed_formats: ['mp4', 'mkv', 'mov', 'avi']
    } as any
});

export const uploadVideo = multer({
    storage: videoStorage,
    limits: {
        fileSize: 1024 * 1024 * 500 // 500MB
    }
});

const imageStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'vastu-courses/thumbnails',
        resource_type: 'image',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp']
    } as any
});

export const uploadImage = multer({
    storage: imageStorage,
    limits: {
        fileSize: 1024 * 1024 * 5 // 5MB
    }
});
