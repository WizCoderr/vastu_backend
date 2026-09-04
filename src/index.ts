import cluster from 'node:cluster';
import app from './app';
import { config } from './config';
import { config as coreConfig } from './core/config';
import logger from './utils/logger';
import { startNotificationWorker } from './notification/notification.worker';
import { WhatsAppService } from './notification/whatsapp.service';
import { startPaymentWorkers, stopPaymentWorkers, shouldRunPaymentWorkers } from './payment/jobs/payment-jobs';

const startBackgroundServices = () => {
    if (coreConfig.process.role === 'api') {
        if (shouldRunPaymentWorkers()) {
            startPaymentWorkers();
        }
        return;
    }

    startNotificationWorker();
    startPaymentWorkers();

    WhatsAppService.initClient().catch((error) => {
        logger.error('Failed to initialize WhatsApp client', { error });
    });

    if (!coreConfig.whatsapp.adminPhone) {
        logger.warn(
            'WhatsApp: WHATSAPP_ADMIN_PHONE is not set — new order and low stock alerts will be silently skipped. ' +
            'Add WHATSAPP_ADMIN_PHONE=91XXXXXXXXXX to your .env and restart to activate notifications.',
        );
    }
};

const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down...`);
    await stopPaymentWorkers();
    await WhatsAppService.shutdown();
    process.exit(0);
};

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

const startServer = () => {
    app.listen(config.port, () => {
        logger.info(`Server started on port ${config.port}`, {
            processRole: coreConfig.process.role,
            paymentWorkers: shouldRunPaymentWorkers(),
        });
    });
};

if (coreConfig.process.role === 'worker') {
    logger.error('PROCESS_ROLE=worker should use src/worker.ts entrypoint');
    process.exit(1);
}

const configuredWorkers = parseInt(process.env.WEB_CONCURRENCY || process.env.WORKERS || '1', 10);
const forceCluster = process.env.FORCE_CLUSTER === 'true';

const numCPUs =
    coreConfig.whatsapp.enabled && configuredWorkers > 1
        ? (() => {
              logger.warn(
                  `WhatsApp requires single process; ignoring WORKERS=${configuredWorkers}. Set WORKERS=1 when WHATSAPP_ENABLED=true.`,
              );
              return 1;
          })()
        : configuredWorkers;

if ((numCPUs > 1 || forceCluster) && cluster.isPrimary) {
    logger.info(`Master ${process.pid} is running`);
    logger.info(`Forking ${numCPUs} workers...`);

    startBackgroundServices();

    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }

    cluster.on('exit', (worker, code, signal) => {
        logger.warn(`Worker ${worker.process.pid} died. Forking a new one...`);
        cluster.fork();
    });
} else {
    if (numCPUs === 1 && !forceCluster) {
        logger.info('Running in single process mode (optimized for 1 vCPU)');
        startBackgroundServices();
    }
    startServer();
}
