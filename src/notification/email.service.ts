import logger from "../utils/logger";
import nodemailer from "nodemailer";
import { config } from "../core/config";
import {
    buildPasswordResetOtpEmailHtml,
    buildPasswordResetOtpEmailText,
} from "./templates/password-reset-otp.email";

export interface ReceiptData {
    receiptId: string;
    date: Date;
    userName: string;
    userEmail: string;
    amount: number;
    courseTitle?: string;
    orderId?: string;
    serialNumber?: string;
    items?: Array<{ name: string; quantity: number; price: number }>;
    subtotalAmount?: number;
    bulkDiscount?: number;
    couponDiscount?: number;
}

export interface PasswordResetOtpEmailData {
    userEmail: string;
    otp: string;
    expiresMinutes: number;
}

export class EmailService {
    private static transporter: nodemailer.Transporter | null = null;
    private static transporterKey: string | null = null;

    /**
     * Send a payment receipt email
     */
    static async sendPaymentReceipt(data: ReceiptData): Promise<void> {
        try {
            const smtp = config.smtp;
            
            // If user or pass is missing, treat as unconfigured/dev mode
            if (!smtp.user || !smtp.pass) {
                logger.info("=========================================");
                logger.info("📧 PAYMENT RECEIPT (LOG ONLY)");
                logger.info(`To: ${data.userName} <${data.userEmail}>`);
                logger.info(`Receipt ID: ${data.receiptId}`);
                logger.info(`Amount: ₹${data.amount}`);
                logger.info("=========================================");
                return;
            }

            const transporter = this.getTransporter();
            const subject = `Payment Receipt - ${data.receiptId}`;
            const html = this.generateReceiptHTML(data);

            await transporter.sendMail({
                from: smtp.from,
                to: data.userEmail,
                subject,
                html,
            });

            logger.info("EmailService: Payment receipt sent", {
                userEmail: data.userEmail,
                receiptId: data.receiptId,
            });

        } catch (error) {
            logger.error("EmailService: Failed to send payment receipt", { error, receiptId: data.receiptId });
        }
    }

    private static logPasswordResetOtpToConsole(data: PasswordResetOtpEmailData, label: string): void {
        logger.info("=========================================");
        logger.info(label);
        logger.info(`To: ${data.userEmail}`);
        logger.info(`OTP: ${data.otp}`);
        logger.info(`Expires In: ${data.expiresMinutes} minutes`);
        logger.info("=========================================");
    }

    static async sendPasswordResetOtp(data: PasswordResetOtpEmailData): Promise<boolean> {
        try {
            const smtp = config.smtp;
            if (smtp.logOnly || !smtp.user || !smtp.pass) {
                this.logPasswordResetOtpToConsole(
                    data,
                    smtp.logOnly ? "PASSWORD RESET OTP (SMTP_LOG_ONLY)" : "PASSWORD RESET OTP (LOG ONLY)",
                );
                return false;
            }

            const transporter = this.getTransporter();
            const subject = "Your password reset code";
            const text = buildPasswordResetOtpEmailText({
                email: data.userEmail,
                otp: data.otp,
                expiresMinutes: data.expiresMinutes,
            });
            const html = buildPasswordResetOtpEmailHtml({
                email: data.userEmail,
                otp: data.otp,
                expiresMinutes: data.expiresMinutes,
            });

            const info = await transporter.sendMail({
                from: smtp.from,
                to: data.userEmail,
                subject,
                text,
                html,
            });

            logger.info("EmailService: Password reset OTP email sent", {
                userEmail: data.userEmail,
                expiresMinutes: data.expiresMinutes,
                messageId: info.messageId,
                accepted: info.accepted,
                rejected: info.rejected,
                response: info.response,
            });
            return true;
        } catch (error) {
            logger.error("EmailService: Failed to send password reset OTP email", { error, userEmail: data.userEmail });
            throw error;
        }
    }

    private static generateReceiptHTML(data: ReceiptData): string {
        // Basic HTML template for receipt
        return `
            <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #333;">
                <h1 style="color: #111;">Payment Receipt</h1>
                <p>Hi ${data.userName},</p>
                <p>Thank you for your payment. Here are your transaction details:</p>
                <div style="background-color: #f9f9f9; padding: 15px; border-radius: 8px; margin: 20px 0;">
                    <p><strong>Receipt ID:</strong> ${data.receiptId}</p>
                    <p><strong>Date:</strong> ${data.date.toLocaleDateString()}</p>
                    <p><strong>Amount Paid:</strong> ₹${data.amount}</p>
                    ${data.serialNumber ? `<p><strong>Serial Number:</strong> ${data.serialNumber}</p>` : ''}
                    ${data.courseTitle ? `<p><strong>Description:</strong> ${data.courseTitle}</p>` : ''}
                </div>
                ${data.items && data.items.length > 0 ? `
                    <h3>Items:</h3>
                    <ul>
                        ${data.items.map(item => `<li>${item.name} x ${item.quantity}: ₹${item.price * item.quantity}</li>`).join('')}
                    </ul>
                ` : ''}
                ${(data.subtotalAmount !== undefined && (data.bulkDiscount || data.couponDiscount)) ? `
                    <div style="background-color: #f0f7f0; padding: 15px; border-radius: 8px; margin: 10px 0;">
                        <p><strong>Price Breakdown:</strong></p>
                        <p>Subtotal: ₹${data.subtotalAmount.toFixed(2)}</p>
                        ${data.bulkDiscount ? `<p>Bulk Discount: -₹${data.bulkDiscount.toFixed(2)}</p>` : ''}
                        ${data.couponDiscount ? `<p>Coupon Discount: -₹${data.couponDiscount.toFixed(2)}</p>` : ''}
                        <p><strong>Total Paid: ₹${data.amount.toFixed(2)}</strong></p>
                    </div>
                ` : ''}
                <p>Regards,<br/>Vastu Arun Sharma Team</p>
            </div>
        `;
    }

    private static getTransporter(): nodemailer.Transporter {
        const smtp = config.smtp;
        const key = JSON.stringify({
            host: smtp.host,
            port: smtp.port,
            secure: smtp.secure,
            user: smtp.user ?? "",
            from: smtp.from,
        });

        if (this.transporter && this.transporterKey === key) return this.transporter;

        const auth = smtp.user && smtp.pass ? { user: smtp.user, pass: smtp.pass } : undefined;
        this.transporter = nodemailer.createTransport({
            host: smtp.host,
            port: smtp.port,
            secure: smtp.secure,
            requireTLS: !smtp.secure && smtp.port === 587,
            auth,
        });
        this.transporterKey = key;
        return this.transporter;
    }
}
