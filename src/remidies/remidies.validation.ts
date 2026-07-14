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
    purchasePrice: z.coerce.number().min(0, 'Purchase price cannot be negative').nullable().optional(),
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
    purchasePrice: z.coerce.number().min(0, 'Purchase price cannot be negative').nullable().optional(),
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

export const productSlugParamSchema = z.object({
  params: z.object({
    slug: z.string().min(1),
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

export const getOrdersQuerySchema = z.object({
  query: z.object({
    page: z.string().regex(/^\d+$/).optional().transform(Number),
    limit: z.string().regex(/^\d+$/).optional().transform(Number),
    status: z.nativeEnum(OrderStatus).optional(),
  }),
});

// ─────────────────────────────────────────────
// COUPON
// ─────────────────────────────────────────────

const couponProductScopeSchema = z.enum(['ALL', 'SPECIFIC']);

const couponProductScopeRefinement = (
  data: { productScope?: 'ALL' | 'SPECIFIC'; productIds?: string[] },
  ctx: z.RefinementCtx
) => {
  const scope = data.productScope ?? 'ALL';
  if (scope === 'SPECIFIC') {
    if (!data.productIds || data.productIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one product is required when product scope is SPECIFIC',
        path: ['productIds'],
      });
    }
  } else if (data.productIds && data.productIds.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'productIds must be empty when product scope is ALL',
      path: ['productIds'],
    });
  }
};

export const createCouponSchema = z.object({
  body: z
    .object({
      code: z.string().min(3).max(32),
      discountType: z.enum(['PERCENTAGE', 'FIXED']),
      discountValue: z.number().positive('Discount value must be positive'),
      maxUses: z.number().int().positive('Max uses must be at least 1'),
      expiresAt: z.string().datetime('Invalid expiry date'),
      assignedUserId: idSchema,
      productScope: couponProductScopeSchema.default('ALL'),
      productIds: z.array(idSchema).min(1).optional(),
    })
    .superRefine(couponProductScopeRefinement),
});

export const updateCouponSchema = z.object({
  params: z.object({ id: idSchema }),
  body: z
    .object({
      discountValue: z.number().positive().optional(),
      maxUses: z.number().int().positive().optional(),
      expiresAt: z.string().datetime().optional(),
      isActive: z.boolean().optional(),
      productScope: couponProductScopeSchema.optional(),
      productIds: z.array(idSchema).min(1).optional(),
    })
    .superRefine((data, ctx) => {
      if (data.productScope === 'ALL' && data.productIds && data.productIds.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'productIds must be empty when product scope is ALL',
          path: ['productIds'],
        });
      }
      if (data.productScope === 'SPECIFIC' && data.productIds !== undefined && data.productIds.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'At least one product is required when product scope is SPECIFIC',
          path: ['productIds'],
        });
      }
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

const quickSaleItemSchema = z.object({
  productId: z.string().uuid('Invalid product ID'),
  quantity:  z.coerce.number().int().positive('Quantity must be at least 1'),
});

const mergeQuickSaleItems = (
  items: { productId: string; quantity: number }[],
): { productId: string; quantity: number }[] => {
  const byProduct = new Map<string, number>();
  for (const item of items) {
    byProduct.set(item.productId, (byProduct.get(item.productId) ?? 0) + item.quantity);
  }
  return Array.from(byProduct.entries()).map(([productId, quantity]) => ({ productId, quantity }));
};

export const quickSaleSchema = z.object({
  body: z
    .union([
      z.object({
        items:        z.array(quickSaleItemSchema).min(1, 'At least one item is required'),
        shippingCost: z.coerce.number().nonnegative('Shipping cost cannot be negative').default(0),
      }),
      z.object({
        productId:    z.string().uuid('Invalid product ID'),
        quantity:     z.coerce.number().int().positive('Quantity must be at least 1').default(1),
        shippingCost: z.coerce.number().nonnegative('Shipping cost cannot be negative').default(0),
      }),
    ])
    .transform((body) => {
      const items =
        'items' in body
          ? body.items
          : [{ productId: body.productId, quantity: body.quantity }];
      return {
        items: mergeQuickSaleItems(items),
        shippingCost: body.shippingCost,
      };
    }),
});

export const dashboardStatsSchema = z.object({
  query: z.object({
    startDate: z.string().optional().transform((v) => (v ? new Date(v) : undefined)),
    endDate:   z.string().optional().transform((v) => (v ? new Date(v) : undefined)),
  }),
});

export const inventorySummarySchema = dashboardStatsSchema;
