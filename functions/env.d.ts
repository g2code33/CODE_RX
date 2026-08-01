// Cloudflare Pages Functions Environment Types
/// <reference types="@cloudflare/workers-types" />

export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  JWT_SECRET: string;
  ADMIN_EMAIL: string;
  ADMIN_PASSWORD?: string;
  TELEGRAM_LINK: string;
  SITE_URL?: string;
  ASSETS?: Fetcher;
  // EmailJS (optional — for email notifications)
  EMAILJS_PUBLIC_KEY?: string;
  EMAILJS_SERVICE_ID?: string;
  EMAILJS_TEMPLATE_ID_JOIN?: string;
  EMAILJS_TEMPLATE_ID_CONTACT?: string;
  EMAILJS_TEMPLATE_ID_APPROVAL?: string;
  EMAILJS_TEMPLATE_ID_RESET?: string;
}
