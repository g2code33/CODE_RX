/**
 * CODE Rx SOCIETY — CGM shared server services.
 *
 * One place for the authorization and plumbing every Class & Group route
 * composes: module feature flag, student sessions, organizer/PHANTOM
 * authorization, the module audit trail, student notifications, and small
 * request helpers. Nothing here trusts the frontend: every check re-reads the
 * database.
 */

import type { Context } from 'hono';
import type { Env } from '../../env';
import { bearerToken, hashPassword, verifyPassword, verifyToken, type JwtPayload } from '../auth';
import { getActor, randomToken, sha256Hex } from '../vault';
import { checkRateLimit } from '../rate-limit';
import { createNotification } from '../notifications';
import {
  allocateStudentPasskey,
  CLASS_PERMISSIONS,
  type ClassPermission,
  lookupKey,
  sanitizeClassSettings,
  type ClassSettings,
} from './core';

export const asRows = async <T>(statement: D1PreparedStatement): Promise<T[]> => {
  const result = await statement.all<T>();
  return result.results || [];
};

export const nowIso = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

// ---------------------------------------------------------------------------
// Module audit trail
// ---------------------------------------------------------------------------

export interface CgmAuditInput {
  actorType: 'phantom' | 'organizer' | 'student' | 'system';
  actorLabel: string;
  actorProfileId?: number | null;
  actorStudentId?: number | null;
  action: string;
  entityType: string;
  entityId?: string | number | null;
  classId?: number | null;
  activityId?: number | null;
  context?: Record<string, unknown>;
}

/** Writes the module audit row. Credentials and raw tokens never go in. */
export const auditCgm = async (db: D1Database, input: CgmAuditInput) => {
  try {
    await db.prepare(
      `INSERT INTO cgm_audit
       (actor_type, actor_label, actor_profile_id, actor_student_id, action, entity_type, entity_id, class_id, activity_id, context_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      input.actorType,
      String(input.actorLabel || '').slice(0, 160),
      input.actorProfileId ?? null,
      input.actorStudentId ?? null,
      input.action.slice(0, 120),
      input.entityType.slice(0, 80),
      input.entityId === null || input.entityId === undefined ? null : String(input.entityId).slice(0, 120),
      input.classId ?? null,
      input.activityId ?? null,
      JSON.stringify(input.context || {}).slice(0, 20_000),
    ).run();
  } catch (error) {
    console.error('[code-rx] cgm audit error:', error);
  }
};

// ---------------------------------------------------------------------------
// Student notifications
// ---------------------------------------------------------------------------

export const notifyStudent = async (
  db: D1Database,
  studentId: number | null | undefined,
  category: string,
  title: string,
  body: string,
  link?: string | null,
) => {
  if (!studentId) return;
  try {
    await db.prepare(
      'INSERT INTO cgm_student_notifications (student_id, category, title, body, link) VALUES (?, ?, ?, ?, ?)'
    ).bind(studentId, category.slice(0, 60), title.slice(0, 180), body.slice(0, 2000), link ? String(link).slice(0, 320) : null).run();
  } catch (error) {
    console.warn('[code-rx] student notification failed (non-fatal):', error);
  }
};

// ---------------------------------------------------------------------------
// Feature flag
// ---------------------------------------------------------------------------

export const classGroupsEnabled = async (db: D1Database): Promise<boolean> => {
  const rows = await asRows<{ setting_value: string }>(db.prepare(
    "SELECT setting_value FROM system_settings WHERE setting_key = 'class_groups_enabled'"
  ));
  return String(rows[0]?.setting_value ?? '1') === '1';
};

export const requireModuleEnabled = async (c: Context<{ Bindings: Env }>) => {
  if (!await classGroupsEnabled(c.env.DB)) {
    return c.json({ success: false, error: 'The Class & Group module is paused by PHANTOM.' }, 404);
  }
  return null;
};

// ---------------------------------------------------------------------------
// Student sessions — a separate namespace from Society member sessions
// ---------------------------------------------------------------------------

export const STUDENT_SESSION_HEADER = 'X-Code-Rx-Student-Session';
const STUDENT_SESSION_HASH_DOMAIN = 'code-rx:cgm-student-session:v1:';
/** Student sessions last a school term's worth of comfortable use. */
export const STUDENT_SESSION_TTL_HOURS = 72;

export const studentSessionHash = (token: string) => sha256Hex(`${STUDENT_SESSION_HASH_DOMAIN}${token}`);

export const createStudentSession = async (
  db: D1Database,
  studentId: number,
  meta: { ip?: string | null; userAgent?: string | null } = {},
): Promise<{ token: string; expiresAt: string }> => {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + STUDENT_SESSION_TTL_HOURS * 3600 * 1000)
    .toISOString().replace('T', ' ').slice(0, 19);
  await db.prepare(
    `INSERT INTO cgm_student_sessions (student_id, token_hash, expires_at, ip_hash, user_agent_hash)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(
    studentId,
    await studentSessionHash(token),
    expiresAt,
    meta.ip ? (await sha256Hex(meta.ip)).slice(0, 32) : null,
    meta.userAgent ? (await sha256Hex(meta.userAgent)).slice(0, 32) : null,
  ).run();
  return { token, expiresAt: `${expiresAt} UTC` };
};

export const revokeStudentSessions = async (db: D1Database, studentId: number) => {
  await db.prepare(
    'UPDATE cgm_student_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE student_id = ? AND revoked_at IS NULL'
  ).bind(studentId).run();
};

export interface CgmStudentRow {
  id: number;
  full_name: string;
  index_number: string;
  index_number_key: string;
  institution: string;
  institution_key: string;
  university_id: string | null;
  university_id_key: string | null;
  phone: string | null;
  phone_key: string | null;
  passkey_verifier: string | null;
  custom_fields_json?: string;
  email: string | null;
  gender: 'male' | 'female' | 'unknown';
  status: 'pending' | 'active' | 'locked' | 'archived';
  passkey_suffix: string | null;
  failed_attempts: number;
  locked_until: string | null;
  passkey_change_allowed: number;
}

/**
 * Resolves the live student for a request, or null. Liveness (expiry,
 * revocation, student status) is enforced in SQL on every request, so a
 * suspension or lock takes effect immediately.
 */
export const studentFromRequest = async (c: Context<{ Bindings: Env }>): Promise<CgmStudentRow | null> => {
  const token = c.req.header(STUDENT_SESSION_HEADER) || '';
  if (!token || token.length < 32) return null;
  const rows = await asRows<CgmStudentRow & { session_id: number }>(c.env.DB.prepare(
    `SELECT s.id, s.full_name, s.index_number, s.institution, s.institution_key, s.university_id, s.phone,
            s.email, s.gender, s.custom_fields_json, s.status, s.passkey_suffix, s.failed_attempts, s.locked_until,
            sess.id AS session_id
     FROM cgm_student_sessions sess
     JOIN cgm_students s ON s.id = sess.student_id
     WHERE sess.token_hash = ? AND sess.revoked_at IS NULL AND sess.expires_at > CURRENT_TIMESTAMP`
  ).bind(await studentSessionHash(token)));
  const row = rows[0];
  if (!row) return null;
  if (row.status !== 'active') return null;
  return row;
};

/** Standard guard for student routes. */
export const requireStudent = async (c: Context<{ Bindings: Env }>): Promise<CgmStudentRow | null> =>
  studentFromRequest(c);

// ---------------------------------------------------------------------------
// Student credential helpers
// ---------------------------------------------------------------------------

export { hashPassword, verifyPassword };

/** Verifier for the shared class entry password (never stored raw). */
export const entryPasswordVerifier = async (password: string) => hashPassword(`cgm-entry:${password}`);
export const verifyEntryPassword = async (password: string, stored: string | null) =>
  Boolean(stored) && verifyPassword(`cgm-entry:${password}`, stored as string);

/** Lockout policy for the predictable passkey space. */
export const STUDENT_MAX_FAILED_ATTEMPTS = 8;
export const STUDENT_LOCK_MINUTES = 20;

export const studentLockInfo = (row: { failed_attempts: number; locked_until: string | null }) => {
  if (!row.locked_until) return null;
  const until = new Date(`${row.locked_until.replace(' ', 'T')}Z`.endsWith('Z') ? `${row.locked_until.replace(' ', 'T')}Z` : row.locked_until);
  if (Number.isNaN(until.getTime())) return null;
  return until.getTime() > Date.now() ? until : null;
};

// ---------------------------------------------------------------------------
// Member (organizer) authorization
// ---------------------------------------------------------------------------

export interface MemberIdentity {
  userId: number;
  profileId: number | null;
  name: string;
  email: string;
  isPhantom: boolean;
  memberStatus: string | null;
}

/** Resolves the acting member from the existing Society bearer token. */
export const memberFromRequest = async (c: Context<{ Bindings: Env }>): Promise<MemberIdentity | null> => {
  const token = bearerToken(c);
  if (!token) return null;
  const payload = await verifyToken(token, c.env.JWT_SECRET) as JwtPayload | null;
  if (!payload) return null;
  const actor = await getActor(c.env.DB, Number(payload.sub));
  if (!actor) return null;
  return {
    userId: actor.userId,
    profileId: actor.profileId,
    name: actor.name || actor.email.split('@')[0] || 'Member',
    email: actor.email,
    isPhantom: actor.isPhantom,
    memberStatus: actor.memberStatus,
  };
};

export interface ClassOrganizerContext {
  classId: number;
  organizerRowId: number | null;
  role: 'primary' | 'co_organizer' | 'assistant' | null;
  permissions: Set<ClassPermission>;
}

const parsePermissions = (json: string | null | undefined): Set<ClassPermission> => {
  try {
    const list = JSON.parse(String(json || '[]'));
    return new Set(Array.isArray(list) ? list.filter((entry): entry is ClassPermission =>
      (CLASS_PERMISSIONS as readonly string[]).includes(String(entry))) : []);
  } catch {
    return new Set<ClassPermission>();
  }
};

/**
 * The organizer context for one class, re-resolved from the database on every
 * request. Revocation is therefore effective on the next request, and an
 * assistant in one class has no power anywhere else.
 */
export const organizerContextFor = async (
  db: D1Database,
  member: MemberIdentity,
  classId: number,
): Promise<ClassOrganizerContext> => {
  if (!member.profileId) {
    return { classId, organizerRowId: null, role: null, permissions: new Set() };
  }
  const rows = await asRows<{ id: number; role: 'primary' | 'co_organizer' | 'assistant'; permissions_json: string; status: string }>(db.prepare(
    `SELECT id, role, permissions_json, status FROM cgm_class_organizers
     WHERE class_id = ? AND member_profile_id = ? AND status = 'active'`
  ).bind(classId, member.profileId));
  const row = rows[0];
  if (!row) return { classId, organizerRowId: null, role: null, permissions: new Set() };
  const permissions = parsePermissions(row.permissions_json);
  if (row.role === 'primary') {
    // The primary organizer holds every class permission by definition.
    for (const permission of CLASS_PERMISSIONS) permissions.add(permission);
  }
  return { classId, organizerRowId: Number(row.id), role: row.role, permissions };
};

export const hasClassPermission = (context: ClassOrganizerContext, permission: ClassPermission) =>
  context.permissions.has(permission);

/** Standard organizer route guard: class from the path, permission re-checked. */
export type ClassPermissionGuard =
  | { ok: true; context: ClassOrganizerContext }
  | { ok: false; response: Response };

export const requireClassPermission = async (
  c: Context<{ Bindings: Env }>,
  member: MemberIdentity,
  classId: number,
  permission: ClassPermission,
): Promise<ClassPermissionGuard> => {
  const context = await organizerContextFor(c.env.DB, member, classId);
  if (member.isPhantom) {
    // PHANTOM oversight: full read power everywhere; still recorded through the
    // actor label, never through a fabricated organizer row.
    return { ok: true, context: { classId, organizerRowId: null, role: null, permissions: new Set(CLASS_PERMISSIONS) } };
  }
  if (!context.role || !context.permissions.has(permission)) {
    return { ok: false, response: c.json({ success: false, error: 'You are not authorized for this class action.' }, 403) };
  }
  return { ok: true, context };
};

// ---------------------------------------------------------------------------
// Class settings
// ---------------------------------------------------------------------------

export const readClassSettings = async (db: D1Database, classId: number): Promise<ClassSettings> => {
  const rows = await asRows<{ settings_json: string }>(db.prepare(
    'SELECT settings_json FROM cgm_classes WHERE id = ?'
  ).bind(classId));
  return sanitizeClassSettings(safeJsonParse(rows[0]?.settings_json, {}));
};

export const writeClassSettings = async (db: D1Database, classId: number, settings: ClassSettings) => {
  await db.prepare(
    'UPDATE cgm_classes SET settings_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).bind(JSON.stringify(settings), classId).run();
};

export const safeJsonParse = <T>(value: string | null | undefined, fallback: T): T => {
  try {
    return JSON.parse(String(value || '')) as T;
  } catch {
    return fallback;
  }
};

// ---------------------------------------------------------------------------
// Small request helpers
// ---------------------------------------------------------------------------

export const readBody = async <T = Record<string, unknown>>(c: Context<{ Bindings: Env }>): Promise<T> => {
  try {
    return await c.req.json() as T;
  } catch {
    return {} as T;
  }
};

export const bad = (
  c: Context<{ Bindings: Env }>,
  error: string,
  status: 400 | 401 | 403 | 404 | 409 | 410 | 413 | 423 | 429 | 500 = 400,
) => c.json({ success: false, error }, status);

/** One knob for public endpoints that must resist brute force. */
export const throttle = (c: Context<{ Bindings: Env }>, limit: number, windowSec: number) =>
  checkRateLimit(c, limit, windowSec);

export const clean = (value: unknown, max = 200) => String(value ?? '').trim().slice(0, max);
export const cleanOrNull = (value: unknown, max = 200) => {
  const text = clean(value, max);
  return text ? text : null;
};
export { lookupKey };
