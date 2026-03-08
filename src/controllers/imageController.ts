import { Request, Response } from 'express';
import { uploadImageToS3 } from '../utils/awsS3Client';
import { v4 as uuidv4 } from 'uuid';

// Controller to handle image uploads for categories
export const uploadCategoryImage = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Generate unique filename
    const fileName = `${uuidv4()}-${req.file.originalname}`;

    // Upload image to S3 and get CDN URL
    const cdnUrl = await uploadImageToS3(
      req.file.buffer,
      fileName,
      req.file.mimetype
    );

    // Return CDN URL
    res.json({
      success: true,
      message: 'Category image uploaded successfully',
      cdnUrl
    });
  } catch (error) {
    console.error('Error uploading category image:', error);
    res.status(500).json({ error: 'Failed to upload category image' });
  }
};

// Controller to handle image uploads for products
export const uploadProductImage = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Generate unique filename
    const fileName = `${uuidv4()}-${req.file.originalname}`;

    // Upload image to S3 and get CDN URL
    const cdnUrl = await uploadImageToS3(
      req.file.buffer,
      fileName,
      req.file.mimetype
    );

    // Return CDN URL
    res.json({
      success: true,
      message: 'Product image uploaded successfully',
      cdnUrl
    });
  } catch (error) {
    console.error('Error uploading product image:', error);
    res.status(500).json({ error: 'Failed to upload product image' });
  }
};