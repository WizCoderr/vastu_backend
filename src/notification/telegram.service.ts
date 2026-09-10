import { Bot, Context } from 'grammy';
import {
  OrderStatus,
  TelegramNotificationStatus,
  TelegramNotificationType,
} from '../generated/prisma/client';
import { prisma } from '../core/prisma';
import { config } from '../core/config';
import logger from '../utils/logger';
import { TelegramMessages } from './telegram.messages';
import * as remidiesReducer from '../remidies/remidies.reducer';

let bot: Bot | null = null;
let starting = false;
let running = false;
let lastInitError: string | null = null;

const ORDER_STATUSES = new Set(Object.values(OrderStatus));

const isAdminChat = (chatId: number | string): boolean => {
  const configured = config.telegram.adminChatId;
  if (!configured) return false;
  return String(chatId) === String(configured);
};

const replyHtml = async (ctx: Context, text: string) => {
  await ctx.reply(text, { parse_mode: 'HTML' });
};

export class TelegramService {
  static isRunning(): boolean {
    return running && bot !== null;
  }

  static getStatus() {
    return {
      enabled: config.telegram.enabled,
      running,
      adminChatConfigured: !!config.telegram.adminChatId,
      lastInitError,
    };
  }

  static async getDetailedStatus() {
    const [pendingCount, failedCount] = await Promise.all([
      prisma.telegramNotification.count({ where: { status: 'PENDING' } }),
      prisma.telegramNotification.count({ where: { status: 'FAILED' } }),
    ]);

    const enabled = config.telegram.enabled;
    const adminChatConfigured = !!config.telegram.adminChatId;

    let message: string;
    if (!enabled) {
      message = 'Telegram is disabled (missing TELEGRAM_BOT_TOKEN or TELEGRAM_ENABLED=false)';
    } else if (!adminChatConfigured) {
      message = 'Set TELEGRAM_ADMIN_CHAT_ID — send /start to the bot to get your chat ID';
    } else if (running) {
      message = 'Telegram bot polling — admin alerts enabled';
    } else {
      message = 'Telegram bot not running — check logs / lastInitError';
    }

    return {
      enabled,
      running,
      adminChatConfigured,
      adminChatId: config.telegram.adminChatId || null,
      setupRequired: enabled && !adminChatConfigured,
      message,
      pendingCount,
      failedCount,
      lastInitError,
    };
  }

  static async initBot(): Promise<void> {
    if (!config.telegram.enabled) {
      logger.info('TelegramService: Disabled (no token or TELEGRAM_ENABLED=false)');
      return;
    }

    if (bot || starting) {
      return;
    }

    starting = true;
    lastInitError = null;

    try {
      bot = new Bot(config.telegram.botToken);
      this.registerCommands(bot);

      bot.catch((err) => {
        logger.error('TelegramService: Bot error', { error: err.error });
      });

      void bot.start({
        onStart: (info) => {
          running = true;
          lastInitError = null;
          logger.info('TelegramService: Bot polling started', { username: info.username });
          void this.processPendingNotifications().catch((error) => {
            logger.error('TelegramService: Failed to flush pending on start', { error });
          });
        },
      }).catch((error) => {
        running = false;
        bot = null;
        const msg = error instanceof Error ? error.message : String(error);
        lastInitError = msg;
        logger.error('TelegramService: bot.start failed', { error: msg });
      });
    } catch (error) {
      bot = null;
      running = false;
      const msg = error instanceof Error ? error.message : String(error);
      lastInitError = msg;
      logger.error('TelegramService: Failed to initialize bot', { error: msg });
    } finally {
      starting = false;
    }
  }

  private static registerCommands(instance: Bot): void {
    instance.command('start', async (ctx) => {
      const chatId = String(ctx.chat?.id ?? '');
      await replyHtml(ctx, TelegramMessages.start(chatId, isAdminChat(chatId)));
    });

    instance.command('help', async (ctx) => {
      if (!this.requireAdmin(ctx)) return;
      await replyHtml(ctx, TelegramMessages.help());
    });

    instance.command('orders', async (ctx) => {
      if (!this.requireAdmin(ctx)) return;
      try {
        const arg = ctx.match?.trim().toUpperCase();
        const status =
          arg && ORDER_STATUSES.has(arg as OrderStatus) ? (arg as OrderStatus) : undefined;
        const result = await remidiesReducer.getAllOrders({ take: 10, status });
        await replyHtml(
          ctx,
          TelegramMessages.orderList(
            result.orders.map((o) => ({
              id: o.id,
              status: o.status,
              totalAmount: Number(o.totalAmount),
              shippingName: o.shippingName,
              createdAt: o.createdAt,
            })),
          ),
        );
      } catch (error) {
        logger.error('TelegramService: /orders failed', { error });
        await ctx.reply('Failed to fetch orders.');
      }
    });

    instance.command('order', async (ctx) => {
      if (!this.requireAdmin(ctx)) return;
      try {
        const raw = ctx.match?.trim() ?? '';
        if (!raw) {
          await ctx.reply('Usage: /order <shortId>');
          return;
        }
        const prefix = raw.replace(/[^a-fA-F0-9-]/g, '').toLowerCase();
        if (prefix.length < 4) {
          await ctx.reply('Provide at least 4 characters of the order id.');
          return;
        }

        const order =
          (await remidiesReducer.getOrderById(prefix)) ??
          (await prisma.order.findFirst({
            where: { id: { startsWith: prefix } },
            include: {
              items: { include: { product: true } },
              payment: true,
              user: { select: { id: true, name: true, email: true } },
            },
          }));

        if (!order) {
          await ctx.reply(`No order found for ${raw}`);
          return;
        }

        await replyHtml(
          ctx,
          TelegramMessages.orderDetail({
            id: order.id,
            status: order.status,
            totalAmount: Number(order.totalAmount),
            subtotalAmount: Number(order.subtotalAmount),
            bulkDiscount: Number(order.bulkDiscount),
            couponDiscount: Number(order.couponDiscount),
            shippingName: order.shippingName,
            shippingPhone: order.shippingPhone,
            shippingCity: order.shippingCity,
            shippingAddress: order.shippingAddress,
            createdAt: order.createdAt,
            items: order.items.map((item) => ({
              quantity: item.quantity,
              price: Number(item.price),
              product: { name: item.product.name },
            })),
            payment: order.payment
              ? { status: order.payment.status, amount: Number(order.payment.amount) }
              : null,
          }),
        );
      } catch (error) {
        logger.error('TelegramService: /order failed', { error });
        await ctx.reply('Failed to fetch order.');
      }
    });

    instance.command('stock', async (ctx) => {
      if (!this.requireAdmin(ctx)) return;
      try {
        const { StockService } = await import('../stock/stock.service');
        const products = await StockService.getLowStockProducts();
        await replyHtml(
          ctx,
          TelegramMessages.stockList(
            products.map((p) => ({
              name: p.name,
              stock: p.stock,
              threshold: p.effectiveThreshold ?? p.lowStockThreshold ?? 0,
            })),
          ),
        );
      } catch (error) {
        logger.error('TelegramService: /stock failed', { error });
        await ctx.reply('Failed to fetch stock.');
      }
    });
  }

  private static requireAdmin(ctx: Context): boolean {
    const chatId = ctx.chat?.id;
    if (chatId == null || !isAdminChat(chatId)) {
      void ctx.reply('Unauthorized. This chat is not TELEGRAM_ADMIN_CHAT_ID.');
      return false;
    }
    return true;
  }

  static async queueAdminNotification(params: {
    type: TelegramNotificationType;
    message: string;
    referenceId?: string;
  }): Promise<void> {
    if (!config.telegram.enabled) {
      logger.warn('TelegramService: Disabled, skipping notification', { type: params.type });
      return;
    }

    const chatId = config.telegram.adminChatId;
    if (!chatId) {
      logger.warn('TelegramService: TELEGRAM_ADMIN_CHAT_ID not set, skipping', {
        type: params.type,
      });
      return;
    }

    await prisma.telegramNotification.create({
      data: {
        type: params.type,
        chatId,
        message: params.message,
        referenceId: params.referenceId,
        status: 'PENDING',
      },
    });

    void this.processPendingNotifications().catch((error) => {
      logger.error('TelegramService: Immediate flush failed', { error });
    });
  }

  static async sendMessage(chatId: string, message: string): Promise<boolean> {
    if (!bot || !running) {
      return false;
    }

    try {
      await bot.api.sendMessage(chatId, message, { parse_mode: 'HTML' });
      return true;
    } catch (error) {
      logger.error('TelegramService: sendMessage failed', { chatId, error });
      return false;
    }
  }

  static async processPendingNotifications(): Promise<number> {
    const pending = await prisma.telegramNotification.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: 10,
    });

    let processed = 0;

    for (const notification of pending) {
      try {
        const sent = await this.sendMessage(notification.chatId, notification.message);
        if (sent) {
          await prisma.telegramNotification.update({
            where: { id: notification.id },
            data: { status: 'SENT', sentAt: new Date(), error: null },
          });
        } else {
          await prisma.telegramNotification.update({
            where: { id: notification.id },
            data: {
              status: 'FAILED',
              error: running ? 'sendMessage returned false' : 'Bot not running',
            },
          });
        }
        processed++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await prisma.telegramNotification.update({
          where: { id: notification.id },
          data: { status: 'FAILED', error: errorMessage },
        });
        processed++;
      }
    }

    return processed;
  }

  static async listNotifications(params: {
    status?: TelegramNotificationStatus;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 50));
    const skip = (page - 1) * limit;
    const where = params.status ? { status: params.status } : {};

    const [notifications, total] = await Promise.all([
      prisma.telegramNotification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.telegramNotification.count({ where }),
    ]);

    return {
      notifications,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  static async retryNotification(id: string): Promise<TelegramNotificationStatus> {
    const notification = await prisma.telegramNotification.findUnique({ where: { id } });
    if (!notification) {
      throw new Error('Notification not found');
    }

    const sent = await this.sendMessage(notification.chatId, notification.message);
    if (sent) {
      await prisma.telegramNotification.update({
        where: { id },
        data: { status: 'SENT', sentAt: new Date(), error: null },
      });
      return 'SENT';
    }

    await prisma.telegramNotification.update({
      where: { id },
      data: {
        status: 'FAILED',
        error: running ? 'sendMessage returned false' : 'Bot not running',
      },
    });
    return 'FAILED';
  }

  static async shutdown(): Promise<void> {
    if (bot) {
      try {
        bot.stop();
      } catch {
        /* ignore */
      }
      bot = null;
    }
    running = false;
    starting = false;
    logger.info('TelegramService: Shut down');
  }
}

export type { TelegramNotificationStatus };
