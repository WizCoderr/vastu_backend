import { prisma } from '../core/prisma';
import { OrderStatus, PaymentStatus, PaymentType, PaymentProvider, DiscountType, BulkTierType, StockMovementType, CouponProductScope } from '../generated/prisma/client';
import { StockService } from '../stock/stock.service';
import { slugify } from '../utils/slugify';

// --- CATEGORY ---

export const createCategory = async (data: { name: string; description?: string; image?: string }) => {
  return prisma.category.create({ data });
};

export const updateCategory = async (categoryId: string, data: { name?: string; description?: string; image?: string }) => {
  return prisma.category.update({
    where: { id: categoryId },
    data,
  });
};

export const deleteCategory = async (categoryId: string) => {
  return prisma.category.delete({
    where: { id: categoryId },
  });
};

export const getCategories = async () => {
  return prisma.category.findMany();
};

export const getAllProducts = async (params: { categoryId?: string; isActive?: boolean }) => {
  const where: any = {};
  if (params.categoryId) where.categoryId = params.categoryId;
  if (params.isActive !== undefined) where.isActive = params.isActive;

  return prisma.product.findMany({
    where,
    include: { category: true },
    orderBy: { createdAt: 'desc' },
  });
};

export const getActiveProductBySlug = async (slug: string) => {
  const products = await prisma.product.findMany({
    where: { isActive: true },
    include: { category: true },
  });
  return products.find((product) => slugify(product.name) === slug) ?? null;
};

export const getCategoryById = async (categoryId: string) => {
  return prisma.category.findUnique({
    where: { id: categoryId },
  });
};

// --- PRODUCT ---

export const createProduct = async (data: {
  name: string;
  description?: string;
  images?: string[];
  price: number;
  purchasePrice?: number | null;
  stock: number;
  isActive?: boolean;
  categoryId: string;
  lowStockThreshold?: number | null;
}) => {
  return prisma.$transaction(async (tx) => {
    const product = await tx.product.create({
      data: {
        name: data.name,
        description: data.description,
        images: data.images ?? [],
        price: data.price,
        purchasePrice: data.purchasePrice,
        stock: 0,
        isActive: data.isActive,
        categoryId: data.categoryId,
        lowStockThreshold: data.lowStockThreshold,
      },
    });

    if (data.stock > 0) {
      await StockService.recordStockChange(tx, {
        productId: product.id,
        quantityChange: data.stock,
        type: StockMovementType.INITIAL,
        reason: 'Initial stock',
      });
    }

    return tx.product.findUnique({
      where: { id: product.id },
      include: { category: true },
    });
  });
};

export const updateProduct = async (productId: string, data: Partial<Parameters<typeof createProduct>[0]>) => {
  return prisma.product.update({
    where: { id: productId },
    data,
  });
};

export const deleteProduct = async (productId: string) => {
  return prisma.product.delete({
    where: { id: productId },
  });
};

export const getProductById = async (productId: string) => {
  return prisma.product.findUnique({
    where: { id: productId },
    include: { category: true },
  });
};

export const getProducts = async (params: { skip?: number; take?: number; categoryId?: string; isActive?: boolean }) => {
  const where: any = {};
  if (params.categoryId) where.categoryId = params.categoryId;
  if (params.isActive !== undefined) where.isActive = params.isActive;

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      skip: params.skip,
      take: params.take,
      include: { category: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.product.count({ where }),
  ]);

  return { products, total };
};

// --- CART ---

export const getCartByUserId = async (userId: string) => {
  return prisma.cart.findUnique({
    where: { userId },
    include: {
      items: {
        include: { product: true },
      },
    },
  });
};

export const createCart = async (userId: string) => {
  return prisma.cart.create({
    data: { userId },
    include: { items: { include: { product: true } } },
  });
};

export const getCartItem = async (cartId: string, productId: string) => {
  return prisma.cartItem.findUnique({
    where: {
      cartId_productId: { cartId, productId },
    },
  });
};

export const addCartItem = async (cartId: string, productId: string, quantity: number) => {
  return prisma.cartItem.create({
    data: { cartId, productId, quantity },
    include: { product: true },
  });
};

export const updateCartItemQuantity = async (cartItemId: string, quantity: number) => {
  return prisma.cartItem.update({
    where: { id: cartItemId },
    data: { quantity },
    include: { product: true },
  });
};

export const removeCartItem = async (cartId: string, productId: string) => {
  return prisma.cartItem.delete({
    where: {
      cartId_productId: { cartId, productId },
    },
  });
};

export const clearCart = async (cartId: string) => {
  return prisma.cartItem.deleteMany({
    where: { cartId },
  });
};

// --- ORDER ---

export const createOrderWithTransaction = async (
  userId: string,
  cartItems: { productId: string; quantity: number; price: number }[],
  breakdown: {
    subtotalAmount: number;
    bulkDiscount: number;
    couponDiscount: number;
    totalAmount: number;
    appliedCouponId: string | null;
    couponMaxUses: number | null;
  },
  shippingDetails: {
    shippingName: string;
    shippingPhone: string;
    shippingAddress: string;
    shippingCity: string;
    shippingState: string;
    shippingPostal: string;
  }
) => {
  return prisma.$transaction(async (tx) => {
    // 1. Verify stock for all items
    for (const item of cartItems) {
      const product = await tx.product.findUnique({
        where: { id: item.productId },
        select: { stock: true, name: true },
      });

      if (!product || product.stock < item.quantity) {
        throw new Error(`Insufficient stock for product ${product?.name ?? item.productId}`);
      }
    }

    // 2. Create the Order
    const order = await tx.order.create({
      data: {
        userId,
        subtotalAmount: breakdown.subtotalAmount,
        bulkDiscount: breakdown.bulkDiscount,
        couponDiscount: breakdown.couponDiscount,
        totalAmount: breakdown.totalAmount,
        status: OrderStatus.PENDING,
        couponId: breakdown.appliedCouponId ?? undefined,
        ...shippingDetails,
        items: {
          create: cartItems.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            price: item.price,
          })),
        },
      },
      include: { items: true },
    });

    // 3. Decrement stock with audit trail
    const stockChanges: { productId: string; previousStock: number; newStock: number; productName: string }[] = [];
    for (const item of cartItems) {
      const change = await StockService.recordStockChange(tx, {
        productId: item.productId,
        quantityChange: -item.quantity,
        type: StockMovementType.ORDER,
        referenceId: order.id,
      });
      stockChanges.push({ productId: item.productId, ...change });
    }

    // 4. If coupon applied: create usage record + increment count with race-condition guard
    if (breakdown.appliedCouponId && breakdown.couponMaxUses !== null) {
      const updated = await tx.coupon.updateMany({
        where: { id: breakdown.appliedCouponId, usedCount: { lt: breakdown.couponMaxUses } },
        data: { usedCount: { increment: 1 } },
      });

      if (updated.count === 0) {
        throw new Error('Coupon usage limit reached');
      }

      await tx.couponUsage.create({
        data: { couponId: breakdown.appliedCouponId, orderId: order.id, userId },
      });
    }

    // 5. Create pending Payment record for the Order
    const payment = await tx.payment.create({
      data: {
        userId,
        type: PaymentType.PRODUCT,
        orderId: order.id,
        amount: breakdown.totalAmount,
        currency: 'INR',
        status: PaymentStatus.PENDING,
        provider: PaymentProvider.RAZORPAY,
      },
    });

    // 6. Clear user's cart
    const cart = await tx.cart.findUnique({ where: { userId }, select: { id: true } });
    if (cart) {
      await tx.cartItem.deleteMany({
        where: { cartId: cart.id },
      });
    }

    return { order, payment, breakdown, stockChanges };
  });
};

export const getUserOrders = async (userId: string) => {
  return prisma.order.findMany({
    where: { userId },
    include: {
      items: { include: { product: true } },
      payment: true,
    },
    orderBy: { createdAt: 'desc' },
  });
};

export const getAllOrders = async (params: { skip?: number; take?: number; status?: OrderStatus }) => {
  const where: { status?: OrderStatus } = {};
  if (params.status) where.status = params.status;

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      skip: params.skip,
      take: params.take,
      include: {
        items: { include: { product: true } },
        payment: true,
        user: { select: { id: true, name: true, email: true, phoneNumber: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.order.count({ where }),
  ]);

  return { orders, total };
};

export const getOrderById = async (orderId: string) => {
  return prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: { include: { product: true } },
      payment: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });
};

export const updateOrderStatus = async (orderId: string, status: OrderStatus) => {
  return prisma.order.update({
    where: { id: orderId },
    data: { status },
  });
};

// --- COUPON ---

const couponProductsInclude = {
  products: {
    include: { product: { select: { id: true, name: true } } },
  },
} as const;

export const getActiveProductsByIds = async (productIds: string[]) => {
  return prisma.product.findMany({
    where: { id: { in: productIds }, isActive: true },
    select: { id: true },
  });
};

export const createCoupon = async (data: {
  code: string;
  discountType: DiscountType;
  discountValue: number;
  maxUses: number;
  expiresAt: Date;
  assignedUserId: string;
  productScope: CouponProductScope;
  productIds?: string[];
}) => {
  const { productIds, ...couponData } = data;

  return prisma.$transaction(async (tx) => {
    const coupon = await tx.coupon.create({ data: couponData });

    if (data.productScope === CouponProductScope.SPECIFIC && productIds?.length) {
      await tx.couponProduct.createMany({
        data: productIds.map((productId) => ({ couponId: coupon.id, productId })),
      });
    }

    return tx.coupon.findUnique({
      where: { id: coupon.id },
      include: couponProductsInclude,
    });
  });
};

export const getCouponByCode = async (code: string) => {
  return prisma.coupon.findUnique({
    where: { code },
    include: couponProductsInclude,
  });
};

export const getCouponById = async (id: string) => {
  return prisma.coupon.findUnique({
    where: { id },
    include: {
      assignedUser: { select: { id: true, name: true, email: true } },
      usages: { include: { order: { select: { id: true, totalAmount: true, createdAt: true } } } },
      ...couponProductsInclude,
    },
  });
};

export const getAllCoupons = async (filters?: { assignedUserId?: string; isActive?: boolean }) => {
  const where: any = {};
  if (filters?.assignedUserId) where.assignedUserId = filters.assignedUserId;
  if (filters?.isActive !== undefined) where.isActive = filters.isActive;

  return prisma.coupon.findMany({
    where,
    include: {
      assignedUser: { select: { id: true, name: true, email: true } },
      ...couponProductsInclude,
    },
    orderBy: { createdAt: 'desc' },
  });
};

export const updateCoupon = async (id: string, data: {
  discountValue?: number;
  maxUses?: number;
  expiresAt?: Date;
  isActive?: boolean;
  productScope?: CouponProductScope;
  productIds?: string[];
}) => {
  const { productIds, ...couponData } = data;

  return prisma.$transaction(async (tx) => {
    await tx.coupon.update({ where: { id }, data: couponData });

    if (data.productScope === CouponProductScope.ALL) {
      await tx.couponProduct.deleteMany({ where: { couponId: id } });
    } else if (productIds !== undefined) {
      await tx.couponProduct.deleteMany({ where: { couponId: id } });
      if (productIds.length > 0) {
        await tx.couponProduct.createMany({
          data: productIds.map((productId) => ({ couponId: id, productId })),
        });
      }
    }

    return tx.coupon.findUnique({
      where: { id },
      include: {
        assignedUser: { select: { id: true, name: true, email: true } },
        ...couponProductsInclude,
      },
    });
  });
};

export const getUserCoupons = async (userId: string) => {
  return prisma.coupon.findMany({
    where: { assignedUserId: userId, isActive: true },
    include: couponProductsInclude,
    orderBy: { createdAt: 'desc' },
  });
};

// --- BULK DISCOUNT TIER ---

export const createBulkTier = async (data: {
  type: BulkTierType;
  minThreshold: number;
  discountPercent: number;
  isActive?: boolean;
}) => {
  return prisma.bulkDiscountTier.create({ data });
};

export const getActiveBulkTiers = async () => {
  return prisma.bulkDiscountTier.findMany({
    where: { isActive: true },
    orderBy: { discountPercent: 'desc' },
  });
};

export const getAllBulkTiers = async () => {
  return prisma.bulkDiscountTier.findMany({ orderBy: { createdAt: 'desc' } });
};

export const updateBulkTier = async (id: string, data: {
  minThreshold?: number;
  discountPercent?: number;
  isActive?: boolean;
}) => {
  return prisma.bulkDiscountTier.update({ where: { id }, data });
};

export const deleteBulkTier = async (id: string) => {
  return prisma.bulkDiscountTier.delete({ where: { id } });
};

// --- QUICK CASH SALE (POS) ---

export const createQuickSale = async (params: {
  items:        { productId: string; quantity: number }[];
  shippingCost: number;
  adminUserId:  string;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  customerCity?: string;
  customerState?: string;
}) => {
  return prisma.$transaction(async (tx) => {
    const lineItems: { productId: string; quantity: number; price: number; name: string }[] = [];

    for (const item of params.items) {
      const product = await tx.product.findUnique({ where: { id: item.productId } });
      if (!product) throw new Error(`Product not found: ${item.productId}`);
      if (product.stock < item.quantity)
        throw new Error(`Insufficient stock for ${product.name} (${product.stock} available)`);

      lineItems.push({
        productId: item.productId,
        quantity:  item.quantity,
        price:     Number(product.price),
        name:      product.name,
      });
    }

    const subtotal    = lineItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const totalAmount = subtotal + params.shippingCost;

    const order = await tx.order.create({
      data: {
        userId:          params.adminUserId,
        subtotalAmount:  subtotal,
        shippingCost:    params.shippingCost,
        totalAmount,
        status:          OrderStatus.PAID,
        shippingName:    params.customerName?.trim() || 'Walk-in Customer',
        shippingPhone:   params.customerPhone?.trim() || '0000000000',
        shippingAddress: params.customerAddress?.trim() || 'POS Sale',
        shippingCity:    params.customerCity?.trim() || 'N/A',
        shippingState:   params.customerState?.trim() || 'N/A',
        shippingPostal:  '000000',
        items: {
          create: lineItems.map((item) => ({
            productId: item.productId,
            quantity:  item.quantity,
            price:     item.price,
          })),
        },
      },
    });

    await tx.payment.create({
      data: {
        userId:   params.adminUserId,
        orderId:  order.id,
        type:     PaymentType.PRODUCT,
        amount:   totalAmount,
        status:   PaymentStatus.COMPLETED,
        provider: PaymentProvider.CASH,
      },
    });

    const stockChanges: {
      productId:     string;
      previousStock: number;
      newStock:      number;
      productName:   string;
    }[] = [];

    for (const item of lineItems) {
      const change = await StockService.recordStockChange(tx, {
        productId:      item.productId,
        quantityChange: -item.quantity,
        type:           StockMovementType.ORDER,
        reason:         'Quick cash sale (POS)',
        referenceId:    order.id,
        createdBy:      params.adminUserId,
      });
      stockChanges.push({
        productId:     item.productId,
        previousStock: change.previousStock,
        newStock:      change.newStock,
        productName:   item.name,
      });
    }

    // Re-fetch so payment relation is populated after create
    const orderWithPayment = await tx.order.findUniqueOrThrow({
      where:   { id: order.id },
      include: {
        items:   { include: { product: true } },
        payment: true,
      },
    });

    return { order: orderWithPayment, stockChanges };
  });
};

// --- DASHBOARD STATS ---

export const getOrdersForStats = async (params: { startDate?: Date; endDate?: Date }) => {
  return prisma.order.findMany({
    where: {
      status: OrderStatus.PAID,
      ...(params.startDate || params.endDate
        ? {
            createdAt: {
              ...(params.startDate && { gte: params.startDate }),
              ...(params.endDate   && { lte: params.endDate }),
            },
          }
        : {}),
    },
    select: {
      totalAmount:  true,
      shippingCost: true,
      payment:      { select: { provider: true } },
      items: {
        select: {
          quantity: true,
          product:  { select: { purchasePrice: true } },
        },
      },
    },
  });
};

export const getSoldItemsForInventory = async (params: { startDate?: Date; endDate?: Date }) => {
  return prisma.orderItem.findMany({
    where: {
      order: {
        status: OrderStatus.PAID,
        ...(params.startDate || params.endDate
          ? {
              createdAt: {
                ...(params.startDate && { gte: params.startDate }),
                ...(params.endDate   && { lte: params.endDate }),
              },
            }
          : {}),
      },
    },
    select: {
      productId: true,
      quantity:  true,
      price:     true,
      product:   { select: { purchasePrice: true } },
      order:     { select: { payment: { select: { provider: true } } } },
    },
  });
};
