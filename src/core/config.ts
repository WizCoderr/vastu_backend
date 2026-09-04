import dotenv from 'dotenv';
dotenv.config();

const parseInteger = (value: string | undefined, fallback: number, min = 1): number => {
    const parsed = Number.parseInt(value ?? '', 10);
    const result = Number.isNaN(parsed) ? fallback : parsed;
    return result < min ? fallback : result;
};

const trimEnv = (value: string | undefined): string | undefined => {
    if (!value) return undefined;
    return value.trim().replace(/^["']|["']$/g, '');
};

export const config = {
    port: process.env.PORT || 3000,
    env: process.env.NODE_ENV || 'development',
    jwtSecret: process.env.JWT_SECRET || (() => { throw new Error('JWT_SECRET environment variable is required'); })(),
    databaseUrl: process.env.DATABASE_URL,
    passwordResetBaseUrl: process.env.PASSWORD_RESET_BASE_URL || 'http://localhost:3001/reset-password',
    passwordResetTtlMinutes: parseInteger(process.env.PASSWORD_RESET_TTL_MINUTES, 30),
    passwordResetOtpTtlMinutes: parseInteger(process.env.PASSWORD_RESET_OTP_TTL_MINUTES, 10),

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

    // Google Places API (public reviews on website)
    google: {
        placesApiKey: process.env.GOOGLE_PLACES_API_KEY,
        placeId: process.env.GOOGLE_PLACE_ID,
        placeSearchQuery: process.env.GOOGLE_PLACE_SEARCH_QUERY || 'Vastu Arun Sharma Delhi',
        reviewsUrl:
            process.env.GOOGLE_REVIEWS_URL ||
            'https://www.google.com/search?q=Vastu+Arun+Sharma+Delhi+reviews',
    },

    // SMTP Config for Nodemailer
    smtp: {
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInteger(process.env.SMTP_PORT, 587),
        secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
        user: trimEnv(process.env.SMTP_USER),
        pass: trimEnv(process.env.SMTP_PASS),
        from: trimEnv(process.env.SMTP_FROM) || 'noreply@vastuarunsharma.com',
        logOnly: process.env.SMTP_LOG_ONLY === 'true',
    },

    whatsapp: {
        adminPhone: process.env.WHATSAPP_ADMIN_PHONE || '',
        sessionPath: process.env.WHATSAPP_SESSION_PATH || '.wwebjs_auth',
        enabled: process.env.WHATSAPP_ENABLED !== 'false',
        chromiumPath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
    },

    stock: {
        defaultLowStockThreshold: parseInteger(process.env.DEFAULT_LOW_STOCK_THRESHOLD, 5),
    },

    razorpay: {
        useTest: process.env.RAZORPAY_USE_TEST === 'true',
        get keyId() {
            return this.useTest
                ? (process.env.RAZORPAY_KEY_ID ?? process.env.RAZORPAY_TEST_KEY_ID)
                : process.env.RAZORPAY_KEY_ID_PROD;
        },
        get keySecret() {
            return this.useTest
                ? (process.env.RAZORPAY_KEY_SECRET ?? process.env.RAZORPAY_TEST_KEY_SECRET)
                : process.env.RAZORPAY_KEY_SECRET_PROD;
        },
    },

    paymentProvider: process.env.PAYMENT_PROVIDER || 'upi',

    upi: {
        merchantVpa: process.env.UPI_MERCHANT_VPA || 'payments@wizhub',
        merchantName: process.env.UPI_MERCHANT_NAME || 'WizHub',
        bankProvider: (process.env.PAYMENT_BANK_PROVIDER || 'mock') as
            | 'hdfc' | 'icici' | 'axis' | 'sbi' | 'kotak' | 'mock',
        bankApiKey: process.env.BANK_API_KEY || '',
        bankApiSecret: process.env.BANK_API_SECRET || '',
        bankMerchantId: process.env.BANK_MERCHANT_ID || '',
        bankBaseUrl: process.env.BANK_BASE_URL || 'https://api.mock-bank.local',
        paymentExpiryMinutes: parseInteger(process.env.UPI_PAYMENT_EXPIRY_MINUTES, 30),
        invoiceBaseUrl: process.env.INVOICE_BASE_URL || 'http://localhost:3030',
    },

    redis: {
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        enabled: process.env.REDIS_ENABLED !== 'false',
        connectTimeoutMs: parseInteger(process.env.REDIS_CONNECT_TIMEOUT_MS, 10_000),
        commandTimeoutMs: parseInteger(process.env.REDIS_COMMAND_TIMEOUT_MS, 5_000),
        lockTtlMs: parseInteger(process.env.PAYMENT_LOCK_TTL_MS, 30_000),
        cacheTtlPendingSec: parseInteger(process.env.PAYMENT_STATUS_CACHE_TTL_PENDING_SEC, 3),
        cacheTtlTerminalSec: parseInteger(process.env.PAYMENT_STATUS_CACHE_TTL_TERMINAL_SEC, 300),
    },

    process: {
        /** api = HTTP only | worker = background jobs only | all = single-process dev */
        role: (process.env.PROCESS_ROLE || 'all') as 'api' | 'worker' | 'all',
        runPaymentWorkers: process.env.RUN_PAYMENT_WORKERS !== 'false',
    },

    queue: {
        paymentVerifyConcurrency: parseInteger(process.env.PAYMENT_VERIFY_CONCURRENCY, 10),
        invoiceConcurrency: parseInteger(process.env.INVOICE_WORKER_CONCURRENCY, 5),
        paymentVerifyAttempts: parseInteger(process.env.PAYMENT_VERIFY_ATTEMPTS, 20),
        paymentVerifyBackoffMs: parseInteger(process.env.PAYMENT_VERIFY_BACKOFF_MS, 5000),
    },

    database: {
        poolMax: parseInteger(process.env.DATABASE_POOL_MAX, 20),
        poolIdleTimeoutMs: parseInteger(process.env.DATABASE_POOL_IDLE_TIMEOUT_MS, 30_000),
        poolConnectionTimeoutMs: parseInteger(process.env.DATABASE_POOL_CONNECTION_TIMEOUT_MS, 10_000),
    },

    jwt: {
        refreshSecret: process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || '',
        refreshTtlDays: parseInteger(process.env.JWT_REFRESH_TTL_DAYS, 30),
        accessTtlMinutes: parseInteger(process.env.JWT_ACCESS_TTL_MINUTES, 60),
    },
};
