/**
 * CODE Rx SOCIETY — CGM student surface.
 *
 *   POST /api/cgm/student/register     index number + shared class entry password
 *   POST /api/cgm/student/login        identifier + PERMANENT passkey
 *   POST /api/cgm/student/logout
 *   GET  /api/cgm/student/me
 *   GET  /api/cgm/student/classes
 *   GET  /api/cgm/student/classes/:id
 *   GET  /api/cgm/student/activities/:id
 *   POST /api/cgm/student/activities/:id/assign      self / hybrid assignment
 *   POST /api/cgm/student/activities/:id/contest     contest for group leader
 *   POST /api/cgm/student/elections/:id/vote
 *   GET  /api/cgm/student/elections/:id
 *   POST /api/cgm/student/groups/:id/request-move
 *   GET  /api/cgm/student/attendance
 *   GET  /api/cgm/student/calendar
 *   GET  /api/cgm/student/notifications
 *   POST /api/cgm/student/notifications/read
 *   POST /api/cgm/student/profile/change
 *   POST /api/cgm/student/passkey/change
 *   GET  /api/cgm/invitations/:code                  public invitation landing
 *   POST /api/cgm/student/join                       membership request by code
 *   POST /api/cgm/student/invitations/:code/claim    individual invitation claim
 *   POST /api/cgm/whatsapp/:linkId/click
 *
 * Authorization: a student session header that is never a member JWT. Every
 * handler re-reads liveness and scope from the database. Login always requires
 * the permanent passkey; the identifier is the confirming half.
 */

import type { Hono } from 'hono';
import {
  LOGIN_IDENTIFIER_KEYS,
  phoneKey,
  sequenceForPasskey,
  STUDENT_PROFILE_FIELDS,
  sanitizeActivityConfig,
  type LoginIdentifierKey,
} from './core';
import {
  asRows,
  auditCgm,
  bad,
  clean,
  cleanOrNull,
  createStudentSession,
  notifyStudent,
  readBody,
  requireModuleEnabled,
  requireStudent,
  revokeStudentSessions,
  STUDENT_LOCK_MINUTES,
  STUDENT_MAX_FAILED_ATTEMPTS,
  studentFromRequest,
  studentLockInfo,
  throttle,
  verifyEntryPassword,
  verifyPassword,
  hashPassword,
  type CgmStudentRow,
} from './service';
import { sha256Hex } from '../vault';
import { createNotification } from '../notifications';

// §31 — categories a student may mute. Security- and registration-relevant
// notices are always delivered regardless of preferences.
const MUTABLE_NOTIFICATION_CATEGORIES = ['activity', 'groups', 'leadership', 'election', 'attendance', 'profile'] as const;


type CgmApp = Hono<any>;

const GENERIC_REGISTER_FAILURE = 'Registration could not be accepted. Check your index number and the class entry password.';
const GENERIC_LOGIN_FAILURE = 'Those details do not match a student account.';

const publicStudent = (student: CgmStudentRow) => ({
  id: student.id,
  fullName: student.full_name,
  indexNumber: student.index_number,
  institution: student.institution,
  universityId: student.university_id,
  phone: student.phone,
  email: student.email,
  gender: student.gender,
  passkeyHint: student.passkey_suffix ? `rx30${student.passkey_suffix.slice(0, 1)}…` : null,
  customFields: (() => { try { return JSON.parse(student.custom_fields_json || '{}'); } catch { return {}; } })(),
});

const sessionCookieFree = { credentials: 'omit' as const };

export const registerCgmStudentRoutes = (app: CgmApp) => {

  // -------------------------------------------------------------------------
  // Registration: roster identity + shared class entry password
  // -------------------------------------------------------------------------
  app.post('/api/cgm/student/register', async (c: any) => {
    const dark = await requireModuleEnabled(c);
    if (dark) return dark;
    if (!throttle(c, 10, 3600)) return bad(c, 'Too many registration attempts. Try again later.', 429);
    const body = await readBody(c);
    const classCode = clean(body.classCode, 40);
    const indexNumber = clean(body.indexNumber, 80);
    const entryPassword = String(body.entryPassword ?? '');
    if (!classCode || !indexNumber || !entryPassword) return bad(c, GENERIC_REGISTER_FAILURE, 400);

    const classRows = await asRows<any>(c.env.DB.prepare(
      `SELECT id, name, code, entry_password_verifier FROM cgm_classes WHERE code = ? AND status = 'active'`
    ).bind(classCode));
    const klass = classRows[0];
    // Anti-enumeration: unknown class, unknown index and wrong password all
    // return the same neutral response.
    if (!klass) return c.json({ success: false, error: GENERIC_REGISTER_FAILURE }, 400);
    if (!await verifyEntryPassword(entryPassword, klass.entry_password_verifier)) {
      return c.json({ success: false, error: GENERIC_REGISTER_FAILURE }, 400);
    }

    const rosterRows = await asRows<any>(c.env.DB.prepare(
      `SELECT id, full_name, index_number, status, student_id FROM cgm_roster_entries
       WHERE class_id = ? AND index_number_key = ?`
    ).bind(klass.id, String(indexNumber).trim().replace(/\s+/g, ' ').toLowerCase()));
    const entry = rosterRows[0];
    if (!entry) return c.json({ success: false, error: GENERIC_REGISTER_FAILURE }, 400);

    // A student identity that already exists (registered in another class)
    // does not need a new identity: the request links the existing student.
    let existingStudentId: number | null = entry.student_id ? Number(entry.student_id) : null;
    if (!existingStudentId) {
      const found = await asRows<{ id: number }>(c.env.DB.prepare(
        `SELECT id FROM cgm_students WHERE institution_key = ? AND index_number_key = ?`
      ).bind(String(klass.institution_key || ''), String(indexNumber).trim().replace(/\s+/g, ' ').toLowerCase()));
      existingStudentId = found[0] ? Number(found[0].id) : null;
    }

    const pending = await asRows<{ id: number }>(c.env.DB.prepare(
      `SELECT id FROM cgm_registration_requests WHERE roster_entry_id = ? AND status = 'pending'`
    ).bind(entry.id));
    if (pending[0]) {
      return c.json({ success: true, data: { state: 'received', message: 'Your registration was already received and is awaiting review.' } });
    }

    await c.env.DB.prepare(
      `INSERT INTO cgm_registration_requests (class_id, roster_entry_id, student_id, identifier_hint)
       VALUES (?, ?, ?, ?)`
    ).bind(klass.id, entry.id, existingStudentId, `${String(indexNumber).slice(0, 3)}…`).run();

    await auditCgm(c.env.DB, {
      actorType: 'student', actorLabel: `Roster ${entry.index_number}`, actorStudentId: existingStudentId,
      action: 'cgm.registration.requested', entityType: 'class', entityId: klass.id, classId: klass.id,
      context: { classCode: klass.code },
    });

    // Tell the organizers who may approve registrations through the existing
    // member notification infrastructure.
    const approvers = await asRows<{ member_profile_id: number }>(c.env.DB.prepare(
      `SELECT member_profile_id FROM cgm_class_organizers
       WHERE class_id = ? AND status = 'active' AND (role = 'primary'
         OR (permissions_json LIKE '%approve_registrations%'))`
    ).bind(klass.id));
    if (approvers.length) {
      await createNotification(c.env.DB, {
        title: 'Class registration request',
        message: `${entry.full_name} (${entry.index_number}) requested registration for ${klass.name} (${klass.code}).`,
        audience: 'system',
        audienceLabel: 'Class & Groups',
        recipientProfileIds: approvers.map((row) => Number(row.member_profile_id)),
      });
    }

    return c.json({ success: true, data: { state: 'received', message: 'Your registration was received and is awaiting review. You will be able to sign in once it is approved.' } }, 200, sessionCookieFree);
  });

  // -------------------------------------------------------------------------
  // Login: identifier + permanent passkey (never an identifier alone)
  // -------------------------------------------------------------------------
  app.post('/api/cgm/student/login', async (c: any) => {
    const dark = await requireModuleEnabled(c);
    if (dark) return dark;
    if (!throttle(c, 15, 300)) return bad(c, 'Too many sign-in attempts. Try again later.', 429);
    const body = await readBody(c);
    const identifierType = String(body.identifierType || 'index_number') as LoginIdentifierKey;
    if (!(LOGIN_IDENTIFIER_KEYS as readonly string[]).includes(identifierType)) return bad(c, GENERIC_LOGIN_FAILURE, 400);
    const identifier = clean(body.identifier, 120);
    const passkey = clean(body.passkey, 40);
    if (!identifier || !passkey) return bad(c, GENERIC_LOGIN_FAILURE, 400);

    const sequence = sequenceForPasskey(passkey);
    if (sequence === null) return c.json({ success: false, error: GENERIC_LOGIN_FAILURE }, 400);

    const rows = await asRows<any>(c.env.DB.prepare(
      `SELECT * FROM cgm_students WHERE passkey_sequence = ?`
    ).bind(sequence));
    const student = rows[0];
    // Unknown passkey and wrong identifier behave identically.
    if (!student) return c.json({ success: false, error: GENERIC_LOGIN_FAILURE }, 400);

    const lock = studentLockInfo(student);
    if (lock) return c.json({ success: false, error: `This account is temporarily locked. Try again after ${lock.toISOString().slice(11, 16)} UTC.` }, 423);
    if (student.status === 'pending') return c.json({ success: false, error: 'Your registration has not been approved yet.' }, 403);
    if (student.status !== 'active') return c.json({ success: false, error: GENERIC_LOGIN_FAILURE }, 403);

    const normalizedIdentifier = identifierType === 'phone'
      ? phoneKey(identifier)
      : String(identifier).trim().replace(/\s+/g, ' ').toLowerCase();
    const storedIdentifier = identifierType === 'phone'
      ? student.phone_key
      : identifierType === 'university_id' ? student.university_id_key : student.index_number_key;
    if (!storedIdentifier || storedIdentifier !== normalizedIdentifier) {
      await c.env.DB.prepare('UPDATE cgm_students SET failed_attempts = failed_attempts + 1 WHERE id = ?').bind(student.id).run();
      const fresh = await asRows<{ failed_attempts: number }>(c.env.DB.prepare('SELECT failed_attempts FROM cgm_students WHERE id = ?').bind(student.id));
      if (Number(fresh[0]?.failed_attempts || 0) >= STUDENT_MAX_FAILED_ATTEMPTS) {
        await c.env.DB.prepare(
          `UPDATE cgm_students SET locked_until = datetime('now', '+${STUDENT_LOCK_MINUTES} minutes'), failed_attempts = 0 WHERE id = ?`
        ).bind(student.id).run();
        await auditCgm(c.env.DB, {
          actorType: 'system', actorLabel: 'Lockout', actorStudentId: student.id,
          action: 'cgm.student.locked', entityType: 'student', entityId: student.id,
        });
      }
      return c.json({ success: false, error: GENERIC_LOGIN_FAILURE }, 400);
    }

    if (!student.passkey_verifier || !await verifyPassword(passkey, student.passkey_verifier)) {
      await c.env.DB.prepare('UPDATE cgm_students SET failed_attempts = failed_attempts + 1 WHERE id = ?').bind(student.id).run();
      return c.json({ success: false, error: GENERIC_LOGIN_FAILURE }, 400);
    }

    await c.env.DB.prepare(
      'UPDATE cgm_students SET failed_attempts = 0, locked_until = NULL WHERE id = ?'
    ).bind(student.id).run();
    const session = await createStudentSession(c.env.DB, student.id, {
      ip: c.req.header('cf-connecting-ip'),
      userAgent: c.req.header('user-agent'),
    });
    await auditCgm(c.env.DB, {
      actorType: 'student', actorLabel: student.full_name, actorStudentId: student.id,
      action: 'cgm.student.login', entityType: 'student', entityId: student.id,
      context: { identifierType },
    });
    return c.json({
      success: true,
      data: { session, student: publicStudent(student) },
    }, 200, sessionCookieFree);
  });

  app.post('/api/cgm/student/logout', async (c: any) => {
    const student = await requireStudent(c);
    if (student) {
      await revokeStudentSessions(c.env.DB, student.id);
      await auditCgm(c.env.DB, {
        actorType: 'student', actorLabel: student.full_name, actorStudentId: student.id,
        action: 'cgm.student.logout', entityType: 'student', entityId: student.id,
      });
    }
    return c.json({ success: true });
  });

  // -------------------------------------------------------------------------
  // Session surface
  // -------------------------------------------------------------------------
  app.get('/api/cgm/student/me', async (c: any) => {
    const dark = await requireModuleEnabled(c);
    if (dark) return dark;
    const student = await requireStudent(c);
    if (!student) return c.json({ success: false, error: 'Student session required' }, 401);
    const memberships = await asRows<any>(c.env.DB.prepare(
      `SELECT m.id AS member_id, m.status AS member_status, cl.id AS class_id, cl.code, cl.name,
              cl.institution, cl.academic_year, cl.level, cl.department
       FROM cgm_class_members m
       JOIN cgm_classes cl ON cl.id = m.class_id
       WHERE m.student_id = ? AND m.status IN ('active','suspended')
       ORDER BY cl.name`
    ).bind(student.id));
    const pendingMemberships = await asRows<any>(c.env.DB.prepare(
      `SELECT r.id, r.status, cl.name AS class_name, cl.code, r.created_at
       FROM cgm_membership_requests r JOIN cgm_classes cl ON cl.id = r.class_id
       WHERE r.student_id = ? AND r.status = 'pending'`
    ).bind(student.id));
    const registrations = await asRows<any>(c.env.DB.prepare(
      `SELECT r.id, r.status, cl.name AS class_name, cl.code, r.created_at
       FROM cgm_registration_requests r JOIN cgm_classes cl ON cl.id = r.class_id
       WHERE r.student_id = ? AND r.status = 'pending'`
    ).bind(student.id));
    const unread = await asRows<{ c: number }>(c.env.DB.prepare(
      'SELECT COUNT(*) AS c FROM cgm_student_notifications WHERE student_id = ? AND read_at IS NULL'
    ).bind(student.id));
    return c.json({
      success: true,
      data: {
        student: publicStudent(student),
        classes: memberships,
        pendingMemberships,
        pendingRegistrations: registrations,
        unreadNotifications: Number(unread[0]?.c || 0),
      },
    });
  });

  // -------------------------------------------------------------------------
  // Class dashboards
  // -------------------------------------------------------------------------
  const activeMembership = async (ctx: any, studentId: number, classId: number) => {
    const rows = await asRows<any>(ctx.env.DB.prepare(
      `SELECT m.id, m.status, cl.id AS class_id, cl.code, cl.name, cl.institution, cl.department,
              cl.academic_year, cl.level, cl.description, cl.settings_json
       FROM cgm_class_members m JOIN cgm_classes cl ON cl.id = m.class_id
       WHERE m.student_id = ? AND m.class_id = ? AND m.status = 'active'`
    ).bind(studentId, classId));
    return rows[0] || null;
  };

  app.get('/api/cgm/student/classes', async (c: any) => {
    const student = await requireStudent(c);
    if (!student) return c.json({ success: false, error: 'Student session required' }, 401);
    const rows = await asRows<any>(c.env.DB.prepare(
      `SELECT cl.id, cl.code, cl.name, cl.institution, cl.department, cl.academic_year, cl.level, cl.description,
              m.joined_at,
              (SELECT COUNT(*) FROM cgm_class_members cm2 WHERE cm2.class_id = cl.id AND cm2.status = 'active') AS member_count,
              (SELECT COUNT(*) FROM cgm_activities a WHERE a.class_id = cl.id AND a.status IN ('open','published','active')) AS active_activities
       FROM cgm_class_members m JOIN cgm_classes cl ON cl.id = m.class_id
       WHERE m.student_id = ? AND m.status = 'active'
       ORDER BY cl.name`
    ).bind(student.id));
    return c.json({ success: true, data: rows });
  });

  app.get('/api/cgm/student/classes/:classId', async (c: any) => {
    const student = await requireStudent(c);
    if (!student) return c.json({ success: false, error: 'Student session required' }, 401);
    const classId = Number(c.req.param('classId'));
    const membership = await activeMembership(c, student.id, classId);
    if (!membership) return bad(c, 'You are not a member of this class.', 403);

    const organizers = await asRows<any>(c.env.DB.prepare(
      `SELECT o.role, COALESCE(u.name, mu.name, 'Member') AS name FROM cgm_class_organizers o
       LEFT JOIN member_profiles mp ON mp.id = o.member_profile_id
       LEFT JOIN users u ON u.id = mp.user_id
       LEFT JOIN members mu ON mu.id = mp.member_record_id
       WHERE o.class_id = ? AND o.status = 'active' ORDER BY CASE o.role WHEN 'primary' THEN 0 WHEN 'co_organizer' THEN 1 ELSE 2 END`
    ).bind(classId));

    const activities = await asRows<any>(c.env.DB.prepare(
      `SELECT id, name, type, description, status, config_json, opened_at, published_at, completed_at
       FROM cgm_activities WHERE class_id = ? AND status IN ('open','published','active','completed')
       ORDER BY created_at DESC LIMIT 50`
    ).bind(classId));

    const myGroups = await asRows<any>(c.env.DB.prepare(
      `SELECT ga.id AS assignment_id, ga.activity_id, g.id AS group_id, g.name AS group_name, g.position, a.name AS activity_name
       FROM cgm_group_assignments ga
       JOIN cgm_groups g ON g.id = ga.group_id
       JOIN cgm_activities a ON a.id = ga.activity_id
       WHERE ga.student_id = ? AND ga.status = 'active' AND a.class_id = ? AND a.status IN ('published','active','completed')
       ORDER BY a.created_at DESC`
    ).bind(student.id, classId));

    const groupIds = myGroups.map((row) => Number(row.group_id));
    const announcements = groupIds.length
      ? await asRows<any>(c.env.DB.prepare(
        `SELECT id, title, body, author_label, pinned, created_at, activity_id, group_id, attachment_name, attachment_size FROM cgm_announcements
         WHERE class_id = ? AND status = 'published'
           AND (group_id IS NULL OR group_id IN (${groupIds.map(() => '?').join(',')}))
         ORDER BY pinned DESC, created_at DESC LIMIT 30`
      ).bind(classId, ...groupIds))
      : await asRows<any>(c.env.DB.prepare(
        `SELECT id, title, body, author_label, pinned, created_at, activity_id, group_id, attachment_name, attachment_size FROM cgm_announcements
         WHERE class_id = ? AND status = 'published' AND group_id IS NULL
         ORDER BY pinned DESC, created_at DESC LIMIT 30`
      ).bind(classId));

    const leaders = groupIds.length ? await asRows<any>(c.env.DB.prepare(
      `SELECT l.group_id, l.role, l.student_id, s.full_name, l.status, l.started_at
       FROM cgm_leadership_appointments l JOIN cgm_students s ON s.id = l.student_id
       WHERE l.activity_id IN (SELECT id FROM cgm_activities WHERE class_id = ?)
         AND l.status = 'active' AND l.group_id IN (${(groupIds.length ? groupIds : [0]).map(() => '?').join(',')})`
    ).bind(classId, ...groupIds)) : [];

    const attendance = await asRows<any>(c.env.DB.prepare(
      `SELECT r.status, COUNT(*) AS c FROM cgm_attendance_records r
       JOIN cgm_attendance_sessions sess ON sess.id = r.session_id
       JOIN cgm_activities a ON a.id = sess.activity_id
       WHERE r.student_id = ? AND a.class_id = ? GROUP BY r.status`
    ).bind(student.id, classId));

    // §12 read tracking: opening the class dashboard counts as reading the
    // announcements it shows. One row per student per announcement, ever.
    if (announcements.length) {
      await c.env.DB.batch(announcements.map((row) => c.env.DB.prepare(
        'INSERT OR IGNORE INTO cgm_announcement_reads (announcement_id, student_id) VALUES (?, ?)'
      ).bind(Number(row.id), student.id)));
    }

    return c.json({
      success: true,
      data: {
        membership: {
          id: membership.id, joinedAt: membership.joined_at,
        },
        class: {
          id: membership.class_id, code: membership.code, name: membership.name,
          institution: membership.institution, department: membership.department,
          academicYear: membership.academic_year, level: membership.level, description: membership.description,
        },
        organizers: organizers.map((row) => ({ role: row.role, name: row.name || 'Organizer' })),
        activities: activities.map((row) => ({
          id: Number(row.id), name: row.name, type: row.type, description: row.description,
          status: row.status, config: sanitizeActivityConfig(JSON.parse(row.config_json || '{}')),
          openedAt: row.opened_at, publishedAt: row.published_at, completedAt: row.completed_at,
        })),
        myGroups,
        announcements: announcements.map((row) => ({
          id: Number(row.id), title: row.title, body: row.body, authorLabel: row.author_label,
          pinned: Number(row.pinned) === 1, createdAt: row.created_at,
          attachmentName: row.attachment_name || null,
          attachmentSize: row.attachment_size === null || row.attachment_size === undefined ? null : Number(row.attachment_size),
          attachmentUrl: row.attachment_name ? `/api/cgm/announcements/${Number(row.id)}/attachment` : null,
        })),
        leaders,
        attendanceSummary: attendance,
      },
    });
  });

  // -------------------------------------------------------------------------
  // Activity view + self-assignment + contests + elections (student side)
  // -------------------------------------------------------------------------
  const studentActivityContext = async (ctx: any, student: CgmStudentRow, activityId: number) => {
    const rows = await asRows<any>(ctx.env.DB.prepare(
      `SELECT a.*, cl.settings_json AS class_settings, cl.name AS class_name, cl.code AS class_code
       FROM cgm_activities a JOIN cgm_classes cl ON cl.id = a.class_id WHERE a.id = ?`
    ).bind(activityId));
    const activity = rows[0];
    if (!activity) return { ok: false as const, error: 'Activity not found.' };
    const membership = await activeMembership(ctx, student.id, Number(activity.class_id));
    if (!membership) return { ok: false as const, error: 'You are not a member of this class.' };
    return { ok: true as const, activity, membership };
  };

  const isEligible = async (db: D1Database, activityId: number, studentId: number, eligibility: string) => {
    if (eligibility !== 'selected') return true;
    const rows = await asRows<{ student_id: number }>(db.prepare(
      'SELECT student_id FROM cgm_activity_eligible WHERE activity_id = ? AND student_id = ?'
    ).bind(activityId, studentId));
    return Boolean(rows[0]);
  };

  app.get('/api/cgm/student/activities/:id', async (c: any) => {
    const student = await requireStudent(c);
    if (!student) return c.json({ success: false, error: 'Student session required' }, 401);
    const context = await studentActivityContext(c, student, Number(c.req.param('id')));
    if (!context.ok) return bad(c, context.error, 404);
    const { activity } = context;
    const config = sanitizeActivityConfig(JSON.parse(activity.config_json || '{}'));
    const visibleStatuses = ['open', 'published', 'active', 'completed'];
    if (!visibleStatuses.includes(activity.status)) return bad(c, 'Activity not found.', 404);

    const eligible = await isEligible(c.env.DB, activity.id, student.id, config.eligibility);
    const myAssignment = await asRows<any>(c.env.DB.prepare(
      `SELECT ga.id AS assignment_id, g.id AS group_id, g.name AS group_name, g.position, g.capacity
       FROM cgm_group_assignments ga JOIN cgm_groups g ON g.id = ga.group_id
       WHERE ga.activity_id = ? AND ga.student_id = ? AND ga.status = 'active'`
    ).bind(activity.id, student.id));
    const waitlisted = await asRows<any>(c.env.DB.prepare(
      'SELECT id, status FROM cgm_activity_waitlist WHERE activity_id = ? AND student_id = ? AND status = ?'
    ).bind(activity.id, student.id, 'waiting'));

    const groups = await asRows<any>(c.env.DB.prepare(
      `SELECT g.id, g.name, g.position, g.capacity,
              (SELECT COUNT(*) FROM cgm_group_assignments ga WHERE ga.group_id = g.id AND ga.status = 'active') AS size
       FROM cgm_groups g WHERE g.activity_id = ? AND g.status = 'active' ORDER BY g.position`
    ).bind(activity.id));

    const groupIds = groups.map((row) => Number(row.id));
    // Privacy-first (§35): classmates see each other's names only. Contact
    // fields (phone, email) are appended per row ONLY when the activity's
    // contact visibility allows it — 'class' for everyone here, 'group' for
    // the viewer's own group, 'none' for nobody. Index numbers, university
    // IDs and gender never reach a classmate, whatever the setting says.
    const members = groupIds.length ? await asRows<any>(c.env.DB.prepare(
      `SELECT ga.group_id, s.id AS student_id, s.full_name,
              CASE WHEN l.role = 'leader' THEN 'leader' WHEN l.role = 'assistant' THEN 'assistant' ELSE NULL END AS leader_role
       FROM cgm_group_assignments ga
       JOIN cgm_students s ON s.id = ga.student_id
       LEFT JOIN cgm_leadership_appointments l ON l.group_id = ga.group_id AND l.student_id = ga.student_id AND l.status = 'active'
       WHERE ga.activity_id = ? AND ga.status = 'active'
       ORDER BY g_position_index, s.full_name`.replace('g_position_index', '(SELECT position FROM cgm_groups WHERE id = ga.group_id)')
    ).bind(activity.id)) : [];
    if (members.length && (config.contactVisibility === 'class' || (config.contactVisibility === 'group' && myAssignment[0]))) {
      const visibleScope: number[] = config.contactVisibility === 'class'
        ? members.map((row) => Number(row.student_id))
        : members.filter((row) => Number(row.group_id) === Number(myAssignment[0].group_id)).map((row) => Number(row.student_id));
      const contacts = visibleScope.length ? await asRows<{ id: number; phone: string | null; email: string | null }>(c.env.DB.prepare(
        `SELECT id, phone, email FROM cgm_students WHERE id IN (${visibleScope.map(() => '?').join(',')})`
      ).bind(...visibleScope)) : [];
      const byId = new Map(contacts.map((row) => [Number(row.id), row]));
      for (const row of members) {
        const contact = byId.get(Number(row.student_id));
        if (contact && Number(row.student_id) !== Number(student.id)) {
          if (contact.phone) row.phone = contact.phone;
          if (contact.email) row.email = contact.email;
        }
      }
    }

    const leadership = groupIds.length ? await asRows<any>(c.env.DB.prepare(
      `SELECT l.group_id, l.role, l.student_id, s.full_name, l.started_at
       FROM cgm_leadership_appointments l JOIN cgm_students s ON s.id = l.student_id
       WHERE l.activity_id = ? AND l.status = 'active'`
    ).bind(activity.id)) : [];

    const myElections = groupIds.length ? await asRows<any>(c.env.DB.prepare(
      `SELECT * FROM cgm_elections WHERE activity_id = ? AND status IN ('nominating','voting','closed')
       ${groupIds.length ? `AND group_id IN (${groupIds.map(() => '?').join(',')})` : ''}
       ORDER BY created_at DESC`
    ).bind(activity.id, ...groupIds)) : [];

    const electionIds = myElections.map((row) => Number(row.id));
    const candidates = electionIds.length ? await asRows<any>(c.env.DB.prepare(
      `SELECT c.id, c.election_id, c.student_id, s.full_name, c.statement, c.status
       FROM cgm_candidates c JOIN cgm_students s ON s.id = c.student_id
       WHERE c.election_id IN (${electionIds.map(() => '?').join(',')}) AND c.status = 'active' ORDER BY c.nominated_at`
    ).bind(...electionIds)) : [];

    const myVotes = electionIds.length ? await asRows<any>(c.env.DB.prepare(
      `SELECT election_id FROM cgm_election_participation WHERE election_id IN (${electionIds.map(() => '?').join(',')}) AND student_id = ?`
    ).bind(...electionIds, student.id)) : [];

    const whatsapp = myAssignment[0] && config.whatsappEnabled ? await asRows<any>(c.env.DB.prepare(
      `SELECT id, url FROM cgm_whatsapp_links WHERE group_id = ? AND status = 'active'`
    ).bind(Number(myAssignment[0].group_id))) : [];

    return c.json({
      success: true,
      data: {
        activity: {
          id: Number(activity.id), name: activity.name, type: activity.type, description: activity.description,
          status: activity.status, openedAt: activity.opened_at, publishedAt: activity.published_at,
          config: {
            method: config.method, capacity: config.capacity, selfDeadline: config.selfDeadline,
            contactVisibility: config.contactVisibility, whatsappEnabled: config.whatsappEnabled,
            announcementMode: config.announcementMode, attendanceEnabled: config.attendanceEnabled,
            leaderMethod: config.leaderMethod,
          },
        },
        class: { name: activity.class_name, code: activity.class_code },
        eligible,
        myAssignment: myAssignment[0] || null,
        waitlisted: Boolean(waitlisted[0]),
        groups: groups.map((row) => ({
          id: Number(row.id), name: row.name || `Group ${row.position}`, position: Number(row.position),
          capacity: row.capacity === null ? null : Number(row.capacity), size: Number(row.size),
          full: row.capacity !== null && Number(row.size) >= Number(row.capacity),
        })),
        members,
        leadership,
        elections: myElections.map((row) => ({
          id: Number(row.id), groupId: Number(row.group_id), title: row.title, role: row.role, status: row.status,
          anonymity: row.anonymity, visibility: row.visibility,
          nominationOpenAt: row.nomination_open_at, nominationCloseAt: row.nomination_close_at,
          votingOpenAt: row.voting_open_at, votingCloseAt: row.voting_close_at,
        })),
        candidates,
        myVotedElectionIds: myVotes.map((row) => Number(row.election_id)),
        whatsapp: whatsapp[0] ? { id: Number(whatsapp[0].id), url: whatsapp[0].url } : null,
      },
    });
  });

  app.post('/api/cgm/student/activities/:id/assign', async (c: any) => {
    const student = await requireStudent(c);
    if (!student) return c.json({ success: false, error: 'Student session required' }, 401);
    if (!throttle(c, 30, 300)) return bad(c, 'Too many requests. Slow down and try again.', 429);
    const activityId = Number(c.req.param('id'));
    const context = await studentActivityContext(c, student, activityId);
    if (!context.ok) return bad(c, context.error, 404);
    const { activity } = context;
    const config = sanitizeActivityConfig(JSON.parse(activity.config_json || '{}'));
    if (!['open', 'published', 'active'].includes(activity.status)) return bad(c, 'This activity is not open for assignment.', 409);
    if (config.method === 'automatic') return bad(c, 'Assignments for this activity are made by your organizer.', 409);
    if (config.method === 'hybrid' && config.selfDeadline && new Date(config.selfDeadline).getTime() < Date.now()) {
      return bad(c, 'The self-assignment deadline for this activity has passed.', 409);
    }
    if (!await isEligible(c.env.DB, activity.id, student.id, config.eligibility)) return bad(c, 'You are not eligible for this activity.', 403);

    const existing = await asRows<{ id: number }>(c.env.DB.prepare(
      `SELECT id FROM cgm_group_assignments WHERE activity_id = ? AND student_id = ? AND status = 'active'`
    ).bind(activity.id, student.id));
    if (existing[0]) return bad(c, 'You are already in a group for this activity.', 409);

    const body = await readBody(c);
    const requestedGroupId = body.groupId ? Number(body.groupId) : null;

    const candidateGroups = await asRows<any>(c.env.DB.prepare(
      `SELECT g.id, g.capacity,
              (SELECT COUNT(*) FROM cgm_group_assignments ga WHERE ga.group_id = g.id AND ga.status = 'active') AS size
       FROM cgm_groups g WHERE g.activity_id = ? AND g.status = 'active' ${requestedGroupId ? 'AND g.id = ?' : ''}
       ORDER BY g.position`
    ).bind(...(requestedGroupId ? [activity.id, requestedGroupId] : [activity.id])));

    // Load-balance: the server chooses the emptiest eligible group unless the
    // student explicitly asked for one that still has room.
    const open = candidateGroups
      .filter((group) => group.capacity === null || Number(group.size) < Number(group.capacity))
      .sort((a, b) => Number(a.size) - Number(b.size));
    let target = requestedGroupId ? open[0] : open[0] || null;
    if (!target) {
      if (config.overflow === 'waitlist') {
        await c.env.DB.prepare(
          `INSERT OR IGNORE INTO cgm_activity_waitlist (activity_id, student_id) VALUES (?, ?)`
        ).bind(activity.id, student.id).run();
        await notifyStudent(c.env.DB, student.id, 'groups', 'Added to the waiting list',
          `All groups in ${activity.name} are full. You are on the waiting list and will be placed when a seat opens.`);
        return c.json({ success: true, data: { waitlisted: true, message: 'All groups are full. You have been added to the waiting list.' } });
      }
      return bad(c, 'Every group is full.', 409);
    }

    await c.env.DB.prepare(
      `INSERT INTO cgm_group_assignments (activity_id, group_id, student_id, assigned_via, assigned_by_label)
       VALUES (?, ?, ?, 'self', ?)`
    ).bind(activity.id, Number(target.id), student.id, student.full_name).run();
    await c.env.DB.prepare(
      `INSERT INTO cgm_assignment_events (activity_id, student_id, to_group_id, action, actor_label, reason)
       VALUES (?, ?, ?, 'assigned', ?, 'self-assignment')`
    ).bind(activity.id, student.id, Number(target.id), student.full_name).run();

    const groupRow = await asRows<{ name: string; position: number }>(c.env.DB.prepare(
      'SELECT name, position FROM cgm_groups WHERE id = ?'
    ).bind(Number(target.id)));
    const groupLabel = groupRow[0]?.name || `Group ${groupRow[0]?.position}`;
    await notifyStudent(c.env.DB, student.id, 'groups', 'Group assignment confirmed', `You joined ${groupLabel} in ${activity.name}.`);

    const leaders = await asRows<{ student_id: number }>(c.env.DB.prepare(
      `SELECT student_id FROM cgm_leadership_appointments WHERE group_id = ? AND status = 'active' AND role = 'leader'`
    ).bind(Number(target.id)));
    for (const leader of leaders) {
      if (Number(leader.student_id) !== student.id) {
        await notifyStudent(c.env.DB, Number(leader.student_id), 'groups', 'New group member',
          `${student.full_name} joined your group in ${activity.name}.`);
      }
    }

    await auditCgm(c.env.DB, {
      actorType: 'student', actorLabel: student.full_name, actorStudentId: student.id,
      action: 'cgm.assignment.self', entityType: 'activity', entityId: activity.id, activityId: activity.id,
      classId: Number(activity.class_id), context: { groupId: Number(target.id) },
    });

    return c.json({ success: true, data: { groupId: Number(target.id), groupName: groupLabel } });
  });

  app.post('/api/cgm/student/activities/:id/contest', async (c: any) => {
    const student = await requireStudent(c);
    if (!student) return c.json({ success: false, error: 'Student session required' }, 401);
    const activityId = Number(c.req.param('id'));
    const context = await studentActivityContext(c, student, activityId);
    if (!context.ok) return bad(c, context.error, 404);
    const { activity } = context;
    const body = await readBody(c);
    const statement = cleanOrNull(body.statement, 500);
    const myAssignment = await asRows<{ group_id: number }>(c.env.DB.prepare(
      `SELECT group_id FROM cgm_group_assignments WHERE activity_id = ? AND student_id = ? AND status = 'active'`
    ).bind(activityId, student.id));
    if (!myAssignment[0]) return bad(c, 'Join a group before contesting for group leader.', 409);
    const groupId = Number(myAssignment[0].group_id);

    const now = new Date();
    const elections = await asRows<any>(c.env.DB.prepare(
      `SELECT * FROM cgm_elections WHERE activity_id = ? AND group_id = ? AND status = 'nominating' AND role = 'leader'
       ORDER BY created_at DESC`
    ).bind(activityId, groupId));
    let election = elections[0];
    if (election && election.nomination_open_at && new Date(String(election.nomination_open_at).replace(' ', 'T')) > now) {
      election = null;
    }
    if (election && election.nomination_close_at && new Date(String(election.nomination_close_at).replace(' ', 'T')) < now) {
      election = null;
    }
    if (!election) return bad(c, 'There is no open nomination window for your group right now.', 409);

    const already = await asRows<{ id: number }>(c.env.DB.prepare(
      `SELECT id FROM cgm_candidates WHERE election_id = ? AND student_id = ?`
    ).bind(election.id, student.id));
    if (already[0]) {
      await c.env.DB.prepare(
        `UPDATE cgm_candidates SET status = 'active', withdrawn_at = NULL, statement = COALESCE(?, statement) WHERE id = ?`
      ).bind(statement, Number(already[0].id)).run();
      return c.json({ success: true, data: { candidateId: Number(already[0].id), message: 'Your candidacy is active.' } });
    }
    const result = await c.env.DB.prepare(
      `INSERT INTO cgm_candidates (election_id, student_id, statement) VALUES (?, ?, ?)`
    ).bind(election.id, student.id, statement).run();
    await auditCgm(c.env.DB, {
      actorType: 'student', actorLabel: student.full_name, actorStudentId: student.id,
      action: 'cgm.candidate.nominated', entityType: 'election', entityId: election.id,
      activityId, classId: Number(activity.class_id), context: { groupId },
    });
    return c.json({ success: true, data: { candidateId: Number(result.meta.last_row_id), message: 'You are contesting for group leader.' } });
  });

  app.post('/api/cgm/student/candidates/:id/withdraw', async (c: any) => {
    const student = await requireStudent(c);
    if (!student) return c.json({ success: false, error: 'Student session required' }, 401);
    const candidateId = Number(c.req.param('id'));
    const rows = await asRows<any>(c.env.DB.prepare(
      `SELECT c.*, e.status AS election_status, e.nomination_close_at FROM cgm_candidates c
       JOIN cgm_elections e ON e.id = c.election_id WHERE c.id = ? AND c.student_id = ?`
    ).bind(candidateId, student.id));
    const candidate = rows[0];
    if (!candidate) return bad(c, 'Candidacy not found.', 404);
    if (candidate.election_status !== 'nominating') return bad(c, 'The nomination window has closed.', 409);
    if (candidate.nomination_close_at && new Date(String(candidate.nomination_close_at).replace(' ', 'T')).getTime() < Date.now()) {
      return bad(c, 'The withdrawal deadline has passed.', 409);
    }
    await c.env.DB.prepare(
      `UPDATE cgm_candidates SET status = 'withdrawn', withdrawn_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(candidateId).run();
    await auditCgm(c.env.DB, {
      actorType: 'student', actorLabel: student.full_name, actorStudentId: student.id,
      action: 'cgm.candidate.withdrawn', entityType: 'election', entityId: candidate.election_id,
    });
    return c.json({ success: true });
  });

  app.get('/api/cgm/student/elections/:id', async (c: any) => {
    const student = await requireStudent(c);
    if (!student) return c.json({ success: false, error: 'Student session required' }, 401);
    const electionId = Number(c.req.param('id'));
    const rows = await asRows<any>(c.env.DB.prepare(
      `SELECT e.*, a.class_id FROM cgm_elections e JOIN cgm_activities a ON a.id = e.activity_id WHERE e.id = ?`
    ).bind(electionId));
    const election = rows[0];
    if (!election) return bad(c, 'Election not found.', 404);
    const membership = await activeMembership(c, student.id, Number(election.class_id));
    if (!membership) return bad(c, 'You are not a member of this class.', 403);
    const inGroup = await asRows<{ id: number }>(c.env.DB.prepare(
      `SELECT ga.id FROM cgm_group_assignments ga WHERE ga.activity_id = ? AND ga.student_id = ? AND ga.group_id = ? AND ga.status = 'active'`
    ).bind(election.activity_id, student.id, election.group_id));
    const visibility = String(election.visibility);
    const groupScoped = visibility === 'group';
    if (groupScoped && !inGroup[0]) return bad(c, 'This election is visible to its group only.', 403);

    const candidates = await asRows<any>(c.env.DB.prepare(
      `SELECT c.id, s.full_name, c.statement, c.status FROM cgm_candidates c JOIN cgm_students s ON s.id = c.student_id
       WHERE c.election_id = ? AND c.status = 'active' ORDER BY c.nominated_at`
    ).bind(electionId));
    const participation = await asRows<{ id: number }>(c.env.DB.prepare(
      'SELECT id FROM cgm_election_participation WHERE election_id = ? AND student_id = ?'
    ).bind(electionId, student.id));

    let results = null;
    if (election.status === 'closed' && (visibility !== 'private' || inGroup[0])) {
      const tally = await asRows<any>(c.env.DB.prepare(
        `SELECT candidate_id, COUNT(*) AS votes FROM cgm_election_ballots WHERE election_id = ? GROUP BY candidate_id`
      ).bind(electionId));
      results = { tally };
    }

    return c.json({
      success: true,
      data: {
        election: {
          id: electionId, groupId: Number(election.group_id), title: election.title, role: election.role,
          status: election.status, anonymity: election.anonymity, visibility: election.visibility,
          allowVoteChange: Number(election.allow_vote_change) === 1,
          nominationOpenAt: election.nomination_open_at, nominationCloseAt: election.nomination_close_at,
          votingOpenAt: election.voting_open_at, votingCloseAt: election.voting_close_at,
        },
        candidates,
        voted: Boolean(participation[0]),
        canVote: Boolean(inGroup[0]) && election.status === 'voting',
        results,
      },
    });
  });

  app.post('/api/cgm/student/elections/:id/vote', async (c: any) => {
    const student = await requireStudent(c);
    if (!student) return c.json({ success: false, error: 'Student session required' }, 401);
    if (!throttle(c, 20, 300)) return bad(c, 'Too many vote attempts. Try again shortly.', 429);
    const electionId = Number(c.req.param('id'));
    const body = await readBody(c);
    const candidateId = Number(body.candidateId);
    if (!candidateId) return bad(c, 'Choose a candidate to vote for.');

    const rows = await asRows<any>(c.env.DB.prepare(
      `SELECT * FROM cgm_elections WHERE id = ?`
    ).bind(electionId));
    const election = rows[0];
    if (!election) return bad(c, 'Election not found.', 404);
    if (election.status !== 'voting') return bad(c, 'Voting is not open for this election.', 409);
    const now = Date.now();
    if (election.voting_open_at && new Date(String(election.voting_open_at).replace(' ', 'T')).getTime() > now) {
      return bad(c, 'Voting has not opened yet.', 409);
    }
    if (election.voting_close_at && new Date(String(election.voting_close_at).replace(' ', 'T')).getTime() < now) {
      return bad(c, 'Voting has closed.', 409);
    }

    // Eligibility: the voter must be an active member of THIS group.
    const inGroup = await asRows<{ id: number }>(c.env.DB.prepare(
      `SELECT ga.id FROM cgm_group_assignments ga WHERE ga.activity_id = ? AND ga.student_id = ? AND ga.group_id = ? AND ga.status = 'active'`
    ).bind(election.activity_id, student.id, election.group_id));
    if (!inGroup[0]) return bad(c, 'Only members of this group can vote in its election.', 403);

    const candidate = await asRows<any>(c.env.DB.prepare(
      `SELECT id FROM cgm_candidates WHERE id = ? AND election_id = ? AND status = 'active'`
    ).bind(candidateId, electionId));
    if (!candidate[0]) return bad(c, 'That candidate is not on the ballot.', 400);

    const participation = await asRows<any>(c.env.DB.prepare(
      'SELECT id, change_count FROM cgm_election_participation WHERE election_id = ? AND student_id = ?'
    ).bind(electionId, student.id));
    const allowChange = Number(election.allow_vote_change) === 1;
    if (participation[0] && !allowChange) return bad(c, 'You have already voted in this election.', 409);

    const salt = String(election.salt || '');
    const pseudonym = String(election.anonymity) === 'anonymous'
      ? (await sha256Hex(`cgm-ballot:${salt}:${electionId}:${student.id}`)).slice(0, 40)
      : null;

    if (participation[0] && allowChange) {
      await c.env.DB.prepare(
        `UPDATE cgm_election_ballots SET candidate_id = ?, updated_at = CURRENT_TIMESTAMP
         WHERE election_id = ? AND (voter_pseudonym = ? OR voter_student_id = ?)`
      ).bind(candidateId, electionId, pseudonym, pseudonym ? null : student.id).run();
      await c.env.DB.prepare(
        `UPDATE cgm_election_participation SET last_vote_at = CURRENT_TIMESTAMP, change_count = change_count + 1 WHERE id = ?`
      ).bind(Number(participation[0].id)).run();
      return c.json({ success: true, data: { message: 'Your vote was updated. Only your latest vote counts.' } });
    }

    await c.env.DB.prepare(
      `INSERT INTO cgm_election_ballots (election_id, candidate_id, voter_pseudonym, voter_student_id)
       VALUES (?, ?, ?, ?)`
    ).bind(electionId, candidateId, pseudonym, pseudonym ? null : student.id).run();
    await c.env.DB.prepare(
      `INSERT INTO cgm_election_participation (election_id, student_id) VALUES (?, ?)`
    ).bind(electionId, student.id).run();

    await auditCgm(c.env.DB, {
      actorType: 'student', actorLabel: student.full_name, actorStudentId: student.id,
      action: 'cgm.election.vote', entityType: 'election', entityId: electionId,
      activityId: Number(election.activity_id), classId: Number(election.class_id) || null,
      context: { anonymous: String(election.anonymity) === 'anonymous' },
    });
    return c.json({ success: true, data: { message: 'Your vote was recorded.' } });
  });

  // -------------------------------------------------------------------------
  // Move requests, attendance, calendar, notifications, profile
  // -------------------------------------------------------------------------
  app.post('/api/cgm/student/groups/:id/request-move', async (c: any) => {
    const student = await requireStudent(c);
    if (!student) return c.json({ success: false, error: 'Student session required' }, 401);
    const groupId = Number(c.req.param('id'));
    const body = await readBody(c);
    const toGroupId = Number(body.toGroupId);
    const reason = cleanOrNull(body.reason, 500);
    if (!toGroupId) return bad(c, 'Choose the group you want to move to.');

    const mine = await asRows<any>(c.env.DB.prepare(
      `SELECT ga.*, a.status AS activity_status FROM cgm_group_assignments ga
       JOIN cgm_activities a ON a.id = ga.activity_id
       WHERE ga.group_id = ? AND ga.student_id = ? AND ga.status = 'active'`
    ).bind(groupId, student.id));
    if (!mine[0]) return bad(c, 'You are not a member of this group.', 403);
    if (!['open', 'published', 'active'].includes(mine[0].activity_status)) return bad(c, 'This activity no longer accepts group changes.', 409);
    const destination = await asRows<any>(c.env.DB.prepare(
      `SELECT g.id, g.capacity, g.activity_id,
              (SELECT COUNT(*) FROM cgm_group_assignments ga WHERE ga.group_id = g.id AND ga.status = 'active') AS size
       FROM cgm_groups g WHERE g.id = ? AND g.activity_id = ?`
    ).bind(toGroupId, Number(mine[0].activity_id)));
    if (!destination[0]) return bad(c, 'That group is not part of this activity.', 400);
    if (Number(destination[0].id) === groupId) return bad(c, 'You are already in that group.', 400);
    if (destination[0].capacity !== null && Number(destination[0].size) >= Number(destination[0].capacity)) {
      return bad(c, 'That group is full.', 409);
    }
    const pending = await asRows<{ id: number }>(c.env.DB.prepare(
      `SELECT id FROM cgm_group_change_requests WHERE activity_id = ? AND student_id = ? AND status = 'pending'`
    ).bind(Number(mine[0].activity_id), student.id));
    if (pending[0]) return bad(c, 'You already have a pending group change request.', 409);

    await c.env.DB.prepare(
      `INSERT INTO cgm_group_change_requests (activity_id, student_id, from_group_id, to_group_id, reason)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(Number(mine[0].activity_id), student.id, groupId, toGroupId, reason).run();
    await auditCgm(c.env.DB, {
      actorType: 'student', actorLabel: student.full_name, actorStudentId: student.id,
      action: 'cgm.group_move.requested', entityType: 'activity', entityId: Number(mine[0].activity_id),
      activityId: Number(mine[0].activity_id), context: { from: groupId, to: toGroupId },
    });
    return c.json({ success: true, data: { message: 'Your group change request was sent to your organizer.' } });
  });

  app.get('/api/cgm/student/attendance', async (c: any) => {
    const student = await requireStudent(c);
    if (!student) return c.json({ success: false, error: 'Student session required' }, 401);
    const rows = await asRows<any>(c.env.DB.prepare(
      `SELECT r.id, r.status, r.note, r.recorded_at, r.corrected_at, sess.title, sess.session_date,
              a.name AS activity_name, cl.name AS class_name
       FROM cgm_attendance_records r
       JOIN cgm_attendance_sessions sess ON sess.id = r.session_id
       JOIN cgm_activities a ON a.id = sess.activity_id
       JOIN cgm_classes cl ON cl.id = a.class_id
       WHERE r.student_id = ? ORDER BY sess.session_date DESC, r.id DESC LIMIT 200`
    ).bind(student.id));
    return c.json({ success: true, data: rows });
  });

  app.get('/api/cgm/student/calendar', async (c: any) => {
    const student = await requireStudent(c);
    if (!student) return c.json({ success: false, error: 'Student session required' }, 401);
    const events: any[] = [];
    const classes = await asRows<any>(c.env.DB.prepare(
      `SELECT cl.id, cl.name FROM cgm_class_members m JOIN cgm_classes cl ON cl.id = m.class_id
       WHERE m.student_id = ? AND m.status = 'active'`
    ).bind(student.id));
    const classIds = classes.map((row) => Number(row.id));
    if (!classIds.length) return c.json({ success: true, data: [] });

    const activities = await asRows<any>(c.env.DB.prepare(
      `SELECT a.id, a.name, a.status, a.config_json, a.opened_at, a.published_at, a.completed_at, a.class_id
       FROM cgm_activities a WHERE a.class_id IN (${classIds.map(() => '?').join(',')})
         AND a.status IN ('open','published','active','completed')`
    ).bind(...classIds));
    for (const activity of activities) {
      const config = sanitizeActivityConfig(JSON.parse(activity.config_json || '{}'));
      const base = { classId: Number(activity.class_id), type: 'activity', activityId: Number(activity.id) };
      if (activity.opened_at) events.push({ ...base, kind: 'activity_open', title: `${activity.name} opened`, at: activity.opened_at });
      if (config.assignmentDeadline) events.push({ ...base, kind: 'deadline', title: `${activity.name} assignment deadline`, at: config.assignmentDeadline });
      if (config.selfDeadline) events.push({ ...base, kind: 'self_deadline', title: `${activity.name} self-assignment deadline`, at: config.selfDeadline });
      const activityConfig = (() => { try { return JSON.parse(activity.config_json || '{}'); } catch { return {}; } })();
      if (activityConfig.selfDeadline) events.push({ ...base, kind: 'deadline', title: `${activity.name} — self-assignment deadline`, at: activityConfig.selfDeadline });
    }
    const elections = await asRows<any>(c.env.DB.prepare(
      `SELECT e.id, e.title, e.voting_open_at, e.voting_close_at, e.activity_id, a.class_id
       FROM cgm_elections e JOIN cgm_activities a ON a.id = e.activity_id
       WHERE a.class_id IN (${classIds.map(() => '?').join(',')}) AND e.status IN ('nominating','voting')`
    ).bind(...classIds));
    for (const election of elections) {
      const base = { classId: Number(election.class_id), type: 'election', activityId: Number(election.activity_id), electionId: Number(election.id) };
      if (election.voting_open_at) events.push({ ...base, kind: 'election_open', title: `Voting opens — ${election.title}`, at: election.voting_open_at });
      if (election.voting_close_at) events.push({ ...base, kind: 'election_close', title: `Voting closes — ${election.title}`, at: election.voting_close_at });
    }
    const sessions = await asRows<any>(c.env.DB.prepare(
      `SELECT sess.id, sess.title, sess.session_date, sess.activity_id, a.class_id
       FROM cgm_attendance_sessions sess JOIN cgm_activities a ON a.id = sess.activity_id
       WHERE a.class_id IN (${classIds.map(() => '?').join(',')}) AND sess.status = 'open'`
    ).bind(...classIds));
    for (const session of sessions) {
      events.push({
        classId: Number(session.class_id), type: 'attendance', activityId: Number(session.activity_id),
        attendanceSessionId: Number(session.id), kind: 'attendance_session',
        title: `Attendance — ${session.title}`, at: `${session.session_date} 00:00:00`,
      });
    }
    events.sort((a, b) => String(a.at).localeCompare(String(b.at)));
    return c.json({ success: true, data: events });
  });

  app.get('/api/cgm/student/notifications', async (c: any) => {
    const student = await requireStudent(c);
    if (!student) return c.json({ success: false, error: 'Student session required' }, 401);
    const rows = await asRows<any>(c.env.DB.prepare(
      `SELECT id, category, title, body, link, read_at, created_at FROM cgm_student_notifications
       WHERE student_id = ? ORDER BY id DESC LIMIT 100`
    ).bind(student.id));
    return c.json({ success: true, data: rows });
  });

  app.post('/api/cgm/student/notifications/read', async (c: any) => {
    const student = await requireStudent(c);
    if (!student) return c.json({ success: false, error: 'Student session required' }, 401);
    const body = await readBody(c);
    if (body.all) {
      await c.env.DB.prepare(
        'UPDATE cgm_student_notifications SET read_at = CURRENT_TIMESTAMP WHERE student_id = ? AND read_at IS NULL'
      ).bind(student.id).run();
    } else {
      const ids = (Array.isArray(body.ids) ? body.ids : []).map((value: any) => Number(value)).filter((value: number) => Number.isInteger(value) && value > 0).slice(0, 100);
      if (ids.length) {
        await c.env.DB.prepare(
          `UPDATE cgm_student_notifications SET read_at = CURRENT_TIMESTAMP WHERE student_id = ? AND id IN (${ids.map(() => '?').join(',')})`
        ).bind(student.id, ...ids).run();
      }
    }
    return c.json({ success: true });
  });

  // -------------------------------------------------------------------------
  // §31 — Per-category notification preferences (security categories pinned)
  // -------------------------------------------------------------------------
  app.get('/api/cgm/student/notification-prefs', async (c: any) => {
    const student = await requireStudent(c);
    if (!student) return c.json({ success: false, error: 'Student session required' }, 401);
    const rows = await asRows<{ category: string; muted: number }>(c.env.DB.prepare(
      'SELECT category, muted FROM cgm_notification_prefs WHERE student_id = ?'
    ).bind(student.id));
    const muted = new Map(rows.map((row) => [row.category, Number(row.muted) === 1]));
    return c.json({
      success: true,
      data: {
        // Everyday categories can be muted; the critical set is decided here,
        // on the server, and is never accepted from the client.
        mutable: MUTABLE_NOTIFICATION_CATEGORIES,
        critical: ['security', 'registration'],
        prefs: MUTABLE_NOTIFICATION_CATEGORIES.map((category) => ({ category, muted: Boolean(muted.get(category)) })),
      },
    });
  });

  app.put('/api/cgm/student/notification-prefs', async (c: any) => {
    const student = await requireStudent(c);
    if (!student) return c.json({ success: false, error: 'Student session required' }, 401);
    const body = await readBody(c);
    const updates = (Array.isArray(body.prefs) ? body.prefs : [body]).map((entry: any) => ({
      category: String(entry?.category || ''),
      muted: entry?.muted === true || entry?.muted === 1,
    })).filter((entry: { category: string }) => (MUTABLE_NOTIFICATION_CATEGORIES as readonly string[]).includes(entry.category));
    if (!updates.length) return bad(c, 'That category cannot be changed.');
    for (const entry of updates) {
      await c.env.DB.prepare(
        `INSERT INTO cgm_notification_prefs (student_id, category, muted, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(student_id, category) DO UPDATE SET muted = excluded.muted, updated_at = CURRENT_TIMESTAMP`
      ).bind(student.id, entry.category, entry.muted ? 1 : 0).run();
      await auditCgm(c.env.DB, {
        actorType: 'student', actorLabel: student.full_name, actorStudentId: student.id,
        action: 'cgm.notification.pref', entityType: 'student', entityId: student.id,
        context: { category: entry.category, muted: entry.muted },
      });
    }
    return c.json({ success: true, data: { updated: updates.length } });
  });

  // -------------------------------------------------------------------------
  // §16 — A student downloads their OWN permitted records (CSV)
  // -------------------------------------------------------------------------
  app.get('/api/cgm/student/records/export', async (c: any) => {
    const student = await requireStudent(c);
    if (!student) return c.json({ success: false, error: 'Student session required' }, 401);
    const attendance = await asRows<any>(c.env.DB.prepare(
      `SELECT a.name AS activity, sess.title AS session, sess.session_date, r.status,
              r.original_status, r.correction_reason
       FROM cgm_attendance_records r
       JOIN cgm_attendance_sessions sess ON sess.id = r.session_id
       JOIN cgm_activities a ON a.id = sess.activity_id
       WHERE r.student_id = ? ORDER BY sess.session_date DESC LIMIT 1000`
    ).bind(student.id));
    const assignments = await asRows<any>(c.env.DB.prepare(
      `SELECT a.name AS activity, g.name AS group_name, ga.status, ga.assigned_at, ga.removed_at
       FROM cgm_group_assignments ga
       JOIN cgm_activities a ON a.id = ga.activity_id
       JOIN cgm_groups g ON g.id = ga.group_id
       WHERE ga.student_id = ? ORDER BY ga.id DESC LIMIT 1000`
    ).bind(student.id));
    const leadership = await asRows<any>(c.env.DB.prepare(
      `SELECT a.name AS activity, g.name AS group_name, l.role, l.status, l.method, l.started_at, l.ended_at, l.end_reason
       FROM cgm_leadership_appointments l
       JOIN cgm_activities a ON a.id = l.activity_id
       JOIN cgm_groups g ON g.id = l.group_id
       WHERE l.student_id = ? ORDER BY l.id DESC LIMIT 1000`
    ).bind(student.id));
    await auditCgm(c.env.DB, {
      actorType: 'student', actorLabel: student.full_name, actorStudentId: student.id,
      action: 'cgm.student.records_export', entityType: 'student', entityId: student.id,
    });
    const esc = (value: unknown) => {
      const text = value === null || value === undefined ? '' : String(value);
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const block = (title: string, header: string[], rows: unknown[][]) =>
      rows.length ? [title, header.join(','), ...rows.map((row) => row.map(esc).join(',')), ''].join('\n') : `${title}\n(no records)\n`;
    const csv = [
      `Code Rx Society — my records (${student.full_name})`,
      `exported,,`,
      '',
      block('ATTENDANCE', ['activity', 'session', 'date', 'status', 'original_status', 'correction_reason'],
        attendance.map((row) => [row.activity, row.session, row.session_date, row.status, row.original_status, row.correction_reason])),
      block('GROUPS', ['activity', 'group', 'status', 'assigned_at', 'released_at'],
        assignments.map((row) => [row.activity, row.group_name, row.status, row.assigned_at, row.removed_at])),
      block('LEADERSHIP', ['activity', 'group', 'role', 'status', 'method', 'started_at', 'ended_at', 'end_reason'],
        leadership.map((row) => [row.activity, row.group_name, row.role, row.status, row.method, row.started_at, row.ended_at, row.end_reason])),
    ].join('\n');
    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="code-rx-my-records.csv"`,
      },
    });
  });

  // -------------------------------------------------------------------------
  // Profile change requests (approval required before anything official)
  // -------------------------------------------------------------------------
  app.post('/api/cgm/student/profile/change', async (c: any) => {
    const student = await requireStudent(c);
    if (!student) return c.json({ success: false, error: 'Student session required' }, 401);
    if (!throttle(c, 10, 3600)) return bad(c, 'Too many change requests. Try again later.', 429);
    const body = await readBody(c);
    const field = String(body.field || '');
    if (!STUDENT_PROFILE_FIELDS.includes(field as any)) return bad(c, 'That field cannot be changed.', 400);
    if (field === 'index_number') return bad(c, 'Index numbers can only be corrected through your organizer.', 400);
    const newValue = clean(body.newValue, 200);
    const reason = cleanOrNull(body.reason, 500);
    if (!newValue) return bad(c, 'Enter the new value.');

    if (field === 'gender' && !['male', 'female', 'unknown'].includes(newValue)) return bad(c, 'Choose male, female or unknown.');
    if (field === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(newValue)) return bad(c, 'Enter a valid email address.');
    if (field === 'phone' && !/^\+?[\d\s()-]{7,20}$/.test(newValue)) return bad(c, 'Enter a valid telephone number.');

    const current = (student as any)[field];
    if (field === 'university_id' || field === 'email' || field === 'phone') {
      if ((current || '') === newValue) return bad(c, 'That is already your current value.');
    } else if (current === newValue) {
      return bad(c, 'That is already your current value.');
    }

    const pending = await asRows<{ id: number }>(c.env.DB.prepare(
      `SELECT id FROM cgm_profile_change_requests WHERE student_id = ? AND field = ? AND status = 'pending'`
    ).bind(student.id, field));
    if (pending[0]) return bad(c, 'You already have a pending change request for this field.', 409);

    await c.env.DB.prepare(
      `INSERT INTO cgm_profile_change_requests (student_id, field, old_value, new_value, reason)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(student.id, field, current === null || current === undefined ? null : String(current), newValue, reason).run();
    await auditCgm(c.env.DB, {
      actorType: 'student', actorLabel: student.full_name, actorStudentId: student.id,
      action: 'cgm.profile_change.requested', entityType: 'student', entityId: student.id,
      context: { field },
    });
    return c.json({ success: true, data: { message: 'Your change request was submitted for review.' } });
  });

  // -------------------------------------------------------------------------
  // Passkey change (only when a class allows it) + reset by organizer
  // -------------------------------------------------------------------------
  app.post('/api/cgm/student/passkey/change', async (c: any) => {
    const student = await requireStudent(c);
    if (!student) return c.json({ success: false, error: 'Student session required' }, 401);
    if (!throttle(c, 5, 3600)) return bad(c, 'Too many attempts. Try again later.', 429);
    const body = await readBody(c);
    const currentPasskey = clean(body.currentPasskey, 40);
    const newPasskey = clean(body.newPasskey, 40);
    if (sequenceForPasskey(newPasskey) === null) return bad(c, 'Passkeys look like rx30a, rx30b, rx30aa — your replacement must follow the same format.', 400);

    // Allowed only when at least one active class enables self-service change.
    const allowed = await asRows<{ c: number }>(c.env.DB.prepare(
      `SELECT COUNT(*) AS c FROM cgm_class_members m
       JOIN cgm_classes cl ON cl.id = m.class_id
       WHERE m.student_id = ? AND m.status = 'active' AND cl.status = 'active'
         AND cl.settings_json LIKE '%"allowStudentPasskeyChange":true%'`
    ).bind(student.id));
    if (!Number(allowed[0]?.c || 0)) {
      return bad(c, 'Self-service passkey changes are not enabled for your classes. Ask your organizer for a reset.', 403);
    }
    if (!student.passkey_verifier || !await verifyPassword(currentPasskey, student.passkey_verifier)) {
      return bad(c, 'Your current passkey did not match.', 400);
    }
    await c.env.DB.prepare(
      `UPDATE cgm_students SET passkey_verifier = ?, passkey_reset_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(await hashPassword(newPasskey), student.id).run();
    await revokeStudentSessions(c.env.DB, student.id);
    const session = await createStudentSession(c.env.DB, student.id, {
      ip: c.req.header('cf-connecting-ip'), userAgent: c.req.header('user-agent'),
    });
    await auditCgm(c.env.DB, {
      actorType: 'student', actorLabel: student.full_name, actorStudentId: student.id,
      action: 'cgm.passkey.self_change', entityType: 'student', entityId: student.id,
    });
    await notifyStudent(c.env.DB, student.id, 'security', 'Your passkey was changed',
      'Your sign-in passkey was changed successfully. If this was not you, contact your organizer immediately.');
    return c.json({ success: true, data: { session, message: 'Passkey changed. Keep it safe — it is shown only now.' } });
  });

  // -------------------------------------------------------------------------
  // Invitations: landing, join, claim
  // -------------------------------------------------------------------------
  app.get('/api/cgm/invitations/:code', async (c: any) => {
    const dark = await requireModuleEnabled(c);
    if (dark) return dark;
    const code = clean(c.req.param('code'), 40);
    const rows = await asRows<any>(c.env.DB.prepare(
      `SELECT i.kind, i.code, i.expires_at, i.max_uses, i.use_count, i.revoked_at, i.disabled_at,
              cl.id AS class_id, cl.name, cl.code AS class_code, cl.institution, cl.department,
              cl.academic_year, cl.level, cl.status AS class_status
       FROM cgm_invitations i JOIN cgm_classes cl ON cl.id = i.class_id
       WHERE i.code = ? AND i.kind = 'general'`
    ).bind(code));
    const invitation = rows[0];
    if (!invitation || invitation.revoked_at || invitation.disabled_at) {
      return bad(c, 'This invitation is no longer available.', 404);
    }
    if (invitation.expires_at && new Date(String(invitation.expires_at).replace(' ', 'T')).getTime() < Date.now()) {
      return bad(c, 'This invitation has expired.', 410);
    }
    if (invitation.max_uses !== null && Number(invitation.use_count) >= Number(invitation.max_uses)) {
      return bad(c, 'This invitation has reached its usage limit.', 410);
    }
    if (invitation.class_status !== 'active') return bad(c, 'This class is not accepting invitations yet.', 409);
    return c.json({
      success: true,
      data: {
        invitation: {
          kind: invitation.kind, code: invitation.code, expiresAt: invitation.expires_at,
          remainingUses: invitation.max_uses === null ? null : Math.max(0, Number(invitation.max_uses) - Number(invitation.use_count)),
        },
        class: {
          id: Number(invitation.class_id), name: invitation.name, code: invitation.class_code,
          institution: invitation.institution, department: invitation.department,
          academicYear: invitation.academic_year, level: invitation.level,
        },
      },
    });
  });

  const membershipFromInvitation = async (c: any, code: string) => {
    const student = await requireStudent(c);
    if (!student) return { status: 401 as const, response: c.json({ success: false, error: 'Sign in first to use this invitation.' }, 401) };
    // A general invitation is claimed by its public code; an individual one is
    // claimed by the raw token that was shown exactly once at creation.
    const tokenHash = await sha256Hex(`cgm-invite:${code}`);
    const rows = await asRows<any>(c.env.DB.prepare(
      `SELECT i.*, cl.status AS class_status, cl.settings_json FROM cgm_invitations i
       JOIN cgm_classes cl ON cl.id = i.class_id WHERE i.code = ? OR i.token_hash = ?`
    ).bind(code, tokenHash));
    const invitation = rows[0];
    if (!invitation || invitation.revoked_at || invitation.disabled_at) {
      return { status: 404 as const, response: bad(c, 'This invitation is no longer available.', 404) };
    }
    if (invitation.class_status !== 'active') return { status: 409 as const, response: bad(c, 'This class is not accepting invitations yet.', 409) };
    if (invitation.expires_at && new Date(String(invitation.expires_at).replace(' ', 'T')).getTime() < Date.now()) {
      return { status: 410 as const, response: bad(c, 'This invitation has expired.', 410) };
    }
    if (invitation.max_uses !== null && Number(invitation.use_count) >= Number(invitation.max_uses)) {
      return { status: 410 as const, response: bad(c, 'This invitation has reached its usage limit.', 410) };
    }
    // An individual invitation is single-use by definition.
    if (invitation.kind === 'individual' && Number(invitation.use_count) >= 1) {
      return { status: 410 as const, response: bad(c, 'This invitation has already been used.', 410) };
    }

    if (invitation.kind === 'individual') {
      // Identity-bound: another student can never claim it.
      const boundStudent = invitation.bound_student_id ? Number(invitation.bound_student_id) : null;
      const boundKey = invitation.bound_identifier_key ? String(invitation.bound_identifier_key) : null;
      const matches = boundStudent === student.id
        || (boundKey && [student.index_number_key, student.university_id_key, student.phone_key].includes(boundKey));
      if (!matches) return { status: 403 as const, response: bad(c, 'This invitation was issued to a different student.', 403) };
      // Roster-bound invitations carry the registration with them.
      if (invitation.bound_roster_entry_id) {
        const entry = await asRows<{ id: number; class_id: number; student_id: number | null }>(c.env.DB.prepare(
          'SELECT id, class_id, student_id FROM cgm_roster_entries WHERE id = ?'
        ).bind(Number(invitation.bound_roster_entry_id)));
        if (entry[0]) {
          const pendingReq = await asRows<{ id: number }>(c.env.DB.prepare(
            `SELECT id FROM cgm_registration_requests WHERE roster_entry_id = ? AND status = 'pending'`
          ).bind(entry[0].id));
          if (!pendingReq[0] && !entry[0].student_id) {
            await c.env.DB.prepare(
              `INSERT INTO cgm_registration_requests (class_id, roster_entry_id, student_id, identifier_hint)
               VALUES (?, ?, ?, ?)`
            ).bind(Number(entry[0].class_id), Number(entry[0].id), student.id, `${student.index_number.slice(0, 3)}…`).run();
          }
          await c.env.DB.prepare(
            'UPDATE cgm_invitations SET use_count = use_count + 1, last_used_at = CURRENT_TIMESTAMP WHERE id = ?'
          ).bind(Number(invitation.id)).run();
          return {
            status: 200 as const,
            response: c.json({ success: true, data: { message: 'Your registration was submitted through your personal invitation and awaits approval.' } }),
          };
        }
      }
    }

    const classId = Number(invitation.class_id);
    const settings = (() => { try { return JSON.parse(invitation.settings_json || '{}'); } catch { return {}; } })();
    const existingMember = await asRows<{ id: number }>(c.env.DB.prepare(
      'SELECT id FROM cgm_class_members WHERE class_id = ? AND student_id = ?'
    ).bind(classId, student.id));
    if (existingMember[0]) return { status: 200 as const, response: c.json({ success: true, data: { message: 'You are already a member of this class.' } }) };

    if (settings.membershipApprovalRequired !== false) {
      const pending = await asRows<{ id: number }>(c.env.DB.prepare(
        `SELECT id FROM cgm_membership_requests WHERE class_id = ? AND student_id = ? AND status = 'pending'`
      ).bind(classId, student.id));
      if (pending[0]) return { status: 200 as const, response: c.json({ success: true, data: { message: 'Your membership request is already awaiting review.' } }) };
      await c.env.DB.prepare(
        `INSERT INTO cgm_membership_requests (class_id, student_id, invitation_id) VALUES (?, ?, ?)`
      ).bind(classId, student.id, Number(invitation.id)).run();
      await c.env.DB.prepare(
        'UPDATE cgm_invitations SET use_count = use_count + 1, last_used_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).bind(Number(invitation.id)).run();
      await auditCgm(c.env.DB, {
        actorType: 'student', actorLabel: student.full_name, actorStudentId: student.id,
        action: 'cgm.membership.requested', entityType: 'class', entityId: classId, classId,
      });
      return { status: 200 as const, response: c.json({ success: true, data: { message: 'Your membership request was sent for approval.' } }) };
    }

    // Approval-free join (organizer configured it that way).
    await c.env.DB.prepare(
      `INSERT OR IGNORE INTO cgm_class_members (class_id, student_id, added_via, added_by_label) VALUES (?, ?, 'invitation', ?)`
    ).bind(classId, student.id, `Invitation ${invitation.code || ''}`.trim()).run();
    await c.env.DB.prepare(
      'UPDATE cgm_invitations SET use_count = use_count + 1, last_used_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(Number(invitation.id)).run();
    await auditCgm(c.env.DB, {
      actorType: 'student', actorLabel: student.full_name, actorStudentId: student.id,
      action: 'cgm.membership.joined', entityType: 'class', entityId: classId, classId,
    });
    return { status: 200 as const, response: c.json({ success: true, data: { message: 'Welcome — you have joined the class.' } }) };
  };

  app.post('/api/cgm/student/join', async (c: any) => {
    if (!throttle(c, 20, 600)) return bad(c, 'Too many attempts. Try again later.', 429);
    const body = await readBody(c);
    const code = clean(body.code, 40);
    if (!code) return bad(c, 'Enter an invitation code.');
    const result = await membershipFromInvitation(c, code);
    return result.response;
  });

  app.post('/api/cgm/student/invitations/:code/claim', async (c: any) => {
    if (!throttle(c, 20, 600)) return bad(c, 'Too many attempts. Try again later.', 429);
    // The raw invitation token is 64 hex characters — keep it whole.
    const result = await membershipFromInvitation(c, clean(c.req.param('code'), 80));
    return result.response;
  });

  // -------------------------------------------------------------------------
  // Reporting an announcement (moderation starts with the class organizer)
  // -------------------------------------------------------------------------
  app.post('/api/cgm/announcements/:id/report', async (c: any) => {
    const student = await requireStudent(c);
    if (!student) return c.json({ success: false, error: 'Student session required' }, 401);
    if (!throttle(c, 10, 3600)) return bad(c, 'Too many reports. Try again later.', 429);
    const announcementId = Number(c.req.param('id'));
    const body = await readBody(c);
    const reason = cleanOrNull(body.reason, 400);
    if (!reason) return bad(c, 'Tell the organizer what is wrong with this announcement.', 400);
    const rows = await asRows<any>(c.env.DB.prepare(
      `SELECT a.id, a.class_id FROM cgm_announcements a
       WHERE a.id = ? AND a.status IN ('published','pending')
         AND EXISTS (SELECT 1 FROM cgm_class_members cm WHERE cm.class_id = a.class_id AND cm.student_id = ? AND cm.status = 'active')`
    ).bind(announcementId, student.id));
    if (!rows[0]) return bad(c, 'Announcement not found in your classes.', 404);
    const open = await asRows<{ id: number }>(c.env.DB.prepare(
      `SELECT id FROM cgm_announcement_reports WHERE announcement_id = ? AND reporter_student_id = ? AND status = 'open'`
    ).bind(announcementId, student.id));
    if (open[0]) return bad(c, 'You already reported this announcement.', 409);
    await c.env.DB.prepare(
      'INSERT INTO cgm_announcement_reports (announcement_id, reporter_student_id, reason) VALUES (?, ?, ?)'
    ).bind(announcementId, student.id, reason).run();
    await auditCgm(c.env.DB, {
      actorType: 'student', actorLabel: student.full_name, actorStudentId: student.id,
      action: 'cgm.announcement.reported', entityType: 'announcement', entityId: announcementId,
      classId: Number(rows[0].class_id), context: { reason },
    });
    return c.json({ success: true, message: 'Thank you — the organizers will review this announcement.' });
  });

  // -------------------------------------------------------------------------
  // WhatsApp click tracking (members of the group only; never proof of joining)
  // -------------------------------------------------------------------------
  app.post('/api/cgm/whatsapp/:linkId/click', async (c: any) => {
    const student = await requireStudent(c);
    if (!student) return c.json({ success: false, error: 'Student session required' }, 401);
    const linkId = Number(c.req.param('linkId'));
    const rows = await asRows<any>(c.env.DB.prepare(
      `SELECT w.id, w.url, w.group_id, w.status FROM cgm_whatsapp_links w WHERE w.id = ?`
    ).bind(linkId));
    const link = rows[0];
    if (!link || link.status !== 'active') return bad(c, 'This WhatsApp link is not available.', 404);
    const membership = await asRows<{ id: number }>(c.env.DB.prepare(
      `SELECT ga.id FROM cgm_group_assignments ga WHERE ga.group_id = ? AND ga.student_id = ? AND ga.status = 'active'`
    ).bind(Number(link.group_id), student.id));
    if (!membership[0]) return bad(c, 'Only members of this group can open its WhatsApp link.', 403);
    await c.env.DB.prepare(
      'INSERT INTO cgm_whatsapp_clicks (link_id, student_id) VALUES (?, ?)'
    ).bind(linkId, student.id).run();
    await c.env.DB.prepare(
      'UPDATE cgm_whatsapp_links SET click_count = click_count + 1 WHERE id = ?'
    ).bind(linkId).run();
    return c.json({ success: true, data: { url: link.url } });
  });

};
