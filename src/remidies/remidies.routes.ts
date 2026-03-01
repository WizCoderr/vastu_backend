import { Router, RequestHandler } from 'express';
import * as ctrl from './remidies.controller';

// ─────────────────────────────────────────────
// USER ROUTES  (mounted under /api/student/remidies)
// Auth already applied globally by student.routes.ts
// ─────────────────────────────────────────────
export const remidiesUserRouter = Router();

// Categories (read-only for users)
remidiesUserRouter.get('/categories', ctrl.getCategories as RequestHandler);

// Products (read-only for users)
remidiesUserRouter.get('/products', ctrl.getProducts as RequestHandler);

// Cart
remidiesUserRouter.get('/cart', ctrl.getCart as RequestHandler);
remidiesUserRouter.post('/cart', ctrl.addToCart as RequestHandler);
remidiesUserRouter.put('/cart/:productId', ctrl.updateCartItem as RequestHandler);
remidiesUserRouter.delete('/cart/:productId', ctrl.removeCartItem as RequestHandler);

// Orders
remidiesUserRouter.post('/orders', ctrl.createOrder as RequestHandler);
remidiesUserRouter.get('/orders', ctrl.getUserOrders as RequestHandler);

// ─────────────────────────────────────────────
// ADMIN ROUTES  (mounted under /api/admin/remidies)
// Auth + admin check already applied globally by admin.routes.ts
// ─────────────────────────────────────────────
export const remidiesAdminRouter = Router();

// Category management
remidiesAdminRouter.get('/categories', ctrl.getCategories as RequestHandler);
remidiesAdminRouter.post('/categories', ctrl.createCategory as RequestHandler);
remidiesAdminRouter.put('/categories/:id', ctrl.updateCategory as RequestHandler);
remidiesAdminRouter.delete('/categories/:id', ctrl.deleteCategory as RequestHandler);

// Product management
remidiesAdminRouter.get('/products', ctrl.getProducts as RequestHandler);
remidiesAdminRouter.post('/products', ctrl.createProduct as RequestHandler);
remidiesAdminRouter.put('/products/:id', ctrl.updateProduct as RequestHandler);
remidiesAdminRouter.delete('/products/:id', ctrl.deleteProduct as RequestHandler);

// Order management
remidiesAdminRouter.put('/orders/:id/status', ctrl.updateOrderStatus as RequestHandler);
