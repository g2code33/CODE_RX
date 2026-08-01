// Cloudflare Workers Environment Types
/// <reference types="@cloudflare/workers-types" />

export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  JWT_SECRET: string;
  ADMIN_EMAIL: string;
  TELEGRAM_LINK: string;
}
