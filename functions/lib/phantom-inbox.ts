/**
 * CODE Rx SOCIETY — the unified PHANTOM Community inbox (Phase 22).
 *
 * Every message that reaches PHANTOM from anywhere on the website lands in one
 * place: the existing code-rx community. The new `phantom_inbox` table keeps one
 * row per event (contact, JOIN application, client message, forum thread, public
 * chat line, report, private DM/mention/announcement, Telegram-synced message),
 * grouped by its channel, and the PHANTOM Community page reads it back the same
 * way it reads any other feed.
 *
 * Nothing here replaces the existing systems. The notification inbox still tells
 * PHANTOM the moment something arrives; the audit log still records every event;
 * and the underlying tables (`contacts`, `applications`, `client_messages`, …)
 * remain the records of record. This table is only the shared, channel-grouped
 * view of those records, with a per-member read cursor so PHANTOM and the
 * founding members PHANTOM grants a channel to can each track their own unread
 * state.
 */

import { createNotification } from './notifications';

export interface PhantomChannel {
  key: string;
  label: string;
  blurb: string;
}

export const PHANTOM_CHANNELS = [
  { key: 'website', label: 'Website → PHANTOM', blurb: 'Contact form messages and newsletter sign-ups.' },
  { key: 'applications', label: 'JOIN applications', blurb: 'Membership applications awaiting review.' },
  { key: 'client_messages', label: 'Client messages', blurb: 'Client Text PHANTOM messages, reviews, signatures and send-backs.' },
  { key: 'forum_threads', label: 'Forum discussions', blurb: 'New public forum threads and replies.' },
  { key: 'public_chat', label: 'Public chat', blurb: 'New public community chat messages.' },
  { key: 'public_reports', label: 'Public reports', blurb: 'Content reports from the public community.' },
  { key: 'private_messages', label: 'Community messages', blurb: 'DMs, mentions, and group announcements from members.' },
  { key: 'telegram', label: 'Telegram', blurb: 'Messages synced in from linked Telegram chats.' },
] as const satisfies readonly PhantomChannel[];

export const PHANTOM_INBOX_CHANNEL_KEYS = PHANTOM_CHANNELS.map((channel) => channel.key);

/** The founding codenames PHANTOM may grant a channel to (never PHANTOM itself). */
export const FOUNDING_MEMBER_CODENAMES = ['NEXUS', 'GHOST', 'FALCON', 'QUANTUM', 'MATRIX'] as const;

/**
 * What "a founding member" means for the PHANTOM Community inbox: a member who
 * entered the founding pool (a custom-founding ballot or a direct PHANTOM
 * assignment) OR who holds a claimed codename from the founding pool. A plain
 * member who has never touched the founding pool is a founding member for
 * neither branch, whatever their role or seniority.
 *
 * The shared SQL is used by the feed readers, the grant recipients query, and
 * the permission-matrix route, so a channel grant, a notification, and the
 * matrix listing always agree about who qualifies. It relies on the
 * `member_profiles` table aliased `mp` in the surrounding query.
 */
export const FOUNDING_MEMBER_SQL = `(
  mp.codename_path IN ('custom_founding', 'direct_founding')
  OR EXISTS (
    SELECT 1 FROM codenames founding_code
    WHERE founding_code.claimed_by_member_profile_id = mp.id
      AND founding_code.status = 'claimed'
      AND founding_code.pool = 'founding'
  )
)`;

export const phantomChannelLabel = (key: string): string =>
  PHANTOM_CHANNELS.find((channel) => channel.key === key)?.label || key;

export const isPhantomChannel = (key: unknown): key is (typeof PHANTOM_INBOX_CHANNEL_KEYS)[number] =>
  typeof key === 'string' && (PHANTOM_INBOX_CHANNEL_KEYS as readonly string[]).includes(key);

const rows = async <T>(statement: D1PreparedStatement): Promise<T[]> => {
  const result = await statement.all<T>();
  return result.results || [];
};

/**
 * PHANTOM — the founder account (or accounts) themselves. Historically every
 * system sent its notice to "PHANTOM", so this matches the same definition the
 * client-portal notices already use: a phantom user role or phantom
 * responsibility profile.
 */
export const phantomProfiles = async (db: D1Database): Promise<number[]> => {
  const profiles = await rows<{ id: number }>(db.prepare(
    `SELECT DISTINCT mp.id
     FROM member_profiles mp
     JOIN users u ON u.id = mp.user_id
     LEFT JOIN roles r ON r.id = mp.primary_role_id
     WHERE mp.status = 'active' AND (u.role = 'phantom' OR r.code = 'phantom')
     ORDER BY mp.id`
  ));
  return profiles.map((profile) => Number(profile.id)).filter((id) => Number.isInteger(id) && id > 0);
};

/**
 * The founding members PHANTOM has granted a channel to. Membership is a
 * claimed founding codename plus an explicit, per-channel grant stored in
 * `phantom_inbox_channel_permissions` — every switch defaults to off, and only
 * PHANTOM can turn one on.
 */
export const phantomInboxRecipients = async (db: D1Database, channels: string[]): Promise<number[]> => {
  const keys = [...new Set(channels)].filter(isPhantomChannel);
  if (!keys.length) return [];
  const placeholders = keys.map(() => '?').join(',');
  const recipients = await rows<{ id: number }>(db.prepare(
    `SELECT DISTINCT mp.id
     FROM member_profiles mp
     JOIN phantom_inbox_channel_permissions perm ON perm.member_profile_id = mp.id
     LEFT JOIN users u ON u.id = mp.user_id
     LEFT JOIN roles r ON r.id = mp.primary_role_id
     WHERE mp.status = 'active'
       AND ${FOUNDING_MEMBER_SQL}
       AND NOT (u.role = 'phantom' OR r.code = 'phantom')
       AND perm.channel_key IN (${placeholders})
       AND perm.can_receive = 1
     ORDER BY mp.id`
  ).bind(...keys));
  return recipients.map((recipient) => Number(recipient.id)).filter((id) => Number.isInteger(id) && id > 0);
};

export interface PhantomInboxInput {
  /** Channel key, one of {@link PHANTOM_INBOX_CHANNEL_KEYS}. */
  channel: string;
  /** Short human title for the list item. */
  title: string;
  /** One-line summary of the message itself. */
  summary: string;
  /** Which source table/route produced it, for audit and future cleanup. */
  source: string;
  /** Opaque, human-safe identifier of the underlying record (never internal). */
  sourceId: string;
  /** The member profile id that produced it, when a member (never a guest id). */
  actorProfileId?: number | null;
  /** A display name for the sender shown in the feed. */
  actorLabel: string;
  /** Deep link that takes PHANTOM straight to the message's own channel. */
  link: string;
  /** Full message text, kept so the words stay alongside the notice. */
  body: string;
}

/**
 * Records one event into the PHANTOM Community inbox and tells PHANTOM through
 * the existing notification inbox. Both halves are deliberately non-fatal to the
 * caller: a message that was already stored must never fail its own request
 * because the inbox copy could not be written, and the inbox copy must never
 * fail because the notification could not be delivered.
 */
export const recordPhantomInboxItem = async (
  db: D1Database,
  input: PhantomInboxInput,
): Promise<{ id: number; phantomNotified: number }> => {
  let id = 0;
  try {
    const result = await db.prepare(
      `INSERT INTO phantom_inbox (channel_key, title, summary, source, source_id, actor_profile_id, actor_label, link, body, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
    ).bind(
      input.channel,
      input.title.slice(0, 180),
      input.summary.slice(0, 500),
      input.source.slice(0, 50),
      String(input.sourceId).slice(0, 120),
      input.actorProfileId ?? null,
      input.actorLabel.slice(0, 160),
      input.link.slice(0, 320),
      String(input.body || '').slice(0, 5000),
    ).run();
    id = Number(result.meta.last_row_id);
  } catch (error) {
    console.warn('[code-rx] phantom inbox write failed (non-fatal):', error);
  }

  let notified = 0;
  try {
    // PHANTOM is always told, and every founding member PHANTOM has granted
    // this channel to is told too (their per-channel receive switch). The same
    // event never notifies the same member twice — createNotification dedupes
    // recipient profile ids.
    const phantom = await phantomProfiles(db);
    const delegates = await phantomInboxRecipients(db, [input.channel]);
    const recipients = [...new Set([...phantom, ...delegates])];
    if (recipients.length) {
      await createNotification(db, {
        title: `PHANTOM · ${phantomChannelLabel(input.channel)}`,
        message: `${input.title} — ${input.summary}`,
        audience: 'system',
        audienceLabel: 'PHANTOM Community',
        recipientProfileIds: recipients,
      });
      notified = recipients.length;
    }
  } catch (error) {
    console.warn('[code-rx] phantom inbox notification failed (non-fatal):', error);
  }
  return { id, phantomNotified: notified };
};

/**
 * The founding members a PHANTOM grants a channel to. Asked without a channel,
 * this returns every active member who holds a claimed founding codename, so
 * the Community Control matrix can list them before any grant exists.
 */
export const phantomInboxMembers = async (db: D1Database, channel?: string): Promise<any[]> => {
  const rowsOut = await rows<any>(db.prepare(
    `SELECT mp.id, mp.member_code, u.name, code.display_name AS codename, code.normalized_name,
       perm.can_receive AS can_receive, perm.updated_at AS granted_at
     FROM member_profiles mp
     JOIN users u ON u.id = mp.user_id
     LEFT JOIN roles r ON r.id = mp.primary_role_id
     LEFT JOIN codenames code ON code.claimed_by_member_profile_id = mp.id AND code.status = 'claimed'
     LEFT JOIN phantom_inbox_channel_permissions perm
       ON perm.member_profile_id = mp.id AND perm.channel_key = ?
     WHERE mp.status = 'active'
       AND ${FOUNDING_MEMBER_SQL}
       AND NOT (u.role = 'phantom' OR r.code = 'phantom')
     ORDER BY u.name COLLATE NOCASE`
  ).bind(channel || ''));
  return rowsOut.map((row) => ({
    id: Number(row.id),
    memberCode: row.member_code,
    name: row.name,
    codename: row.codename,
    normalizedName: row.normalized_name,
    canReceive: Number(row.can_receive || 0) === 1,
    grantedAt: row.granted_at,
  }));
};

export interface PhantomInboxFeed {
  channels: Array<{ key: string; label: string; blurb: string; count: number }>;
  groups: Record<string, any[]>;
}

/**
 * The feed the PHANTOM Community page renders: every channel (with its label
 * and count), the items grouped by channel, and a per-reader unread count.
 */
export const listPhantomInbox = async (db: D1Database, profileId: number): Promise<PhantomInboxFeed> => {
  const items = await rows<any>(db.prepare(
    `SELECT pi.id, pi.channel_key, pi.title, pi.summary, pi.source, pi.source_id, pi.actor_label, pi.link, pi.body, pi.created_at,
       read_state.last_read_item_id
     FROM phantom_inbox pi
     LEFT JOIN phantom_inbox_read_state read_state
       ON read_state.member_profile_id = ? AND read_state.channel_key = pi.channel_key
     ORDER BY pi.created_at DESC, pi.id DESC LIMIT 400`
  ).bind(profileId));
  const channels = PHANTOM_CHANNELS.map((channel) => {
    const channelItems = items.filter((item) => item.channel_key === channel.key);
    return {
      ...channel,
      count: channelItems.length,
      unread: channelItems.filter((item) => Number(item.id) > Number(item.last_read_item_id || 0)).length,
    };
  });
  const groups: Record<string, any[]> = {};
  for (const channel of PHANTOM_CHANNELS) {
    groups[channel.key] = items
      .filter((item) => item.channel_key === channel.key)
      .slice(0, 60)
      .map((item) => ({
        id: Number(item.id),
        channelKey: item.channel_key,
        title: item.title,
        summary: item.summary,
        source: item.source,
        sourceId: item.source_id,
        actorLabel: item.actor_label,
        link: item.link,
        body: item.body,
        createdAt: item.created_at,
        unread: Number(item.id) > Number(item.last_read_item_id || 0),
      }));
  }
  return { channels, groups };
};
