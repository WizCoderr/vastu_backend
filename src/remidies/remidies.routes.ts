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
// PUBLIC CATALOG ROUTES  (no auth — shop browse)
// Mounted under /api/student/remidies, /api/remidies/user, /api/public
// ─────────────────────────────────────────────
export const remidiesCatalogRouter = Router();

remidiesCatalogRouter.get('/categories', ctrl.getPublicCategories as RequestHandler);
remidiesCatalogRouter.get('/products/all', ctrl.getPublicAllProducts as RequestHandler);
remidiesCatalogRouter.get('/products/slug/:slug', ctrl.getPublicProductBySlug as RequestHandler);
remidiesCatalogRouter.get('/products', ctrl.getPublicProducts as RequestHandler);
remidiesCatalogRouter.get('/products/:id', ctrl.getPublicProductById as RequestHandler);

// ─────────────────────────────────────────────
// AUTHENTICATED USER ROUTES  (cart, checkout, orders)
// Note: Payment specific routes are now in payment module
// ─────────────────────────────────────────────
export const remidiesAuthUserRouter = Router();

remidiesAuthUserRouter.get('/cart', ctrl.getCart as RequestHandler);
remidiesAuthUserRouter.post('/cart', ctrl.addToCart as RequestHandler);
remidiesAuthUserRouter.put('/cart/:productId', ctrl.updateCartItem as RequestHandler);
remidiesAuthUserRouter.delete('/cart/:productId', ctrl.removeCartItem as RequestHandler);
remidiesAuthUserRouter.post('/checkout', ctrl.createOrder as RequestHandler);
remidiesAuthUserRouter.get('/orders', ctrl.getUserOrders as RequestHandler);
remidiesAuthUserRouter.get('/coupons', ctrl.getMyCoupons as RequestHandler);
remidiesAuthUserRouter.post('/coupons/validate', ctrl.validateCoupon as RequestHandler);

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
remidiesAdminRouter.get('/products/all', ctrl.getAllProducts as RequestHandler);
remidiesAdminRouter.get('/products', ctrl.getProducts as RequestHandler);
remidiesAdminRouter.post('/products', upload.array('images', 10), ctrl.createProduct as RequestHandler);
remidiesAdminRouter.put('/products/:id', upload.array('images', 10), ctrl.updateProduct as RequestHandler);
remidiesAdminRouter.delete('/products/:id/images', ctrl.deleteProductImage as RequestHandler);
remidiesAdminRouter.delete('/products/:id', ctrl.deleteProduct as RequestHandler);

// Order management
remidiesAdminRouter.get('/orders', ctrl.getAllOrders as RequestHandler);
remidiesAdminRouter.post('/orders/quick-sale', ctrl.createQuickSale as RequestHandler);
remidiesAdminRouter.get('/orders/:id', ctrl.getOrder as RequestHandler);
remidiesAdminRouter.put('/orders/:id/status', ctrl.updateOrderStatus as RequestHandler);

// Stock management
remidiesAdminRouter.get('/stock/low', ctrl.getLowStockProducts as RequestHandler);
remidiesAdminRouter.post('/products/:id/stock/adjust', ctrl.adjustProductStock as RequestHandler);
remidiesAdminRouter.get('/products/:id/stock/history', ctrl.getProductStockHistory as RequestHandler);
remidiesAdminRouter.get('/settings/stock', ctrl.getStockSettings as RequestHandler);
remidiesAdminRouter.put('/settings/stock', ctrl.updateStockSettings as RequestHandler);

// Coupon management (admin)
remidiesAdminRouter.post('/coupons', ctrl.createCoupon as RequestHandler);
remidiesAdminRouter.get('/coupons', ctrl.getCoupons as RequestHandler);
remidiesAdminRouter.get('/coupons/:id', ctrl.getCoupon as RequestHandler);
remidiesAdminRouter.put('/coupons/:id', ctrl.updateCoupon as RequestHandler);
remidiesAdminRouter.delete('/coupons/:id', ctrl.deactivateCoupon as RequestHandler);

// Bulk discount tier management (admin)
remidiesAdminRouter.post('/bulk-tiers', ctrl.createBulkTier as RequestHandler);
remidiesAdminRouter.get('/bulk-tiers', ctrl.getBulkTiers as RequestHandler);
remidiesAdminRouter.put('/bulk-tiers/:id', ctrl.updateBulkTier as RequestHandler);
remidiesAdminRouter.delete('/bulk-tiers/:id', ctrl.deleteBulkTier as RequestHandler);

// Dashboard stats (admin)
remidiesAdminRouter.get('/dashboard-stats', ctrl.getDashboardStats as RequestHandler);
