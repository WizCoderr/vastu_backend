/**
 * One-off: permanently wipe remedies catalog + all product orders (CASH + RAZORPAY).
 * Keeps users, courses, course payments, coupon definitions, bulk tiers, stock settings.
 *
 * Usage: bun run wipe_remedies
 */
import { prisma } from '../src/core/prisma';
import {
  PaymentType,
  WhatsAppNotificationType,
} from '../src/generated/prisma/client';

async function countRemedies() {
  const [payments, orders, products, categories, waNotifications] = await Promise.all([
    prisma.payment.count({ where: { type: PaymentType.PRODUCT } }),
    prisma.order.count(),
    prisma.product.count(),
    prisma.category.count(),
    prisma.whatsAppNotification.count({
      where: {
        type: {
          in: [
            WhatsAppNotificationType.NEW_ORDER,
            WhatsAppNotificationType.LOW_STOCK,
            WhatsAppNotificationType.ORDER_CONFIRMATION,
            WhatsAppNotificationType.ORDER_STATUS,
          ],
        },
      },
    }),
  ]);

  return { payments, orders, products, categories, waNotifications };
}

async function main() {
  console.log('Counting remedies data before wipe...');
  const before = await countRemedies();
  console.log('Before:', before);

  if (
    before.payments === 0 &&
    before.orders === 0 &&
    before.products === 0 &&
    before.categories === 0 &&
    before.waNotifications === 0
  ) {
    console.log('Nothing to wipe. Already empty.');
    return;
  }

  console.log('Wiping in FK-safe order inside a transaction...');

  const result = await prisma.$transaction(async (tx) => {
    const payments = await tx.payment.deleteMany({
      where: { type: PaymentType.PRODUCT },
    });

    const orders = await tx.order.deleteMany({});

    const products = await tx.product.deleteMany({});

    const categories = await tx.category.deleteMany({});

    const waNotifications = await tx.whatsAppNotification.deleteMany({
      where: {
        type: {
          in: [
            WhatsAppNotificationType.NEW_ORDER,
            WhatsAppNotificationType.LOW_STOCK,
            WhatsAppNotificationType.ORDER_CONFIRMATION,
            WhatsAppNotificationType.ORDER_STATUS,
          ],
        },
      },
    });

    return {
      payments: payments.count,
      orders: orders.count,
      products: products.count,
      categories: categories.count,
      waNotifications: waNotifications.count,
    };
  });

  console.log('Deleted:', result);

  const after = await countRemedies();
  console.log('After:', after);

  if (after.orders !== 0 || after.products !== 0 || after.categories !== 0 || after.payments !== 0) {
    throw new Error(`Wipe incomplete: ${JSON.stringify(after)}`);
  }

  console.log('Remedies catalog and orders wiped successfully.');
}

main()
  .catch((err) => {
    console.error('Wipe failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
