import { prisma, INTERACTIVE_TX } from '../core/prisma';
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
        stock: 0,
        isActive: data.isActive,
        categoryId: data.categoryId,
        lowStockThreshold: data.lowStockThreshold,
      },
    });

    if (data.stock > 0) {
      if (data.purchasePrice == null) {
        throw new Error('Initial unit cost is required when opening stock is greater than 0');
      }
      await StockService.recordStockChange(tx, {
        productId: product.id,
        quantityChange: data.stock,
        type: StockMovementType.INITIAL,
        reason: 'Initial stock',
        unitCost: Number(data.purchasePrice),
      });
    }

    return tx.product.findUnique({
      where: { id: product.id },
      include: { category: true },
    });
  }, INTERACTIVE_TX);
};

export const updateProduct = async (productId: string, data: Partial<Parameters<typeof createProduct>[0]>) => {
  const { purchasePrice: _purchasePrice, stock: _stock, ...safeData } = data;
  return prisma.product.update({
    where: { id: productId },
    data: safeData,
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
    appliedGrantId?: string | null;
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
    // 1. Verify stock for all items and resolve WAC at sale
    const itemsWithCost: {
      productId: string;
      quantity: number;
      price: number;
      unitCostAtSale: number | null;
    }[] = [];

    for (const item of cartItems) {
      const product = await tx.product.findUnique({
        where: { id: item.productId },
        select: { stock: true, name: true, purchasePrice: true },
      });

      if (!product || product.stock < item.quantity) {
        throw new Error(`Insufficient stock for product ${product?.name ?? item.productId}`);
      }

      itemsWithCost.push({
        productId: item.productId,
        quantity: item.quantity,
        price: item.price,
        unitCostAtSale: StockService.getCostAtSale(product),
      });
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
          create: itemsWithCost.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            price: item.price,
            unitCostAtSale: item.unitCostAtSale,
          })),
        },
      },
      include: { items: true },
    });

    // 3. Decrement stock with audit trail
    const stockChanges: { productId: string; previousStock: number; newStock: number; productName: string }[] = [];
    for (const item of itemsWithCost) {
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

      // Consume grant atomically if this was a grant-required coupon
      if (breakdown.appliedGrantId) {
        const grantUpdated = await tx.couponGrant.updateMany({
          where: { id: breakdown.appliedGrantId, status: 'ACTIVE' },
          data: {
            status: 'REDEEMED',
            redeemedAt: new Date(),
            orderId: order.id,
          },
        });

        if (grantUpdated.count === 0) {
          throw new Error('This coupon grant has already been used or revoked');
        }
      }
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
  }, INTERACTIVE_TX);
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
  categories: {
    include: { category: { select: { id: true, name: true } } },
  },
} as const;

export const getActiveProductsByIds = async (productIds: string[]) => {
  return prisma.product.findMany({
    where: { id: { in: productIds }, isActive: true },
    select: { id: true },
  });
};

export const getCategoriesByIds = async (categoryIds: string[]) => {
  return prisma.category.findMany({
    where: { id: { in: categoryIds } },
    select: { id: true },
  });
};

export type CouponCategoryRuleInput = {
  categoryId: string;
  discountValue: number;
};

export const createCoupon = async (data: {
  code: string;
  name?: string | null;
  description?: string | null;
  discountType: DiscountType;
  discountValue: number;
  maxUses: number;
  expiresAt: Date | null;
  assignedUserId: string | null;
  productScope: CouponProductScope;
  requiresGrant?: boolean;
  isActive?: boolean;
  productIds?: string[];
  categoryRules?: CouponCategoryRuleInput[];
}) => {
  const { productIds, categoryRules, isActive, ...couponData } = data;

  return prisma.$transaction(async (tx) => {
    const coupon = await tx.coupon.create({
      data: {
        ...couponData,
        ...(isActive !== undefined ? { isActive } : {}),
      },
    });

    if (data.productScope === CouponProductScope.SPECIFIC && productIds?.length) {
      await tx.couponProduct.createMany({
        data: productIds.map((productId) => ({ couponId: coupon.id, productId })),
      });
    }

    if (data.productScope === CouponProductScope.CATEGORY && categoryRules?.length) {
      await tx.couponCategory.createMany({
        data: categoryRules.map((rule) => ({
          couponId: coupon.id,
          categoryId: rule.categoryId,
          discountValue: rule.discountValue,
        })),
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
  name?: string | null;
  description?: string | null;
  discountValue?: number;
  maxUses?: number;
  expiresAt?: Date | null;
  isActive?: boolean;
  productScope?: CouponProductScope;
  productIds?: string[];
  categoryRules?: CouponCategoryRuleInput[];
  assignedUserId?: string | null;
  requiresGrant?: boolean;
}) => {
  const { productIds, categoryRules, ...couponData } = data;

  return prisma.$transaction(async (tx) => {
    await tx.coupon.update({ where: { id }, data: couponData });

    if (data.productScope === CouponProductScope.ALL) {
      await tx.couponProduct.deleteMany({ where: { couponId: id } });
      await tx.couponCategory.deleteMany({ where: { couponId: id } });
    } else if (data.productScope === CouponProductScope.SPECIFIC) {
      await tx.couponCategory.deleteMany({ where: { couponId: id } });
      if (productIds !== undefined) {
        await tx.couponProduct.deleteMany({ where: { couponId: id } });
        if (productIds.length > 0) {
          await tx.couponProduct.createMany({
            data: productIds.map((productId) => ({ couponId: id, productId })),
          });
        }
      }
    } else if (data.productScope === CouponProductScope.CATEGORY) {
      await tx.couponProduct.deleteMany({ where: { couponId: id } });
      if (categoryRules !== undefined) {
        await tx.couponCategory.deleteMany({ where: { couponId: id } });
        if (categoryRules.length > 0) {
          await tx.couponCategory.createMany({
            data: categoryRules.map((rule) => ({
              couponId: id,
              categoryId: rule.categoryId,
              discountValue: rule.discountValue,
            })),
          });
        }
      }
    } else if (productIds !== undefined) {
      await tx.couponProduct.deleteMany({ where: { couponId: id } });
      if (productIds.length > 0) {
        await tx.couponProduct.createMany({
          data: productIds.map((productId) => ({ couponId: id, productId })),
        });
      }
    } else if (categoryRules !== undefined) {
      await tx.couponCategory.deleteMany({ where: { couponId: id } });
      if (categoryRules.length > 0) {
        await tx.couponCategory.createMany({
          data: categoryRules.map((rule) => ({
            couponId: id,
            categoryId: rule.categoryId,
            discountValue: rule.discountValue,
          })),
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
    where: {
      isActive: true,
      OR: [
        // Public coupons (no assignment, no grant required)
        { assignedUserId: null, requiresGrant: false },
        // Directly assigned to this user (legacy personal coupons)
        { assignedUserId: userId, requiresGrant: false },
        // Grant-required coupons where user has an ACTIVE grant
        {
          requiresGrant: true,
          grants: { some: { userId, status: 'ACTIVE' } },
        },
      ],
    },
    include: couponProductsInclude,
    orderBy: { createdAt: 'desc' },
  });
};

export const getActiveGrantForUser = async (couponId: string, userId: string) => {
  return prisma.couponGrant.findFirst({
    where: { couponId, userId, status: 'ACTIVE' },
    orderBy: { grantedAt: 'asc' },
  });
};

export const getAnyGrantForUser = async (couponId: string, userId: string) => {
  return prisma.couponGrant.findFirst({
    where: { couponId, userId },
    orderBy: { grantedAt: 'desc' },
  });
};

export const createCouponGrants = async (couponId: string, userIds: string[]) => {
  const uniqueUserIds = [...new Set(userIds)];
  const created = [];

  for (const userId of uniqueUserIds) {
    const existingActive = await prisma.couponGrant.findFirst({
      where: { couponId, userId, status: 'ACTIVE' },
    });
    if (existingActive) {
      created.push({ grant: existingActive, alreadyActive: true as const });
      continue;
    }

    const grant = await prisma.$transaction(async (tx) => {
      await tx.coupon.update({
        where: { id: couponId },
        data: { maxUses: { increment: 1 } },
      });
      return tx.couponGrant.create({
        data: { couponId, userId, status: 'ACTIVE' },
      });
    });
    created.push({ grant, alreadyActive: false as const });
  }

  return created;
};

/** Digits-only phone; match last 10 digits against stored numbers. */
export const findUserByPhone = async (phoneNumber: string) => {
  const digits = phoneNumber.replace(/\D/g, '');
  if (digits.length < 8) return null;

  const suffix = digits.length >= 10 ? digits.slice(-10) : digits;
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { phoneNumber: digits },
        { phoneNumber: suffix },
        { phoneNumber: { endsWith: suffix } },
      ],
    },
    select: { id: true, name: true, email: true, phoneNumber: true },
    take: 5,
  });

  if (users.length === 0) return null;
  // Prefer exact / suffix match over loose endsWith collisions
  const exact =
    users.find((u) => u.phoneNumber.replace(/\D/g, '') === digits) ??
    users.find((u) => u.phoneNumber.replace(/\D/g, '').endsWith(suffix));
  return exact ?? users[0];
};

export const getCouponGrants = async (couponId: string) => {
  return prisma.couponGrant.findMany({
    where: { couponId },
    include: {
      user: { select: { id: true, name: true, email: true, phoneNumber: true } },
    },
    orderBy: { grantedAt: 'desc' },
  });
};

export const getCouponGrantById = async (grantId: string) => {
  return prisma.couponGrant.findUnique({
    where: { id: grantId },
    include: {
      user: { select: { id: true, name: true, email: true, phoneNumber: true } },
      coupon: true,
    },
  });
};

export const revokeCouponGrant = async (grantId: string) => {
  return prisma.couponGrant.updateMany({
    where: { id: grantId, status: 'ACTIVE' },
    data: { status: 'REVOKED' },
  });
};

export const getUsersByIds = async (userIds: string[]) => {
  return prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, email: true, phoneNumber: true },
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

/** Remote/pooled DB round-trips make multi-step POS txs exceed Prisma's 5s default. */
const CASH_SALE_TX = INTERACTIVE_TX;

export const createQuickSale = async (params: {
  items:        { productId: string; quantity: number; price?: number }[];
  shippingCost: number;
  adminUserId:  string;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  customerCity?: string;
  customerState?: string;
}) => {
  return prisma.$transaction(async (tx) => {
    const productIds = [...new Set(params.items.map((i) => i.productId))];
    const [products, settings] = await Promise.all([
      tx.product.findMany({ where: { id: { in: productIds } } }),
      tx.stockSettings.findUnique({ where: { id: 'default' } }),
    ]);
    const productById = new Map(products.map((p) => [p.id, p]));

    const qtyByProduct = new Map<string, number>();
    for (const item of params.items) {
      qtyByProduct.set(item.productId, (qtyByProduct.get(item.productId) ?? 0) + item.quantity);
    }

    const lineItems: {
      productId: string;
      quantity: number;
      price: number;
      unitCostAtSale: number | null;
      name: string;
    }[] = [];

    for (const item of params.items) {
      const product = productById.get(item.productId);
      if (!product) throw new Error(`Product not found: ${item.productId}`);
      const needed = qtyByProduct.get(item.productId) ?? item.quantity;
      if (product.stock < needed)
        throw new Error(`Insufficient stock for ${product.name} (${product.stock} available)`);

      lineItems.push({
        productId: item.productId,
        quantity:  item.quantity,
        price:     item.price != null ? Number(item.price) : Number(product.price),
        unitCostAtSale: StockService.getCostAtSale(product),
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
        payment: {
          create: {
            userId:   params.adminUserId,
            type:     PaymentType.PRODUCT,
            amount:   totalAmount,
            status:   PaymentStatus.COMPLETED,
            provider: PaymentProvider.CASH,
          },
        },
        items: {
          create: lineItems.map((item) => ({
            productId: item.productId,
            quantity:  item.quantity,
            price:     item.price,
            unitCostAtSale: item.unitCostAtSale,
          })),
        },
      },
      include: {
        items:   { include: { product: true } },
        payment: true,
      },
    });

    const stockChanges: {
      productId:     string;
      previousStock: number;
      newStock:      number;
      productName:   string;
    }[] = [];

    // Deduplicate stock decrements when the same product appears on multiple lines
    for (const [productId, quantity] of qtyByProduct) {
      const change = await StockService.recordStockChange(tx, {
        productId,
        quantityChange: -quantity,
        type:           StockMovementType.ORDER,
        reason:         'Quick cash sale (POS)',
        referenceId:    order.id,
        createdBy:      params.adminUserId,
        settings,
      });
      stockChanges.push({
        productId,
        previousStock: change.previousStock,
        newStock:      change.newStock,
        productName:   productById.get(productId)?.name ?? change.productName,
      });
    }

    // Reflect post-sale stock on the already-loaded order payload (avoids a refetch).
    const newStockById = new Map(stockChanges.map((c) => [c.productId, c.newStock]));
    for (const item of order.items) {
      const next = newStockById.get(item.productId);
      if (next != null && item.product) item.product.stock = next;
    }

    return { order, stockChanges };
  }, CASH_SALE_TX);
};

export const updateCashSale = async (params: {
  orderId: string;
  items: { productId: string; quantity: number; price: number }[];
  shippingCost: number;
  adminUserId: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  customerCity?: string;
  customerState?: string;
}) => {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.order.findUnique({
      where: { id: params.orderId },
      include: {
        items: true,
        payment: true,
      },
    });

    if (!existing) throw new Error('Order not found');
    if (!existing.payment || existing.payment.provider !== PaymentProvider.CASH) {
      throw new Error('Only cash sale bills can be updated');
    }
    if (existing.status === OrderStatus.CANCELLED) {
      throw new Error('Cannot update a cancelled cash bill');
    }

    const oldQtyByProduct = new Map<string, number>();
    const oldCostByProduct = new Map<string, { qty: number; totalCost: number }>();
    for (const item of existing.items) {
      oldQtyByProduct.set(
        item.productId,
        (oldQtyByProduct.get(item.productId) ?? 0) + item.quantity,
      );
      if (item.unitCostAtSale != null) {
        const cost = Number(item.unitCostAtSale);
        const prev = oldCostByProduct.get(item.productId) ?? { qty: 0, totalCost: 0 };
        oldCostByProduct.set(item.productId, {
          qty: prev.qty + item.quantity,
          totalCost: prev.totalCost + cost * item.quantity,
        });
      }
    }

    const newQtyByProduct = new Map<string, number>();
    for (const item of params.items) {
      newQtyByProduct.set(
        item.productId,
        (newQtyByProduct.get(item.productId) ?? 0) + item.quantity,
      );
    }

    const allProductIds = [...new Set([
      ...oldQtyByProduct.keys(),
      ...newQtyByProduct.keys(),
    ])];

    const [products, settings] = await Promise.all([
      tx.product.findMany({ where: { id: { in: allProductIds } } }),
      tx.stockSettings.findUnique({ where: { id: 'default' } }),
    ]);
    const productById = new Map(products.map((p) => [p.id, p]));

    const lineItems: {
      productId: string;
      quantity: number;
      price: number;
      unitCostAtSale: number | null;
      name: string;
    }[] = [];

    for (const productId of allProductIds) {
      const product = productById.get(productId);
      if (!product) throw new Error(`Product not found: ${productId}`);

      const oldQty = oldQtyByProduct.get(productId) ?? 0;
      const newQty = newQtyByProduct.get(productId) ?? 0;
      const available = product.stock + oldQty;
      if (newQty > available) {
        throw new Error(`Insufficient stock for ${product.name} (${available} available)`);
      }
    }

    for (const item of params.items) {
      const product = productById.get(item.productId);
      if (!product) throw new Error(`Product not found: ${item.productId}`);

      const oldQty = oldQtyByProduct.get(item.productId) ?? 0;
      const oldCostEntry = oldCostByProduct.get(item.productId);
      const oldAvgCost =
        oldCostEntry && oldCostEntry.qty > 0 ? oldCostEntry.totalCost / oldCostEntry.qty : null;
      const currentWac = StockService.getCostAtSale(product);

      let unitCostAtSale: number | null;
      if (oldAvgCost != null && item.quantity <= oldQty) {
        unitCostAtSale = Math.round(oldAvgCost * 100) / 100;
      } else if (oldAvgCost != null && oldQty > 0 && item.quantity > oldQty) {
        const extraQty = item.quantity - oldQty;
        const blended =
          (oldQty * oldAvgCost + extraQty * (currentWac ?? oldAvgCost)) / item.quantity;
        unitCostAtSale = Math.round(blended * 100) / 100;
      } else {
        unitCostAtSale = currentWac;
      }

      lineItems.push({
        productId: item.productId,
        quantity: item.quantity,
        price: item.price,
        unitCostAtSale,
        name: product.name,
      });
    }

    const subtotal = lineItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const totalAmount = subtotal + params.shippingCost;

    await tx.orderItem.deleteMany({ where: { orderId: params.orderId } });

    await tx.order.update({
      where: { id: params.orderId },
      data: {
        subtotalAmount: subtotal,
        shippingCost: params.shippingCost,
        totalAmount,
        shippingName: params.customerName.trim(),
        shippingPhone: params.customerPhone.trim(),
        shippingAddress: params.customerAddress.trim(),
        shippingCity: params.customerCity?.trim() || 'N/A',
        shippingState: params.customerState?.trim() || 'N/A',
        items: {
          create: lineItems.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            price: item.price,
            unitCostAtSale: item.unitCostAtSale,
          })),
        },
        payment: {
          update: { amount: totalAmount },
        },
      },
    });

    const stockChanges: {
      productId: string;
      previousStock: number;
      newStock: number;
      productName: string;
    }[] = [];

    for (const productId of allProductIds) {
      const oldQty = oldQtyByProduct.get(productId) ?? 0;
      const newQty = newQtyByProduct.get(productId) ?? 0;
      const delta = newQty - oldQty;
      if (delta === 0) continue;

      const product = productById.get(productId);
      if (!product) continue;

      const change = await StockService.recordStockChange(tx, {
        productId,
        quantityChange: -delta,
        type: delta > 0 ? StockMovementType.ORDER : StockMovementType.RESTOCK,
        reason: 'Cash bill updated',
        referenceId: params.orderId,
        createdBy: params.adminUserId,
        settings,
        ...(delta < 0
          ? {
              unitCost: (() => {
                const entry = oldCostByProduct.get(productId);
                if (entry && entry.qty > 0) return Math.round((entry.totalCost / entry.qty) * 100) / 100;
                return StockService.getCostAtSale(product) ?? undefined;
              })(),
              updateLastPurchasePrice: false,
            }
          : {}),
      });
      stockChanges.push({
        productId,
        previousStock: change.previousStock,
        newStock: change.newStock,
        productName: product.name,
      });
    }

    const orderWithPayment = await tx.order.findUniqueOrThrow({
      where: { id: params.orderId },
      include: {
        items: { include: { product: true } },
        payment: true,
      },
    });

    return { order: orderWithPayment, stockChanges };
  }, CASH_SALE_TX);
};

export const deleteCashSale = async (params: {
  orderId: string;
  adminUserId: string;
}) => {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.order.findUnique({
      where: { id: params.orderId },
      include: {
        items: true,
        payment: true,
      },
    });

    if (!existing) throw new Error('Order not found');
    if (!existing.payment || existing.payment.provider !== PaymentProvider.CASH) {
      throw new Error('Only cash sale bills can be deleted');
    }

    const stockChanges: {
      productId: string;
      previousStock: number;
      newStock: number;
      productName: string;
    }[] = [];

    const qtyByProduct = new Map<string, { quantity: number; unitCost: number | null }>();
    for (const item of existing.items) {
      const prev = qtyByProduct.get(item.productId);
      const cost = item.unitCostAtSale != null ? Number(item.unitCostAtSale) : null;
      if (prev) {
        const totalQty = prev.quantity + item.quantity;
        const blendedCost =
          prev.unitCost != null && cost != null
            ? (prev.unitCost * prev.quantity + cost * item.quantity) / totalQty
            : prev.unitCost ?? cost;
        qtyByProduct.set(item.productId, {
          quantity: totalQty,
          unitCost: blendedCost != null ? Math.round(blendedCost * 100) / 100 : null,
        });
      } else {
        qtyByProduct.set(item.productId, { quantity: item.quantity, unitCost: cost });
      }
    }

    const productIds = [...qtyByProduct.keys()];
    const [products, settings] = await Promise.all([
      tx.product.findMany({ where: { id: { in: productIds } } }),
      tx.stockSettings.findUnique({ where: { id: 'default' } }),
    ]);
    const productById = new Map(products.map((p) => [p.id, p]));

    for (const [productId, { quantity, unitCost }] of qtyByProduct) {
      if (quantity <= 0) continue;
      const product = productById.get(productId);
      if (!product) continue;

      const change = await StockService.recordStockChange(tx, {
        productId,
        quantityChange: quantity,
        type: StockMovementType.RESTOCK,
        reason: 'Cash bill deleted',
        referenceId: params.orderId,
        createdBy: params.adminUserId,
        unitCost: unitCost ?? StockService.getCostAtSale(product) ?? undefined,
        updateLastPurchasePrice: false,
        settings,
      });
      stockChanges.push({
        productId,
        previousStock: change.previousStock,
        newStock: change.newStock,
        productName: product.name,
      });
    }

    await tx.payment.delete({ where: { orderId: params.orderId } });
    await tx.order.delete({ where: { id: params.orderId } });

    return { stockChanges };
  }, CASH_SALE_TX);
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
          unitCostAtSale: true,
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
      unitCostAtSale: true,
      product:   { select: { purchasePrice: true } },
      order:     { select: { payment: { select: { provider: true } } } },
    },
  });
};
