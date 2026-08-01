// Cloudflare Pages Functions - CODE Rx SOCIETY API
// Complete backend: D1 database, R2 storage, real auth (PBKDF2 + JWT),
// protected admin routes, validation, and rate limiting.

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './env';
import { ensureSchema } from './lib/schema';
import { hashPassword, verifyPassword, signToken, requireAuth, requireAdmin, JwtPayload } from './lib/auth';
import { cleanStr, cleanEmail, cleanOptionalStr } from './lib/validate';
import { checkRateLimit } from './lib/rate-limit';
import { sendEmail } from './lib/email';

type AppEnv = { Bindings: Env; Variables: { user: JwtPayload } };

const app = new Hono<AppEnv>();

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

    const token = await signToken({ sub: String(user.id), email: user.email, role: user.role }, c.env.JWT_SECRET);
    return c.json({
      success: true,
      token,
      user: { id: user.id, email: user.email, name: user.name || '', role: user.role },
    });
  } catch (e) {
    console.error('[code-rx] login error:', e);
    return c.json({ success: false, error: 'Login failed. Please try again.' }, 500);
  }
});

// Register a member account (rate limited: 5/min per IP)
app.post('/api/auth/register', async (c) => {
  if (!checkRateLimit(c, 5, 60)) {
    return c.json({ success: false, error: 'Too many attempts. Please wait a minute.' }, 429);
  }
  try {
    const body = await c.req.json().catch(() => ({}));
    const name = cleanStr(body.name, 2, 100);
    const email = cleanEmail(body.email);
    const password = cleanStr(body.password, 6, 128);
    if (!name || !email || !password) {
      return c.json({ success: false, error: 'Name, a valid email, and a password (min 6 characters) are required' }, 400);
    }

    const password_hash = await hashPassword(password);
    const result = await c.env.DB
      .prepare('INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)')
      .bind(email, name, password_hash, 'member')
      .run();

    const token = await signToken({ sub: String(result.meta.last_row_id), email, role: 'member' }, c.env.JWT_SECRET);
    return c.json({
      success: true,
      token,
      user: { id: result.meta.last_row_id, email, name, role: 'member' },
    });
  } catch (e: any) {
    if (e?.message?.includes('UNIQUE')) {
      return c.json({ success: false, error: 'An account with this email already exists. Please sign in.' }, 409);
    }
    console.error('[code-rx] register error:', e);
    return c.json({ success: false, error: 'Registration failed. Please try again.' }, 500);
  }
});

// Current user (valid token required)
app.get('/api/auth/me', requireAuth, async (c) => {
  const payload = c.get('user');
  const { results } = await c.env.DB
    .prepare('SELECT id, email, name, role FROM users WHERE id = ?')
    .bind(payload.sub)
    .all<any>();
  const user = results[0];
  if (!user) return c.json({ success: false, error: 'User not found' }, 404);
  return c.json({ success: true, user });
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
      .bind(email, token, expiresAt)
      .run();

    const base = c.env.SITE_URL || `https://${c.req.header('host') || 'coderxsociety.pages.dev'}`;
    const resetLink = `${base}/#reset?token=${token}&email=${encodeURIComponent(email)}`;

    const sent = await sendEmail(c.env, c.env.EMAILJS_TEMPLATE_ID_RESET || '', {
      to_email: email,
      name: user.name || 'there',
      reset_link: resetLink,
    });

    // Dev convenience: when EmailJS is not configured, return the link so the
    // flow can still be tested locally. Never happens in production with keys.
    if (!sent) {
      return c.json({
        success: true,
        message: 'Email service is not configured — reset link (dev only):',
        devResetLink: resetLink,
      });
    }
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

    const { results } = await c.env.DB
      .prepare('SELECT * FROM password_resets WHERE email = ? AND token = ?')
      .bind(email, token)
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

app.get('/api/applications', requireAdmin, async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM applications ORDER BY date DESC, id DESC').all();
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
    const phone = cleanOptionalStr(body.phone, 30);

    if (!name || !email) {
      return c.json({ success: false, error: 'Please provide your name and a valid email address' }, 400);
    }

    await c.env.DB
      .prepare('INSERT INTO applications (name, email, phone, date, status) VALUES (?, ?, ?, ?, ?)')
      .bind(name, email, phone ?? null, new Date().toISOString().split('T')[0], 'pending')
      .run();

    // Also capture as a newsletter subscriber (idempotent)
    await c.env.DB
      .prepare('INSERT OR IGNORE INTO subscribers (email, name, phone, date, source) VALUES (?, ?, ?, ?, ?)')
      .bind(email, name, phone ?? null, new Date().toISOString().split('T')[0], 'application')
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

app.patch('/api/applications/:id', requireAdmin, async (c) => {
  try {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id < 1) return c.json({ success: false, error: 'Invalid id' }, 400);
    const body = await c.req.json().catch(() => ({}));
    if (body.status !== 'approved' && body.status !== 'rejected') {
      return c.json({ success: false, error: 'Status must be "approved" or "rejected"' }, 400);
    }

    const { results } = await c.env.DB.prepare('SELECT * FROM applications WHERE id = ?').bind(id).all<any>();
    const application = results[0];
    if (!application) return c.json({ success: false, error: 'Application not found' }, 404);

    await c.env.DB.prepare('UPDATE applications SET status = ? WHERE id = ?').bind(body.status, id).run();

    // On approval, promote the applicant to a member (skip if they already exist)
    if (body.status === 'approved') {
      try {
        await c.env.DB
          .prepare('INSERT OR IGNORE INTO members (name, email, phone, role, joined_date, points, level) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .bind(application.name, application.email, application.phone ?? null, 'member', new Date().toISOString().split('T')[0], 0, 'Pharmacy Technologist')
          .run();
      } catch (e) {
        console.error('[code-rx] member promotion error:', e);
      }

      // Notify the applicant of their approval (non-blocking)
      await sendEmail(c.env, c.env.EMAILJS_TEMPLATE_ID_APPROVAL || '', {
        to_email: application.email,
        member_name: application.name,
        date: new Date().toISOString().split('T')[0],
      });
    } else {
      // Notify on rejection too (uses the same approval template variable set)
      await sendEmail(c.env, c.env.EMAILJS_TEMPLATE_ID_APPROVAL || '', {
        to_email: application.email,
        member_name: application.name,
        status: 'rejected',
        date: new Date().toISOString().split('T')[0],
      });
    }

    return c.json({ success: true, message: `Application ${body.status}` });
  } catch (e) {
    console.error('[code-rx] update application error:', e);
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

app.put('/api/site-content', requireAdmin, async (c) => {
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

app.get('/api/members', requireAdmin, async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM members ORDER BY created_at DESC, id DESC').all();
  return c.json({ success: true, data: results });
});

app.post('/api/members', requireAdmin, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const name = cleanStr(body.name, 2, 100);
    const email = cleanEmail(body.email);
    if (!name || !email) return c.json({ success: false, error: 'Name and valid email are required' }, 400);

    const result = await c.env.DB
      .prepare('INSERT INTO members (name, email, phone, role, joined_date, points, level) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(
        name,
        email,
        cleanOptionalStr(body.phone, 30) ?? null,
        body.role === 'admin' ? 'admin' : 'member',
        new Date().toISOString().split('T')[0],
        Number.isFinite(Number(body.points)) ? Number(body.points) : 0,
        cleanOptionalStr(body.level, 100) ?? 'Pharmacy Technologist'
      )
      .run();

    return c.json({ success: true, message: 'Member created', id: result.meta.last_row_id });
  } catch (e: any) {
    if (e?.message?.includes('UNIQUE')) return c.json({ success: false, error: 'A member with this email already exists' }, 409);
    console.error('[code-rx] create member error:', e);
    return c.json({ success: false, error: 'Failed to create member' }, 500);
  }
});

app.patch('/api/members/:id', requireAdmin, async (c) => {
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
    return c.json({ success: true, message: 'Member updated' });
  } catch (e) {
    console.error('[code-rx] update member error:', e);
    return c.json({ success: false, error: 'Failed to update member' }, 500);
  }
});

app.delete('/api/members/:id', requireAdmin, async (c) => {
  try {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id < 1) return c.json({ success: false, error: 'Invalid id' }, 400);
    await c.env.DB.prepare('DELETE FROM members WHERE id = ?').bind(id).run();
    return c.json({ success: true, message: 'Member removed' });
  } catch (e) {
    console.error('[code-rx] delete member error:', e);
    return c.json({ success: false, error: 'Failed to remove member' }, 500);
  }
});

// ============================================
// 📊 STATS (admin)
// ============================================

app.get('/api/stats', requireAdmin, async (c) => {
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
// 📦 R2 STORAGE
// ============================================

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME_PREFIXES = ['image/', 'application/pdf', 'text/', 'application/zip', 'application/json'];

app.post('/api/upload', requireAdmin, async (c) => {
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
