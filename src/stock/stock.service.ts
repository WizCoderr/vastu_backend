import { Prisma } from '../generated/prisma/client';
import { StockMovementType } from '../generated/prisma/client';
import { prisma } from '../core/prisma';
import { config } from '../core/config';
import logger from '../utils/logger';
import { WhatsAppService } from '../notification/whatsapp.service';
import { WhatsAppMessages } from '../notification/whatsapp.messages';

type TransactionClient = Prisma.TransactionClient;

export class StockService {
  static async ensureSettings() {
    return prisma.stockSettings.upsert({
      where: { id: 'default' },
      create: { id: 'default', globalLowStockThreshold: config.stock.defaultLowStockThreshold },
      update: {},
    });
  }

  static async getSettings() {
    return this.ensureSettings();
  }

  static async updateGlobalThreshold(threshold: number) {
    return prisma.stockSettings.upsert({
      where: { id: 'default' },
      create: { id: 'default', globalLowStockThreshold: threshold },
      update: { globalLowStockThreshold: threshold },
    });
  }

  static async getEffectiveThreshold(product: { lowStockThreshold: number | null }, settings?: { globalLowStockThreshold: number }) {
    const stockSettings = settings ?? (await this.ensureSettings());
    return product.lowStockThreshold ?? stockSettings.globalLowStockThreshold;
  }

  static async recordStockChange(
    tx: TransactionClient,
    params: {
      productId: string;
      quantityChange: number;
      type: StockMovementType;
      reason?: string;
      referenceId?: string;
      createdBy?: string;
    }
  ): Promise<{ previousStock: number; newStock: number; productName: string }> {
    const product = await tx.product.findUnique({
      where: { id: params.productId },
      select: { id: true, name: true, stock: true, lowStockThreshold: true, lowStockAlertSentAt: true },
    });

    if (!product) {
      throw new Error(`Product not found: ${params.productId}`);
    }

    const previousStock = product.stock;
    const newStock = previousStock + params.quantityChange;

    if (newStock < 0) {
      throw new Error(`Insufficient stock for product ${product.name}`);
    }

    const settings = await tx.stockSettings.findUnique({ where: { id: 'default' } });
    const threshold = await this.getEffectiveThreshold(product, settings ?? undefined);

    const updateData: Prisma.ProductUpdateInput = { stock: newStock };
    if (newStock > threshold) {
      updateData.lowStockAlertSentAt = null;
    }

    await tx.product.update({
      where: { id: params.productId },
      data: updateData,
    });

    await tx.stockMovement.create({
      data: {
        productId: params.productId,
        type: params.type,
        quantityChange: params.quantityChange,
        previousStock,
        newStock,
        reason: params.reason,
        referenceId: params.referenceId,
        createdBy: params.createdBy,
      },
    });

    return { previousStock, newStock, productName: product.name };
  }

  static async checkAndQueueLowStockAlert(
    productId: string,
    _previousStock: number,
    newStock: number,
    productName: string
  ): Promise<void> {
    try {
      const product = await prisma.product.findUnique({
        where: { id: productId },
        select: { lowStockThreshold: true, lowStockAlertSentAt: true },
      });
      if (!product) return;

      const settings = await this.ensureSettings();
      const threshold = await this.getEffectiveThreshold(product, settings);

      if (newStock > threshold) {
        return;
      }

      if (product.lowStockAlertSentAt) {
        return;
      }

      const adminPhone = config.whatsapp.adminPhone;
      if (!adminPhone) {
        logger.warn('StockService: WHATSAPP_ADMIN_PHONE not configured, skipping low stock alert');
        return;
      }

      await WhatsAppService.queueNotification({
        type: 'LOW_STOCK',
        recipientPhone: adminPhone,
        message: WhatsAppMessages.lowStock({ productName, stock: newStock, threshold }),
        referenceId: productId,
      });

      await prisma.product.update({
        where: { id: productId },
        data: { lowStockAlertSentAt: new Date() },
      });
    } catch (error) {
      logger.error('StockService: Failed to queue low stock alert', { productId, error });
    }
  }

  static async getLowStockProducts() {
    const settings = await this.ensureSettings();
    const products = await prisma.product.findMany({
      where: { isActive: true },
      include: { category: true },
      orderBy: { stock: 'asc' },
    });

    return products
      .filter((p) => p.stock <= (p.lowStockThreshold ?? settings.globalLowStockThreshold))
      .map((p) => ({
        ...p,
        price: Number(p.price),
        effectiveThreshold: p.lowStockThreshold ?? settings.globalLowStockThreshold,
      }));
  }

  static async getStockHistory(productId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;
    const [movements, total] = await Promise.all([
      prisma.stockMovement.findMany({
        where: { productId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.stockMovement.count({ where: { productId } }),
    ]);

    return {
      data: movements,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  static async adjustStock(
    productId: string,
    quantityChange: number,
    reason: string,
    adminUserId: string
  ) {
    const result = await prisma.$transaction(async (tx) => {
      const change = await this.recordStockChange(tx, {
        productId,
        quantityChange,
        type: quantityChange >= 0 ? StockMovementType.RESTOCK : StockMovementType.ADJUSTMENT,
        reason,
        createdBy: adminUserId,
      });

      const product = await tx.product.findUnique({
        where: { id: productId },
        include: { category: true },
      });

      return { ...change, product };
    });

    await this.checkAndQueueLowStockAlert(
      productId,
      result.previousStock,
      result.newStock,
      result.productName
    );

    return {
      ...result.product,
      price: Number(result.product?.price),
      previousStock: result.previousStock,
      newStock: result.newStock,
    };
  }

  static async restoreOrderStock(
    orderId: string,
    items: { productId: string; quantity: number }[],
    adminUserId?: string,
    reason: string = 'Order cancelled'
  ): Promise<void> {
    const existingRestore = await prisma.stockMovement.findFirst({
      where: { referenceId: orderId, type: StockMovementType.RESTOCK, reason },
    });
    if (existingRestore) {
      return;
    }

    for (const item of items) {
      const result = await prisma.$transaction(async (tx) =>
        this.recordStockChange(tx, {
          productId: item.productId,
          quantityChange: item.quantity,
          type: StockMovementType.RESTOCK,
          reason,
          referenceId: orderId,
          createdBy: adminUserId,
        })
      );

      await this.checkAndQueueLowStockAlert(
        item.productId,
        result.previousStock,
        result.newStock,
        result.productName
      );
    }
  }
}
