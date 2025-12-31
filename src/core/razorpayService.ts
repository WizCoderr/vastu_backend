import Razorpay from 'razorpay';
import crypto from 'crypto';
import logger from '../utils/logger';

// Lazy init instance
let razorpayInstance: Razorpay | null = null;

const getRazorpay = () => {
    if (!razorpayInstance) {
        razorpayInstance = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID || '',
            key_secret: process.env.RAZORPAY_KEY_SECRET || ''
        });
    }
    return razorpayInstance;
};

export const createRazorpayOrder = async (amount: number, currency: string = 'INR', receipt: string) => {
    try {
        const razorpay = getRazorpay();

        const order = await razorpay.orders.create({
            amount: Math.round(amount * 100), // convert to paise
            currency,
            receipt
        });

        return order;
    } catch (error: any) {
        logger.error("Failed to create Razorpay order:", error);
        throw new Error(error?.error?.description || error?.message || "Order creation failed");
    }
};

export const verifyRazorpaySignature = (orderId: string, paymentId: string, signature: string): boolean => {
    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!secret) return false;

    const generatedSignature = crypto
        .createHmac('sha256', secret)
        .update(orderId + "|" + paymentId)
        .digest('hex');

    return generatedSignature === signature;
};
