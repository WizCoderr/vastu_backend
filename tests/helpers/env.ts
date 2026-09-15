/**
 * Preloaded before every test file (see bunfig.toml).
 * Sets safe defaults so the Express app can boot without side effects.
 */
process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-for-api-tests";
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
process.env.PROCESS_ROLE = "api";
process.env.WHATSAPP_ENABLED = "false";
process.env.TELEGRAM_ENABLED = "false";
process.env.REDIS_ENABLED = "false";
process.env.RATE_LIMIT_WINDOW_SEC = "60";
process.env.RATE_LIMIT_GLOBAL_MAX = "999999";
process.env.RATE_LIMIT_AUTH_LOGIN_MAX = "999999";
process.env.RATE_LIMIT_AUTH_PASSWORD_RESET_MAX = "999999";
process.env.RATE_LIMIT_PAYMENT_CREATE_MAX = "999999";
process.env.RATE_LIMIT_PAYMENT_VERIFY_MAX = "999999";
process.env.RATE_LIMIT_WEBHOOK_MAX = "999999";
process.env.RATE_LIMIT_PUBLIC_MAX = "999999";
