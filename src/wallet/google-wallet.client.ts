import jwt from 'jsonwebtoken';
import { GoogleAuth, JWT } from 'google-auth-library';
import { config } from '../core/config';
import logger from '../utils/logger';
import type {
  GoogleWalletService,
  SaveToWalletResult,
  WalletPassClassInfo,
  WalletPassObjectInfo,
  WalletPassPayload,
} from './google-wallet.types';

const WALLET_SCOPE = 'https://www.googleapis.com/auth/wallet_object.issuer';
const WALLET_API = 'https://walletobjects.googleapis.com/walletobjects/v1';

function formatInr(amount: number): string {
  return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function buildGenericObjectBody(payload: WalletPassPayload, classId: string, objectId: string, state: string) {
  const itemSummary = payload.items
    .slice(0, 5)
    .map((i) => `${i.quantity}× ${i.name}`)
    .join(', ');

  return {
    id: objectId,
    classId,
    state,
    cardTitle: {
      defaultValue: {
        language: 'en-US',
        value: 'Vastu Arun Sharma',
      },
    },
    header: {
      defaultValue: {
        language: 'en-US',
        value: `Order ${payload.orderShortId}`,
      },
    },
    subheader: {
      defaultValue: {
        language: 'en-US',
        value: 'Purchase receipt',
      },
    },
    hexBackgroundColor: config.googleWallet.hexBackgroundColor,
    logo: {
      sourceUri: { uri: config.googleWallet.logoUri },
      contentDescription: {
        defaultValue: { language: 'en-US', value: 'Vastu Arun Sharma logo' },
      },
    },
    barcode: {
      type: 'QR_CODE',
      value: payload.barcodeValue,
      alternateText: payload.orderShortId,
    },
    textModulesData: [
      {
        id: 'total',
        header: 'Total paid',
        body: formatInr(payload.totalAmount),
      },
      {
        id: 'items',
        header: 'Items',
        body: itemSummary || `${payload.itemCount} item(s)`,
      },
      {
        id: 'shipped_to',
        header: 'Ship to',
        body: payload.shippingCity || '—',
      },
      {
        id: 'paid_at',
        header: 'Paid on',
        body: payload.paidAt,
      },
    ],
  };
}

export class GoogleWalletClient implements GoogleWalletService {
  private authClient: JWT | null = null;
  private classEnsured = false;

  isConfigured(): boolean {
    return config.googleWallet.configured;
  }

  private classId(): string {
    const { issuerId, classSuffix } = config.googleWallet;
    return `${issuerId}.${classSuffix}`;
  }

  objectIdForOrder(orderId: string): string {
    return `${config.googleWallet.issuerId}.order_${orderId.replace(/-/g, '')}`;
  }

  private async getAuthClient(): Promise<JWT> {
    if (this.authClient) return this.authClient;

    if (!this.isConfigured()) {
      throw new Error('GOOGLE_WALLET_UNAVAILABLE');
    }

    const auth = new GoogleAuth({
      credentials: {
        client_email: config.googleWallet.serviceAccountEmail,
        private_key: config.googleWallet.privateKey,
      },
      scopes: [WALLET_SCOPE],
    });

    this.authClient = (await auth.getClient()) as JWT;
    return this.authClient;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<{ status: number; data: T | null }> {
    const client = await this.getAuthClient();
    const url = `${WALLET_API}${path}`;
    const res = await client.request<T>({
      url,
      method: method as 'GET' | 'POST' | 'PUT' | 'PATCH',
      data: body,
      headers: { 'Content-Type': 'application/json' },
    });
    return { status: res.status ?? 200, data: res.data ?? null };
  }

  async ensurePassClass(): Promise<WalletPassClassInfo> {
    const classId = this.classId();
    if (this.classEnsured) return { classId };

    try {
      await this.request('GET', `/genericClass/${encodeURIComponent(classId)}`);
      this.classEnsured = true;
      return { classId };
    } catch (err: any) {
      const status = err?.response?.status ?? err?.code;
      if (status !== 404) {
        logger.error('GoogleWalletClient.ensurePassClass: get failed', {
          status,
          message: err?.message,
        });
        throw err;
      }
    }

    const body = {
      id: classId,
      classTemplateInfo: {
        cardTemplateOverride: {
          cardRowTemplateInfos: [
            {
              twoItems: {
                startItem: {
                  firstValue: {
                    fields: [{ fieldPath: "object.textModulesData['total']" }],
                  },
                },
                endItem: {
                  firstValue: {
                    fields: [{ fieldPath: "object.textModulesData['items']" }],
                  },
                },
              },
            },
          ],
        },
      },
    };

    await this.request('POST', '/genericClass', body);
    this.classEnsured = true;
    logger.info('GoogleWalletClient.ensurePassClass: created class', { classId });
    return { classId };
  }

  async createOrGetPassObject(payload: WalletPassPayload): Promise<WalletPassObjectInfo> {
    const { classId } = await this.ensurePassClass();
    const objectId = this.objectIdForOrder(payload.orderId);

    try {
      const existing = await this.request<any>('GET', `/genericObject/${encodeURIComponent(objectId)}`);
      if (existing.data) {
        return {
          objectId,
          classId,
          state: (existing.data.state as WalletPassObjectInfo['state']) || 'ACTIVE',
        };
      }
    } catch (err: any) {
      const status = err?.response?.status ?? err?.code;
      if (status !== 404) throw err;
    }

    const body = buildGenericObjectBody(payload, classId, objectId, 'ACTIVE');
    await this.request('POST', '/genericObject', body);
    logger.info('GoogleWalletClient.createOrGetPassObject: created object', {
      objectId,
      orderId: payload.orderId,
    });

    return { objectId, classId, state: 'ACTIVE' };
  }

  async updatePassObject(
    payload: WalletPassPayload,
    state: WalletPassObjectInfo['state'] = 'ACTIVE',
  ): Promise<WalletPassObjectInfo> {
    const { classId } = await this.ensurePassClass();
    const objectId = this.objectIdForOrder(payload.orderId);
    const body = buildGenericObjectBody(payload, classId, objectId, state);
    await this.request('PUT', `/genericObject/${encodeURIComponent(objectId)}`, body);
    return { objectId, classId, state };
  }

  async getPassObject(objectId: string): Promise<WalletPassObjectInfo | null> {
    try {
      const res = await this.request<any>('GET', `/genericObject/${encodeURIComponent(objectId)}`);
      if (!res.data) return null;
      return {
        objectId: res.data.id,
        classId: res.data.classId,
        state: res.data.state || 'ACTIVE',
      };
    } catch (err: any) {
      const status = err?.response?.status ?? err?.code;
      if (status === 404) return null;
      throw err;
    }
  }

  async deactivatePassObject(objectId: string): Promise<WalletPassObjectInfo> {
    const existing = await this.getPassObject(objectId);
    if (!existing) {
      throw new Error('WALLET_PASS_NOT_FOUND');
    }
    await this.request('PATCH', `/genericObject/${encodeURIComponent(objectId)}`, {
      state: 'INACTIVE',
    });
    return { ...existing, state: 'INACTIVE' };
  }

  async generateSaveToWalletJwt(objectId: string, classId: string): Promise<SaveToWalletResult> {
    if (!this.isConfigured()) {
      throw new Error('GOOGLE_WALLET_UNAVAILABLE');
    }

    const claims = {
      iss: config.googleWallet.serviceAccountEmail,
      aud: 'google',
      typ: 'savetowallet',
      iat: Math.floor(Date.now() / 1000),
      origins: config.googleWallet.origins,
      payload: {
        genericObjects: [
          {
            id: objectId,
            classId,
          },
        ],
      },
    };

    const saveJwt = jwt.sign(claims, config.googleWallet.privateKey!, {
      algorithm: 'RS256',
    });

    return {
      saveJwt,
      saveUrl: `https://pay.google.com/gp/v/save/${saveJwt}`,
      objectId,
      classId,
    };
  }
}

/** In-memory mock for tests and local runs without Google credentials. */
export class MockGoogleWalletService implements GoogleWalletService {
  private objects = new Map<string, WalletPassObjectInfo>();
  private classId = 'mock-issuer.vastu_order_receipt';

  isConfigured(): boolean {
    return true;
  }

  async ensurePassClass(): Promise<WalletPassClassInfo> {
    return { classId: this.classId };
  }

  private objectId(orderId: string) {
    return `mock-issuer.order_${orderId.replace(/-/g, '')}`;
  }

  async createOrGetPassObject(payload: WalletPassPayload): Promise<WalletPassObjectInfo> {
    const objectId = this.objectId(payload.orderId);
    const existing = this.objects.get(objectId);
    if (existing) return existing;
    const info: WalletPassObjectInfo = { objectId, classId: this.classId, state: 'ACTIVE' };
    this.objects.set(objectId, info);
    return info;
  }

  async updatePassObject(
    payload: WalletPassPayload,
    state: WalletPassObjectInfo['state'] = 'ACTIVE',
  ): Promise<WalletPassObjectInfo> {
    const objectId = this.objectId(payload.orderId);
    const info: WalletPassObjectInfo = { objectId, classId: this.classId, state };
    this.objects.set(objectId, info);
    return info;
  }

  async getPassObject(objectId: string): Promise<WalletPassObjectInfo | null> {
    return this.objects.get(objectId) ?? null;
  }

  async deactivatePassObject(objectId: string): Promise<WalletPassObjectInfo> {
    const existing = this.objects.get(objectId);
    if (!existing) throw new Error('WALLET_PASS_NOT_FOUND');
    const updated = { ...existing, state: 'INACTIVE' as const };
    this.objects.set(objectId, updated);
    return updated;
  }

  async generateSaveToWalletJwt(objectId: string, classId: string): Promise<SaveToWalletResult> {
    const saveJwt = `mock.${Buffer.from(JSON.stringify({ objectId, classId })).toString('base64url')}.sig`;
    return {
      saveJwt,
      saveUrl: `https://pay.google.com/gp/v/save/${saveJwt}`,
      objectId,
      classId,
    };
  }
}

let singleton: GoogleWalletService | null = null;

export function getGoogleWalletService(): GoogleWalletService {
  if (singleton) return singleton;
  if (process.env.GOOGLE_WALLET_USE_MOCK === 'true' || config.env === 'test') {
    singleton = new MockGoogleWalletService();
  } else if (config.googleWallet.configured) {
    singleton = new GoogleWalletClient();
  } else {
    singleton = new GoogleWalletClient();
  }
  return singleton;
}

export function setGoogleWalletServiceForTests(service: GoogleWalletService | null) {
  singleton = service;
}
