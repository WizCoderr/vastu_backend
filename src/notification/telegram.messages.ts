import { OrderStatus } from '../generated/prisma/client';

const shortId = (id: string) => id.slice(0, 8).toUpperCase();

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const inr = (amount: number) => `₹${amount.toLocaleString('en-IN')}`;

export const TelegramMessages = {
  newOrder(params: {
    orderId: string;
    totalAmount: number;
    itemCount: number;
    shippingName: string;
    shippingCity: string;
  }): string {
    return (
      `<b>New order #${shortId(params.orderId)}</b>\n` +
      `${inr(params.totalAmount)} · ${params.itemCount} item(s)\n` +
      `Ship to: ${escapeHtml(params.shippingName)}, ${escapeHtml(params.shippingCity)}\n` +
      `<code>/order ${shortId(params.orderId)}</code>`
    );
  },

  lowStock(params: {
    productName: string;
    stock: number;
    threshold: number;
  }): string {
    return (
      `<b>Low stock</b>\n` +
      `${escapeHtml(params.productName)}\n` +
      `${params.stock} left (threshold ${params.threshold})`
    );
  },

  orderConfirmation(params: {
    orderId: string;
    totalAmount: number;
    customerName?: string | null;
  }): string {
    const customer = params.customerName
      ? `\nCustomer: ${escapeHtml(params.customerName)}`
      : '';
    return (
      `<b>Payment confirmed #${shortId(params.orderId)}</b>\n` +
      `Amount: ${inr(params.totalAmount)}` +
      `${customer}\n` +
      `<code>/order ${shortId(params.orderId)}</code>`
    );
  },

  orderStatus(params: {
    orderId: string;
    status: OrderStatus;
    customerName?: string | null;
  }): string {
    const label = params.status.replace(/_/g, ' ');
    const customer = params.customerName
      ? `\nCustomer: ${escapeHtml(params.customerName)}`
      : '';
    return (
      `<b>Order #${shortId(params.orderId)} → ${escapeHtml(label)}</b>` +
      `${customer}\n` +
      `<code>/order ${shortId(params.orderId)}</code>`
    );
  },

  help(): string {
    return (
      `<b>Vastu admin bot</b>\n\n` +
      `/orders [STATUS] — recent orders\n` +
      `/order &lt;id&gt; — order detail\n` +
      `/stock — low stock products\n` +
      `/help — this message`
    );
  },

  start(chatId: string, isAdmin: boolean): string {
    if (isAdmin) {
      return (
        `<b>Connected as admin</b>\n` +
        `Chat ID: <code>${escapeHtml(chatId)}</code>\n\n` +
        TelegramMessages.help()
      );
    }
    return (
      `This bot is for admin use only.\n` +
      `Your chat ID: <code>${escapeHtml(chatId)}</code>\n` +
      `Set TELEGRAM_ADMIN_CHAT_ID to this value and restart the server.`
    );
  },

  orderList(
    orders: Array<{
      id: string;
      status: OrderStatus;
      totalAmount: number;
      shippingName: string | null;
      createdAt: Date;
    }>,
  ): string {
    if (orders.length === 0) {
      return 'No orders found.';
    }
    const lines = orders.map((order) => {
      const name = order.shippingName ? escapeHtml(order.shippingName) : '—';
      const date = order.createdAt.toLocaleDateString('en-IN');
      return (
        `<code>${shortId(order.id)}</code> · ${order.status} · ${inr(order.totalAmount)}\n` +
        `${name} · ${date}`
      );
    });
    return `<b>Recent orders</b>\n\n${lines.join('\n\n')}`;
  },

  orderDetail(order: {
    id: string;
    status: OrderStatus;
    totalAmount: number;
    subtotalAmount: number;
    bulkDiscount: number;
    couponDiscount: number;
    shippingName: string | null;
    shippingPhone: string | null;
    shippingCity: string | null;
    shippingAddress: string | null;
    createdAt: Date;
    items: Array<{ quantity: number; price: number; product: { name: string } }>;
    payment: { status: string; amount: number } | null;
  }): string {
    const items = order.items
      .map(
        (item) =>
          `· ${escapeHtml(item.product.name)} × ${item.quantity} — ${inr(Number(item.price))}`,
      )
      .join('\n');
    const payment = order.payment
      ? `${order.payment.status} · ${inr(Number(order.payment.amount))}`
      : 'none';
    const address = [
      order.shippingName,
      order.shippingPhone,
      order.shippingAddress,
      order.shippingCity,
    ]
      .filter(Boolean)
      .map((v) => escapeHtml(String(v)))
      .join(', ');

    return (
      `<b>Order #${shortId(order.id)}</b>\n` +
      `Status: ${order.status}\n` +
      `Total: ${inr(Number(order.totalAmount))}\n` +
      `Subtotal: ${inr(Number(order.subtotalAmount))}` +
      (Number(order.bulkDiscount) > 0 ? ` · Bulk −${inr(Number(order.bulkDiscount))}` : '') +
      (Number(order.couponDiscount) > 0 ? ` · Coupon −${inr(Number(order.couponDiscount))}` : '') +
      `\nPayment: ${payment}\n` +
      `Created: ${order.createdAt.toLocaleString('en-IN')}\n` +
      `Ship: ${address || '—'}\n\n` +
      `<b>Items</b>\n${items || '—'}`
    );
  },

  stockList(
    products: Array<{
      name: string;
      stock: number;
      threshold: number;
    }>,
  ): string {
    if (products.length === 0) {
      return 'No low-stock products.';
    }
    const lines = products.map(
      (p) =>
        `· ${escapeHtml(p.name)} — <b>${p.stock}</b> left (threshold ${p.threshold})`,
    );
    return `<b>Low stock</b>\n\n${lines.join('\n')}`;
  },
};
