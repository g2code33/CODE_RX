/**
 * CODE Rx SOCIETY — group-leader capability layer.
 *
 * Appointing a group leader is not a badge. A leader holds a bounded console
 * for THEIR OWN group only: the topic and agenda, group announcements, member
 * messages, meetings, attendance, membership requests and issues. Every one of
 * those abilities is gated by a permission stored on the leader's own
 * `cgm_leadership_appointments` row — never by a frontend flag — and every
 * action is scoped to the group the seat belongs to.
 *
 * Two rules keep that safe:
 *   1. `leaderSeatFor()` resolves the seat from the STUDENT SESSION, so a
 *      student can only ever act on a group they actively lead.
 *   2. `requireLeaderPermission()` re-reads `permissions_json` on every call,
 *      so revoking a capability in the organizer's Leadership tab takes effect
 *      on the very next request.
 *
 * Two tables back the abilities that had nowhere to live before:
 *   cgm_group_meetings          — a group's scheduled meetings (leader console)
 *   cgm_group_leader_requests   — leader → organizer requests (add/remove a
 *                                 member, report an issue) with a review trail
 */

import { asRows, ensureLeaderSchema } from './service';
import {
  sanitizeLeaderPermissions,
  type LeaderPermission,
} from './core';

export { ensureLeaderSchema };

export interface LeaderSeat {
  appointmentId: number;
  activityId: number;
  groupId: number;
  role: 'leader' | 'assistant';
  method: string;
  permissions: LeaderPermission[];
  startedAt: string | null;
  groupName: string;
  groupPosition: number;
  topic: string | null;
  agenda: string | null;
  activityName: string;
  activityStatus: string;
  classId: number;
  className: string;
  classCode: string;
}

const groupLabelOf = (name: unknown, position: unknown) =>
  String(name || '').trim() || `Group ${Number(position) || 1}`;

/**
 * The student's ACTIVE leadership seat in one group, or null. This is the only
 * way a leader route obtains authority: the student id always comes from the
 * session, and the group must still be an active group of a live activity.
 */
export const leaderSeatFor = async (
  db: D1Database,
  studentId: number,
  groupId: number,
): Promise<LeaderSeat | null> => {
  if (!Number.isInteger(groupId) || groupId <= 0) return null;
  await ensureLeaderSchema(db);
  const rows = await asRows<any>(db.prepare(
    `SELECT l.id AS appointment_id, l.activity_id, l.group_id, l.role, l.method,
            l.permissions_json, l.started_at,
            g.name AS group_name, g.position AS group_position, g.topic, g.agenda,
            a.name AS activity_name, a.status AS activity_status,
            a.class_id, cl.name AS class_name, cl.code AS class_code
     FROM cgm_leadership_appointments l
     JOIN cgm_groups g ON g.id = l.group_id
     JOIN cgm_activities a ON a.id = l.activity_id
     JOIN cgm_classes cl ON cl.id = a.class_id
     WHERE l.student_id = ? AND l.group_id = ? AND l.status = 'active'
       AND g.status = 'active'
     ORDER BY CASE l.role WHEN 'leader' THEN 0 ELSE 1 END, l.id DESC
     LIMIT 1`
  ).bind(studentId, groupId));
  const row = rows[0];
  if (!row) return null;
  let parsed: unknown = [];
  try { parsed = JSON.parse(row.permissions_json || '[]'); } catch { parsed = []; }
  return {
    appointmentId: Number(row.appointment_id),
    activityId: Number(row.activity_id),
    groupId: Number(row.group_id),
    role: row.role === 'assistant' ? 'assistant' : 'leader',
    method: String(row.method || 'appointment'),
    permissions: sanitizeLeaderPermissions(parsed),
    startedAt: row.started_at || null,
    groupName: groupLabelOf(row.group_name, row.group_position),
    groupPosition: Number(row.group_position) || 1,
    topic: row.topic ?? null,
    agenda: row.agenda ?? null,
    activityName: String(row.activity_name || ''),
    activityStatus: String(row.activity_status || ''),
    classId: Number(row.class_id),
    className: String(row.class_name || ''),
    classCode: String(row.class_code || ''),
  };
};

/** Every active seat this student holds, newest first. */
export const leaderSeatsFor = async (db: D1Database, studentId: number): Promise<LeaderSeat[]> => {
  await ensureLeaderSchema(db);
  const rows = await asRows<any>(db.prepare(
    `SELECT l.group_id FROM cgm_leadership_appointments l
     JOIN cgm_groups g ON g.id = l.group_id
     WHERE l.student_id = ? AND l.status = 'active' AND g.status = 'active'
     ORDER BY l.id DESC LIMIT 100`
  ).bind(studentId));
  const seats: LeaderSeat[] = [];
  for (const row of rows) {
    const seat = await leaderSeatFor(db, studentId, Number(row.group_id));
    if (seat) seats.push(seat);
  }
  return seats;
};

/** The permission check every leader route runs. Returns null when allowed. */
export const leaderHas = (seat: LeaderSeat | null, permission: LeaderPermission) =>
  Boolean(seat && seat.permissions.includes(permission));

/**
 * Which capabilities this seat effectively has, split into granted and the
 * rest — so the console can show the student why a button is missing instead
 * of silently hiding it.
 */
export const describeSeatCapabilities = (seat: LeaderSeat, catalogue: readonly LeaderPermission[]) => {
  const granted = new Set(seat.permissions);
  return {
    granted: catalogue.filter((permission) => granted.has(permission)),
    withheld: catalogue.filter((permission) => !granted.has(permission)),
  };
};
