/**
 * CODE Rx — PHANTOM'S ATTENTION BOARD for Class & Group Management.
 *
 * PHANTOM decides a handful of queues (organizer applications, class approvals,
 * sensitive profile changes, re-choose requests, Force Get requests, disputes)
 * and watches a few logs (module settings, registration delegation, organizer
 * activity, the audit trail). This module answers two questions per section,
 * cheaply and from live data:
 *
 *   pending — how much decision work is waiting right now (never clears by
 *             looking — it clears when the decision is actually made);
 *   unseen  — how much ARRIVED SINCE PHANTOM LAST OPENED THIS SECTION.
 *
 * The second number is the badge on the tab, and it is per PHANTOM account
 * (`cgm_phantom_attention` holds one watermark per member profile per tab), so
 * opening a section clears only that person's badge. The work itself is never
 * touched, another PHANTOM operator keeps their own count, and anything that
 * arrives afterwards brings the number straight back.
 *
 * Nothing here decides anything: every number is counted from the same table
 * the tab renders, so a badge can never claim work that is not really there.
 */

import { asRows } from './service';

/** One section of the oversight panel, in the order the panel shows them. */
export interface PhantomAttentionTab {
  key: string;
  label: string;
  /** True when the section holds decisions PHANTOM has to make. */
  queue: boolean;
  /** The table an arrival is counted from (absent = nothing to badge). */
  table?: string;
  /** What counts as a pending decision on that table. */
  pendingSql?: string;
  /** Narrow the arrival count (e.g. only policy changes in the audit log). */
  arrivalSql?: string;
}

export const PHANTOM_ATTENTION_TABS: PhantomAttentionTab[] = [
  { key: 'overview', label: 'Overview', queue: false },
  // Module settings live in the audit log, so an arrival is "somebody changed a
  // policy since you last opened the console".
  { key: 'policies', label: 'Module settings', queue: false, table: 'cgm_audit', arrivalSql: "action = 'cgm.module.policy'" },
  { key: 'applications', label: 'Organizer applications', queue: true, table: 'cgm_organizer_applications', pendingSql: "status IN ('pending','email_verified')" },
  { key: 'classes', label: 'Class approvals', queue: true, table: 'cgm_classes', pendingSql: "status = 'pending'" },
  { key: 'sensitive', label: 'Sensitive changes', queue: true, table: 'cgm_profile_change_requests', pendingSql: "status = 'pending' AND field IN ('gender','index_number','phone')" },
  { key: 'rechoose', label: 'Re-choose requests', queue: true, table: 'cgm_rechoose_requests', pendingSql: "status = 'pending'" },
  // Organizers no longer move or swap members directly: those are requests
  // PHANTOM approves, so they belong in the same attention board as the rest.
  { key: 'moves', label: 'Moves & swaps', queue: true, table: 'cgm_move_requests', pendingSql: "status = 'pending'" },
  { key: 'force-get', label: 'Force Get Requests', queue: true, table: 'cgm_force_get_requests', pendingSql: "status = 'pending'" },
  { key: 'delegation', label: 'Registration delegation', queue: false, table: 'cgm_approval_delegations', arrivalSql: "status = 'active'" },
  { key: 'disputes', label: 'Disputes', queue: true, table: 'cgm_announcement_reports', pendingSql: "status = 'open'" },
  { key: 'organizers', label: 'Organizer activity', queue: false, table: 'cgm_organizer_applications', arrivalSql: "status = 'approved'" },
  { key: 'audit', label: 'Audit trail', queue: false, table: 'cgm_audit' },
];

export const PHANTOM_QUEUE_TABS = PHANTOM_ATTENTION_TABS.filter((tab) => tab.queue).map((tab) => tab.key);

export const isPhantomAttentionTab = (key: unknown): key is string =>
  typeof key === 'string' && PHANTOM_ATTENTION_TABS.some((tab) => tab.key === key);

let attentionSchemaChecked = false;

/**
 * Idempotent bootstrap for warm isolates booted before this migration. The
 * schema bootstrap creates the table on the next cold start; a request that
 * arrives against a warm database must still work, exactly like the other
 * per-feature ensure helpers.
 */
export const ensurePhantomAttentionSchema = async (db: D1Database) => {
  if (attentionSchemaChecked) return;
  try {
    await db.batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS cgm_phantom_attention (
        member_profile_id INTEGER NOT NULL,
        tab_key TEXT NOT NULL,
        last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_seen_id INTEGER NOT NULL DEFAULT 0,
        seen_total INTEGER NOT NULL DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(member_profile_id, tab_key),
        FOREIGN KEY(member_profile_id) REFERENCES member_profiles(id)
      )`),
    ]);
    attentionSchemaChecked = true;
  } catch { /* already present, or retried on the next request */ }
};

export interface PhantomAttentionCount {
  key: string;
  label: string;
  queue: boolean;
  pending: number;
  unseen: number;
  lastSeenAt: string | null;
  /** Newest row id this operator has already seen on that section. */
  lastSeenId: number;
}

export interface PhantomAttentionBoard {
  tabs: PhantomAttentionCount[];
  /** Every decision waiting on PHANTOM, across every queue. */
  totalPending: number;
  /** Everything that arrived since PHANTOM last opened its own sections. */
  totalUnseen: number;
  unseenTabs: string[];
  checkedAt: string;
}

/**
 * One statement for the whole board. Every section contributes two counted
 * columns — the decision work waiting (`<key>_pending`) and what arrived after
 * this operator's watermark (`<key>_unseen`) — so a single round trip fills the
 * panel.
 *
 * Scalar subqueries, not a `UNION ALL` chain: D1 rejects a compound SELECT with
 * more than five terms ("too many terms in compound SELECT"), and this board has
 * a dozen sections. Each subquery compares row ids rather than timestamps,
 * because the arrival columns are stamped to the second and two events in the
 * same second would otherwise be indistinguishable — a badge that misses work
 * is worse than one that shows it twice.
 */
const BOARD_SQL = (() => {
  const columns: string[] = [];
  for (const tab of PHANTOM_ATTENTION_TABS) {
    const table = tab.table;
    if (!table) {
      columns.push(`0 AS "${tab.key}_pending"`, `0 AS "${tab.key}_unseen"`);
      continue;
    }
    const seenId = `COALESCE((SELECT last_seen_id FROM cgm_phantom_attention WHERE member_profile_id = ? AND tab_key = '${tab.key}'), 0)`;
    columns.push(tab.queue && tab.pendingSql
      ? `(SELECT COUNT(*) FROM ${table} t WHERE ${tab.pendingSql}) AS "${tab.key}_pending"`
      : `0 AS "${tab.key}_pending"`);
    const narrow = tab.arrivalSql || tab.pendingSql;
    columns.push(
      `(SELECT COUNT(*) FROM ${table} t WHERE t.id > ${seenId}${narrow ? ` AND (${narrow})` : ''}) AS "${tab.key}_unseen"`,
    );
  }
  return `SELECT\n  ${columns.join(',\n  ')}`;
})();

/** Logged once per isolate so a broken statement never reads as "nothing new". */
let boardSqlWarned = false;

export const phantomAttentionBoard = async (
  db: D1Database,
  memberProfileId: number,
): Promise<PhantomAttentionBoard> => {
  await ensurePhantomAttentionSchema(db);
  const counts = new Map<string, number>();
  const unseen = new Map<string, number>();
  try {
    const placeholders = (BOARD_SQL.match(/\?/g) || []).length;
    const rows = await asRows<any>(db.prepare(BOARD_SQL)
      .bind(...Array.from({ length: placeholders }, () => memberProfileId)));
    const row = rows[0] || {};
    for (const tab of PHANTOM_ATTENTION_TABS) {
      counts.set(tab.key, Number(row[`${tab.key}_pending`] || 0));
      unseen.set(tab.key, Number(row[`${tab.key}_unseen`] || 0));
    }
  } catch (error) {
    if (!boardSqlWarned) {
      boardSqlWarned = true;
      console.error('phantomAttentionBoard: the board statement failed, every count reads as zero', String(error));
    }
  }

  const seenRows = await asRows<any>(db.prepare(
    'SELECT tab_key, last_seen_at, last_seen_id FROM cgm_phantom_attention WHERE member_profile_id = ?'
  ).bind(memberProfileId)).catch(() => [] as any[]);
  const seenAt = new Map<string, string>();
  const seenId = new Map<string, number>();
  for (const row of seenRows) {
    seenAt.set(String(row.tab_key), String(row.last_seen_at || ''));
    seenId.set(String(row.tab_key), Number(row.last_seen_id || 0));
  }

  const tabs: PhantomAttentionCount[] = PHANTOM_ATTENTION_TABS.map((tab) => ({
    key: tab.key,
    label: tab.label,
    queue: tab.queue,
    pending: tab.queue ? Number(counts.get(tab.key) || 0) : 0,
    unseen: Number(unseen.get(tab.key) || 0),
    lastSeenAt: seenAt.get(tab.key) || null,
    lastSeenId: seenId.get(tab.key) || 0,
  }));

  return {
    tabs,
    totalPending: tabs.filter((tab) => tab.queue).reduce((sum, tab) => sum + tab.pending, 0),
    totalUnseen: tabs.reduce((sum, tab) => sum + tab.unseen, 0),
    unseenTabs: tabs.filter((tab) => tab.unseen > 0).map((tab) => tab.key),
    checkedAt: new Date().toISOString(),
  };
};

/**
 * "I have looked at this section." Moves this operator's watermark to the newest
 * row currently on the tab, so that tab's badge clears for them while the work
 * stays exactly where it was. The count that was showing is kept for the record
 * (`seen_total`).
 */
export const markPhantomTabSeen = async (
  db: D1Database,
  memberProfileId: number,
  tabKey: string,
): Promise<{ tab: string; seenAt: string; seenId: number } | null> => {
  const spec = PHANTOM_ATTENTION_TABS.find((entry) => entry.key === tabKey);
  if (!spec) return null;
  await ensurePhantomAttentionSchema(db);

  const board = await phantomAttentionBoard(db, memberProfileId);
  const current = board.tabs.find((entry) => entry.key === tabKey);
  let newest = 0;
  const source = spec.table;
  if (source) {
    const maxRows = await asRows<{ newest: number }>(db.prepare(
      `SELECT COALESCE(MAX(id), 0) AS newest FROM ${source}`
    )).catch(() => [] as any[]);
    newest = Number(maxRows[0]?.newest || 0);
  }
  const nowRows = await asRows<{ now: string }>(db.prepare("SELECT datetime('now') AS now")).catch(() => [] as any[]);
  const seenAt = String(nowRows[0]?.now || new Date().toISOString().slice(0, 19).replace('T', ' '));
  const previous = await asRows<{ seen_total: number }>(db.prepare(
    'SELECT seen_total FROM cgm_phantom_attention WHERE member_profile_id = ? AND tab_key = ?'
  ).bind(memberProfileId, tabKey)).catch(() => [] as any[]);
  const seenTotal = Number(previous[0]?.seen_total || 0) + Number(current?.unseen || 0);

  await db.prepare(
    `INSERT INTO cgm_phantom_attention (member_profile_id, tab_key, last_seen_at, last_seen_id, seen_total, updated_at)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(member_profile_id, tab_key) DO UPDATE SET
       last_seen_at = excluded.last_seen_at,
       last_seen_id = excluded.last_seen_id,
       seen_total = excluded.seen_total,
       updated_at = CURRENT_TIMESTAMP`
  ).bind(memberProfileId, tabKey, seenAt, newest, seenTotal).run();

  return { tab: tabKey, seenAt, seenId: newest };
};
