import dotenv from 'dotenv';
dotenv.config();

export const config = {
    port: process.env.PORT || 3000,
    jwtSecret: process.env.JWT_SECRET || 'super-secret-key',
    databaseUrl: process.env.DATABASE_URL,

    // FCM Push Notifications (Direct HTTP API)
    fcm: {
        serverKey: process.env.FCM_SERVER_KEY,
        enabled: !!process.env.FCM_SERVER_KEY,
    },

    // Notification Worker
    notification: {
        // Interval in minutes for checking pending notifications
        workerIntervalMinutes: parseInt(process.env.NOTIFICATION_WORKER_INTERVAL || '5', 10),
        // Minutes before class to send notification
        notifyBeforeMinutes: parseInt(process.env.NOTIFY_BEFORE_MINUTES || '30', 10),
        // Minutes before class when meeting URL becomes visible
        meetingUrlWindowMinutes: parseInt(process.env.MEETING_URL_WINDOW_MINUTES || '15', 10),
    },
};
