/**
 * CODE Rx SOCIETY — CGM organizer surface.
 *
 *   POST /api/cgm/organizer/apply                 organizer application
 *   GET  /api/cgm/organizer/verify?token=         email verification (public)
 *   GET  /api/cgm/organizer/status                my application state
 *   GET  /api/cgm/organizer/classes               classes I organize
 *   POST /api/cgm/classes                         create draft
 *   GET  /api/cgm/classes/:id                     organizer dashboard bundle
 *   PATCH /api/cgm/classes/:id                    update (sensitive → re-approval)
 *   POST /api/cgm/classes/:id/submit              submit to PHANTOM
 *   POST /api/cgm/classes/:id/entry-password      rotate the shared entry password
 *   POST /api/cgm/classes/:id/team                add co-organizer / assistant
 *   PATCH /api/cgm/classes/:id/team/:organizerId  change permissions, revoke
 *   POST /api/cgm/classes/:id/transfer            propose ownership transfer
 *   POST /api/cgm/classes/:id/transfer/accept     successor accepts
 *   POST /api/cgm/classes/:id/settings            class settings
 *   POST /api/cgm/classes/:id/login-format/*      propose → notify → activate
 *   GET/POST/PATCH/DELETE /api/cgm/classes/:id/roster*   roster management + import
 *   GET  /api/cgm/classes/:id/registrations       registration queue + approve/reject
 *   GET  /api/cgm/classes/:id/members             membership management
 *   GET  /api/cgm/classes/:id/membership-requests + approve/reject
 *   GET  /api/cgm/classes/:id/profile-changes     + approve/reject
 *   GET/POST /api/cgm/classes/:id/invitations     + revoke/regenerate/disable
 *
 * Every handler re-checks the caller's per-class permissions from the database.
 */

import type { Hono } from 'hono';
import { randomToken, sha256Hex, audit as memberAudit } from '../vault';
import { cleanEmail } from '../validate';
import { createNotification } from '../notifications';
import { recordPhantomInboxItem } from '../phantom-inbox';
import {
  allocateClassCode,
  CO_ORGANIZER_DEFAULT_PERMISSIONS,
  lookupKey,
  passkeyForSequence,
  phoneKey,
  phoneDisplay,
  sanitizeClassPermissions,
  sanitizeClassSettings,
  sanitizeLoginFormat,
  CLASS_PERMISSIONS,
  type ClassPermission,
} from './core';
import {
  applyMapping,
  normalizeGender,
  parseCsv,
  parseJsonRows,
  parseXlsxRows,
  ROSTER_FIELDS,
  suggestMapping,
  type RosterField,
} from './parse';
import { hashPassword } from '../auth';
import { allocateStudentPasskey } from './core';
import {
  asRows,
  auditCgm,
  bad,
  clean,
  cleanOrNull,
  entryPasswordVerifier,
  memberFromRequest,
  notifyStudent,
  organizerContextFor,
  readBody,
  readClassSettings,
  requireClassPermission,
  requireModuleEnabled,
  revokeStudentSessions,
  throttle,
  writeClassSettings,
} from './service';

type CgmApp = Hono<any>;

const SENSITIVE_CLASS_FIELDS = ['name', 'institution', 'academic_year', 'level'] as const;

export const registerCgmOrganizerRoutes = (app: CgmApp) => {

  // -------------------------------------------------------------------------
  // Organizer applications
  // -------------------------------------------------------------------------
  app.post('/api/cgm/organizer/apply', async (c: any) => {
    const dark = await requireModuleEnabled(c);
    if (dark) return dark;
    if (!throttle(c, 5, 3600)) return bad(c, 'Too many applications. Try again later.', 429);
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in as a Society member first.' }, 401);
    if (!member.profileId || member.memberStatus !== 'active') return bad(c, 'Only active Society members can apply to organize classes.', 403);
    const body = await readBody(c);
    const institution = cleanOrNull(body.institution, 160);
    const motivation = cleanOrNull(body.motivation, 2000);
    if (!institution) return bad(c, 'Tell us the institution you organize for.');

    const existing = await asRows<any>(c.env.DB.prepare(
      `SELECT id, status FROM cgm_organizer_applications WHERE user_id = ? ORDER BY id DESC LIMIT 1`
    ).bind(member.userId));
    const current = existing[0];
    if (current && ['pending', 'email_verified'].includes(String(current.status))) {
      return bad(c, 'Your application is already awaiting review.', 409);
    }

    const token = randomToken();
    await c.env.DB.prepare(
      `INSERT INTO cgm_organizer_applications
       (user_id, member_profile_id, name, email, institution, motivation, status, verification_token_hash)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`
    ).bind(member.userId, member.profileId, member.name, member.email, institution, motivation,
      await sha256Hex(`cgm-organizer-verify:${token}`)).run();

    await memberAudit(c.env.DB, null, 'cgm.organizer.applied', 'cgm_organizer_application', member.userId, { institution });
    await recordPhantomInboxItem(c.env.DB, {
      channel: 'class_groups',
      title: 'Organizer application',
      summary: `${member.name} applied to organize classes at ${institution}.`,
      source: 'cgm_organizer_application',
      sourceId: String(member.userId),
      actorProfileId: member.profileId,
      actorLabel: member.name,
      link: '#classes',
      body: motivation || '',
    });
    return c.json({
      success: true,
      data: {
        message: 'Application received. Verify your email, then PHANTOM will review it.',
        verifyToken: token,
      },
    });
  });

  app.get('/api/cgm/organizer/verify', async (c: any) => {
    const token = clean(c.req.query('token'), 120);
    if (!token) return bad(c, 'Verification link is invalid.');
    const hash = await sha256Hex(`cgm-organizer-verify:${token}`);
    const rows = await asRows<{ id: number; status: string }>(c.env.DB.prepare(
      'SELECT id, status FROM cgm_organizer_applications WHERE verification_token_hash = ?'
    ).bind(hash));
    const application = rows[0];
    if (!application) return bad(c, 'Verification link is invalid or already used.', 404);
    if (['approved', 'rejected', 'suspended', 'revoked'].includes(application.status)) {
      return c.json({ success: true, data: { message: 'This application has already been concluded.' } });
    }
    await c.env.DB.prepare(
      `UPDATE cgm_organizer_applications SET status = 'email_verified', email_verified_at = CURRENT_TIMESTAMP,
       verification_token_hash = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(Number(application.id)).run();
    return c.json({ success: true, data: { message: 'Email verified. PHANTOM can now review your application.' } });
  });

  app.get('/api/cgm/organizer/status', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const rows = await asRows<any>(c.env.DB.prepare(
      `SELECT id, status, institution, review_reason, email_verified_at, created_at
       FROM cgm_organizer_applications WHERE user_id = ? ORDER BY id DESC LIMIT 1`
    ).bind(member.userId));
    const classes = member.profileId ? await asRows<any>(c.env.DB.prepare(
      `SELECT o.class_id, o.role, o.permissions_json, cl.name, cl.code, cl.status
       FROM cgm_class_organizers o JOIN cgm_classes cl ON cl.id = o.class_id
       WHERE o.member_profile_id = ? AND o.status = 'active' ORDER BY cl.name`
    ).bind(member.profileId)) : [];
    return c.json({
      success: true,
      data: {
        application: rows[0] ? {
          id: Number(rows[0].id), status: rows[0].status, institution: rows[0].institution,
          reviewReason: rows[0].review_reason, emailVerified: Boolean(rows[0].email_verified_at),
          createdAt: rows[0].created_at,
        } : null,
        classes: classes.map((row) => ({
          classId: Number(row.class_id), role: row.role,
          permissions: sanitizeClassPermissions(JSON.parse(row.permissions_json || '[]')),
          name: row.name, code: row.code, status: row.status,
        })),
      },
    });
  });

  // -------------------------------------------------------------------------
  // Classes
  // -------------------------------------------------------------------------
  app.post('/api/cgm/classes', async (c: any) => {
    const dark = await requireModuleEnabled(c);
    if (dark) return dark;
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    if (!member.profileId) return bad(c, 'Only Society members with a profile can create classes.', 403);
    const body = await readBody(c);
    const name = clean(body.name, 160);
    const institution = cleanOrNull(body.institution, 160);
    if (!name || !institution) return bad(c, 'Class name and institution are required.');

    // Only approved organizers create classes; PHANTOM always can.
    const approval = await asRows<{ status: string }>(c.env.DB.prepare(
      'SELECT status FROM cgm_organizer_applications WHERE user_id = ? ORDER BY id DESC LIMIT 1'
    ).bind(member.userId));
    if (!member.isPhantom && approval[0]?.status !== 'approved') {
      return bad(c, 'Your organizer application must be approved by PHANTOM first.', 403);
    }

    const code = await allocateClassCode(c.env.DB);
    const result = await c.env.DB.prepare(
      `INSERT INTO cgm_classes (code, name, institution, institution_key, department, academic_year, level, description,
                                settings_json, created_by_profile_id, created_by_label)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, '{}', ?, ?)`
    ).bind(
      code, name, institution, lookupKey(institution),
      cleanOrNull(body.department, 160), cleanOrNull(body.academicYear, 40),
      cleanOrNull(body.level, 40), cleanOrNull(body.description, 2000),
      member.profileId, member.name,
    ).run();
    const classId = Number(result.meta.last_row_id);
    await c.env.DB.prepare(
      `INSERT INTO cgm_class_organizers (class_id, member_profile_id, user_id, role, permissions_json, granted_by_profile_id, granted_by_label)
       VALUES (?, ?, ?, 'primary', '[]', ?, ?)`
    ).bind(classId, member.profileId, member.userId, member.profileId, member.name).run();
    await c.env.DB.prepare(
      `INSERT INTO cgm_class_approvals (class_id, action, actor_type, actor_label)
       VALUES (?, 'submitted', 'organizer', ?)`
    ).bind(classId, member.name).run();
    await auditCgm(c.env.DB, {
      actorType: 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
      action: 'cgm.class.created', entityType: 'class', entityId: classId, classId,
      context: { code, name },
    });
    return c.json({ success: true, data: { classId, code } });
  });

  const classCore = async (db: D1Database, classId: number) => {
    const rows = await asRows<any>(db.prepare('SELECT * FROM cgm_classes WHERE id = ?').bind(classId));
    return rows[0] || null;
  };

  app.get('/api/cgm/organizer/classes', async (c: any) => {
    const dark = await requireModuleEnabled(c);
    if (dark) return dark;
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const rows = member.profileId ? await asRows<any>(c.env.DB.prepare(
      `SELECT cl.id, cl.code, cl.name, cl.institution, cl.status, cl.created_at, o.role, o.permissions_json,
              (SELECT COUNT(*) FROM cgm_class_members m WHERE m.class_id = cl.id AND m.status = 'active') AS member_count,
              (SELECT COUNT(*) FROM cgm_activities a WHERE a.class_id = cl.id AND a.status IN ('open','published','active')) AS active_activities,
              (SELECT COUNT(*) FROM cgm_registration_requests r WHERE r.class_id = cl.id AND r.status = 'pending') AS pending_registrations,
              (SELECT COUNT(*) FROM cgm_membership_requests mr WHERE mr.class_id = cl.id AND mr.status = 'pending') AS pending_memberships
       FROM cgm_class_organizers o JOIN cgm_classes cl ON cl.id = o.class_id
       WHERE o.member_profile_id = ? AND o.status = 'active'
       ORDER BY cl.created_at DESC`
    ).bind(member.profileId)) : [];
    return c.json({
      success: true,
      data: rows.map((row) => ({
        id: Number(row.id), code: row.code, name: row.name, institution: row.institution,
        status: row.status, role: row.role, createdAt: row.created_at,
        memberCount: Number(row.member_count), activeActivities: Number(row.active_activities),
        pendingRegistrations: Number(row.pending_registrations), pendingMemberships: Number(row.pending_memberships),
        permissions: row.role === 'primary' ? [...CLASS_PERMISSIONS] : sanitizeClassPermissions(JSON.parse(row.permissions_json || '[]')),
      })),
    });
  });

  app.get('/api/cgm/classes/:id', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const classId = Number(c.req.param('id'));
    const klass = await classCore(c.env.DB, classId);
    if (!klass) return bad(c, 'Class not found.', 404);
    const context = await organizerContextFor(c.env.DB, member, classId);
    if (!member.isPhantom && !context.role) return bad(c, 'You are not an organizer of this class.', 403);
    const settings = sanitizeClassSettings(JSON.parse(klass.settings_json || '{}'));

    const counts = await asRows<any>(c.env.DB.prepare(
      `SELECT
        (SELECT COUNT(*) FROM cgm_class_members WHERE class_id = ? AND status = 'active') AS members,
        (SELECT COUNT(*) FROM cgm_roster_entries WHERE class_id = ?) AS roster,
        (SELECT COUNT(*) FROM cgm_registration_requests WHERE class_id = ? AND status = 'pending') AS registrations,
        (SELECT COUNT(*) FROM cgm_membership_requests WHERE class_id = ? AND status = 'pending') AS memberships,
        (SELECT COUNT(*) FROM cgm_profile_change_requests pcr JOIN cgm_class_members cm ON cm.student_id = pcr.student_id
           WHERE cm.class_id = ? AND cm.status = 'active' AND pcr.status = 'pending') AS profile_changes,
        (SELECT COUNT(*) FROM cgm_activities WHERE class_id = ? AND status IN ('open','published','active')) AS activities`
    ).bind(classId, classId, classId, classId, classId, classId));

    const team = await asRows<any>(c.env.DB.prepare(
      `SELECT o.id, o.role, o.permissions_json, o.status, o.created_at, COALESCE(u.name, mu.name, 'Member') AS name, u.email
       FROM cgm_class_organizers o
       LEFT JOIN member_profiles mp ON mp.id = o.member_profile_id
       LEFT JOIN users u ON COALESCE(o.user_id, mp.user_id) = u.id
       LEFT JOIN members mu ON mu.id = mp.member_record_id
       WHERE o.class_id = ? ORDER BY CASE o.role WHEN 'primary' THEN 0 WHEN 'co_organizer' THEN 1 ELSE 2 END, o.id`
    ).bind(classId));

    return c.json({
      success: true,
      data: {
        class: {
          id: classId, code: klass.code, name: klass.name, institution: klass.institution,
          department: klass.department, academicYear: klass.academic_year, level: klass.level,
          description: klass.description, status: klass.status, createdAt: klass.created_at,
          submittedAt: klass.submitted_at, reviewReason: klass.review_reason,
          entryPasswordSet: Boolean(klass.entry_password_verifier),
        },
        settings,
        counts: {
          members: Number(counts[0]?.members || 0), roster: Number(counts[0]?.roster || 0),
          registrations: Number(counts[0]?.registrations || 0), memberships: Number(counts[0]?.memberships || 0),
          profileChanges: Number(counts[0]?.profile_changes || 0), activities: Number(counts[0]?.activities || 0),
        },
        team: team.map((row) => ({
          id: Number(row.id), role: row.role, status: row.status, name: row.name || 'Member',
          email: row.email, createdAt: row.created_at,
          permissions: row.role === 'primary' ? [...CLASS_PERMISSIONS] : sanitizeClassPermissions(JSON.parse(row.permissions_json || '[]')),
        })),
        myRole: member.isPhantom ? 'phantom' : context.role,
        myPermissions: member.isPhantom ? [...CLASS_PERMISSIONS] : [...context.permissions],
      },
    });
  });

  app.patch('/api/cgm/classes/:id', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const classId = Number(c.req.param('id'));
    const guard = await requireClassPermission(c, member, classId, 'manage_class_settings');
    if (!guard.ok) return guard.response;
    if (!member.isPhantom && guard.context.role !== 'primary') return bad(c, 'Only the primary organizer can edit the class record.', 403);
    void CLASS_PERMISSIONS;
    const klass = await classCore(c.env.DB, classId);
    if (!klass) return bad(c, 'Class not found.', 404);
    const body = await readBody(c);

    const updates: string[] = [];
    const values: any[] = [];
    let touchesSensitive = false;
    for (const field of SENSITIVE_CLASS_FIELDS) {
      const key = field === 'academic_year' ? 'academicYear' : field;
      if (body[key] !== undefined) {
        const value = cleanOrNull(body[key], 160);
        updates.push(`${field} = ?`); values.push(value);
        if (String(klass[field] || '') !== String(value || '')) touchesSensitive = true;
      }
    }
    if (body.department !== undefined) { updates.push('department = ?'); values.push(cleanOrNull(body.department, 160)); }
    if (body.description !== undefined) { updates.push('description = ?'); values.push(cleanOrNull(body.description, 2000)); }
    if (!updates.length) return bad(c, 'Nothing to update.');
    if (klass.status === 'active' && touchesSensitive) {
      // Sensitive changes on a live class go back to PHANTOM.
      updates.push('status = ?', 'submitted_at = CURRENT_TIMESTAMP');
      values.push('pending');
      await c.env.DB.prepare(
        `INSERT INTO cgm_class_approvals (class_id, action, actor_type, actor_label, reason)
         VALUES (?, 'submitted', 'organizer', ?, 'Sensitive details changed; re-approval required')`
      ).bind(classId, member.name).run();
      await recordPhantomInboxItem(c.env.DB, {
        channel: 'class_groups',
        title: 'Class change needs re-approval',
        summary: `${klass.name} (${klass.code}) changed sensitive details and needs re-approval.`,
        source: 'cgm_class', sourceId: String(classId), actorProfileId: member.profileId,
        actorLabel: member.name, link: '#classes', body: '',
      });
    }
    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(classId);
    await c.env.DB.prepare(`UPDATE cgm_classes SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
    await auditCgm(c.env.DB, {
      actorType: member.isPhantom ? 'phantom' : 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
      action: 'cgm.class.updated', entityType: 'class', entityId: classId, classId,
      context: { fields: updates.filter((u) => !u.includes('updated_at') && !u.includes('status')).map((u) => u.split(' ')[0]) },
    });
    return c.json({ success: true, data: { reapprovalRequired: klass.status === 'active' && touchesSensitive } });
  });

  app.post('/api/cgm/classes/:id/submit', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const classId = Number(c.req.param('id'));
    const guard = await requireClassPermission(c, member, classId, 'manage_class_settings');
    if (!guard.ok) return guard.response;
    if (!member.isPhantom && guard.context.role !== 'primary') return bad(c, 'Only the primary organizer can submit the class.', 403);
    const klass = await classCore(c.env.DB, classId);
    if (!klass) return bad(c, 'Class not found.', 404);
    if (!['draft', 'rejected'].includes(klass.status)) return bad(c, 'Only a draft or rejected class can be submitted.', 409);
    const settings = await readClassSettings(c.env.DB, classId);
    if (!klass.entry_password_verifier) return bad(c, 'Set the class entry password before submitting — students need it to register.');
    if (!settings.customFields.length && !klass.academic_year) {
      // Non-fatal; configuration quality stays with the organizer.
    }
    await c.env.DB.prepare(
      `UPDATE cgm_classes SET status = 'pending', submitted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(classId).run();
    await c.env.DB.prepare(
      `INSERT INTO cgm_class_approvals (class_id, action, actor_type, actor_label) VALUES (?, 'submitted', 'organizer', ?)`
    ).bind(classId, member.name).run();
    await recordPhantomInboxItem(c.env.DB, {
      channel: 'class_groups',
      title: 'Class awaiting approval',
      summary: `${klass.name} (${klass.code}) was submitted for approval.`,
      source: 'cgm_class', sourceId: String(classId), actorProfileId: member.profileId,
      actorLabel: member.name, link: '#classes', body: klass.description || '',
    });
    await auditCgm(c.env.DB, {
      actorType: 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
      action: 'cgm.class.submitted', entityType: 'class', entityId: classId, classId,
    });
    return c.json({ success: true });
  });

  app.post('/api/cgm/classes/:id/entry-password', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const classId = Number(c.req.param('id'));
    const guard = await requireClassPermission(c, member, classId, 'manage_class_settings');
    if (!guard.ok) return guard.response;
    if (!member.isPhantom && guard.context.role !== 'primary') return bad(c, 'Only the primary organizer can change the entry password.', 403);
    const body = await readBody(c);
    const password = String(body.entryPassword ?? '');
    if (password.length < 6) return bad(c, 'The entry password must be at least 6 characters.');
    await c.env.DB.prepare(
      `UPDATE cgm_classes SET entry_password_verifier = ?, entry_password_set_at = CURRENT_TIMESTAMP,
       updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(await entryPasswordVerifier(password), classId).run();
    await auditCgm(c.env.DB, {
      actorType: 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
      action: 'cgm.class.entry_password_rotated', entityType: 'class', entityId: classId, classId,
    });
    return c.json({ success: true, data: { message: 'Entry password updated. The old value no longer works.' } });
  });

  // -------------------------------------------------------------------------
  // Team management
  // -------------------------------------------------------------------------
  app.post('/api/cgm/classes/:id/team', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const classId = Number(c.req.param('id'));
    const guard = await requireClassPermission(c, member, classId, 'manage_class_settings');
    if (!guard.ok) return guard.response;
    if (!member.isPhantom && guard.context.role !== 'primary') return bad(c, 'Only the primary organizer can manage the team.', 403);
    const body = await readBody(c);
    const email = cleanEmail(body.email)?.toLowerCase();
    const role = String(body.role || 'co_organizer');
    if (!email) return bad(c, 'Enter the member email.');
    if (!['co_organizer', 'assistant'].includes(role)) return bad(c, 'Choose co-organizer or assistant.');
    const requested = Array.isArray(body.permissions) ? body.permissions : null;
    const permissions = role === 'co_organizer'
      ? sanitizeClassPermissions(requested?.length ? requested : CO_ORGANIZER_DEFAULT_PERMISSIONS)
      : sanitizeClassPermissions(requested || []);

    const userRows = await asRows<{ id: number; profile_id: number | null }>(c.env.DB.prepare(
      `SELECT u.id, mp.id AS profile_id FROM users u LEFT JOIN member_profiles mp ON mp.user_id = u.id WHERE LOWER(u.email) = ?`
    ).bind(email));
    const target = userRows[0];
    if (!target?.profile_id) return bad(c, 'No active Society member found with that email.', 404);
    const existing = await asRows<{ id: number }>(c.env.DB.prepare(
      `SELECT id FROM cgm_class_organizers WHERE class_id = ? AND member_profile_id = ? AND status = 'active'`
    ).bind(classId, Number(target.profile_id)));
    if (existing[0]) return bad(c, 'That member is already on this class team.', 409);

    await c.env.DB.prepare(
      `INSERT INTO cgm_class_organizers (class_id, member_profile_id, user_id, role, permissions_json, granted_by_profile_id, granted_by_label)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(classId, Number(target.profile_id), Number(target.id), role, JSON.stringify(permissions), member.profileId, member.name).run();
    await auditCgm(c.env.DB, {
      actorType: 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
      action: 'cgm.team.added', entityType: 'class', entityId: classId, classId,
      context: { role, permissions },
    });
    await createNotification(c.env.DB, {
      title: 'You were added to a class team',
      message: `${member.name} made you a ${role === 'primary' ? 'primary organizer' : role === 'co_organizer' ? 'co-organizer' : 'assistant'} of a class in Class & Group Management.`,
      audience: 'system', audienceLabel: 'Class & Groups', recipientProfileIds: [Number(target.profile_id)],
    });
    return c.json({ success: true });
  });

  app.patch('/api/cgm/classes/:id/team/:organizerId', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const classId = Number(c.req.param('id'));
    const organizerId = Number(c.req.param('organizerId'));
    const guard = await requireClassPermission(c, member, classId, 'manage_class_settings');
    if (!guard.ok) return guard.response;
    if (!member.isPhantom && guard.context.role !== 'primary') return bad(c, 'Only the primary organizer can manage the team.', 403);
    const rows = await asRows<any>(c.env.DB.prepare(
      'SELECT * FROM cgm_class_organizers WHERE id = ? AND class_id = ?'
    ).bind(organizerId, classId));
    const row = rows[0];
    if (!row) return bad(c, 'Team member not found.', 404);
    if (row.role === 'primary') return bad(c, 'The primary organizer is changed through ownership transfer.', 409);
    const body = await readBody(c);
    if (body.revoke) {
      // A delegated user can never grant or restore themselves — only PHANTOM
      // or the primary organizer revokes, and revocation is effective on the
      // next request because every route re-reads this row.
      await c.env.DB.prepare(
        `UPDATE cgm_class_organizers SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP, revoked_by_label = ? WHERE id = ?`
      ).bind(member.name, organizerId).run();
      await auditCgm(c.env.DB, {
        actorType: 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
        action: 'cgm.team.revoked', entityType: 'class', entityId: organizerId, classId,
        context: { memberId: Number(row.member_profile_id) },
      });
      return c.json({ success: true });
    }
    if (body.permissions !== undefined) {
      const permissions = sanitizeClassPermissions(body.permissions);
      await c.env.DB.prepare(
        'UPDATE cgm_class_organizers SET permissions_json = ? WHERE id = ?'
      ).bind(JSON.stringify(permissions), organizerId).run();
      await auditCgm(c.env.DB, {
        actorType: 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
        action: 'cgm.team.permissions_changed', entityType: 'class', entityId: organizerId, classId,
        context: { permissions },
      });
    }
    return c.json({ success: true });
  });

  // -------------------------------------------------------------------------
  // Ownership transfer (primary organizer succession)
  // -------------------------------------------------------------------------
  app.post('/api/cgm/classes/:id/transfer', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const classId = Number(c.req.param('id'));
    const guard = await requireClassPermission(c, member, classId, 'manage_class_settings');
    if (!guard.ok) return guard.response;
    if (!member.isPhantom && guard.context.role !== 'primary') return bad(c, 'Only the primary organizer can propose a transfer.', 403);
    const body = await readBody(c);
    const targetProfileId = Number(body.toProfileId);
    if (!targetProfileId) return bad(c, 'Choose the successor.');
    const target = await asRows<any>(c.env.DB.prepare(
      `SELECT o.id, COALESCE(u.name, mu.name, 'Member') AS name
       FROM cgm_class_organizers o
       LEFT JOIN member_profiles mp ON mp.id = o.member_profile_id
       LEFT JOIN users u ON u.id = mp.user_id
       LEFT JOIN members mu ON mu.id = mp.member_record_id
       WHERE o.class_id = ? AND o.member_profile_id = ? AND o.status = 'active'`
    ).bind(classId, targetProfileId));
    if (!target[0]) return bad(c, 'The successor must already be a co-organizer or assistant of this class.', 400);
    // The pending transfer lives in the class settings until the successor
    // accepts it; nothing transfers silently.
    const current = sanitizeClassSettings(JSON.parse((await classCore(c.env.DB, classId))!.settings_json || '{}'));
    await writeClassSettings(c.env.DB, classId, current);
    await c.env.DB.prepare(
      `UPDATE cgm_classes SET settings_json = ? WHERE id = ?`
    ).bind(JSON.stringify({
      ...current,
      pendingTransfer: { profileId: targetProfileId, name: target[0].name || 'Member', proposedBy: member.name, proposedAt: new Date().toISOString() },
    }), classId).run();
    await createNotification(c.env.DB, {
      title: 'Class ownership transfer proposed',
      message: `${member.name} proposed you as the new primary organizer. Open the class to accept.`,
      audience: 'system', audienceLabel: 'Class & Groups', recipientProfileIds: [targetProfileId],
    });
    await auditCgm(c.env.DB, {
      actorType: 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
      action: 'cgm.class.transfer_proposed', entityType: 'class', entityId: classId, classId,
      context: { toProfileId: targetProfileId },
    });
    return c.json({ success: true });
  });

  app.post('/api/cgm/classes/:id/transfer/accept', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const classId = Number(c.req.param('id'));
    const klass = await classCore(c.env.DB, classId);
    if (!klass) return bad(c, 'Class not found.', 404);
    let rawSettings: any = {};
    try { rawSettings = JSON.parse(klass.settings_json || '{}'); } catch { rawSettings = {}; }
    const pending = rawSettings.pendingTransfer;
    if (!pending || Number(pending.profileId) !== Number(member.profileId)) {
      return bad(c, 'No ownership transfer is waiting for you.', 404);
    }
    const currentPrimary = await asRows<{ id: number; member_profile_id: number }>(c.env.DB.prepare(
      `SELECT id, member_profile_id FROM cgm_class_organizers WHERE class_id = ? AND role = 'primary' AND status = 'active'`
    ).bind(classId));
    if (currentPrimary[0]) {
      await c.env.DB.prepare(
        `UPDATE cgm_class_organizers SET role = 'co_organizer',
         permissions_json = ? WHERE id = ?`
      ).bind(JSON.stringify(CO_ORGANIZER_DEFAULT_PERMISSIONS), Number(currentPrimary[0].id)).run();
    }
    const successorRow = await asRows<{ id: number }>(c.env.DB.prepare(
      `SELECT id FROM cgm_class_organizers WHERE class_id = ? AND member_profile_id = ? AND status = 'active'`
    ).bind(classId, Number(pending.profileId)));
    if (successorRow[0]) {
      await c.env.DB.prepare(
        `UPDATE cgm_class_organizers SET role = 'primary', permissions_json = '[]' WHERE id = ?`
      ).bind(Number(successorRow[0].id)).run();
    }
    delete rawSettings.pendingTransfer;
    await writeClassSettings(c.env.DB, classId, sanitizeClassSettings(rawSettings));
    await c.env.DB.prepare(
      `INSERT INTO cgm_class_approvals (class_id, action, actor_type, actor_label, reason)
       VALUES (?, 'reinstated', 'organizer', ?, 'Ownership transferred to successor')`
    ).bind(classId, member.name).run();
    await auditCgm(c.env.DB, {
      actorType: 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
      action: 'cgm.class.transfer_accepted', entityType: 'class', entityId: classId, classId,
      context: { fromProfileId: currentPrimary[0]?.member_profile_id },
    });
    return c.json({ success: true });
  });

  // -------------------------------------------------------------------------
  // Settings + login format workflow
  // -------------------------------------------------------------------------
  app.post('/api/cgm/classes/:id/settings', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const classId = Number(c.req.param('id'));
    const guard = await requireClassPermission(c, member, classId, 'manage_class_settings');
    if (!guard.ok) return guard.response;
    const body = await readBody(c);
    const current = await readClassSettings(c.env.DB, classId);
    const next = sanitizeClassSettings({ ...current, ...body });
    await writeClassSettings(c.env.DB, classId, next);
    await auditCgm(c.env.DB, {
      actorType: member.isPhantom ? 'phantom' : 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
      action: 'cgm.class.settings_updated', entityType: 'class', entityId: classId, classId,
    });
    return c.json({ success: true, data: { settings: next } });
  });

  app.post('/api/cgm/classes/:id/login-format/propose', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const classId = Number(c.req.param('id'));
    const guard = await requireClassPermission(c, member, classId, 'manage_class_settings');
    if (!guard.ok) return guard.response;
    const body = await readBody(c);
    const format = sanitizeLoginFormat(body.format);
    const current = await readClassSettings(c.env.DB, classId);
    current.pendingLoginFormat = {
      ...format,
      proposedByLabel: member.name,
      proposedAt: new Date().toISOString(),
    };
    await writeClassSettings(c.env.DB, classId, current);

    // Step 2 of the workflow: notify every affected student.
    const members = await asRows<{ student_id: number }>(c.env.DB.prepare(
      `SELECT student_id FROM cgm_class_members WHERE class_id = ? AND status = 'active'`
    ).bind(classId));
    for (const row of members) {
      await notifyStudent(c.env.DB, Number(row.student_id), 'security', 'Sign-in format change proposed',
        `Your organizer proposed changing how students sign in: passkey plus ${format.identifiers.join(' or ')}.
         You will be notified before it becomes active.`);
    }
    await auditCgm(c.env.DB, {
      actorType: 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
      action: 'cgm.login_format.proposed', entityType: 'class', entityId: classId, classId,
      context: { format },
    });
    return c.json({ success: true, data: { message: `Proposed. Students have been notified; activate when ready.` } });
  });

  app.post('/api/cgm/classes/:id/login-format/activate', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const classId = Number(c.req.param('id'));
    const guard = await requireClassPermission(c, member, classId, 'manage_class_settings');
    if (!guard.ok) return guard.response;
    const current = await readClassSettings(c.env.DB, classId);
    if (!current.pendingLoginFormat) return bad(c, 'No login-format change is pending.', 409);
    const oldFormat = current.loginFormat;
    current.loginFormat = {
      identifiers: current.pendingLoginFormat.identifiers,
      allowStudentPasskeyChange: current.pendingLoginFormat.allowStudentPasskeyChange,
    };
    current.pendingLoginFormat = null;
    await writeClassSettings(c.env.DB, classId, current);
    const members = await asRows<{ student_id: number }>(c.env.DB.prepare(
      `SELECT student_id FROM cgm_class_members WHERE class_id = ? AND status = 'active'`
    ).bind(classId));
    for (const row of members) {
      await notifyStudent(c.env.DB, Number(row.student_id), 'security', 'Sign-in format changed',
        `Sign in now uses your passkey plus ${current.loginFormat.identifiers.join(' or ')}.`);
    }
    await auditCgm(c.env.DB, {
      actorType: 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
      action: 'cgm.login_format.activated', entityType: 'class', entityId: classId, classId,
      context: { from: oldFormat, to: current.loginFormat },
    });
    return c.json({ success: true });
  });

  app.post('/api/cgm/classes/:id/login-format/cancel', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const classId = Number(c.req.param('id'));
    const guard = await requireClassPermission(c, member, classId, 'manage_class_settings');
    if (!guard.ok) return guard.response;
    const current = await readClassSettings(c.env.DB, classId);
    if (!current.pendingLoginFormat) return bad(c, 'No login-format change is pending.', 409);
    current.pendingLoginFormat = null;
    await writeClassSettings(c.env.DB, classId, current);
    await auditCgm(c.env.DB, {
      actorType: 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
      action: 'cgm.login_format.cancelled', entityType: 'class', entityId: classId, classId,
    });
    return c.json({ success: true });
  });

  // -------------------------------------------------------------------------
  // Roster import + management
  // -------------------------------------------------------------------------
  app.get('/api/cgm/classes/:id/roster', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const classId = Number(c.req.param('id'));
    const guard = await requireClassPermission(c, member, classId, 'view_roster');
    if (!guard.ok) return guard.response;
    const search = clean(c.req.query('search'), 80);
    const rows = await asRows<any>(c.env.DB.prepare(
      `SELECT r.*, s.id AS linked_student_id, s.status AS student_status
       FROM cgm_roster_entries r LEFT JOIN cgm_students s ON s.id = r.student_id
       WHERE r.class_id = ? ${search ? 'AND (r.full_name LIKE ? OR r.index_number LIKE ? OR r.university_id LIKE ? OR r.phone LIKE ?)' : ''}
       ORDER BY r.full_name LIMIT 1000`
    ).bind(...(search
      ? [classId, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`]
      : [classId])));
    const sensitive = member.isPhantom || guard.context.permissions.has('view_sensitive_profiles' as ClassPermission);
    return c.json({
      success: true,
      data: rows.map((row) => ({
        id: Number(row.id), fullName: row.full_name, indexNumber: row.index_number,
        universityId: sensitive ? row.university_id : null,
        phone: sensitive ? row.phone : null,
        gender: row.gender, email: sensitive ? row.email : null,
        customFields: (() => { try { return JSON.parse(row.custom_fields_json || '{}'); } catch { return {}; } })(),
        status: row.status, studentId: row.student_id ? Number(row.student_id) : null,
        studentStatus: row.student_status || null,
      })),
      sensitive,
    });
  });

  // Dry-run or commit a roster import. The pipeline is identical for all
  // three formats: parse → map → validate → dedupe → apply.
  const runRosterImport = async (c: any, classId: number, rows: Record<string, unknown>[], headers: string[], mapping: Partial<Record<RosterField, string>>, policy: string, label: string, format: string, fileName: string) => {
    const member = await memberFromRequest(c);
    if (!member) return { status: 401 as const, response: c.json({ success: false, error: 'Sign in first.' }, 401) };
    const errors: Array<{ row: number; error: string }> = [];
    const prepared: any[] = [];
    const seen = new Set<string>();

    rows.forEach((row, index) => {
      const mapped = applyMapping(row, mapping, headers, []);
      const name = (mapped.values.full_name || '').trim();
      const indexNumber = (mapped.values.index_number || '').trim();
      const rowNumber = index + 2; // header offset
      if (!name) { errors.push({ row: rowNumber, error: 'Missing full name.' }); return; }
      if (!indexNumber) { errors.push({ row: rowNumber, error: 'Missing index number.' }); return; }
      const key = lookupKey(indexNumber);
      if (seen.has(key)) { errors.push({ row: rowNumber, error: 'Duplicate index number inside this file.' }); return; }
      seen.add(key);
      const phoneDisplayValue = mapped.values.phone ? phoneDisplay(mapped.values.phone) : null;
      prepared.push({
        full_name: name.slice(0, 160),
        index_number: indexNumber,
        index_number_key: key,
        university_id: mapped.values.university_id || null as any,
        university_id_key: mapped.values.university_id ? lookupKey(mapped.values.university_id) : null as any,
        phone: phoneDisplayValue,
        phone_key: phoneDisplayValue ? phoneKey(phoneDisplayValue) : null as any,
        gender: normalizeGender(mapped.values.gender),
        email: mapped.values.email ? cleanEmail(mapped.values.email) : null as any,
        custom: mapped.custom,
      });
    });

    const summary = {
      totalRows: rows.length,
      validRows: prepared.length,
      invalidRows: errors.filter((e) => !e.error.includes('Duplicate')).length,
      duplicateRows: errors.filter((e) => e.error.includes('Duplicate')).length,
    };

    if (String(c.req.query('preview')) === '1') {
      return {
        status: 200 as const,
        response: c.json({
          success: true, data: {
            preview: true, summary,
            suggestedMapping: suggestMapping(headers),
            errors: errors.slice(0, 50),
            sample: prepared.slice(0, 10),
          },
        }),
      };
    }

    let created = 0; let updated = 0; let skipped = 0;
    const batch: D1PreparedStatement[] = [];
    for (const entry of prepared) {
      const existing = await asRows<any>(c.env.DB.prepare(
        'SELECT * FROM cgm_roster_entries WHERE class_id = ? AND index_number_key = ?'
      ).bind(classId, entry.index_number_key));
      if (existing[0]) {
        if (policy === 'skip') { skipped += 1; continue; }
        if (policy === 'update') {
          // Approved student profile values are never silently overwritten:
          // only the roster row is refreshed, and a conflict is flagged for
          // organizer review through the same table.
          batch.push(c.env.DB.prepare(
            `UPDATE cgm_roster_entries SET full_name = ?, university_id = COALESCE(?, university_id),
             phone = COALESCE(?, phone), phone_key = COALESCE(?, phone_key), gender = ?,
             email = COALESCE(?, email), updated_at = CURRENT_TIMESTAMP WHERE id = ?`
          ).bind(entry.full_name, entry.university_id, entry.phone, entry.phone_key, entry.gender, entry.email, Number(existing[0].id)));
          updated += 1;
        } else { skipped += 1; }
        continue;
      }
      batch.push(c.env.DB.prepare(
        `INSERT INTO cgm_roster_entries
         (class_id, index_number, index_number_key, full_name, university_id, university_id_key, phone, phone_key, gender, email, custom_fields_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(classId, entry.index_number, entry.index_number_key, entry.full_name, entry.university_id,
        entry.university_id_key, entry.phone, entry.phone_key, entry.gender, entry.email, JSON.stringify(entry.custom)));
      created += 1;
    }
    for (let i = 0; i < batch.length; i += 40) {
      await c.env.DB.batch(batch.slice(i, i + 40));
    }

    const importResult = await c.env.DB.prepare(
      `INSERT INTO cgm_roster_imports
       (class_id, created_by_profile_id, created_by_label, file_name, format, total_rows, valid_rows, invalid_rows, duplicate_rows, created_count, updated_count, skipped_count, errors_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(classId, member.profileId, member.name, fileName, format,
      summary.totalRows, summary.validRows, summary.invalidRows, summary.duplicateRows,
      created, updated, skipped, JSON.stringify(errors.slice(0, 200))).run();

    await auditCgm(c.env.DB, {
      actorType: 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
      action: 'cgm.roster.imported', entityType: 'class', entityId: classId, classId,
      context: { ...summary, created, updated, skipped },
    });
    return {
      status: 200 as const,
      response: c.json({
        success: true,
        data: { importId: Number(importResult.meta.last_row_id), ...summary, created, updated, skipped, errors: errors.slice(0, 50) },
      }),
    };
  };

  app.post('/api/cgm/classes/:id/roster/import', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const classId = Number(c.req.param('id'));
    const guard = await requireClassPermission(c, member, classId, 'import_roster');
    if (!guard.ok) return guard.response;

    const contentType = c.req.header('content-type') || '';
    let rows: Record<string, unknown>[] = [];
    let headers: string[] = [];
    let mapping: Partial<Record<RosterField, string>> = {};
    let policy = 'skip';
    let format = 'csv';
    let fileName = 'roster';

    if (contentType.includes('multipart/form-data')) {
      const form = await c.req.parseBody();
      const file = form.file as File | undefined;
      if (!file) return bad(c, 'Choose a file to import.');
      if (file.size > 2 * 1024 * 1024) return bad(c, 'Keep roster files under 2 MB.', 413);
      fileName = file.name || 'roster';
      mapping = typeof form.mapping === 'string' ? safeParseMapping(form.mapping) : {};
      policy = String(form.policy || 'skip');
      const lower = fileName.toLowerCase();
      if (lower.endsWith('.json') || file.type === 'application/json') {
        format = 'json';
        rows = parseJsonRows(await file.text());
        headers = rows.length ? Object.keys(rows[0]) : [];
      } else if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || file.type.includes('spreadsheet')) {
        format = 'xlsx';
        rows = await parseXlsxRows(await file.arrayBuffer());
        headers = rows.length ? Object.keys(rows[0]) : [];
      } else {
        format = 'csv';
        const table = parseCsv(await file.text());
        headers = (table[0] || []).map((header) => header.trim());
        rows = table.slice(1).map((cells) => {
          const row: Record<string, unknown> = {};
          headers.forEach((header, i) => { row[header] = cells[i] ?? ''; });
          return row;
        });
      }
      if (Object.keys(mapping).length === 0) mapping = suggestMapping(headers) as Partial<Record<RosterField, string>>;
    } else {
      const body = await readBody(c);
      rows = Array.isArray(body.rows) ? body.rows : [];
      headers = Array.isArray(body.headers) ? body.headers : (rows.length ? Object.keys(rows[0]) : []);
      mapping = typeof body.mapping === 'string' ? safeParseMapping(body.mapping) : (body.mapping || {});
      policy = String(body.policy || 'skip');
      format = String(body.format || 'json');
      if (!Object.keys(mapping).length) mapping = suggestMapping(headers) as Partial<Record<RosterField, string>>;
    }

    if (!rows.length) return bad(c, 'The file has no rows to import.');
    if (rows.length > 2000) return bad(c, 'Split rosters larger than 2000 rows into batches.', 413);
    if (!mapping.full_name || !mapping.index_number) {
      return c.json({
        success: false,
        error: 'Map at least the full name and index number columns before importing.',
        data: { needsMapping: true, headers, suggestedMapping: suggestMapping(headers) },
      }, 400);
    }
    const result = await runRosterImport(c, classId, rows, headers, mapping, policy, member.name, format, fileName);
    return result.response;
  });

  const safeParseMapping = (value: string): Partial<Record<RosterField, string>> => {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  };

  app.post('/api/cgm/classes/:id/roster/entries', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const classId = Number(c.req.param('id'));
    const guard = await requireClassPermission(c, member, classId, 'edit_roster');
    if (!guard.ok) return guard.response;
    const body = await readBody(c);
    const fullName = clean(body.fullName, 160);
    const indexNumber = clean(body.indexNumber, 80);
    if (!fullName || !indexNumber) return bad(c, 'Full name and index number are required.');
    const key = lookupKey(indexNumber);
    const existing = await asRows<{ id: number }>(c.env.DB.prepare(
      'SELECT id FROM cgm_roster_entries WHERE class_id = ? AND index_number_key = ?'
    ).bind(classId, key));
    if (existing[0]) return bad(c, 'A roster entry with this index number already exists.', 409);
    const phone = cleanOrNull(body.phone, 32);
    const result = await c.env.DB.prepare(
      `INSERT INTO cgm_roster_entries (class_id, index_number, index_number_key, full_name, university_id, university_id_key, phone, phone_key, gender, email)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(classId, indexNumber, key, fullName,
      cleanOrNull(body.universityId, 80), body.universityId ? lookupKey(body.universityId) : null,
      phone, phone ? phoneKey(phone) : null, normalizeGender(body.gender), cleanEmail(body.email)).run();
    await auditCgm(c.env.DB, {
      actorType: 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
      action: 'cgm.roster.entry_added', entityType: 'class', entityId: classId, classId,
      context: { indexNumber },
    });
    return c.json({ success: true, data: { id: Number(result.meta.last_row_id) } });
  });

  app.patch('/api/cgm/classes/:id/roster/entries/:entryId', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const classId = Number(c.req.param('id'));
    const guard = await requireClassPermission(c, member, classId, 'edit_roster');
    if (!guard.ok) return guard.response;
    const entryId = Number(c.req.param('entryId'));
    const body = await readBody(c);
    const fields: string[] = []; const values: any[] = [];
    if (body.fullName !== undefined) { fields.push('full_name = ?'); values.push(clean(body.fullName, 160)); }
    if (body.gender !== undefined) { fields.push('gender = ?'); values.push(normalizeGender(body.gender)); }
    if (body.universityId !== undefined) { fields.push('university_id = ?', 'university_id_key = ?'); values.push(cleanOrNull(body.universityId, 80), body.universityId ? lookupKey(body.universityId) : null); }
    if (body.phone !== undefined) { const phone = cleanOrNull(body.phone, 32); fields.push('phone = ?', 'phone_key = ?'); values.push(phone, phone ? phoneKey(phone) : null); }
    if (body.email !== undefined) { fields.push('email = ?'); values.push(cleanEmail(body.email)); }
    if (!fields.length) return bad(c, 'Nothing to update.');
    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(entryId, classId);
    await c.env.DB.prepare(
      `UPDATE cgm_roster_entries SET ${fields.join(', ')} WHERE id = ? AND class_id = ?`
    ).bind(...values).run();
    await auditCgm(c.env.DB, {
      actorType: 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
      action: 'cgm.roster.entry_updated', entityType: 'class', entityId: entryId, classId,
    });
    return c.json({ success: true });
  });

  app.delete('/api/cgm/classes/:id/roster/entries/:entryId', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const classId = Number(c.req.param('id'));
    const guard = await requireClassPermission(c, member, classId, 'edit_roster');
    if (!guard.ok) return guard.response;
    const entryId = Number(c.req.param('entryId'));
    const entry = await asRows<any>(c.env.DB.prepare(
      'SELECT student_id FROM cgm_roster_entries WHERE id = ? AND class_id = ?'
    ).bind(entryId, classId));
    if (entry[0]?.student_id) return bad(c, 'This student has already registered; remove the class membership instead.', 409);
    await c.env.DB.prepare('DELETE FROM cgm_roster_entries WHERE id = ? AND class_id = ?').bind(entryId, classId).run();
    await auditCgm(c.env.DB, {
      actorType: 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
      action: 'cgm.roster.entry_removed', entityType: 'class', entityId: entryId, classId,
    });
    return c.json({ success: true });
  });

  app.get('/api/cgm/classes/:id/roster/imports', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const classId = Number(c.req.param('id'));
    const guard = await requireClassPermission(c, member, classId, 'view_roster');
    if (!guard.ok) return guard.response;
    const rows = await asRows<any>(c.env.DB.prepare(
      `SELECT * FROM cgm_roster_imports WHERE class_id = ? ORDER BY id DESC LIMIT 50`
    ).bind(classId));
    return c.json({
      success: true,
      data: rows.map((row) => ({
        id: Number(row.id), fileName: row.file_name, format: row.format,
        totalRows: Number(row.total_rows), validRows: Number(row.valid_rows), invalidRows: Number(row.invalid_rows),
        duplicateRows: Number(row.duplicate_rows), created: Number(row.created_count),
        updated: Number(row.updated_count), skipped: Number(row.skipped_count),
        errors: (() => { try { return JSON.parse(row.errors_json || '[]'); } catch { return []; } })(),
        createdAt: row.created_at,
      })),
    });
  });

  // -------------------------------------------------------------------------
  // Registration approvals (identity issuance happens here and only here)
  // -------------------------------------------------------------------------
  app.get('/api/cgm/classes/:id/registrations', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const classId = Number(c.req.param('id'));
    const guard = await registrationQueueAccess(c, member, classId);
    if (!guard.ok) return guard.response;
    const status = clean(c.req.query('status') || 'pending', 20);
    const rows = await asRows<any>(c.env.DB.prepare(
      `SELECT r.*, re.full_name, re.index_number, re.gender, re.email, re.phone, re.university_id, re.student_id
       FROM cgm_registration_requests r JOIN cgm_roster_entries re ON re.id = r.roster_entry_id
       WHERE r.class_id = ? AND r.status = ? ORDER BY r.created_at DESC LIMIT 200`
    ).bind(classId, status));
    return c.json({
      success: true,
      data: rows.map((row) => ({
        id: Number(row.id), fullName: row.full_name, indexNumber: row.index_number,
        gender: row.gender, email: row.email, phone: row.phone, universityId: row.university_id,
        status: row.status, studentId: row.student_id ? Number(row.student_id) : null, createdAt: row.created_at,
      })),
    });
  });

  // Registration approvals accept either the class permission or an active
  // PHANTOM delegation for this exact class (used down to its batch cap).
  const registrationQueueAccess = async (
    c: any,
    member: { profileId: number | null; isPhantom?: boolean },
    classId: number,
  ): Promise<{ ok: true; viaDelegation: boolean } | { ok: false; response: Response }> => {
    const guard = await requireClassPermission(c, member as any, classId, 'approve_registrations');
    if (guard.ok) {
      if (!member.isPhantom) {
        // Delegated approval is only real when PHANTOM allowed organizers to
        // approve registrations for this class.
        const settings = await readClassSettings(c.env.DB, classId);
        if (settings.registrationApprovals === 'phantom') {
          return { ok: false, response: bad(c, 'Only PHANTOM approves registrations for this class.', 403) };
        }
      }
      return { ok: true, viaDelegation: false };
    }
    if (member.profileId === null) return { ok: false, response: guard.response };
    const delegation = await asRows<{ id: number; max_batch: number | null; approvals_used: number }>(c.env.DB.prepare(
      `SELECT id, max_batch, approvals_used FROM cgm_approval_delegations
       WHERE member_profile_id = ? AND class_id = ? AND status = 'active'`
    ).bind(member.profileId, classId));
    const row = delegation[0];
    if (!row) return { ok: false, response: guard.response };
    if (row.max_batch !== null && Number(row.approvals_used) >= Number(row.max_batch)) {
      return { ok: false, response: bad(c, 'This delegated approval batch is used up. PHANTOM can extend it.', 403) };
    }
    return { ok: true, viaDelegation: true };
  };

  const approveRegistration = async (c: any, classId: number, requestId: number, approve: boolean, reason: string | null) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const access = await registrationQueueAccess(c, member, classId);
    if (!access.ok) return access.response;
    const rows = await asRows<any>(c.env.DB.prepare(
      `SELECT r.*, re.full_name, re.index_number, re.gender, re.email, re.phone, re.university_id,
              re.university_id_key, re.phone_key, re.custom_fields_json, cl.institution, cl.institution_key, cl.name AS class_name
       FROM cgm_registration_requests r
       JOIN cgm_roster_entries re ON re.id = r.roster_entry_id
       JOIN cgm_classes cl ON cl.id = r.class_id
       WHERE r.id = ? AND r.class_id = ? AND r.status = 'pending'`
    ).bind(requestId, classId));
    const request = rows[0];
    if (!request) return bad(c, 'Registration request not found or already reviewed.', 404);

    if (!approve) {
      await c.env.DB.prepare(
        `UPDATE cgm_registration_requests SET status = 'rejected', reviewed_by_profile_id = ?, reviewer_label = ?,
         review_reason = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?`
      ).bind(member.profileId, member.name, reason, requestId).run();
      if (request.student_id) {
        await notifyStudent(c.env.DB, Number(request.student_id), 'registration', 'Registration not approved',
          reason || `Your registration for ${request.class_name} was not approved.`);
      }
      await auditCgm(c.env.DB, {
        actorType: 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
        action: 'cgm.registration.rejected', entityType: 'registration', entityId: requestId, classId,
        context: { indexNumber: request.index_number },
      });
      return c.json({ success: true });
    }

    // Find or create the permanent identity, then issue ONE passkey.
    let studentId = request.student_id ? Number(request.student_id) : null;
    let issuedPasskey: string | null = null;
    if (!studentId) {
      const existing = await asRows<{ id: number }>(c.env.DB.prepare(
        'SELECT id FROM cgm_students WHERE institution_key = ? AND index_number_key = ?'
      ).bind(request.institution_key, request.index_number_key || String(request.index_number).trim().replace(/\s+/g, ' ').toLowerCase()));
      studentId = existing[0] ? Number(existing[0].id) : null;
    }
    if (studentId) {
      const student = await asRows<{ passkey_sequence: number | null; status: string }>(c.env.DB.prepare(
        'SELECT passkey_sequence, status FROM cgm_students WHERE id = ?'
      ).bind(studentId));
      if (student[0] && student[0].passkey_sequence === null) {
        const allocation = await allocateStudentPasskey(c.env.DB);
        issuedPasskey = allocation.passkey;
        await c.env.DB.prepare(
          `UPDATE cgm_students SET passkey_suffix = ?, passkey_sequence = ?, passkey_verifier = ?,
           passkey_issued_at = CURRENT_TIMESTAMP, status = 'active', full_name = COALESCE(NULLIF(?, ''), full_name),
           updated_at = CURRENT_TIMESTAMP WHERE id = ?`
        ).bind(allocation.suffix, allocation.sequence, await hashPassword(allocation.passkey), request.full_name, studentId).run();
      } else if (student[0] && student[0].status === 'pending') {
        await c.env.DB.prepare(`UPDATE cgm_students SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(studentId).run();
      }
    } else {
      const allocation = await allocateStudentPasskey(c.env.DB);
      issuedPasskey = allocation.passkey;
      const inserted = await c.env.DB.prepare(
        `INSERT INTO cgm_students
         (full_name, index_number, index_number_key, institution, institution_key, university_id, university_id_key,
          phone, phone_key, email, gender, custom_fields_json, passkey_suffix, passkey_sequence, passkey_verifier,
          passkey_issued_at, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 'active')`
      ).bind(
        request.full_name, request.index_number,
        request.index_number_key || String(request.index_number).trim().replace(/\s+/g, ' ').toLowerCase(),
        request.institution, request.institution_key,
        request.university_id, request.university_id_key,
        request.phone, request.phone_key, request.email, request.gender,
        request.custom_fields_json || '{}',
        allocation.suffix, allocation.sequence, await hashPassword(allocation.passkey),
      ).run();
      studentId = Number(inserted.meta.last_row_id);
    }

    // Membership is created together with the approved registration.
    await c.env.DB.prepare(
      `INSERT OR IGNORE INTO cgm_class_members (class_id, student_id, added_via, added_by_label)
       VALUES (?, ?, 'registration', ?)`
    ).bind(classId, studentId, member.name).run();
    await c.env.DB.prepare(
      'UPDATE cgm_roster_entries SET status = ?, student_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = (SELECT roster_entry_id FROM cgm_registration_requests WHERE id = ?)'
    ).bind('registered', studentId, requestId).run();
    await c.env.DB.prepare(
      `UPDATE cgm_registration_requests SET status = 'approved', student_id = ?, reviewed_by_profile_id = ?,
       reviewer_label = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(studentId, member.profileId, member.name, requestId).run();

    if (issuedPasskey) {
      await notifyStudent(c.env.DB, studentId, 'registration', 'Your permanent student passkey',
        `Your registration for ${request.class_name} was approved. Your permanent passkey is ${issuedPasskey}. It is shown only here — save it now; sign-in also needs your index number.`);
    }
    if (access.viaDelegation && member.profileId !== null) {
      await c.env.DB.prepare(
        "UPDATE cgm_approval_delegations SET approvals_used = approvals_used + 1 WHERE member_profile_id = ? AND class_id = ? AND status = 'active'"
      ).bind(member.profileId, classId).run();
    }
    await auditCgm(c.env.DB, {
      actorType: 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
      action: 'cgm.registration.approved', entityType: 'registration', entityId: requestId, classId,
      context: { studentId, passkeyIssued: Boolean(issuedPasskey), sequenceIssued: Boolean(issuedPasskey), viaDelegation: access.viaDelegation },
    });
    return c.json({
      success: true,
      data: {
        studentId,
        passkey: issuedPasskey || undefined,
        message: issuedPasskey
          ? `Approved. The student's permanent passkey is ${issuedPasskey} — shown to the student once, never stored in plain text.`
          : 'Approved. The student already has a permanent passkey.',
      },
    });
  };

  // The route layer needs the PBKDF2 hasher; attach it without a cycle.
  (approveRegistration as any).hash = undefined;

  app.post('/api/cgm/classes/:id/registrations/:requestId/approve', async (c: any) => {
    const body = await readBody(c);
    return approveRegistration(c, Number(c.req.param('id')), Number(c.req.param('requestId')), true, cleanOrNull(body.reason, 500));
  });

  app.post('/api/cgm/classes/:id/registrations/:requestId/reject', async (c: any) => {
    const body = await readBody(c);
    return approveRegistration(c, Number(c.req.param('id')), Number(c.req.param('requestId')), false, cleanOrNull(body.reason, 500));
  });

  // -------------------------------------------------------------------------
  // Members + membership requests + profile-change reviews
  // -------------------------------------------------------------------------
  app.get('/api/cgm/classes/:id/members', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const classId = Number(c.req.param('id'));
    const guard = await requireClassPermission(c, member, classId, 'view_roster');
    if (!guard.ok) return guard.response;
    const sensitive = member.isPhantom || guard.context.permissions.has('view_sensitive_profiles' as ClassPermission);
    const status = clean(c.req.query('status') || 'active', 20);
    const rows = await asRows<any>(c.env.DB.prepare(
      `SELECT m.id, m.status, m.joined_at, m.added_via, s.id AS student_id, s.full_name, s.index_number,
              s.university_id, s.phone, s.email, s.gender, s.status AS student_status
       FROM cgm_class_members m JOIN cgm_students s ON s.id = m.student_id
       WHERE m.class_id = ? AND m.status = ?
       ORDER BY s.full_name LIMIT 1000`
    ).bind(classId, status));
    return c.json({
      success: true,
      data: rows.map((row) => ({
        memberId: Number(row.id), studentId: Number(row.student_id), fullName: row.full_name,
        indexNumber: row.index_number, gender: row.gender, status: row.status, joinedAt: row.joined_at,
        addedVia: row.added_via, studentStatus: row.student_status,
        universityId: sensitive ? row.university_id : null,
        phone: sensitive ? row.phone : null,
        email: sensitive ? row.email : null,
      })),
      sensitive,
    });
  });

  app.post('/api/cgm/classes/:id/members/add', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const classId = Number(c.req.param('id'));
    const guard = await requireClassPermission(c, member, classId, 'edit_roster');
    if (!guard.ok) return guard.response;
    const body = await readBody(c);
    const entryId = Number(body.rosterEntryId);
    const entry = await asRows<any>(c.env.DB.prepare(
      'SELECT * FROM cgm_roster_entries WHERE id = ? AND class_id = ?'
    ).bind(entryId, classId));
    if (!entry[0]) return bad(c, 'Roster entry not found.', 404);
    if (!entry[0].student_id) return bad(c, 'This student has not registered yet. Approve their registration first.', 409);
    const result = await c.env.DB.prepare(
      `INSERT OR IGNORE INTO cgm_class_members (class_id, student_id, added_via, added_by_label) VALUES (?, ?, 'organizer', ?)`
    ).bind(classId, Number(entry[0].student_id), member.name).run();
    await auditCgm(c.env.DB, {
      actorType: 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
      action: 'cgm.membership.added', entityType: 'class', entityId: classId, classId,
      context: { studentId: Number(entry[0].student_id), changes: Number(result.meta.changes) },
    });
    return c.json({ success: true, data: { added: Number(result.meta.changes) > 0 } });
  });

  app.post('/api/cgm/classes/:id/members/:memberId/:action', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const classId = Number(c.req.param('id'));
    const memberId = Number(c.req.param('memberId'));
    const action = String(c.req.param('action'));
    if (!['remove', 'suspend', 'restore'].includes(action)) return bad(c, 'Unknown action.', 404);
    const guard = await requireClassPermission(c, member, classId, action === 'restore' ? 'approve_memberships' : 'remove_students');
    if (!guard.ok) return guard.response;
    const rows = await asRows<any>(c.env.DB.prepare(
      'SELECT * FROM cgm_class_members WHERE id = ? AND class_id = ?'
    ).bind(memberId, classId));
    const membership = rows[0];
    if (!membership) return bad(c, 'Membership not found.', 404);
    const body = await readBody(c);
    const reason = cleanOrNull(body.reason, 500);
    if (action === 'remove') {
      await c.env.DB.prepare(
        `UPDATE cgm_class_members SET status = 'removed', removed_at = CURRENT_TIMESTAMP, removal_reason = ? WHERE id = ?`
      ).bind(reason, memberId).run();
      // Leaving a class never deletes the identity or the other memberships.
    } else if (action === 'suspend') {
      await c.env.DB.prepare(`UPDATE cgm_class_members SET status = 'suspended' WHERE id = ?`).bind(memberId).run();
      await revokeStudentSessions(c.env.DB, Number(membership.student_id));
    } else {
      await c.env.DB.prepare(`UPDATE cgm_class_members SET status = 'active' WHERE id = ?`).bind(memberId).run();
    }
    await auditCgm(c.env.DB, {
      actorType: 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
      action: `cgm.membership.${action}`, entityType: 'membership', entityId: memberId, classId,
      context: { studentId: Number(membership.student_id), reason },
    });
    await notifyStudent(c.env.DB, Number(membership.student_id), 'membership',
      action === 'remove' ? 'Removed from class' : action === 'suspend' ? 'Class membership suspended' : 'Class membership restored',
      reason || `Your membership in this class was ${action === 'restore' ? 'restored' : `${action}d`}.`);
    return c.json({ success: true });
  });

  app.get('/api/cgm/classes/:id/membership-requests', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const classId = Number(c.req.param('id'));
    const guard = await requireClassPermission(c, member, classId, 'approve_memberships');
    if (!guard.ok) return guard.response;
    const rows = await asRows<any>(c.env.DB.prepare(
      `SELECT r.*, s.full_name, s.index_number, s.status AS student_status
       FROM cgm_membership_requests r JOIN cgm_students s ON s.id = r.student_id
       WHERE r.class_id = ? AND r.status = 'pending' ORDER BY r.created_at DESC LIMIT 200`
    ).bind(classId));
    return c.json({
      success: true,
      data: rows.map((row) => ({
        id: Number(row.id), studentId: Number(row.student_id), fullName: row.full_name,
        indexNumber: row.index_number, reason: row.reason, createdAt: row.created_at,
        studentStatus: row.student_status,
      })),
    });
  });

  const reviewMembershipRequest = async (c: any, classId: number, requestId: number, approve: boolean, reason: string | null) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const guard = await requireClassPermission(c, member, classId, 'approve_memberships');
    if (!guard.ok) return guard.response;
    const rows = await asRows<any>(c.env.DB.prepare(
      `SELECT r.*, s.full_name FROM cgm_membership_requests r JOIN cgm_students s ON s.id = r.student_id
       WHERE r.id = ? AND r.class_id = ? AND r.status = 'pending'`
    ).bind(requestId, classId));
    const request = rows[0];
    if (!request) return bad(c, 'Membership request not found or already reviewed.', 404);
    await c.env.DB.prepare(
      `UPDATE cgm_membership_requests SET status = ?, reviewed_by_profile_id = ?, reviewer_label = ?, review_reason = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(approve ? 'approved' : 'rejected', member.profileId, member.name, reason, requestId).run();
    if (approve) {
      await c.env.DB.prepare(
        `INSERT OR IGNORE INTO cgm_class_members (class_id, student_id, added_via, added_by_label) VALUES (?, ?, 'request', ?)`
      ).bind(classId, Number(request.student_id), member.name).run();
    }
    await notifyStudent(c.env.DB, Number(request.student_id), 'membership',
      approve ? 'Membership approved' : 'Membership request declined',
      approve ? 'Your membership request was approved. Welcome!' : reason || 'Your membership request was declined.');
    await auditCgm(c.env.DB, {
      actorType: 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
      action: approve ? 'cgm.membership.approved' : 'cgm.membership.rejected',
      entityType: 'membership_request', entityId: requestId, classId,
    });
    return c.json({ success: true });
  };

  app.post('/api/cgm/classes/:id/membership-requests/:requestId/approve', async (c: any) => {
    const body = await readBody(c);
    return reviewMembershipRequest(c, Number(c.req.param('id')), Number(c.req.param('requestId')), true, cleanOrNull(body.reason, 500));
  });

  app.post('/api/cgm/classes/:id/membership-requests/:requestId/reject', async (c: any) => {
    const body = await readBody(c);
    return reviewMembershipRequest(c, Number(c.req.param('id')), Number(c.req.param('requestId')), false, cleanOrNull(body.reason, 500));
  });

  app.get('/api/cgm/classes/:id/profile-changes', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const classId = Number(c.req.param('id'));
    const guard = await requireClassPermission(c, member, classId, 'review_profile_changes');
    if (!guard.ok) return guard.response;
    const rows = await asRows<any>(c.env.DB.prepare(
      `SELECT pcr.*, s.full_name, s.index_number FROM cgm_profile_change_requests pcr
       JOIN cgm_class_members cm ON cm.student_id = pcr.student_id AND cm.class_id = ? AND cm.status = 'active'
       JOIN cgm_students s ON s.id = pcr.student_id
       WHERE pcr.status = 'pending' ORDER BY pcr.created_at DESC LIMIT 200`
    ).bind(classId));
    return c.json({
      success: true,
      data: rows.map((row) => ({
        id: Number(row.id), studentId: Number(row.student_id), fullName: row.full_name,
        indexNumber: row.index_number, field: row.field, oldValue: row.old_value,
        newValue: row.new_value, reason: row.reason, createdAt: row.created_at,
      })),
    });
  });

  const reviewProfileChange = async (c: any, classId: number, requestId: number, approve: boolean, reviewReason: string | null) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const guard = await requireClassPermission(c, member, classId, 'review_profile_changes');
    if (!guard.ok) return guard.response;
    const rows = await asRows<any>(c.env.DB.prepare(
      `SELECT pcr.*, s.full_name FROM cgm_profile_change_requests pcr JOIN cgm_students s ON s.id = pcr.student_id
       WHERE pcr.id = ? AND pcr.status = 'pending'`
    ).bind(requestId));
    const request = rows[0];
    if (!request) return bad(c, 'Change request not found or already reviewed.', 404);
    // The reviewer must be allowed to act on this student's class scope.
    const inClass = await asRows<{ id: number }>(c.env.DB.prepare(
      `SELECT id FROM cgm_class_members WHERE class_id = ? AND student_id = ? AND status = 'active'`
    ).bind(classId, Number(request.student_id)));
    if (!inClass[0]) return bad(c, 'This student is not an active member of your class.', 403);

    await c.env.DB.prepare(
      `UPDATE cgm_profile_change_requests SET status = ?, reviewed_by_profile_id = ?, reviewer_label = ?,
       review_reason = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(approve ? 'approved' : 'rejected', member.profileId, member.name, reviewReason, requestId).run();
    if (approve) {
      const column = String(request.field);
      const valueMap: Record<string, string | null> = { [column]: String(request.new_value) };
      const updates: string[] = ['updated_at = CURRENT_TIMESTAMP'];
      const values: any[] = [];
      for (const [field, value] of Object.entries(valueMap)) {
        if (field === 'phone') {
          updates.push('phone = ?', 'phone_key = ?');
          values.push(value, value ? phoneKey(value) : null);
        } else if (field === 'university_id') {
          updates.push('university_id = ?', 'university_id_key = ?');
          values.push(value, value ? lookupKey(value) : null);
        } else {
          updates.push(`${field} = ?`);
          values.push(value);
        }
      }
      values.push(Number(request.student_id));
      await c.env.DB.prepare(`UPDATE cgm_students SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
    }
    await notifyStudent(c.env.DB, Number(request.student_id), 'profile',
      approve ? 'Profile change approved' : 'Profile change declined',
      approve ? `Your ${String(request.field).replace('_', ' ')} was updated.` : reviewReason || `Your ${String(request.field).replace('_', ' ')} change was declined.`);
    await auditCgm(c.env.DB, {
      actorType: 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
      action: approve ? 'cgm.profile_change.approved' : 'cgm.profile_change.rejected',
      entityType: 'profile_change', entityId: requestId, classId,
      context: { field: request.field },
    });
    return c.json({ success: true });
  };

  app.post('/api/cgm/classes/:id/profile-changes/:requestId/approve', async (c: any) => {
    const body = await readBody(c);
    return reviewProfileChange(c, Number(c.req.param('id')), Number(c.req.param('requestId')), true, cleanOrNull(body.reviewReason, 500));
  });

  app.post('/api/cgm/classes/:id/profile-changes/:requestId/reject', async (c: any) => {
    const body = await readBody(c);
    return reviewProfileChange(c, Number(c.req.param('id')), Number(c.req.param('requestId')), false, cleanOrNull(body.reviewReason, 500));
  });

  // -------------------------------------------------------------------------
  // Invitations
  // -------------------------------------------------------------------------
  app.get('/api/cgm/classes/:id/invitations', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const classId = Number(c.req.param('id'));
    const guard = await requireClassPermission(c, member, classId, 'manage_invitations');
    if (!guard.ok) return guard.response;
    const rows = await asRows<any>(c.env.DB.prepare(
      `SELECT i.*, s.full_name AS bound_name FROM cgm_invitations i
       LEFT JOIN cgm_students s ON s.id = i.bound_student_id
       WHERE i.class_id = ? ORDER BY i.id DESC LIMIT 100`
    ).bind(classId));
    return c.json({
      success: true,
      data: rows.map((row) => ({
        id: Number(row.id), kind: row.kind, code: row.code, expiresAt: row.expires_at,
        maxUses: row.max_uses === null ? null : Number(row.max_uses), useCount: Number(row.use_count),
        revoked: Boolean(row.revoked_at), disabled: Boolean(row.disabled_at),
        boundStudent: row.bound_name || (row.bound_identifier_key ? row.bound_identifier_key : null),
        creator: row.creator_label, createdAt: row.created_at, lastUsedAt: row.last_used_at,
      })),
    });
  });

  app.post('/api/cgm/classes/:id/invitations', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const classId = Number(c.req.param('id'));
    const guard = await requireClassPermission(c, member, classId, 'manage_invitations');
    if (!guard.ok) return guard.response;
    const klass = await classCore(c.env.DB, classId);
    if (!klass) return bad(c, 'Class not found.', 404);
    if (klass.status !== 'active') return bad(c, 'Invitations stay inactive until PHANTOM approves the class.', 409);
    const body = await readBody(c);
    const kind = String(body.kind || 'general');
    if (!['general', 'individual'].includes(kind)) return bad(c, 'Choose a general or individual invitation.');
    const expiresAt = body.expiresAt ? new Date(String(body.expiresAt)) : null;
    if (expiresAt && Number.isNaN(expiresAt.getTime())) return bad(c, 'The expiry date is invalid.');
    const maxUses = body.maxUses ? Math.max(1, Math.min(5000, Math.floor(Number(body.maxUses)))) : null;

    const token = randomToken();
    const code = kind === 'general'
      ? `${(klass.code || 'CRX').replace(/[^A-Z0-9]/gi, '').slice(-6).toUpperCase()}-${randomToken().slice(0, 6).toUpperCase()}`
      : null;
    let boundStudentId: number | null = null;
    let boundRosterEntryId: number | null = null;
    let boundIdentifierKey: string | null = null;
    if (kind === 'individual') {
      const rosterEntryId = Number(body.rosterEntryId) || null;
      const studentId = Number(body.studentId) || null;
      if (studentId) {
        const found = await asRows<{ id: number }>(c.env.DB.prepare(
          'SELECT id FROM cgm_students WHERE id = ?'
        ).bind(studentId));
        if (!found[0]) return bad(c, 'Student not found.', 404);
        boundStudentId = studentId;
      } else if (rosterEntryId) {
        const entry = await asRows<any>(c.env.DB.prepare(
          'SELECT id, index_number_key, university_id_key, phone_key, student_id FROM cgm_roster_entries WHERE id = ? AND class_id = ?'
        ).bind(rosterEntryId, classId));
        if (!entry[0]) return bad(c, 'Roster entry not found.', 404);
        if (entry[0].student_id) { boundStudentId = Number(entry[0].student_id); }
        boundRosterEntryId = rosterEntryId;
        boundIdentifierKey = entry[0].index_number_key;
      } else {
        return bad(c, 'Bind the individual invitation to a roster entry or a student.');
      }
    }

    const result = await c.env.DB.prepare(
      `INSERT INTO cgm_invitations
       (class_id, kind, code, token_hash, created_by_profile_id, creator_label, bound_student_id, bound_roster_entry_id, bound_identifier_key, expires_at, max_uses)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(classId, kind, code, await sha256Hex(`cgm-invite:${token}`), member.profileId, member.name,
      boundStudentId, boundRosterEntryId, boundIdentifierKey,
      expiresAt ? expiresAt.toISOString().replace('T', ' ').slice(0, 19) : null,
      maxUses).run();
    await auditCgm(c.env.DB, {
      actorType: 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
      action: 'cgm.invitation.created', entityType: 'class', entityId: classId, classId,
      context: { kind, invitationId: Number(result.meta.last_row_id) },
    });
    return c.json({
      success: true,
      data: {
        id: Number(result.meta.last_row_id), kind, code,
        // The raw token is returned exactly once, at creation. Only its hash is stored.
        token,
        link: `${new URL(c.req.url).origin}/#class-invite/${encodeURIComponent(code || token)}`,
      },
    });
  });

  const invitationAction = async (c: any, action: 'revoke' | 'disable' | 'enable' | 'regenerate') => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const invitationId = Number(c.req.param('id'));
    const rows = await asRows<{ id: number; class_id: number }>(c.env.DB.prepare(
      'SELECT id, class_id FROM cgm_invitations WHERE id = ?'
    ).bind(invitationId));
    if (!rows[0]) return bad(c, 'Invitation not found.', 404);
    const guard = await requireClassPermission(c, member, Number(rows[0].class_id), 'manage_invitations');
    if (!guard.ok) return guard.response;
    if (action === 'revoke') {
      await c.env.DB.prepare('UPDATE cgm_invitations SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?').bind(invitationId).run();
    } else if (action === 'disable') {
      await c.env.DB.prepare('UPDATE cgm_invitations SET disabled_at = CURRENT_TIMESTAMP WHERE id = ?').bind(invitationId).run();
    } else if (action === 'enable') {
      await c.env.DB.prepare('UPDATE cgm_invitations SET disabled_at = NULL WHERE id = ?').bind(invitationId).run();
    } else {
      const token = randomToken();
      // A leaked code must die with regeneration, so general invitations get a
      // fresh code as well as a fresh token; individual ones keep no code.
      const classRow = await asRows<{ code: string }>(c.env.DB.prepare('SELECT code FROM cgm_classes WHERE id = ?').bind(Number(rows[0].class_id)));
      const freshCode = classRow[0]
        ? `${(classRow[0].code || 'CRX').replace(/[^A-Z0-9]/gi, '').slice(-6).toUpperCase()}-${randomToken().slice(0, 6).toUpperCase()}`
        : null;
      await c.env.DB.prepare(
        'UPDATE cgm_invitations SET token_hash = ?, code = COALESCE(?, code), revoked_at = NULL, disabled_at = NULL, use_count = 0 WHERE id = ?'
      ).bind(await sha256Hex(`cgm-invite:${token}`), freshCode, invitationId).run();
      await auditCgm(c.env.DB, {
        actorType: 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
        action: 'cgm.invitation.regenerated', entityType: 'invitation', entityId: invitationId,
        classId: Number(rows[0].class_id),
      });
      return c.json({
        success: true,
        data: {
          token, ...(freshCode ? { code: freshCode } : {}),
          link: `${new URL(c.req.url).origin}/#class-invite/${encodeURIComponent(freshCode || token)}`,
        },
      });
    }
    await auditCgm(c.env.DB, {
      actorType: 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
      action: `cgm.invitation.${action}d`, entityType: 'invitation', entityId: invitationId,
      classId: Number(rows[0].class_id),
    });
    return c.json({ success: true });
  };

  app.post('/api/cgm/invitations/:id/revoke', async (c: any) => invitationAction(c, 'revoke'));
  app.post('/api/cgm/invitations/:id/disable', async (c: any) => invitationAction(c, 'disable'));
  app.post('/api/cgm/invitations/:id/enable', async (c: any) => invitationAction(c, 'enable'));
  app.post('/api/cgm/invitations/:id/regenerate', async (c: any) => invitationAction(c, 'regenerate'));
};
