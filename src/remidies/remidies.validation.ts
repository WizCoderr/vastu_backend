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
    image: z.string().optional(),
    price: z.coerce.number().min(0, 'Price cannot be negative'),
    stock: z.coerce.number().int().nonnegative('Stock cannot be negative'),
    isActive: z.preprocess((val) => val === 'true' || val === true, z.boolean()).optional(),
    categoryId: idSchema,
  }),
});

export const updateProductSchema = z.object({
  params: z.object({
    id: idSchema,
  }),
  body: z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    image: z.string().optional(),
    price: z.coerce.number().min(0).optional(),
    stock: z.coerce.number().int().nonnegative().optional(),
    isActive: z.preprocess((val) => val === 'true' || val === true, z.boolean()).optional(),
    categoryId: idSchema.optional(),
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
