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
  /**
   * CGM individual-invitation secret sealing keys (AES-256-GCM). A JSON object
   * mapping key versions to base64-encoded 32-byte keys, e.g.
   *   {"v1": "<openssl rand -base64 32>"}
   * Required before individual invitations can be created; existing rows keep
   * working via their lookup hashes until it is configured. See
   * functions/lib/cgm/invite-crypto.ts and CLASS_GROUP_MANAGEMENT_REPORT.md.
   */
  CGM_INVITATION_KEYS?: string;
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
  /** Encrypted Pages secret when EmailJS Private Key mode is enabled. */
  EMAILJS_PRIVATE_KEY?: string;
  EMAILJS_SERVICE_ID?: string;
  EMAILJS_TEMPLATE_ID_JOIN?: string;
  /** Optional shared template for EmailJS plans with limited template slots. */
  EMAILJS_TEMPLATE_ID_GENERAL?: string;
  EMAILJS_TEMPLATE_ID_CONTACT?: string;
  EMAILJS_TEMPLATE_ID_APPROVAL?: string;
  EMAILJS_TEMPLATE_ID_RESET?: string;
  EMAILJS_TEMPLATE_ID_ACTIVATION?: string;
}
