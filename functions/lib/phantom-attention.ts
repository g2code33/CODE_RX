/**
 * CODE Rx — PHANTOM's CONTROL-CENTER BADGES.
 *
 * The Class & Group oversight has its own attention board (functions/lib/cgm/
 * attention.ts): a number on every section, cleared the moment PHANTOM opens
 * that section. The CONTROL CENTER itself — the left-hand navigation with
 * Applications, Members, Community Control, Class Groups and so on — had no
 * such number, so work waiting two clicks deep was invisible from the outside.
 *
 * This module answers the same two questions per navigation tab, from live
 * data, for this PHANTOM account:
 *
 *   unseen — what ARRIVED since this operator last opened that tab (the badge);
 *   pending — decision work still waiting there (never clears by looking).
 *
 * The watermark lives in the same `cgm_phantom_attention` table, under a
 * `nav:`-prefixed key, so opening a section inside Class Groups and opening the
 * Class Groups tab itself stay independent of each other. "Class Groups" is
 * DERIVED: its number is the sum of that panel's sections, so it falls exactly
 * as PHANTOM opens them, and the "Overview" tab carries the grand total.
 */

import { asRows } from './cgm/service';
import { ensurePhantomAttentionSchema, phantomAttentionBoard } from './cgm/attention';

/** Watermark keys for the control-center navigation live under this prefix. */
export const NAV_WATERMARK_PREFIX = 'nav:';

export interface PhantomNavSection {
  key: string;
  label: string;
  /** The table an arrival is counted from (absent = the number is derived). */
  arrivals?: { table: string; where?: string };
  /** Live backlog counts that never clear by looking. */
  pending?: Array<{ table: string; where: string }>;
  /** Derived from other sections instead of a table of its own. */
  derive?: 'total' | 'class-groups';
}

/**
 * The navigation tabs that can honestly carry a number. A tab with nothing to
 * watch (Permissions, Settings, Site Emojis…) shows no badge rather than a
 * decorative zero.
 */
export const PHANTOM_NAV_SECTIONS: PhantomNavSection[] = [
  { key: 'overview', label: 'Overview', derive: 'total' },
  {
    key: 'applications',
    label: 'Applications',
    arrivals: { table: 'applications' },
    pending: [{ table: 'applications', where: "status = 'pending'" }],
  },
  { key: 'members', label: 'Members', arrivals: { table: 'member_profiles' } },
  {
    key: 'community',
    label: 'Community Control',
    arrivals: { table: 'public_forum_reports' },
    pending: [
      { table: 'public_forum_reports', where: "status = 'open'" },
      { table: 'community_group_join_requests', where: "status = 'pending'" },
    ],
  },
  { key: 'classgroups', label: 'Class Groups', derive: 'class-groups' },
  { key: 'audit', label: 'Audit Logs', arrivals: { table: 'audit_logs' } },
  { key: 'recycle', label: 'Recycle Bin', arrivals: { table: 'recycle_bin_items' } },
];

export interface PhantomNavCount {
  key: string;
  label: string;
  unseen: number;
  pending: number;
  /** False for derived tabs: they fall as the sections underneath are opened. */
  markable: boolean;
  lastSeenAt: string | null;
  lastSeenId: number;
}

export interface PhantomNavBoard {
  sections: PhantomNavCount[];
  totalUnseen: number;
  totalPending: number;
  classGroupsUnseen: number;
  checkedAt: string;
}

/**
 * One statement for every tab that counts from a table. Scalar subqueries, not a
 * `UNION ALL` chain: D1 refuses a compound SELECT with more than five terms, and
 * a board built that way fails as a whole while reading like "nothing new".
 */
const NAV_SQL = (() => {
  const columns: string[] = [];
  for (const section of PHANTOM_NAV_SECTIONS) {
    if (section.derive) continue;
    const arrivals = section.arrivals;
    if (!arrivals) continue;
    const seen = `COALESCE((SELECT last_seen_id FROM cgm_phantom_attention WHERE member_profile_id = ? AND tab_key = '${NAV_WATERMARK_PREFIX}${section.key}'), 0)`;
    columns.push(
      `(SELECT COUNT(*) FROM ${arrivals.table} t WHERE t.id > ${seen}${arrivals.where ? ` AND (${arrivals.where})` : ''}) AS "${section.key}_unseen"`,
    );
    const pending = section.pending || [];
    if (pending.length === 1) {
      columns.push(`(SELECT COUNT(*) FROM ${pending[0].table} WHERE ${pending[0].where}) AS "${section.key}_pending"`);
    } else if (pending.length > 1) {
      columns.push(`(${pending.map((spec) => `(SELECT COUNT(*) FROM ${spec.table} WHERE ${spec.where})`).join(' + ')}) AS "${section.key}_pending"`);
    } else {
      columns.push(`0 AS "${section.key}_pending"`);
    }
  }
  return `SELECT\n  ${columns.join(',\n  ')}`;
})();

/** Logged once per isolate so a broken statement never reads as "nothing new". */
let navSqlWarned = false;

export const phantomNavAttention = async (
  db: D1Database,
  memberProfileId: number,
): Promise<PhantomNavBoard> => {
  await ensurePhantomAttentionSchema(db);

  const unseen = new Map<string, number>();
  const pending = new Map<string, number>();
  try {
    const placeholders = (NAV_SQL.match(/\?/g) || []).length;
    const rows = await asRows<any>(db.prepare(NAV_SQL)
      .bind(...Array.from({ length: placeholders }, () => memberProfileId)));
    const row = rows[0] || {};
    for (const section of PHANTOM_NAV_SECTIONS) {
      unseen.set(section.key, Number(row[`${section.key}_unseen`] || 0));
      pending.set(section.key, Number(row[`${section.key}_pending`] || 0));
    }
  } catch (error) {
    if (!navSqlWarned) {
      navSqlWarned = true;
      console.error('phantomNavAttention: the navigation statement failed, every count reads as zero', String(error));
    }
  }

  // Class Groups is the sum of the oversight panel's sections, so the badge
  // falls exactly as PHANTOM opens them.
  try {
    const board = await phantomAttentionBoard(db, memberProfileId);
    unseen.set('classgroups', Number(board.totalUnseen || 0));
    pending.set('classgroups', Number(board.totalPending || 0));
  } catch { /* the class & groups module is not provisioned yet */ }

  const seenRows = await asRows<any>(db.prepare(
    "SELECT tab_key, last_seen_at, last_seen_id FROM cgm_phantom_attention WHERE member_profile_id = ? AND tab_key LIKE 'nav:%'"
  ).bind(memberProfileId)).catch(() => [] as any[]);
  const seenAt = new Map<string, string>();
  const seenId = new Map<string, number>();
  for (const row of seenRows) {
    const key = String(row.tab_key).slice(NAV_WATERMARK_PREFIX.length);
    seenAt.set(key, String(row.last_seen_at || ''));
    seenId.set(key, Number(row.last_seen_id || 0));
  }

  const sections: PhantomNavCount[] = PHANTOM_NAV_SECTIONS.map((section) => ({
    key: section.key,
    label: section.label,
    unseen: Number(unseen.get(section.key) || 0),
    pending: Number(pending.get(section.key) || 0),
    markable: Boolean(section.arrivals),
    lastSeenAt: seenAt.get(section.key) || null,
    lastSeenId: seenId.get(section.key) || 0,
  }));

  // The Overview tab is the grand total of everything else — including the
  // Class Groups sum, so one glance answers "is anything waiting on me?".
  const totalUnseen = sections
    .filter((section) => section.key !== 'overview')
    .reduce((sum, section) => sum + section.unseen, 0);
  const overview = sections.find((section) => section.key === 'overview');
  if (overview) overview.unseen = totalUnseen;

  return {
    sections,
    totalUnseen,
    totalPending: sections
      .filter((section) => section.key !== 'overview' && section.key !== 'classgroups')
      .reduce((sum, section) => sum + section.pending, 0) + Number(pending.get('classgroups') || 0),
    classGroupsUnseen: Number(unseen.get('classgroups') || 0),
    checkedAt: new Date().toISOString(),
  };
};

/**
 * "I have opened this tab." Moves this operator's watermark to the newest row
 * currently in that tab, so the badge clears for them while the work stays
 * exactly where it was. Derived tabs have no watermark of their own: their
 * number is the sections underneath, which clear themselves.
 */
export const markPhantomNavSeen = async (
  db: D1Database,
  memberProfileId: number,
  key: string,
): Promise<{ tab: string; seenAt: string; seenId: number } | null> => {
  const section = PHANTOM_NAV_SECTIONS.find((entry) => entry.key === key);
  const arrivals = section?.arrivals;
  if (!section || !arrivals) return null;
  await ensurePhantomAttentionSchema(db);

  const newestRows = await asRows<{ newest: number }>(db.prepare(
    `SELECT COALESCE(MAX(id), 0) AS newest FROM ${arrivals.table}`
  )).catch(() => [] as any[]);
  const newest = Number(newestRows[0]?.newest || 0);
  const nowRows = await asRows<{ now: string }>(db.prepare("SELECT datetime('now') AS now")).catch(() => [] as any[]);
  const seenAt = String(nowRows[0]?.now || new Date().toISOString().slice(0, 19).replace('T', ' '));
  const watermark = `${NAV_WATERMARK_PREFIX}${key}`;
  const previous = await asRows<{ seen_total: number }>(db.prepare(
    'SELECT seen_total FROM cgm_phantom_attention WHERE member_profile_id = ? AND tab_key = ?'
  ).bind(memberProfileId, watermark)).catch(() => [] as any[]);
  // What the badge was showing at this moment, kept for the record.
  const currentRows = await asRows<{ count: number }>(db.prepare(
    `SELECT COUNT(*) AS count FROM ${arrivals.table} t
      WHERE t.id > COALESCE((SELECT last_seen_id FROM cgm_phantom_attention WHERE member_profile_id = ? AND tab_key = ?), 0)
      ${arrivals.where ? `AND (${arrivals.where})` : ''}`
  ).bind(memberProfileId, watermark)).catch(() => [] as any[]);
  const seenTotal = Number(previous[0]?.seen_total || 0) + Number(currentRows[0]?.count || 0);

  await db.prepare(
    `INSERT INTO cgm_phantom_attention (member_profile_id, tab_key, last_seen_at, last_seen_id, seen_total, updated_at)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(member_profile_id, tab_key) DO UPDATE SET
       last_seen_at = excluded.last_seen_at,
       last_seen_id = excluded.last_seen_id,
       seen_total = excluded.seen_total,
       updated_at = CURRENT_TIMESTAMP`
  ).bind(memberProfileId, watermark, seenAt, newest, seenTotal).run();

  return { tab: key, seenAt, seenId: newest };
};
