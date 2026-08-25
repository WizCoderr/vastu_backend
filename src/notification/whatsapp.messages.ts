import { OrderStatus } from '../generated/prisma/client';

const shortId = (id: string) => id.slice(0, 8).toUpperCase();

export const WhatsAppMessages = {
  newOrder(params: {
    orderId: string;
    totalAmount: number;
    itemCount: number;
    shippingName: string;
    shippingCity: string;
  }): string {
    return (
      `New order #${shortId(params.orderId)} — ₹${params.totalAmount.toLocaleString('en-IN')} — ` +
      `${params.itemCount} item(s) — Ship to: ${params.shippingName}, ${params.shippingCity}`
    );
  },

  lowStock(params: {
    productName: string;
    stock: number;
    threshold: number;
  }): string {
    return `Low stock: ${params.productName} (${params.stock} left, threshold ${params.threshold})`;
  },

  orderConfirmation(params: {
    orderId: string;
    totalAmount: number;
  }): string {
    return (
      `Order #${shortId(params.orderId)} confirmed! Total ₹${params.totalAmount.toLocaleString('en-IN')}. ` +
      `We'll notify you when shipped.`
    );
  },

  orderStatus(params: {
    orderId: string;
    status: OrderStatus;
  }): string {
    const label = params.status.replace('_', ' ');
    return `Your order #${shortId(params.orderId)} is now ${label}.`;
  },

  couponGrant(params: {
    code: string;
    discountLabel: string;
    expiresAt: Date | null;
    userName?: string | null;
  }): string {
    const greeting = params.userName ? `Hi ${params.userName}! ` : '';
    const expiry = params.expiresAt
      ? ` Valid until ${params.expiresAt.toLocaleDateString('en-IN')}.`
      : '';
    return (
      `${greeting}You've received a one-time coupon: *${params.code}* — ${params.discountLabel}.` +
      `${expiry} Use it once at checkout in the app. To use it again, we'll need to send it to you once more.`
    );
  },
};
