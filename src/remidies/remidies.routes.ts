import { Router, RequestHandler } from 'express';
import * as ctrl from './remidies.controller';
import multer from 'multer';
import fs from 'fs';

const tempDir = 'temp_uploads/';
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
}
const upload = multer({ dest: tempDir });

// ─────────────────────────────────────────────
// USER CATALOG ROUTES  (mounted under /api/student/remidies)
// Note: Payment specific routes are now in payment module
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

// Order History (Read-only view)
remidiesUserRouter.get('/orders', ctrl.getUserOrders as RequestHandler);

// ─────────────────────────────────────────────
// ADMIN CATALOG ROUTES  (mounted under /api/admin/remidies)
// ─────────────────────────────────────────────
export const remidiesAdminRouter = Router();

// Category management
remidiesAdminRouter.get('/categories', ctrl.getCategories as RequestHandler);
remidiesAdminRouter.post('/categories', upload.single('image'), ctrl.createCategory as RequestHandler);
remidiesAdminRouter.put('/categories/:id', upload.single('image'), ctrl.updateCategory as RequestHandler);
remidiesAdminRouter.delete('/categories/:id', ctrl.deleteCategory as RequestHandler);

// Product management
remidiesAdminRouter.get('/products', ctrl.getProducts as RequestHandler);
remidiesAdminRouter.post('/products', upload.single('image'), ctrl.createProduct as RequestHandler);
remidiesAdminRouter.put('/products/:id', upload.single('image'), ctrl.updateProduct as RequestHandler);
remidiesAdminRouter.delete('/products/:id', ctrl.deleteProduct as RequestHandler);

// Order management (Status)
remidiesAdminRouter.put('/orders/:id/status', ctrl.updateOrderStatus as RequestHandler);
