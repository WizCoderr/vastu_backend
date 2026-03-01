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

// ─────────────────────────────────────────────
// CATEGORY
// ─────────────────────────────────────────────

export const createCategory: RequestHandler = async (req: AuthRequest, res, next) => {
  try {
    const data = createCategorySchema.parse(req).body;
    const category = await intent.createCategory(data);
    res.status(201).json({ success: true, data: category });
  } catch (error) { next(error); }
};

export const updateCategory: RequestHandler = async (req: AuthRequest, res, next) => {
  try {
    const { id } = categoryIdParamSchema.parse(req).params;
    const data = updateCategorySchema.parse(req).body;
    const category = await intent.updateCategory(id, data);
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
    res.status(200).json({ success: true, data: categories });
  } catch (error) { next(error); }
};

// ─────────────────────────────────────────────
// PRODUCT
// ─────────────────────────────────────────────

export const createProduct: RequestHandler = async (req: AuthRequest, res, next) => {
  try {
    const data = createProductSchema.parse(req).body;
    const product = await intent.createProduct(data);
    res.status(201).json({ success: true, data: product });
  } catch (error) { next(error); }
};

export const updateProduct: RequestHandler = async (req: AuthRequest, res, next) => {
  try {
    const { id } = productIdParamSchema.parse(req).params;
    const data = updateProductSchema.parse(req).body;
    const product = await intent.updateProduct(id, data);
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

export const getProducts: RequestHandler = async (req, res, next) => {
  try {
    const query = getProductsQuerySchema.parse(req).query;
    const result = await intent.getProducts({
      page: query.page || 1,
      limit: query.limit || 10,
      categoryId: query.categoryId,
      isActive: query.isActive,
    });
    res.status(200).json({ success: true, ...result });
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
