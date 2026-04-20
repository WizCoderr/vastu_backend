import logger from "../utils/logger";
import nodemailer from "nodemailer";
import { config } from "../core/config";

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
}

export interface PasswordResetEmailData {
    userName: string;
    userEmail: string;
    resetUrl: string;
    expiresAt: Date;
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

    static async sendPasswordReset(data: PasswordResetEmailData): Promise<void> {
        try {
            const smtp = config.smtp;
            if (!smtp.user || !smtp.pass) {
                // Dev-friendly fallback when SMTP isn't configured.
                logger.info("=========================================");
                logger.info("PASSWORD RESET EMAIL (LOG ONLY)");
                logger.info(`To: ${data.userName} <${data.userEmail}>`);
                logger.info(`Reset URL: ${data.resetUrl}`);
                logger.info(`Expires At: ${data.expiresAt.toISOString()}`);
                logger.info("=========================================");
                return;
            }

            const transporter = this.getTransporter();
            const subject = "Reset your password";
            const text = [
                `Hi ${data.userName},`,
                "",
                "We received a request to reset your password.",
                `Reset link: ${data.resetUrl}`,
                "",
                `This link expires at: ${data.expiresAt.toISOString()}`,
                "",
                "If you didn't request this, you can ignore this email.",
            ].join("\n");
            const html = this.generatePasswordResetHtml(data);

            await transporter.sendMail({
                from: smtp.from,
                to: data.userEmail,
                subject,
                text,
                html,
            });

            // Avoid logging the reset URL/token in real email mode.
            logger.info("EmailService: Password reset email sent", {
                userEmail: data.userEmail,
                expiresAt: data.expiresAt.toISOString(),
            });
        } catch (error) {
            logger.error("EmailService: Failed to send password reset email", { error, userEmail: data.userEmail });
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
                <p>Regards,<br/>Vastu Arun Sharma Team</p>
            </div>
        `;
    }

    private static generatePasswordResetHtml(data: PasswordResetEmailData): string {
        return `
            <div style="font-family: Arial, sans-serif; line-height: 1.5;">
                <h2>Reset your password</h2>
                <p>Hi ${data.userName},</p>
                <p>We received a request to reset your password. Click the button below to set a new one.</p>
                <p style="margin: 24px 0;">
                    <a
                        href="${data.resetUrl}"
                        style="background:#111827;color:#ffffff;padding:12px 16px;border-radius:8px;text-decoration:none;display:inline-block;"
                    >
                        Reset password
                    </a>
                </p>
                <p>This link expires at: <strong>${data.expiresAt.toISOString()}</strong></p>
                <p>If you didn't request this, you can ignore this email.</p>
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
            auth,
        });
        this.transporterKey = key;
        return this.transporter;
    }
}
