import { prisma } from '../core/prisma';
import { Result } from '../core/result';
import { OrderStatus, WalletPassStatus, type Prisma } from '../generated/prisma';
import logger from '../utils/logger';
import { getGoogleWalletService } from './google-wallet.client';
import type { WalletPassPayload } from './google-wallet.types';

type ApiError = { code: string; message: string };

const fail = (code: string, message: string): Result<never, ApiError> =>
  Result.fail({ code, message });

function shortOrderId(orderId: string): string {
  return orderId.replace(/-/g, '').slice(0, 8).toUpperCase();
}

function toPayload(order: {
  id: string;
  totalAmount: number;
  shippingCity: string;
  updatedAt: Date;
  createdAt: Date;
  user: { name: string | null; email: string };
  items: Array<{
    quantity: number;
    price: number;
    product: { name: string };
  }>;
}): WalletPassPayload {
  const items = order.items.map((item) => ({
    name: item.product.name,
    quantity: item.quantity,
    price: Number(item.price),
  }));
  return {
    orderId: order.id,
    orderShortId: shortOrderId(order.id),
    userName: order.user.name || 'Customer',
    userEmail: order.user.email,
    totalAmount: Number(order.totalAmount),
    currency: 'INR',
    itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
    items,
    shippingCity: order.shippingCity,
    paidAt: (order.updatedAt || order.createdAt).toISOString().slice(0, 10),
    barcodeValue: order.id,
  };
}

function serializePass(pass: {
  id: string;
  userId: string;
  orderId: string;
  googleWalletClassId: string | null;
  googleWalletObjectId: string | null;
  passType: string;
  status: string;
  passData: unknown;
  createdAt: Date;
  updatedAt: Date;
  order?: { status: string; totalAmount: number } | null;
}) {
  return {
    id: pass.id,
    userId: pass.userId,
    orderId: pass.orderId,
    googleWalletClassId: pass.googleWalletClassId,
    googleWalletObjectId: pass.googleWalletObjectId,
    passType: pass.passType,
    status: pass.status,
    passData: pass.passData,
    orderStatus: pass.order?.status,
    orderTotal: pass.order ? Number(pass.order.totalAmount) : undefined,
    createdAt: pass.createdAt,
    updatedAt: pass.updatedAt,
  };
}

async function recordEvent(
  walletPassId: string,
  eventType: string,
  eventData?: Record<string, unknown>,
) {
  await prisma.walletEvent.create({
    data: {
      walletPassId,
      eventType,
      eventData: eventData ?? undefined,
    },
  });
}

export class WalletReducer {
  /** Soft-create a PENDING WalletPass after order becomes PAID (no Google call). */
  static async upsertPendingPassForOrder(orderId: string, userId: string) {
    try {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          user: true,
          items: { include: { product: true } },
        },
      });
      if (!order || order.userId !== userId) return;
      if (order.status !== OrderStatus.PAID) return;

      const payload = toPayload(order);
      const existing = await prisma.walletPass.findUnique({ where: { orderId } });
      if (existing) {
        await prisma.walletPass.update({
          where: { id: existing.id },
          data: { passData: payload as object },
        });
        return existing;
      }

      const pass = await prisma.walletPass.create({
        data: {
          userId,
          orderId,
          status: WalletPassStatus.PENDING,
          passData: payload as object,
        },
      });
      await recordEvent(pass.id, 'PASS_CREATED', { orderId });
      return pass;
    } catch (error: any) {
      logger.error('WalletReducer.upsertPendingPassForOrder failed', {
        orderId,
        message: error?.message,
      });
      return null;
    }
  }

  static async listMyPasses(userId: string) {
    const passes = await prisma.walletPass.findMany({
      where: { userId },
      include: { order: { select: { status: true, totalAmount: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return Result.ok(passes.map(serializePass));
  }

  static async getMyPass(userId: string, passId: string) {
    const pass = await prisma.walletPass.findFirst({
      where: { id: passId, userId },
      include: { order: { select: { status: true, totalAmount: true } } },
    });
    if (!pass) return fail('WALLET_PASS_NOT_FOUND', 'Wallet pass was not found');
    return Result.ok(serializePass(pass));
  }

  static async getPassForOrder(userId: string, orderId: string) {
    const pass = await prisma.walletPass.findFirst({
      where: { orderId, userId },
      include: { order: { select: { status: true, totalAmount: true } } },
    });
    if (!pass) return fail('WALLET_PASS_NOT_FOUND', 'Wallet pass was not found');
    return Result.ok(serializePass(pass));
  }

  static async issueGoogleWalletForOrder(userId: string, orderId: string) {
    const gw = getGoogleWalletService();
    if (!gw.isConfigured()) {
      return fail(
        'GOOGLE_WALLET_UNAVAILABLE',
        'Google Wallet is not configured on the server',
      );
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: true,
        items: { include: { product: true } },
      },
    });

    if (!order || order.userId !== userId) {
      return fail('ORDER_NOT_FOUND', 'Order was not found');
    }
    if (order.status !== OrderStatus.PAID) {
      return fail('ORDER_NOT_PAID', 'Only paid orders can be added to Google Wallet');
    }

    const payload = toPayload(order);
    let pass = await prisma.walletPass.findUnique({ where: { orderId } });
    if (!pass) {
      pass = await prisma.walletPass.create({
        data: {
          userId,
          orderId,
          status: WalletPassStatus.PENDING,
          passData: payload as object,
        },
      });
      await recordEvent(pass.id, 'PASS_CREATED', { orderId });
    } else {
      await prisma.walletPass.update({
        where: { id: pass.id },
        data: { passData: payload as object },
      });
    }

    try {
      const objectInfo = await gw.createOrGetPassObject(payload);
      const save = await gw.generateSaveToWalletJwt(objectInfo.objectId, objectInfo.classId);

      const updated = await prisma.walletPass.update({
        where: { id: pass.id },
        data: {
          googleWalletClassId: objectInfo.classId,
          googleWalletObjectId: objectInfo.objectId,
          status: WalletPassStatus.ACTIVE,
          passData: payload as object,
        },
      });

      await recordEvent(pass.id, 'GOOGLE_WALLET_ISSUED', {
        objectId: objectInfo.objectId,
        classId: objectInfo.classId,
      });

      return Result.ok({
        pass: serializePass(updated),
        saveUrl: save.saveUrl,
        saveJwt: save.saveJwt,
        objectId: save.objectId,
        classId: save.classId,
        status: updated.status,
      });
    } catch (error: any) {
      const code = error?.message === 'GOOGLE_WALLET_UNAVAILABLE'
        ? 'GOOGLE_WALLET_UNAVAILABLE'
        : 'GOOGLE_WALLET_ERROR';
      logger.error('WalletReducer.issueGoogleWalletForOrder failed', {
        orderId,
        message: error?.message,
      });
      await recordEvent(pass.id, 'GOOGLE_WALLET_ERROR', {
        message: error?.message,
      });
      return fail(
        code,
        code === 'GOOGLE_WALLET_UNAVAILABLE'
          ? 'Google Wallet is not configured on the server'
          : 'Failed to create Google Wallet pass',
      );
    }
  }

  static async refreshGoogleWallet(userId: string, passId: string) {
    const pass = await prisma.walletPass.findFirst({ where: { id: passId, userId } });
    if (!pass) return fail('WALLET_PASS_NOT_FOUND', 'Wallet pass was not found');
    return this.issueGoogleWalletForOrder(userId, pass.orderId);
  }

  static async adminListPasses(filters: {
    status?: string;
    orderId?: string;
    userId?: string;
    skip?: number;
    take?: number;
  }) {
    const where: Prisma.WalletPassWhereInput = {};
    if (filters.status) where.status = filters.status as WalletPassStatus;
    if (filters.orderId) where.orderId = filters.orderId;
    if (filters.userId) where.userId = filters.userId;

    const [items, total] = await Promise.all([
      prisma.walletPass.findMany({
        where,
        include: {
          order: { select: { status: true, totalAmount: true } },
          user: { select: { id: true, email: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: filters.skip ?? 0,
        take: Math.min(filters.take ?? 50, 200),
      }),
      prisma.walletPass.count({ where }),
    ]);

    return Result.ok({
      total,
      items: items.map((p) => ({
        ...serializePass(p),
        user: p.user,
      })),
    });
  }

  static async adminUpdatePassStatus(passId: string, status: 'ACTIVE' | 'INACTIVE') {
    const pass = await prisma.walletPass.findUnique({ where: { id: passId } });
    if (!pass) return fail('WALLET_PASS_NOT_FOUND', 'Wallet pass was not found');

    const gw = getGoogleWalletService();
    if (pass.googleWalletObjectId && gw.isConfigured()) {
      try {
        if (status === 'INACTIVE') {
          await gw.deactivatePassObject(pass.googleWalletObjectId);
        } else if (pass.passData) {
          const order = await prisma.order.findUnique({
            where: { id: pass.orderId },
            include: {
              user: true,
              items: { include: { product: true } },
            },
          });
          if (order) {
            await gw.updatePassObject(toPayload(order), 'ACTIVE');
          }
        }
      } catch (error: any) {
        logger.warn('WalletReducer.adminUpdatePassStatus: Google sync failed', {
          passId,
          message: error?.message,
        });
      }
    }

    const updated = await prisma.walletPass.update({
      where: { id: passId },
      data: { status: status === 'ACTIVE' ? WalletPassStatus.ACTIVE : WalletPassStatus.INACTIVE },
    });
    await recordEvent(passId, status === 'ACTIVE' ? 'PASS_REACTIVATED' : 'PASS_DEACTIVATED');
    return Result.ok(serializePass(updated));
  }

  static async adminListEvents(passId: string) {
    const pass = await prisma.walletPass.findUnique({ where: { id: passId } });
    if (!pass) return fail('WALLET_PASS_NOT_FOUND', 'Wallet pass was not found');

    const events = await prisma.walletEvent.findMany({
      where: { walletPassId: passId },
      orderBy: { createdAt: 'desc' },
    });
    return Result.ok(events);
  }

  static async adminReissueSaveUrl(passId: string) {
    const pass = await prisma.walletPass.findUnique({ where: { id: passId } });
    if (!pass) return fail('WALLET_PASS_NOT_FOUND', 'Wallet pass was not found');
    return this.issueGoogleWalletForOrder(pass.userId, pass.orderId);
  }
}
