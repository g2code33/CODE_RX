import type { Actor } from './vault';

export type NotificationAudience = 'all' | 'selected' | 'role' | 'system';

const rows = async <T>(statement: D1PreparedStatement): Promise<T[]> => {
  const result = await statement.all<T>();
  return result.results || [];
};

const runInChunks = async (db: D1Database, statements: D1PreparedStatement[], size = 50) => {
  for (let index = 0; index < statements.length; index += size) await db.batch(statements.slice(index, index + size));
};

export const canSendNotifications = async (db: D1Database, actor: Actor | null): Promise<boolean> => {
  if (!actor?.profileId || actor.memberStatus !== 'active') return false;
  if (actor.isPhantom) return true;
  const delegate = await rows<{ can_send: number }>(db.prepare(
    'SELECT can_send FROM notification_delegates WHERE member_profile_id = ?'
  ).bind(actor.profileId));
  return Number(delegate[0]?.can_send || 0) === 1;
};

export const activeNotificationRecipients = async (
  db: D1Database,
  audience: Exclude<NotificationAudience, 'system'>,
  options: { selectedProfileIds?: number[]; roleCode?: string } = {},
): Promise<number[]> => {
  if (audience === 'all') {
    const recipients = await rows<{ id: number }>(db.prepare(
      "SELECT id FROM member_profiles WHERE status = 'active' ORDER BY id"
    ));
    return recipients.map((recipient) => Number(recipient.id));
  }
  if (audience === 'role') {
    if (!options.roleCode) return [];
    const recipients = await rows<{ id: number }>(db.prepare(
      `SELECT mp.id FROM member_profiles mp
       JOIN roles r ON r.id = mp.primary_role_id
       WHERE mp.status = 'active' AND r.code = ? ORDER BY mp.id`
    ).bind(options.roleCode));
    return recipients.map((recipient) => Number(recipient.id));
  }
  const ids = [...new Set((options.selectedProfileIds || []).filter((id) => Number.isInteger(id) && id > 0))].slice(0, 500);
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  const recipients = await rows<{ id: number }>(db.prepare(
    `SELECT id FROM member_profiles WHERE status = 'active' AND id IN (${placeholders}) ORDER BY id`
  ).bind(...ids));
  return recipients.map((recipient) => Number(recipient.id));
};

export interface CreateNotificationInput {
  title: string;
  message: string;
  audience: NotificationAudience;
  audienceLabel?: string | null;
  recipientProfileIds: number[];
  actor?: Actor | null;
}

export const createNotification = async (db: D1Database, input: CreateNotificationInput) => {
  const result = await db.prepare(
    `INSERT INTO notifications
     (title, message, audience_type, audience_label, created_by_member_profile_id, created_by_user_id, sent_at)
     VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
  ).bind(
    input.title.slice(0, 180),
    input.message.slice(0, 5000),
    input.audience,
    input.audienceLabel?.slice(0, 180) || null,
    input.actor?.profileId ?? null,
    input.actor?.userId ?? null,
  ).run();
  const notificationId = Number(result.meta.last_row_id);
  const recipients = [...new Set(input.recipientProfileIds)].filter((id) => Number.isInteger(id) && id > 0);
  if (recipients.length) await runInChunks(db, recipients.map((profileId) => db.prepare(
    `INSERT OR IGNORE INTO notification_recipients
     (notification_id, member_profile_id, status, delivered_at)
     VALUES (?, ?, 'unread', CURRENT_TIMESTAMP)`
  ).bind(notificationId, profileId)));
  return { id: notificationId, recipientCount: recipients.length };
};

export const notifyMember = async (
  db: D1Database,
  memberProfileId: number | null | undefined,
  title: string,
  message: string,
  actor?: Actor | null,
) => {
  if (!memberProfileId) return null;
  return createNotification(db, {
    title,
    message,
    audience: 'system',
    audienceLabel: 'System update',
    recipientProfileIds: [memberProfileId],
    actor,
  });
};
