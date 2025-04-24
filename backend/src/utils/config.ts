export const PORT = process.env.PORT ?? "3000";
export const ADMIN_SUPER_SECRET = process.env.ADMIN_SUPER_SECRET ?? "admin";
export const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS ?? "*";
export const DATABASE_URL = process.env.DATABASE_URL || "postgres://localhost:5432";
export const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
export const DEFAULT_RATE_LIMIT = process.env.DEFAULT_RATE_LIMIT
  ? Number.parseFloat(process.env.DEFAULT_RATE_LIMIT)
  : 10;
export const DEFAULT_REFILL_RATE = process.env.DEFAULT_REFILL_RATE
  ? Number.parseFloat(process.env.DEFAULT_REFILL_RATE)
  : 1;
export const PRODUCTION = process.env.NODE_ENV === "production";
export const COMMIT_SHA = process.env.COMMIT_SHA || "unknown";
export const INIT_CONFIG_PATH = process.env.INIT_CONFIG_PATH || "./init.json";
export const ENABLE_INIT_CONFIG = process.env.ENABLE_INIT_CONFIG === "true";
