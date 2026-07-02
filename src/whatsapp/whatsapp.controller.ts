import { RequestHandler } from 'express';
import { z } from 'zod';
import { WhatsAppService } from '../notification/whatsapp.service';
import { config } from '../core/config';

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

export const reconnectWhatsApp: RequestHandler = async (_req, res, next) => {
  try {
    void WhatsAppService.reconnect();
    res.status(200).json({
      success: true,
      message: 'Reconnecting WhatsApp client — check server logs for QR code',
    });
  } catch (error) {
    next(error);
  }
};

export const sendTestNotification: RequestHandler = async (_req, res, next) => {
  try {
    const adminPhone = config.whatsapp.adminPhone;
    if (!adminPhone) {
      res.status(400).json({
        success: false,
        error: 'WHATSAPP_ADMIN_PHONE is not set in environment — add it to .env and restart the server',
      });
      return;
    }
    await WhatsAppService.queueNotification({
      type: 'NEW_ORDER',
      recipientPhone: adminPhone,
      message: '✅ Test from VastuArunSharma admin panel — WhatsApp notifications are active!',
    });
    res.status(200).json({ success: true, message: 'Test notification queued — you should receive it shortly' });
  } catch (error) {
    next(error);
  }
};
