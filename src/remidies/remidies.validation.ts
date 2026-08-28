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
  body: z
    .object({
      name: z.string().min(1, 'Name is required'),
      description: z.string().optional(),
      images: z.array(z.string()).max(10).optional(),
      price: z.coerce.number().min(0, 'Price cannot be negative'),
      purchasePrice: z.coerce.number().min(0, 'Purchase price cannot be negative').nullable().optional(),
      stock: z.coerce.number().int().nonnegative('Stock cannot be negative'),
      isActive: z.preprocess((val) => val === 'true' || val === true, z.boolean()).optional(),
      categoryId: idSchema,
      lowStockThreshold: z.coerce.number().int().nonnegative().nullable().optional(),
    })
    .superRefine((data, ctx) => {
      if (data.stock > 0 && (data.purchasePrice == null || data.purchasePrice === undefined)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Initial unit cost is required when opening stock is greater than 0',
          path: ['purchasePrice'],
        });
      }
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
    // purchasePrice / stock are WAC-managed via stock adjust / opening cost — not editable here
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

export const removeCartItemSchema = z.object({
  params: z.object({
    productId: idSchema,
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

const couponProductScopeSchema = z.enum(['ALL', 'SPECIFIC', 'CATEGORY']);

const categoryRuleSchema = z.object({
  categoryId: idSchema,
  discountValue: z.number().positive('Discount value must be positive').max(100, 'Discount cannot exceed 100%'),
});

const couponScopeRefinement = (
  data: {
    productScope?: 'ALL' | 'SPECIFIC' | 'CATEGORY';
    productIds?: string[];
    categoryRules?: { categoryId: string; discountValue: number }[];
    discountType?: 'PERCENTAGE' | 'FIXED';
    assignedUserId?: string | null;
    expiresAt?: string | null;
  },
  ctx: z.RefinementCtx,
  mode: 'create' | 'update'
) => {
  const scope = data.productScope ?? (mode === 'create' ? 'ALL' : undefined);

  if (scope === 'SPECIFIC') {
    if (mode === 'create' && (!data.productIds || data.productIds.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one product is required when product scope is SPECIFIC',
        path: ['productIds'],
      });
    }
    if (mode === 'update' && data.productIds !== undefined && data.productIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one product is required when product scope is SPECIFIC',
        path: ['productIds'],
      });
    }
    if (data.categoryRules && data.categoryRules.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'categoryRules must be empty when product scope is SPECIFIC',
        path: ['categoryRules'],
      });
    }
  } else if (scope === 'ALL') {
    if (data.productIds && data.productIds.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'productIds must be empty when product scope is ALL',
        path: ['productIds'],
      });
    }
    if (data.categoryRules && data.categoryRules.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'categoryRules must be empty when product scope is ALL',
        path: ['categoryRules'],
      });
    }
  } else if (scope === 'CATEGORY') {
    if (data.productIds && data.productIds.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'productIds must be empty when product scope is CATEGORY',
        path: ['productIds'],
      });
    }
    if (mode === 'create' && (!data.categoryRules || data.categoryRules.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one category rule is required when product scope is CATEGORY',
        path: ['categoryRules'],
      });
    }
    if (mode === 'update' && data.categoryRules !== undefined && data.categoryRules.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one category rule is required when product scope is CATEGORY',
        path: ['categoryRules'],
      });
    }
    if (data.discountType && data.discountType !== 'PERCENTAGE') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'CATEGORY coupons must use PERCENTAGE discount type',
        path: ['discountType'],
      });
    }
    if (data.categoryRules && data.categoryRules.length > 0) {
      const ids = data.categoryRules.map((r) => r.categoryId);
      if (new Set(ids).size !== ids.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Duplicate categories are not allowed in categoryRules',
          path: ['categoryRules'],
        });
      }
    }
  }
};

export const createCouponSchema = z.object({
  body: z
    .object({
      code: z.string().min(3).max(32),
      name: z.string().max(120).optional().nullable(),
      description: z.string().max(500).optional().nullable(),
      discountType: z.enum(['PERCENTAGE', 'FIXED']),
      discountValue: z.number().positive('Discount value must be positive'),
      maxUses: z.number().int().positive('Max uses must be at least 1').optional(),
      expiresAt: z.string().datetime('Invalid expiry date').nullable().optional(),
      assignedUserId: idSchema.nullable().optional(),
      productScope: couponProductScopeSchema.default('ALL'),
      productIds: z.array(idSchema).min(1).optional(),
      categoryRules: z.array(categoryRuleSchema).min(1).optional(),
      isActive: z.boolean().optional(),
      requiresGrant: z.boolean().optional(),
    })
    .superRefine((data, ctx) => {
      couponScopeRefinement(data, ctx, 'create');
      if (!data.requiresGrant && (data.maxUses == null || data.maxUses < 1)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['maxUses'],
          message: 'Max uses must be at least 1',
        });
      }
    }),
});

export const updateCouponSchema = z.object({
  params: z.object({ id: idSchema }),
  body: z
    .object({
      name: z.string().max(120).optional().nullable(),
      description: z.string().max(500).optional().nullable(),
      discountValue: z.number().positive().optional(),
      maxUses: z.number().int().positive().optional(),
      expiresAt: z.string().datetime().nullable().optional(),
      isActive: z.boolean().optional(),
      productScope: couponProductScopeSchema.optional(),
      productIds: z.array(idSchema).min(1).optional(),
      categoryRules: z.array(categoryRuleSchema).min(1).optional(),
      assignedUserId: idSchema.nullable().optional(),
      requiresGrant: z.boolean().optional(),
    })
    .superRefine((data, ctx) => couponScopeRefinement(data, ctx, 'update')),
});

export const sendCouponSchema = z.object({
  params: z.object({ id: idSchema }),
  body: z.object({
    userIds: z.array(idSchema).min(1, 'At least one user is required'),
  }),
});

export const shareCouponSchema = z.object({
  params: z.object({ id: idSchema }),
  body: z.object({
    phoneNumber: z.string().min(8, 'Enter a valid phone number').max(20),
  }),
});

export const grantIdParamSchema = z.object({
  params: z.object({ grantId: idSchema }),
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
  body: z
    .object({
      quantityChange: z.number().int().refine((v) => v !== 0, 'quantityChange must be non-zero'),
      reason: z.string().min(1, 'Reason is required'),
      unitCost: z.coerce.number().min(0, 'Unit cost cannot be negative').optional(),
    })
    .superRefine((data, ctx) => {
      if (data.quantityChange > 0 && data.unitCost == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Unit purchase cost is required when adding stock',
          path: ['unitCost'],
        });
      }
    }),
});

export const setOpeningCostSchema = z.object({
  params: z.object({ id: idSchema }),
  body: z.object({
    unitCost: z.coerce.number().min(0, 'Unit cost cannot be negative'),
  }),
});

export const stockHistoryQuerySchema = z.object({
  params: z.object({ id: idSchema }),
  query: z.object({
    page: z.string().regex(/^\d+$/).optional().transform(Number),
    limit: z.string().regex(/^\d+$/).optional().transform(Number),
  }),
});

export const deleteStockMovementsSchema = z.object({
  params: z.object({ id: idSchema }),
  body: z.object({
    movementIds: z.array(z.string().uuid('Invalid movement ID')).min(1, 'At least one movement is required'),
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
  price:     z.coerce.number().nonnegative('Price cannot be negative').optional(),
});

const mergeQuickSaleItems = (
  items: { productId: string; quantity: number; price?: number }[],
): { productId: string; quantity: number; price?: number }[] => {
  const byProduct = new Map<string, { quantity: number; price?: number }>();
  for (const item of items) {
    const existing = byProduct.get(item.productId);
    if (existing) {
      existing.quantity += item.quantity;
      if (item.price !== undefined) existing.price = item.price;
    } else {
      byProduct.set(item.productId, { quantity: item.quantity, price: item.price });
    }
  }
  return Array.from(byProduct.entries()).map(([productId, { quantity, price }]) => ({
    productId,
    quantity,
    price,
  }));
};

const quickSaleCustomerFields = {
  customerName:    z.string().trim().min(1, 'Customer name is required'),
  customerPhone:   z.string().trim().min(7, 'Phone number must be at least 7 digits'),
  customerAddress: z.string().trim().min(1, 'Customer address is required'),
  customerCity:    z.string().trim().min(1).optional(),
  customerState:   z.string().trim().min(1).optional(),
};

export const quickSaleSchema = z.object({
  body: z
    .union([
      z.object({
        items:        z.array(quickSaleItemSchema).min(1, 'At least one item is required'),
        shippingCost: z.coerce.number().nonnegative('Shipping cost cannot be negative').default(0),
        ...quickSaleCustomerFields,
      }),
      z.object({
        productId:    z.string().uuid('Invalid product ID'),
        quantity:     z.coerce.number().int().positive('Quantity must be at least 1').default(1),
        price:        z.coerce.number().nonnegative('Price cannot be negative').optional(),
        shippingCost: z.coerce.number().nonnegative('Shipping cost cannot be negative').default(0),
        ...quickSaleCustomerFields,
      }),
    ])
    .transform((body) => {
      const items =
        'items' in body
          ? body.items
          : [{ productId: body.productId, quantity: body.quantity, price: body.price }];
      return {
        items: mergeQuickSaleItems(items),
        shippingCost: body.shippingCost,
        customerName: body.customerName,
        customerPhone: body.customerPhone,
        customerAddress: body.customerAddress,
        customerCity: body.customerCity,
        customerState: body.customerState,
      };
    }),
});

const updateCashSaleItemSchema = z.object({
  productId: z.string().uuid('Invalid product ID'),
  quantity:  z.coerce.number().int().positive('Quantity must be at least 1'),
  price:     z.coerce.number().nonnegative('Price cannot be negative'),
});

const mergeUpdateCashSaleItems = (
  items: { productId: string; quantity: number; price: number }[],
): { productId: string; quantity: number; price: number }[] => {
  const byProduct = new Map<string, { quantity: number; price: number }>();
  for (const item of items) {
    const existing = byProduct.get(item.productId);
    if (existing) {
      existing.quantity += item.quantity;
      existing.price = item.price;
    } else {
      byProduct.set(item.productId, { quantity: item.quantity, price: item.price });
    }
  }
  return Array.from(byProduct.entries()).map(([productId, { quantity, price }]) => ({
    productId,
    quantity,
    price,
  }));
};

export const updateCashSaleSchema = z.object({
  params: z.object({ id: idSchema }),
  body: z.object({
    items:        z.array(updateCashSaleItemSchema).min(1, 'At least one item is required'),
    shippingCost: z.coerce.number().nonnegative('Shipping cost cannot be negative').default(0),
    ...quickSaleCustomerFields,
  }).transform((body) => ({
    items: mergeUpdateCashSaleItems(body.items),
    shippingCost: body.shippingCost,
    customerName: body.customerName,
    customerPhone: body.customerPhone,
    customerAddress: body.customerAddress,
    customerCity: body.customerCity,
    customerState: body.customerState,
  })),
});

export const deleteCashSaleSchema = z.object({
  params: z.object({ id: idSchema }),
});

export const dashboardStatsSchema = z.object({
  query: z.object({
    startDate: z.string().optional().transform((v) => (v ? new Date(v) : undefined)),
    endDate:   z.string().optional().transform((v) => (v ? new Date(v) : undefined)),
  }),
});

export const inventorySummarySchema = dashboardStatsSchema;
