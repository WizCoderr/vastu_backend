import winston from 'winston';
import path from 'path';
import { mkdirSync, existsSync } from 'fs';

const LOG_DIR = path.join(process.cwd(), 'logs');
if (!existsSync(LOG_DIR)) {
  mkdirSync(LOG_DIR, { recursive: true });
}

function createLogger(filename: string) {
  return winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json(),
    ),
    transports: [
      new winston.transports.File({ filename: path.join(LOG_DIR, filename) }),
      ...(process.env.NODE_ENV !== 'production'
        ? [new winston.transports.Console({ format: winston.format.simple() })]
        : []),
    ],
  });
}

export const paymentLogger = createLogger('payment.log');
export const auditLogger = createLogger('audit.log');
export const errorLogger = createLogger('error.log');
