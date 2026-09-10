import { config as coreConfig } from './core/config';
import logger from './utils/logger';
import { startNotificationWorker } from './notification/notification.worker';
import { WhatsAppService } from './notification/whatsapp.service';
import { TelegramService } from './notification/telegram.service';
import { startPaymentWorkers, stopPaymentWorkers } from './payment/jobs/payment-jobs';

const startBackgroundServices = () => {
  startNotificationWorker();
  startPaymentWorkers();

  if (coreConfig.whatsapp.enabled) {
    WhatsAppService.initClient().catch((error) => {
      logger.error('Failed to initialize WhatsApp client', { error });
    });
  }

  TelegramService.initBot().catch((error) => {
    logger.error('Failed to initialize Telegram bot', { error });
  });

  if (!coreConfig.telegram.adminChatId) {
    logger.warn(
      'Telegram: TELEGRAM_ADMIN_CHAT_ID is not set — alerts will be skipped.',
    );
  }
};

const shutdown = async (signal: string) => {
  logger.info(`Received ${signal}, shutting down worker...`);
  await stopPaymentWorkers();
  await WhatsAppService.shutdown();
  await TelegramService.shutdown();
  process.exit(0);
};

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

logger.info('Starting dedicated worker process', { role: coreConfig.process.role });
startBackgroundServices();
