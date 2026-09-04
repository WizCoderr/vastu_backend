import { Request, Response, NextFunction } from 'express';
import { auditLogger } from '../config/logger';

export function auditLogMiddleware(req: Request, res: Response, next: NextFunction) {
  const sensitivePaths = ['/api/payments', '/auth'];
  const shouldAudit = sensitivePaths.some((p) => req.path.startsWith(p));

  if (!shouldAudit) {
    return next();
  }

  const start = Date.now();
  res.on('finish', () => {
    auditLogger.info('api_request', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Date.now() - start,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  });

  next();
}
