/**
 * CODE Rx SOCIETY — CGM organizer PASSKEY DESK.
 *
 *   GET    /api/cgm/classes/:id/passkeys                 the desk: every member, every try, every link
 *   POST   /api/cgm/classes/:id/passkeys/:studentId/unlock    clear a sign-in lockout
 *   POST   /api/cgm/classes/:id/passkeys/:studentId/rotate    issue a new passkey, shown once
 *   POST   /api/cgm/classes/:id/passkeys/links                generate a one-time self-service link
 *   POST   /api/cgm/classes/:id/passkeys/links/:linkId/revoke revoke a link that has not been used
 *
 * The public, no-session side of those links lives in `routes-student.ts`
 * (`/api/cgm/passkey-links/:code*`), because the student is not signed in.
 *
 * Rules this surface keeps, in the module's own terms:
 *   - A passkey is ALWAYS system-generated. Nothing here accepts a passkey the
 *     organizer typed, so two students can never end up sharing one.
 *   - Issuing a passkey is shown ONCE, to the organizer, on the spot. Only a
 *     hash is stored for verification.
 *   - A self-service link is single-use by construction: collecting it is a
 *     conditional UPDATE, so a double click (or two people) can only ever mint
 *     one passkey. Organizers regulate links (expiry, revocation) and can see,
 *     per member, which one is still live.
 *   - Every action lands in the audit trail with the organizer's real name.
 */

import type { Hono } from 'hono';
import { allocateStudentPasskey } from './core';
import { hashPassword } from '../auth';
import { sha256Hex } from '../vault';
import {
  asRows,
  auditCgm,
  bad,
  clean,
  cleanOrNull,
  ensurePasskeyResetSchema,
  memberFromRequest,
  notifyStudent,
  readBody,
  requireClassPermission,
  revokeStudentSessions,
  studentLockInfo,
  throttle,
} from './service';

type CgmApp = Hono<any>;

const LINK_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O/0/I/1

/** A link code shaped for reading out loud or typing: K7QM-3XTD-9B2F-H8YR. */
const newLinkCode = () => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let index = 0; index < 16; index += 1) {
    out += LINK_CODE_ALPHABET[bytes[index] % LINK_CODE_ALPHABET.length];
    if (index % 4 === 3 && index < 15) out += '-';
  }
  return out;
};
const normaliseLinkCode = (raw: unknown) => String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
/** Links are stored only as a hash: the raw code exists on the organizer's screen once. */
const linkCodeHash = (raw: unknown) => sha256Hex(`cgm-passkey-link:${normaliseLinkCode(raw)}`);

const DEFAULT_LINK_HOURS = 72;

/** One row per active member: their identity, their passkey state, their live link. */
const PASSKEY_DESK_SQL = `
  SELECT s.id AS student_id, s.full_name, s.index_number, s.phone, s.status AS student_status,
         s.passkey_prefix, s.passkey_suffix, s.passkey_issued_at, s.passkey_reset_at,
         s.failed_attempts, s.locked_until,
         (SELECT COUNT(*) FROM cgm_student_sessions ss
           WHERE ss.student_id = s.id AND ss.revoked_at IS NULL
             AND ss.expires_at > strftime('%Y-%m-%d %H:%M:%S', 'now')) AS live_sessions,
         (SELECT MAX(a.created_at) FROM cgm_audit a
           WHERE a.actor_student_id = s.id AND a.action = 'cgm.student.login') AS last_login_at,
         (SELECT MAX(a.created_at) FROM cgm_audit a
           WHERE a.entity_type = 'student' AND a.entity_id = CAST(s.id AS TEXT)
             AND a.action IN ('cgm.passkey.generated','cgm.passkey.link_redeemed','cgm.passkey.rotated_by_organizer')) AS last_issued_at,
         r.id AS request_id, r.status AS request_status, r.source AS request_source, r.requested_at,
         l.id AS link_id, l.code_hint AS link_hint, l.expires_at AS link_expires_at,
         l.created_at AS link_created_at, l.created_by_label AS link_created_by
  FROM cgm_class_members m
  JOIN cgm_students s ON s.id = m.student_id
  LEFT JOIN cgm_passkey_requests r ON r.id = (
    SELECT r2.id FROM cgm_passkey_requests r2
    WHERE r2.student_id = s.id AND r2.class_id = m.class_id
      AND r2.status IN ('pending','approved')
    ORDER BY r2.id DESC LIMIT 1
  )
  LEFT JOIN cgm_passkey_links l ON l.id = (
    SELECT l2.id FROM cgm_passkey_links l2
    WHERE l2.student_id = s.id AND l2.class_id = m.class_id
      AND l2.used_at IS NULL AND l2.revoked_at IS NULL
      AND l2.expires_at > strftime('%Y-%m-%d %H:%M:%S', 'now')
    ORDER BY l2.id DESC LIMIT 1
  )
  WHERE m.class_id = ? AND m.status = 'active'
  ORDER BY s.full_name COLLATE NOCASE
  LIMIT 1000
`;

const linkIsLive = (row: any) => {
  if (!row?.link_id || row.used_at || row.revoked_at) return false;
  if (!row.expires_at) return true;
  const at = new Date(String(row.expires_at).replace(' ', 'T') + 'Z').getTime();
  return Number.isFinite(at) ? at > Date.now() : true;
};

export const registerCgmPasskeyRoutes = (app: CgmApp) => {
  // -------------------------------------------------------------------------
  // The desk
  // -------------------------------------------------------------------------
  app.get('/api/cgm/classes/:id/passkeys', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const classId = Number(c.req.param('id'));
    const guard = await requireClassPermission(c, member, classId, 'view_roster');
    if (!guard.ok) return guard.response;
    await ensurePasskeyResetSchema(c.env.DB);
    await ensurePasskeyLinkSchema(c.env.DB);

    const rows = await asRows<any>(c.env.DB.prepare(PASSKEY_DESK_SQL).bind(classId));
    const klass = (await asRows<any>(c.env.DB.prepare(
      'SELECT passkey_prefix FROM cgm_classes WHERE id = ?'
    ).bind(classId)))[0] || {};

    const students = rows.map((row) => {
      const lock = studentLockInfo({ failed_attempts: Number(row.failed_attempts || 0), locked_until: row.locked_until });
      return {
        studentId: Number(row.student_id),
        fullName: row.full_name || '',
        indexNumber: row.index_number || '',
        phone: row.phone || null,
        accountStatus: String(row.student_status || ''),
        passkeyHint: row.passkey_suffix ? `${String(row.passkey_prefix || 'rx30')}${String(row.passkey_suffix).slice(0, 1)}…` : null,
        passkeyIssuedAt: row.passkey_issued_at || null,
        passkeyResetAt: row.passkey_reset_at || null,
        lastIssuedAt: row.last_issued_at || null,
        lastLoginAt: row.last_login_at || null,
        liveSessions: Number(row.live_sessions || 0),
        failedAttempts: Number(row.failed_attempts || 0),
        lockedUntil: lock ? lock.toISOString() : null,
        request: row.request_id ? {
          id: Number(row.request_id), status: String(row.request_status),
          source: String(row.request_source || 'profile'), requestedAt: row.requested_at || null,
        } : null,
        link: row.link_id ? {
          id: Number(row.link_id), hint: row.link_hint || null,
          expiresAt: row.link_expires_at || null, createdAt: row.link_created_at || null,
          createdBy: row.link_created_by || null,
        } : null,
      };
    });

    // "All related matters and info and changes": the recent passkey history,
    // newest first, with real names and real times.
    const history = await asRows<any>(c.env.DB.prepare(
      `SELECT a.id, a.action, a.actor_type, a.actor_label, a.entity_id, a.context_json, a.created_at,
              s.full_name, s.index_number
       FROM cgm_audit a
       LEFT JOIN cgm_students s ON CAST(s.id AS TEXT) = a.entity_id
       WHERE a.class_id = ? AND (a.action LIKE 'cgm.passkey.%' OR a.action LIKE 'cgm.student.%')
       ORDER BY a.id DESC LIMIT 40`
    ).bind(classId));

    return c.json({
      success: true,
      data: {
        classId,
        passkeyPrefix: String(klass.passkey_prefix || 'rx30'),
        canIssue: member.isPhantom || guard.context.permissions.has('edit_roster'),
        canRegulate: member.isPhantom || guard.context.permissions.has('edit_roster'),
        counts: {
          members: students.length,
          pendingRequests: students.filter((row) => row.request?.status === 'pending').length,
          approvedRequests: students.filter((row) => row.request?.status === 'approved').length,
          locked: students.filter((row) => Boolean(row.lockedUntil)).length,
          liveLinks: students.filter((row) => Boolean(row.link)).length,
        },
        students,
        history: history.map((row) => ({
          id: Number(row.id), entityId: Number(row.entity_id) || null,
          action: String(row.action), actorType: String(row.actor_type || ''),
          actorLabel: row.actor_label || '', at: row.created_at || null,
          fullName: row.full_name || null, indexNumber: row.index_number || null,
          context: (() => { try { return JSON.parse(row.context_json || '{}'); } catch { return {}; } })(),
        })),
      },
    });
  });

  // -------------------------------------------------------------------------
  // Unlock a student who is locked out by failed sign-in attempts
  // -------------------------------------------------------------------------
  app.post('/api/cgm/classes/:id/passkeys/:studentId/unlock', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const classId = Number(c.req.param('id'));
    const studentId = Number(c.req.param('studentId'));
    const guard = await requireClassPermission(c, member, classId, 'edit_roster');
    if (!guard.ok) return guard.response;
    const inClass = await asRows<{ id: number; full_name: string }>(c.env.DB.prepare(
      `SELECT s.id, s.full_name FROM cgm_class_members m JOIN cgm_students s ON s.id = m.student_id
       WHERE m.class_id = ? AND m.student_id = ? AND m.status = 'active'`
    ).bind(classId, studentId));
    const student = inClass[0];
    if (!student) return bad(c, 'That student is not an active member of this class.', 404);
    await c.env.DB.prepare(
      'UPDATE cgm_students SET failed_attempts = 0, locked_until = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(studentId).run();
    await auditCgm(c.env.DB, {
      actorType: 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
      action: 'cgm.passkey.unlocked', entityType: 'student', entityId: studentId, classId,
    });
    await notifyStudent(c.env.DB, studentId, 'security', 'Your sign-in lock was cleared',
      `${member.name} cleared the temporary lock on your account. Sign in with your usual passkey — if you have forgotten it, ask for a one-time reset link.`);
    return c.json({ success: true, data: { message: `Unlocked — ${student.full_name} can sign in again.` } });
  });

  // -------------------------------------------------------------------------
  // Issue a new passkey right now (shown once to the organizer)
  // -------------------------------------------------------------------------
  app.post('/api/cgm/classes/:id/passkeys/:studentId/rotate', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const classId = Number(c.req.param('id'));
    const studentId = Number(c.req.param('studentId'));
    const guard = await requireClassPermission(c, member, classId, 'edit_roster');
    if (!guard.ok) return guard.response;
    const body = await readBody<any>(c);
    const reason = cleanOrNull(body.reason, 300);
    const rows = await asRows<any>(c.env.DB.prepare(
      `SELECT s.id, s.full_name, s.index_number, cl.passkey_prefix
       FROM cgm_class_members m
       JOIN cgm_students s ON s.id = m.student_id
       JOIN cgm_classes cl ON cl.id = m.class_id
       WHERE m.class_id = ? AND m.student_id = ? AND m.status = 'active'`
    ).bind(classId, studentId));
    const student = rows[0];
    if (!student) return bad(c, 'That student is not an active member of this class.', 404);

    const classPrefix = String(student.passkey_prefix || 'rx30');
    const allocation = await allocateStudentPasskey(c.env.DB);
    const issued = `${classPrefix}${allocation.suffix}`;
    await c.env.DB.prepare(
      `UPDATE cgm_students SET passkey_verifier = ?, passkey_sequence = ?, passkey_suffix = ?, passkey_prefix = ?,
         passkey_issued_at = CURRENT_TIMESTAMP, passkey_reset_at = CURRENT_TIMESTAMP,
         failed_attempts = 0, locked_until = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(await hashPassword(issued), allocation.sequence, allocation.suffix, classPrefix, studentId).run();
    // The old passkey dies now: everything signed in with it is signed out.
    await revokeStudentSessions(c.env.DB, studentId);
    // Any open request/link for this person is finished — nothing is left
    // behind that could mint a second passkey.
    await c.env.DB.prepare(
      `UPDATE cgm_passkey_requests SET status = 'completed', handled_member_id = ?, handled_label = ?,
         handled_at = COALESCE(handled_at, CURRENT_TIMESTAMP) WHERE student_id = ? AND class_id = ? AND status IN ('pending','approved')`
    ).bind(member.profileId ?? null, member.name, studentId, classId).run();
    await c.env.DB.prepare(
      `UPDATE cgm_passkey_links SET revoked_at = CURRENT_TIMESTAMP, revoked_by_label = ?, revoked_reason = 'Replaced by a passkey issued by the organizer'
       WHERE student_id = ? AND class_id = ? AND used_at IS NULL AND revoked_at IS NULL`
    ).bind(member.name, studentId, classId).run();

    await auditCgm(c.env.DB, {
      actorType: 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
      action: 'cgm.passkey.rotated_by_organizer', entityType: 'student', entityId: studentId, classId,
      context: { reason, passkeyHint: `${classPrefix}${allocation.suffix.slice(0, 1)}…` },
    });
    await notifyStudent(c.env.DB, studentId, 'security', 'Your passkey was changed',
      `${member.name} issued you a new passkey and gave it to you directly. Your old passkey no longer works and other devices were signed out.`);
    return c.json({ success: true, data: {
      passkey: issued,
      fullName: student.full_name,
      indexNumber: student.index_number,
      message: `New passkey issued for ${student.full_name}. Copy it now — it is shown only once, and their old passkey stopped working.`,
    } });
  });

  // -------------------------------------------------------------------------
  // One-time self-service links
  // -------------------------------------------------------------------------
  app.post('/api/cgm/classes/:id/passkeys/links', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    if (!throttle(c, 40, 3600)) return bad(c, 'Too many links. Try again shortly.', 429);
    const classId = Number(c.req.param('id'));
    const guard = await requireClassPermission(c, member, classId, 'edit_roster');
    if (!guard.ok) return guard.response;
    await ensurePasskeyLinkSchema(c.env.DB);
    const body = await readBody<any>(c);
    const studentIds = (Array.isArray(body.studentIds) ? body.studentIds : [body.studentId])
      .map((value: unknown) => Number(value))
      .filter((value: number) => Number.isInteger(value) && value > 0);
    if (!studentIds.length) return bad(c, 'Choose the member this link is for.', 400);
    if (studentIds.length > 50) return bad(c, 'Pick at most 50 members at a time.', 400);
    const requestedHours = Number(body.expiresInHours);
    const hours = Number.isFinite(requestedHours) && requestedHours > 0
      ? Math.min(24 * 30, Math.max(1, Math.round(requestedHours)))
      : DEFAULT_LINK_HOURS;
    const note = cleanOrNull(body.note, 200);

    const placeholders = studentIds.map(() => '?').join(', ');
    const allowed = await asRows<any>(c.env.DB.prepare(
      `SELECT s.id, s.full_name, s.index_number
       FROM cgm_class_members m JOIN cgm_students s ON s.id = m.student_id
       WHERE m.class_id = ? AND m.status = 'active' AND s.id IN (${placeholders})`
    ).bind(classId, ...studentIds));
    if (!allowed.length) return bad(c, 'Those students are not active members of this class.', 404);

    const origin = originFor(c);
    const created: any[] = [];
    for (const student of allowed) {
      const code = newLinkCode();
      // One live link per member per class: issuing a new one retires the old
      // one, so an organizer can never have two open doors for one person.
      await c.env.DB.prepare(
        `UPDATE cgm_passkey_links SET revoked_at = CURRENT_TIMESTAMP, revoked_by_label = ?, revoked_reason = 'Superseded by a newer link'
         WHERE student_id = ? AND class_id = ? AND used_at IS NULL AND revoked_at IS NULL`
      ).bind(member.name, Number(student.id), classId).run();
      const inserted = await c.env.DB.prepare(
        `INSERT INTO cgm_passkey_links (class_id, student_id, code_hash, code_hint, expires_at, created_by_profile_id, created_by_label, note)
         VALUES (?, ?, ?, ?, datetime('now', ?), ?, ?, ?)`
      ).bind(
        classId, Number(student.id), await linkCodeHash(code), code.slice(-9),
        `+${hours} hours`, member.profileId ?? null, member.name, note,
      ).run();
      const linkId = Number(inserted.meta.last_row_id);
      await auditCgm(c.env.DB, {
        actorType: 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
        action: 'cgm.passkey.link_created', entityType: 'student', entityId: Number(student.id), classId,
        context: { linkId, expiresInHours: hours },
      });
      await notifyStudent(c.env.DB, Number(student.id), 'security', 'A one-time passkey link was created for you',
        `${member.name} created a one-time link that lets you generate a new passkey yourself — no approval needed. `
        + `It works once and expires in ${hours} hour(s). Ask your organizer for it if you need it.`);
      created.push({
        linkId, studentId: Number(student.id), fullName: student.full_name, indexNumber: student.index_number,
        url: `${origin}/#passkey-link/${code}`, code, expiresInHours: hours,
      });
    }
    return c.json({ success: true, data: {
      links: created,
      expiresInHours: hours,
      message: created.length === 1
        ? `One-time link ready for ${created[0].fullName}. It works once and expires in ${hours} hour(s).`
        : `${created.length} one-time links ready — each works once and expires in ${hours} hour(s).`,
    } });
  });

  app.get('/api/cgm/classes/:id/passkeys/links', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const classId = Number(c.req.param('id'));
    const guard = await requireClassPermission(c, member, classId, 'view_roster');
    if (!guard.ok) return guard.response;
    await ensurePasskeyLinkSchema(c.env.DB);
    const rows = await asRows<any>(c.env.DB.prepare(
      `SELECT l.id, l.student_id, l.code_hint, l.expires_at, l.created_at, l.created_by_label, l.note,
              l.used_at, l.revoked_at, l.revoked_by_label, l.revoked_reason,
              s.full_name, s.index_number
       FROM cgm_passkey_links l JOIN cgm_students s ON s.id = l.student_id
       WHERE l.class_id = ? ORDER BY l.id DESC LIMIT 60`
    ).bind(classId));
    return c.json({ success: true, data: rows.map((row) => ({
      id: Number(row.id), studentId: Number(row.student_id), fullName: row.full_name, indexNumber: row.index_number,
      hint: row.code_hint || null, expiresAt: row.expires_at || null, createdAt: row.created_at || null,
      createdBy: row.created_by_label || null, note: row.note || null,
      usedAt: row.used_at || null, revokedAt: row.revoked_at || null,
      revokedBy: row.revoked_by_label || null, revokedReason: row.revoked_reason || null,
      state: row.used_at ? 'used' : row.revoked_at ? 'revoked'
        : (row.expires_at && new Date(String(row.expires_at).replace(' ', 'T') + 'Z').getTime() < Date.now()) ? 'expired' : 'live',
    })) });
  });

  app.post('/api/cgm/classes/:id/passkeys/links/:linkId/revoke', async (c: any) => {
    const member = await memberFromRequest(c);
    if (!member) return c.json({ success: false, error: 'Sign in first.' }, 401);
    const classId = Number(c.req.param('id'));
    const guard = await requireClassPermission(c, member, classId, 'edit_roster');
    if (!guard.ok) return guard.response;
    await ensurePasskeyLinkSchema(c.env.DB);
    const linkId = Number(c.req.param('linkId'));
    const body = await readBody<any>(c);
    const reason = cleanOrNull(body.reason, 300) || 'Revoked by the organizer';
    const rows = await asRows<any>(c.env.DB.prepare(
      `SELECT l.id, l.student_id, l.used_at, l.revoked_at, s.full_name FROM cgm_passkey_links l
       JOIN cgm_students s ON s.id = l.student_id WHERE l.id = ? AND l.class_id = ?`
    ).bind(linkId, classId));
    const link = rows[0];
    if (!link) return bad(c, 'Link not found.', 404);
    if (link.used_at) return bad(c, 'That link was already used — there is nothing left to revoke.', 409);
    if (link.revoked_at) return bad(c, 'That link was already revoked.', 409);
    const result = await c.env.DB.prepare(
      `UPDATE cgm_passkey_links SET revoked_at = CURRENT_TIMESTAMP, revoked_by_label = ?, revoked_by_profile_id = ?,
         revoked_reason = ? WHERE id = ? AND used_at IS NULL AND revoked_at IS NULL`
    ).bind(member.name, member.profileId ?? null, reason, linkId).run();
    if (!(Number((result as any)?.meta?.changes || 0) > 0)) return bad(c, 'That link was already used or revoked.', 409);
    await auditCgm(c.env.DB, {
      actorType: 'organizer', actorLabel: member.name, actorProfileId: member.profileId,
      action: 'cgm.passkey.link_revoked', entityType: 'student', entityId: Number(link.student_id), classId,
      context: { linkId, reason },
    });
    return c.json({ success: true, data: { message: `Link revoked — it can no longer be used by ${link.full_name}.` } });
  });
};

/** `https://host` of the current request, used to build absolute share links. */
const originFor = (c: any) => {
  try { return new URL(c.req.url).origin; } catch { return ''; }
};

// ---------------------------------------------------------------------------
// Schema (additive + idempotent, checked once per isolate)
// ---------------------------------------------------------------------------

let passkeyLinkSchemaChecked = false;

export const ensurePasskeyLinkSchema = async (db: D1Database) => {
  if (passkeyLinkSchemaChecked) return;
  let complete = true;
  try {
    await db.prepare(
      `CREATE TABLE IF NOT EXISTS cgm_passkey_links (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         class_id INTEGER NOT NULL,
         student_id INTEGER NOT NULL,
         code_hash TEXT NOT NULL UNIQUE,
         code_hint TEXT,
         expires_at DATETIME NOT NULL,
         note TEXT,
         created_by_profile_id INTEGER,
         created_by_label TEXT,
         created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
         used_at DATETIME,
         used_ip_hash TEXT,
         revoked_at DATETIME,
         revoked_by_profile_id INTEGER,
         revoked_by_label TEXT,
         revoked_reason TEXT
       )`
    ).run();
  } catch { complete = false; }
  for (const sql of [
    'CREATE INDEX IF NOT EXISTS idx_cgm_passkey_links_student ON cgm_passkey_links(student_id, class_id)',
    'CREATE INDEX IF NOT EXISTS idx_cgm_passkey_links_code ON cgm_passkey_links(code_hash)',
  ]) {
    // Idempotent by statement; a failure only means "retry next request".
    try { await db.prepare(sql).run(); } catch { complete = false; }
  }
  if (complete) passkeyLinkSchemaChecked = true;
};

export { linkCodeHash, normaliseLinkCode, linkIsLive, DEFAULT_LINK_HOURS };
