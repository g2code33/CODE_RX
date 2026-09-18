/**
 * CODE Rx SOCIETY — optional client notifications (Phase 9).
 *
 * Two systems already exist and both are reused here; nothing new is introduced:
 *
 *   1. The member notification inbox (`notifications` + `notification_recipients`)
 *      through `functions/lib/notifications.ts`, so the people who manage client
 *      content see "a document was published" inside the platform.
 *   2. The transactional EmailJS path (`functions/lib/email.ts`) with the
 *      reusable general template, so the client's contact address can be told
 *      about the same event. Clients have no accounts, so email is the only
 *      channel they have — and it is only used when a contact address exists.
 *
 * Everything is optional and off by default: one master switch plus one switch
 * per event, all stored with the existing `system_settings` keys the portal
 * already reads. A notification can never block, slow down or fail a publish:
 * every outcome is recorded in the existing audit log and returned to the caller
 * as a small result object.
 */

import { audit } from './vault';
import { createNotification } from './notifications';
import { generalEmailNotification, notificationTemplateId, sendEmail } from './email';
import type { Env } from '../env';

export type ClientNotificationEvent = 'new_document' | 'document_updated' | 'project_update';

export const CLIENT_NOTIFICATION_EVENTS: readonly ClientNotificationEvent[] =
  ['new_document', 'document_updated', 'project_update'];

/** The settings keys, in the order the workspace shows them. */
export const CLIENT_NOTIFICATION_SETTINGS = [
  { key: 'client_notifications_enabled', label: 'Client notifications (master switch)', event: null, fallback: '0' },
  { key: 'client_notify_new_document', label: 'Tell us when a new document is published', event: 'new_document', fallback: '0' },
  { key: 'client_notify_document_updated', label: 'Tell us when a document is updated', event: 'document_updated', fallback: '0' },
  { key: 'client_notify_project_update', label: 'Tell us when a project update is published', event: 'project_update', fallback: '0' },
] as const;

export interface ClientNotificationPreferences {
  enabled: boolean;
  events: Record<ClientNotificationEvent, boolean>;
}

const setting = async (db: D1Database, key: string, fallback: string): Promise<string> => {
  const rows = await db.prepare('SELECT setting_value FROM system_settings WHERE setting_key = ?')
    .bind(key).all<{ setting_value: string }>();
  return String(rows.results?.[0]?.setting_value ?? fallback);
};

const SETTING_BY_EVENT = Object.fromEntries(
  CLIENT_NOTIFICATION_SETTINGS.filter((entry) => entry.event).map((entry) => [entry.event, entry]),
) as Record<ClientNotificationEvent, (typeof CLIENT_NOTIFICATION_SETTINGS)[number]>;

export const clientNotificationPreferences = async (db: D1Database): Promise<ClientNotificationPreferences> => {
  const values = new Map<string, boolean>();
  await Promise.all(CLIENT_NOTIFICATION_SETTINGS.map(async (entry) =>
    values.set(entry.key, (await setting(db, entry.key, entry.fallback)) === '1')));
  // Every switch defaults to off: an operator opts in, event by event.
  return {
    enabled: values.get('client_notifications_enabled') === true,
    events: {
      new_document: values.get(SETTING_BY_EVENT.new_document.key) === true,
      document_updated: values.get(SETTING_BY_EVENT.document_updated.key) === true,
      project_update: values.get(SETTING_BY_EVENT.project_update.key) === true,
    },
  };
};

/**
 * Who hears about it internally: PHANTOM and the members who have been delegated
 * the client publishing capability, read from the platform's existing
 * `website_admins` / `website_admin_permissions` tables. Nobody else.
 */
export const clientNotificationRecipients = async (db: D1Database, limit = 50): Promise<number[]> => {
  const result = await db.prepare(
    `SELECT DISTINCT mp.id
     FROM member_profiles mp
     JOIN users u ON u.id = mp.user_id
     LEFT JOIN roles r ON r.id = mp.primary_role_id
     WHERE mp.status = 'active' AND (
       u.role = 'phantom' OR r.code = 'phantom'
       OR mp.id IN (
         SELECT wa.member_profile_id
         FROM website_admins wa
         JOIN website_admin_permissions p ON p.website_admin_id = wa.id
         WHERE p.allowed = 1 AND p.permission_key IN ('clients.documents.publish', 'clients.publish')
       )
     )
     ORDER BY mp.id LIMIT ?`,
  ).bind(Math.min(200, Math.max(1, limit))).all<{ id: number }>();
  return (result.results || []).map((row) => Number(row.id)).filter((id) => Number.isInteger(id) && id > 0);
};

export interface ClientNotificationInput {
  event: ClientNotificationEvent;
  client: { name: string; contactEmail?: string | null };
  project: { name: string; reference: string };
  document: { title: string; reference: string | null; version: string | null; category: string };
  actor?: { userId?: number | null; profileId?: number | null } | null;
  /** Where a reader can find the portal, for the email body only. */
  portalLink?: string | null;
}

export interface ClientNotificationResult {
  sent: boolean;
  reason: string;
  internalRecipients: number;
  emailSent: boolean;
}

const EVENT_COPY: Record<ClientNotificationEvent, { title: string; verb: string; emailTitle: string }> = {
  new_document: {
    title: 'New client document published',
    verb: 'published a new document to',
    emailTitle: 'A new document is available',
  },
  document_updated: {
    title: 'Client document updated',
    verb: 'updated a document for',
    emailTitle: 'A document has been updated',
  },
  project_update: {
    title: 'Project update published',
    verb: 'published a project update for',
    emailTitle: 'A project update is available',
  },
};

/**
 * Records the outcome of a notification attempt. Deliberately swallows every
 * failure: publishing a document must never depend on a mail provider.
 */
export const notifyClientDocumentEvent = async (
  db: D1Database,
  env: Env,
  input: ClientNotificationInput,
): Promise<ClientNotificationResult> => {
  const actor = (input.actor || null) as any;
  const outcome = (result: ClientNotificationResult) => audit(
    db,
    actor,
    result.sent ? 'client.notification.sent' : 'client.notification.skipped',
    'client_document',
    input.document.reference || input.document.title,
    {
      event: input.event,
      reason: result.reason,
      clientName: input.client.name,
      projectReference: input.project.reference,
      documentReference: input.document.reference,
      version: input.document.version,
      internalRecipients: result.internalRecipients,
      emailSent: result.emailSent,
    },
  ).then(() => result).catch(() => result);

  try {
    const preferences = await clientNotificationPreferences(db);
    if (!preferences.enabled) return await outcome({ sent: false, reason: 'notifications_disabled', internalRecipients: 0, emailSent: false });
    if (!preferences.events[input.event]) return await outcome({ sent: false, reason: 'event_disabled', internalRecipients: 0, emailSent: false });

    const copy = EVENT_COPY[input.event];
    const reference = input.document.reference ? ` (${input.document.reference})` : '';
    const version = input.document.version ? `, version ${input.document.version}` : '';
    const message = `${input.client.name}: ${copy.verb} ${input.project.name} — ${input.document.title}${reference}${version}.`;

    // 1. The internal inbox, through the existing notification system.
    const recipients = await clientNotificationRecipients(db);
    if (recipients.length) {
      await createNotification(db, {
        title: copy.title,
        message,
        audience: 'system',
        audienceLabel: 'Client portal',
        recipientProfileIds: recipients,
        actor,
      });
    }

    // 2. The client contact, through the existing transactional email path.
    let emailSent = false;
    const contactEmail = String(input.client.contactEmail || '').trim();
    if (!contactEmail) {
      return await outcome({ sent: recipients.length > 0, reason: recipients.length ? 'internal_only' : 'no_contact_email', internalRecipients: recipients.length, emailSent: false });
    }
    emailSent = await sendEmail(env, notificationTemplateId(env), generalEmailNotification({
      toEmail: contactEmail,
      replyTo: 'contact@coderxsociety.com',
      title: copy.emailTitle,
      greeting: `Hello ${input.client.name},`,
      body: `${copy.emailTitle} on the ${input.project.name} project: ${input.document.title}${reference}${version}. `
        + 'This is a notice only — documents are always read inside the Code Rx client portal with your project access key, and every copy you open or download is stamped as a client copy.',
      actionLabel: 'Open the Code Rx client portal',
      actionLink: String(input.portalLink || ''),
      sentAt: new Date().toISOString(),
    }));

    return await outcome({
      sent: recipients.length > 0 || emailSent,
      reason: emailSent ? 'sent' : 'email_unavailable',
      internalRecipients: recipients.length,
      emailSent,
    });
  } catch (error) {
    return await outcome({
      sent: false,
      reason: `notification_failed:${String((error as Error)?.message || 'unknown').slice(0, 40)}`,
      internalRecipients: 0,
      emailSent: false,
    });
  }
};
