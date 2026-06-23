import { WhatsAppNotificationStatus, WhatsAppNotificationType } from '../generated/prisma/client';
import { prisma } from '../core/prisma';
import { config } from '../core/config';
import logger from '../utils/logger';

export type WhatsAppConnectionState = 'disconnected' | 'qr_pending' | 'connected';

let client: import('whatsapp-web.js').Client | null = null;
let connectionState: WhatsAppConnectionState = 'disconnected';
let currentQr: string | null = null;
let connectedPhone: string | null = null;
let initializing = false;

export const normalizePhone = (phone: string): string => phone.replace(/\D/g, '');

export const buildWaMeUrl = (phone: string, message: string): string => {
  const normalized = normalizePhone(phone);
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
};

export class WhatsAppService {
  static getStatus(): {
    connected: boolean;
    state: WhatsAppConnectionState;
    phone: string | null;
    enabled: boolean;
  } {
    return {
      connected: connectionState === 'connected',
      state: connectionState,
      phone: connectedPhone,
      enabled: config.whatsapp.enabled,
    };
  }

  static getCurrentQr(): string | null {
    return currentQr;
  }

  static async initClient(): Promise<void> {
    if (!config.whatsapp.enabled) {
      logger.info('WhatsAppService: Disabled via WHATSAPP_ENABLED=false');
      return;
    }

    if (client || initializing) {
      return;
    }

    initializing = true;

    try {
      const { Client, LocalAuth } = await import('whatsapp-web.js');

      client = new Client({
        authStrategy: new LocalAuth({ dataPath: config.whatsapp.sessionPath }),
        puppeteer: {
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        },
      });

      client.on('qr', (qr: string) => {
        currentQr = qr;
        connectionState = 'qr_pending';
        logger.info('WhatsAppService: QR code received — scan via /api/admin/whatsapp/qr');
      });

      client.on('authenticated', () => {
        logger.info('WhatsAppService: Authenticated');
      });

      client.on('ready', () => {
        connectionState = 'connected';
        currentQr = null;
        connectedPhone = client?.info?.wid?.user ?? null;
        logger.info('WhatsAppService: Client ready', { phone: connectedPhone });
      });

      client.on('disconnected', (reason: string) => {
        connectionState = 'disconnected';
        connectedPhone = null;
        currentQr = null;
        client = null;
        initializing = false;
        logger.warn('WhatsAppService: Disconnected', { reason });
      });

      client.on('auth_failure', (msg: string) => {
        connectionState = 'disconnected';
        logger.error('WhatsAppService: Auth failure', { msg });
      });

      await client.initialize();
    } catch (error) {
      connectionState = 'disconnected';
      client = null;
      logger.error('WhatsAppService: Failed to initialize client', { error });
    } finally {
      initializing = false;
    }
  }

  static async queueNotification(params: {
    type: WhatsAppNotificationType;
    recipientPhone: string;
    message: string;
    referenceId?: string;
  }): Promise<void> {
    if (!params.recipientPhone) {
      logger.warn('WhatsAppService: Missing recipient phone, skipping notification', { type: params.type });
      return;
    }

    await prisma.whatsAppNotification.create({
      data: {
        type: params.type,
        recipientPhone: normalizePhone(params.recipientPhone),
        message: params.message,
        referenceId: params.referenceId,
        status: 'PENDING',
      },
    });
  }

  static async sendMessage(phone: string, message: string): Promise<boolean> {
    if (connectionState !== 'connected' || !client) {
      return false;
    }

    try {
      const chatId = `${normalizePhone(phone)}@c.us`;
      await client.sendMessage(chatId, message);
      return true;
    } catch (error) {
      logger.error('WhatsAppService: sendMessage failed', { phone, error });
      return false;
    }
  }

  static async processPendingNotifications(): Promise<number> {
    const pending = await prisma.whatsAppNotification.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: 10,
    });

    let processed = 0;

    for (const notification of pending) {
      try {
        const sent = await this.sendMessage(notification.recipientPhone, notification.message);

        if (sent) {
          await prisma.whatsAppNotification.update({
            where: { id: notification.id },
            data: { status: 'SENT', sentAt: new Date(), error: null },
          });
        } else {
          const waMeUrl = buildWaMeUrl(notification.recipientPhone, notification.message);
          await prisma.whatsAppNotification.update({
            where: { id: notification.id },
            data: { status: 'FALLBACK_LINK', waMeUrl },
          });
        }

        processed++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const waMeUrl = buildWaMeUrl(notification.recipientPhone, notification.message);
        await prisma.whatsAppNotification.update({
          where: { id: notification.id },
          data: {
            status: 'FALLBACK_LINK',
            waMeUrl,
            error: errorMessage,
          },
        });
        processed++;
      }
    }

    return processed;
  }

  static async getPendingFallbackNotifications() {
    return prisma.whatsAppNotification.findMany({
      where: { status: 'FALLBACK_LINK' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  static async retryNotification(id: string): Promise<WhatsAppNotificationStatus> {
    const notification = await prisma.whatsAppNotification.findUnique({ where: { id } });
    if (!notification) {
      throw new Error('Notification not found');
    }

    const sent = await this.sendMessage(notification.recipientPhone, notification.message);

    if (sent) {
      await prisma.whatsAppNotification.update({
        where: { id },
        data: { status: 'SENT', sentAt: new Date(), waMeUrl: null, error: null },
      });
      return 'SENT';
    }

    const waMeUrl = buildWaMeUrl(notification.recipientPhone, notification.message);
    await prisma.whatsAppNotification.update({
      where: { id },
      data: { status: 'FALLBACK_LINK', waMeUrl },
    });
    return 'FALLBACK_LINK';
  }

  static async getQrDataUrl(): Promise<{ qr: string | null; state: WhatsAppConnectionState }> {
    if (connectionState === 'connected') {
      return { qr: null, state: connectionState };
    }

    if (!currentQr) {
      return { qr: null, state: connectionState };
    }

    const QRCode = await import('qrcode');
    const dataUrl = await QRCode.toDataURL(currentQr);
    return { qr: dataUrl, state: connectionState };
  }
}
