import type { Response } from 'express';
import type { AuthRequest } from '../core/authMiddleware';
import { WalletReducer } from './wallet.reducer';

function errorStatus(code?: string): number {
  switch (code) {
    case 'WALLET_PASS_NOT_FOUND':
    case 'ORDER_NOT_FOUND':
      return 404;
    case 'ORDER_NOT_PAID':
      return 400;
    case 'GOOGLE_WALLET_UNAVAILABLE':
      return 503;
    default:
      return 500;
  }
}

export class WalletIntent {
  static async listPasses(req: AuthRequest, res: Response) {
    const result = await WalletReducer.listMyPasses(req.user!.userId);
    if (!result.success) {
      return res.status(errorStatus(result.error?.code)).json({
        success: false,
        error: result.error,
      });
    }
    return res.json(result);
  }

  static async getPass(req: AuthRequest, res: Response) {
    const result = await WalletReducer.getMyPass(req.user!.userId, req.params.id as string);
    if (!result.success) {
      return res.status(errorStatus(result.error?.code)).json({
        success: false,
        error: result.error,
      });
    }
    return res.json(result);
  }

  static async getPassForOrder(req: AuthRequest, res: Response) {
    const result = await WalletReducer.getPassForOrder(
      req.user!.userId,
      req.params.orderId as string,
    );
    if (!result.success) {
      return res.status(errorStatus(result.error?.code)).json({
        success: false,
        error: result.error,
      });
    }
    return res.json(result);
  }

  static async issueForOrder(req: AuthRequest, res: Response) {
    const result = await WalletReducer.issueGoogleWalletForOrder(
      req.user!.userId,
      req.params.orderId as string,
    );
    if (!result.success) {
      return res.status(errorStatus(result.error?.code)).json({
        success: false,
        error: result.error,
      });
    }
    return res.json(result);
  }

  static async refreshPass(req: AuthRequest, res: Response) {
    const result = await WalletReducer.refreshGoogleWallet(
      req.user!.userId,
      req.params.id as string,
    );
    if (!result.success) {
      return res.status(errorStatus(result.error?.code)).json({
        success: false,
        error: result.error,
      });
    }
    return res.json(result);
  }

  static async adminList(req: AuthRequest, res: Response) {
    const result = await WalletReducer.adminListPasses({
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      orderId: typeof req.query.orderId === 'string' ? req.query.orderId : undefined,
      userId: typeof req.query.userId === 'string' ? req.query.userId : undefined,
      skip: req.query.skip ? Number(req.query.skip) : 0,
      take: req.query.take ? Number(req.query.take) : 50,
    });
    return res.json(result);
  }

  static async adminUpdate(req: AuthRequest, res: Response) {
    const status = req.body?.status as 'ACTIVE' | 'INACTIVE';
    if (status !== 'ACTIVE' && status !== 'INACTIVE') {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_STATUS', message: 'status must be ACTIVE or INACTIVE' },
      });
    }
    const result = await WalletReducer.adminUpdatePassStatus(req.params.id as string, status);
    if (!result.success) {
      return res.status(errorStatus(result.error?.code)).json({
        success: false,
        error: result.error,
      });
    }
    return res.json(result);
  }

  static async adminEvents(req: AuthRequest, res: Response) {
    const result = await WalletReducer.adminListEvents(req.params.id as string);
    if (!result.success) {
      return res.status(errorStatus(result.error?.code)).json({
        success: false,
        error: result.error,
      });
    }
    return res.json(result);
  }

  static async adminReissue(req: AuthRequest, res: Response) {
    const result = await WalletReducer.adminReissueSaveUrl(req.params.id as string);
    if (!result.success) {
      return res.status(errorStatus(result.error?.code)).json({
        success: false,
        error: result.error,
      });
    }
    return res.json(result);
  }
}
