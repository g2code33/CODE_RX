/**
 * The platform's existing Recycle Bin, extracted so every resource that is
 * deleted through an application route writes the SAME recoverable snapshot
 * into the SAME `recycle_bin_items` table.
 *
 * This is a move, not a new system: `functions/[[path]].ts` used this helper
 * privately for applications, subscribers, contacts and notifications. Phase 6
 * deletes client documents through the same path so a deleted client document
 * is recoverable from PHANTOM's Recycle Bin exactly like every other record.
 */

export interface RecycleActor {
  userId?: number | null;
}

export const moveToRecycleBin = async (
  db: D1Database,
  actor: RecycleActor | null,
  resourceType: string,
  resourceId: string | number,
  title: string,
  payload: unknown,
) => {
  const serialized = JSON.stringify(payload).slice(0, 250_000);
  const result = await db.prepare(
    'INSERT INTO recycle_bin_items (resource_type, resource_id, title, payload_json, deleted_by_user_id, deleted_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)'
  ).bind(resourceType.slice(0, 80), String(resourceId).slice(0, 120), title.slice(0, 240), serialized, actor?.userId ?? null).run();
  return Number(result.meta.last_row_id);
};
