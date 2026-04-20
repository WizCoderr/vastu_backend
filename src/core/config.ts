import dotenv from 'dotenv';
dotenv.config();

const parseInteger = (value: string | undefined, fallback: number, min = 1): number => {
    const parsed = Number.parseInt(value ?? '', 10);
    const result = Number.isNaN(parsed) ? fallback : parsed;
    return result < min ? fallback : result;
};

export const config = {
    port: process.env.PORT || 3000,
    env: process.env.NODE_ENV || 'development',
    jwtSecret: process.env.JWT_SECRET || (() => { throw new Error('JWT_SECRET environment variable is required'); })(),
    databaseUrl: process.env.DATABASE_URL,
    passwordResetBaseUrl: process.env.PASSWORD_RESET_BASE_URL || 'http://localhost:3001/reset-password',
    passwordResetTtlMinutes: parseInteger(process.env.PASSWORD_RESET_TTL_MINUTES, 30),

    // FCM Push Notifications (Direct HTTP API)
    fcm: {
        serverKey: process.env.FCM_SERVER_KEY,
        enabled: !!process.env.FCM_SERVER_KEY,
    },

    // Notification Worker
    notification: {
        // Interval in minutes for checking pending notifications
        workerIntervalMinutes: parseInteger(process.env.NOTIFICATION_WORKER_INTERVAL, 5),
        notifyBeforeMinutes: parseInteger(process.env.NOTIFY_BEFORE_MINUTES, 30),
        meetingUrlWindowMinutes: parseInteger(process.env.MEETING_URL_WINDOW_MINUTES, 15),
    },

    // SMTP Config for Nodemailer
    smtp: {
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInteger(process.env.SMTP_PORT, 587),
        secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
        from: process.env.SMTP_FROM || 'noreply@vastuarunsharma.com',
    },
};
