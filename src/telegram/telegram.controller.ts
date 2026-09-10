import { RequestHandler } from 'express';
import { z } from 'zod';
import { TelegramService } from '../notification/telegram.service';
import { config } from '../core/config';
import { TelegramNotificationStatus } from '../generated/prisma/client';

const listQuerySchema = z.object({
  query: z.object({
    status: z.nativeEnum(TelegramNotificationStatus).optional(),
    page: z.string().regex(/^\d+$/).optional().transform(Number),
    limit: z.string().regex(/^\d+$/).optional().transform(Number),
  }),
});

const notificationIdSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
});

export const getTelegramStatus: RequestHandler = async (_req, res, next) => {
  try {
    res.status(200).json({ success: true, data: await TelegramService.getDetailedStatus() });
  } catch (error) {
    next(error);
  }
};

export const listTelegramNotifications: RequestHandler = async (req, res, next) => {
  try {
    const query = listQuerySchema.parse(req).query;
    const result = await TelegramService.listNotifications({
      status: query.status,
      page: query.page || 1,
      limit: query.limit || 50,
    });
    res.status(200).json({ success: true, data: result.notifications, meta: result.meta });
  } catch (error) {
    next(error);
  }
};

export const retryTelegramNotification: RequestHandler = async (req, res, next) => {
  try {
    const { id } = notificationIdSchema.parse(req).params;
    const status = await TelegramService.retryNotification(id);
    res.status(200).json({ success: true, data: { status } });
  } catch (error) {
    next(error);
  }
};

export const sendTestTelegramNotification: RequestHandler = async (_req, res, next) => {
  try {
    if (!config.telegram.enabled) {
      res.status(400).json({
        success: false,
        error: 'Telegram is disabled — set TELEGRAM_BOT_TOKEN and TELEGRAM_ENABLED=true',
      });
      return;
    }
    if (!config.telegram.adminChatId) {
      res.status(400).json({
        success: false,
        error:
          'TELEGRAM_ADMIN_CHAT_ID is not set — send /start to the bot, copy your chat ID into .env, and restart',
      });
      return;
    }

    await TelegramService.queueAdminNotification({
      type: 'NEW_ORDER',
      message:
        '✅ <b>Test from VastuArunSharma</b>\nTelegram admin notifications are active!',
    });

    res.status(200).json({
      success: true,
      message: 'Test notification queued — you should receive it shortly',
    });
  } catch (error) {
    next(error);
  }
};
