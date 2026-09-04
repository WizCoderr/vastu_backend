export type WalletPassLineItem = {
  name: string;
  quantity: number;
  price: number;
};

export type WalletPassPayload = {
  orderId: string;
  orderShortId: string;
  userName: string;
  userEmail: string;
  totalAmount: number;
  currency: string;
  itemCount: number;
  items: WalletPassLineItem[];
  shippingCity: string;
  paidAt: string;
  barcodeValue: string;
};

export type WalletPassClassInfo = {
  classId: string;
};

export type WalletPassObjectInfo = {
  objectId: string;
  classId: string;
  state: 'ACTIVE' | 'INACTIVE' | 'EXPIRED' | 'COMPLETED';
};

export type SaveToWalletResult = {
  saveJwt: string;
  saveUrl: string;
  objectId: string;
  classId: string;
};

export interface GoogleWalletService {
  isConfigured(): boolean;
  ensurePassClass(): Promise<WalletPassClassInfo>;
  createOrGetPassObject(payload: WalletPassPayload): Promise<WalletPassObjectInfo>;
  updatePassObject(payload: WalletPassPayload, state?: WalletPassObjectInfo['state']): Promise<WalletPassObjectInfo>;
  getPassObject(objectId: string): Promise<WalletPassObjectInfo | null>;
  deactivatePassObject(objectId: string): Promise<WalletPassObjectInfo>;
  generateSaveToWalletJwt(objectId: string, classId: string): Promise<SaveToWalletResult>;
}
