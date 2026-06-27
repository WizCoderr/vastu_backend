import Razorpay from "razorpay";
import crypto from "crypto";
import logger from "../utils/logger";
import { config } from "./config";

// Lazy init instance
let razorpayInstance: Razorpay | null = null;

const razorpayEnvHint = () =>
  config.razorpay.useTest
    ? "RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET (or RAZORPAY_TEST_KEY_ID and RAZORPAY_TEST_KEY_SECRET)"
    : "RAZORPAY_KEY_ID_PROD and RAZORPAY_KEY_SECRET_PROD";

export const getRazorpayKeyId = () => config.razorpay.keyId;

const getRazorpay = () => {
  if (!razorpayInstance) {
    const keyId = config.razorpay.keyId;
    const keySecret = config.razorpay.keySecret;
    if (!keyId || !keySecret) {
      throw new Error(
        `Razorpay ${config.razorpay.useTest ? "test" : "production"} credentials are required: ${razorpayEnvHint()}`,
      );
    }
    razorpayInstance = new Razorpay({ key_id: keyId, key_secret: keySecret });
  }
  return razorpayInstance;
};

export const createRazorpayOrder = async (
  amount: number,
  currency: string = "INR",
  receipt: string,
) => {
  try {
    const razorpay = getRazorpay();

    const order = await razorpay.orders.create({
      amount: Math.round(amount * 100), // convert to paise
      currency,
      receipt,
    });

    return order;
  } catch (error: any) {
    logger.error("Failed to create Razorpay order:", error);
    throw new Error(
      error?.error?.description || error?.message || "Order creation failed",
    );
  }
};

export const verifyRazorpaySignature = (
  orderId: string,
  paymentId: string,
  signature: string,
): boolean => {
  const secret = config.razorpay.keySecret;
  if (!secret) return false;

  const generatedSignature = crypto
    .createHmac("sha256", secret)
    .update(orderId + "|" + paymentId)
    .digest("hex");

  return generatedSignature === signature;
};
