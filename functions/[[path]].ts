// Cloudflare Pages Functions - CODE Rx SOCIETY API
// Complete backend: D1 database, R2 storage, real auth (PBKDF2 + JWT),
// protected admin routes, validation, and rate limiting.

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './env';
import { ensureSchema } from './lib/schema';
import { hashPassword, verifyPassword, signToken, requireAuth, requireAdmin, JwtPayload } from './lib/auth';
import {
  actorFromContext, allocateMemberCode, audit, getActor, hasVaultPermission,
  normalizeCodename, randomToken, requirePhantom,
  requireWebsitePermission, sha256Hex, VAULT_ACTIONS, VAULT_SECTION_SEEDS, VaultAction,
} from './lib/vault';
import { cleanStr, cleanEmail, cleanOptionalStr } from './lib/validate';
import { checkRateLimit } from './lib/rate-limit';
import { sendEmail } from './lib/email';

type AppEnv = { Bindings: Env; Variables: { user: JwtPayload; actor: Awaited<ReturnType<typeof getActor>> } };

const app = new Hono<AppEnv>();

const tokenRole = (value: unknown): JwtPayload['role'] =>
  value === 'phantom' || value === 'admin' ? value : 'member';

/** The frontend may use these flags for navigation only. Every write/read is
 * still authorized again by the Worker, never by this response. */
const publicActor = (actor: NonNullable<Awaited<ReturnType<typeof getActor>>>) => ({
  id: actor.userId,
  email: actor.email,
  name: actor.name,
  role: tokenRole(actor.userRole),
  isPhantom: actor.isPhantom,
  isWebsiteAdmin: actor.isWebsiteAdmin,
  memberCode: actor.memberCode,
  memberStatus: actor.memberStatus,
  codename: actor.codename,
});

const dbRows = async <T>(statement: D1PreparedStatement): Promise<T[]> => {
  const result = await statement.all<T>();
  return result.results || [];
};

type FounderActor = NonNullable<Awaited<ReturnType<typeof getActor>>>;

const createMemberAccount = async ({
  env,
  actor,
  name,
  email,
  phone,
  roleCode,
  applicationId,
  requestHost,
}: {
  env: Env;
  actor: FounderActor;
  name: string;
  email: string;
  phone: string | null;
  roleCode: string;
  applicationId?: number;
  requestHost?: string;
}) => {
  const db = env.DB;
  if (roleCode === 'phantom') throw new Error('PHANTOM identity cannot be assigned through member creation.');
  const roleRows = await dbRows<{ id: number; code: string; name: string }>(db.prepare('SELECT id, code, name FROM roles WHERE code = ?').bind(roleCode));
  const role = roleRows[0];
  if (!role) throw new Error('Choose a valid initial responsibility role.');

  const existingUsers = await dbRows<{ id: number }>(db.prepare('SELECT id FROM users WHERE email = ?').bind(email));
  if (existingUsers[0]) throw new Error('An account already exists for this email. Review the member record instead.');
  const existingProfiles = await dbRows<{ id: number }>(db.prepare(
    `SELECT mp.id FROM member_profiles mp JOIN members m ON m.id = mp.member_record_id WHERE m.email = ?`
  ).bind(email));
  if (existingProfiles[0]) throw new Error('A member profile already exists for this email.');
  const existingMemberRows = await dbRows<{ id: number }>(db.prepare('SELECT id FROM members WHERE email = ?').bind(email));

  // A sequence number is intentionally consumed even if a later validation or
  // storage failure occurs: Member IDs are permanent and are never reused.
  const memberCode = await allocateMemberCode(db);
  let userId: number | null = null;
  let memberRecordId: number | null = null;
  let createdMemberRecord = false;
  let profileId: number | null = null;
  try {
    const temporaryHash = await hashPassword(randomToken());
    const today = new Date().toISOString().slice(0, 10);
    const userResult = await db.prepare(
      "INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, 'member')"
    ).bind(email, name, temporaryHash).run();
    userId = Number(userResult.meta.last_row_id);

    if (existingMemberRows[0]) {
      memberRecordId = Number(existingMemberRows[0].id);
      await db.prepare('UPDATE members SET name = ?, phone = ?, role = ?, level = ?, is_active = 0 WHERE id = ?')
        .bind(name, phone, role.code, role.name, memberRecordId).run();
    } else {
      const memberResult = await db.prepare(
        'INSERT INTO members (name, email, phone, role, joined_date, points, level, is_active) VALUES (?, ?, ?, ?, ?, 0, ?, 0)'
      ).bind(name, email, phone, role.code, today, role.name).run();
      memberRecordId = Number(memberResult.meta.last_row_id);
      createdMemberRecord = true;
    }

    const profileResult = await db.prepare(
      `INSERT INTO member_profiles (user_id, member_record_id, member_code, status, primary_role_id, created_by_user_id)
       VALUES (?, ?, ?, 'pending_activation', ?, ?)`
    ).bind(userId, memberRecordId, memberCode, role.id, actor.userId).run();
    profileId = Number(profileResult.meta.last_row_id);

    const rawToken = randomToken();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();
    await db.prepare(
      'INSERT INTO member_activations (member_profile_id, email, token_hash, expires_at, created_by_user_id) VALUES (?, ?, ?, ?, ?)'
    ).bind(profileId, email, await sha256Hex(rawToken), expiresAt, actor.userId).run();

    if (applicationId) {
      await db.prepare(
        `UPDATE applications SET status = 'approved', member_profile_id = ?, reviewed_by_user_id = ?, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
      ).bind(profileId, actor.userId, applicationId).run();
    }

    const baseUrl = env.SITE_URL || `https://${requestHost || 'coderxsociety.pages.dev'}`;
    const activationUrl = `${baseUrl}/#activate?token=${rawToken}&email=${encodeURIComponent(email)}`;
    await audit(db, actor, 'member.created', 'member_profile', profileId, {
      memberCode,
      email,
      role: role.code,
      applicationId: applicationId || null,
      status: 'pending_activation',
    });
    await sendEmail(env, env.EMAILJS_TEMPLATE_ID_ACTIVATION || '', {
      to_email: email,
      member_name: name,
      member_code: memberCode,
      activation_link: activationUrl,
      role_name: role.name,
    });

    return { profileId, userId, memberRecordId, memberCode, activationUrl, role: role.code };
  } catch (error) {
    // Compensate incomplete account rows. The sequence remains consumed by
    // design, preserving the no-reuse member-ID rule.
    try {
      if (profileId) await db.prepare('DELETE FROM member_activations WHERE member_profile_id = ?').bind(profileId).run();
      if (profileId) await db.prepare('DELETE FROM member_profiles WHERE id = ?').bind(profileId).run();
      if (memberRecordId && createdMemberRecord) await db.prepare('DELETE FROM members WHERE id = ?').bind(memberRecordId).run();
      if (userId) await db.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();
    } catch (cleanupError) {
      console.error('[code-rx] member creation cleanup error:', cleanupError);
    }
    throw error;
  }
};

const getCodenameSession = async (db: D1Database, profileId: number) => {
  let rows = await dbRows<any>(db.prepare('SELECT * FROM codename_selection_sessions WHERE member_profile_id = ?').bind(profileId));
  if (!rows[0]) {
    await db.prepare("INSERT INTO codename_selection_sessions (member_profile_id, status, passes_used) VALUES (?, 'open', 0)").bind(profileId).run();
    rows = await dbRows<any>(db.prepare('SELECT * FROM codename_selection_sessions WHERE member_profile_id = ?').bind(profileId));
  }
  return rows[0] || null;
};

const vaultSection = async (db: D1Database, slug: string) => {
  const rows = await dbRows<any>(db.prepare('SELECT * FROM vault_sections WHERE slug = ? AND is_archived = 0').bind(slug));
  return rows[0] || null;
};

const requireActiveActor = async (c: any) => {
  const actor = await actorFromContext(c);
  if (!actor || !actor.profileId) return { actor: null, response: c.json({ success: false, error: 'Member profile not found' }, 404) };
  if (!actor.isPhantom && actor.memberStatus !== 'active') {
    return { actor: null, response: c.json({ success: false, error: 'An active member account is required' }, 403) };
  }
  return { actor, response: null };
};

const vaultAccess = async (c: any, slug: string, action: VaultAction) => {
  const access = await requireActiveActor(c);
  if (access.response) return { actor: null, section: null, response: access.response };
  const section = await vaultSection(c.env.DB, slug);
  if (!section) return { actor: null, section: null, response: c.json({ success: false, error: 'Vault section not found' }, 404) };
  if (!await hasVaultPermission(c.env.DB, access.actor, slug, action)) {
    return { actor: null, section: null, response: c.json({ success: false, error: 'You are not authorized for this Vault action' }, 403) };
  }
  return { actor: access.actor, section, response: null };
};

// ---------- CORS (same-origin is the norm; allow local dev + pages.dev) ----------
app.use('/api/*', cors({
  origin: (origin) => {
    if (!origin) return '*';
    try {
      const host = new URL(origin).hostname;
      if (host === 'localhost' || host.endsWith('.pages.dev') || host === '127.0.0.1') return origin;
    } catch { /* ignore */ }
    return '';
  },
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
}));

// Ensure schema (once per isolate) before any API request
app.use('/api/*', async (c, next) => {
  try {
    await ensureSchema(c.env);
  } catch (e) {
    console.error('[code-rx] ensureSchema failed:', e);
    return c.json({ success: false, error: 'Database is not configured. Attach the D1 binding "DB" in the Pages project settings.' }, 500);
  }
  await next();
});

// ---------- Health ----------
app.get('/api/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'code-rx-api' });
});

// ============================================
// 🔐 AUTH
// ============================================

// Login (rate limited: 10/min per IP)
app.post('/api/auth/login', async (c) => {
  if (!checkRateLimit(c, 10, 60)) {
    return c.json({ success: false, error: 'Too many login attempts. Please wait a minute.' }, 429);
  }
  try {
    const body = await c.req.json().catch(() => ({}));
    const email = cleanEmail(body.email);
    const password = cleanStr(body.password, 1, 128);
    if (!email || !password) {
      return c.json({ success: false, error: 'Email and password are required' }, 400);
    }

    const { results } = await c.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).all<any>();
    const user = results[0];
    if (!user) {
      return c.json({ success: false, error: 'Invalid email or password' }, 401);
    }

    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) {
      return c.json({ success: false, error: 'Invalid email or password' }, 401);
    }

    const actor = await getActor(c.env.DB, Number(user.id));
    if (!actor) return c.json({ success: false, error: 'Account profile could not be loaded' }, 403);
    if (actor.memberStatus === 'locked') {
      return c.json({ success: false, error: 'This member account is locked. Please contact PHANTOM.' }, 403);
    }
    if (actor.memberStatus === 'archived') {
      return c.json({ success: false, error: 'This member account is archived.' }, 403);
    }
    if (actor.memberStatus === 'pending_activation') {
      return c.json({ success: false, error: 'Complete your account activation before signing in.' }, 403);
    }

    // Pages dashboard variables are separate from local wrangler variables.
    // Fail clearly when the production JWT secret was not configured instead
    // of returning the unhelpful generic login 500.
    const jwtSecret = String(c.env.JWT_SECRET || '').trim();
    if (!jwtSecret) {
      console.error('[code-rx] login configuration error: JWT_SECRET is missing');
      return c.json({ success: false, error: 'Authentication is not configured. Please contact the administrator.' }, 503);
    }

    const token = await signToken({ sub: String(user.id), email: user.email, role: tokenRole(user.role) }, jwtSecret);
    return c.json({
      success: true,
      token,
      user: publicActor(actor),
    });
  } catch (e) {
    console.error('[code-rx] login error:', e);
    return c.json({ success: false, error: 'Login failed. Please try again.' }, 500);
  }
});

// Self-registration is intentionally disabled. Existing accounts keep working;
// new accounts are created only by PHANTOM after a Join application review.
app.post('/api/auth/register', async (c) => {
  if (!checkRateLimit(c, 5, 60)) {
    return c.json({ success: false, error: 'Too many attempts. Please wait a minute.' }, 429);
  }
  return c.json({
    success: false,
    error: 'Public account creation is disabled. Please use JOIN CODE Rx and wait for membership approval.',
  }, 403);
});

// Current user (valid token required)
app.get('/api/auth/me', requireAuth, async (c) => {
  const actor = await getActor(c.env.DB, Number(c.get('user').sub));
  if (!actor) return c.json({ success: false, error: 'User not found' }, 404);
  if (actor.memberStatus === 'locked' || actor.memberStatus === 'archived') {
    return c.json({ success: false, error: 'This member account is not active' }, 403);
  }
  return c.json({ success: true, user: publicActor(actor) });
});

// Account activation is the only way a newly approved member sets their
// first password. PHANTOM never receives or stores that permanent password.
app.post('/api/auth/activate', async (c) => {
  if (!checkRateLimit(c, 5, 60)) {
    return c.json({ success: false, error: 'Too many activation attempts. Please wait a minute.' }, 429);
  }
  try {
    const body = await c.req.json().catch(() => ({}));
    const email = cleanEmail(body.email);
    const token = cleanStr(body.token, 32, 128);
    const password = cleanStr(body.password, 8, 128);
    if (!email || !token || !password) {
      return c.json({ success: false, error: 'Email, activation token, and a password of at least 8 characters are required.' }, 400);
    }
    const tokenHash = await sha256Hex(token);
    const rows = await dbRows<any>(c.env.DB.prepare(
      `SELECT a.*, mp.user_id, mp.id AS profile_id, mp.status, u.id AS user_id_check
       FROM member_activations a
       JOIN member_profiles mp ON mp.id = a.member_profile_id
       JOIN users u ON u.id = mp.user_id
       WHERE a.email = ? AND a.token_hash = ?`
    ).bind(email, tokenHash));
    const activation = rows[0];
    if (!activation || activation.used_at) {
      return c.json({ success: false, error: 'This activation link is invalid or has already been used.' }, 400);
    }
    if (new Date(activation.expires_at).getTime() < Date.now()) {
      return c.json({ success: false, error: 'This activation link has expired. Ask PHANTOM for a new activation link.' }, 400);
    }
    if (activation.status !== 'pending_activation') {
      return c.json({ success: false, error: 'This account is not awaiting activation.' }, 400);
    }

    const passwordHash = await hashPassword(password);
    await c.env.DB.batch([
      c.env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(passwordHash, activation.user_id),
      c.env.DB.prepare("UPDATE member_profiles SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(activation.profile_id),
      c.env.DB.prepare('UPDATE members SET is_active = 1 WHERE id = (SELECT member_record_id FROM member_profiles WHERE id = ?)').bind(activation.profile_id),
      c.env.DB.prepare('UPDATE member_activations SET used_at = CURRENT_TIMESTAMP WHERE id = ?').bind(activation.id),
    ]);
    const actor = await getActor(c.env.DB, Number(activation.user_id));
    if (!actor) return c.json({ success: false, error: 'Activation completed but the account profile could not be loaded.' }, 500);
    await audit(c.env.DB, actor, 'member.activated', 'member_profile', activation.profile_id, { email });
    const jwtSecret = String(c.env.JWT_SECRET || '').trim();
    if (!jwtSecret) return c.json({ success: false, error: 'Authentication is not configured. Please contact PHANTOM.' }, 503);
    const jwt = await signToken({ sub: String(actor.userId), email: actor.email, role: tokenRole(actor.userRole) }, jwtSecret);
    return c.json({ success: true, token: jwt, user: publicActor(actor), message: 'Account activated. Choose your Code Rx codename next.' });
  } catch (error) {
    console.error('[code-rx] activation error:', error);
    return c.json({ success: false, error: 'Account activation failed. Please try again.' }, 500);
  }
});

// Forgot password — creates a one-time reset token and emails a reset link
app.post('/api/auth/forgot-password', async (c) => {
  if (!checkRateLimit(c, 3, 60)) {
    return c.json({ success: false, error: 'Too many requests. Please wait a minute.' }, 429);
  }
  try {
    const body = await c.req.json().catch(() => ({}));
    const email = cleanEmail(body.email);
    if (!email) return c.json({ success: false, error: 'A valid email address is required' }, 400);

    const { results } = await c.env.DB
      .prepare('SELECT id, name FROM users WHERE email = ?')
      .bind(email)
      .all<any>();
    const user = results[0];

    // Always return the same message (prevents account enumeration)
    if (!user) {
      return c.json({ success: true, message: 'If an account exists for that email, a reset link has been sent.' });
    }

    const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
    const token = Array.from(tokenBytes, (b) => b.toString(16).padStart(2, '0')).join('');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

    await c.env.DB
      .prepare('INSERT INTO password_resets (email, token, expires_at, used) VALUES (?, ?, ?, 0)')
      .bind(email, await sha256Hex(token), expiresAt)
      .run();

    const base = c.env.SITE_URL || `https://${c.req.header('host') || 'coderxsociety.pages.dev'}`;
    const resetLink = `${base}/#reset?token=${token}&email=${encodeURIComponent(email)}`;

    const sent = await sendEmail(c.env, c.env.EMAILJS_TEMPLATE_ID_RESET || '', {
      to_email: email,
      name: user.name || 'there',
      reset_link: resetLink,
    });

    // Never return a reset token to a browser. If mail is not configured, keep
    // the same non-enumerating response and let PHANTOM configure mail safely.
    if (!sent) console.warn('[code-rx] password reset email was not sent; mail service is not configured');
    return c.json({ success: true, message: 'If an account exists for that email, a reset link has been sent.' });
  } catch (e) {
    console.error('[code-rx] forgot password error:', e);
    return c.json({ success: false, error: 'Something went wrong. Please try again.' }, 500);
  }
});

// Reset password — validates the one-time token, then updates the password
app.post('/api/auth/reset-password', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const email = cleanEmail(body.email);
    const token = cleanStr(body.token, 32, 128);
    const newPassword = cleanStr(body.newPassword, 6, 128);

    if (!email || !token || !newPassword) {
      return c.json({ success: false, error: 'Email, token, and a new password (min 6 characters) are required' }, 400);
    }

    const tokenHash = await sha256Hex(token);
    // Accept a short-lived legacy plaintext token once during the migration;
    // all newly issued reset tokens are stored as hashes.
    const { results } = await c.env.DB
      .prepare('SELECT * FROM password_resets WHERE email = ? AND (token = ? OR token = ?)')
      .bind(email, tokenHash, token)
      .all<any>();
    const reset = results[0];

    if (!reset || reset.used === 1) {
      return c.json({ success: false, error: 'This reset link is invalid or has already been used.' }, 400);
    }
    if (new Date(reset.expires_at).getTime() < Date.now()) {
      return c.json({ success: false, error: 'This reset link has expired. Please request a new one.' }, 400);
    }

    const password_hash = await hashPassword(newPassword);
    await c.env.DB
      .prepare('UPDATE users SET password_hash = ? WHERE email = ?')
      .bind(password_hash, email)
      .run();
    await c.env.DB
      .prepare('UPDATE password_resets SET used = 1 WHERE id = ?')
      .bind(reset.id)
      .run();

    return c.json({ success: true, message: 'Password reset successfully. You can now sign in.' });
  } catch (e) {
    console.error('[code-rx] reset password error:', e);
    return c.json({ success: false, error: 'Failed to reset password. Please try again.' }, 500);
  }
});

// Change password (any authenticated user; verifies the current password)
app.post('/api/auth/change-password', requireAuth, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const current = cleanStr(body.currentPassword, 1, 128);
    const next = cleanStr(body.newPassword, 6, 128);
    if (!current || !next) {
      return c.json({ success: false, error: 'Current and new password (min 6 characters) are required' }, 400);
    }

    const { results } = await c.env.DB
      .prepare('SELECT password_hash FROM users WHERE id = ?')
      .bind(c.get('user').sub)
      .all<any>();
    const user = results[0];
    if (!user) return c.json({ success: false, error: 'User not found' }, 404);

    const ok = await verifyPassword(current, user.password_hash);
    if (!ok) return c.json({ success: false, error: 'Current password is incorrect' }, 401);

    const password_hash = await hashPassword(next);
    await c.env.DB
      .prepare('UPDATE users SET password_hash = ? WHERE id = ?')
      .bind(password_hash, c.get('user').sub)
      .run();

    return c.json({ success: true, message: 'Password updated successfully' });
  } catch (e) {
    console.error('[code-rx] change password error:', e);
    return c.json({ success: false, error: 'Failed to change password' }, 500);
  }
});

// ============================================
// 📋 APPLICATIONS (join requests)
// ============================================

app.get('/api/applications', requireAuth, requirePhantom, async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM applications ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, created_at DESC, id DESC`
  ).all();
  return c.json({ success: true, data: results });
});

app.post('/api/applications', async (c) => {
  if (!checkRateLimit(c, 5, 60)) {
    return c.json({ success: false, error: 'Too many submissions. Please wait a minute.' }, 429);
  }
  try {
    const body = await c.req.json().catch(() => ({}));
    const name = cleanStr(body.name, 2, 100);
    const email = cleanEmail(body.email);
    const phone = cleanStr(body.phone, 5, 30);

    if (!name || !email || !phone) {
      return c.json({ success: false, error: 'Please provide your full name, phone number, and a valid email address' }, 400);
    }

    const applicationResult = await c.env.DB
      .prepare('INSERT INTO applications (name, email, phone, date, status) VALUES (?, ?, ?, ?, ?)')
      .bind(name, email, phone, new Date().toISOString().split('T')[0], 'pending')
      .run();
    await audit(c.env.DB, null, 'application.submitted', 'application', Number(applicationResult.meta.last_row_id), { email });

    // Also capture as a newsletter subscriber (idempotent)
    await c.env.DB
      .prepare('INSERT OR IGNORE INTO subscribers (email, name, phone, date, source) VALUES (?, ?, ?, ?, ?)')
      .bind(email, name, phone, new Date().toISOString().split('T')[0], 'application')
      .run();

    // Notify the admin (non-blocking; skipped when EmailJS is not configured)
    await sendEmail(c.env, c.env.EMAILJS_TEMPLATE_ID_JOIN || '', {
      to_email: c.env.ADMIN_EMAIL,
      applicant_name: name,
      applicant_email: email,
      applicant_phone: phone || '—',
      date: new Date().toISOString().split('T')[0],
    });

    return c.json({ success: true, message: 'Application submitted successfully' });
  } catch (e) {
    console.error('[code-rx] create application error:', e);
    return c.json({ success: false, error: 'Failed to submit application. Please try again.' }, 500);
  }
});

app.patch('/api/applications/:id', requireAuth, requirePhantom, async (c) => {
  try {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id < 1) return c.json({ success: false, error: 'Invalid application id' }, 400);
    const body = await c.req.json().catch(() => ({}));
    if (body.status !== 'approved' && body.status !== 'rejected' && body.status !== 'pending') {
      return c.json({ success: false, error: 'Status must be pending, approved, or rejected' }, 400);
    }
    const rows = await dbRows<any>(c.env.DB.prepare('SELECT * FROM applications WHERE id = ?').bind(id));
    const application = rows[0];
    if (!application) return c.json({ success: false, error: 'Application not found' }, 404);
    const actor = await actorFromContext(c);
    const note = cleanOptionalStr(body.note, 2000);
    await c.env.DB.prepare(
      'UPDATE applications SET status = ?, reviewed_by_user_id = ?, reviewed_at = CURRENT_TIMESTAMP, review_note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(body.status, actor?.userId ?? null, note, id).run();
    await audit(c.env.DB, actor, `application.${body.status}`, 'application', id, { email: application.email, note });
    if (body.status === 'rejected') {
      await sendEmail(c.env, c.env.EMAILJS_TEMPLATE_ID_APPROVAL || '', {
        to_email: application.email,
        member_name: application.name,
        status: 'rejected',
        date: new Date().toISOString().slice(0, 10),
      });
    }
    return c.json({
      success: true,
      message: body.status === 'approved'
        ? 'Application reviewed. Use Create Member to generate an activation account.'
        : `Application ${body.status}`,
    });
  } catch (error) {
    console.error('[code-rx] update application error:', error);
    return c.json({ success: false, error: 'Failed to update application' }, 500);
  }
});

// ============================================
// 📧 SUBSCRIBERS
// ============================================

app.get('/api/subscribers', requireAdmin, async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM subscribers ORDER BY date DESC, id DESC').all();
  return c.json({ success: true, data: results });
});

app.post('/api/subscribers', async (c) => {
  if (!checkRateLimit(c, 5, 60)) {
    return c.json({ success: false, error: 'Too many attempts. Please wait a minute.' }, 429);
  }
  try {
    const body = await c.req.json().catch(() => ({}));
    const email = cleanEmail(body.email);
    const name = cleanOptionalStr(body.name, 100);
    const phone = cleanOptionalStr(body.phone, 30);
    if (!email) return c.json({ success: false, error: 'A valid email address is required' }, 400);

    const result = await c.env.DB
      .prepare('INSERT OR IGNORE INTO subscribers (email, name, phone, date, source) VALUES (?, ?, ?, ?, ?)')
      .bind(email, name, phone ?? null, new Date().toISOString().split('T')[0], 'website')
      .run();

    const message = (result.meta.changes ?? 0) > 0 ? 'Subscribed successfully' : 'You are already subscribed';
    return c.json({ success: true, message });
  } catch (e) {
    console.error('[code-rx] subscribe error:', e);
    return c.json({ success: false, error: 'Failed to subscribe. Please try again.' }, 500);
  }
});

// ============================================
// ✉️ CONTACT MESSAGES
// ============================================

app.get('/api/contacts', requireAdmin, async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM contacts ORDER BY date DESC, id DESC').all();
  return c.json({ success: true, data: results });
});

app.post('/api/contacts', async (c) => {
  if (!checkRateLimit(c, 5, 60)) {
    return c.json({ success: false, error: 'Too many messages. Please wait a minute.' }, 429);
  }
  try {
    const body = await c.req.json().catch(() => ({}));
    const name = cleanStr(body.name, 2, 100);
    const email = cleanEmail(body.email);
    const subject = cleanStr(body.subject, 2, 200);
    const message = cleanStr(body.message, 5, 5000);

    if (!name || !email || !subject || !message) {
      return c.json({ success: false, error: 'Please fill in all fields with valid values' }, 400);
    }

    await c.env.DB
      .prepare('INSERT INTO contacts (name, email, subject, message, date, status) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(name, email, subject, message, new Date().toISOString(), 'unread')
      .run();

    // Notify the admin (non-blocking; skipped when EmailJS is not configured)
    await sendEmail(c.env, c.env.EMAILJS_TEMPLATE_ID_CONTACT || '', {
      to_email: c.env.ADMIN_EMAIL,
      sender_name: name,
      sender_email: email,
      subject,
      message,
      date: new Date().toISOString(),
    });

    return c.json({ success: true, message: 'Message sent successfully. We will get back to you soon.' });
  } catch (e) {
    console.error('[code-rx] contact error:', e);
    return c.json({ success: false, error: 'Failed to send message. Please try again.' }, 500);
  }
});

app.patch('/api/contacts/:id', requireAdmin, async (c) => {
  try {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id < 1) return c.json({ success: false, error: 'Invalid id' }, 400);
    const body = await c.req.json().catch(() => ({}));
    if (body.status !== 'read' && body.status !== 'archived') {
      return c.json({ success: false, error: 'Status must be "read" or "archived"' }, 400);
    }
    await c.env.DB.prepare('UPDATE contacts SET status = ? WHERE id = ?').bind(body.status, id).run();
    return c.json({ success: true, message: 'Contact updated' });
  } catch (e) {
    console.error('[code-rx] update contact error:', e);
    return c.json({ success: false, error: 'Failed to update contact' }, 500);
  }
});

// ============================================
// 🖥️ SITE CONTENT (CMS)
// ============================================

app.get('/api/site-content', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT data FROM site_content WHERE id = 1').all<any>();
    if (results.length === 0 || !results[0]?.data) {
      return c.json({ success: true, data: null });
    }
    return c.json({ success: true, data: JSON.parse(results[0].data) });
  } catch (e) {
    console.error('[code-rx] get site content error:', e);
    return c.json({ success: false, error: 'Failed to fetch site content' }, 500);
  }
});

app.put('/api/site-content', requireAuth, requireWebsitePermission('content.manage'), async (c) => {
  try {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return c.json({ success: false, error: 'Invalid content payload' }, 400);
    }
    const raw = JSON.stringify(body);
    if (raw.length > 500_000) return c.json({ success: false, error: 'Content too large' }, 413);

    await c.env.DB
      .prepare('INSERT OR REPLACE INTO site_content (id, data, updated_at) VALUES (1, ?, CURRENT_TIMESTAMP)')
      .bind(raw)
      .run();

    return c.json({ success: true, message: 'Site content saved' });
  } catch (e) {
    console.error('[code-rx] save site content error:', e);
    return c.json({ success: false, error: 'Failed to save site content' }, 500);
  }
});

// ============================================
// 👥 MEMBERS
// ============================================

app.get('/api/members', requireAuth, requirePhantom, async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM members ORDER BY created_at DESC, id DESC').all();
  return c.json({ success: true, data: results });
});

// Backwards-compatible endpoint used by the existing Admin panel. It now
// follows the same activation workflow as PHANTOM Control Center rather than
// creating a password-bearing account immediately.
app.post('/api/members', requireAuth, requirePhantom, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const name = cleanStr(body.name, 2, 100);
    const email = cleanEmail(body.email);
    if (!name || !email) return c.json({ success: false, error: 'Name and valid email are required' }, 400);
    const actor = await actorFromContext(c);
    if (!actor) return c.json({ success: false, error: 'PHANTOM identity not found' }, 403);
    const created = await createMemberAccount({
      env: c.env,
      actor,
      name,
      email,
      phone: cleanOptionalStr(body.phone, 30),
      roleCode: cleanStr(body.role, 2, 50) || 'member',
      requestHost: c.req.header('host'),
    });
    return c.json({ success: true, message: 'Member created and awaiting activation', id: created.memberRecordId, data: created });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create member';
    return c.json({ success: false, error: message }, /already|valid/i.test(message) ? 409 : 500);
  }
});

app.patch('/api/members/:id', requireAuth, requirePhantom, async (c) => {
  try {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id < 1) return c.json({ success: false, error: 'Invalid id' }, 400);
    const body = await c.req.json().catch(() => ({}));

    const fields: string[] = [];
    const values: any[] = [];
    if (body.points !== undefined && Number.isFinite(Number(body.points))) {
      fields.push('points = ?');
      values.push(Number(body.points));
    }
    if (body.level !== undefined) {
      const level = cleanOptionalStr(body.level, 100);
      if (!level) return c.json({ success: false, error: 'Invalid level' }, 400);
      fields.push('level = ?');
      values.push(level);
    }
    if (body.is_active !== undefined) {
      fields.push('is_active = ?');
      values.push(body.is_active ? 1 : 0);
    }
    if (fields.length === 0) return c.json({ success: false, error: 'Nothing to update' }, 400);

    values.push(id);
    await c.env.DB.prepare(`UPDATE members SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
    if (body.is_active !== undefined) {
      const profileRows = await dbRows<any>(c.env.DB.prepare('SELECT id, member_code, status FROM member_profiles WHERE member_record_id = ?').bind(id));
      const profile = profileRows[0];
      if (profile) {
        await c.env.DB.prepare(
          `UPDATE member_profiles SET status = CASE
             WHEN ? = 0 THEN 'locked'
             WHEN status = 'locked' THEN 'active'
             ELSE status END,
           locked_at = CASE WHEN ? = 0 THEN CURRENT_TIMESTAMP ELSE NULL END,
           updated_at = CURRENT_TIMESTAMP WHERE id = ?`
        ).bind(body.is_active ? 1 : 0, body.is_active ? 1 : 0, profile.id).run();
        await audit(c.env.DB, await actorFromContext(c), body.is_active ? 'member.unlocked' : 'member.locked', 'member_profile', profile.id, { memberCode: profile.member_code, source: 'legacy_member_endpoint' });
      }
    }
    return c.json({ success: true, message: 'Member updated' });
  } catch (e) {
    console.error('[code-rx] update member error:', e);
    return c.json({ success: false, error: 'Failed to update member' }, 500);
  }
});

// Historical member records are never deleted. The legacy endpoint now
// archives the record so older Admin UI actions remain safe.
app.delete('/api/members/:id', requireAuth, requirePhantom, async (c) => {
  try {
    const memberRecordId = Number(c.req.param('id'));
    if (!Number.isInteger(memberRecordId) || memberRecordId < 1) return c.json({ success: false, error: 'Invalid member id' }, 400);
    const actor = await actorFromContext(c);
    const profileRows = await dbRows<any>(c.env.DB.prepare('SELECT id, member_code FROM member_profiles WHERE member_record_id = ?').bind(memberRecordId));
    await c.env.DB.prepare('UPDATE members SET is_active = 0 WHERE id = ?').bind(memberRecordId).run();
    if (profileRows[0]) {
      await c.env.DB.prepare("UPDATE member_profiles SET status = 'archived', archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(profileRows[0].id).run();
      await audit(c.env.DB, actor, 'member.archived', 'member_profile', profileRows[0].id, { memberCode: profileRows[0].member_code, source: 'legacy_member_endpoint' });
    } else {
      await audit(c.env.DB, actor, 'member.archived', 'member_record', memberRecordId, { source: 'legacy_member_endpoint' });
    }
    return c.json({ success: true, message: 'Member archived. Historical records were preserved.' });
  } catch (error) {
    console.error('[code-rx] archive member error:', error);
    return c.json({ success: false, error: 'Failed to archive member' }, 500);
  }
});

// ============================================
// 📊 STATS (admin)
// ============================================

app.get('/api/stats', requireAuth, requirePhantom, async (c) => {
  try {
    const [applications, pendingApplications, members, subscribers, contacts, unreadContacts] = await Promise.all([
      c.env.DB.prepare('SELECT COUNT(*) AS count FROM applications').all<any>(),
      c.env.DB.prepare('SELECT COUNT(*) AS count FROM applications WHERE status = ?').bind('pending').all<any>(),
      c.env.DB.prepare('SELECT COUNT(*) AS count FROM members WHERE is_active = 1').all<any>(),
      c.env.DB.prepare('SELECT COUNT(*) AS count FROM subscribers').all<any>(),
      c.env.DB.prepare('SELECT COUNT(*) AS count FROM contacts').all<any>(),
      c.env.DB.prepare('SELECT COUNT(*) AS count FROM contacts WHERE status = ?').bind('unread').all<any>(),
    ]);

    return c.json({
      success: true,
      data: {
        applications: applications.results[0]?.count ?? 0,
        pendingApplications: pendingApplications.results[0]?.count ?? 0,
        members: members.results[0]?.count ?? 0,
        subscribers: subscribers.results[0]?.count ?? 0,
        contacts: contacts.results[0]?.count ?? 0,
        unreadContacts: unreadContacts.results[0]?.count ?? 0,
      },
    });
  } catch (e) {
    console.error('[code-rx] stats error:', e);
    return c.json({ success: false, error: 'Failed to fetch stats' }, 500);
  }
});

// ============================================
// 🪪 MEMBER IDENTITY + CODENAME BALLOT
// ============================================

app.get('/api/member/me', requireAuth, async (c) => {
  const access = await requireActiveActor(c);
  if (access.response) return access.response;
  const actor = access.actor!;
  const session = await getCodenameSession(c.env.DB, actor.profileId!);
  const roleRows = await dbRows<any>(c.env.DB.prepare(
    `SELECT r.id, r.code, r.name, r.description FROM roles r JOIN member_profiles mp ON mp.primary_role_id = r.id WHERE mp.id = ?`
  ).bind(actor.profileId));
  const permissions = await dbRows<any>(c.env.DB.prepare(
    `SELECT section_slug, can_view, can_create, can_edit, can_delete, can_manage
     FROM role_permissions WHERE role_id = ? ORDER BY section_slug`
  ).bind(actor.primaryRoleId || 0));
  return c.json({
    success: true,
    data: {
      ...publicActor(actor),
      role: roleRows[0] || null,
      permissions,
      codenameSession: session ? {
        status: session.status,
        passesUsed: Number(session.passes_used || 0),
        attemptsRemaining: session.status === 'completed' ? 0 : 3 - Number(session.passes_used || 0),
        claimedCodenameId: session.claimed_codename_id || null,
      } : null,
    },
  });
});

app.get('/api/codenames/ballot', requireAuth, async (c) => {
  const access = await requireActiveActor(c);
  if (access.response) return access.response;
  const actor = access.actor!;
  if (actor.codename) return c.json({ success: true, data: { completed: true, codename: actor.codename, choices: [] } });
  const session = await getCodenameSession(c.env.DB, actor.profileId!);
  if (!session || session.status !== 'open') {
    return c.json({ success: false, error: 'Codename selection is no longer open for this account.' }, 409);
  }
  const choices = await dbRows<any>(c.env.DB.prepare(
    `SELECT c.id, c.display_name
     FROM codenames c
     WHERE c.status = 'available'
       AND NOT EXISTS (
         SELECT 1 FROM codename_selection_events e
         WHERE e.session_id = ? AND e.codename_id = c.id AND e.action = 'passed'
       )
     ORDER BY c.display_name COLLATE NOCASE`
  ).bind(session.id));
  return c.json({ success: true, data: { completed: false, passesUsed: Number(session.passes_used || 0), maxAttempts: 3, choices } });
});

app.post('/api/codenames/check', requireAuth, async (c) => {
  const access = await requireActiveActor(c);
  if (access.response) return access.response;
  const actor = access.actor!;
  const body = await c.req.json().catch(() => ({}));
  const codenameId = Number(body.codenameId);
  if (!Number.isInteger(codenameId) || codenameId < 1) return c.json({ success: false, error: 'Choose a valid codename.' }, 400);
  const session = await getCodenameSession(c.env.DB, actor.profileId!);
  if (!session || session.status !== 'open') return c.json({ success: false, error: 'Codename selection is closed.' }, 409);
  const codeRows = await dbRows<any>(c.env.DB.prepare('SELECT id, display_name, status FROM codenames WHERE id = ?').bind(codenameId));
  const codename = codeRows[0];
  if (!codename) return c.json({ success: false, error: 'Codename not found.' }, 404);
  const passed = await dbRows<any>(c.env.DB.prepare(
    "SELECT id FROM codename_selection_events WHERE session_id = ? AND codename_id = ? AND action = 'passed'"
  ).bind(session.id, codenameId));
  const available = codename.status === 'available' && !passed[0];
  await c.env.DB.prepare(
    'INSERT INTO codename_selection_events (session_id, codename_id, action) VALUES (?, ?, ?)'
  ).bind(session.id, codenameId, available ? 'available_check' : 'unavailable_check').run();
  return c.json({
    success: true,
    data: {
      available,
      codename: codename.display_name,
      message: available ? 'AVAILABLE' : passed[0] ? 'This codename was passed and cannot be selected again.' : 'Unavailable.',
      attemptsUsed: Number(session.passes_used || 0),
      maxAttempts: 3,
    },
  });
});

app.post('/api/codenames/pass', requireAuth, async (c) => {
  const access = await requireActiveActor(c);
  if (access.response) return access.response;
  const actor = access.actor!;
  const body = await c.req.json().catch(() => ({}));
  const codenameId = Number(body.codenameId);
  if (!Number.isInteger(codenameId) || codenameId < 1) return c.json({ success: false, error: 'Choose a valid codename.' }, 400);
  const session = await getCodenameSession(c.env.DB, actor.profileId!);
  if (!session || session.status !== 'open') return c.json({ success: false, error: 'Codename selection is closed.' }, 409);
  if (Number(session.passes_used || 0) >= 2) {
    return c.json({ success: false, error: 'You have reached the final successful selection. Claim it to complete your Code Rx identity.' }, 409);
  }
  const codeRows = await dbRows<any>(c.env.DB.prepare('SELECT id, display_name, status FROM codenames WHERE id = ?').bind(codenameId));
  const codename = codeRows[0];
  if (!codename || codename.status !== 'available') {
    return c.json({ success: false, error: 'This codename is no longer available. Attempts used: ' + Number(session.passes_used || 0) + '/3.' }, 409);
  }
  const previous = await dbRows<any>(c.env.DB.prepare(
    "SELECT id FROM codename_selection_events WHERE session_id = ? AND codename_id = ? AND action = 'passed'"
  ).bind(session.id, codenameId));
  if (previous[0]) return c.json({ success: false, error: 'You cannot return to a codename you already passed.' }, 409);

  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO codename_selection_events (session_id, codename_id, action) VALUES (?, ?, 'passed')").bind(session.id, codenameId),
    c.env.DB.prepare('UPDATE codename_selection_sessions SET passes_used = passes_used + 1 WHERE id = ? AND passes_used < 2').bind(session.id),
  ]);
  const attemptsUsed = Number(session.passes_used || 0) + 1;
  await audit(c.env.DB, actor, 'codename.passed', 'codename', codenameId, { codename: codename.display_name, attemptsUsed });
  return c.json({ success: true, data: { attemptsUsed, maxAttempts: 3, message: `${codename.display_name} passed. It cannot be selected again.` } });
});

app.post('/api/codenames/claim', requireAuth, async (c) => {
  const access = await requireActiveActor(c);
  if (access.response) return access.response;
  const actor = access.actor!;
  const body = await c.req.json().catch(() => ({}));
  const codenameId = Number(body.codenameId);
  if (!Number.isInteger(codenameId) || codenameId < 1) return c.json({ success: false, error: 'Choose a valid codename.' }, 400);
  const session = await getCodenameSession(c.env.DB, actor.profileId!);
  if (!session || session.status !== 'open') return c.json({ success: false, error: 'Codename selection is closed.' }, 409);
  const passed = await dbRows<any>(c.env.DB.prepare(
    "SELECT id FROM codename_selection_events WHERE session_id = ? AND codename_id = ? AND action = 'passed'"
  ).bind(session.id, codenameId));
  if (passed[0]) return c.json({ success: false, error: 'You cannot return to a codename you already passed.' }, 409);

  const result = await c.env.DB.prepare(
    `UPDATE codenames
     SET status = 'claimed', claimed_by_member_profile_id = ?, claimed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status = 'available' AND claimed_by_member_profile_id IS NULL`
  ).bind(actor.profileId, codenameId).run();
  if (Number(result.meta.changes || 0) !== 1) {
    return c.json({ success: false, error: 'This codename was just claimed by another member. Please choose another.' }, 409);
  }
  const codeRows = await dbRows<any>(c.env.DB.prepare('SELECT display_name FROM codenames WHERE id = ?').bind(codenameId));
  const codename = codeRows[0]?.display_name || 'Codename';
  const attemptsUsed = Number(session.passes_used || 0) + 1;
  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE codename_selection_sessions SET status = 'completed', claimed_codename_id = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(codenameId, session.id),
    c.env.DB.prepare("INSERT INTO codename_selection_events (session_id, codename_id, action) VALUES (?, ?, 'claimed')").bind(session.id, codenameId),
    c.env.DB.prepare("INSERT INTO codename_history (codename_id, member_profile_id, event_type, acted_by_user_id, note) VALUES (?, ?, 'claimed', ?, ?)")
      .bind(codenameId, actor.profileId, actor.userId, `Claimed on successful selection ${attemptsUsed}/3`),
  ]);
  await audit(c.env.DB, actor, 'codename.claimed', 'codename', codenameId, { codename, attemptsUsed });
  return c.json({ success: true, data: { codename, attemptsUsed, maxAttempts: 3, message: `${codename} is now your permanent Code Rx identity.` } });
});

// ============================================
// 🗄️ CODE Rx VAULT
// ============================================

app.get('/api/vault/sections', requireAuth, async (c) => {
  const access = await requireActiveActor(c);
  if (access.response) return access.response;
  const actor = access.actor!;
  const sections = await dbRows<any>(c.env.DB.prepare(
    'SELECT id, slug, title, description, is_sensitive, sort_order FROM vault_sections WHERE is_archived = 0 ORDER BY sort_order, title'
  ));
  const visible = [] as any[];
  for (const section of sections) {
    if (await hasVaultPermission(c.env.DB, actor, section.slug, 'view')) {
      visible.push({ ...section, permissions: {
        view: true,
        create: await hasVaultPermission(c.env.DB, actor, section.slug, 'create'),
        edit: await hasVaultPermission(c.env.DB, actor, section.slug, 'edit'),
        delete: await hasVaultPermission(c.env.DB, actor, section.slug, 'delete'),
        manage: await hasVaultPermission(c.env.DB, actor, section.slug, 'manage'),
      } });
    }
  }
  return c.json({ success: true, data: visible });
});

app.get('/api/vault/documents', requireAuth, async (c) => {
  const slug = cleanStr(c.req.query('section'), 1, 60);
  if (!slug) return c.json({ success: false, error: 'Vault section is required' }, 400);
  const access = await vaultAccess(c, slug, 'view');
  if (access.response) return access.response;
  const documents = await dbRows<any>(c.env.DB.prepare(
    `SELECT d.id, d.title, d.visibility, d.file_key, d.created_at, d.updated_at,
            creator.member_code AS created_by_member_id, updater.member_code AS updated_by_member_id
     FROM vault_documents d
     LEFT JOIN member_profiles creator ON creator.id = d.created_by_member_profile_id
     LEFT JOIN member_profiles updater ON updater.id = d.updated_by_member_profile_id
     WHERE d.section_id = ? AND d.is_archived = 0 ORDER BY d.updated_at DESC, d.id DESC`
  ).bind(access.section.id));
  return c.json({ success: true, data: documents });
});

app.get('/api/vault/documents/:id', requireAuth, async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id < 1) return c.json({ success: false, error: 'Invalid document id' }, 400);
  const rows = await dbRows<any>(c.env.DB.prepare(
    `SELECT d.*, s.slug AS section_slug, s.title AS section_title
     FROM vault_documents d JOIN vault_sections s ON s.id = d.section_id WHERE d.id = ?`
  ).bind(id));
  const document = rows[0];
  if (!document || document.is_archived) return c.json({ success: false, error: 'Document not found' }, 404);
  const access = await vaultAccess(c, document.section_slug, 'view');
  if (access.response) return access.response;
  return c.json({ success: true, data: document });
});

app.post('/api/vault/documents', requireAuth, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const slug = cleanStr(body.section, 1, 60);
    const title = cleanStr(body.title, 2, 180);
    const content = cleanOptionalStr(body.content, 100_000) || '';
    const fileKey = cleanOptionalStr(body.fileKey, 500);
    const visibility = body.visibility === 'members' || body.visibility === 'restricted' ? body.visibility : 'section';
    if (!slug || !title) return c.json({ success: false, error: 'Section and document title are required' }, 400);
    const access = await vaultAccess(c, slug, 'create');
    if (access.response) return access.response;
    const actor = access.actor!;
    const created = await c.env.DB.prepare(
      `INSERT INTO vault_documents (section_id, title, content, visibility, file_key, created_by_member_profile_id, updated_by_member_profile_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(access.section.id, title, content, visibility, fileKey, actor.profileId, actor.profileId).run();
    const documentId = Number(created.meta.last_row_id);
    await c.env.DB.prepare(
      'INSERT INTO document_versions (document_id, version_number, title, content, file_key, changed_by_member_profile_id, change_note) VALUES (?, 1, ?, ?, ?, ?, ?)'
    ).bind(documentId, title, content, fileKey, actor.profileId, 'Initial version').run();
    await audit(c.env.DB, actor, 'vault.document.created', 'vault_document', documentId, { section: slug, title });
    return c.json({ success: true, data: { id: documentId }, message: 'Vault document created' });
  } catch (error) {
    console.error('[code-rx] create vault document error:', error);
    return c.json({ success: false, error: 'Could not create the Vault document' }, 500);
  }
});

app.patch('/api/vault/documents/:id', requireAuth, async (c) => {
  try {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id < 1) return c.json({ success: false, error: 'Invalid document id' }, 400);
    const rows = await dbRows<any>(c.env.DB.prepare(
      `SELECT d.*, s.slug AS section_slug FROM vault_documents d JOIN vault_sections s ON s.id = d.section_id WHERE d.id = ?`
    ).bind(id));
    const document = rows[0];
    if (!document || document.is_archived) return c.json({ success: false, error: 'Document not found' }, 404);
    const access = await vaultAccess(c, document.section_slug, 'edit');
    if (access.response) return access.response;
    const actor = access.actor!;
    const body = await c.req.json().catch(() => ({}));
    const title = body.title === undefined ? document.title : cleanStr(body.title, 2, 180);
    const content = body.content === undefined ? document.content : (cleanOptionalStr(body.content, 100_000) || '');
    const fileKey = body.fileKey === undefined ? document.file_key : cleanOptionalStr(body.fileKey, 500);
    const note = cleanOptionalStr(body.changeNote, 1000) || 'Updated document';
    if (!title) return c.json({ success: false, error: 'A valid title is required' }, 400);
    const versionRows = await dbRows<any>(c.env.DB.prepare('SELECT MAX(version_number) AS version FROM document_versions WHERE document_id = ?').bind(id));
    const version = Number(versionRows[0]?.version || 0) + 1;
    await c.env.DB.batch([
      c.env.DB.prepare('UPDATE vault_documents SET title = ?, content = ?, file_key = ?, updated_by_member_profile_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .bind(title, content, fileKey, actor.profileId, id),
      c.env.DB.prepare('INSERT INTO document_versions (document_id, version_number, title, content, file_key, changed_by_member_profile_id, change_note) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(id, version, title, content, fileKey, actor.profileId, note),
    ]);
    await audit(c.env.DB, actor, 'vault.document.edited', 'vault_document', id, { section: document.section_slug, version, note });
    return c.json({ success: true, message: 'Vault document updated', data: { version } });
  } catch (error) {
    console.error('[code-rx] update vault document error:', error);
    return c.json({ success: false, error: 'Could not update the Vault document' }, 500);
  }
});

app.delete('/api/vault/documents/:id', requireAuth, async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id < 1) return c.json({ success: false, error: 'Invalid document id' }, 400);
  const rows = await dbRows<any>(c.env.DB.prepare(
    `SELECT d.id, s.slug AS section_slug FROM vault_documents d JOIN vault_sections s ON s.id = d.section_id WHERE d.id = ?`
  ).bind(id));
  const document = rows[0];
  if (!document) return c.json({ success: false, error: 'Document not found' }, 404);
  const access = await vaultAccess(c, document.section_slug, 'delete');
  if (access.response) return access.response;
  await c.env.DB.prepare('UPDATE vault_documents SET is_archived = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(id).run();
  await audit(c.env.DB, access.actor, 'vault.document.archived', 'vault_document', id, { section: document.section_slug });
  return c.json({ success: true, message: 'Document archived. Its history remains preserved.' });
});

app.get('/api/vault/documents/:id/versions', requireAuth, async (c) => {
  const id = Number(c.req.param('id'));
  const rows = await dbRows<any>(c.env.DB.prepare(
    `SELECT d.id, s.slug AS section_slug FROM vault_documents d JOIN vault_sections s ON s.id = d.section_id WHERE d.id = ?`
  ).bind(id));
  const document = rows[0];
  if (!document) return c.json({ success: false, error: 'Document not found' }, 404);
  const access = await vaultAccess(c, document.section_slug, 'view');
  if (access.response) return access.response;
  const versions = await dbRows<any>(c.env.DB.prepare(
    'SELECT version_number, title, change_note, created_at FROM document_versions WHERE document_id = ? ORDER BY version_number DESC'
  ).bind(id));
  return c.json({ success: true, data: versions });
});

app.get('/api/vault/projects', requireAuth, async (c) => {
  const access = await vaultAccess(c, 'projects', 'view');
  if (access.response) return access.response;
  const projects = await dbRows<any>(c.env.DB.prepare(
    `SELECT p.*, mp.member_code AS lead_member_id, u.name AS lead_name
     FROM vault_projects p
     LEFT JOIN member_profiles mp ON mp.id = p.lead_member_profile_id
     LEFT JOIN users u ON u.id = mp.user_id
     WHERE p.is_archived = 0 ORDER BY p.updated_at DESC`
  ));
  return c.json({ success: true, data: projects });
});

app.post('/api/vault/projects', requireAuth, async (c) => {
  const access = await vaultAccess(c, 'projects', 'create');
  if (access.response) return access.response;
  const actor = access.actor!;
  const body = await c.req.json().catch(() => ({}));
  const title = cleanStr(body.title, 2, 180);
  if (!title) return c.json({ success: false, error: 'Project title is required' }, 400);
  const result = await c.env.DB.prepare(
    `INSERT INTO vault_projects (title, status, description, lead_member_profile_id, github_url, documentation_url, timeline, created_by_member_profile_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    title,
    cleanOptionalStr(body.status, 60) || 'planning',
    cleanOptionalStr(body.description, 10_000) || '',
    Number.isInteger(Number(body.leadMemberProfileId)) ? Number(body.leadMemberProfileId) : actor.profileId,
    cleanOptionalStr(body.githubUrl, 500),
    cleanOptionalStr(body.documentationUrl, 500),
    cleanOptionalStr(body.timeline, 10_000) || '',
    actor.profileId,
  ).run();
  const id = Number(result.meta.last_row_id);
  await audit(c.env.DB, actor, 'vault.project.created', 'vault_project', id, { title });
  return c.json({ success: true, data: { id }, message: 'Vault project created' });
});

app.patch('/api/vault/projects/:id', requireAuth, async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id < 1) return c.json({ success: false, error: 'Invalid project id' }, 400);
  const access = await vaultAccess(c, 'projects', 'edit');
  if (access.response) return access.response;
  const actor = access.actor!;
  const body = await c.req.json().catch(() => ({}));
  const currentRows = await dbRows<any>(c.env.DB.prepare('SELECT * FROM vault_projects WHERE id = ? AND is_archived = 0').bind(id));
  const current = currentRows[0];
  if (!current) return c.json({ success: false, error: 'Project not found' }, 404);
  const title = body.title === undefined ? current.title : cleanStr(body.title, 2, 180);
  if (!title) return c.json({ success: false, error: 'A valid project title is required' }, 400);
  await c.env.DB.prepare(
    `UPDATE vault_projects SET title = ?, status = ?, description = ?, github_url = ?, documentation_url = ?, timeline = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).bind(
    title,
    body.status === undefined ? current.status : (cleanOptionalStr(body.status, 60) || current.status),
    body.description === undefined ? current.description : (cleanOptionalStr(body.description, 10_000) || ''),
    body.githubUrl === undefined ? current.github_url : cleanOptionalStr(body.githubUrl, 500),
    body.documentationUrl === undefined ? current.documentation_url : cleanOptionalStr(body.documentationUrl, 500),
    body.timeline === undefined ? current.timeline : (cleanOptionalStr(body.timeline, 10_000) || ''),
    id,
  ).run();
  await audit(c.env.DB, actor, 'vault.project.edited', 'vault_project', id, { title });
  return c.json({ success: true, message: 'Vault project updated' });
});

app.get('/api/vault/projects/:id', requireAuth, async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id < 1) return c.json({ success: false, error: 'Invalid project id' }, 400);
  const access = await vaultAccess(c, 'projects', 'view');
  if (access.response) return access.response;
  const projectRows = await dbRows<any>(c.env.DB.prepare(
    `SELECT p.*, mp.member_code AS lead_member_id, u.name AS lead_name
     FROM vault_projects p LEFT JOIN member_profiles mp ON mp.id = p.lead_member_profile_id
     LEFT JOIN users u ON u.id = mp.user_id WHERE p.id = ? AND p.is_archived = 0`
  ).bind(id));
  const project = projectRows[0];
  if (!project) return c.json({ success: false, error: 'Project not found' }, 404);
  const [members, tasks, meetings, files] = await Promise.all([
    dbRows<any>(c.env.DB.prepare(
      `SELECT pm.*, mp.member_code, u.name FROM vault_project_members pm
       JOIN member_profiles mp ON mp.id = pm.member_profile_id JOIN users u ON u.id = mp.user_id WHERE pm.project_id = ?`
    ).bind(id)),
    dbRows<any>(c.env.DB.prepare('SELECT * FROM vault_tasks WHERE project_id = ? ORDER BY status, due_at, id').bind(id)),
    dbRows<any>(c.env.DB.prepare('SELECT id, title, held_at, agenda, notes FROM meetings WHERE project_id = ? AND is_archived = 0 ORDER BY held_at DESC').bind(id)),
    dbRows<any>(c.env.DB.prepare('SELECT id, name, file_key, created_at FROM vault_project_files WHERE project_id = ? ORDER BY created_at DESC').bind(id)),
  ]);
  return c.json({ success: true, data: { project, members, tasks, meetings, files } });
});

app.post('/api/vault/projects/:id/tasks', requireAuth, async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id < 1) return c.json({ success: false, error: 'Invalid project id' }, 400);
  const access = await vaultAccess(c, 'projects', 'create');
  if (access.response) return access.response;
  const body = await c.req.json().catch(() => ({}));
  const title = cleanStr(body.title, 2, 180);
  if (!title) return c.json({ success: false, error: 'Task title is required' }, 400);
  const result = await c.env.DB.prepare(
    'INSERT INTO vault_tasks (project_id, title, description, status, assigned_member_profile_id, due_at, created_by_member_profile_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, title, cleanOptionalStr(body.description, 10_000) || '', cleanOptionalStr(body.status, 50) || 'todo',
    Number.isInteger(Number(body.assignedMemberProfileId)) ? Number(body.assignedMemberProfileId) : null,
    cleanOptionalStr(body.dueAt, 80), access.actor!.profileId).run();
  const taskId = Number(result.meta.last_row_id);
  await audit(c.env.DB, access.actor, 'vault.project.task.created', 'vault_task', taskId, { projectId: id, title });
  return c.json({ success: true, data: { id: taskId } }, 201);
});

app.get('/api/vault/meetings', requireAuth, async (c) => {
  const access = await vaultAccess(c, 'meetings', 'view');
  if (access.response) return access.response;
  const meetings = await dbRows<any>(c.env.DB.prepare(
    'SELECT id, project_id, title, held_at, agenda, notes, visibility, created_at FROM meetings WHERE is_archived = 0 ORDER BY held_at DESC'
  ));
  return c.json({ success: true, data: meetings });
});

app.post('/api/vault/meetings', requireAuth, async (c) => {
  const access = await vaultAccess(c, 'meetings', 'create');
  if (access.response) return access.response;
  const body = await c.req.json().catch(() => ({}));
  const title = cleanStr(body.title, 2, 180);
  const heldAt = cleanStr(body.heldAt, 8, 80);
  if (!title || !heldAt) return c.json({ success: false, error: 'Meeting title and date are required' }, 400);
  const sectionRows = await dbRows<any>(c.env.DB.prepare("SELECT id FROM vault_sections WHERE slug = 'meetings'"));
  const result = await c.env.DB.prepare(
    'INSERT INTO meetings (section_id, project_id, title, held_at, agenda, notes, visibility, created_by_member_profile_id, updated_by_member_profile_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(sectionRows[0]?.id || null, Number.isInteger(Number(body.projectId)) ? Number(body.projectId) : null, title, heldAt,
    cleanOptionalStr(body.agenda, 10_000) || '', cleanOptionalStr(body.notes, 50_000) || '', body.visibility === 'restricted' ? 'restricted' : 'members', access.actor!.profileId, access.actor!.profileId).run();
  const meetingId = Number(result.meta.last_row_id);
  await audit(c.env.DB, access.actor, 'vault.meeting.created', 'meeting', meetingId, { title, projectId: body.projectId || null });
  return c.json({ success: true, data: { id: meetingId } }, 201);
});

// ============================================
// 👁️ PHANTOM CONTROL CENTER
// ============================================

app.get('/api/phantom/overview', requireAuth, requirePhantom, async (c) => {
  const actor = await actorFromContext(c);
  const queries = await Promise.all([
    dbRows<any>(c.env.DB.prepare("SELECT COUNT(*) AS count FROM member_profiles WHERE status = 'active'")),
    dbRows<any>(c.env.DB.prepare("SELECT COUNT(*) AS count FROM applications WHERE status = 'pending'")),
    dbRows<any>(c.env.DB.prepare("SELECT COUNT(*) AS count FROM member_profiles WHERE status = 'archived'")),
    dbRows<any>(c.env.DB.prepare("SELECT COUNT(*) AS count FROM website_admins WHERE status = 'active'")),
    dbRows<any>(c.env.DB.prepare('SELECT COUNT(*) AS count FROM vault_documents WHERE is_archived = 0')),
    dbRows<any>(c.env.DB.prepare('SELECT COUNT(*) AS count FROM vault_projects WHERE is_archived = 0')),
    dbRows<any>(c.env.DB.prepare(`SELECT a.*, u.name AS actor_name, mp.member_code AS actor_member_id
      FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_user_id LEFT JOIN member_profiles mp ON mp.id = a.actor_member_profile_id
      ORDER BY a.created_at DESC, a.id DESC LIMIT 10`)),
  ]);
  return c.json({ success: true, data: {
    activeMembers: Number(queries[0][0]?.count || 0),
    pendingApplications: Number(queries[1][0]?.count || 0),
    archivedMembers: Number(queries[2][0]?.count || 0),
    websiteAdmins: Number(queries[3][0]?.count || 0),
    vaultDocuments: Number(queries[4][0]?.count || 0),
    projects: Number(queries[5][0]?.count || 0),
    recentActivity: queries[6],
    actor: actor ? publicActor(actor) : null,
  } });
});

app.get('/api/phantom/applications', requireAuth, requirePhantom, async (c) => {
  const applications = await dbRows<any>(c.env.DB.prepare(
    `SELECT a.*, mp.member_code FROM applications a LEFT JOIN member_profiles mp ON mp.id = a.member_profile_id
     ORDER BY CASE a.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, a.created_at DESC, a.id DESC`
  ));
  return c.json({ success: true, data: applications });
});

app.post('/api/phantom/applications/:id/create-member', requireAuth, requirePhantom, async (c) => {
  try {
    const applicationId = Number(c.req.param('id'));
    if (!Number.isInteger(applicationId) || applicationId < 1) return c.json({ success: false, error: 'Invalid application id' }, 400);
    const applicationRows = await dbRows<any>(c.env.DB.prepare('SELECT * FROM applications WHERE id = ?').bind(applicationId));
    const application = applicationRows[0];
    if (!application) return c.json({ success: false, error: 'Application not found' }, 404);
    if (application.member_profile_id) return c.json({ success: false, error: 'A member was already created from this application.' }, 409);
    if (application.status === 'rejected') return c.json({ success: false, error: 'Rejected applications cannot create members.' }, 409);
    const body = await c.req.json().catch(() => ({}));
    const actor = await actorFromContext(c);
    if (!actor) return c.json({ success: false, error: 'PHANTOM identity not found' }, 403);
    const member = await createMemberAccount({
      env: c.env,
      actor,
      name: cleanStr(body.name, 2, 100) || application.name,
      email: cleanEmail(body.email) || application.email,
      phone: cleanOptionalStr(body.phone, 30) || application.phone || null,
      roleCode: cleanStr(body.roleCode, 2, 50) || 'member',
      applicationId,
      requestHost: c.req.header('host'),
    });
    return c.json({ success: true, data: member, message: 'Member created. Send the activation link securely to the applicant.' }, 201);
  } catch (error) {
    console.error('[code-rx] create member from application error:', error);
    const message = error instanceof Error ? error.message : 'Could not create member';
    return c.json({ success: false, error: message }, /already|valid|PHANTOM/i.test(message) ? 409 : 500);
  }
});

app.post('/api/phantom/members', requireAuth, requirePhantom, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const name = cleanStr(body.name, 2, 100);
    const email = cleanEmail(body.email);
    if (!name || !email) return c.json({ success: false, error: 'Name and valid email are required' }, 400);
    const actor = await actorFromContext(c);
    if (!actor) return c.json({ success: false, error: 'PHANTOM identity not found' }, 403);
    const member = await createMemberAccount({
      env: c.env, actor, name, email,
      phone: cleanOptionalStr(body.phone, 30),
      roleCode: cleanStr(body.roleCode, 2, 50) || 'member',
      requestHost: c.req.header('host'),
    });
    return c.json({ success: true, data: member, message: 'Member created. Activation is required before the account becomes active.' }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not create member';
    return c.json({ success: false, error: message }, /already|valid|PHANTOM/i.test(message) ? 409 : 500);
  }
});

app.get('/api/phantom/members', requireAuth, requirePhantom, async (c) => {
  const status = c.req.query('status');
  const values: unknown[] = [];
  let where = '';
  if (status && ['pending_activation', 'active', 'locked', 'archived'].includes(status)) {
    where = 'WHERE mp.status = ?';
    values.push(status);
  }
  const members = await dbRows<any>(c.env.DB.prepare(
    `SELECT mp.*, u.name, u.email, m.phone, r.code AS role_code, r.name AS role_name, c.display_name AS codename
     FROM member_profiles mp
     LEFT JOIN users u ON u.id = mp.user_id
     LEFT JOIN members m ON m.id = mp.member_record_id
     LEFT JOIN roles r ON r.id = mp.primary_role_id
     LEFT JOIN codenames c ON c.claimed_by_member_profile_id = mp.id AND c.status = 'claimed'
     ${where}
     ORDER BY CASE mp.status WHEN 'pending_activation' THEN 0 WHEN 'active' THEN 1 WHEN 'locked' THEN 2 ELSE 3 END, mp.created_at DESC`
  ).bind(...values));
  return c.json({ success: true, data: members });
});

app.patch('/api/phantom/members/:id', requireAuth, requirePhantom, async (c) => {
  try {
    const profileId = Number(c.req.param('id'));
    if (!Number.isInteger(profileId) || profileId < 1) return c.json({ success: false, error: 'Invalid member profile id' }, 400);
    const body = await c.req.json().catch(() => ({}));
    const actor = await actorFromContext(c);
    const profileRows = await dbRows<any>(c.env.DB.prepare(
      `SELECT mp.*, r.code AS role_code FROM member_profiles mp LEFT JOIN roles r ON r.id = mp.primary_role_id WHERE mp.id = ?`
    ).bind(profileId));
    const profile = profileRows[0];
    if (!profile) return c.json({ success: false, error: 'Member profile not found' }, 404);
    if (profile.role_code === 'phantom' && actor?.profileId !== profileId) {
      return c.json({ success: false, error: 'The PHANTOM founder profile cannot be changed from this action.' }, 403);
    }
    const action = body.action;
    if (action === 'lock' || action === 'unlock' || action === 'archive' || action === 'restore') {
      const status = action === 'lock' ? 'locked' : action === 'unlock' || action === 'restore' ? 'active' : 'archived';
      await c.env.DB.batch([
        c.env.DB.prepare("UPDATE member_profiles SET status = ?, locked_reason = ?, locked_at = CASE WHEN ? = 'locked' THEN CURRENT_TIMESTAMP ELSE NULL END, archived_at = CASE WHEN ? = 'archived' THEN CURRENT_TIMESTAMP ELSE NULL END, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
          .bind(status, action === 'lock' ? cleanOptionalStr(body.reason, 1000) : null, status, status, profileId),
        c.env.DB.prepare('UPDATE members SET is_active = ? WHERE id = ?').bind(status === 'active' ? 1 : 0, profile.member_record_id),
      ]);
      await audit(c.env.DB, actor, `member.${action}`, 'member_profile', profileId, { memberCode: profile.member_code, reason: cleanOptionalStr(body.reason, 1000) });
      return c.json({ success: true, message: `Member ${action}ed`.replace('unlocked', 'unlocked').replace('archiveed', 'archived') });
    }
    if (body.roleCode !== undefined) {
      const roleCode = cleanStr(body.roleCode, 2, 50);
      const roleRows = roleCode ? await dbRows<any>(c.env.DB.prepare('SELECT id, code FROM roles WHERE code = ?').bind(roleCode)) : [];
      const role = roleRows[0];
      if (!role || role.code === 'phantom') return c.json({ success: false, error: 'Choose a valid non-PHANTOM role.' }, 400);
      await c.env.DB.batch([
        c.env.DB.prepare('UPDATE member_profiles SET primary_role_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(role.id, profileId),
        c.env.DB.prepare('INSERT INTO member_role_history (member_profile_id, previous_role_id, new_role_id, changed_by_user_id, reason) VALUES (?, ?, ?, ?, ?)')
          .bind(profileId, profile.primary_role_id, role.id, actor?.userId ?? null, cleanOptionalStr(body.reason, 1000)),
      ]);
      await audit(c.env.DB, actor, 'member.role.reassigned', 'member_profile', profileId, { from: profile.role_code, to: role.code });
      return c.json({ success: true, message: 'Role reassigned and history preserved.' });
    }
    return c.json({ success: false, error: 'Choose a member action or role reassignment.' }, 400);
  } catch (error) {
    console.error('[code-rx] phantom member update error:', error);
    return c.json({ success: false, error: 'Could not update this member' }, 500);
  }
});

app.get('/api/phantom/members/:id/history', requireAuth, requirePhantom, async (c) => {
  const profileId = Number(c.req.param('id'));
  if (!Number.isInteger(profileId) || profileId < 1) return c.json({ success: false, error: 'Invalid member profile id' }, 400);
  const [roles, codenames, activity] = await Promise.all([
    dbRows<any>(c.env.DB.prepare(
      `SELECT h.*, old_role.code AS previous_role, new_role.code AS new_role, u.name AS changed_by
       FROM member_role_history h LEFT JOIN roles old_role ON old_role.id = h.previous_role_id
       LEFT JOIN roles new_role ON new_role.id = h.new_role_id LEFT JOIN users u ON u.id = h.changed_by_user_id
       WHERE h.member_profile_id = ? ORDER BY h.changed_at DESC`
    ).bind(profileId)),
    dbRows<any>(c.env.DB.prepare('SELECT * FROM codename_history WHERE member_profile_id = ? ORDER BY created_at DESC').bind(profileId)),
    dbRows<any>(c.env.DB.prepare('SELECT * FROM audit_logs WHERE actor_member_profile_id = ? OR (subject_type = ? AND subject_id = ?) ORDER BY created_at DESC LIMIT 100')
      .bind(profileId, 'member_profile', String(profileId))),
  ]);
  return c.json({ success: true, data: { roles, codenames, activity } });
});

app.get('/api/phantom/roles', requireAuth, requirePhantom, async (c) => {
  const roles = await dbRows<any>(c.env.DB.prepare(`SELECT * FROM roles ORDER BY CASE code WHEN 'phantom' THEN 0 ELSE 1 END, name`));
  const permissions = await dbRows<any>(c.env.DB.prepare('SELECT * FROM role_permissions ORDER BY role_id, section_slug'));
  const sections = await dbRows<any>(c.env.DB.prepare('SELECT slug, title, description, is_sensitive, sort_order FROM vault_sections WHERE is_archived = 0 ORDER BY sort_order, title'));
  return c.json({ success: true, data: { roles, permissions, actions: VAULT_ACTIONS, sections } });
});

app.post('/api/phantom/roles', requireAuth, requirePhantom, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const code = cleanStr(body.code, 2, 50)?.toLowerCase().replace(/[^a-z0-9_-]/g, '');
    const name = cleanStr(body.name, 2, 100);
    const description = cleanOptionalStr(body.description, 1000) || '';
    if (!code || !name || code === 'phantom') return c.json({ success: false, error: 'A valid custom role code and name are required.' }, 400);
    const result = await c.env.DB.prepare('INSERT INTO roles (code, name, description, is_system) VALUES (?, ?, ?, 0)').bind(code, name, description).run();
    const roleId = Number(result.meta.last_row_id);
    for (const [slug] of VAULT_SECTION_SEEDS) {
      await c.env.DB.prepare('INSERT INTO role_permissions (role_id, section_slug) VALUES (?, ?)').bind(roleId, slug).run();
    }
    await audit(c.env.DB, await actorFromContext(c), 'role.created', 'role', roleId, { code, name });
    return c.json({ success: true, data: { id: roleId, code, name } }, 201);
  } catch (error: any) {
    if (String(error?.message || '').includes('UNIQUE')) return c.json({ success: false, error: 'That role code already exists.' }, 409);
    return c.json({ success: false, error: 'Could not create role' }, 500);
  }
});

app.put('/api/phantom/roles/:id/permissions', requireAuth, requirePhantom, async (c) => {
  try {
    const roleId = Number(c.req.param('id'));
    if (!Number.isInteger(roleId) || roleId < 1) return c.json({ success: false, error: 'Invalid role id' }, 400);
    const body = await c.req.json().catch(() => ({}));
    if (!Array.isArray(body.permissions)) return c.json({ success: false, error: 'A permission matrix is required.' }, 400);
    const validSections = new Set((await dbRows<any>(c.env.DB.prepare('SELECT slug FROM vault_sections WHERE is_archived = 0'))).map((section) => section.slug));
    for (const row of body.permissions) {
      const slug = cleanStr(row.sectionSlug, 1, 60);
      if (!slug || !validSections.has(slug)) return c.json({ success: false, error: `Invalid Vault section: ${row.sectionSlug || ''}` }, 400);
      await c.env.DB.prepare(
        `INSERT INTO role_permissions (role_id, section_slug, can_view, can_create, can_edit, can_delete, can_manage, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(role_id, section_slug) DO UPDATE SET
           can_view = excluded.can_view, can_create = excluded.can_create, can_edit = excluded.can_edit,
           can_delete = excluded.can_delete, can_manage = excluded.can_manage, updated_at = CURRENT_TIMESTAMP`
      ).bind(roleId, slug, row.canView ? 1 : 0, row.canCreate ? 1 : 0, row.canEdit ? 1 : 0, row.canDelete ? 1 : 0, row.canManage ? 1 : 0).run();
    }
    await audit(c.env.DB, await actorFromContext(c), 'role.permissions.changed', 'role', roleId, { permissionRows: body.permissions.length });
    return c.json({ success: true, message: 'Role permissions updated.' });
  } catch (error) {
    console.error('[code-rx] role permissions error:', error);
    return c.json({ success: false, error: 'Could not update role permissions' }, 500);
  }
});

app.put('/api/phantom/members/:id/permissions', requireAuth, requirePhantom, async (c) => {
  try {
    const profileId = Number(c.req.param('id'));
    const body = await c.req.json().catch(() => ({}));
    if (!Number.isInteger(profileId) || profileId < 1 || !Array.isArray(body.permissions)) {
      return c.json({ success: false, error: 'A member and permission matrix are required.' }, 400);
    }
    const validSections = new Set((await dbRows<any>(c.env.DB.prepare('SELECT slug FROM vault_sections WHERE is_archived = 0'))).map((section) => section.slug));
    for (const row of body.permissions) {
      const slug = cleanStr(row.sectionSlug, 1, 60);
      if (!slug || !validSections.has(slug)) return c.json({ success: false, error: 'Invalid Vault section.' }, 400);
      await c.env.DB.prepare(
        `INSERT INTO member_permission_overrides (member_profile_id, section_slug, can_view, can_create, can_edit, can_delete, can_manage, updated_by_user_id, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(member_profile_id, section_slug) DO UPDATE SET
           can_view = excluded.can_view, can_create = excluded.can_create, can_edit = excluded.can_edit,
           can_delete = excluded.can_delete, can_manage = excluded.can_manage,
           updated_by_user_id = excluded.updated_by_user_id, updated_at = CURRENT_TIMESTAMP`
      ).bind(profileId, slug,
        row.canView === null ? null : row.canView ? 1 : 0,
        row.canCreate === null ? null : row.canCreate ? 1 : 0,
        row.canEdit === null ? null : row.canEdit ? 1 : 0,
        row.canDelete === null ? null : row.canDelete ? 1 : 0,
        row.canManage === null ? null : row.canManage ? 1 : 0,
        (await actorFromContext(c))?.userId ?? null,
      ).run();
    }
    await audit(c.env.DB, await actorFromContext(c), 'member.permissions.changed', 'member_profile', profileId, { permissionRows: body.permissions.length });
    return c.json({ success: true, message: 'Member permission overrides updated.' });
  } catch (error) {
    console.error('[code-rx] member permissions error:', error);
    return c.json({ success: false, error: 'Could not update member permissions' }, 500);
  }
});

const WEBSITE_PERMISSION_KEYS = [
  'pages.edit', 'announcements.manage', 'events.manage', 'projects.manage',
  'media.upload', 'resources.manage', 'content.manage',
] as const;

app.get('/api/phantom/website-admins', requireAuth, requirePhantom, async (c) => {
  const admins = await dbRows<any>(c.env.DB.prepare(
    `SELECT wa.*, mp.member_code, u.name, u.email, r.code AS role_code
     FROM website_admins wa
     JOIN member_profiles mp ON mp.id = wa.member_profile_id
     JOIN users u ON u.id = mp.user_id
     LEFT JOIN roles r ON r.id = mp.primary_role_id
     ORDER BY wa.status, wa.assigned_at DESC`
  ));
  const permissions = await dbRows<any>(c.env.DB.prepare('SELECT * FROM website_admin_permissions ORDER BY website_admin_id, permission_key'));
  return c.json({ success: true, data: { admins, permissions, availablePermissions: WEBSITE_PERMISSION_KEYS } });
});

app.post('/api/phantom/website-admins', requireAuth, requirePhantom, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const profileId = Number(body.memberProfileId);
    const permissionKeys = Array.isArray(body.permissions) ? body.permissions.filter((key: unknown) => typeof key === 'string' && (WEBSITE_PERMISSION_KEYS as readonly string[]).includes(key)) : [];
    if (!Number.isInteger(profileId) || profileId < 1) return c.json({ success: false, error: 'Choose an active member.' }, 400);
    const profileRows = await dbRows<any>(c.env.DB.prepare("SELECT id, status FROM member_profiles WHERE id = ?").bind(profileId));
    if (!profileRows[0] || profileRows[0].status !== 'active') return c.json({ success: false, error: 'Website Admin must be an active member.' }, 409);
    const actor = await actorFromContext(c);
    await c.env.DB.prepare(
      `INSERT INTO website_admins (member_profile_id, status, assigned_by_user_id, assigned_at, suspended_at)
       VALUES (?, 'active', ?, CURRENT_TIMESTAMP, NULL)
       ON CONFLICT(member_profile_id) DO UPDATE SET status = 'active', assigned_by_user_id = excluded.assigned_by_user_id, assigned_at = CURRENT_TIMESTAMP, suspended_at = NULL`
    ).bind(profileId, actor?.userId ?? null).run();
    const row = await dbRows<any>(c.env.DB.prepare('SELECT id FROM website_admins WHERE member_profile_id = ?').bind(profileId));
    const websiteAdminId = row[0]?.id;
    await c.env.DB.prepare('DELETE FROM website_admin_permissions WHERE website_admin_id = ?').bind(websiteAdminId).run();
    for (const permission of permissionKeys) {
      await c.env.DB.prepare('INSERT INTO website_admin_permissions (website_admin_id, permission_key, allowed) VALUES (?, ?, 1)').bind(websiteAdminId, permission).run();
    }
    await audit(c.env.DB, actor, 'website_admin.assigned', 'member_profile', profileId, { permissions: permissionKeys });
    return c.json({ success: true, message: 'Website Admin assigned.' });
  } catch (error) {
    console.error('[code-rx] assign website admin error:', error);
    return c.json({ success: false, error: 'Could not assign Website Admin' }, 500);
  }
});

app.patch('/api/phantom/website-admins/:id', requireAuth, requirePhantom, async (c) => {
  try {
    const id = Number(c.req.param('id'));
    const body = await c.req.json().catch(() => ({}));
    if (!Number.isInteger(id) || id < 1) return c.json({ success: false, error: 'Invalid Website Admin id' }, 400);
    const status = body.status;
    if (status && !['active', 'suspended', 'removed'].includes(status)) return c.json({ success: false, error: 'Invalid Website Admin status' }, 400);
    const actor = await actorFromContext(c);
    if (status) {
      await c.env.DB.prepare("UPDATE website_admins SET status = ?, suspended_at = CASE WHEN ? = 'suspended' THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id = ?")
        .bind(status, status, id).run();
    }
    if (Array.isArray(body.permissions)) {
      const permissionKeys = body.permissions.filter((key: unknown) => typeof key === 'string' && (WEBSITE_PERMISSION_KEYS as readonly string[]).includes(key));
      await c.env.DB.prepare('DELETE FROM website_admin_permissions WHERE website_admin_id = ?').bind(id).run();
      for (const permission of permissionKeys) await c.env.DB.prepare('INSERT INTO website_admin_permissions (website_admin_id, permission_key, allowed) VALUES (?, ?, 1)').bind(id, permission).run();
    }
    await audit(c.env.DB, actor, `website_admin.${status || 'permissions_updated'}`, 'website_admin', id, { permissions: body.permissions || null });
    return c.json({ success: true, message: 'Website Admin updated.' });
  } catch (error) {
    console.error('[code-rx] update website admin error:', error);
    return c.json({ success: false, error: 'Could not update Website Admin' }, 500);
  }
});

app.get('/api/phantom/vault-sections', requireAuth, requirePhantom, async (c) => {
  const sections = await dbRows<any>(c.env.DB.prepare('SELECT * FROM vault_sections ORDER BY is_archived, sort_order, title'));
  return c.json({ success: true, data: sections });
});

app.post('/api/phantom/vault-sections', requireAuth, requirePhantom, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const slug = cleanStr(body.slug, 2, 60)?.toLowerCase().replace(/[^a-z0-9_-]/g, '');
    const title = cleanStr(body.title, 2, 100);
    if (!slug || !title) return c.json({ success: false, error: 'A valid section slug and title are required.' }, 400);
    const result = await c.env.DB.prepare(
      'INSERT INTO vault_sections (slug, title, description, is_sensitive, sort_order) VALUES (?, ?, ?, ?, ?)'
    ).bind(slug, title, cleanOptionalStr(body.description, 1000) || '', body.isSensitive ? 1 : 0, Number(body.sortOrder) || 100).run();
    const sectionId = Number(result.meta.last_row_id);
    const roles = await dbRows<any>(c.env.DB.prepare('SELECT id, code FROM roles'));
    for (const role of roles) {
      const all = role.code === 'phantom' ? [1, 1, 1, 1, 1] : [0, 0, 0, 0, 0];
      await c.env.DB.prepare('INSERT INTO role_permissions (role_id, section_slug, can_view, can_create, can_edit, can_delete, can_manage) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(role.id, slug, ...all).run();
    }
    await audit(c.env.DB, await actorFromContext(c), 'vault.section.created', 'vault_section', sectionId, { slug, title });
    return c.json({ success: true, data: { id: sectionId, slug, title } }, 201);
  } catch (error: any) {
    if (String(error?.message || '').includes('UNIQUE')) return c.json({ success: false, error: 'That Vault section already exists.' }, 409);
    return c.json({ success: false, error: 'Could not create Vault section.' }, 500);
  }
});

app.patch('/api/phantom/vault-sections/:id', requireAuth, requirePhantom, async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));
  if (!Number.isInteger(id) || id < 1) return c.json({ success: false, error: 'Invalid Vault section id.' }, 400);
  const fields: string[] = [];
  const values: unknown[] = [];
  if (body.title !== undefined) { const title = cleanStr(body.title, 2, 100); if (!title) return c.json({ success: false, error: 'Invalid title.' }, 400); fields.push('title = ?'); values.push(title); }
  if (body.description !== undefined) { fields.push('description = ?'); values.push(cleanOptionalStr(body.description, 1000) || ''); }
  if (body.isSensitive !== undefined) { fields.push('is_sensitive = ?'); values.push(body.isSensitive ? 1 : 0); }
  if (body.sortOrder !== undefined && Number.isFinite(Number(body.sortOrder))) { fields.push('sort_order = ?'); values.push(Number(body.sortOrder)); }
  if (body.archive !== undefined) { fields.push('is_archived = ?'); values.push(body.archive ? 1 : 0); }
  if (!fields.length) return c.json({ success: false, error: 'No Vault section changes supplied.' }, 400);
  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);
  await c.env.DB.prepare(`UPDATE vault_sections SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
  await audit(c.env.DB, await actorFromContext(c), 'vault.section.updated', 'vault_section', id, { fields: fields.slice(0, -1) });
  return c.json({ success: true, message: 'Vault section updated.' });
});

app.get('/api/phantom/codenames', requireAuth, requirePhantom, async (c) => {
  const codenames = await dbRows<any>(c.env.DB.prepare(
    `SELECT c.*, mp.member_code, u.name AS owner_name
     FROM codenames c
     LEFT JOIN member_profiles mp ON mp.id = c.claimed_by_member_profile_id
     LEFT JOIN users u ON u.id = mp.user_id
     ORDER BY CASE c.status WHEN 'available' THEN 0 WHEN 'reserved' THEN 1 WHEN 'claimed' THEN 2 ELSE 3 END, c.display_name COLLATE NOCASE`
  ));
  const history = await dbRows<any>(c.env.DB.prepare('SELECT * FROM codename_history ORDER BY created_at DESC, id DESC LIMIT 100'));
  return c.json({ success: true, data: { codenames, history } });
});

app.post('/api/phantom/codenames', requireAuth, requirePhantom, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const displayName = cleanStr(body.name, 2, 50)?.replace(/\s+/g, ' ');
    if (!displayName || !/^[A-Za-z0-9][A-Za-z0-9 ._-]*$/.test(displayName)) {
      return c.json({ success: false, error: 'Use a 2–50 character codename with letters, numbers, spaces, dots, hyphens, or underscores.' }, 400);
    }
    const normalized = normalizeCodename(displayName);
    const actor = await actorFromContext(c);
    const result = await c.env.DB.prepare(
      'INSERT INTO codenames (normalized_name, display_name, status, created_by_user_id) VALUES (?, ?, ?, ?)'
    ).bind(normalized, displayName, body.reserve ? 'reserved' : 'available', actor?.userId ?? null).run();
    const id = Number(result.meta.last_row_id);
    await c.env.DB.prepare('INSERT INTO codename_history (codename_id, event_type, acted_by_user_id, note) VALUES (?, ?, ?, ?)')
      .bind(id, body.reserve ? 'reserved' : 'added', actor?.userId ?? null, cleanOptionalStr(body.note, 1000)).run();
    await audit(c.env.DB, actor, `codename.${body.reserve ? 'reserved' : 'added'}`, 'codename', id, { name: displayName });
    return c.json({ success: true, data: { id, displayName } }, 201);
  } catch (error: any) {
    if (String(error?.message || '').includes('UNIQUE')) return c.json({ success: false, error: 'That codename already exists.' }, 409);
    return c.json({ success: false, error: 'Could not add codename' }, 500);
  }
});

app.patch('/api/phantom/codenames/:id', requireAuth, requirePhantom, async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));
  if (!Number.isInteger(id) || id < 1) return c.json({ success: false, error: 'Invalid codename id' }, 400);
  const rows = await dbRows<any>(c.env.DB.prepare('SELECT * FROM codenames WHERE id = ?').bind(id));
  const codename = rows[0];
  if (!codename) return c.json({ success: false, error: 'Codename not found' }, 404);
  const action = body.action;
  if (!['reserve', 'unreserve', 'retire'].includes(action)) return c.json({ success: false, error: 'Choose reserve, unreserve, or retire.' }, 400);
  if (codename.status === 'claimed') return c.json({ success: false, error: 'Claimed codenames are historical records and cannot be removed or reserved.' }, 409);
  const nextStatus = action === 'reserve' ? 'reserved' : action === 'unreserve' ? 'available' : 'retired';
  const actor = await actorFromContext(c);
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE codenames SET status = ?, reserved_note = ?, reserved_by_user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(nextStatus, action === 'reserve' ? cleanOptionalStr(body.note, 1000) : null, action === 'reserve' ? actor?.userId ?? null : null, id),
    c.env.DB.prepare('INSERT INTO codename_history (codename_id, event_type, acted_by_user_id, note) VALUES (?, ?, ?, ?)')
      .bind(id, action === 'retire' ? 'retired' : action === 'reserve' ? 'reserved' : 'unreserved', actor?.userId ?? null, cleanOptionalStr(body.note, 1000)),
  ]);
  await audit(c.env.DB, actor, `codename.${action}`, 'codename', id, { name: codename.display_name });
  return c.json({ success: true, message: `Codename ${action}d`.replace('retired', 'retired') });
});

app.post('/api/phantom/codenames/:id/release', requireAuth, requirePhantom, async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));
  if (!Number.isInteger(id) || id < 1 || body.confirm !== true) return c.json({ success: false, error: 'Explicit release confirmation is required.' }, 400);
  const mode = body.mode === 'available' ? 'available' : 'retired';
  const rows = await dbRows<any>(c.env.DB.prepare('SELECT * FROM codenames WHERE id = ?').bind(id));
  const codename = rows[0];
  if (!codename || codename.status !== 'claimed') return c.json({ success: false, error: 'Only a claimed codename can be explicitly released.' }, 409);
  const actor = await actorFromContext(c);
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE codenames SET status = ?, claimed_by_member_profile_id = NULL, claimed_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(mode, id),
    c.env.DB.prepare("INSERT INTO codename_history (codename_id, member_profile_id, event_type, acted_by_user_id, note) VALUES (?, ?, 'released', ?, ?)")
      .bind(id, codename.claimed_by_member_profile_id, actor?.userId ?? null, mode === 'available' ? 'Explicitly released back to ballot by PHANTOM' : 'Explicitly released and retired by PHANTOM'),
  ]);
  await audit(c.env.DB, actor, 'codename.released', 'codename', id, { mode, name: codename.display_name });
  return c.json({ success: true, message: mode === 'available' ? 'Codename explicitly returned to the ballot.' : 'Codename released and retired.' });
});

app.get('/api/phantom/audit-logs', requireAuth, requirePhantom, async (c) => {
  const limit = Math.min(200, Math.max(1, Number(c.req.query('limit') || 100)));
  const logs = await dbRows<any>(c.env.DB.prepare(
    `SELECT a.*, u.name AS actor_name, mp.member_code AS actor_member_code
     FROM audit_logs a
     LEFT JOIN users u ON u.id = a.actor_user_id
     LEFT JOIN member_profiles mp ON mp.id = a.actor_member_profile_id
     ORDER BY a.created_at DESC, a.id DESC LIMIT ?`
  ).bind(limit));
  return c.json({ success: true, data: logs });
});

app.get('/api/phantom/settings', requireAuth, requirePhantom, async (c) => {
  const settings = await dbRows<any>(c.env.DB.prepare('SELECT setting_key, setting_value, updated_at FROM system_settings ORDER BY setting_key'));
  // Defensive masking for any values inserted before secret-key validation was introduced.
  const safeSettings = settings.map((setting) => ({
    ...setting,
    setting_value: /(secret|password|token|api[_-]?key|credential)/i.test(setting.setting_key) ? '••••••••' : setting.setting_value,
  }));
  return c.json({ success: true, data: safeSettings });
});

app.put('/api/phantom/settings/:key', requireAuth, requirePhantom, async (c) => {
  const key = cleanStr(c.req.param('key'), 2, 100);
  const body = await c.req.json().catch(() => ({}));
  const value = cleanStr(body.value, 1, 10_000);
  if (!key || !value) return c.json({ success: false, error: 'Setting key and value are required.' }, 400);
  if (/(secret|password|token|api[_-]?key|credential)/i.test(key)) {
    return c.json({ success: false, error: 'Secrets must be stored as encrypted Cloudflare secrets, never in Vault system settings.' }, 400);
  }
  const actor = await actorFromContext(c);
  await c.env.DB.prepare(
    `INSERT INTO system_settings (setting_key, setting_value, updated_by_user_id, updated_at)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_by_user_id = excluded.updated_by_user_id, updated_at = CURRENT_TIMESTAMP`
  ).bind(key, value, actor?.userId ?? null).run();
  await audit(c.env.DB, actor, 'system.setting.changed', 'setting', key, { valueChanged: true });
  return c.json({ success: true, message: 'System setting saved.' });
});

// ============================================
// 📦 R2 STORAGE
// ============================================

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME_PREFIXES = ['image/', 'application/pdf', 'text/', 'application/zip', 'application/json'];

app.post('/api/vault/upload', requireAuth, async (c) => {
  try {
    const formData = await c.req.formData();
    const section = cleanStr(formData.get('section') || '', 1, 60);
    if (!section) return c.json({ success: false, error: 'Vault section is required.' }, 400);
    const access = await vaultAccess(c, section, 'create');
    if (access.response) return access.response;
    const file = formData.get('file');
    if (!(file instanceof File)) return c.json({ success: false, error: 'No file provided.' }, 400);
    if (file.size > MAX_UPLOAD_BYTES) return c.json({ success: false, error: 'File too large (max 10 MB).' }, 413);
    const mime = file.type || 'application/octet-stream';
    if (!ALLOWED_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix))) return c.json({ success: false, error: `File type "${mime}" is not allowed.` }, 415);
    const safeName = (file.name || 'vault-file').replace(/[^\w.\-() ]/g, '_').slice(-100);
    const key = `vault/${section}/${access.actor!.profileId}/${Date.now()}-${safeName}`;
    await c.env.BUCKET.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: mime } });
    await audit(c.env.DB, access.actor, 'vault.file.uploaded', 'vault_file', key, { section, name: safeName });
    return c.json({ success: true, fileKey: key, url: `/api/vault-files/${encodeURIComponent(key).replace(/%2F/g, '/')}` });
  } catch (error) {
    console.error('[code-rx] vault upload error:', error);
    return c.json({ success: false, error: 'Vault upload failed.' }, 500);
  }
});

app.get('/api/vault-files/*', requireAuth, async (c) => {
  try {
    const url = new URL(c.req.url);
    const key = decodeURIComponent(url.pathname.replace(/^\/api\/vault-files\//, ''));
    const match = key.match(/^vault\/([^/]+)\//);
    if (!match) return c.json({ success: false, error: 'Invalid Vault file path.' }, 400);
    const access = await vaultAccess(c, match[1], 'view');
    if (access.response) return access.response;
    const object = await c.env.BUCKET.get(key);
    if (!object) return c.json({ success: false, error: 'File not found.' }, 404);
    return new Response(object.body, { headers: { 'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream', 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('[code-rx] vault file read error:', error);
    return c.json({ success: false, error: 'Could not read Vault file.' }, 500);
  }
});

app.post('/api/upload', requireAuth, requireWebsitePermission('media.upload'), async (c) => {
  try {
    const formData = await c.req.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) return c.json({ success: false, error: 'No file provided' }, 400);

    if (file.size > MAX_UPLOAD_BYTES) {
      return c.json({ success: false, error: 'File too large (max 10 MB)' }, 413);
    }
    const mime = file.type || 'application/octet-stream';
    if (!ALLOWED_MIME_PREFIXES.some((p) => mime.startsWith(p))) {
      return c.json({ success: false, error: `File type "${mime}" is not allowed` }, 415);
    }

    const folder = cleanOptionalStr(formData.get('folder') || '', 100) ?? 'uploads';
    const safeName = (file.name || 'file').replace(/[^\w.\-() ]/g, '_').slice(-100);
    const key = `${folder}/${Date.now()}-${safeName}`;

    // Buffer the file (max 10 MB) — miniflare's local R2 emulator cannot
    // persist raw streams; an ArrayBuffer has a known length and works
    // identically in production.
    const buffer = await file.arrayBuffer();
    await c.env.BUCKET.put(key, buffer, { httpMetadata: { contentType: mime } });
    return c.json({ success: true, filename: key, url: `/api/files/${encodeURIComponent(key).replace(/%2F/g, '/')}` });
  } catch (e) {
    console.error('[code-rx] upload error:', e);
    return c.json({ success: false, error: 'Upload failed. Check the R2 binding "BUCKET".' }, 500);
  }
});

// Public read of stored files
// NOTE: Hono v4.12 does not expose the '*' wildcard param, so the key is
// parsed from the URL path directly.
app.get('/api/files/*', async (c) => {
  try {
    const url = new URL(c.req.url);
    const key = decodeURIComponent(url.pathname.replace(/^\/api\/files\//, ''));
    if (!key) return c.json({ success: false, error: 'File not found' }, 404);
    if (key.startsWith('vault/')) return c.json({ success: false, error: 'Vault files require an authorized Vault session.' }, 403);
    const object = await c.env.BUCKET.get(key);
    if (!object) return c.json({ success: false, error: 'File not found' }, 404);
    return new Response(object.body, {
      headers: {
        'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (e) {
    console.error('[code-rx] get file error:', e);
    return c.json({ success: false, error: 'Failed to get file' }, 500);
  }
});


// ---------- JSON 404 & error handler ----------
app.notFound((c) => c.json({ success: false, error: `Not found: ${c.req.path}` }, 404));

app.onError((err, c) => {
  console.error('[code-rx] unhandled error:', err);
  return c.json({ success: false, error: 'Internal server error' }, 500);
});

// ============================================
// Pages entrypoint: /api/* -> Hono app.
// Everything else -> static assets (with SPA fallback to index.html).
// ============================================
export const onRequest: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);

  if (url.pathname.startsWith('/api/')) {
    return app.fetch(context.request, context.env, context);
  }

  const res = await context.next();

  // SPA fallback: unknown HTML navigation -> index.html
  if (res.status === 404 && (context.request.headers.get('accept') || '').includes('text/html')) {
    try {
      const index = await context.env.ASSETS?.fetch(new URL('/', url));
      if (index && index.ok) {
        return new Response(index.body, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      }
    } catch { /* fall through to the 404 */ }
  }

  return res;
};

export default app;
