// Cloudflare Workers Environment Types

export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  JWT_SECRET: string;
  ADMIN_EMAIL: string;
  TELEGRAM_LINK: string;
}
