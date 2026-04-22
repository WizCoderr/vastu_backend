import * as reducer from './remidies.reducer';
import { OrderStatus, DiscountType, BulkTierType } from '../generated/prisma/client';

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
  image?: string;
  price: number;
  stock: number;
  isActive?: boolean;
  categoryId: string;
}) => {
  const category = await reducer.getCategoryById(data.categoryId);
  if (!category) throw new Error('Category not found');
  return reducer.createProduct(data);
};

export const updateProduct = async (
  id: string,
  data: {
    name?: string;
    description?: string;
    image?: string;
    price?: number;
    stock?: number;
    isActive?: boolean;
    categoryId?: string;
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

export const getAllProducts = async (params: { categoryId?: string; isActive?: boolean }) => {
  const products = await reducer.getAllProducts(params);
  return products.map(p => ({ ...p, price: Number(p.price) }));
};

export const getProducts = async (params: { page: number; limit: number; categoryId?: string; isActive?: boolean }) => {
  const skip = (params.page - 1) * params.limit;
  const take = params.limit;

  const result = await reducer.getProducts({ skip, take, categoryId: params.categoryId, isActive: params.isActive });

  return {
    data: result.products.map(p => ({ ...p, price: Number(p.price) })),
    meta: {
      total: result.total,
      page: params.page,
      limit: params.limit,
      totalPages: Math.ceil(result.total / params.limit),
    },
  };
};

// --- CART INTENT ---

export const getCart = async (userId: string) => {
  let cart = await reducer.getCartByUserId(userId);
  if (!cart) {
    cart = await reducer.createCart(userId);
  }
  return cart;
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

  return reducer.getCartByUserId(userId);
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
  return reducer.getCartByUserId(userId);
};

export const removeFromCart = async (userId: string, productId: string) => {
  const cart = await reducer.getCartByUserId(userId);
  if (!cart) throw new Error('Cart not found');

  await reducer.removeCartItem(cart.id, productId);
  return reducer.getCartByUserId(userId);
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

const validateCoupon = async (
  code: string,
  userId: string,
  priceBase: number
): Promise<{ couponId: string; couponMaxUses: number; discountAmount: number }> => {
  const coupon = await reducer.getCouponByCode(code);

  if (!coupon) throw new Error('Coupon not found or invalid');
  if (!coupon.isActive) throw new Error('This coupon has been deactivated');
  if (coupon.assignedUserId !== userId) throw new Error('This coupon is not valid for your account');
  if (new Date() > coupon.expiresAt) throw new Error('This coupon has expired');
  if (coupon.usedCount >= coupon.maxUses) throw new Error('This coupon has reached its maximum usage limit');

  let discountAmount: number;
  if (coupon.discountType === DiscountType.PERCENTAGE) {
    discountAmount = (priceBase * Number(coupon.discountValue)) / 100;
  } else {
    discountAmount = Math.min(Number(coupon.discountValue), priceBase);
  }

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

  for (const item of cart.items) {
    const product = item.product;
    if (!product.isActive) {
      throw new Error(`Product ${product.name} is no longer active`);
    }

    if (product.stock < item.quantity) {
      throw new Error(`Insufficient stock for product ${product.name}`);
    }

    orderItemsData.push({
      productId: product.id,
      quantity: item.quantity,
      price: Number(product.price),
    });

    subtotalAmount += Number(product.price) * item.quantity;
    totalQuantity += item.quantity;
  }

  const { bulkDiscount } = await applyBulkDiscount(subtotalAmount, totalQuantity);
  const postBulkAmount = subtotalAmount - bulkDiscount;

  let couponDiscount = 0;
  let appliedCouponId: string | null = null;
  let couponMaxUses: number | null = null;

  if (couponCode) {
    const couponResult = await validateCoupon(couponCode, userId, postBulkAmount);
    couponDiscount = couponResult.discountAmount;
    appliedCouponId = couponResult.couponId;
    couponMaxUses = couponResult.couponMaxUses;
  }

  const totalAmount = Math.max(0, postBulkAmount - couponDiscount);

  return reducer.createOrderWithTransaction(
    userId,
    orderItemsData,
    { subtotalAmount, bulkDiscount, couponDiscount, totalAmount, appliedCouponId, couponMaxUses },
    shippingDetails
  );
};

export const getUserOrders = async (userId: string) => {
  return reducer.getUserOrders(userId);
};

export const updateOrderStatus = async (orderId: string, status: OrderStatus) => {
  const order = await reducer.getOrderById(orderId);
  if (!order) throw new Error('Order not found');

  return reducer.updateOrderStatus(orderId, status);
};

// --- COUPON INTENT ---

export const createCoupon = async (data: {
  code: string;
  discountType: DiscountType;
  discountValue: number;
  maxUses: number;
  expiresAt: string;
  assignedUserId: string;
}) => {
  const existing = await reducer.getCouponByCode(data.code.toUpperCase());
  if (existing) throw new Error('A coupon with this code already exists');

  return reducer.createCoupon({
    ...data,
    code: data.code.toUpperCase(),
    expiresAt: new Date(data.expiresAt),
  });
};

export const getCoupons = async (filters?: { assignedUserId?: string; isActive?: boolean }) => {
  return reducer.getAllCoupons(filters);
};

export const getCoupon = async (id: string) => {
  const coupon = await reducer.getCouponById(id);
  if (!coupon) throw new Error('Coupon not found');
  return coupon;
};

export const updateCoupon = async (id: string, data: {
  discountValue?: number;
  maxUses?: number;
  expiresAt?: string;
  isActive?: boolean;
}) => {
  const existing = await reducer.getCouponById(id);
  if (!existing) throw new Error('Coupon not found');

  return reducer.updateCoupon(id, {
    ...data,
    expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
  });
};

export const deactivateCoupon = async (id: string) => {
  const existing = await reducer.getCouponById(id);
  if (!existing) throw new Error('Coupon not found');
  return reducer.updateCoupon(id, { isActive: false });
};

export const getMyCoupons = async (userId: string) => {
  return reducer.getUserCoupons(userId);
};

export const validateCouponForUser = async (couponCode: string, userId: string) => {
  const coupon = await reducer.getCouponByCode(couponCode.toUpperCase());

  if (!coupon) throw new Error('Coupon not found or invalid');
  if (!coupon.isActive) throw new Error('This coupon has been deactivated');
  if (coupon.assignedUserId !== userId) throw new Error('This coupon is not valid for your account');
  if (new Date() > coupon.expiresAt) throw new Error('This coupon has expired');
  if (coupon.usedCount >= coupon.maxUses) throw new Error('This coupon has reached its maximum usage limit');

  return {
    code: coupon.code,
    discountType: coupon.discountType,
    discountValue: Number(coupon.discountValue),
    usesRemaining: coupon.maxUses - coupon.usedCount,
    expiresAt: coupon.expiresAt,
  };
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
