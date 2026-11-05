/**
 * CODE Rx SOCIETY — FORCE GET.
 *
 * An organizer proposes a destination group for named students. NOTHING moves
 * when the proposal is submitted: PHANTOM must approve it, and only then does a
 * live "designation" exist. A designation never assigns anybody by itself —
 * every student still samples with the activity's own method, and the sampling
 * endpoint then places them in their designated group instead of a random one.
 *
 * Rules encoded here (all enforced server-side, never from a frontend flag):
 *   • one live designation per student per activity (partial UNIQUE index)
 *   • a requested version can be approved once and is immutable afterwards
 *   • a designation reserves its seat, so ordinary sampling cannot take it
 *   • a designation is applied exactly once, and survives an individual
 *     Re-choose (which releases the seat but keeps the destination)
 *   • designation never bypasses PHANTOM, capacity, gender or eligibility
 */

import { asRows, auditCgm } from './service';
import {
  asGender, evaluateComposition,
  type CompositionGroupInput, type CompositionMember, type CompositionReport, type Gender,
} from './groupComposition';

/** Idempotent bootstrap for warm isolates booted before this migration. */
let forceGetSchemaChecked = false;
export const ensureForceGetSchema = async (db: D1Database) => {
  if (forceGetSchemaChecked) return;
  try {
    await db.batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS cgm_force_get_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        activity_id INTEGER NOT NULL,
        class_id INTEGER NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','superseded','cancelled')),
        explanation TEXT,
        student_count INTEGER NOT NULL DEFAULT 0,
        requested_by_profile_id INTEGER,
        requester_label TEXT,
        reviewed_by_profile_id INTEGER,
        reviewer_label TEXT,
        review_reason TEXT,
        superseded_by_request_id INTEGER,
        submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        reviewed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(activity_id) REFERENCES cgm_activities(id)
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS cgm_force_get_request_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        request_id INTEGER NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        student_id INTEGER NOT NULL,
        destination_group_id INTEGER NOT NULL,
        previous_group_id INTEGER,
        sampled_at_submission INTEGER NOT NULL DEFAULT 0,
        rechoose_state TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(request_id) REFERENCES cgm_force_get_requests(id),
        FOREIGN KEY(student_id) REFERENCES cgm_students(id)
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS cgm_force_get_designations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        activity_id INTEGER NOT NULL,
        class_id INTEGER NOT NULL,
        student_id INTEGER NOT NULL,
        designated_group_id INTEGER NOT NULL,
        approved_request_id INTEGER,
        request_version INTEGER,
        designated_by_profile_id INTEGER,
        designated_by_label TEXT,
        approved_by_profile_id INTEGER,
        approved_by_label TEXT,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','applied','superseded','cleared')),
        applied_assignment_id INTEGER,
        designated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        applied_at DATETIME,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(activity_id) REFERENCES cgm_activities(id),
        FOREIGN KEY(student_id) REFERENCES cgm_students(id)
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS cgm_force_get_request_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        request_id INTEGER NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        roster_entry_id INTEGER NOT NULL,
        destination_group_id INTEGER NOT NULL,
        previous_group_id INTEGER,
        full_name TEXT NOT NULL DEFAULT '',
        index_number TEXT NOT NULL DEFAULT '',
        gender_at_submission TEXT NOT NULL DEFAULT 'unknown' CHECK (gender_at_submission IN ('male','female','unknown')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(request_id) REFERENCES cgm_force_get_requests(id)
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS cgm_force_get_reservations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        activity_id INTEGER NOT NULL,
        class_id INTEGER NOT NULL,
        roster_entry_id INTEGER NOT NULL,
        student_id INTEGER,
        full_name TEXT NOT NULL,
        index_number TEXT NOT NULL,
        gender TEXT NOT NULL DEFAULT 'unknown' CHECK (gender IN ('male','female','unknown')),
        designated_group_id INTEGER NOT NULL,
        approved_request_id INTEGER,
        request_version INTEGER,
        designated_by_profile_id INTEGER,
        designated_by_label TEXT,
        approved_by_profile_id INTEGER,
        approved_by_label TEXT,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','converted','superseded','cleared')),
        converted_designation_id INTEGER,
        designated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        converted_at DATETIME,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(activity_id) REFERENCES cgm_activities(id)
      )`),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_cgm_force_get_requests_activity ON cgm_force_get_requests(activity_id, status, id DESC)'),
      db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_cgm_force_get_entries_unique ON cgm_force_get_request_entries(request_id, version, roster_entry_id)'),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_cgm_force_get_entries_request ON cgm_force_get_request_entries(request_id, version)'),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_cgm_force_get_reservations_activity ON cgm_force_get_reservations(activity_id, status)'),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_cgm_force_get_reservations_entry ON cgm_force_get_reservations(roster_entry_id, status)'),
      db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_cgm_force_get_reservations_live ON cgm_force_get_reservations(activity_id, roster_entry_id) WHERE status = 'active'"),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_cgm_force_get_items_request ON cgm_force_get_request_items(request_id, version)'),
      db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_cgm_force_get_items_unique ON cgm_force_get_request_items(request_id, version, student_id)'),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_cgm_force_get_designations_student ON cgm_force_get_designations(activity_id, student_id, status)'),
      db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_cgm_force_get_designations_live ON cgm_force_get_designations(activity_id, student_id) WHERE status = 'active'"),
    ]);
    forceGetSchemaChecked = true;
  } catch { /* already present, or retried on the next request */ }
};

export type Designation = {
  id: number;
  studentId: number;
  groupId: number;
  requestId: number | null;
  version: number | null;
  status: string;
};

/**
 * The live designation for one student — only when it is really actionable:
 * the destination group must still be an active group of the SAME activity.
 * A designation pointing at an archived/foreign group is ignored (and the
 * student simply samples normally) rather than being silently honoured.
 */
export const activeDesignationFor = async (
  db: D1Database,
  activityId: number,
  studentId: number,
): Promise<Designation | null> => {
  try {
    const rows = await asRows<any>(db.prepare(
      `SELECT d.id, d.student_id, d.designated_group_id, d.approved_request_id, d.request_version, d.status
       FROM cgm_force_get_designations d
       JOIN cgm_groups g ON g.id = d.designated_group_id
       WHERE d.activity_id = ? AND d.student_id = ? AND d.status = 'active'
         AND g.activity_id = d.activity_id AND g.status = 'active'
       LIMIT 1`
    ).bind(activityId, studentId));
    const row = rows[0];
    if (!row) return null;
    return {
      id: Number(row.id), studentId: Number(row.student_id), groupId: Number(row.designated_group_id),
      requestId: row.approved_request_id === null ? null : Number(row.approved_request_id),
      version: row.request_version === null ? null : Number(row.request_version), status: String(row.status),
    };
  } catch { return null; }
};

/** Map of studentId → designation for every live designation in the activity. */
export const activeDesignationsFor = async (db: D1Database, activityId: number) => {
  const map = new Map<number, Designation>();
  try {
    const rows = await asRows<any>(db.prepare(
      `SELECT d.id, d.student_id, d.designated_group_id, d.approved_request_id, d.request_version, d.status
       FROM cgm_force_get_designations d
       JOIN cgm_groups g ON g.id = d.designated_group_id
       WHERE d.activity_id = ? AND d.status = 'active'
         AND g.activity_id = d.activity_id AND g.status = 'active'`
    ).bind(activityId));
    for (const row of rows) {
      map.set(Number(row.student_id), {
        id: Number(row.id), studentId: Number(row.student_id), groupId: Number(row.designated_group_id),
        requestId: row.approved_request_id === null ? null : Number(row.approved_request_id),
        version: row.request_version === null ? null : Number(row.request_version), status: String(row.status),
      });
    }
  } catch { /* pre-migration database: no designations yet */ }
  return map;
};

/**
 * Reserved seats per group: approved designations whose student is NOT yet an
 * active member of that group. A student who is currently sitting in the group
 * (awaiting their own Re-choose) does not get counted twice.
 */
export const reservedSeatsFor = async (db: D1Database, activityId: number) => {
  const map = new Map<number, number>();
  try {
    const rows = await asRows<any>(db.prepare(
      `SELECT d.designated_group_id AS group_id, COUNT(*) AS reserved
       FROM cgm_force_get_designations d
       JOIN cgm_groups g ON g.id = d.designated_group_id AND g.activity_id = d.activity_id AND g.status = 'active'
       WHERE d.activity_id = ? AND d.status = 'active'
         AND NOT EXISTS (SELECT 1 FROM cgm_group_assignments ga
                         WHERE ga.activity_id = d.activity_id AND ga.student_id = d.student_id
                           AND ga.group_id = d.designated_group_id AND ga.status = 'active')
       GROUP BY d.designated_group_id`
    ).bind(activityId));
    for (const row of rows) map.set(Number(row.group_id), Number(row.reserved || 0));
    // Seats held for students who are on the roster but have not registered yet
    // count exactly the same way: nobody else may take that seat in the
    // meantime. They become designations the moment the row registers.
    const held = await asRows<any>(db.prepare(
      `SELECT r.designated_group_id AS group_id, COUNT(*) AS reserved
       FROM cgm_force_get_reservations r
       JOIN cgm_groups g ON g.id = r.designated_group_id AND g.activity_id = r.activity_id AND g.status = 'active'
       WHERE r.activity_id = ? AND r.status = 'active'
       GROUP BY r.designated_group_id`
    ).bind(activityId));
    for (const row of held) {
      map.set(Number(row.group_id), (map.get(Number(row.group_id)) || 0) + Number(row.reserved || 0));
    }
  } catch { /* pre-migration database */ }
  return map;
};

/**
 * Seat-claiming INSERT that respects BOTH the hard capacity and the seats
 * reserved for approved designations. It is one statement, so SQLite/D1
 * serialises it — two concurrent writers can never both take the last seat.
 *
 * `studentId`'s OWN reservation never blocks that student.
 */
export const insertAssignmentRespectingDesignations = async (
  db: D1Database,
  input: {
    activityId: number; groupId: number; studentId: number; via: string; label: string;
    /**
     * When the activity uses `genderRule = 'separate'`, the destination must
     * still hold a single gender pool — checked inside the same statement, so a
     * concurrent placement can never create a mixed group behind our back.
     */
    enforceGenderPools?: boolean;
    studentGender?: Gender | string;
  },
): Promise<boolean> => {
  const enforcePools = input.enforceGenderPools ? 1 : 0;
  const studentGender = asGender(input.studentGender);
  try {
    await ensureForceGetSchema(db);
    const result = await db.prepare(
      `INSERT INTO cgm_group_assignments (activity_id, group_id, student_id, assigned_via, assigned_by_label)
       SELECT ?, ?, ?, ?, ?
       WHERE NOT EXISTS (SELECT 1 FROM cgm_group_assignments
                         WHERE activity_id = ? AND student_id = ? AND status = 'active')
         AND (SELECT COUNT(*) FROM cgm_group_assignments WHERE group_id = ? AND status = 'active')
             + (SELECT COUNT(*) FROM cgm_force_get_designations d
                WHERE d.activity_id = ? AND d.designated_group_id = ? AND d.status = 'active'
                  AND d.student_id <> ?
                  -- a member already sitting in the group must never be counted twice
                  AND NOT EXISTS (SELECT 1 FROM cgm_group_assignments x
                                  WHERE x.activity_id = d.activity_id AND x.student_id = d.student_id
                                    AND x.group_id = d.designated_group_id AND x.status = 'active'))
             -- seats held for students who are on the roster but not registered
             -- yet are reserved exactly like designations
             + (SELECT COUNT(*) FROM cgm_force_get_reservations r
                WHERE r.activity_id = ? AND r.designated_group_id = ? AND r.status = 'active')
             < COALESCE((SELECT capacity FROM cgm_groups WHERE id = ?), 9223372036854775807)
         -- genderRule = 'separate': one pool per group, 'unknown' is its own
         -- pool. Checked atomically against live members AND live reservations.
         AND (? = 0 OR NOT EXISTS (
               SELECT 1 FROM cgm_group_assignments gm JOIN cgm_students sm ON sm.id = gm.student_id
               WHERE gm.group_id = ? AND gm.status = 'active'
                 AND COALESCE(LOWER(TRIM(sm.gender)), 'unknown') <> ?
             ))
         AND (? = 0 OR NOT EXISTS (
               SELECT 1 FROM cgm_force_get_designations dm JOIN cgm_students sd ON sd.id = dm.student_id
               WHERE dm.activity_id = ? AND dm.designated_group_id = ? AND dm.status = 'active'
                 AND dm.student_id <> ?
                 AND COALESCE(LOWER(TRIM(sd.gender)), 'unknown') <> ?
             ))
         AND (? = 0 OR NOT EXISTS (
               SELECT 1 FROM cgm_force_get_reservations r JOIN cgm_roster_entries re ON re.id = r.roster_entry_id
               WHERE r.activity_id = ? AND r.designated_group_id = ? AND r.status = 'active'
                 AND COALESCE(NULLIF(LOWER(TRIM(re.gender)), ''), 'unknown') <> ?
             ))`
    ).bind(
      input.activityId, input.groupId, input.studentId, input.via, input.label,
      input.activityId, input.studentId,
      input.groupId,
      input.activityId, input.groupId, input.studentId,
      input.activityId, input.groupId,
      input.groupId,
      enforcePools, input.groupId, studentGender,
      enforcePools, input.activityId, input.groupId, input.studentId, studentGender,
      enforcePools, input.activityId, input.groupId, studentGender,
    ).run();
    return Number((result as any)?.meta?.changes || 0) > 0;
  } catch {
    // No Force Get tables yet on this database — fall back to the plain guard
    // so ordinary assignment keeps working exactly as before.
    const result = await db.prepare(
      `INSERT INTO cgm_group_assignments (activity_id, group_id, student_id, assigned_via, assigned_by_label)
       SELECT ?, ?, ?, ?, ?
       WHERE NOT EXISTS (SELECT 1 FROM cgm_group_assignments
                         WHERE activity_id = ? AND student_id = ? AND status = 'active')
         AND (SELECT COUNT(*) FROM cgm_group_assignments WHERE group_id = ? AND status = 'active')
             < COALESCE((SELECT capacity FROM cgm_groups WHERE id = ?), 9223372036854775807)
         AND (? = 0 OR NOT EXISTS (
               SELECT 1 FROM cgm_group_assignments gm JOIN cgm_students sm ON sm.id = gm.student_id
               WHERE gm.group_id = ? AND gm.status = 'active'
                 AND COALESCE(LOWER(TRIM(sm.gender)), 'unknown') <> ?
             ))`
    ).bind(input.activityId, input.groupId, input.studentId, input.via, input.label,
      input.activityId, input.studentId, input.groupId, input.groupId,
      enforcePools, input.groupId, studentGender).run();
    return Number((result as any)?.meta?.changes || 0) > 0;
  }
};

/**
 * Mark a designation as delivered. Runs at most once: the UPDATE is guarded on
 * `status = 'active'`, so a retried request can never apply it twice.
 * Returns true only for the call that actually consumed it.
 */
export const markDesignationApplied = async (
  db: D1Database,
  designationId: number,
  assignmentId: number | null,
): Promise<boolean> => {
  try {
    const result = await db.prepare(
      `UPDATE cgm_force_get_designations
       SET status = 'applied', applied_assignment_id = COALESCE(?, applied_assignment_id),
           applied_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'active'`
    ).bind(assignmentId, designationId).run();
    return Number((result as any)?.meta?.changes || 0) > 0;
  } catch { return false; }
};

/**
 * APPROVED SEATS FOR STUDENTS WHO HAVE NOT REGISTERED YET.
 *
 * The class roster knows these people (name, index number, gender) but they have
 * no student identity, so a designation cannot point at them. A `reservation`
 * holds the seat instead: it counts towards capacity and the gender pool exactly
 * like an approved designation, it is created only by a PHANTOM approval, and it
 * becomes a real designation the moment the roster row registers — so the
 * student still samples with the activity's own method and lands where the
 * organizer was allowed to put them.
 */
export type RosterReservation = {
  id: number;
  rosterEntryId: number;
  groupId: number;
  groupName: string | null;
  status: string;
  approvedBy: string | null;
  approvedAt: string | null;
};

/** Live reservations for one activity, keyed by roster entry id. */
export const rosterReservationsFor = async (db: D1Database, activityId: number) => {
  const map = new Map<number, RosterReservation>();
  try {
    const rows = await asRows<any>(db.prepare(
      `SELECT r.id, r.roster_entry_id, r.designated_group_id, r.status, r.approved_by_label, r.designated_at,
              g.name AS group_name, g.position AS group_position
       FROM cgm_force_get_reservations r
       LEFT JOIN cgm_groups g ON g.id = r.designated_group_id AND g.status = 'active'
       WHERE r.activity_id = ? AND r.status = 'active'`
    ).bind(activityId));
    for (const row of rows) {
      map.set(Number(row.roster_entry_id), {
        id: Number(row.id), rosterEntryId: Number(row.roster_entry_id),
        groupId: Number(row.designated_group_id),
        groupName: row.group_name || (row.group_position ? `Group ${row.group_position}` : null),
        status: String(row.status), approvedBy: row.approved_by_label || null,
        approvedAt: row.designated_at || null,
      });
    }
  } catch { /* pre-migration database: no reservations yet */ }
  return map;
};

/**
 * Record an approved seat for an unregistered roster row. One live reservation
 * per (activity, roster entry): a newer approval supersedes the previous seat
 * instead of stacking a second one.
 */
export const reserveRosterEntry = async (db: D1Database, input: {
  activityId: number; classId: number; rosterEntryId: number;
  fullName: string; indexNumber: string; gender: string;
  groupId: number; requestId: number | null; version: number | null;
  designatedByProfileId: number | null; designatedByLabel: string | null;
  approvedByProfileId: number | null; approvedByLabel: string | null;
}): Promise<number | null> => {
  await ensureForceGetSchema(db);
  const previous = await asRows<{ id: number }>(db.prepare(
    `SELECT id FROM cgm_force_get_reservations
     WHERE activity_id = ? AND roster_entry_id = ? AND status = 'active'`
  ).bind(input.activityId, input.rosterEntryId));
  for (const row of previous) {
    await db.prepare(
      `UPDATE cgm_force_get_reservations SET status = 'superseded', updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'active'`
    ).bind(Number(row.id)).run();
  }
  const inserted = await db.prepare(
    `INSERT INTO cgm_force_get_reservations
       (activity_id, class_id, roster_entry_id, full_name, index_number, gender, designated_group_id,
        approved_request_id, request_version, designated_by_profile_id, designated_by_label,
        approved_by_profile_id, approved_by_label, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`
  ).bind(
    input.activityId, input.classId, input.rosterEntryId, input.fullName, input.indexNumber,
    asGender(input.gender), input.groupId, input.requestId, input.version,
    input.designatedByProfileId, input.designatedByLabel, input.approvedByProfileId, input.approvedByLabel,
  ).run();
  return Number((inserted as any)?.meta?.last_row_id || 0) || null;
};

/**
 * The roster row was deleted before registering: release the seat it was holding
 * so the seat returns to the group (and the row can be deleted at all — the
 * reservation references it).
 */
export const releaseReservationsForEntries = async (db: D1Database, rosterEntryIds: number[], input: {
  label?: string | null; profileId?: number | null;
}): Promise<number> => {
  const ids = [...new Set(rosterEntryIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
  if (!ids.length) return 0;
  let released = 0;
  try {
    await ensureForceGetSchema(db);
    const placeholders = ids.map(() => '?').join(', ');
    const rows = await asRows<any>(db.prepare(
      `SELECT id, activity_id, class_id, roster_entry_id, designated_group_id
       FROM cgm_force_get_reservations
       WHERE status = 'active' AND roster_entry_id IN (${placeholders})`
    ).bind(...ids));
    for (const row of rows) {
      const result = await db.prepare(
        `UPDATE cgm_force_get_reservations SET status = 'cleared', updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'active'`
      ).bind(Number(row.id)).run();
      if (!(Number((result as any)?.meta?.changes || 0) > 0)) continue;
      released += 1;
      await auditCgm(db, {
        actorType: 'organizer', actorLabel: input.label || 'Organizer', actorProfileId: input.profileId ?? null,
        action: 'cgm.force_get.reservation_cleared', entityType: 'force_get_reservation', entityId: Number(row.id),
        classId: Number(row.class_id), activityId: Number(row.activity_id),
        context: { rosterEntryId: Number(row.roster_entry_id), groupId: Number(row.designated_group_id) },
      });
    }
  } catch { /* pre-migration database: nothing to release */ }
  return released;
};

/**
 * A roster row just registered: turn every live reservation for it into a real
 * designation (the same row an approval creates for a registered student), so
 * the seat it held is now held in their own name. Idempotent: the reservation is
 * claimed with `status = 'active'` in the WHERE clause, so a retried approval can
 * never create a second designation.
 */
export const convertReservationsForEntry = async (db: D1Database, input: {
  rosterEntryId: number; studentId: number; classId: number; label?: string | null;
}): Promise<Array<{ activityId: number; activityName: string; groupId: number; groupName: string }>> => {
  const converted: Array<{ activityId: number; activityName: string; groupId: number; groupName: string }> = [];
  try {
    await ensureForceGetSchema(db);
    const rows = await asRows<any>(db.prepare(
      `SELECT r.*, a.name AS activity_name, g.name AS group_name, g.position AS group_position
       FROM cgm_force_get_reservations r
       JOIN cgm_activities a ON a.id = r.activity_id
       JOIN cgm_groups g ON g.id = r.designated_group_id AND g.activity_id = r.activity_id AND g.status = 'active'
       WHERE r.roster_entry_id = ? AND r.status = 'active'`
    ).bind(input.rosterEntryId));
    for (const row of rows) {
      const activityId = Number(row.activity_id);
      const groupId = Number(row.designated_group_id);
      // One live designation per student per activity.
      const previous = await asRows<any>(db.prepare(
        `SELECT id FROM cgm_force_get_designations
         WHERE activity_id = ? AND student_id = ? AND status = 'active'`
      ).bind(activityId, input.studentId));
      for (const stale of previous) {
        await db.prepare(
          `UPDATE cgm_force_get_designations SET status = 'superseded', updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND status = 'active'`
        ).bind(Number(stale.id)).run();
      }
      const currentAssignment = await activeAssignmentId(db, activityId, input.studentId);
      const currentRows = currentAssignment
        ? await asRows<any>(db.prepare('SELECT group_id FROM cgm_group_assignments WHERE id = ?').bind(currentAssignment))
        : [];
      const alreadyThere = currentRows[0] && Number(currentRows[0].group_id) === groupId;
      const inserted = await db.prepare(
        `INSERT INTO cgm_force_get_designations
           (activity_id, class_id, student_id, designated_group_id, approved_request_id, request_version,
            designated_by_profile_id, designated_by_label, approved_by_profile_id, approved_by_label,
            status, applied_assignment_id, applied_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        activityId, Number(row.class_id || input.classId), input.studentId, groupId,
        row.approved_request_id === null ? null : Number(row.approved_request_id),
        row.request_version === null ? null : Number(row.request_version),
        row.designated_by_profile_id, row.designated_by_label,
        row.approved_by_profile_id, row.approved_by_label,
        alreadyThere ? 'applied' : 'active', alreadyThere ? currentAssignment : null,
        alreadyThere ? new Date().toISOString() : null,
      ).run();
      const designationId = Number((inserted as any)?.meta?.last_row_id || 0);
      const claimed = await db.prepare(
        `UPDATE cgm_force_get_reservations
         SET status = 'converted', student_id = ?, converted_designation_id = ?,
             converted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'active'`
      ).bind(input.studentId, designationId || null, Number(row.id)).run();
      if (!(Number((claimed as any)?.meta?.changes || 0) > 0)) {
        // Another request converted it first — never keep a duplicate designation.
        if (designationId) {
          await db.prepare("DELETE FROM cgm_force_get_designations WHERE id = ? AND status = 'active'").bind(designationId).run();
        }
        continue;
      }
      const groupName = row.group_name || `Group ${row.group_position}`;
      await auditCgm(db, {
        actorType: 'system', actorLabel: input.label || 'Roster registration', actorStudentId: input.studentId,
        action: 'cgm.force_get.reservation_converted', entityType: 'force_get_designation',
        entityId: designationId || Number(row.id), classId: Number(row.class_id || input.classId), activityId,
        context: {
          rosterEntryId: input.rosterEntryId, reservationId: Number(row.id), groupId,
          requestId: row.approved_request_id === null ? null : Number(row.approved_request_id),
        },
      });
      converted.push({ activityId, activityName: row.activity_name || 'this activity', groupId, groupName });
    }
  } catch { /* pre-migration database or nothing to convert */ }
  return converted;
};

/** The active assignment row id for a student, used to link an applied designation. */
export const activeAssignmentId = async (db: D1Database, activityId: number, studentId: number) => {
  const rows = await asRows<{ id: number }>(db.prepare(
    `SELECT id FROM cgm_group_assignments WHERE activity_id = ? AND student_id = ? AND status = 'active' LIMIT 1`
  ).bind(activityId, studentId));
  return rows[0] ? Number(rows[0].id) : null;
};

/**
 * Counts shown on the Groups board: per group, the number of ACTIVE members
 * whose seat came from an approved Force Get designation. It is always a
 * subset of the group size — never added to it.
 */
export const forcedMemberCounts = async (db: D1Database, activityId: number) => {
  const map = new Map<number, number>();
  try {
    const rows = await asRows<any>(db.prepare(
      `SELECT ga.group_id AS group_id, COUNT(*) AS forced
       FROM cgm_group_assignments ga
       JOIN cgm_force_get_designations d ON d.applied_assignment_id = ga.id AND d.status = 'applied'
       WHERE ga.activity_id = ? AND ga.status = 'active'
       GROUP BY ga.group_id`
    ).bind(activityId));
    for (const row of rows) map.set(Number(row.group_id), Number(row.forced || 0));
  } catch { /* pre-migration database */ }
  return map;
};

/**
 * The sampling hook. Every activity still samples with its own method — this
 * simply makes the DRAW land on the approved designation instead of a random
 * group. Returns null when the student has no live designation (the caller
 * runs the normal path unchanged), or `{ claimed: false }` when the designated
 * seat could not be taken right now (group archived, capacity race): the
 * designation then STAYS active, so a later draw (or the student's own
 * Re-choose) still honours it.
 */
export const claimDesignatedSeat = async (
  db: D1Database,
  input: {
    activityId: number; studentId: number; via: string; label: string;
    enforceGenderPools?: boolean; studentGender?: Gender | string;
  },
): Promise<{
  designation: Designation;
  claimed: boolean;
  applied: boolean;
  assignmentId: number | null;
} | null> => {
  const designation = await activeDesignationFor(db, input.activityId, input.studentId);
  if (!designation) return null;
  const claimed = await insertAssignmentRespectingDesignations(db, {
    activityId: input.activityId, groupId: designation.groupId,
    studentId: input.studentId, via: input.via, label: input.label,
    enforceGenderPools: input.enforceGenderPools, studentGender: input.studentGender,
  });
  if (!claimed) return { designation, claimed: false, applied: false, assignmentId: null };
  const assignmentId = await activeAssignmentId(db, input.activityId, input.studentId);
  const applied = await markDesignationApplied(db, designation.id, assignmentId);
  return { designation, claimed: true, applied, assignmentId };
};

/**
 * THE proposed-state evaluator shared by submission, revision, PHANTOM approval
 * and the request detail.
 *
 * It answers one question: "if this proposal were approved and later applied,
 * what would each destination group look like?" — and it answers it from live
 * data, not from the proposal alone:
 *
 *   active members that stay
 * + approved designations still waiting to be applied (reserved seats)
 * + the students this proposal would designate
 * − students this proposal moves out of the group
 *
 * Everything is deduped by student id, so a member who already sits in the
 * group *and* holds a designation for it (awaiting their own Re-choose) is one
 * person, and a reservation is never counted as an active member.
 */
export const forceGetComposition = async (db: D1Database, options: {
  activityId: number;
  genderRule: string;
  proposal: Array<{ studentId: number; groupId: number }>;
  /**
   * Roster rows that have NOT registered yet. They have no student id, so they
   * are keyed by their roster entry id — a person is still counted once.
   */
  proposalEntries?: Array<{ rosterEntryId: number; groupId: number; fullName?: string; gender?: string }>;
  groups: Array<{ id: number; name: string; capacity: number | null }>;
}): Promise<CompositionReport> => {
  const { activityId, genderRule, proposal, groups } = options;
  const proposalEntries = options.proposalEntries || [];
  const byGroup = new Map<number, CompositionMember[]>();
  const groupIds = new Set(groups.map((group) => Number(group.id)));
  for (const group of groups) byGroup.set(Number(group.id), []);
  const movingOut = new Map<number, number>();
  for (const item of proposal) {
    if (Number.isInteger(item.studentId) && Number.isInteger(item.groupId)) {
      movingOut.set(Number(item.studentId), Number(item.groupId));
    }
  }

  const active = await asRows<any>(db.prepare(
    `SELECT ga.group_id, ga.student_id, s.full_name, COALESCE(NULLIF(LOWER(TRIM(s.gender)), ''), 'unknown') AS gender
     FROM cgm_group_assignments ga JOIN cgm_students s ON s.id = ga.student_id
     WHERE ga.activity_id = ? AND ga.status = 'active'`
  ).bind(activityId)).catch(() => [] as any[]);
  for (const row of active) {
    const groupId = Number(row.group_id);
    if (!groupIds.has(groupId)) continue;
    // A student this proposal moves elsewhere is leaving this group, so they
    // must not be counted here as well.
    const target = movingOut.get(Number(row.student_id));
    if (target !== undefined && target !== groupId) continue;
    byGroup.get(groupId)!.push({
      studentId: Number(row.student_id), fullName: row.full_name,
      gender: asGender(row.gender), source: 'active',
    });
  }

  const reserved = await asRows<any>(db.prepare(
    `SELECT d.designated_group_id AS group_id, d.student_id, s.full_name,
            COALESCE(NULLIF(LOWER(TRIM(s.gender)), ''), 'unknown') AS gender
     FROM cgm_force_get_designations d JOIN cgm_students s ON s.id = d.student_id
     JOIN cgm_groups g ON g.id = d.designated_group_id AND g.status = 'active'
     WHERE d.activity_id = ? AND d.status = 'active'`
  ).bind(activityId)).catch(() => [] as any[]);
  for (const row of reserved) {
    const groupId = Number(row.group_id);
    if (!groupIds.has(groupId)) continue;
    const target = movingOut.get(Number(row.student_id));
    if (target !== undefined && target !== groupId) continue; // being re-designated
    byGroup.get(groupId)!.push({
      studentId: Number(row.student_id), fullName: row.full_name,
      gender: asGender(row.gender), source: 'reserved',
    });
  }

  // Seats already approved for students who have not registered yet: they are
  // held exactly like a designation until that roster row registers.
  const heldEntries = await asRows<any>(db.prepare(
    `SELECT r.designated_group_id AS group_id, r.roster_entry_id, r.full_name,
            COALESCE(NULLIF(LOWER(TRIM(re.gender)), ''), r.gender, 'unknown') AS gender
     FROM cgm_force_get_reservations r
     LEFT JOIN cgm_roster_entries re ON re.id = r.roster_entry_id
     JOIN cgm_groups g ON g.id = r.designated_group_id AND g.status = 'active'
     WHERE r.activity_id = ? AND r.status = 'active'`
  ).bind(activityId)).catch(() => [] as any[]);
  const entryTargets = new Map<number, number>();
  for (const item of proposalEntries) {
    if (Number.isInteger(item.rosterEntryId) && Number.isInteger(item.groupId)) {
      entryTargets.set(Number(item.rosterEntryId), Number(item.groupId));
    }
  }
  for (const row of heldEntries) {
    const groupId = Number(row.group_id);
    if (!groupIds.has(groupId)) continue;
    const target = entryTargets.get(Number(row.roster_entry_id));
    if (target !== undefined && target !== groupId) continue; // being re-designated
    byGroup.get(groupId)!.push({
      studentId: 0, rosterEntryId: Number(row.roster_entry_id), fullName: row.full_name,
      gender: asGender(row.gender), source: 'reserved',
    });
  }
  for (const item of proposalEntries) {
    const groupId = Number(item.groupId);
    if (!groupIds.has(groupId)) continue;
    byGroup.get(groupId)!.push({
      studentId: 0, rosterEntryId: Number(item.rosterEntryId), fullName: item.fullName,
      gender: asGender(item.gender), source: 'proposed',
    });
  }

  if (proposal.length) {
    const ids = [...new Set(proposal.map((item) => Number(item.studentId)))];
    const placeholders = ids.map(() => '?').join(', ');
    const students = await asRows<any>(db.prepare(
      `SELECT id, full_name, COALESCE(NULLIF(LOWER(TRIM(gender)), ''), 'unknown') AS gender
       FROM cgm_students WHERE id IN (${placeholders})`
    ).bind(...ids)).catch(() => [] as any[]);
    const byId = new Map(students.map((row) => [Number(row.id), row]));
    for (const item of proposal) {
      const groupId = Number(item.groupId);
      if (!groupIds.has(groupId)) continue;
      const student = byId.get(Number(item.studentId));
      byGroup.get(groupId)!.push({
        studentId: Number(item.studentId), fullName: student?.full_name,
        gender: asGender(student?.gender), source: 'proposed',
      });
    }
  }

  const inputs: CompositionGroupInput[] = groups.map((group) => ({
    groupId: Number(group.id), groupName: group.name,
    capacity: group.capacity === null ? null : Number(group.capacity),
    members: byGroup.get(Number(group.id)) || [],
  }));
  return evaluateComposition(inputs, genderRule);
};

/**
 * Does this group currently hold a gender pool different from the student's —
 * counting BOTH active members and approved-but-unapplied reservations? Used to
 * explain a refused designation claim/application (the guarded INSERT already
 * refused it atomically).
 */
export const groupHoldsOtherPool = async (
  db: D1Database, activityId: number, groupId: number, studentGender: unknown,
) => {
  const asPool = (value: unknown) => {
    const text = String(value || '').trim().toLowerCase();
    return text === 'male' || text === 'female' ? text : 'unknown';
  };
  const mine = asPool(studentGender);
  const rows = await asRows<{ gender: string | null }>(db.prepare(
    `SELECT COALESCE(NULLIF(LOWER(TRIM(s.gender)), ''), 'unknown') AS gender
     FROM cgm_group_assignments ga JOIN cgm_students s ON s.id = ga.student_id
     WHERE ga.group_id = ? AND ga.status = 'active'
     UNION ALL
     SELECT COALESCE(NULLIF(LOWER(TRIM(s.gender)), ''), 'unknown') AS gender
     FROM cgm_force_get_designations d JOIN cgm_students s ON s.id = d.student_id
     WHERE d.activity_id = ? AND d.designated_group_id = ? AND d.status = 'active'
     UNION ALL
     SELECT COALESCE(NULLIF(LOWER(TRIM(re.gender)), ''), 'unknown') AS gender
     FROM cgm_force_get_reservations r JOIN cgm_roster_entries re ON re.id = r.roster_entry_id
     WHERE r.activity_id = ? AND r.designated_group_id = ? AND r.status = 'active'`
  ).bind(groupId, activityId, groupId, activityId, groupId)).catch(() => [] as any[]);
  return rows.some((row) => asPool(row.gender) !== mine);
};

/**
 * The gender pool each group currently holds: a single pool, or 'mixed' when it
 * already holds more than one (such a group accepts nobody new under
 * `genderRule = 'separate'`). Groups absent from the map are empty.
 */
export const groupGenderPools = async (db: D1Database, activityId: number) => {
  const pools = new Map<number, string>();
  try {
    const rows = await asRows<any>(db.prepare(
      `SELECT ga.group_id, COALESCE(NULLIF(LOWER(TRIM(s.gender)), ''), 'unknown') AS gender
       FROM cgm_group_assignments ga JOIN cgm_students s ON s.id = ga.student_id
       WHERE ga.activity_id = ? AND ga.status = 'active'
       UNION ALL
       -- approved seats (including those held for not-yet-registered roster rows)
       -- occupy a pool too, so a group never mixes behind the rule's back
       SELECT d.designated_group_id AS group_id, COALESCE(NULLIF(LOWER(TRIM(s.gender)), ''), 'unknown') AS gender
       FROM cgm_force_get_designations d JOIN cgm_students s ON s.id = d.student_id
       WHERE d.activity_id = ? AND d.status = 'active'
       UNION ALL
       SELECT r.designated_group_id AS group_id, COALESCE(NULLIF(LOWER(TRIM(re.gender)), ''), 'unknown') AS gender
       FROM cgm_force_get_reservations r JOIN cgm_roster_entries re ON re.id = r.roster_entry_id
       WHERE r.activity_id = ? AND r.status = 'active'`
    ).bind(activityId, activityId, activityId));
    const seen = new Map<number, Set<string>>();
    for (const row of rows) {
      const key = Number(row.group_id);
      if (!seen.has(key)) seen.set(key, new Set());
      seen.get(key)!.add(String(row.gender || 'unknown'));
    }
    for (const [key, set] of seen) pools.set(key, set.size > 1 ? 'mixed' : [...set][0]);
  } catch { /* pre-migration database: no pools, no constraint */ }
  return pools;
};

/** Normalised ('male' | 'female' | 'unknown') gender for the given students. */
export const studentGenders = async (db: D1Database, activityId: number, studentIds: number[]) => {
  const map = new Map<number, string>();
  const ids = [...new Set(studentIds.filter((id) => Number.isFinite(id)))];
  if (!ids.length) return map;
  try {
    const rows = await asRows<any>(db.prepare(
      `SELECT id, COALESCE(NULLIF(LOWER(TRIM(gender)), ''), 'unknown') AS gender FROM cgm_students
       WHERE id IN (${ids.map(() => '?').join(', ')})`
    ).bind(...ids));
    for (const row of rows) map.set(Number(row.id), String(row.gender || 'unknown'));
  } catch { /* pre-migration database */ }
  void activityId;
  return map;
};
