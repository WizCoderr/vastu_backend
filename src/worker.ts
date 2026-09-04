import { config as coreConfig } from './core/config';
import logger from './utils/logger';
import { startNotificationWorker } from './notification/notification.worker';
import { WhatsAppService } from './notification/whatsapp.service';
import { startPaymentWorkers, stopPaymentWorkers } from './payment/jobs/payment-jobs';

const startBackgroundServices = () => {
  startNotificationWorker();
  startPaymentWorkers();

  if (coreConfig.whatsapp.enabled) {
    WhatsAppService.initClient().catch((error) => {
      logger.error('Failed to initialize WhatsApp client', { error });
    });
  }

  if (!coreConfig.whatsapp.adminPhone) {
    logger.warn(
      'WhatsApp: WHATSAPP_ADMIN_PHONE is not set — alerts will be skipped.',
    );
  }
};

const shutdown = async (signal: string) => {
  logger.info(`Received ${signal}, shutting down worker...`);
  await stopPaymentWorkers();
  await WhatsAppService.shutdown();
  process.exit(0);
};

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

logger.info('Starting dedicated worker process', { role: coreConfig.process.role });
startBackgroundServices();
