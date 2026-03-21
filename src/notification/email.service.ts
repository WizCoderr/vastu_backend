import logger from "../utils/logger";

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

export class EmailService {
    /**
     * Send a payment receipt email
     * Currently a placeholder that logs to console.
     * Integration with Nodemailer/SendGrid/AWS SES should be added here.
     */
    static async sendPaymentReceipt(data: ReceiptData): Promise<void> {
        try {
            logger.info("=========================================");
            logger.info("📧 SENDING EMAIL RECEIPT");
            logger.info(`To: ${data.userName} <${data.userEmail}>`);
            logger.info(`Receipt ID: ${data.receiptId}`);
            logger.info(`Date: ${data.date.toLocaleString()}`);
            logger.info(`Amount: ₹${data.amount}`);
            
            if (data.serialNumber) {
                logger.info(`Serial Number: ${data.serialNumber}`);
            }

            if (data.courseTitle) {
                logger.info(`Course: ${data.courseTitle}`);
            }

            if (data.items && data.items.length > 0) {
                logger.info("Items:");
                data.items.forEach(item => {
                    logger.info(` - ${item.name} x ${item.quantity}: ₹${item.price * item.quantity}`);
                });
            }

            logger.info("=========================================");
            
            // TODO: Implementation for real email provider
            // Example using nodemailer:
            // const transporter = nodemailer.createTransport({...});
            // await transporter.sendMail({
            //     from: '"Vastu Arun Sharma" <noreply@vastuarunsharma.com>',
            //     to: data.userEmail,
            //     subject: `Payment Receipt - ${data.receiptId}`,
            //     html: this.generateReceiptHTML(data)
            // });

        } catch (error) {
            logger.error("EmailService: Failed to send payment receipt", { error, receiptId: data.receiptId });
        }
    }

    private static generateReceiptHTML(data: ReceiptData): string {
        // Basic HTML template for receipt
        return `
            <h1>Payment Receipt</h1>
            <p>Hi ${data.userName},</p>
            <p>Thank you for your payment.</p>
            <hr/>
            <p><strong>Receipt ID:</strong> ${data.receiptId}</p>
            <p><strong>Date:</strong> ${data.date.toLocaleDateString()}</p>
            <p><strong>Amount Paid:</strong> ₹${data.amount}</p>
            ${data.serialNumber ? `<p><strong>Serial Number:</strong> ${data.serialNumber}</p>` : ''}
            <hr/>
            ${data.courseTitle ? `<p><strong>Description:</strong> Enrollment in ${data.courseTitle}</p>` : ''}
            <p>Regards,<br/>Vastu Arun Sharma Team</p>
        `;
    }
}
