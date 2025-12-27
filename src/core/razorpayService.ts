import Razorpay from 'razorpay';
import crypto from 'crypto';
import logger from '../utils/logger';

// Lazy init
let razorpayInstance: Razorpay | null = null;

const getRazorpay = () => {
    if (!razorpayInstance) {
        razorpayInstance = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID || 'test_key', // Fallback to prevent crash on init
            key_secret: process.env.RAZORPAY_KEY_SECRET || 'test_secret'
        });
    }
    return razorpayInstance;
};

export const createRazorpayOrder = async (amount: number, currency: string = 'INR', receipt: string) => {
    try {
        const razorpay = getRazorpay();
        const order = await razorpay.orders.create({
            amount: Math.round(amount * 100), // Razorpay expects amount in paise
            currency,
            receipt
        });
        return order;
    } catch (error) {
        logger.error('Failed to create Razorpay order', { error });
        throw error;
    }
};

export const verifyRazorpaySignature = (orderId: string, paymentId: string, signature: string): boolean => {
    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!secret) return false;

    const generatedSignature = crypto
        .createHmac('sha256', secret)
        .update(orderId + '|' + paymentId)
        .digest('hex');

    return generatedSignature === signature;
};
