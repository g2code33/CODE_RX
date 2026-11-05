/**
 * CODE Rx — ORGANIZER RECYCLE BIN for Class & Group Management.
 *
 * Every destructive thing an organizer can do in this module (delete an
 * election, remove a student from a group, drop a roster row, delete a template,
 * take an announcement down) records a FULL SNAPSHOT of the rows it touched
 * here, before it touches them. The organizer's own Recycle Bin lists those
 * snapshots and puts them back exactly as they were — same ids, same seats, same
 * ballots — so a mistake is reversible instead of final.
 *
 * Nothing is invented on restore: the rows are the rows that were deleted.
 */

import { asRows } from './service';

export const CGM_RECYCLE_DDL = `CREATE TABLE IF NOT EXISTS cgm_recycle (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id INTEGER,
  activity_id INTEGER,
  group_id INTEGER,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  title TEXT NOT NULL DEFAULT '',
  detail TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  actor_label TEXT,
  actor_profile_id INTEGER,
  deleted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  restored_at DATETIME,
  restored_by_label TEXT
)`;

export const ensureCgmRecycleSchema = async (db: D1Database) => {
  try {
    await db.batch([
      db.prepare(CGM_RECYCLE_DDL),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_cgm_recycle_class ON cgm_recycle(class_id, deleted_at)'),
    ]);
  } catch { /* already provisioned, or retried on the next request */ }
};

/** Only module tables are ever written back, and only ones we snapshot. */
const RESTORABLE_TABLES = new Set([
  'cgm_elections', 'cgm_candidates', 'cgm_election_ballots', 'cgm_election_participation',
  'cgm_tie_breaks', 'cgm_announcements', 'cgm_roster_entries', 'cgm_activity_templates',
  'cgm_group_assignments', 'cgm_class_members',
]);

export interface RecycleTableRows {
  table: string;
  rows: Array<Record<string, unknown>>;
}

/**
 * Snapshot rows before they are deleted or changed. Called with the exact rows
 * that are about to move, so the restore is a re-insert, never a guess.
 */
export const snapshotRows = async (
  db: D1Database,
  tables: RecycleTableRows[],
): Promise<{ tables: RecycleTableRows[] }> => {
  const kept: RecycleTableRows[] = [];
  for (const group of tables) {
    if (!RESTORABLE_TABLES.has(group.table)) continue;
    kept.push({ table: group.table, rows: group.rows.filter(Boolean) });
  }
  return { tables: kept };
};

/** The same rows, read straight out of the database right now. */
export const snapshotFromDb = async (
  db: D1Database,
  specs: Array<{ table: string; where: string; params: unknown[] }>,
): Promise<{ tables: RecycleTableRows[] }> => {
  const tables: RecycleTableRows[] = [];
  for (const spec of specs) {
    if (!RESTORABLE_TABLES.has(spec.table)) continue;
    const rows = await asRows<Record<string, unknown>>(db.prepare(
      `SELECT * FROM ${spec.table} WHERE ${spec.where}`,
    ).bind(...spec.params)).catch(() => [] as any[]);
    if (rows.length) tables.push({ table: spec.table, rows: rows as any });
  }
  return { tables };
};

export interface RecycleEntryInput {
  classId?: number | null;
  activityId?: number | null;
  groupId?: number | null;
  entityType: string;
  entityId?: number | null;
  title: string;
  detail?: string | null;
  payload: { tables: RecycleTableRows[] };
  actorLabel?: string | null;
  actorProfileId?: number | null;
}

/** Records one reversible action and returns its bin id (0 when nothing to keep). */
export const recordRecycle = async (db: D1Database, entry: RecycleEntryInput): Promise<number> => {
  await ensureCgmRecycleSchema(db);
  const kept = entry.payload.tables.filter((group) => group.rows.length);
  if (!kept.length) return 0;
  const result = await db.prepare(
    `INSERT INTO cgm_recycle
      (class_id, activity_id, group_id, entity_type, entity_id, title, detail, payload_json, actor_label, actor_profile_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    entry.classId ?? null, entry.activityId ?? null, entry.groupId ?? null,
    entry.entityType, entry.entityId ?? null, entry.title.slice(0, 200), entry.detail ?? null,
    JSON.stringify({ tables: kept }), entry.actorLabel ?? null, entry.actorProfileId ?? null,
  ).run();
  return Number(result.meta.last_row_id || 0);
};

export interface RecycleRow {
  id: number;
  classId: number | null;
  activityId: number | null;
  groupId: number | null;
  entityType: string;
  entityId: number | null;
  title: string;
  detail: string | null;
  actor: string | null;
  deletedAt: string;
  restoredAt: string | null;
  restoredBy: string | null;
  restored: boolean;
  tableCount: number;
  rowCount: number;
}

export const listRecycle = async (
  db: D1Database,
  classId: number | null,
  limit = 100,
): Promise<RecycleRow[]> => {
  await ensureCgmRecycleSchema(db);
  const rows = await asRows<any>(db.prepare(
    `SELECT * FROM cgm_recycle ${classId ? 'WHERE class_id = ?' : ''} ORDER BY id DESC LIMIT ?`,
  ).bind(...(classId ? [classId, limit] : [limit])));
  return rows.map((row) => {
    let tables: RecycleTableRows[] = [];
    try { tables = JSON.parse(String(row.payload_json || '{}')).tables || []; } catch { tables = []; }
    return {
      id: Number(row.id),
      classId: row.class_id === null ? null : Number(row.class_id),
      activityId: row.activity_id === null ? null : Number(row.activity_id),
      groupId: row.group_id === null ? null : Number(row.group_id),
      entityType: String(row.entity_type),
      entityId: row.entity_id === null ? null : Number(row.entity_id),
      title: String(row.title || ''),
      detail: row.detail === null ? null : String(row.detail),
      actor: row.actor_label === null ? null : String(row.actor_label),
      deletedAt: String(row.deleted_at || ''),
      restoredAt: row.restored_at === null ? null : String(row.restored_at),
      restoredBy: row.restored_by_label === null ? null : String(row.restored_by_label),
      restored: Boolean(row.restored_at),
      tableCount: tables.length,
      rowCount: tables.reduce((sum, group) => sum + group.rows.length, 0),
    };
  });
};

/**
 * Puts the snapshot back. Ids are preserved, so a restored election keeps the
 * ballots that were cast in it and a restored member keeps their seat.
 */
export const restoreRecycle = async (
  db: D1Database,
  id: number,
  actorLabel: string,
): Promise<{ ok: true; restored: RecycleRow } | { ok: false; status: number; error: string }> => {
  await ensureCgmRecycleSchema(db);
  const rows = await asRows<any>(db.prepare('SELECT * FROM cgm_recycle WHERE id = ?').bind(id));
  const entry = rows[0];
  if (!entry) return { ok: false, status: 404, error: 'That recycle-bin entry no longer exists.' };
  if (entry.restored_at) return { ok: false, status: 409, error: 'That change was already reversed.' };

  let payload: { tables?: RecycleTableRows[] } = {};
  try { payload = JSON.parse(String(entry.payload_json || '{}')); } catch { payload = {}; }
  const tables = Array.isArray(payload.tables) ? payload.tables : [];
  if (!tables.length) return { ok: false, status: 409, error: 'That entry has nothing left to restore.' };

  try {
    for (const group of tables) {
      if (!RESTORABLE_TABLES.has(group.table)) continue;
      for (const row of group.rows) {
        const columns = Object.keys(row).filter((column) => /^[a-z_]+$/i.test(column));
        if (!columns.length) continue;
        const sql = `INSERT OR REPLACE INTO ${group.table} (${columns.join(', ')})
                     VALUES (${columns.map(() => '?').join(', ')})`;
        await db.prepare(sql).bind(...columns.map((column) => row[column] as any)).run();
      }
    }
  } catch (error: any) {
    return { ok: false, status: 409, error: `Could not reverse that change: ${String(error?.message || error).slice(0, 160)}` };
  }

  await db.prepare(
    `UPDATE cgm_recycle SET restored_at = CURRENT_TIMESTAMP, restored_by_label = ? WHERE id = ?`,
  ).bind(actorLabel, id).run();
  const refreshed = await listRecycle(db, null, 1_000_000);
  const found = refreshed.find((row) => row.id === id);
  return { ok: true, restored: found as RecycleRow };
};
