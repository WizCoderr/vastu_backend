import { z } from 'zod';
import { OrderStatus } from '../generated/prisma/client';

const idSchema = z.string().uuid('Invalid id');

export const createCategorySchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Name is required'),
    description: z.string().optional(),
    image: z.string().optional(),
  }),
});

export const updateCategorySchema = z.object({
  params: z.object({
    id: idSchema,
  }),
  body: z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    image: z.string().optional(),
  }),
});

export const categoryIdParamSchema = z.object({
  params: z.object({
    id: idSchema,
  }),
});

export const createProductSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Name is required'),
    description: z.string().optional(),
    images: z.array(z.string()).max(10).optional(),
    price: z.coerce.number().min(0, 'Price cannot be negative'),
    stock: z.coerce.number().int().nonnegative('Stock cannot be negative'),
    isActive: z.preprocess((val) => val === 'true' || val === true, z.boolean()).optional(),
    categoryId: idSchema,
    lowStockThreshold: z.coerce.number().int().nonnegative().nullable().optional(),
  }),
});

export const updateProductSchema = z.object({
  params: z.object({
    id: idSchema,
  }),
  body: z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    images: z.array(z.string()).max(10).optional(),
    imagesToKeep: z.array(z.string()).optional(),
    price: z.coerce.number().min(0).optional(),
    stock: z.coerce.number().int().nonnegative().optional(),
    isActive: z.preprocess((val) => val === 'true' || val === true, z.boolean()).optional(),
    categoryId: idSchema.optional(),
    lowStockThreshold: z.coerce.number().int().nonnegative().nullable().optional(),
  }),
});

export const getProductsQuerySchema = z.object({
  query: z.object({
    page: z.string().regex(/^\d+$/).optional().transform(Number),
    limit: z.string().regex(/^\d+$/).optional().transform(Number),
    categoryId: idSchema.optional(),
    isActive: z.preprocess((val) => val === 'true' || val === true, z.boolean()).optional(),
  }),
});

export const productIdParamSchema = z.object({
  params: z.object({
    id: idSchema,
  }),
});

export const addToCartSchema = z.object({
  body: z.object({
    productId: idSchema,
    quantity: z.number().int().positive('Quantity must be at least 1'),
  }),
});

export const updateCartItemSchema = z.object({
  params: z.object({
    productId: idSchema,
  }),
  body: z.object({
    quantity: z.number().int().positive('Quantity must be at least 1'),
  }),
});

export const createOrderSchema = z.object({
  body: z.object({
    shippingName: z.string().min(1, 'Shipping name is required'),
    shippingPhone: z.string().min(1, 'Shipping phone is required'),
    shippingAddress: z.string().min(1, 'Shipping address is required'),
    shippingCity: z.string().min(1, 'Shipping city is required'),
    shippingState: z.string().min(1, 'Shipping state is required'),
    shippingPostal: z.string().min(1, 'Shipping postal code is required'),
    couponCode: z.string().min(1).optional(),
  }),
});

export const updateOrderStatusSchema = z.object({
  params: z.object({
    id: idSchema,
  }),
  body: z.object({
    status: z.nativeEnum(OrderStatus),
  }),
});

export const orderIdParamSchema = z.object({
  params: z.object({
    id: idSchema,
  }),
});

// ─────────────────────────────────────────────
// COUPON
// ─────────────────────────────────────────────

export const createCouponSchema = z.object({
  body: z.object({
    code: z.string().min(3).max(32),
    discountType: z.enum(['PERCENTAGE', 'FIXED']),
    discountValue: z.number().positive('Discount value must be positive'),
    maxUses: z.number().int().positive('Max uses must be at least 1'),
    expiresAt: z.string().datetime('Invalid expiry date'),
    assignedUserId: idSchema,
  }),
});

export const updateCouponSchema = z.object({
  params: z.object({ id: idSchema }),
  body: z.object({
    discountValue: z.number().positive().optional(),
    maxUses: z.number().int().positive().optional(),
    expiresAt: z.string().datetime().optional(),
    isActive: z.boolean().optional(),
  }),
});

export const couponIdParamSchema = z.object({
  params: z.object({ id: idSchema }),
});

export const validateCouponSchema = z.object({
  body: z.object({
    couponCode: z.string().min(1, 'Coupon code is required'),
  }),
});

// ─────────────────────────────────────────────
// BULK DISCOUNT TIER
// ─────────────────────────────────────────────

export const createBulkTierSchema = z.object({
  body: z.object({
    type: z.enum(['QUANTITY', 'VALUE']),
    minThreshold: z.number().positive('Threshold must be positive'),
    discountPercent: z.number().positive().max(100, 'Discount cannot exceed 100%'),
    isActive: z.boolean().optional(),
  }),
});

export const updateBulkTierSchema = z.object({
  params: z.object({ id: idSchema }),
  body: z.object({
    minThreshold: z.number().positive().optional(),
    discountPercent: z.number().positive().max(100).optional(),
    isActive: z.boolean().optional(),
  }),
});

export const bulkTierIdParamSchema = z.object({
  params: z.object({ id: idSchema }),
});

// ─────────────────────────────────────────────
// STOCK
// ─────────────────────────────────────────────

export const adjustStockSchema = z.object({
  params: z.object({ id: idSchema }),
  body: z.object({
    quantityChange: z.number().int().refine((v) => v !== 0, 'quantityChange must be non-zero'),
    reason: z.string().min(1, 'Reason is required'),
  }),
});

export const stockHistoryQuerySchema = z.object({
  params: z.object({ id: idSchema }),
  query: z.object({
    page: z.string().regex(/^\d+$/).optional().transform(Number),
    limit: z.string().regex(/^\d+$/).optional().transform(Number),
  }),
});

export const updateStockSettingsSchema = z.object({
  body: z.object({
    globalLowStockThreshold: z.number().int().nonnegative('Threshold cannot be negative'),
  }),
});
