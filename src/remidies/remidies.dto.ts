import { z } from 'zod';
import { OrderStatus } from '../generated/prisma/client';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;
const objectIdSchema = z.string().regex(objectIdRegex, 'Invalid ObjectId');

export const createCategorySchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Name is required'),
    description: z.string().optional(),
    image: z.string().url().optional(),
  }),
});

export const updateCategorySchema = z.object({
  params: z.object({
    id: objectIdSchema,
  }),
  body: z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    image: z.string().url().optional(),
  }),
});

export const categoryIdParamSchema = z.object({
  params: z.object({
    id: objectIdSchema,
  }),
});

export const createProductSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Name is required'),
    description: z.string().optional(),
    image: z.string().url().optional(),
    price: z.number().min(0, 'Price cannot be negative'),
    stock: z.number().int().nonnegative('Stock cannot be negative'),
    isActive: z.boolean().optional(),
    categoryId: objectIdSchema,
  }),
});

export const updateProductSchema = z.object({
  params: z.object({
    id: objectIdSchema,
  }),
  body: z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    image: z.string().url().optional(),
    price: z.number().min(0).optional(),
    // stock / purchasePrice are WAC-managed via inventory APIs
    isActive: z.boolean().optional(),
    categoryId: objectIdSchema.optional(),
  }),
});

export const getProductsQuerySchema = z.object({
  query: z.object({
    page: z.string().regex(/^\d+$/).optional().transform(Number),
    limit: z.string().regex(/^\d+$/).optional().transform(Number),
    categoryId: objectIdSchema.optional(),
    isActive: z.string().transform((val) => val === 'true').optional(),
  }),
});

export const productIdParamSchema = z.object({
  params: z.object({
    id: objectIdSchema,
  }),
});

export const addToCartSchema = z.object({
  body: z.object({
    productId: objectIdSchema,
    quantity: z.number().int().positive('Quantity must be at least 1'),
  }),
});

export const updateCartItemSchema = z.object({
  params: z.object({
    productId: objectIdSchema,
  }),
  body: z.object({
    quantity: z.number().int().positive('Quantity must be at least 1'),
  }),
});

export const removeCartItemSchema = z.object({
  params: z.object({
    productId: objectIdSchema,
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
  }),
});

export const updateOrderStatusSchema = z.object({
  params: z.object({
    id: objectIdSchema,
  }),
  body: z.object({
    status: z.nativeEnum(OrderStatus),
  }),
});

export const orderIdParamSchema = z.object({
  params: z.object({
    id: objectIdSchema,
  }),
});
