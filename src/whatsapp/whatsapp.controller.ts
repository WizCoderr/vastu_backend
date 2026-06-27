import { RequestHandler } from 'express';
import { z } from 'zod';
import { WhatsAppService } from '../notification/whatsapp.service';

const notificationIdSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
});

export const getWhatsAppStatus: RequestHandler = async (_req, res, next) => {
  try {
    res.status(200).json({ success: true, data: await WhatsAppService.getDetailedStatus() });
  } catch (error) {
    next(error);
  }
};

export const getWhatsAppQr: RequestHandler = async (_req, res, next) => {
  try {
    const data = await WhatsAppService.getQrDataUrl();
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const getPendingWhatsAppNotifications: RequestHandler = async (_req, res, next) => {
  try {
    const notifications = await WhatsAppService.getPendingFallbackNotifications();
    res.status(200).json({ success: true, data: notifications });
  } catch (error) {
    next(error);
  }
};

export const retryWhatsAppNotification: RequestHandler = async (req, res, next) => {
  try {
    const { id } = notificationIdSchema.parse(req).params;
    const status = await WhatsAppService.retryNotification(id);
    res.status(200).json({ success: true, data: { status } });
  } catch (error) {
    next(error);
  }
};
