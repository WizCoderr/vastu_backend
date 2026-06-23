import cluster from 'node:cluster';
import app from './app';
import { config } from './config';
import logger from './utils/logger';
import { startNotificationWorker } from './notification/notification.worker';
import { WhatsAppService } from './notification/whatsapp.service';

const startBackgroundServices = () => {
    startNotificationWorker();
    WhatsAppService.initClient().catch((error) => {
        logger.error('Failed to initialize WhatsApp client', { error });
    });
};

const startServer = () => {
    app.listen(config.port, () => {
        logger.info(`Server started on port ${config.port}`);
    });
};

const numCPUs = parseInt(process.env.WEB_CONCURRENCY || process.env.WORKERS || '1', 10);
const forceCluster = process.env.FORCE_CLUSTER === 'true';

if ((numCPUs > 1 || forceCluster) && cluster.isPrimary) {
    logger.info(`Master ${process.pid} is running`);
    logger.info(`Forking ${numCPUs} workers...`);

    // Only start notification worker once on the primary process
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
        // In single-process mode, start notification worker here (no cluster primary)
        startBackgroundServices();
    }
    startServer();
}
