import { Prisma } from '../generated/prisma/client';
import { StockMovementType } from '../generated/prisma/client';
import { prisma, INTERACTIVE_TX } from '../core/prisma';
import { config } from '../core/config';
import logger from '../utils/logger';
import { WhatsAppService } from '../notification/whatsapp.service';
import { WhatsAppMessages } from '../notification/whatsapp.messages';
import { applyInbound, applyOutbound, round2 } from './wac';
import { isDeletablePurchaseMovement, replayMovements } from './replay';

type TransactionClient = Prisma.TransactionClient;

export class StockService {
  static getCostAtSale(product: { purchasePrice: unknown | null }): number | null {
    return product.purchasePrice != null ? Number(product.purchasePrice) : null;
  }

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

  static async getEffectiveThreshold(
    product: { lowStockThreshold: number | null },
    settings?: { globalLowStockThreshold: number },
  ) {
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
      unitCost?: number;
      updateLastPurchasePrice?: boolean;
      /** Pass once per outer transaction to avoid N stockSettings round-trips. */
      settings?: { globalLowStockThreshold: number } | null;
    },
  ): Promise<{ previousStock: number; newStock: number; productName: string }> {
    const product = await tx.product.findUnique({
      where: { id: params.productId },
      select: {
        id: true,
        name: true,
        stock: true,
        purchasePrice: true,
        inventoryValue: true,
        lowStockThreshold: true,
        lowStockAlertSentAt: true,
      },
    });

    if (!product) {
      throw new Error(`Product not found: ${params.productId}`);
    }

    const previousStock = product.stock;
    const newStock = previousStock + params.quantityChange;

    if (newStock < 0) {
      throw new Error(`Insufficient stock for product ${product.name}`);
    }

    const settings =
      params.settings !== undefined
        ? params.settings
        : await tx.stockSettings.findUnique({ where: { id: 'default' } });
    // Resolve threshold in-process — never call ensureSettings() inside a tx
    // (that would hit the outer client and add latency / risk timeout).
    const threshold =
      product.lowStockThreshold ??
      settings?.globalLowStockThreshold ??
      config.stock.defaultLowStockThreshold;

    const currentValue = Number(product.inventoryValue);
    const currentAvg = product.purchasePrice != null ? Number(product.purchasePrice) : null;

    const updateData: Prisma.ProductUpdateInput = { stock: newStock };
    if (newStock > threshold) {
      updateData.lowStockAlertSentAt = null;
    }

    const isInbound = params.quantityChange > 0;
    const inboundTypes: StockMovementType[] = [StockMovementType.RESTOCK, StockMovementType.INITIAL];
    const shouldApplyWac =
      isInbound && params.unitCost != null && inboundTypes.includes(params.type);

    let newAvgCost: number | null = currentAvg;

    if (isInbound && params.unitCost != null && inboundTypes.includes(params.type)) {
      if (previousStock > 0 && currentAvg == null && currentValue <= 0) {
        throw new Error(
          `Set opening unit cost for ${product.name} before restocking — existing stock has no average cost`,
        );
      }

      const batchCost = params.unitCost;
      const next = applyInbound(
        { stock: previousStock, inventoryValue: currentValue, purchasePrice: currentAvg },
        params.quantityChange,
        batchCost,
      );
      updateData.inventoryValue = next.inventoryValue;
      updateData.purchasePrice = next.purchasePrice;
      newAvgCost = next.purchasePrice;
      if (params.updateLastPurchasePrice !== false) {
        updateData.lastPurchasePrice = batchCost;
      }
    } else if (params.quantityChange < 0) {
      const next = applyOutbound(
        { stock: previousStock, inventoryValue: currentValue, purchasePrice: currentAvg },
        Math.abs(params.quantityChange),
      );
      updateData.inventoryValue = next.state.inventoryValue;
      updateData.purchasePrice = next.state.purchasePrice;
      newAvgCost = next.state.purchasePrice;
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
        unitCost: shouldApplyWac ? params.unitCost : null,
        previousAvgCost: currentAvg,
        newAvgCost,
      },
    });

    return { previousStock, newStock, productName: product.name };
  }

  static async setOpeningCost(
    productId: string,
    unitCost: number,
    adminUserId: string,
  ) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { category: true },
    });

    if (!product) throw new Error('Product not found');
    if (product.stock <= 0) {
      throw new Error('Opening cost can only be set when on-hand stock is greater than 0');
    }
    if (product.purchasePrice != null) {
      throw new Error('Product already has an average cost — use restock to add batches');
    }

    const inventoryValue = round2(product.stock * unitCost);

    const updated = await prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: productId },
        data: {
          inventoryValue,
          purchasePrice: unitCost,
          lastPurchasePrice: unitCost,
        },
      });

      await tx.stockMovement.create({
        data: {
          productId,
          type: StockMovementType.ADJUSTMENT,
          quantityChange: 0,
          previousStock: product.stock,
          newStock: product.stock,
          reason: `Opening unit cost set to ₹${unitCost}`,
          createdBy: adminUserId,
          unitCost,
          previousAvgCost: null,
          newAvgCost: unitCost,
        },
      });

      return tx.product.findUnique({
        where: { id: productId },
        include: { category: true },
      });
    }, INTERACTIVE_TX);

    return {
      ...updated,
      price: Number(updated?.price),
      purchasePrice: updated?.purchasePrice != null ? Number(updated.purchasePrice) : null,
      lastPurchasePrice: updated?.lastPurchasePrice != null ? Number(updated.lastPurchasePrice) : null,
      inventoryValue: updated?.inventoryValue != null ? Number(updated.inventoryValue) : 0,
    };
  }

  static async checkAndQueueLowStockAlert(
    productId: string,
    _previousStock: number,
    newStock: number,
    productName: string,
  ): Promise<void> {
    try {
      const product = await prisma.product.findUnique({
        where: { id: productId },
        select: { lowStockThreshold: true, lowStockAlertSentAt: true },
      });
      if (!product) return;

      const settings = await this.ensureSettings();
      const threshold = await this.getEffectiveThreshold(product, settings);

      if (newStock > threshold) return;
      if (product.lowStockAlertSentAt) return;

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
        purchasePrice: p.purchasePrice != null ? Number(p.purchasePrice) : null,
        lastPurchasePrice: p.lastPurchasePrice != null ? Number(p.lastPurchasePrice) : null,
        inventoryValue: Number(p.inventoryValue),
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
      data: movements.map((m) => ({
        ...m,
        unitCost: m.unitCost != null ? Number(m.unitCost) : null,
        previousAvgCost: m.previousAvgCost != null ? Number(m.previousAvgCost) : null,
        newAvgCost: m.newAvgCost != null ? Number(m.newAvgCost) : null,
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  static async adjustStock(
    productId: string,
    quantityChange: number,
    reason: string,
    adminUserId: string,
    unitCost?: number,
  ) {
    if (quantityChange > 0 && unitCost == null) {
      throw new Error('Unit purchase cost is required when adding stock');
    }

    const result = await prisma.$transaction(async (tx) => {
      const change = await this.recordStockChange(tx, {
        productId,
        quantityChange,
        type: quantityChange >= 0 ? StockMovementType.RESTOCK : StockMovementType.ADJUSTMENT,
        reason,
        createdBy: adminUserId,
        unitCost,
      });

      const product = await tx.product.findUnique({
        where: { id: productId },
        include: { category: true },
      });

      return { ...change, product };
    }, INTERACTIVE_TX);

    await this.checkAndQueueLowStockAlert(
      productId,
      result.previousStock,
      result.newStock,
      result.productName,
    );

    return {
      ...result.product,
      price: Number(result.product?.price),
      purchasePrice: result.product?.purchasePrice != null ? Number(result.product.purchasePrice) : null,
      lastPurchasePrice: result.product?.lastPurchasePrice != null ? Number(result.product.lastPurchasePrice) : null,
      inventoryValue: result.product?.inventoryValue != null ? Number(result.product.inventoryValue) : 0,
      previousStock: result.previousStock,
      newStock: result.newStock,
    };
  }

  /**
   * Hard-delete purchase inbound movements (RESTOCK/INITIAL +qty), then rebuild
   * stock / WAC / lastPurchasePrice by replaying remaining history.
   * Preserves any inventory value not explained by movement unitCosts (legacy rows).
   */
  static async deleteStockMovements(
    productId: string,
    movementIds: string[],
    _adminUserId: string,
  ) {
    const uniqueIds = [...new Set(movementIds)];
    if (uniqueIds.length === 0) {
      throw new Error('At least one movement id is required');
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        name: true,
        stock: true,
        inventoryValue: true,
        purchasePrice: true,
      },
    });
    if (!product) throw new Error('Product not found');

    const allMovements = await prisma.stockMovement.findMany({
      where: { productId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    const byId = new Map(allMovements.map((m) => [m.id, m]));
    for (const id of uniqueIds) {
      const m = byId.get(id);
      if (!m) {
        throw new Error(`Stock movement not found: ${id}`);
      }
      if (!isDeletablePurchaseMovement(m)) {
        throw new Error(
          `Only RESTOCK/INITIAL purchase rows can be deleted (movement ${id} is ${m.type} ${m.quantityChange >= 0 ? '+' : ''}${m.quantityChange})`,
        );
      }
    }

    const toReplayInput = (rows: typeof allMovements) =>
      rows.map((m) => ({
        id: m.id,
        type: m.type,
        quantityChange: m.quantityChange,
        unitCost: m.unitCost != null ? Number(m.unitCost) : null,
      }));

    const baseline = replayMovements(toReplayInput(allMovements));
    if (!baseline.ok) {
      throw new Error(
        `Cannot delete: ${baseline.reason ?? 'history cannot be replayed'} — stock may already be sold from this batch`,
      );
    }
    if (baseline.state.stock !== product.stock) {
      throw new Error(
        `Cannot delete: replayed stock (${baseline.state.stock}) does not match on-hand (${product.stock})`,
      );
    }

    // Value present on the product but not explained by movement unitCosts (legacy null-cost rows)
    const unattributedValue = round2(Number(product.inventoryValue) - baseline.state.inventoryValue);

    const remaining = allMovements.filter((m) => !uniqueIds.includes(m.id));
    const replayed = replayMovements(toReplayInput(remaining));
    if (!replayed.ok) {
      throw new Error(
        `Cannot delete: ${replayed.reason ?? 'remaining history cannot be replayed'} — stock may already be sold from this batch`,
      );
    }

    const previousStock = product.stock;
    const newStock = replayed.state.stock;
    const newInventoryValue = round2(replayed.state.inventoryValue + unattributedValue);
    const newAvg =
      newStock > 0
        ? round2(newInventoryValue / newStock)
        : replayed.state.purchasePrice;

    const result = await prisma.$transaction(async (tx) => {
      await tx.stockMovement.deleteMany({
        where: { productId, id: { in: uniqueIds } },
      });

      for (const snap of replayed.snapshots) {
        if (!snap.id) continue;
        await tx.stockMovement.update({
          where: { id: snap.id },
          data: {
            previousStock: snap.previousStock,
            newStock: snap.newStock,
            previousAvgCost: snap.previousAvgCost,
            newAvgCost: snap.newAvgCost,
          },
        });
      }

      const updated = await tx.product.update({
        where: { id: productId },
        data: {
          stock: newStock,
          inventoryValue: newStock > 0 ? Math.max(0, newInventoryValue) : 0,
          purchasePrice: newStock > 0 ? newAvg : product.purchasePrice,
          lastPurchasePrice: replayed.lastPurchasePrice,
        },
        include: { category: true },
      });

      return updated;
    }, INTERACTIVE_TX);

    await this.checkAndQueueLowStockAlert(productId, previousStock, newStock, product.name);

    return {
      ...result,
      price: Number(result.price),
      purchasePrice: result.purchasePrice != null ? Number(result.purchasePrice) : null,
      lastPurchasePrice: result.lastPurchasePrice != null ? Number(result.lastPurchasePrice) : null,
      inventoryValue: Number(result.inventoryValue),
      deletedCount: uniqueIds.length,
      previousStock,
      newStock,
    };
  }

  static async restoreOrderStock(
    orderId: string,
    items: { productId: string; quantity: number; unitCost?: number | null }[],
    adminUserId?: string,
    reason: string = 'Order cancelled',
  ): Promise<void> {
    const existingRestore = await prisma.stockMovement.findFirst({
      where: { referenceId: orderId, type: StockMovementType.RESTOCK, reason },
    });
    if (existingRestore) return;

    for (const item of items) {
      const product = await prisma.product.findUnique({
        where: { id: item.productId },
        select: { purchasePrice: true },
      });
      const restoreCost =
        item.unitCost ?? (product?.purchasePrice != null ? Number(product.purchasePrice) : undefined);

      const result = await prisma.$transaction(
        async (tx) =>
          this.recordStockChange(tx, {
            productId: item.productId,
            quantityChange: item.quantity,
            type: StockMovementType.RESTOCK,
            reason,
            referenceId: orderId,
            createdBy: adminUserId,
            unitCost: restoreCost,
            updateLastPurchasePrice: false,
          }),
        INTERACTIVE_TX,
      );

      await this.checkAndQueueLowStockAlert(
        item.productId,
        result.previousStock,
        result.newStock,
        result.productName,
      );
    }
  }
}
