import { WhatsAppNotificationStatus, WhatsAppNotificationType } from '../generated/prisma/client';
import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { prisma } from '../core/prisma';
import { config } from '../core/config';
import logger from '../utils/logger';

export type WhatsAppConnectionState = 'disconnected' | 'qr_pending' | 'connected';

let client: import('whatsapp-web.js').Client | null = null;
let connectionState: WhatsAppConnectionState = 'disconnected';
let currentQr: string | null = null;
let connectedPhone: string | null = null;
let initializing = false;
let lastInitError: string | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempt = 0;

const MAX_RECONNECT_DELAY_MS = 5 * 60 * 1000;
const CHROMIUM_CANDIDATES = [
  config.whatsapp.chromiumPath,
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome-stable',
];

const resolveChromiumExecutable = (): string | undefined => {
  for (const candidate of CHROMIUM_CANDIDATES) {
    if (candidate && existsSync(candidate)) {
      return candidate;
    }
  }
  return config.whatsapp.chromiumPath || undefined;
};

const PUPPETEER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--no-first-run',
  '--no-zygote',
  '--single-process',
];

const CHROMIUM_LOCK_FILES = ['SingletonLock', 'SingletonSocket', 'SingletonCookie'];

const clearStaleChromiumProfileLocks = (dataPath: string): void => {
  const profileDir = join(dataPath, 'session');
  for (const file of CHROMIUM_LOCK_FILES) {
    const lockPath = join(profileDir, file);
    if (!existsSync(lockPath)) continue;
    try {
      unlinkSync(lockPath);
      logger.warn('WhatsAppService: Removed stale Chromium lock', { lockPath });
    } catch (error) {
      logger.warn('WhatsAppService: Could not remove Chromium lock', { lockPath, error });
    }
  }
};

const clearReconnectTimer = () => {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
};

const scheduleReconnect = (reason: string) => {
  if (!config.whatsapp.enabled) return;
  clearReconnectTimer();

  const delay = Math.min(1000 * 2 ** reconnectAttempt, MAX_RECONNECT_DELAY_MS);
  reconnectAttempt += 1;

  logger.info('WhatsAppService: Scheduling reconnect', { reason, delayMs: delay, attempt: reconnectAttempt });

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void WhatsAppService.initClient().catch((error) => {
      logger.error('WhatsAppService: Auto-reconnect failed', { error });
    });
  }, delay);
};

export const normalizePhone = (phone: string): string => {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `91${digits}`;
  }
  return digits;
};

export const buildWaMeUrl = (phone: string, message: string): string => {
  const normalized = normalizePhone(phone);
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
};

export class WhatsAppService {
  static isConnected(): boolean {
    return connectionState === 'connected' && client !== null;
  }

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

  static async getDetailedStatus() {
    const [pendingCount, fallbackCount] = await Promise.all([
      prisma.whatsAppNotification.count({ where: { status: 'PENDING' } }),
      prisma.whatsAppNotification.count({ where: { status: 'FALLBACK_LINK' } }),
    ]);

    const connected = connectionState === 'connected';
    const enabled = config.whatsapp.enabled;
    const adminPhoneConfigured = !!config.whatsapp.adminPhone;

    let message: string;
    if (!enabled) {
      message = 'WhatsApp is disabled (WHATSAPP_ENABLED=false)';
    } else if (connected) {
      message = 'WhatsApp session active — auto-send enabled';
    } else if (connectionState === 'qr_pending') {
      message = 'Scan QR at GET /api/admin/whatsapp/qr to connect';
    } else {
      message = 'Scan QR at GET /api/admin/whatsapp/qr to enable auto-send';
    }

    if (!adminPhoneConfigured) {
      message = 'Set WHATSAPP_ADMIN_PHONE in environment for admin alerts';
    }

    return {
      connected,
      state: connectionState,
      phone: connectedPhone,
      enabled,
      adminPhoneConfigured,
      setupRequired: enabled && !connected,
      message,
      pendingCount,
      fallbackCount,
      lastInitError,
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
    lastInitError = null;
    clearStaleChromiumProfileLocks(config.whatsapp.sessionPath);

    try {
      const { Client, LocalAuth } = await import('whatsapp-web.js');

      const chromiumPath = resolveChromiumExecutable();

      const puppeteerConfig: Record<string, unknown> = {
        headless: true,
        args: PUPPETEER_ARGS,
      };

      if (chromiumPath) {
        puppeteerConfig.executablePath = chromiumPath;
        logger.info('WhatsAppService: Using Chromium executable', { chromiumPath });
      } else {
        logger.warn('WhatsAppService: No system Chromium found — Puppeteer may use bundled Chrome');
      }

      client = new Client({
        authStrategy: new LocalAuth({ dataPath: config.whatsapp.sessionPath }),
        puppeteer: puppeteerConfig,
      });

      client.on('qr', async (qr: string) => {
        currentQr = qr;
        connectionState = 'qr_pending';
        lastInitError = null;
        reconnectAttempt = 0;

        try {
          const QRCode = await import('qrcode');
          const terminalQr = await (QRCode as any).toString(qr, { type: 'terminal', small: true });
          console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.log('  WhatsApp QR — Scan with WhatsApp to connect');
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
          console.log(terminalQr);
          console.log('  Or visit GET /api/admin/whatsapp/qr for the image');
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        } catch {
          logger.info('WhatsAppService: QR code received — scan via /api/admin/whatsapp/qr');
        }
      });

      client.on('authenticated', () => {
        logger.info('WhatsAppService: Authenticated');
      });

      client.on('ready', () => {
        connectionState = 'connected';
        currentQr = null;
        lastInitError = null;
        connectedPhone = client?.info?.wid?.user ?? null;
        reconnectAttempt = 0;
        clearReconnectTimer();
        logger.info('WhatsAppService: Client ready', { phone: connectedPhone });
        void this.processPendingNotifications().catch((error) => {
          logger.error('WhatsAppService: Failed to flush pending notifications on ready', { error });
        });
      });

      client.on('disconnected', (reason: string) => {
        connectionState = 'disconnected';
        connectedPhone = null;
        currentQr = null;
        client = null;
        initializing = false;
        logger.warn('WhatsAppService: Disconnected', { reason });
        scheduleReconnect(reason);
      });

      client.on('auth_failure', (msg: string) => {
        connectionState = 'disconnected';
        lastInitError = `Auth failure: ${msg}`;
        client = null;
        initializing = false;
        logger.error('WhatsAppService: Auth failure', { msg });
        scheduleReconnect('auth_failure');
      });

      await client.initialize();
    } catch (error) {
      connectionState = 'disconnected';
      client = null;
      const msg = error instanceof Error ? error.message : String(error);
      lastInitError = msg;
      logger.error('WhatsAppService: Failed to initialize client', { error: msg });
      scheduleReconnect('init_failure');
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

    void this.processPendingNotifications().catch((error) => {
      logger.error('WhatsAppService: Immediate notification processing failed', { error });
    });
  }

  static async sendMessage(phone: string, message: string): Promise<boolean> {
    if (connectionState !== 'connected' || !client) {
      return false;
    }

    try {
      const normalized = normalizePhone(phone);
      const numberId = await client.getNumberId(normalized);

      if (!numberId) {
        logger.warn('WhatsAppService: Number not registered on WhatsApp', { phone: normalized });
        return false;
      }

      await client.sendMessage(numberId._serialized, message);
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

  static async reconnect(): Promise<void> {
    clearReconnectTimer();
    reconnectAttempt = 0;

    if (client) {
      try { await client.destroy(); } catch { /* ignore */ }
      client = null;
    }
    connectionState = 'disconnected';
    currentQr = null;
    connectedPhone = null;
    initializing = false;
    lastInitError = null;
    logger.info('WhatsAppService: Reconnecting — watch logs for QR code');
    await this.initClient();
  }

  static async shutdown(): Promise<void> {
    clearReconnectTimer();
    if (client) {
      try { await client.destroy(); } catch { /* ignore */ }
      client = null;
    }
    connectionState = 'disconnected';
    initializing = false;
  }
}
