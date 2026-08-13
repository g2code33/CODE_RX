// Cloudflare Pages Functions Environment Types
/// <reference types="@cloudflare/workers-types" />

export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  JWT_SECRET: string;
  ADMIN_EMAIL: string;
  /** Optional dedicated founder email. Defaults to ADMIN_EMAIL. */
  PHANTOM_EMAIL?: string;
  /** Seed-only secret; configure in Cloudflare, never in frontend code. */
  ADMIN_PASSWORD?: string;
  TELEGRAM_LINK: string;
  /** Optional Community Telegram Bot secret; configure only in Cloudflare. */
  TELEGRAM_BOT_TOKEN?: string;
  /** Public bot username, used only to form an optional deep link. */
  TELEGRAM_BOT_USERNAME?: string;
  /** Optional Telegram webhook secret token; configure only in Cloudflare. */
  TELEGRAM_WEBHOOK_SECRET?: string;
  SITE_URL?: string;
  ASSETS?: Fetcher;
  // EmailJS (optional — for email notifications)
  EMAILJS_PUBLIC_KEY?: string;
  EMAILJS_SERVICE_ID?: string;
  EMAILJS_TEMPLATE_ID_JOIN?: string;
  EMAILJS_TEMPLATE_ID_CONTACT?: string;
  EMAILJS_TEMPLATE_ID_APPROVAL?: string;
  EMAILJS_TEMPLATE_ID_RESET?: string;
  EMAILJS_TEMPLATE_ID_ACTIVATION?: string;
}
