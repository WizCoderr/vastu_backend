import { Response, NextFunction, RequestHandler } from 'express';
import { AuthRequest } from '../core/authMiddleware';
import * as intent from './remidies.intent';
import {
  createCategorySchema,
  updateCategorySchema,
  categoryIdParamSchema,
  createProductSchema,
  updateProductSchema,
  productIdParamSchema,
  getProductsQuerySchema,
  addToCartSchema,
  updateCartItemSchema,
  createOrderSchema,
  updateOrderStatusSchema,
  orderIdParamSchema,
} from './remidies.validation';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getDirectS3Url } from '../core/s3Service';
import { MediaService } from '../core/mediaService';
import fs from 'fs';
import path from 'path';
import logger from '../utils/logger';

const s3Client = new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
    }
});

const parseS3Location = (url: string): { bucket: string; key: string } | null => {
    if (url.startsWith('s3://')) {
        const parts = url.slice('s3://'.length).split('/');
        return { bucket: parts[0], key: parts.slice(1).join('/') };
    }
    try {
        const u = new URL(url);
        if (!u.hostname.endsWith('amazonaws.com')) return null;
        const virtualHost = u.hostname.match(/^([^.]+)\.s3[.-]/);
        if (virtualHost) {
            return { bucket: virtualHost[1], key: decodeURIComponent(u.pathname.replace(/^\//, '')) };
        }
        if (u.hostname.startsWith('s3.') || u.hostname === 's3.amazonaws.com') {
            const segments = u.pathname.replace(/^\//, '').split('/');
            return { bucket: segments[0], key: decodeURIComponent(segments.slice(1).join('/')) };
        }
    } catch { /* not a URL */ }
    return null;
};

const signS3Url = async (s3Url: string | null | undefined): Promise<string | null | undefined> => {
    if (!s3Url) return s3Url;
    const loc = parseS3Location(s3Url);
    if (!loc) return s3Url;
    try {
        return await getDirectS3Url(loc.key, loc.bucket);
    } catch (error) {
        logger.error('Failed to sign S3 URL', { s3Url, error });
        return s3Url;
    }
};

const handleImageUpload = async (req: any, folder: string) => {
    if (!req.file) return null;

    const inputPath = req.file.path;
    const bucketName = process.env.AWS_BUCKET_NAME!;
    const s3Key = `remidies/${folder}/${Date.now()}-${req.file.originalname}`;

    try {
        const fileBuffer = fs.readFileSync(inputPath);
        await s3Client.send(new PutObjectCommand({
            Bucket: bucketName,
            Key: s3Key,
            Body: fileBuffer,
            ContentType: req.file.mimetype || 'image/jpeg'
        }));
        return `s3://${bucketName}/${s3Key}`;
    } catch (error) {
        logger.error('S3 upload failed for remedy image', { error });
        throw error;
    } finally {
        await MediaService.cleanup(inputPath);
    }
};

// ─────────────────────────────────────────────
// CATEGORY
// ─────────────────────────────────────────────

export const createCategory: RequestHandler = async (req: AuthRequest, res, next) => {
  try {
    const data = createCategorySchema.parse(req).body;
    const s3Url = await handleImageUpload(req, 'categories');
    if (s3Url) data.image = s3Url;

    const category = await intent.createCategory(data);
    if (category.image) category.image = await signS3Url(category.image) || category.image;
    res.status(201).json({ success: true, data: category });
  } catch (error) { next(error); }
};

export const updateCategory: RequestHandler = async (req: AuthRequest, res, next) => {
  try {
    const { id } = categoryIdParamSchema.parse(req).params;
    const data = updateCategorySchema.parse(req).body;
    const s3Url = await handleImageUpload(req, 'categories');
    if (s3Url) data.image = s3Url;

    const category = await intent.updateCategory(id, data);
    if (category.image) category.image = await signS3Url(category.image) || category.image;
    res.status(200).json({ success: true, data: category });
  } catch (error) { next(error); }
};

export const deleteCategory: RequestHandler = async (req: AuthRequest, res, next) => {
  try {
    const { id } = categoryIdParamSchema.parse(req).params;
    await intent.deleteCategory(id);
    res.status(200).json({ success: true, message: 'Category deleted' });
  } catch (error) { next(error); }
};

export const getCategories: RequestHandler = async (_req, res, next) => {
  try {
    const categories = await intent.getAllCategories();
    const signedCategories = await Promise.all(categories.map(async (c) => ({
        ...c,
        image: await signS3Url(c.image) || c.image
    })));
    res.status(200).json({ success: true, data: signedCategories });
  } catch (error) { next(error); }
};

// ─────────────────────────────────────────────
// PRODUCT
// ─────────────────────────────────────────────

export const createProduct: RequestHandler = async (req: AuthRequest, res, next) => {
  try {
    const data = createProductSchema.parse(req).body;
    const s3Url = await handleImageUpload(req, 'products');
    if (s3Url) data.image = s3Url;

    const product = await intent.createProduct(data);
    if (product.image) product.image = await signS3Url(product.image) || product.image;
    res.status(201).json({ success: true, data: product });
  } catch (error) { next(error); }
};

export const updateProduct: RequestHandler = async (req: AuthRequest, res, next) => {
  try {
    const { id } = productIdParamSchema.parse(req).params;
    const data = updateProductSchema.parse(req).body;
    const s3Url = await handleImageUpload(req, 'products');
    if (s3Url) data.image = s3Url;

    const product = await intent.updateProduct(id, data);
    if (product.image) product.image = await signS3Url(product.image) || product.image;
    res.status(200).json({ success: true, data: product });
  } catch (error) { next(error); }
};

export const deleteProduct: RequestHandler = async (req: AuthRequest, res, next) => {
  try {
    const { id } = productIdParamSchema.parse(req).params;
    await intent.deleteProduct(id);
    res.status(200).json({ success: true, message: 'Product deleted' });
  } catch (error) { next(error); }
};

export const getAllProducts: RequestHandler = async (req, res, next) => {
  try {
    const categoryId = req.query.categoryId as string | undefined;
    const isActive = req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined;
    const products = await intent.getAllProducts({ categoryId, isActive });
    const signed = await Promise.all(products.map(async (p) => ({
      ...p,
      image: await signS3Url(p.image) || p.image,
    })));
    res.status(200).json({ success: true, data: signed, total: signed.length });
  } catch (error) { next(error); }
};

export const getProducts: RequestHandler = async (req, res, next) => {
  try {
    const query = getProductsQuerySchema.parse(req).query;
    const result = await intent.getProducts({
      page: query.page || 1,
      limit: query.limit || 10,
      categoryId: query.categoryId,
      isActive: query.isActive,
    });
    const signedProducts = await Promise.all(result.data.map(async (p) => ({
        ...p,
        image: await signS3Url(p.image) || p.image
    })));
    res.status(200).json({ success: true, data: signedProducts, meta: result.meta });
  } catch (error) { next(error); }
};

// ─────────────────────────────────────────────
// CART
// ─────────────────────────────────────────────

export const getCart: RequestHandler = async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const cart = await intent.getCart(userId);
    res.status(200).json({ success: true, data: cart });
  } catch (error) { next(error); }
};

export const addToCart: RequestHandler = async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const { productId, quantity } = addToCartSchema.parse(req).body;
    const cartItem = await intent.addToCart(userId, productId, quantity);
    res.status(200).json({ success: true, data: cartItem });
  } catch (error) { next(error); }
};

export const updateCartItem: RequestHandler = async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const { productId } = updateCartItemSchema.parse(req).params;
    const { quantity } = updateCartItemSchema.parse(req).body;
    const cartItem = await intent.updateCartItem(userId, productId, quantity);
    res.status(200).json({ success: true, data: cartItem });
  } catch (error) { next(error); }
};

export const removeCartItem: RequestHandler = async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const { productId } = updateCartItemSchema.parse(req).params;
    await intent.removeFromCart(userId, productId);
    res.status(200).json({ success: true, message: 'Item removed from cart' });
  } catch (error) { next(error); }
};

// ─────────────────────────────────────────────
// ORDER
// ─────────────────────────────────────────────

export const createOrder: RequestHandler = async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const shippingDetails = createOrderSchema.parse(req).body;
    const result = await intent.checkoutCart(userId, shippingDetails);
    res.status(201).json({ success: true, data: result });
  } catch (error) { next(error); }
};

export const getUserOrders: RequestHandler = async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const orders = await intent.getUserOrders(userId);
    res.status(200).json({ success: true, data: orders });
  } catch (error) { next(error); }
};

export const updateOrderStatus: RequestHandler = async (req: AuthRequest, res, next) => {
  try {
    const { id } = orderIdParamSchema.parse(req).params;
    const { status } = updateOrderStatusSchema.parse(req).body;
    const order = await intent.updateOrderStatus(id, status);
    res.status(200).json({ success: true, data: order });
  } catch (error) { next(error); }
};
