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
  productSlugParamSchema,
  getProductsQuerySchema,
  addToCartSchema,
  updateCartItemSchema,
  removeCartItemSchema,
  createOrderSchema,
  updateOrderStatusSchema,
  orderIdParamSchema,
  getOrdersQuerySchema,
  createCouponSchema,
  updateCouponSchema,
  couponIdParamSchema,
  validateCouponSchema,
  sendCouponSchema,
  shareCouponSchema,
  grantIdParamSchema,
  createBulkTierSchema,
  updateBulkTierSchema,
  bulkTierIdParamSchema,
  adjustStockSchema,
  setOpeningCostSchema,
  stockHistoryQuerySchema,
  deleteStockMovementsSchema,
  updateStockSettingsSchema,
  quickSaleSchema,
  updateCashSaleSchema,
  deleteCashSaleSchema,
  dashboardStatsSchema,
  inventorySummarySchema,
} from './remidies.validation';
import {
    uploadImage,
    deleteAsset,
    extractPublicId,
    resolveMediaUrl,
} from '../core/cloudinaryService';
import { MediaService } from '../core/mediaService';
import fs from 'fs';
import logger from '../utils/logger';

const resolveImageUrl = async (imageUrl: string | null | undefined): Promise<string | null | undefined> => {
    if (!imageUrl) return imageUrl;
    return resolveMediaUrl(imageUrl);
};

const signImages = async (images: string[] | null | undefined): Promise<string[]> => {
    if (!images || !Array.isArray(images)) return [];
    return Promise.all(images.map(img => resolveImageUrl(img) as Promise<string>));
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

const deleteCloudinaryImage = async (imageUrl: string): Promise<void> => {
    const extracted = extractPublicId(imageUrl);
    if (!extracted) return;
    try {
        await deleteAsset(extracted.publicId, extracted.resourceType);
    } catch (error) {
        logger.error('Failed to delete Cloudinary image', { imageUrl, error });
    }
};

const handleImageUpload = async (req: any, folder: string) => {
    if (!req.file) return null;

    const inputPath = req.file.path;
    const cloudinaryFolder = `remidies/${folder}`;

    try {
        const fileBuffer = fs.readFileSync(inputPath);
        const result = await uploadImage(
            fileBuffer,
            cloudinaryFolder,
            req.file.originalname,
            req.file.mimetype || 'image/jpeg'
        );
        return result.url;
    } catch (error) {
        logger.error('Cloudinary upload failed for remedy image', { error });
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
        const cloudinaryFolder = `remidies/${folder}`;
        try {
            const fileBuffer = fs.readFileSync(inputPath);
            const result = await uploadImage(
                fileBuffer,
                cloudinaryFolder,
                file.originalname,
                file.mimetype || 'image/jpeg'
            );
            return result.url;
        } catch (error) {
            logger.error('Cloudinary upload failed for remedy image', { error, file: file.originalname });
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
    const uploadedUrl = await handleImageUpload(req, 'categories');
    if (uploadedUrl) data.image = uploadedUrl;

    const category = await intent.createCategory(data);
    if (category.image) category.image = await resolveImageUrl(category.image) || category.image;
    res.status(201).json({ success: true, data: category });
  } catch (error) { next(error); }
};

export const updateCategory: RequestHandler = async (req: AuthRequest, res, next) => {
  try {
    const { id } = categoryIdParamSchema.parse(req).params;
    const data = updateCategorySchema.parse(req).body;
    const uploadedUrl = await handleImageUpload(req, 'categories');
    if (uploadedUrl) data.image = uploadedUrl;

    const category = await intent.updateCategory(id, data);
    if (category.image) category.image = await resolveImageUrl(category.image) || category.image;
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
        image: await resolveImageUrl(c.image) || c.image
    })));
    res.status(200).json({ success: true, data: signedCategories });
  } catch (error) { next(error); }
};

const sanitizePublicProduct = <T extends Record<string, unknown>>(product: T) => {
  const {
    lowStockThreshold,
    lowStockAlertSentAt,
    purchasePrice,
    lastPurchasePrice,
    inventoryValue,
    stock: _stock,
    ...rest
  } = product;
  return rest;
};

const signPublicProduct = async (product: Record<string, unknown>) => ({
  ...sanitizePublicProduct(product),
  images: await signImages(product.images as string[]),
});

export const getPublicCategories: RequestHandler = async (_req, res, next) => {
  try {
    const categories = await intent.getAllCategories();
    const signedCategories = await Promise.all(categories.map(async (c) => ({
      ...c,
      image: await resolveImageUrl(c.image) || c.image,
    })));
    res.status(200).json({ success: true, data: signedCategories });
  } catch (error) { next(error); }
};

export const getPublicAllProducts: RequestHandler = async (req, res, next) => {
  try {
    const categoryId = req.query.categoryId as string | undefined;
    const products = await intent.getAllProducts({ categoryId, isActive: true });
    const signed = await Promise.all(products.map(signPublicProduct));
    res.status(200).json({ success: true, data: signed, total: signed.length });
  } catch (error) { next(error); }
};

export const getPublicProducts: RequestHandler = async (req, res, next) => {
  try {
    const query = getProductsQuerySchema.parse(req).query;
    const result = await intent.getProducts({
      page: query.page || 1,
      limit: query.limit || 10,
      categoryId: query.categoryId,
      isActive: true,
    });
    const signedProducts = await Promise.all(result.data.map(signPublicProduct));
    res.status(200).json({ success: true, data: signedProducts, meta: result.meta });
  } catch (error) { next(error); }
};

export const getPublicProductById: RequestHandler = async (req, res, next) => {
  try {
    const { id } = productIdParamSchema.parse(req).params;
    const product = await intent.getProductById(id);
    if (!product || !product.isActive) {
      res.status(404).json({ success: false, message: 'Product not found' });
      return;
    }
    const signed = await signPublicProduct(product as Record<string, unknown>);
    res.status(200).json({ success: true, data: signed });
  } catch (error) { next(error); }
};

export const getPublicProductBySlug: RequestHandler = async (req, res, next) => {
  try {
    const { slug } = productSlugParamSchema.parse(req).params;
    const product = await intent.getProductBySlug(slug);
    if (!product) {
      res.status(404).json({ success: false, message: 'Product not found' });
      return;
    }
    const signed = await signPublicProduct(product as Record<string, unknown>);
    res.status(200).json({ success: true, data: signed });
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
    const hasImageUpdate =
      newImages.length > 0 ||
      data.imagesToKeep !== undefined ||
      data.images !== undefined;

    let removedImages: string[] = [];
    if (hasImageUpdate) {
      const keepImages = data.imagesToKeep ?? (existing?.images as string[] | undefined) ?? [];
      removedImages = ((existing?.images as string[] | undefined) ?? [])
        .filter(img => !keepImages.includes(img));
      data.images = [...keepImages, ...newImages];
    } else {
      delete data.images;
    }
    delete data.imagesToKeep;

    const product = await intent.updateProduct(id, data);

    if (removedImages.length > 0) {
      await Promise.all(removedImages.map(deleteCloudinaryImage));
    }

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
    await Promise.all(images.map(deleteCloudinaryImage));
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
    await deleteCloudinaryImage(imageUrl);

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
    const { productId } = removeCartItemSchema.parse(req).params;
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
    const { quantityChange, reason, unitCost } = adjustStockSchema.parse(req).body;
    const product = await intent.adjustProductStock(id, quantityChange, reason, req.user!.userId, unitCost);
    res.status(200).json({ success: true, data: product });
  } catch (error) { next(error); }
};

export const setProductOpeningCost: RequestHandler = async (req: AuthRequest, res, next) => {
  try {
    const { id } = setOpeningCostSchema.parse(req).params;
    const { unitCost } = setOpeningCostSchema.parse(req).body;
    const product = await intent.setProductOpeningCost(id, unitCost, req.user!.userId);
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

export const deleteProductStockMovements: RequestHandler = async (req: AuthRequest, res, next) => {
  try {
    const { id } = deleteStockMovementsSchema.parse(req).params;
    const { movementIds } = deleteStockMovementsSchema.parse(req).body;
    const result = await intent.deleteProductStockMovements(id, movementIds, req.user!.userId);
    res.status(200).json({ success: true, data: result });
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

export const sendCoupon: RequestHandler = async (req, res, next) => {
  try {
    const { id } = sendCouponSchema.parse(req).params;
    const { userIds } = sendCouponSchema.parse(req).body;
    const result = await intent.sendCouponToUsers(id, userIds);
    res.status(200).json({ success: true, data: result });
  } catch (error) { next(error); }
};

export const shareCoupon: RequestHandler = async (req, res, next) => {
  try {
    const { id } = shareCouponSchema.parse(req).params;
    const { phoneNumber } = shareCouponSchema.parse(req).body;
    const result = await intent.shareCouponByPhone(id, phoneNumber);
    res.status(200).json({ success: true, data: result });
  } catch (error) { next(error); }
};

export const getCouponGrants: RequestHandler = async (req, res, next) => {
  try {
    const { id } = couponIdParamSchema.parse(req).params;
    const grants = await intent.getCouponGrants(id);
    res.status(200).json({ success: true, data: grants });
  } catch (error) { next(error); }
};

export const revokeCouponGrant: RequestHandler = async (req, res, next) => {
  try {
    const { grantId } = grantIdParamSchema.parse(req).params;
    const result = await intent.revokeCouponGrant(grantId);
    res.status(200).json({ success: true, data: result });
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
    const { couponCode, phoneNumber } = validateCouponSchema.parse(req).body;
    const result = await intent.validateCouponForUser(couponCode, userId, phoneNumber);
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

// ─────────────────────────────────────────────
// QUICK CASH SALE (POS)
// ─────────────────────────────────────────────

export const createQuickSale: RequestHandler = async (req: AuthRequest, res, next) => {
  try {
    const {
      items,
      shippingCost,
      customerName,
      customerPhone,
      customerAddress,
      customerCity,
      customerState,
    } = quickSaleSchema.parse(req).body;
    const order = await intent.createQuickSale({
      items,
      shippingCost,
      adminUserId: req.user!.userId,
      customerName,
      customerPhone,
      customerAddress,
      customerCity,
      customerState,
    });
    res.status(201).json({ success: true, data: order });
  } catch (error) { next(error); }
};

export const updateCashSale: RequestHandler = async (req: AuthRequest, res, next) => {
  try {
    const { id } = updateCashSaleSchema.parse(req).params;
    const {
      items,
      shippingCost,
      customerName,
      customerPhone,
      customerAddress,
      customerCity,
      customerState,
    } = updateCashSaleSchema.parse(req).body;
    const order = await intent.updateCashSale({
      orderId: id,
      items,
      shippingCost,
      adminUserId: req.user!.userId,
      customerName,
      customerPhone,
      customerAddress,
      customerCity,
      customerState,
    });
    res.status(200).json({ success: true, data: order });
  } catch (error) { next(error); }
};

export const deleteCashSale: RequestHandler = async (req: AuthRequest, res, next) => {
  try {
    const { id } = deleteCashSaleSchema.parse(req).params;
    await intent.deleteCashSale(id, req.user!.userId);
    res.status(200).json({ success: true, message: 'Cash bill deleted and stock restored' });
  } catch (error) { next(error); }
};

// ─────────────────────────────────────────────
// DASHBOARD STATS
// ─────────────────────────────────────────────

export const getDashboardStats: RequestHandler = async (req, res, next) => {
  try {
    const { startDate, endDate } = dashboardStatsSchema.parse(req).query;
    const stats = await intent.getDashboardStats({ startDate, endDate });
    res.status(200).json({ success: true, data: stats });
  } catch (error) { next(error); }
};

export const getInventorySummary: RequestHandler = async (req, res, next) => {
  try {
    const { startDate, endDate } = inventorySummarySchema.parse(req).query;
    const data = await intent.getInventorySummary({ startDate, endDate });
    res.status(200).json({ success: true, data });
  } catch (error) { next(error); }
};
