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
  getOrdersQuerySchema,
  createCouponSchema,
  updateCouponSchema,
  couponIdParamSchema,
  validateCouponSchema,
  createBulkTierSchema,
  updateBulkTierSchema,
  bulkTierIdParamSchema,
  adjustStockSchema,
  stockHistoryQuerySchema,
  updateStockSettingsSchema,
} from './remidies.validation';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
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

const bucketName = process.env.AWS_BUCKET_NAME!;

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

const signImages = async (images: string[] | null | undefined): Promise<string[]> => {
    if (!images || !Array.isArray(images)) return [];
    return Promise.all(images.map(img => signS3Url(img) as Promise<string>));
};

type FormattedCart = NonNullable<Awaited<ReturnType<typeof intent.getCart>>>;

const signCartProductImages = async (cart: FormattedCart | null): Promise<FormattedCart | null> => {
    if (!cart) return cart;
    const items = await Promise.all(
        cart.items.map(async (item) => ({
            ...item,
            product: {
                ...item.product,
                images: await signImages(item.product.images as string[]),
            },
        }))
    );
    return { ...cart, items };
};

const deleteS3Object = async (s3Url: string): Promise<void> => {
    const loc = parseS3Location(s3Url);
    if (!loc) return;
    try {
        await s3Client.send(new DeleteObjectCommand({
            Bucket: loc.bucket,
            Key: loc.key,
        }));
    } catch (error) {
        logger.error('Failed to delete S3 object', { s3Url, error });
    }
};

const handleImageUpload = async (req: any, folder: string) => {
    if (!req.file) return null;

    const inputPath = req.file.path;
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

const handleMultipleImageUpload = async (req: any, folder: string): Promise<string[]> => {
    const files = req.files;
    if (!files || !Array.isArray(files) || files.length === 0) return [];

    const uploads = files.slice(0, 10).map(async (file: Express.Multer.File) => {
        const inputPath = file.path;
        const s3Key = `remidies/${folder}/${Date.now()}-${file.originalname}`;
        try {
            const fileBuffer = fs.readFileSync(inputPath);
            await s3Client.send(new PutObjectCommand({
                Bucket: bucketName,
                Key: s3Key,
                Body: fileBuffer,
                ContentType: file.mimetype || 'image/jpeg'
            }));
            return `s3://${bucketName}/${s3Key}`;
        } catch (error) {
            logger.error('S3 upload failed for remedy image', { error, file: file.originalname });
            throw error;
        } finally {
            await MediaService.cleanup(inputPath);
        }
    });

    return Promise.all(uploads);
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
    const newImages = await handleMultipleImageUpload(req, 'products');
    data.images = [...(data.images || []), ...newImages];

    const product = await intent.createProduct(data);
    product.images = await signImages(product.images as string[]);
    res.status(201).json({ success: true, data: product });
  } catch (error) { next(error); }
};

export const updateProduct: RequestHandler = async (req: AuthRequest, res, next) => {
  try {
    const { id } = productIdParamSchema.parse(req).params;
    const data = updateProductSchema.parse(req).body;
    const existing = await intent.getProductById(id);

    const newImages = await handleMultipleImageUpload(req, 'products');

    const keepImages = data.imagesToKeep ?? (existing?.images as string[] | undefined) ?? [];
    const removedImages = ((existing?.images as string[] | undefined) ?? [])
      .filter(img => !keepImages.includes(img));

    data.images = [...keepImages, ...newImages];
    delete data.imagesToKeep;

    const product = await intent.updateProduct(id, data);

    await Promise.all(removedImages.map(deleteS3Object));

    product.images = await signImages(product.images as string[]);
    res.status(200).json({ success: true, data: product });
  } catch (error) { next(error); }
};

export const deleteProduct: RequestHandler = async (req: AuthRequest, res, next) => {
  try {
    const { id } = productIdParamSchema.parse(req).params;
    const existing = await intent.getProductById(id);
    const images = (existing?.images as string[] | undefined) ?? [];
    await intent.deleteProduct(id);
    await Promise.all(images.map(deleteS3Object));
    res.status(200).json({ success: true, message: 'Product deleted' });
  } catch (error) { next(error); }
};

export const deleteProductImage: RequestHandler = async (req: AuthRequest, res, next) => {
  try {
    const { id } = productIdParamSchema.parse(req).params;
    const { imageUrl } = req.body as { imageUrl: string };
    if (!imageUrl) {
      res.status(400).json({ success: false, message: 'imageUrl is required' });
      return;
    }

    const existing = await intent.getProductById(id);
    const images = (existing?.images as string[] | undefined) ?? [];

    if (!images.includes(imageUrl)) {
      res.status(404).json({ success: false, message: 'Image not found on product' });
      return;
    }

    const updatedImages = images.filter(img => img !== imageUrl);
    await intent.updateProduct(id, { images: updatedImages });
    await deleteS3Object(imageUrl);

    res.status(200).json({ success: true, message: 'Image deleted', images: await signImages(updatedImages) });
  } catch (error) { next(error); }
};

export const getAllProducts: RequestHandler = async (req, res, next) => {
  try {
    const categoryId = req.query.categoryId as string | undefined;
    const isActive = req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined;
    const products = await intent.getAllProducts({ categoryId, isActive });
    const signed = await Promise.all(products.map(async (p) => ({
      ...p,
      images: await signImages(p.images as string[]),
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
        images: await signImages(p.images as string[]),
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
    const cart = await signCartProductImages(await intent.getCart(userId));
    res.status(200).json({ success: true, data: cart });
  } catch (error) { next(error); }
};

export const addToCart: RequestHandler = async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const { productId, quantity } = addToCartSchema.parse(req).body;
    const cart = await signCartProductImages(await intent.addToCart(userId, productId, quantity));
    res.status(200).json({ success: true, data: cart });
  } catch (error) { next(error); }
};

export const updateCartItem: RequestHandler = async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const { productId } = updateCartItemSchema.parse(req).params;
    const { quantity } = updateCartItemSchema.parse(req).body;
    const cart = await signCartProductImages(await intent.updateCartItem(userId, productId, quantity));
    res.status(200).json({ success: true, data: cart });
  } catch (error) { next(error); }
};

export const removeCartItem: RequestHandler = async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const { productId } = updateCartItemSchema.parse(req).params;
    const cart = await signCartProductImages(await intent.removeFromCart(userId, productId));
    res.status(200).json({ success: true, data: cart });
  } catch (error) { next(error); }
};

// ─────────────────────────────────────────────
// ORDER
// ─────────────────────────────────────────────

export const createOrder: RequestHandler = async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const { couponCode, ...shippingDetails } = createOrderSchema.parse(req).body;
    const result = await intent.checkoutCart(userId, shippingDetails, couponCode);
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

export const getAllOrders: RequestHandler = async (req, res, next) => {
  try {
    const query = getOrdersQuerySchema.parse(req).query;
    const result = await intent.getAllOrders({
      page: query.page || 1,
      limit: query.limit || 20,
      status: query.status,
    });
    res.status(200).json({ success: true, ...result });
  } catch (error) { next(error); }
};

export const getOrder: RequestHandler = async (req, res, next) => {
  try {
    const { id } = orderIdParamSchema.parse(req).params;
    const order = await intent.getOrder(id);
    res.status(200).json({ success: true, data: order });
  } catch (error) { next(error); }
};

export const updateOrderStatus: RequestHandler = async (req: AuthRequest, res, next) => {
  try {
    const { id } = orderIdParamSchema.parse(req).params;
    const { status } = updateOrderStatusSchema.parse(req).body;
    const order = await intent.updateOrderStatus(id, status, req.user!.userId);
    res.status(200).json({ success: true, data: order });
  } catch (error) { next(error); }
};

// ─────────────────────────────────────────────
// STOCK (ADMIN)
// ─────────────────────────────────────────────

export const getLowStockProducts: RequestHandler = async (_req, res, next) => {
  try {
    const products = await intent.getLowStockProducts();
    res.status(200).json({ success: true, data: products });
  } catch (error) { next(error); }
};

export const adjustProductStock: RequestHandler = async (req: AuthRequest, res, next) => {
  try {
    const { id } = adjustStockSchema.parse(req).params;
    const { quantityChange, reason } = adjustStockSchema.parse(req).body;
    const product = await intent.adjustProductStock(id, quantityChange, reason, req.user!.userId);
    res.status(200).json({ success: true, data: product });
  } catch (error) { next(error); }
};

export const getProductStockHistory: RequestHandler = async (req, res, next) => {
  try {
    const { id } = stockHistoryQuerySchema.parse(req).params;
    const { page = 1, limit = 20 } = stockHistoryQuerySchema.parse(req).query;
    const history = await intent.getProductStockHistory(id, page, limit);
    res.status(200).json({ success: true, ...history });
  } catch (error) { next(error); }
};

export const getStockSettings: RequestHandler = async (_req, res, next) => {
  try {
    const settings = await intent.getStockSettings();
    res.status(200).json({ success: true, data: settings });
  } catch (error) { next(error); }
};

export const updateStockSettings: RequestHandler = async (req, res, next) => {
  try {
    const { globalLowStockThreshold } = updateStockSettingsSchema.parse(req).body;
    const settings = await intent.updateStockSettings(globalLowStockThreshold);
    res.status(200).json({ success: true, data: settings });
  } catch (error) { next(error); }
};

// ─────────────────────────────────────────────
// COUPON (ADMIN)
// ─────────────────────────────────────────────

export const createCoupon: RequestHandler = async (req: AuthRequest, res, next) => {
  try {
    const data = createCouponSchema.parse(req).body;
    const coupon = await intent.createCoupon(data as any);
    res.status(201).json({ success: true, data: coupon });
  } catch (error) { next(error); }
};

export const getCoupons: RequestHandler = async (req, res, next) => {
  try {
    const assignedUserId = req.query.assignedUserId as string | undefined;
    const isActive = req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined;
    const coupons = await intent.getCoupons({ assignedUserId, isActive });
    res.status(200).json({ success: true, data: coupons });
  } catch (error) { next(error); }
};

export const getCoupon: RequestHandler = async (req, res, next) => {
  try {
    const { id } = couponIdParamSchema.parse(req).params;
    const coupon = await intent.getCoupon(id);
    res.status(200).json({ success: true, data: coupon });
  } catch (error) { next(error); }
};

export const updateCoupon: RequestHandler = async (req, res, next) => {
  try {
    const { id } = updateCouponSchema.parse(req).params;
    const data = updateCouponSchema.parse(req).body;
    const coupon = await intent.updateCoupon(id, data);
    res.status(200).json({ success: true, data: coupon });
  } catch (error) { next(error); }
};

export const deactivateCoupon: RequestHandler = async (req, res, next) => {
  try {
    const { id } = couponIdParamSchema.parse(req).params;
    await intent.deactivateCoupon(id);
    res.status(200).json({ success: true, message: 'Coupon deactivated' });
  } catch (error) { next(error); }
};

// ─────────────────────────────────────────────
// COUPON (USER)
// ─────────────────────────────────────────────

export const getMyCoupons: RequestHandler = async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const coupons = await intent.getMyCoupons(userId);
    res.status(200).json({ success: true, data: coupons });
  } catch (error) { next(error); }
};

export const validateCoupon: RequestHandler = async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const { couponCode } = validateCouponSchema.parse(req).body;
    const result = await intent.validateCouponForUser(couponCode, userId);
    res.status(200).json({ success: true, data: result });
  } catch (error) { next(error); }
};

// ─────────────────────────────────────────────
// BULK DISCOUNT TIER (ADMIN)
// ─────────────────────────────────────────────

export const createBulkTier: RequestHandler = async (req, res, next) => {
  try {
    const data = createBulkTierSchema.parse(req).body;
    const tier = await intent.createBulkTier(data as any);
    res.status(201).json({ success: true, data: tier });
  } catch (error) { next(error); }
};

export const getBulkTiers: RequestHandler = async (req, res, next) => {
  try {
    const activeOnly = req.query.activeOnly === 'true';
    const tiers = await intent.getBulkTiers(activeOnly);
    res.status(200).json({ success: true, data: tiers });
  } catch (error) { next(error); }
};

export const updateBulkTier: RequestHandler = async (req, res, next) => {
  try {
    const { id } = updateBulkTierSchema.parse(req).params;
    const data = updateBulkTierSchema.parse(req).body;
    const tier = await intent.updateBulkTier(id, data);
    res.status(200).json({ success: true, data: tier });
  } catch (error) { next(error); }
};

export const deleteBulkTier: RequestHandler = async (req, res, next) => {
  try {
    const { id } = bulkTierIdParamSchema.parse(req).params;
    await intent.deleteBulkTier(id);
    res.status(200).json({ success: true, message: 'Bulk discount tier deleted' });
  } catch (error) { next(error); }
};
