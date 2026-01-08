import cluster from 'node:cluster';
import app from './app';
import { config } from './config';
import logger from './utils/logger';
import { startNotificationWorker } from './notification/notification.worker';

const startServer = () => {
    app.listen(config.port, () => {
        logger.info(`Server started on port ${config.port}`);

        // Start notification worker only on primary process or single process mode
        // This prevents duplicate notifications in cluster mode
        if (!cluster.isWorker || process.env.ENABLE_NOTIFICATION_WORKER === 'true') {
            startNotificationWorker();
        }
    });
};

const numCPUs = parseInt(process.env.WEB_CONCURRENCY || process.env.WORKERS || '1', 10);
const forceCluster = process.env.FORCE_CLUSTER === 'true';

if ((numCPUs > 1 || forceCluster) && cluster.isPrimary) {
    logger.info(`Master ${process.pid} is running`);
    logger.info(`Forking ${numCPUs} workers...`);

    // Start notification worker on primary process in cluster mode
    startNotificationWorker();

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
    }
    startServer();
}
