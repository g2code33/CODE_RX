/**
 * CODE Rx SOCIETY — the group leader's own console.
 *
 * These routes give a student who has been appointed leader (or assistant) of a
 * group the tools to run THAT group — and nothing else:
 *
 *   GET    /api/cgm/student/leadership                       every seat I hold
 *   GET    /api/cgm/student/leader/groups/:id                the group dossier
 *   PATCH  /api/cgm/student/leader/groups/:id                topic + agenda
 *   POST   /api/cgm/student/leader/groups/:id/announcements  announce to the group
 *   POST   /api/cgm/student/leader/groups/:id/notify         message every member
 *   POST   /api/cgm/student/leader/groups/:id/meetings       schedule a meeting
 *   POST   /api/cgm/student/leader/meetings/:id/cancel       call it off
 *   GET    /api/cgm/student/leader/groups/:id/attendance     read the group's record
 *   POST   /api/cgm/student/leader/groups/:id/attendance     mark this group only
 *   POST   /api/cgm/student/leader/groups/:id/members        add an unassigned classmate
 *   POST   /api/cgm/student/leader/groups/:id/members/:sid/remove
 *   POST   /api/cgm/student/leader/groups/:id/requests       ask / report
 *
 * Authorization is the student session plus the leader's own
 * `permissions_json`. There is no organizer path here and no student id is ever
 * taken from the request body: a seat is resolved from the session, so a
 * student can only ever touch the group they actively lead.
 */

import type { Hono } from 'hono';
import {
  ASSISTANT_LEADER_PERMISSIONS,
  ATTENDANCE_STATUSES,
  LEADER_PERMISSIONS,
  LEADER_PERMISSION_HINTS,
  LEADER_PERMISSION_LABELS,
  sanitizeActivityConfig,
  sanitizeClassSettings,
  sanitizeLeaderPermissions,
  type AttendanceStatus,
} from './core';
import {
  asRows,
  auditCgm,
  bad,
  clean,
  cleanOrNull,
  insertAssignmentGuarded,
  notifyStudent,
  readBody,
  requireModuleEnabled,
  requireStudent,
  throttle,
} from './service';
import { createNotification } from '../notifications';
import { recordPhantomInboxItem } from '../phantom-inbox';
import { describeSeatCapabilities, leaderHas, leaderSeatFor, leaderSeatsFor } from './leader';

type CgmApp = Hono<any>;

/** Organizers of this class who hold a given class permission (or the primary). */
const organizersFor = async (db: D1Database, classId: number, permission: string | null) => {
  const rows = await asRows<{ member_profile_id: number }>(db.prepare(
    `SELECT member_profile_id FROM cgm_class_organizers
     WHERE class_id = ? AND status = 'active'
       AND (role = 'primary' OR ? IS NULL OR permissions_json LIKE ?)`
  ).bind(classId, permission, `%${permission || ''}%`));
  return [...new Set(rows.map((row) => Number(row.member_profile_id)).filter((id) => id > 0))];
};

/** Everything a leader can *see* about their group, shaped once. */
const buildDossier = async (c: any, seat: any, studentId: number) => {
  const db = c.env.DB;
  const activity = await asRows<any>(db.prepare(
    'SELECT * FROM cgm_activities WHERE id = ?'
  ).bind(seat.activityId));
  const config = sanitizeActivityConfig(JSON.parse(activity[0]?.config_json || '{}'));
  const settingsRows = await asRows<{ settings_json: string | null }>(db.prepare(
    'SELECT settings_json FROM cgm_classes WHERE id = ?'
  ).bind(seat.classId));
  const classSettings = sanitizeClassSettings((() => {
    try { return JSON.parse(settingsRows[0]?.settings_json || '{}'); } catch { return {}; }
  })());

  const canViewMembers = leaderHas(seat, 'view_members');
  // Contact details follow the SAME privacy rules a classmate gets: the class
  // decides which fields students may see, the activity decides whether they
  // reach the group or the whole class. A leadership seat never widens that —
  // index numbers and gender never leave the organizer's roster.
  const showPhone = canViewMembers && classSettings.studentVisibleFields.includes('phone')
    && config.contactVisibility !== 'none';
  const showEmail = canViewMembers && classSettings.studentVisibleFields.includes('email')
    && config.contactVisibility !== 'none';

  const members = canViewMembers
    ? await asRows<any>(db.prepare(
      `SELECT s.id, s.full_name${showPhone ? ', s.phone' : ''}${showEmail ? ', s.email' : ''},
              ga.assigned_at,
              (SELECT GROUP_CONCAT(l.role || ':' || l.id) FROM cgm_leadership_appointments l
               WHERE l.group_id = ga.group_id AND l.student_id = s.id AND l.status = 'active') AS roles
       FROM cgm_group_assignments ga JOIN cgm_students s ON s.id = ga.student_id
       WHERE ga.group_id = ? AND ga.status = 'active' ORDER BY s.full_name`
    ).bind(seat.groupId))
    : [];

  const sizeRows = await asRows<{ c: number }>(db.prepare(
    `SELECT COUNT(*) AS c FROM cgm_group_assignments WHERE group_id = ? AND status = 'active'`
  ).bind(seat.groupId));
  const groupRows = await asRows<any>(db.prepare(
    'SELECT capacity FROM cgm_groups WHERE id = ?'
  ).bind(seat.groupId));

  const meetings = await asRows<any>(db.prepare(
    `SELECT id, title, agenda, starts_at, duration_minutes, location, status, created_by_label, cancelled_at, cancel_reason
     FROM cgm_group_meetings WHERE group_id = ? ORDER BY starts_at DESC LIMIT 30`
  ).bind(seat.groupId));

  const announcements = await asRows<any>(db.prepare(
    `SELECT id, title, body, author_type, author_label, status, pinned, created_at
     FROM cgm_announcements
     WHERE status IN ('published','pending') AND activity_id = ? AND group_id = ?
     ORDER BY pinned DESC, id DESC LIMIT 20`
  ).bind(seat.activityId, seat.groupId));

  const whatsapp = await asRows<any>(db.prepare(
    `SELECT id, url, status, click_count, created_at FROM cgm_whatsapp_links
     WHERE group_id = ? ORDER BY id DESC LIMIT 1`
  ).bind(seat.groupId));

  const attendance = leaderHas(seat, 'view_attendance') || leaderHas(seat, 'assist_attendance')
    ? await asRows<any>(db.prepare(
      `SELECT sess.id, sess.title, sess.session_date, sess.status,
              (SELECT COUNT(*) FROM cgm_attendance_records r WHERE r.session_id = sess.id AND r.status = 'present') AS present,
              (SELECT COUNT(*) FROM cgm_attendance_records r WHERE r.session_id = sess.id AND r.status = 'late') AS late,
              (SELECT COUNT(*) FROM cgm_attendance_records r WHERE r.session_id = sess.id AND r.status = 'absent') AS absent,
              (SELECT COUNT(*) FROM cgm_attendance_records r WHERE r.session_id = sess.id AND r.status = 'excused') AS excused,
              (SELECT COUNT(*) FROM cgm_attendance_records r WHERE r.session_id = sess.id) AS marked,
              (SELECT GROUP_CONCAT(r.student_id || ':' || r.status) FROM cgm_attendance_records r WHERE r.session_id = sess.id) AS marks
       FROM cgm_attendance_sessions sess
       WHERE sess.activity_id = ? AND (sess.group_id = ? OR sess.group_id IS NULL)
       ORDER BY sess.session_date DESC, sess.id DESC LIMIT 20`
    ).bind(seat.activityId, seat.groupId))
    : [];

  const requests = await asRows<any>(db.prepare(
    `SELECT r.id, r.kind, r.status, r.title, r.reason, r.requested_permission, r.target_student_id, s.full_name AS target_name,
            r.created_at, r.reviewer_label, r.review_reason, r.reviewed_at
     FROM cgm_group_leader_requests r LEFT JOIN cgm_students s ON s.id = r.target_student_id
     WHERE r.group_id = ? ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END, r.id DESC LIMIT 30`
  ).bind(seat.groupId));

  // Who the leader could add: active class members with no seat in this
  // activity — the same pool the organizer's activity page offers.
  const candidates = leaderHas(seat, 'add_members') || leaderHas(seat, 'request_member_additions')
    ? (config.eligibility === 'selected'
      ? await asRows<any>(db.prepare(
        `SELECT s.id, s.full_name FROM cgm_activity_eligible e JOIN cgm_students s ON s.id = e.student_id
         WHERE e.activity_id = ? AND NOT EXISTS
           (SELECT 1 FROM cgm_group_assignments ga WHERE ga.activity_id = ? AND ga.student_id = s.id AND ga.status = 'active')
         ORDER BY s.full_name LIMIT 300`
      ).bind(seat.activityId, seat.activityId))
      : await asRows<any>(db.prepare(
        `SELECT s.id, s.full_name FROM cgm_class_members cm JOIN cgm_students s ON s.id = cm.student_id
         WHERE cm.class_id = ? AND cm.status = 'active' AND NOT EXISTS
           (SELECT 1 FROM cgm_group_assignments ga WHERE ga.activity_id = ? AND ga.student_id = s.id AND ga.status = 'active')
         ORDER BY s.full_name LIMIT 300`
      ).bind(seat.classId, seat.activityId)))
    : [];

  const capabilities = describeSeatCapabilities(seat, LEADER_PERMISSIONS);

  return {
    seat: {
      appointmentId: seat.appointmentId,
      role: seat.role,
      method: seat.method,
      startedAt: seat.startedAt,
      permissions: seat.permissions,
      permissionLabels: seat.permissions.map((permission: string) => ({
        key: permission,
        label: LEADER_PERMISSION_LABELS[permission as keyof typeof LEADER_PERMISSION_LABELS] || permission,
        hint: LEADER_PERMISSION_HINTS[permission as keyof typeof LEADER_PERMISSION_HINTS] || '',
      })),
      granted: capabilities.granted,
      withheld: capabilities.withheld.map((permission: string) => ({
        key: permission,
        label: LEADER_PERMISSION_LABELS[permission as keyof typeof LEADER_PERMISSION_LABELS] || permission,
        hint: LEADER_PERMISSION_HINTS[permission as keyof typeof LEADER_PERMISSION_HINTS] || '',
      })),
    },
    class: { id: seat.classId, name: seat.className, code: seat.classCode },
    activity: {
      id: seat.activityId, name: seat.activityName, status: seat.activityStatus,
      announcementMode: config.announcementMode,
      attendanceEnabled: config.attendanceEnabled,
      whatsappEnabled: config.whatsappEnabled,
    },
    group: {
      id: seat.groupId, name: seat.groupName, position: seat.groupPosition,
      topic: seat.topic, agenda: seat.agenda,
      size: Number(sizeRows[0]?.c || 0),
      capacity: groupRows[0]?.capacity === null || groupRows[0]?.capacity === undefined ? null : Number(groupRows[0].capacity),
    },
    members: members.map((row) => ({
      studentId: Number(row.id), fullName: row.full_name,
      phone: row.phone || null, email: row.email || null,
      roles: String(row.roles || '').split(',').filter(Boolean).map((entry: string) => entry.split(':')[0]),
      isMe: Number(row.id) === Number(studentId),
    })),
    meetings: meetings.map((row) => ({
      id: Number(row.id), title: row.title, agenda: row.agenda, startsAt: row.starts_at,
      durationMinutes: Number(row.duration_minutes) || 60, location: row.location,
      status: row.status, createdByLabel: row.created_by_label,
      cancelledAt: row.cancelled_at, cancelReason: row.cancel_reason,
    })),
    announcements: announcements.map((row) => ({
      id: Number(row.id), title: row.title, body: row.body, authorType: row.author_type,
      authorLabel: row.author_label, status: row.status,
      pinned: Number(row.pinned) === 1, createdAt: row.created_at,
      attachmentUrl: null,
    })),
    whatsapp: whatsapp[0]
      ? { id: Number(whatsapp[0].id), url: whatsapp[0].url, status: whatsapp[0].status, clicks: Number(whatsapp[0].click_count || 0) }
      : null,
    attendance: attendance.map((row) => ({
      sessionId: Number(row.id), title: row.title, sessionDate: row.session_date, status: row.status,
      present: Number(row.present || 0), late: Number(row.late || 0), absent: Number(row.absent || 0),
      excused: Number(row.excused || 0), marked: Number(row.marked || 0),
      groupScoped: true,
      marks: String(row.marks || '').split(',').filter(Boolean).map((entry: string) => {
        const [id, status] = entry.split(':');
        return { studentId: Number(id), status };
      }),
    })),
    requests: requests.map((row) => ({
      id: Number(row.id), kind: row.kind, status: row.status, title: row.title, reason: row.reason,
      requestedPermission: row.requested_permission || null,
      requestedPermissionLabel: row.requested_permission
        ? (LEADER_PERMISSION_LABELS[row.requested_permission as keyof typeof LEADER_PERMISSION_LABELS] || row.requested_permission)
        : null,
      targetStudentId: row.target_student_id === null || row.target_student_id === undefined ? null : Number(row.target_student_id),
      targetName: row.target_name || null, createdAt: row.created_at,
      reviewerLabel: row.reviewer_label, reviewReason: row.review_reason, reviewedAt: row.reviewed_at,
    })),
    candidates: candidates.map((row) => ({ studentId: Number(row.id), fullName: row.full_name })),
  };
};

/** Resolve the seat or answer 403 with the reason, never a silent no-op. */
const seatOr403 = async (c: any, student: any, groupId: number) => {
  const seat = await leaderSeatFor(c.env.DB, Number(student.id), groupId);
  if (!seat) {
    return {
      seat: null,
      response: bad(c, 'You are not an active leader of this group. Ask your organizer.', 403),
    };
  }
  return { seat, response: null as Response | null };
};

const permissionOr403 = (c: any, seat: any, permission: any) => {
  if (leaderHas(seat, permission)) return null;
  const label = LEADER_PERMISSION_LABELS[permission as keyof typeof LEADER_PERMISSION_LABELS] || permission;
  return bad(c, `Your leadership role does not include “${label}”. Ask your organizer to grant it.`, 403);
};

export const registerCgmLeaderRoutes = (app: CgmApp) => {

  // -------------------------------------------------------------------------
  // Which groups do I lead? (the portal's "My group (leader)" entry)
  // -------------------------------------------------------------------------
  app.get('/api/cgm/student/leadership', async (c: any) => {
    const dark = await requireModuleEnabled(c);
    if (dark) return dark;
    const student = await requireStudent(c);
    if (!student) return c.json({ success: false, error: 'Student session required' }, 401);
    const seats = await leaderSeatsFor(c.env.DB, Number(student.id));
    const shaped = [];
    for (const seat of seats) {
      const counts = await asRows<{ c: number }>(c.env.DB.prepare(
        `SELECT COUNT(*) AS c FROM cgm_group_assignments WHERE group_id = ? AND status = 'active'`
      ).bind(seat.groupId));
      const pending = await asRows<{ c: number }>(c.env.DB.prepare(
        `SELECT COUNT(*) AS c FROM cgm_group_leader_requests WHERE group_id = ? AND status = 'pending'`
      ).bind(seat.groupId));
      shaped.push({
        groupId: seat.groupId, groupName: seat.groupName, groupPosition: seat.groupPosition,
        activityId: seat.activityId, activityName: seat.activityName, activityStatus: seat.activityStatus,
        classId: seat.classId, className: seat.className, classCode: seat.classCode,
        role: seat.role, method: seat.method, startedAt: seat.startedAt,
        permissions: seat.permissions, permissionCount: seat.permissions.length,
        size: Number(counts[0]?.c || 0),
        pendingRequests: Number(pending[0]?.c || 0),
        topic: seat.topic, agenda: seat.agenda,
      });
    }
    return c.json({ success: true, data: { seats: shaped, total: shaped.length } });
  });

  // -------------------------------------------------------------------------
  // The group dossier — everything the console renders in one call
  // -------------------------------------------------------------------------
  app.get('/api/cgm/student/leader/groups/:id', async (c: any) => {
    const student = await requireStudent(c);
    if (!student) return c.json({ success: false, error: 'Student session required' }, 401);
    const groupId = Number(c.req.param('id'));
    if (!Number.isInteger(groupId) || groupId <= 0) return bad(c, 'Group not found.', 404);
    const gate = await seatOr403(c, student, groupId);
    if (gate.response) return gate.response;
    return c.json({ success: true, data: await buildDossier(c, gate.seat, Number(student.id)) });
  });

  // -------------------------------------------------------------------------
  // Topic + agenda — the plan students see under their group's name
  // -------------------------------------------------------------------------
  app.patch('/api/cgm/student/leader/groups/:id', async (c: any) => {
    const student = await requireStudent(c);
    if (!student) return c.json({ success: false, error: 'Student session required' }, 401);
    const groupId = Number(c.req.param('id'));
    const gate = await seatOr403(c, student, groupId);
    if (gate.response) return gate.response;
    const seat = gate.seat;
    const body = await readBody(c);
    const wantsTopic = body.topic !== undefined;
    const wantsAgenda = body.agenda !== undefined;
    if (!wantsTopic && !wantsAgenda) return bad(c, 'Nothing to update.');
    const denied = permissionOr403(c, seat, 'edit_topic');
    if (denied) return denied;
    const updates: string[] = [];
    const values: any[] = [];
    if (wantsTopic) { updates.push('topic = ?'); values.push(cleanOrNull(body.topic, 200)); }
    if (wantsAgenda) { updates.push('agenda = ?'); values.push(cleanOrNull(body.agenda, 2000)); }
    await c.env.DB.prepare(`UPDATE cgm_groups SET ${updates.join(', ')} WHERE id = ?`).bind(...values, groupId).run();
    await auditCgm(c.env.DB, {
      actorType: 'student', actorLabel: String(student.full_name || 'Leader'), actorStudentId: Number(student.id),
      action: 'cgm.leader.topic_updated', entityType: 'group', entityId: groupId,
      classId: seat.classId, activityId: seat.activityId,
      context: { appointmentId: seat.appointmentId, topic: cleanOrNull(body.topic, 200), agenda: cleanOrNull(body.agenda, 500) },
    });
    // The organizer keeps the oversight trail without being pinged for a topic.
    return c.json({ success: true, data: { topic: cleanOrNull(body.topic, 200), agenda: cleanOrNull(body.agenda, 2000) } });
  });

  // -------------------------------------------------------------------------
  // Announcements to this group only
  // -------------------------------------------------------------------------
  app.post('/api/cgm/student/leader/groups/:id/announcements', async (c: any) => {
    const student = await requireStudent(c);
    if (!student) return c.json({ success: false, error: 'Student session required' }, 401);
    if (!throttle(c, 20, 3600)) return bad(c, 'Too many announcements. Try again later.', 429);
    const groupId = Number(c.req.param('id'));
    const gate = await seatOr403(c, student, groupId);
    if (gate.response) return gate.response;
    const seat = gate.seat;
    const denied = permissionOr403(c, seat, 'send_announcements');
    if (denied) return denied;
    const body = await readBody(c);
    const title = clean(body.title, 180);
    const message = clean(body.body, 5000);
    if (!title || !message) return bad(c, 'An announcement needs a title and a message.');
    const activity = await asRows<any>(c.env.DB.prepare(
      'SELECT config_json FROM cgm_activities WHERE id = ?'
    ).bind(seat.activityId));
    const config = sanitizeActivityConfig(JSON.parse(activity[0]?.config_json || '{}'));
    // The activity's announcement mode decides the route: a leader may post
    // directly only when the organizer chose 'direct'. Otherwise it queues for
    // organizer approval and stays invisible to students until then.
    const needsApproval = config.announcementMode !== 'direct';
    const status = needsApproval ? 'pending' : 'published';
    const inserted = await c.env.DB.prepare(
      `INSERT INTO cgm_announcements
        (class_id, activity_id, group_id, author_type, author_student_id, author_label, title, body, status, review_note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      seat.classId, seat.activityId, seat.groupId, seat.role, Number(student.id),
      `${student.full_name} (${seat.role === 'leader' ? 'group leader' : 'assistant leader'})`,
      title, message, status,
      needsApproval ? 'Authored by the group leader — awaiting organizer approval.' : null,
    ).run();
    const announcementId = Number(inserted.meta.last_row_id);
    if (needsApproval) {
      const organizers = await organizersFor(c.env.DB, seat.classId, 'manage_announcements');
      if (organizers.length) {
        await createNotification(c.env.DB, {
          title: 'Group announcement awaiting approval',
          message: `${student.full_name} (${seat.role}) posted “${title}” in ${seat.groupName} of ${seat.activityName}. `
            + 'Review it under Class & Groups → Announcements.',
          audience: 'system', audienceLabel: 'Class & Groups', recipientProfileIds: organizers,
        });
      }
    } else {
      await notifyGroupMembers(c.env.DB, seat.groupId, Number(student.id), seat,
        'New group announcement', `${student.full_name}: ${title}`);
    }
    await auditCgm(c.env.DB, {
      actorType: 'student', actorLabel: String(student.full_name || 'Leader'), actorStudentId: Number(student.id),
      action: 'cgm.leader.announcement_created', entityType: 'announcement', entityId: announcementId,
      classId: seat.classId, activityId: seat.activityId,
      context: { appointmentId: seat.appointmentId, groupId, status, needsApproval },
    });
    return c.json({
      success: true,
      data: {
        id: announcementId, status,
        message: needsApproval
          ? 'Sent to your organizer — it appears for the group once it is approved.'
          : 'Posted to your group.',
      },
    });
  });

  // -------------------------------------------------------------------------
  // Message every member (a notification, not an announcement)
  // -------------------------------------------------------------------------
  app.post('/api/cgm/student/leader/groups/:id/notify', async (c: any) => {
    const student = await requireStudent(c);
    if (!student) return c.json({ success: false, error: 'Student session required' }, 401);
    if (!throttle(c, 30, 3600)) return bad(c, 'Too many messages. Try again later.', 429);
    const groupId = Number(c.req.param('id'));
    const gate = await seatOr403(c, student, groupId);
    if (gate.response) return gate.response;
    const seat = gate.seat;
    const denied = permissionOr403(c, seat, 'notify_members');
    if (denied) return denied;
    const body = await readBody(c);
    const message = clean(body.message, 600);
    if (!message) return bad(c, 'Write the message to send.');
    const title = clean(body.title, 120) || 'Message from your group leader';
    const sent = await notifyGroupMembers(c.env.DB, seat.groupId, Number(student.id), seat, title, message);
    await auditCgm(c.env.DB, {
      actorType: 'student', actorLabel: String(student.full_name || 'Leader'), actorStudentId: Number(student.id),
      action: 'cgm.leader.members_notified', entityType: 'group', entityId: seat.groupId,
      classId: seat.classId, activityId: seat.activityId,
      context: { appointmentId: seat.appointmentId, recipients: sent, title },
    });
    return c.json({ success: true, data: { recipients: sent } });
  });

  // -------------------------------------------------------------------------
  // Meetings (the group's own calendar)
  // -------------------------------------------------------------------------
  app.post('/api/cgm/student/leader/groups/:id/meetings', async (c: any) => {
    const student = await requireStudent(c);
    if (!student) return c.json({ success: false, error: 'Student session required' }, 401);
    const groupId = Number(c.req.param('id'));
    const gate = await seatOr403(c, student, groupId);
    if (gate.response) return gate.response;
    const seat = gate.seat;
    const denied = permissionOr403(c, seat, 'coordinate');
    if (denied) return denied;
    const body = await readBody(c);
    const title = clean(body.title, 160);
    const when = clean(body.startsAt, 40);
    const startsAt = new Date(when);
    if (!title) return bad(c, 'Give the meeting a title.');
    if (!when || Number.isNaN(startsAt.getTime())) return bad(c, 'Choose a date and time for the meeting.');
    const duration = Math.max(15, Math.min(480, Math.floor(Number(body.durationMinutes) || 60)));
    const inserted = await c.env.DB.prepare(
      `INSERT INTO cgm_group_meetings
        (activity_id, group_id, class_id, title, agenda, starts_at, duration_minutes, location,
         created_by_appointment_id, created_by_student_id, created_by_label)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      seat.activityId, seat.groupId, seat.classId, title, cleanOrNull(body.agenda, 1000),
      startsAt.toISOString().replace('T', ' ').slice(0, 19), duration, cleanOrNull(body.location, 160),
      seat.appointmentId, Number(student.id), String(student.full_name || 'Group leader'),
    ).run();
    const meetingId = Number(inserted.meta.last_row_id);
    const whenLabel = startsAt.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
    await notifyGroupMembers(c.env.DB, seat.groupId, Number(student.id), seat,
      'Group meeting scheduled', `${title} — ${whenLabel}${body.location ? ` at ${clean(body.location, 160)}` : ''}.`);
    await auditCgm(c.env.DB, {
      actorType: 'student', actorLabel: String(student.full_name || 'Leader'), actorStudentId: Number(student.id),
      action: 'cgm.leader.meeting_scheduled', entityType: 'group_meeting', entityId: meetingId,
      classId: seat.classId, activityId: seat.activityId,
      context: { appointmentId: seat.appointmentId, groupId, startsAt: startsAt.toISOString(), duration },
    });
    return c.json({ success: true, data: { id: meetingId, startsAt: startsAt.toISOString() } });
  });

  app.post('/api/cgm/student/leader/meetings/:id/cancel', async (c: any) => {
    const student = await requireStudent(c);
    if (!student) return c.json({ success: false, error: 'Student session required' }, 401);
    const meetingId = Number(c.req.param('id'));
    const rows = await asRows<any>(c.env.DB.prepare(
      'SELECT id, group_id, title, status FROM cgm_group_meetings WHERE id = ?'
    ).bind(meetingId));
    const meeting = rows[0];
    if (!meeting) return bad(c, 'Meeting not found.', 404);
    const gate = await seatOr403(c, student, Number(meeting.group_id));
    if (gate.response) return gate.response;
    const seat = gate.seat;
    const denied = permissionOr403(c, seat, 'coordinate');
    if (denied) return denied;
    if (meeting.status === 'cancelled') return bad(c, 'That meeting is already cancelled.', 409);
    const body = await readBody(c);
    await c.env.DB.prepare(
      `UPDATE cgm_group_meetings SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP, cancel_reason = ? WHERE id = ?`
    ).bind(cleanOrNull(body.reason, 300), meetingId).run();
    await notifyGroupMembers(c.env.DB, seat.groupId, Number(student.id), seat,
      'Group meeting cancelled', `${meeting.title} was called off. ${cleanOrNull(body.reason, 300) || ''}`.trim());
    await auditCgm(c.env.DB, {
      actorType: 'student', actorLabel: String(student.full_name || 'Leader'), actorStudentId: Number(student.id),
      action: 'cgm.leader.meeting_cancelled', entityType: 'group_meeting', entityId: meetingId,
      classId: seat.classId, activityId: seat.activityId,
      context: { appointmentId: seat.appointmentId, groupId: seat.groupId, reason: cleanOrNull(body.reason, 300) },
    });
    return c.json({ success: true });
  });

  // -------------------------------------------------------------------------
  // Attendance — read the record, and mark THIS group only
  // -------------------------------------------------------------------------
  app.get('/api/cgm/student/leader/groups/:id/attendance', async (c: any) => {
    const student = await requireStudent(c);
    if (!student) return c.json({ success: false, error: 'Student session required' }, 401);
    const groupId = Number(c.req.param('id'));
    const gate = await seatOr403(c, student, groupId);
    if (gate.response) return gate.response;
    const seat = gate.seat;
    if (!leaderHas(seat, 'view_attendance') && !leaderHas(seat, 'assist_attendance')) {
      return permissionOr403(c, seat, 'view_attendance');
    }
    const sessions = await asRows<any>(c.env.DB.prepare(
      `SELECT sess.id, sess.title, sess.session_date, sess.status
       FROM cgm_attendance_sessions sess
       WHERE sess.activity_id = ? AND (sess.group_id = ? OR sess.group_id IS NULL)
       ORDER BY sess.session_date DESC, sess.id DESC LIMIT 20`
    ).bind(seat.activityId, seat.groupId));
    const members = await asRows<any>(c.env.DB.prepare(
      `SELECT s.id, s.full_name FROM cgm_group_assignments ga JOIN cgm_students s ON s.id = ga.student_id
       WHERE ga.group_id = ? AND ga.status = 'active' ORDER BY s.full_name`
    ).bind(seat.groupId));
    const shaped = [];
    for (const session of sessions) {
      const records = await asRows<any>(c.env.DB.prepare(
        'SELECT student_id, status, note, corrected_at FROM cgm_attendance_records WHERE session_id = ?'
      ).bind(Number(session.id)));
      shaped.push({
        sessionId: Number(session.id), title: session.title, sessionDate: session.session_date,
        status: session.status,
        students: members.map((member) => {
          const record = records.find((row) => Number(row.student_id) === Number(member.id));
          return {
            studentId: Number(member.id), fullName: member.full_name,
            status: record?.status || null, note: record?.note || null,
            corrected: Boolean(record?.corrected_at),
          };
        }),
      });
    }
    return c.json({ success: true, data: shaped });
  });

  app.post('/api/cgm/student/leader/groups/:id/attendance', async (c: any) => {
    const student = await requireStudent(c);
    if (!student) return c.json({ success: false, error: 'Student session required' }, 401);
    const groupId = Number(c.req.param('id'));
    const gate = await seatOr403(c, student, groupId);
    if (gate.response) return gate.response;
    const seat = gate.seat;
    const denied = permissionOr403(c, seat, 'assist_attendance');
    if (denied) return denied;
    const activity = await asRows<any>(c.env.DB.prepare(
      'SELECT config_json FROM cgm_activities WHERE id = ?'
    ).bind(seat.activityId));
    const config = sanitizeActivityConfig(JSON.parse(activity[0]?.config_json || '{}'));
    if (!config.attendanceEnabled) return bad(c, 'Attendance is disabled for this activity.', 409);
    const body = await readBody(c);

    // One call either opens a fresh group session or records into an existing
    // one — either way the session must belong to THIS group or the activity
    // (an activity-wide session included, since the group's members are in it).
    let sessionId = Number(body.sessionId) || 0;
    let sessionTitle = '';
    if (sessionId) {
      const rows = await asRows<any>(c.env.DB.prepare(
        `SELECT id, title, status, group_id, activity_id FROM cgm_attendance_sessions WHERE id = ?`
      ).bind(sessionId));
      const session = rows[0];
      if (!session || Number(session.activity_id) !== seat.activityId) return bad(c, 'Session not found.', 404);
      if (session.group_id !== null && Number(session.group_id) !== seat.groupId) {
        return bad(c, 'That session belongs to another group.', 403);
      }
      if (session.status !== 'open') return bad(c, 'This session is closed. Ask your organizer to correct a record.', 409);
      sessionTitle = String(session.title || '');
    } else {
      const title = clean(body.title, 160) || `Group attendance — ${new Date().toISOString().slice(0, 10)}`;
      const sessionDate = clean(body.sessionDate, 10) || new Date().toISOString().slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) return bad(c, 'Give the session a date (YYYY-MM-DD).');
      const inserted = await c.env.DB.prepare(
        `INSERT INTO cgm_attendance_sessions (activity_id, group_id, title, session_date, created_by_label)
         VALUES (?, ?, ?, ?, ?)`
      ).bind(seat.activityId, seat.groupId, title, sessionDate,
        `${student.full_name} (group leader)`).run();
      sessionId = Number(inserted.meta.last_row_id);
      sessionTitle = title;
    }

    // Only THIS group's own members may be marked from the leader console —
    // anything else would be a leader editing another group's record.
    const members = await asRows<{ student_id: number; full_name: string }>(c.env.DB.prepare(
      `SELECT ga.student_id, s.full_name FROM cgm_group_assignments ga JOIN cgm_students s ON s.id = ga.student_id
       WHERE ga.group_id = ? AND ga.status = 'active'`
    ).bind(seat.groupId));
    const allowed = new Map(members.map((row) => [Number(row.student_id), row.full_name]));
    const records = Array.isArray(body.records) ? body.records.slice(0, 500) : [];
    let saved = 0;
    let skipped = 0;
    for (const record of records) {
      const status = String(record.status || '');
      const studentId = Number(record.studentId);
      if (!(ATTENDANCE_STATUSES as readonly string[]).includes(status)) { skipped += 1; continue; }
      if (!allowed.has(studentId)) { skipped += 1; continue; }
      await c.env.DB.prepare(
        `INSERT INTO cgm_attendance_records (session_id, student_id, status, note, recorded_by_label)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(session_id, student_id) DO UPDATE SET status = excluded.status, note = excluded.note,
           recorded_by_label = excluded.recorded_by_label, recorded_at = CURRENT_TIMESTAMP`
      ).bind(sessionId, studentId, status as AttendanceStatus, cleanOrNull(record.note, 300),
        `${student.full_name} (group leader)`).run();
      saved += 1;
      await notifyStudent(c.env.DB, studentId, 'attendance', 'Attendance recorded',
        `${student.full_name} marked you ${status} for “${sessionTitle}” in ${seat.groupName}.`, `#class-groups/student/leader?group=${seat.groupId}`);
    }
    if (skipped && !saved) return bad(c, 'None of those members belong to your group.', 403);
    await auditCgm(c.env.DB, {
      actorType: 'student', actorLabel: String(student.full_name || 'Leader'), actorStudentId: Number(student.id),
      action: 'cgm.leader.attendance_recorded', entityType: 'attendance_session', entityId: sessionId,
      classId: seat.classId, activityId: seat.activityId,
      context: { appointmentId: seat.appointmentId, groupId: seat.groupId, saved, skipped },
    });
    return c.json({ success: true, data: { sessionId, saved, skipped } });
  });

  // -------------------------------------------------------------------------
  // Membership: add directly (capacity-aware) or ask the organizer
  // -------------------------------------------------------------------------
  app.post('/api/cgm/student/leader/groups/:id/members', async (c: any) => {
    const student = await requireStudent(c);
    if (!student) return c.json({ success: false, error: 'Student session required' }, 401);
    const groupId = Number(c.req.param('id'));
    const gate = await seatOr403(c, student, groupId);
    if (gate.response) return gate.response;
    const seat = gate.seat;
    const body = await readBody(c);
    const targetId = Number(body.studentId);
    if (!targetId) return bad(c, 'Choose the classmate to add.');
    const direct = leaderHas(seat, 'add_members');
    if (!direct) {
      // Without the direct capability the same button becomes a REQUEST — the
      // leader's intent is still honoured, the organizer keeps the decision.
      const denied = permissionOr403(c, seat, 'request_member_additions');
      if (denied) return denied;
      const created = await fileLeaderRequest(c, seat, student, 'add_member', targetId,
        `Add ${clean(body.studentName, 120) || 'a classmate'} to ${seat.groupName}`, cleanOrNull(body.reason, 500));
      if (created.response) return created.response;
      return c.json({ success: true, data: { status: 'pending_request', requestId: created.id } });
    }
    const activity = await asRows<any>(c.env.DB.prepare(
      'SELECT * FROM cgm_activities WHERE id = ?'
    ).bind(seat.activityId));
    const config = sanitizeActivityConfig(JSON.parse(activity[0]?.config_json || '{}'));
    if (!['open', 'published', 'active'].includes(String(activity[0]?.status || ''))) {
      return bad(c, 'This activity no longer accepts new members.', 409);
    }
    const eligible = config.eligibility === 'selected'
      ? await asRows<{ id: number }>(c.env.DB.prepare(
        `SELECT s.id FROM cgm_activity_eligible e JOIN cgm_students s ON s.id = e.student_id
         WHERE e.activity_id = ? AND e.student_id = ? AND s.status = 'active'`
      ).bind(seat.activityId, targetId))
      : await asRows<{ id: number }>(c.env.DB.prepare(
        `SELECT s.id FROM cgm_class_members cm JOIN cgm_students s ON s.id = cm.student_id
         WHERE cm.class_id = ? AND cm.student_id = ? AND cm.status = 'active' AND s.status = 'active'`
      ).bind(seat.classId, targetId));
    if (!eligible[0]) return bad(c, 'That student is not eligible for this activity.', 400);
    const already = await asRows<{ id: number; group_id: number }>(c.env.DB.prepare(
      `SELECT id, group_id FROM cgm_group_assignments WHERE activity_id = ? AND student_id = ? AND status = 'active'`
    ).bind(seat.activityId, targetId));
    if (already[0]) return bad(c, 'That student already has a group in this activity.', 409);
    const wrote = await insertAssignmentGuarded(c.env.DB, {
      activityId: seat.activityId, groupId: seat.groupId, studentId: targetId,
      via: 'organizer', label: `${student.full_name} (group leader)`,
    });
    if (!wrote) return bad(c, 'The group is full — ask your organizer to raise the capacity.', 409);
    const nameRows = await asRows<{ full_name: string }>(c.env.DB.prepare(
      'SELECT full_name FROM cgm_students WHERE id = ?'
    ).bind(targetId));
    await c.env.DB.prepare(
      `INSERT INTO cgm_assignment_events (activity_id, student_id, to_group_id, action, actor_label, reason)
       VALUES (?, ?, ?, 'assigned', ?, 'added by group leader')`
    ).bind(seat.activityId, targetId, seat.groupId, `${student.full_name} (group leader)`).run();
    await notifyStudent(c.env.DB, targetId, 'groups', 'You were added to a group',
      `${student.full_name} added you to ${seat.groupName} in ${seat.activityName}.`,
      `#class-groups/student/activity/${seat.activityId}`);
    await auditCgm(c.env.DB, {
      actorType: 'student', actorLabel: String(student.full_name || 'Leader'), actorStudentId: Number(student.id),
      action: 'cgm.leader.member_added', entityType: 'group', entityId: seat.groupId,
      classId: seat.classId, activityId: seat.activityId,
      context: { appointmentId: seat.appointmentId, studentId: targetId },
    });
    const organizers = await organizersFor(c.env.DB, seat.classId, 'move_students');
    if (organizers.length) {
      await createNotification(c.env.DB, {
        title: 'Leader added a member',
        message: `${student.full_name} (leader of ${seat.groupName}) added ${nameRows[0]?.full_name || 'a student'} in ${seat.activityName}.`,
        audience: 'system', audienceLabel: 'Class & Groups', recipientProfileIds: organizers,
      });
    }
    return c.json({ success: true, data: { status: 'added', studentId: targetId } });
  });

  app.post('/api/cgm/student/leader/groups/:id/members/:studentId/remove', async (c: any) => {
    const student = await requireStudent(c);
    if (!student) return c.json({ success: false, error: 'Student session required' }, 401);
    const groupId = Number(c.req.param('id'));
    const gate = await seatOr403(c, student, groupId);
    if (gate.response) return gate.response;
    const seat = gate.seat;
    const targetId = Number(c.req.param('studentId'));
    if (targetId === Number(student.id)) {
      return bad(c, 'You cannot remove yourself — ask your organizer to end your leadership role.', 409);
    }
    const body = await readBody(c);
    const reason = cleanOrNull(body.reason, 500);
    const members = await asRows<any>(c.env.DB.prepare(
      `SELECT ga.id, ga.student_id, s.full_name FROM cgm_group_assignments ga
       JOIN cgm_students s ON s.id = ga.student_id
       WHERE ga.group_id = ? AND ga.student_id = ? AND ga.status = 'active'`
    ).bind(seat.groupId, targetId));
    const membership = members[0];
    if (!membership) return bad(c, 'That student is not in your group.', 404);
    const direct = leaderHas(seat, 'remove_members');
    if (!direct) {
      const denied = permissionOr403(c, seat, 'request_member_removals');
      if (denied) return denied;
      const created = await fileLeaderRequest(c, seat, student, 'remove_member', targetId,
        `Remove ${membership.full_name} from ${seat.groupName}`, reason);
      if (created.response) return created.response;
      return c.json({ success: true, data: { status: 'pending_request', requestId: created.id } });
    }
    await c.env.DB.prepare(
      `UPDATE cgm_group_assignments SET status = 'removed', removed_at = CURRENT_TIMESTAMP, removal_reason = ? WHERE id = ?`
    ).bind(reason || 'removed by group leader', Number(membership.id)).run();
    await c.env.DB.prepare(
      `INSERT INTO cgm_assignment_events (activity_id, student_id, from_group_id, action, actor_label, reason)
       VALUES (?, ?, ?, 'removed', ?, ?)`
    ).bind(seat.activityId, targetId, seat.groupId, `${student.full_name} (group leader)`, reason).run();
    // A removed leader/assistant loses the seat with the membership — the same
    // succession trigger an organizer removal fires.
    const seats = await asRows<{ id: number }>(c.env.DB.prepare(
      `SELECT id FROM cgm_leadership_appointments WHERE group_id = ? AND student_id = ? AND status = 'active'`
    ).bind(seat.groupId, targetId));
    for (const row of seats) {
      await c.env.DB.prepare(
        `UPDATE cgm_leadership_appointments SET status = 'ended', ended_at = CURRENT_TIMESTAMP, end_reason = 'removed from group' WHERE id = ?`
      ).bind(Number(row.id)).run();
    }
    await notifyStudent(c.env.DB, targetId, 'groups', 'Removed from group',
      `You were removed from ${seat.groupName} in ${seat.activityName}. ${reason || ''}`.trim(),
      `#class-groups/student/activity/${seat.activityId}`);
    await auditCgm(c.env.DB, {
      actorType: 'student', actorLabel: String(student.full_name || 'Leader'), actorStudentId: Number(student.id),
      action: 'cgm.leader.member_removed', entityType: 'group', entityId: seat.groupId,
      classId: seat.classId, activityId: seat.activityId,
      context: { appointmentId: seat.appointmentId, studentId: targetId, reason },
    });
    const organizers = await organizersFor(c.env.DB, seat.classId, 'remove_students');
    if (organizers.length) {
      await createNotification(c.env.DB, {
        title: 'Leader removed a member',
        message: `${student.full_name} (leader of ${seat.groupName}) removed ${membership.full_name} in ${seat.activityName}. ${reason || ''}`.trim(),
        audience: 'system', audienceLabel: 'Class & Groups', recipientProfileIds: organizers,
      });
    }
    return c.json({ success: true, data: { status: 'removed', studentId: targetId } });
  });

  // -------------------------------------------------------------------------
  // Requests & issues — the leader's line to the organizer
  // -------------------------------------------------------------------------
  app.post('/api/cgm/student/leader/groups/:id/requests', async (c: any) => {
    const student = await requireStudent(c);
    if (!student) return c.json({ success: false, error: 'Student session required' }, 401);
    if (!throttle(c, 30, 3600)) return bad(c, 'Too many requests. Try again later.', 429);
    const groupId = Number(c.req.param('id'));
    const gate = await seatOr403(c, student, groupId);
    if (gate.response) return gate.response;
    const seat = gate.seat;
    const body = await readBody(c);
    const kind = String(body.kind || 'issue');
    if (!['add_member', 'remove_member', 'issue', 'access'].includes(kind)) return bad(c, 'Unknown request type.');

    // ASKING FOR A TOOL — the leader names a capability they do NOT hold, and
    // the organizer decides. Deliberately ungated: a leader with no tools at all
    // must still be able to ask, and asking is the only path to being opened.
    if (kind === 'access') {
      const wanted = String(body.permission || '');
      if (!(LEADER_PERMISSIONS as readonly string[]).includes(wanted)) return bad(c, 'Choose the tool you are asking for.');
      if (leaderHas(seat, wanted as any)) return bad(c, 'You already have that tool.', 409);
      if (seat.role === 'assistant' && !ASSISTANT_LEADER_PERMISSIONS.includes(wanted as any)) {
        return bad(c, 'An assistant leader cannot be given that tool. Ask your group leader or your organizer.', 403);
      }
      const label = LEADER_PERMISSION_LABELS[wanted as keyof typeof LEADER_PERMISSION_LABELS] || wanted;
      const created = await fileLeaderRequest(c, seat, student, 'access', null,
        clean(body.title, 160) || `Open “${label}” for me`,
        cleanOrNull(body.reason, 1000),
        wanted);
      if (created.response) return created.response;
      return c.json({
        success: true,
        data: {
          id: created.id, status: 'pending', permission: wanted,
          message: `Sent to your organizer. When they approve it, “${label}” opens for you on your next visit here.`,
        },
      });
    }

    const permission = kind === 'add_member' ? 'request_member_additions'
      : kind === 'remove_member' ? 'request_member_removals' : 'report_issues';
    const denied = permissionOr403(c, seat, permission as any);
    if (denied) return denied;
    const targetId = kind === 'issue' ? null : Number(body.studentId) || null;
    if (kind !== 'issue' && !targetId) return bad(c, 'Choose the student this request is about.');
    if (targetId && targetId === Number(student.id)) return bad(c, 'That request would be about yourself.', 409);
    // A request about state that is already true would be approved into a
    // no-op, so it is refused here with the fact instead.
    if (kind === 'add_member') {
      const placed = await asRows<{ group_id: number }>(c.env.DB.prepare(
        `SELECT group_id FROM cgm_group_assignments WHERE activity_id = ? AND student_id = ? AND status = 'active'`
      ).bind(seat.activityId, targetId));
      if (placed[0]) return bad(c, 'That classmate already has a group in this activity.', 409);
    }
    if (kind === 'remove_member') {
      const mine = await asRows<{ id: number }>(c.env.DB.prepare(
        `SELECT id FROM cgm_group_assignments WHERE group_id = ? AND student_id = ? AND status = 'active'`
      ).bind(seat.groupId, targetId));
      if (!mine[0]) return bad(c, 'That student is not in your group.', 404);
    }
    const title = clean(body.title, 160) || (kind === 'issue' ? 'Group issue' : 'Member request');
    const reason = cleanOrNull(body.reason, 1000);
    if (kind === 'issue' && !reason && !clean(body.title, 160)) return bad(c, 'Describe the issue.');
    const created = await fileLeaderRequest(c, seat, student, kind as any, targetId, title, reason);
    if (created.response) return created.response;
    return c.json({
      success: true,
      data: {
        id: created.id, status: 'pending',
        message: kind === 'issue'
          ? 'Your organizers have been told — it is on their list as well as PHANTOM’s.'
          : 'Sent to your organizer for approval. Nothing changes in the group until they decide.',
      },
    });
  });
};

/** Notify every active member of the group except whoever is acting. */
const notifyGroupMembers = async (
  db: D1Database,
  groupId: number,
  actorStudentId: number,
  seat: any,
  title: string,
  body: string,
) => {
  const rows = await asRows<{ student_id: number }>(db.prepare(
    `SELECT student_id FROM cgm_group_assignments WHERE group_id = ? AND status = 'active'`
  ).bind(groupId));
  // The notification opens the group's activity, so a tap is a landing, not a
  // hunt through the portal.
  const activity = await asRows<{ activity_id: number }>(db.prepare(
    'SELECT activity_id FROM cgm_groups WHERE id = ?'
  ).bind(groupId));
  const link = activity[0]?.activity_id ? `#class-groups/student/activity/${Number(activity[0].activity_id)}` : null;
  let sent = 0;
  for (const row of rows) {
    if (Number(row.student_id) === Number(actorStudentId)) continue;
    await notifyStudent(db, Number(row.student_id), 'groups', title, body, link);
    sent += 1;
  }
  return sent;
};

/** Record a leader request and put it in front of the organizers + PHANTOM. */
const fileLeaderRequest = async (
  c: any,
  seat: any,
  student: any,
  kind: 'add_member' | 'remove_member' | 'issue' | 'access',
  targetStudentId: number | null,
  title: string,
  reason: string | null,
  requestedPermission: string | null = null,
): Promise<{ id: number; response?: Response }> => {
  if (kind === 'access' && requestedPermission) {
    const pending = await asRows<{ id: number }>(c.env.DB.prepare(
      `SELECT id FROM cgm_group_leader_requests
       WHERE activity_id = ? AND requested_by_student_id = ? AND kind = 'access'
         AND requested_permission = ? AND status = 'pending'`
    ).bind(seat.activityId, Number(student.id), requestedPermission));
    if (pending[0]) {
      return {
        id: Number(pending[0].id),
        response: c.json({
          success: true,
          data: {
            id: Number(pending[0].id), status: 'pending', permission: requestedPermission,
            message: 'That request is already waiting for your organizer.',
          },
        }),
      };
    }
  }
  if (targetStudentId) {
    const pending = await asRows<{ id: number }>(c.env.DB.prepare(
      `SELECT id FROM cgm_group_leader_requests WHERE group_id = ? AND kind = ? AND target_student_id = ? AND status = 'pending'`
    ).bind(seat.groupId, kind, targetStudentId));
    if (pending[0]) {
      return {
        id: Number(pending[0].id),
        response: c.json({
          success: true,
          data: {
            id: Number(pending[0].id), status: 'pending',
            message: 'That request is already waiting for your organizer.',
          },
        }),
      };
    }
  }
  const inserted = await c.env.DB.prepare(
    `INSERT INTO cgm_group_leader_requests
      (class_id, activity_id, group_id, kind, requested_by_student_id, requester_label, appointment_id,
       target_student_id, requested_permission, title, reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    seat.classId, seat.activityId, seat.groupId, kind, Number(student.id),
    `${student.full_name} (${seat.role === 'leader' ? 'group leader' : 'assistant leader'})`,
    seat.appointmentId, targetStudentId, requestedPermission, clean(title, 160), reason,
  ).run();
  const id = Number(inserted.meta.last_row_id);
  await auditCgm(c.env.DB, {
    actorType: 'student', actorLabel: String(student.full_name || 'Leader'), actorStudentId: Number(student.id),
    action: `cgm.leader.request_${kind}`, entityType: 'leader_request', entityId: id,
    classId: seat.classId, activityId: seat.activityId,
    context: { appointmentId: seat.appointmentId, groupId: seat.groupId, targetStudentId },
  });
  const organizers = await organizersFor(c.env.DB, seat.classId,
    kind === 'remove_member' ? 'remove_students' : kind === 'add_member' ? 'move_students' : null);
  if (organizers.length) {
    await createNotification(c.env.DB, {
      title: kind === 'issue' ? 'Group issue reported by a leader'
        : kind === 'access' ? 'A leader asked you to open a tool'
        : 'Leader request awaiting your decision',
      message: `${student.full_name} (${seat.role} of ${seat.groupName}, ${seat.activityName}): ${clean(title, 160)}`
        + (reason ? ` — ${reason}` : ''),
      audience: 'system', audienceLabel: 'Class & Groups', recipientProfileIds: organizers,
    });
  }
  if (kind === 'issue') {
    await recordPhantomInboxItem(c.env.DB, {
      channel: 'class_groups',
      title: 'Group issue reported by a leader',
      summary: `${student.full_name} (leader of ${seat.groupName}, ${seat.activityName}): ${clean(title, 160)}`.slice(0, 500),
      source: 'cgm_leader_request', sourceId: String(id),
      actorProfileId: null, actorLabel: String(student.full_name || 'Group leader'),
      link: '#class-groups/phantom', body: String(reason || '').slice(0, 2000),
    });
  }
  return { id };
};

/** Every permission the leader console understands — exported for the client. */
export const LEADER_CAPABILITY_CATALOGUE = LEADER_PERMISSIONS.map((permission) => ({
  key: permission,
  label: LEADER_PERMISSION_LABELS[permission],
  hint: LEADER_PERMISSION_HINTS[permission],
}));

/** Re-exported so organizers' routes can validate the same catalogue. */
export { sanitizeLeaderPermissions };
