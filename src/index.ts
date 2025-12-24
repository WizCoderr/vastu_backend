import cluster from 'node:cluster';
import os from 'node:os';
import app from './app';
import { config } from './config';
import logger from './utils/logger';

const startServer = () => {
    app.listen(config.port, () => {
        logger.info(`Server started on port ${config.port}`);
    });
};


if (cluster.isPrimary) {
    const numCPUs = os.cpus().length;
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
