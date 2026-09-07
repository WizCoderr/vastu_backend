import crypto from "crypto";
import { config } from "./config";
import logger from "../utils/logger";

export type PayuUdfKind = "COURSE" | "PRODUCT";
export type PayuChannel = "web" | "app";

export type PayuPaymentParams = {
  key: string;
  txnid: string;
  amount: string;
  productinfo: string;
  firstname: string;
  email: string;
  phone: string;
  surl: string;
  furl: string;
  hash: string;
  paymentUrl: string;
  environment: "0" | "1";
  udf1: PayuChannel;
  udf2: PayuUdfKind;
  udf3: string;
  udf4: string;
  udf5: string;
};

export type PayuResponsePayload = Record<string, string | undefined>;

const sha512 = (value: string): string =>
  crypto.createHash("sha512").update(value).digest("hex").toLowerCase();

const timingSafeEqualHex = (a: string, b: string): boolean => {
  try {
    const bufA = Buffer.from(a.toLowerCase());
    const bufB = Buffer.from(b.toLowerCase());
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
};

/** PayU amounts are rupees as a 2-decimal string — must match hash byte-for-byte. */
export const formatPayuAmount = (amount: number): string => {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("Invalid payment amount");
  }
  return amount.toFixed(2);
};

/**
 * txnid must be ≤ 25 chars and alphanumeric.
 * prefix examples: crs, inst, ord
 */
export const generateTxnId = (prefix: string): string => {
  const cleanPrefix = prefix.replace(/[^a-zA-Z0-9]/g, "").slice(0, 4) || "txn";
  const stamp = Date.now().toString(36);
  const rand = crypto.randomBytes(4).toString("hex");
  return `${cleanPrefix}${stamp}${rand}`.slice(0, 25);
};

export const getPayuMerchantKey = (): string => {
  const key = config.payu.merchantKey;
  if (!key) {
    throw new Error(
      `PayU ${config.payu.useTest ? "test" : "production"} merchant key is required`,
    );
  }
  return key;
};

export const getPayuMerchantSalt = (): string => {
  const salt = config.payu.merchantSalt;
  if (!salt) {
    throw new Error(
      `PayU ${config.payu.useTest ? "test" : "production"} merchant salt is required`,
    );
  }
  return salt;
};

export type BuildPaymentHashInput = {
  key: string;
  txnid: string;
  amount: string;
  productinfo: string;
  firstname: string;
  email: string;
  udf1?: string;
  udf2?: string;
  udf3?: string;
  udf4?: string;
  udf5?: string;
  salt?: string;
};

/**
 * sha512(key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||SALT)
 */
export const buildPaymentHash = (input: BuildPaymentHashInput): string => {
  const salt = input.salt ?? getPayuMerchantSalt();
  const parts = [
    input.key,
    input.txnid,
    input.amount,
    input.productinfo,
    input.firstname,
    input.email,
    input.udf1 ?? "",
    input.udf2 ?? "",
    input.udf3 ?? "",
    input.udf4 ?? "",
    input.udf5 ?? "",
    "",
    "",
    "",
    "",
    "",
    salt,
  ];
  return sha512(parts.join("|"));
};

/**
 * Reverse hash:
 * sha512(SALT|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key)
 * Also accepts additional_charges|SALT|... variant.
 */
export const verifyResponseHash = (payload: PayuResponsePayload): boolean => {
  const received = String(payload.hash ?? "").trim();
  if (!received) return false;

  const salt = getPayuMerchantSalt();
  const status = String(payload.status ?? "");
  const udf5 = String(payload.udf5 ?? "");
  const udf4 = String(payload.udf4 ?? "");
  const udf3 = String(payload.udf3 ?? "");
  const udf2 = String(payload.udf2 ?? "");
  const udf1 = String(payload.udf1 ?? "");
  const email = String(payload.email ?? "");
  const firstname = String(payload.firstname ?? "");
  const productinfo = String(payload.productinfo ?? "");
  const amount = String(payload.amount ?? "");
  const txnid = String(payload.txnid ?? "");
  const key = String(payload.key ?? getPayuMerchantKey());

  const base = [
    status,
    "",
    "",
    "",
    "",
    "",
    "",
    udf5,
    udf4,
    udf3,
    udf2,
    udf1,
    email,
    firstname,
    productinfo,
    amount,
    txnid,
    key,
  ].join("|");

  const expected = sha512(`${salt}|${base}`);
  if (timingSafeEqualHex(expected, received)) return true;

  const additionalCharges = String(payload.additional_charges ?? "").trim();
  if (additionalCharges) {
    const withCharges = sha512(`${additionalCharges}|${salt}|${base}`);
    if (timingSafeEqualHex(withCharges, received)) return true;
  }

  return false;
};

export type SdkHashRequest = {
  hashName: string;
  hashString: string;
  hashType?: string;
  postSalt?: string;
};

/**
 * CheckoutPro SDK dynamic hash variants.
 * - V2 → HmacSHA256(hashString, salt)
 * - mcpLookup → HmacSHA1(hashString, saltV2 or salt)
 * - postSalt → sha512(hashString + salt + postSalt)
 * - default → sha512(hashString + salt)
 */
export const generateSdkHash = (req: SdkHashRequest): string => {
  const salt = getPayuMerchantSalt();
  const { hashName, hashString, hashType, postSalt } = req;

  if (!hashName || !hashString) {
    throw new Error("hashName and hashString are required");
  }

  if (hashType === "V2") {
    return crypto
      .createHmac("sha256", salt)
      .update(hashString)
      .digest("hex")
      .toLowerCase();
  }

  if (hashName === "mcpLookup") {
    const secret = config.payu.merchantSaltV2 || salt;
    return crypto
      .createHmac("sha1", secret)
      .update(hashString)
      .digest("hex")
      .toLowerCase();
  }

  if (postSalt != null && postSalt !== "") {
    return sha512(`${hashString}${salt}${postSalt}`);
  }

  return sha512(`${hashString}${salt}`);
};

export type CreatePayuPaymentInput = {
  amount: number;
  productinfo: string;
  firstname: string;
  email: string;
  phone?: string;
  kind: PayuUdfKind;
  channel?: PayuChannel;
  /** Optional extra udfs (e.g. shopOrderId / courseId) stored hashed */
  udf3?: string;
  udf4?: string;
  udf5?: string;
  txnPrefix?: string;
};

export const createPayuPaymentParams = (
  input: CreatePayuPaymentInput,
): PayuPaymentParams => {
  const key = getPayuMerchantKey();
  const txnid = generateTxnId(input.txnPrefix ?? (input.kind === "PRODUCT" ? "ord" : "crs"));
  const amount = formatPayuAmount(input.amount);
  const firstname = (input.firstname || "Customer").slice(0, 60);
  const email = (input.email || "customer@example.com").slice(0, 100);
  const phone = (input.phone || "9999999999").replace(/\D/g, "").slice(-10) || "9999999999";
  const productinfo = (input.productinfo || "Payment").slice(0, 100);
  const udf1: PayuChannel = input.channel ?? "web";
  const udf2 = input.kind;
  const udf3 = input.udf3 ?? "";
  const udf4 = input.udf4 ?? "";
  const udf5 = input.udf5 ?? "";

  const callbackUrl = `${config.payu.publicApiUrl.replace(/\/$/, "")}/api/payments/payu/callback`;

  const hash = buildPaymentHash({
    key,
    txnid,
    amount,
    productinfo,
    firstname,
    email,
    udf1,
    udf2,
    udf3,
    udf4,
    udf5,
  });

  return {
    key,
    txnid,
    amount,
    productinfo,
    firstname,
    email,
    phone,
    surl: callbackUrl,
    furl: callbackUrl,
    hash,
    paymentUrl: config.payu.paymentUrl,
    environment: config.payu.environment,
    udf1,
    udf2,
    udf3,
    udf4,
    udf5,
  };
};

/**
 * Server-to-server verify_payment.
 * hash = sha512(key|command|var1|salt)
 */
export const verifyPaymentS2S = async (
  txnid: string,
): Promise<{
  status: string;
  mihpayid?: string;
  amount?: string;
  raw: unknown;
}> => {
  const key = getPayuMerchantKey();
  const salt = getPayuMerchantSalt();
  const command = "verify_payment";
  const hash = sha512(`${key}|${command}|${txnid}|${salt}`);

  const body = new URLSearchParams({
    key,
    command,
    var1: txnid,
    hash,
  });

  try {
    const response = await fetch(config.payu.postServiceUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    const raw = (await response.json()) as any;
    const txn = raw?.transaction_details?.[txnid] ?? raw?.transaction_details ?? {};
    return {
      status: String(txn.status ?? raw.status ?? "unknown").toLowerCase(),
      mihpayid: txn.mihpayid ? String(txn.mihpayid) : undefined,
      amount: txn.amt ? String(txn.amt) : txn.amount ? String(txn.amount) : undefined,
      raw,
    };
  } catch (error: any) {
    logger.error("PayU verify_payment failed", { txnid, error: error?.message });
    throw new Error(error?.message || "PayU verify_payment failed");
  }
};

/**
 * Server-to-server cancel_refund_transaction.
 * hash = sha512(key|command|var1|salt)
 * var1 = mihpayid, var2 = merchant refund token, var3 = amount
 */
export const refundPayment = async (input: {
  mihpayid: string;
  amount: number;
  refundToken?: string;
}): Promise<{
  status: string;
  requestId?: string;
  refundId?: string;
  raw: unknown;
}> => {
  const mihpayid = String(input.mihpayid || "").trim();
  if (!mihpayid) throw new Error("mihpayid is required for refund");

  const amount = formatPayuAmount(input.amount);
  const key = getPayuMerchantKey();
  const salt = getPayuMerchantSalt();
  const command = "cancel_refund_transaction";
  const token =
    input.refundToken?.trim() ||
    `rfnd${Date.now().toString(36)}${crypto.randomBytes(3).toString("hex")}`.slice(0, 30);
  const hash = sha512(`${key}|${command}|${mihpayid}|${salt}`);

  const body = new URLSearchParams({
    key,
    command,
    var1: mihpayid,
    var2: token,
    var3: amount,
    hash,
  });

  try {
    const response = await fetch(config.payu.postServiceUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    const raw = (await response.json()) as any;
    const status = String(
      raw?.status ?? raw?.transaction_details?.status ?? raw?.msg ?? "unknown",
    ).toLowerCase();

    // PayU returns status 1 / "success" on accepted refunds
    const ok =
      status === "1" ||
      status === "success" ||
      String(raw?.status) === "1" ||
      Number(raw?.status) === 1;

    if (!ok && raw?.error) {
      throw new Error(String(raw.error || raw.msg || "PayU refund rejected"));
    }

    return {
      status: ok ? "success" : status,
      requestId: token,
      refundId:
        raw?.mihpayid ||
        raw?.request_id ||
        raw?.bank_ref_num ||
        raw?.txn_update_id ||
        undefined,
      raw,
    };
  } catch (error: any) {
    logger.error("PayU refund failed", {
      mihpayid,
      amount,
      error: error?.message,
    });
    throw new Error(error?.message || "PayU refund failed");
  }
};

export const isPayuSuccessStatus = (status: string): boolean => {
  const s = status.toLowerCase();
  return s === "success" || s === "captured";
};

/** Compare PayU amount strings with 2-decimal tolerance. */
export const amountsEqual = (a: string | number, b: string | number): boolean => {
  const left = Number(typeof a === "string" ? a : formatPayuAmount(a));
  const right = Number(typeof b === "string" ? b : formatPayuAmount(b));
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  return Math.abs(left - right) < 0.005;
};
