// Cloudflare Pages Functions - Email notifications via EmailJS REST API
// Sends transactional emails (new application, new contact, approval).
// Set EMAILJS_* variables in wrangler.toml / Pages settings to enable.
// When not configured, sending is skipped (logged) and never fails the API.

import type { Env } from '../env';

/**
 * A single reusable EmailJS template can serve the account and admin notices
 * on EmailJS plans that limit the number of saved templates. Event-specific
 * template IDs always take precedence, so paid/separate templates remain
 * fully backwards compatible.
 */
export const notificationTemplateId = (env: Env, eventTemplateId?: string) =>
  String(eventTemplateId || '').trim() || String(env.EMAILJS_TEMPLATE_ID_GENERAL || '').trim();

export type GeneralEmailNotification = {
  toEmail: string;
  replyTo: string;
  title: string;
  greeting: string;
  body: string;
  actionLabel: string;
  actionLink: string;
  sentAt: string;
};

/**
 * Parameters for the reusable "Code Rx Notification" EmailJS template.
 * Keep the link passed in by the caller exactly intact: reset and activation
 * URLs are single-use security credentials, never replacement fixed URLs.
 */
export const generalEmailNotification = ({
  toEmail,
  replyTo,
  title,
  greeting,
  body,
  actionLabel,
  actionLink,
  sentAt,
}: GeneralEmailNotification) => ({
  to_email: toEmail,
  reply_to: replyTo,
  email_title: title,
  greeting,
  notification_body: body,
  action_label: actionLabel,
  action_link: actionLink,
  sent_at: sentAt,
});

export async function sendEmail(
  env: Env,
  templateId: string,
  params: Record<string, unknown>
): Promise<boolean> {
  const serviceId = env.EMAILJS_SERVICE_ID;
  const publicKey = env.EMAILJS_PUBLIC_KEY;

  if (!serviceId || !publicKey || !templateId) {
    console.log(`[code-rx] Email skipped — EmailJS not configured (template: ${templateId})`);
    return false;
  }

  try {
    const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: serviceId,
        template_id: templateId,
        user_id: publicKey,
        template_params: params,
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      console.error(`[code-rx] Email send failed (${res.status}):`, text.slice(0, 300));
      return false;
    }
    console.log(`[code-rx] Email sent via EmailJS (${templateId})`);
    return true;
  } catch (e) {
    console.error('[code-rx] Email error:', e);
    return false;
  }
}
