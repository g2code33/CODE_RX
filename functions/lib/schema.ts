// Cloudflare Pages Functions - Database schema & seed
// Creates all tables on first request (idempotent), seeds the admin user
// and default site content.

import type { Env } from '../env';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  phone TEXT,
  date TEXT NOT NULL,
  source TEXT DEFAULT 'website',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unread' CHECK (status IN ('unread','read','archived')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS site_content (
  id INTEGER PRIMARY KEY DEFAULT 1,
  data TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT single_row CHECK (id = 1)
);

CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  role TEXT DEFAULT 'member',
  joined_date TEXT NOT NULL,
  points INTEGER DEFAULT 0,
  level TEXT DEFAULT 'Pharmacy Technologist',
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member','admin')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS password_resets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(status);
CREATE INDEX IF NOT EXISTS idx_subscribers_email ON subscribers(email);
`;

const g = globalThis as any;

/**
 * Runs once per isolate: creates tables if missing and seeds the admin
 * account (email from ADMIN_EMAIL, password from ADMIN_PASSWORD or the
 * documented default) plus the default site_content row.
 */
export async function ensureSchema(env: Env): Promise<void> {
  if (g.__codeRxSchemaReady) return;
  const db = env.DB;

  // Run each statement individually — reliable across production D1 and
  // local Miniflare (which rejects multi-statement exec in some versions).
  const statements = SCHEMA
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const statement of statements) {
    await db.prepare(statement).run();
  }

  // Default site content row
  await db
    .prepare(`INSERT OR IGNORE INTO site_content (id, data, updated_at) VALUES (1, '{}', CURRENT_TIMESTAMP)`)
    .run();

  // Seed admin user if the users table is empty
  const { results } = await db.prepare('SELECT COUNT(*) AS n FROM users').all<{ n: number }>();
  if (Number(results?.[0]?.n ?? 0) === 0) {
    const { hashPassword } = await import('./auth');
    const email = (env.ADMIN_EMAIL || 'coderxsociety@gmail.com').toLowerCase().trim();
    const password = env.ADMIN_PASSWORD || 'Admin@12345';
    const hash = await hashPassword(password);
    await db
      .prepare(`INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, 'admin')`)
      .bind(email, 'Administrator', hash)
      .run();
    console.log(`[code-rx] Seeded admin user: ${email} (change ADMIN_PASSWORD in production!)`);
  }

  g.__codeRxSchemaReady = true;
}
