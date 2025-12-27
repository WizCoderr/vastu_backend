import cluster from 'node:cluster';
import app from './app';
import { config } from './config';
import logger from './utils/logger';

const startServer = () => {
    app.listen(config.port, () => {
        logger.info(`Server started on port ${config.port}`);
    });
};

if (cluster.isPrimary) {
    // Default to 1 worker if not specified, to avoid OOM on small instances
    // Use WEB_CONCURRENCY or WORKERS env var to override
    const numCPUs = parseInt(process.env.WEB_CONCURRENCY || process.env.WORKERS || '1', 10);

    logger.info(`Master ${process.pid} is running`);
    logger.info(`Forking ${numCPUs} workers...`);

    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }

    cluster.on('exit', (worker, code, signal) => {
        logger.warn(`Worker ${worker.process.pid} died. Forking a new one...`);
        cluster.fork();
    });
} else {
    startServer();
}
