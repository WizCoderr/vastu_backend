import { prisma } from '../core/prisma';
import { OrderStatus, PaymentStatus, PaymentType, PaymentProvider, DiscountType, BulkTierType } from '../generated/prisma/client';

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

export const getCategoryById = async (categoryId: string) => {
  return prisma.category.findUnique({
    where: { id: categoryId },
  });
};

// --- PRODUCT ---

export const createProduct = async (data: {
  name: string;
  description?: string;
  image?: string;
  price: number;
  stock: number;
  isActive?: boolean;
  categoryId: string;
}) => {
  return prisma.product.create({ data });
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
        select: { stock: true },
      });

      if (!product || product.stock < item.quantity) {
        throw new Error(`Insufficient stock for product ${item.productId}`);
      }
    }

    // 2. Decrement stock
    for (const item of cartItems) {
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { decrement: item.quantity } },
      });
    }

    // 3. Create the Order
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

    return { order, payment, breakdown };
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

export const createCoupon = async (data: {
  code: string;
  discountType: DiscountType;
  discountValue: number;
  maxUses: number;
  expiresAt: Date;
  assignedUserId: string;
}) => {
  return prisma.coupon.create({ data });
};

export const getCouponByCode = async (code: string) => {
  return prisma.coupon.findUnique({ where: { code } });
};

export const getCouponById = async (id: string) => {
  return prisma.coupon.findUnique({
    where: { id },
    include: {
      assignedUser: { select: { id: true, name: true, email: true } },
      usages: { include: { order: { select: { id: true, totalAmount: true, createdAt: true } } } },
    },
  });
};

export const getAllCoupons = async (filters?: { assignedUserId?: string; isActive?: boolean }) => {
  const where: any = {};
  if (filters?.assignedUserId) where.assignedUserId = filters.assignedUserId;
  if (filters?.isActive !== undefined) where.isActive = filters.isActive;

  return prisma.coupon.findMany({
    where,
    include: { assignedUser: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: 'desc' },
  });
};

export const updateCoupon = async (id: string, data: {
  discountValue?: number;
  maxUses?: number;
  expiresAt?: Date;
  isActive?: boolean;
}) => {
  return prisma.coupon.update({ where: { id }, data });
};

export const getUserCoupons = async (userId: string) => {
  return prisma.coupon.findMany({
    where: { assignedUserId: userId, isActive: true },
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
