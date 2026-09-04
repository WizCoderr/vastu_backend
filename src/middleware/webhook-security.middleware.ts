import type { Request, Response, NextFunction } from 'express';
import { config } from '../core/config';
import { auditLogger } from '../config/logger';

function normalizeIp(ip: string | undefined): string {
  if (!ip) return '';
  return ip.replace('::ffff:', '');
}

export function webhookIpAllowlist(req: Request, res: Response, next: NextFunction) {
  const allowlist = config.security.webhookIpAllowlist;
  if (!allowlist.length) {
    return next();
  }

  const clientIp = normalizeIp(req.ip || req.socket.remoteAddress);
  const forwarded = req.headers['x-forwarded-for'];
  const forwardedIp = typeof forwarded === 'string'
    ? normalizeIp(forwarded.split(',')[0]?.trim())
    : '';

  const allowed = allowlist.some(
    (ip) => ip === clientIp || ip === forwardedIp,
  );

  if (!allowed) {
    auditLogger.warn('webhook_ip_blocked', {
      clientIp,
      forwardedIp,
      path: req.path,
    });
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }

  return next();
}

export function webhookBodySizeLimit(maxBytes: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const raw = req.body;
    const size = Buffer.isBuffer(raw)
      ? raw.length
      : typeof raw === 'string'
        ? Buffer.byteLength(raw)
        : JSON.stringify(raw ?? {}).length;

    if (size > maxBytes) {
      return res.status(413).json({ success: false, error: 'Payload too large' });
    }
    return next();
  };
}
