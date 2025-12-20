import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'vastu-courses',
        resource_type: 'video', // Explicitly tell Cloudinary this is a video
        allowed_formats: ['mp4', 'mkv', 'mov', 'avi']
    } as any
});

export const uploadVideo = multer({
    storage: storage,
    limits: {
        fileSize: 1024 * 1024 * 500 // 500MB limit
    }
});
