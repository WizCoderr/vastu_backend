import * as reducer from './remidies.reducer';
import { OrderStatus } from '../generated/prisma/client';

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

export const getProducts = async (params: { page: number; limit: number; categoryId?: string; isActive?: boolean }) => {
  const skip = (params.page - 1) * params.limit;
  const take = params.limit;

  const result = await reducer.getProducts({ skip, take, categoryId: params.categoryId, isActive: params.isActive });

  return {
    data: result.products,
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
    return reducer.updateCartItemQuantity(existingItem.id, totalQuantity);
  } else {
    return reducer.addCartItem(cart.id, productId, quantity);
  }
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

  return reducer.updateCartItemQuantity(existingItem.id, quantity);
};

export const removeFromCart = async (userId: string, productId: string) => {
  const cart = await reducer.getCartByUserId(userId);
  if (!cart) throw new Error('Cart not found');

  return reducer.removeCartItem(cart.id, productId);
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
  }
) => {
  const cart = await reducer.getCartByUserId(userId);
  if (!cart || cart.items.length === 0) {
    throw new Error('Cart is empty');
  }

  const orderItemsData = [];
  let totalAmount = 0;

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
      price: product.price, // Snapshot current price
    });

    totalAmount += product.price * item.quantity;
  }

  return reducer.createOrderWithTransaction(userId, orderItemsData, totalAmount, shippingDetails);
};

export const getUserOrders = async (userId: string) => {
  return reducer.getUserOrders(userId);
};

export const updateOrderStatus = async (orderId: string, status: OrderStatus) => {
  const order = await reducer.getOrderById(orderId);
  if (!order) throw new Error('Order not found');

  return reducer.updateOrderStatus(orderId, status);
};
