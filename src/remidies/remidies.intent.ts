import * as reducer from './remidies.reducer';
import { OrderStatus, DiscountType, BulkTierType, CouponProductScope } from '../generated/prisma/client';
import { config } from '../core/config';
import { StockService } from '../stock/stock.service';
import { WhatsAppService } from '../notification/whatsapp.service';
import { WhatsAppMessages } from '../notification/whatsapp.messages';

// --- CATEGORY INTENT ---

export const createCategory = async (data: { name: string; description?: string; image?: string }) => {
  return reducer.createCategory(data);
};

export const updateCategory = async (id: string, data: { name?: string; description?: string; image?: string }) => {
  const existing = await reducer.getCategoryById(id);
  if (!existing) throw new Error('Category not found');
  return reducer.updateCategory(id, data);
};

export const deleteCategory = async (id: string) => {
  const existing = await reducer.getCategoryById(id);
  if (!existing) throw new Error('Category not found');
  return reducer.deleteCategory(id);
};

export const getAllCategories = async () => {
  return reducer.getCategories();
};

// --- PRODUCT INTENT ---

export const createProduct = async (data: {
  name: string;
  description?: string;
  images?: string[];
  price: number;
  stock: number;
  isActive?: boolean;
  categoryId: string;
  lowStockThreshold?: number | null;
}) => {
  const category = await reducer.getCategoryById(data.categoryId);
  if (!category) throw new Error('Category not found');
  const product = await reducer.createProduct(data);
  if (!product) throw new Error('Failed to create product');

  if (data.stock > 0) {
    await StockService.checkAndQueueLowStockAlert(product.id, 0, data.stock, product.name);
  }

  return product;
};

export const updateProduct = async (
  id: string,
  data: {
    name?: string;
    description?: string;
    images?: string[];
    imagesToKeep?: string[];
    price?: number;
    stock?: number;
    isActive?: boolean;
    categoryId?: string;
    lowStockThreshold?: number | null;
  }
) => {
  const existing = await reducer.getProductById(id);
  if (!existing) throw new Error('Product not found');

  if (data.categoryId) {
    const category = await reducer.getCategoryById(data.categoryId);
    if (!category) throw new Error('Category not found');
  }

  return reducer.updateProduct(id, data);
};

export const deleteProduct = async (id: string) => {
  const existing = await reducer.getProductById(id);
  if (!existing) throw new Error('Product not found');
  return reducer.deleteProduct(id);
};

export const getProductById = async (id: string) => {
  const product = await reducer.getProductById(id);
  if (!product) return null;
  const price = Number(product.price);
  return { ...product, price, rate: price };
};

export const getProductBySlug = async (slug: string) => {
  const product = await reducer.getActiveProductBySlug(slug);
  if (!product) return null;
  const price = Number(product.price);
  return { ...product, price, rate: price };
};

export const getAllProducts = async (params: { categoryId?: string; isActive?: boolean }) => {
  const products = await reducer.getAllProducts(params);
  return products.map(p => {
    const price = Number(p.price);
    return { ...p, price, rate: price };
  });
};

export const getProducts = async (params: { page: number; limit: number; categoryId?: string; isActive?: boolean }) => {
  const skip = (params.page - 1) * params.limit;
  const take = params.limit;

  const result = await reducer.getProducts({ skip, take, categoryId: params.categoryId, isActive: params.isActive });

  return {
    data: result.products.map(p => {
      const price = Number(p.price);
      return { ...p, price, rate: price };
    }),
    meta: {
      total: result.total,
      page: params.page,
      limit: params.limit,
      totalPages: Math.ceil(result.total / params.limit),
    },
  };
};

// --- CART INTENT ---

type RawCart = NonNullable<Awaited<ReturnType<typeof reducer.getCartByUserId>>>;

export const formatCartProduct = (product: RawCart['items'][number]['product']) => {
  const price = Number(product.price);
  return {
    ...product,
    price,
    rate: price,
  };
};

export const formatCart = (cart: RawCart | null) => {
  if (!cart) return null;

  let subtotal = 0;
  let itemCount = 0;

  const items = cart.items.map((item) => {
    const product = formatCartProduct(item.product);
    const lineTotal = product.price * item.quantity;
    subtotal += lineTotal;
    itemCount += item.quantity;
    return { ...item, lineTotal, product };
  });

  return { ...cart, items, subtotal, itemCount };
};

export const getCart = async (userId: string) => {
  let cart = await reducer.getCartByUserId(userId);
  if (!cart) {
    cart = await reducer.createCart(userId);
  }
  return formatCart(cart);
};

export const addToCart = async (userId: string, productId: string, quantity: number) => {
  let cart = await reducer.getCartByUserId(userId);
  if (!cart) {
    cart = await reducer.createCart(userId);
  }
  if (!cart) throw new Error('Could not create cart');

  const product = await reducer.getProductById(productId);
  if (!product) throw new Error('Product not found');
  if (!product.isActive) throw new Error('Product is not active');

  const existingItem = await reducer.getCartItem(cart.id, productId);
  const totalQuantity = (existingItem?.quantity || 0) + quantity;

  if (product.stock < totalQuantity) {
    throw new Error(`Insufficient stock. Available: ${product.stock}`);
  }

  if (existingItem) {
    await reducer.updateCartItemQuantity(existingItem.id, totalQuantity);
  } else {
    await reducer.addCartItem(cart.id, productId, quantity);
  }

  return formatCart(await reducer.getCartByUserId(userId));
};

export const updateCartItem = async (userId: string, productId: string, quantity: number) => {
  const cart = await reducer.getCartByUserId(userId);
  if (!cart) throw new Error('Cart not found');

  const existingItem = await reducer.getCartItem(cart.id, productId);
  if (!existingItem) throw new Error('Item not in cart');

  const product = await reducer.getProductById(productId);
  if (!product) throw new Error('Product not found');
  if (!product.isActive) throw new Error('Product is not active');

  if (product.stock < quantity) {
    throw new Error(`Insufficient stock. Available: ${product.stock}`);
  }

  await reducer.updateCartItemQuantity(existingItem.id, quantity);
  return formatCart(await reducer.getCartByUserId(userId));
};

export const removeFromCart = async (userId: string, productId: string) => {
  const cart = await reducer.getCartByUserId(userId);
  if (!cart) throw new Error('Cart not found');

  await reducer.removeCartItem(cart.id, productId);
  return formatCart(await reducer.getCartByUserId(userId));
};

// --- DISCOUNT HELPERS ---

const applyBulkDiscount = async (
  subtotal: number,
  totalQuantity: number
): Promise<{ bulkDiscount: number; appliedTierId: string | null }> => {
  const tiers = await reducer.getActiveBulkTiers();

  let bestDiscountAmount = 0;
  let bestTierId: string | null = null;

  for (const tier of tiers) {
    const threshold = Number(tier.minThreshold);
    const qualifies =
      tier.type === 'QUANTITY' ? totalQuantity >= threshold : subtotal >= threshold;

    if (qualifies) {
      const discountAmount = (subtotal * Number(tier.discountPercent)) / 100;
      if (discountAmount > bestDiscountAmount) {
        bestDiscountAmount = discountAmount;
        bestTierId = tier.id;
      }
    }
  }

  return { bulkDiscount: bestDiscountAmount, appliedTierId: bestTierId };
};

type CouponCartLine = { productId: string; lineTotal: number };

type CouponCartContext = {
  subtotalAmount: number;
  postBulkAmount: number;
  cartLines: CouponCartLine[];
};

type CouponWithProducts = NonNullable<Awaited<ReturnType<typeof reducer.getCouponByCode>>>;

type CouponProductLink = CouponWithProducts['products'][number];

const formatCouponResponse = <T extends { discountValue: unknown; products: CouponProductLink[] }>(coupon: T) => ({
  ...coupon,
  discountValue: Number(coupon.discountValue),
  products: coupon.products.map((entry) => entry.product),
});

const validateCouponProductIds = async (productIds: string[]) => {
  const uniqueIds = [...new Set(productIds)];
  const products = await reducer.getActiveProductsByIds(uniqueIds);
  if (products.length !== uniqueIds.length) {
    throw new Error('One or more selected products are invalid or inactive');
  }
  return uniqueIds;
};

const computeCouponDiscount = (
  coupon: NonNullable<CouponWithProducts>,
  context: CouponCartContext
): { discountAmount: number; eligibleSubtotal: number } => {
  let priceBase: number;
  let eligibleSubtotal = 0;

  if (coupon.productScope === CouponProductScope.SPECIFIC) {
    const eligibleIds = new Set(coupon.products.map((entry) => entry.product.id));
    for (const line of context.cartLines) {
      if (eligibleIds.has(line.productId)) {
        eligibleSubtotal += line.lineTotal;
      }
    }

    if (eligibleSubtotal === 0) {
      throw new Error('This coupon is not valid for items in your cart');
    }

    priceBase =
      context.subtotalAmount === 0
        ? 0
        : context.postBulkAmount * (eligibleSubtotal / context.subtotalAmount);
  } else {
    eligibleSubtotal = context.subtotalAmount;
    priceBase = context.postBulkAmount;
  }

  let discountAmount: number;
  if (coupon.discountType === DiscountType.PERCENTAGE) {
    discountAmount = (priceBase * Number(coupon.discountValue)) / 100;
  } else {
    discountAmount = Math.min(Number(coupon.discountValue), priceBase);
  }

  return { discountAmount, eligibleSubtotal };
};

const validateCoupon = async (
  code: string,
  userId: string,
  context: CouponCartContext
): Promise<{ couponId: string; couponMaxUses: number; discountAmount: number }> => {
  const coupon = await reducer.getCouponByCode(code.toUpperCase());

  if (!coupon) throw new Error('Coupon not found or invalid');
  if (!coupon.isActive) throw new Error('This coupon has been deactivated');
  if (coupon.assignedUserId !== userId) throw new Error('This coupon is not valid for your account');
  if (new Date() > coupon.expiresAt) throw new Error('This coupon has expired');
  if (coupon.usedCount >= coupon.maxUses) throw new Error('This coupon has reached its maximum usage limit');

  const { discountAmount } = computeCouponDiscount(coupon, context);

  return { couponId: coupon.id, couponMaxUses: coupon.maxUses, discountAmount };
};

// --- ORDER INTENT ---

export const checkoutCart = async (
  userId: string,
  shippingDetails: {
    shippingName: string;
    shippingPhone: string;
    shippingAddress: string;
    shippingCity: string;
    shippingState: string;
    shippingPostal: string;
  },
  couponCode?: string
) => {
  const cart = await reducer.getCartByUserId(userId);
  if (!cart || cart.items.length === 0) {
    throw new Error('Cart is empty');
  }

  const orderItemsData = [];
  let subtotalAmount = 0;
  let totalQuantity = 0;
  const cartLines: CouponCartLine[] = [];

  for (const item of cart.items) {
    const product = item.product;
    if (!product.isActive) {
      throw new Error(`Product ${product.name} is no longer active`);
    }

    if (product.stock < item.quantity) {
      throw new Error(`Insufficient stock for product ${product.name}`);
    }

    const lineTotal = Number(product.price) * item.quantity;

    orderItemsData.push({
      productId: product.id,
      quantity: item.quantity,
      price: Number(product.price),
    });

    cartLines.push({ productId: product.id, lineTotal });
    subtotalAmount += lineTotal;
    totalQuantity += item.quantity;
  }

  const { bulkDiscount } = await applyBulkDiscount(subtotalAmount, totalQuantity);
  const postBulkAmount = subtotalAmount - bulkDiscount;

  let couponDiscount = 0;
  let appliedCouponId: string | null = null;
  let couponMaxUses: number | null = null;

  if (couponCode) {
    const couponResult = await validateCoupon(couponCode, userId, {
      subtotalAmount,
      postBulkAmount,
      cartLines,
    });
    couponDiscount = couponResult.discountAmount;
    appliedCouponId = couponResult.couponId;
    couponMaxUses = couponResult.couponMaxUses;
  }

  const totalAmount = Math.max(0, postBulkAmount - couponDiscount);

  const result = await reducer.createOrderWithTransaction(
    userId,
    orderItemsData,
    { subtotalAmount, bulkDiscount, couponDiscount, totalAmount, appliedCouponId, couponMaxUses },
    shippingDetails
  );

  if (config.whatsapp.adminPhone) {
    await WhatsAppService.queueNotification({
      type: 'NEW_ORDER',
      recipientPhone: config.whatsapp.adminPhone,
      message: WhatsAppMessages.newOrder({
        orderId: result.order.id,
        totalAmount,
        itemCount: cart.items.length,
        shippingName: shippingDetails.shippingName,
        shippingCity: shippingDetails.shippingCity,
      }),
      referenceId: result.order.id,
    });
  }

  for (const change of result.stockChanges) {
    await StockService.checkAndQueueLowStockAlert(
      change.productId,
      change.previousStock,
      change.newStock,
      change.productName
    );
  }

  return result;
};

export const getUserOrders = async (userId: string) => {
  const orders = await reducer.getUserOrders(userId);
  return orders.map((order) => ({
    ...order,
    subtotalAmount: Number(order.subtotalAmount),
    bulkDiscount: Number(order.bulkDiscount),
    couponDiscount: Number(order.couponDiscount),
    totalAmount: Number(order.totalAmount),
    items: order.items.map((item) => ({
      ...item,
      price: Number(item.price),
      product: {
        ...item.product,
        price: Number(item.product.price),
        rate: Number(item.product.price),
      },
    })),
    payment: order.payment ? { ...order.payment, amount: Number(order.payment.amount) } : null,
  }));
};

export const getAllOrders = async (params: { page: number; limit: number; status?: OrderStatus }) => {
  const skip = (params.page - 1) * params.limit;
  const result = await reducer.getAllOrders({ skip, take: params.limit, status: params.status });

  return {
    data: result.orders.map((order) => ({
      ...order,
      subtotalAmount: Number(order.subtotalAmount),
      bulkDiscount: Number(order.bulkDiscount),
      couponDiscount: Number(order.couponDiscount),
      totalAmount: Number(order.totalAmount),
      items: order.items.map((item) => ({
        ...item,
        price: Number(item.price),
        product: { ...item.product, price: Number(item.product.price) },
      })),
      payment: order.payment
        ? { ...order.payment, amount: Number(order.payment.amount) }
        : null,
    })),
    meta: {
      total: result.total,
      page: params.page,
      limit: params.limit,
      totalPages: Math.ceil(result.total / params.limit),
    },
  };
};

export const getOrder = async (orderId: string) => {
  const order = await reducer.getOrderById(orderId);
  if (!order) throw new Error('Order not found');
  return {
    ...order,
    subtotalAmount: Number(order.subtotalAmount),
    bulkDiscount: Number(order.bulkDiscount),
    couponDiscount: Number(order.couponDiscount),
    totalAmount: Number(order.totalAmount),
    items: order.items.map((item) => ({
      ...item,
      price: Number(item.price),
      product: { ...item.product, price: Number(item.product.price) },
    })),
    payment: order.payment ? { ...order.payment, amount: Number(order.payment.amount) } : null,
  };
};

export const updateOrderStatus = async (orderId: string, status: OrderStatus, adminUserId?: string) => {
  const order = await reducer.getOrderById(orderId);
  if (!order) throw new Error('Order not found');

  const previousStatus = order.status;
  const updated = await reducer.updateOrderStatus(orderId, status);

  if (status === OrderStatus.CANCELLED && previousStatus !== OrderStatus.CANCELLED) {
    await StockService.restoreOrderStock(
      orderId,
      order.items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
      adminUserId
    );
  }

  const notifyStatuses: OrderStatus[] = [OrderStatus.SHIPPED, OrderStatus.DELIVERED, OrderStatus.CANCELLED];
  if (notifyStatuses.includes(status) && status !== previousStatus && order.shippingPhone) {
    await WhatsAppService.queueNotification({
      type: 'ORDER_STATUS',
      recipientPhone: order.shippingPhone,
      message: WhatsAppMessages.orderStatus({ orderId, status }),
      referenceId: orderId,
    });
  }

  return updated;
};

// --- STOCK INTENT ---

export const getLowStockProducts = async () => StockService.getLowStockProducts();

export const adjustProductStock = async (
  productId: string,
  quantityChange: number,
  reason: string,
  adminUserId: string
) => {
  const product = await reducer.getProductById(productId);
  if (!product) throw new Error('Product not found');
  return StockService.adjustStock(productId, quantityChange, reason, adminUserId);
};

export const getProductStockHistory = async (productId: string, page: number, limit: number) => {
  const product = await reducer.getProductById(productId);
  if (!product) throw new Error('Product not found');
  return StockService.getStockHistory(productId, page, limit);
};

export const getStockSettings = async () => StockService.getSettings();

export const updateStockSettings = async (globalLowStockThreshold: number) =>
  StockService.updateGlobalThreshold(globalLowStockThreshold);

// --- COUPON INTENT ---

export const createCoupon = async (data: {
  code: string;
  discountType: DiscountType;
  discountValue: number;
  maxUses: number;
  expiresAt: string;
  assignedUserId: string;
  productScope?: CouponProductScope;
  productIds?: string[];
}) => {
  const existing = await reducer.getCouponByCode(data.code.toUpperCase());
  if (existing) throw new Error('A coupon with this code already exists');

  const productScope = data.productScope ?? CouponProductScope.ALL;
  let productIds: string[] | undefined;

  if (productScope === CouponProductScope.SPECIFIC) {
    productIds = await validateCouponProductIds(data.productIds!);
  }

  const coupon = await reducer.createCoupon({
    code: data.code.toUpperCase(),
    discountType: data.discountType,
    discountValue: data.discountValue,
    maxUses: data.maxUses,
    expiresAt: new Date(data.expiresAt),
    assignedUserId: data.assignedUserId,
    productScope,
    productIds,
  });

  return coupon ? formatCouponResponse(coupon) : null;
};

export const getCoupons = async (filters?: { assignedUserId?: string; isActive?: boolean }) => {
  const coupons = await reducer.getAllCoupons(filters);
  return coupons.map(formatCouponResponse);
};

export const getCoupon = async (id: string) => {
  const coupon = await reducer.getCouponById(id);
  if (!coupon) throw new Error('Coupon not found');
  return formatCouponResponse(coupon);
};

export const updateCoupon = async (id: string, data: {
  discountValue?: number;
  maxUses?: number;
  expiresAt?: string;
  isActive?: boolean;
  productScope?: CouponProductScope;
  productIds?: string[];
}) => {
  const existing = await reducer.getCouponById(id);
  if (!existing) throw new Error('Coupon not found');

  let productIds: string[] | undefined;

  if (data.productScope === CouponProductScope.ALL) {
    productIds = [];
  } else if (data.productScope === CouponProductScope.SPECIFIC) {
    const resolvedProductIds =
      data.productIds ?? existing.products.map((entry) => entry.product.id);

    if (resolvedProductIds.length === 0) {
      throw new Error('At least one product is required for product-specific coupons');
    }

    productIds = await validateCouponProductIds(resolvedProductIds);
  } else if (data.productIds !== undefined) {
    if (existing.productScope !== CouponProductScope.SPECIFIC) {
      throw new Error('Cannot set productIds on an all-products coupon');
    }

    productIds = await validateCouponProductIds(data.productIds);
  }

  const coupon = await reducer.updateCoupon(id, {
    discountValue: data.discountValue,
    maxUses: data.maxUses,
    expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
    isActive: data.isActive,
    productScope: data.productScope,
    productIds,
  });

  return coupon ? formatCouponResponse(coupon) : null;
};

export const deactivateCoupon = async (id: string) => {
  const existing = await reducer.getCouponById(id);
  if (!existing) throw new Error('Coupon not found');
  const coupon = await reducer.updateCoupon(id, { isActive: false });
  return coupon ? formatCouponResponse(coupon) : null;
};

export const getMyCoupons = async (userId: string) => {
  const coupons = await reducer.getUserCoupons(userId);
  return coupons.map(formatCouponResponse);
};

export const validateCouponForUser = async (couponCode: string, userId: string) => {
  const coupon = await reducer.getCouponByCode(couponCode.toUpperCase());

  if (!coupon) throw new Error('Coupon not found or invalid');
  if (!coupon.isActive) throw new Error('This coupon has been deactivated');
  if (coupon.assignedUserId !== userId) throw new Error('This coupon is not valid for your account');
  if (new Date() > coupon.expiresAt) throw new Error('This coupon has expired');
  if (coupon.usedCount >= coupon.maxUses) throw new Error('This coupon has reached its maximum usage limit');

  const applicableProducts =
    coupon.productScope === CouponProductScope.SPECIFIC
      ? coupon.products.map((entry) => entry.product)
      : [];

  const response: {
    code: string;
    discountType: DiscountType;
    discountValue: number;
    usesRemaining: number;
    expiresAt: Date;
    productScope: CouponProductScope;
    applicableProducts: { id: string; name: string }[];
    eligibleSubtotal?: number;
    discountAmount?: number;
  } = {
    code: coupon.code,
    discountType: coupon.discountType,
    discountValue: Number(coupon.discountValue),
    usesRemaining: coupon.maxUses - coupon.usedCount,
    expiresAt: coupon.expiresAt,
    productScope: coupon.productScope,
    applicableProducts,
  };

  const cart = await reducer.getCartByUserId(userId);
  if (cart && cart.items.length > 0) {
    let subtotalAmount = 0;
    const cartLines: CouponCartLine[] = [];

    for (const item of cart.items) {
      const lineTotal = Number(item.product.price) * item.quantity;
      cartLines.push({ productId: item.product.id, lineTotal });
      subtotalAmount += lineTotal;
    }

    const totalQuantity = cart.items.reduce((sum, item) => sum + item.quantity, 0);
    const { bulkDiscount } = await applyBulkDiscount(subtotalAmount, totalQuantity);
    const postBulkAmount = subtotalAmount - bulkDiscount;
    const { discountAmount, eligibleSubtotal } = computeCouponDiscount(coupon, {
      subtotalAmount,
      postBulkAmount,
      cartLines,
    });

    response.eligibleSubtotal = eligibleSubtotal;
    response.discountAmount = discountAmount;
  }

  return response;
};

// --- BULK DISCOUNT TIER INTENT ---

export const createBulkTier = async (data: {
  type: BulkTierType;
  minThreshold: number;
  discountPercent: number;
  isActive?: boolean;
}) => {
  return reducer.createBulkTier(data);
};

export const getBulkTiers = async (activeOnly = false) => {
  return activeOnly ? reducer.getActiveBulkTiers() : reducer.getAllBulkTiers();
};

export const updateBulkTier = async (id: string, data: {
  minThreshold?: number;
  discountPercent?: number;
  isActive?: boolean;
}) => {
  const tiers = await reducer.getAllBulkTiers();
  const existing = tiers.find((t) => t.id === id);
  if (!existing) throw new Error('Bulk discount tier not found');
  return reducer.updateBulkTier(id, data);
};

export const deleteBulkTier = async (id: string) => {
  const tiers = await reducer.getAllBulkTiers();
  const existing = tiers.find((t) => t.id === id);
  if (!existing) throw new Error('Bulk discount tier not found');
  return reducer.deleteBulkTier(id);
};

// --- QUICK CASH SALE (POS) ---

export const createQuickSale = async (params: {
  productId:    string;
  quantity:     number;
  shippingCost: number;
  adminUserId:  string;
}) => {
  const result = await reducer.createQuickSale(params);

  await StockService.checkAndQueueLowStockAlert(
    result.product.id,
    result.previousStock,
    result.newStock,
    result.product.name,
  );

  if (config.whatsapp.adminPhone) {
    await WhatsAppService.queueNotification({
      type:           'NEW_ORDER',
      recipientPhone: config.whatsapp.adminPhone,
      message: WhatsAppMessages.newOrder({
        orderId:      result.order.id,
        totalAmount:  Number(result.order.totalAmount),
        itemCount:    1,
        shippingName: 'Walk-in Customer (POS)',
        shippingCity: 'POS',
      }),
      referenceId: result.order.id,
    });
  }

  return result.order;
};

// --- DASHBOARD STATS ---

export const getDashboardStats = async (params: { startDate?: Date; endDate?: Date }) => {
  const orders = await reducer.getOrdersForStats(params);

  let totalSales        = 0;
  let totalPurchaseCost = 0;
  let totalShipping     = 0;

  for (const order of orders) {
    totalSales    += Number(order.totalAmount);
    totalShipping += Number(order.shippingCost ?? 0);
    for (const item of order.items) {
      totalPurchaseCost += Number(item.product.purchasePrice ?? 0) * item.quantity;
    }
  }

  return {
    totalSales,
    totalPurchaseCost,
    totalProfit: totalSales - totalPurchaseCost - totalShipping,
    orderCount:  orders.length,
  };
};
