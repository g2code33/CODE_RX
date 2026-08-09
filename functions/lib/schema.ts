// Cloudflare D1 schema, safe migrations, and foundational Code Rx Vault seeds.
// Existing website tables are retained. New organization data lives in additive
// tables so a production deployment never deletes site content or members.

import type { Env } from '../env';
import { hashPassword } from './auth';
import { allocateMemberCode, VAULT_SECTION_SEEDS } from './vault';

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

-- Legacy members remain the website-facing member list. member_profiles below
-- adds the secure identity, member ID, status, roles, and Vault relationship.
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
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member','admin','phantom')),
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

CREATE TABLE IF NOT EXISTS member_sequences (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  next_value INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  is_system INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS member_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER UNIQUE,
  member_record_id INTEGER UNIQUE,
  member_code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending_activation' CHECK (status IN ('pending_activation','active','locked','archived')),
  primary_role_id INTEGER,
  locked_reason TEXT,
  locked_at DATETIME,
  archived_at DATETIME,
  created_by_user_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(member_record_id) REFERENCES members(id),
  FOREIGN KEY(primary_role_id) REFERENCES roles(id)
);

CREATE TABLE IF NOT EXISTS member_activations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_profile_id INTEGER NOT NULL,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at DATETIME,
  created_by_user_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(member_profile_id) REFERENCES member_profiles(id)
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id INTEGER NOT NULL,
  section_slug TEXT NOT NULL,
  can_view INTEGER NOT NULL DEFAULT 0,
  can_create INTEGER NOT NULL DEFAULT 0,
  can_edit INTEGER NOT NULL DEFAULT 0,
  can_delete INTEGER NOT NULL DEFAULT 0,
  can_manage INTEGER NOT NULL DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(role_id, section_slug),
  FOREIGN KEY(role_id) REFERENCES roles(id)
);

CREATE TABLE IF NOT EXISTS member_permission_overrides (
  member_profile_id INTEGER NOT NULL,
  section_slug TEXT NOT NULL,
  can_view INTEGER,
  can_create INTEGER,
  can_edit INTEGER,
  can_delete INTEGER,
  can_manage INTEGER,
  updated_by_user_id INTEGER,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(member_profile_id, section_slug),
  FOREIGN KEY(member_profile_id) REFERENCES member_profiles(id)
);

CREATE TABLE IF NOT EXISTS member_role_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_profile_id INTEGER NOT NULL,
  previous_role_id INTEGER,
  new_role_id INTEGER NOT NULL,
  changed_by_user_id INTEGER,
  reason TEXT,
  changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(member_profile_id) REFERENCES member_profiles(id)
);

CREATE TABLE IF NOT EXISTS codenames (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  normalized_name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','reserved','claimed','retired')),
  reserved_note TEXT,
  reserved_by_user_id INTEGER,
  claimed_by_member_profile_id INTEGER UNIQUE,
  claimed_at DATETIME,
  created_by_user_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(claimed_by_member_profile_id) REFERENCES member_profiles(id)
);

CREATE TABLE IF NOT EXISTS codename_selection_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_profile_id INTEGER NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','completed','expired')),
  passes_used INTEGER NOT NULL DEFAULT 0 CHECK (passes_used BETWEEN 0 AND 2),
  claimed_codename_id INTEGER,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  FOREIGN KEY(member_profile_id) REFERENCES member_profiles(id),
  FOREIGN KEY(claimed_codename_id) REFERENCES codenames(id)
);

CREATE TABLE IF NOT EXISTS codename_selection_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  codename_id INTEGER,
  action TEXT NOT NULL CHECK (action IN ('unavailable_check','available_check','passed','claimed')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(session_id) REFERENCES codename_selection_sessions(id),
  FOREIGN KEY(codename_id) REFERENCES codenames(id)
);

CREATE TABLE IF NOT EXISTS codename_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codename_id INTEGER NOT NULL,
  member_profile_id INTEGER,
  event_type TEXT NOT NULL CHECK (event_type IN ('added','reserved','unreserved','claimed','released','retired')),
  acted_by_user_id INTEGER,
  note TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(codename_id) REFERENCES codenames(id),
  FOREIGN KEY(member_profile_id) REFERENCES member_profiles(id)
);

CREATE TABLE IF NOT EXISTS website_admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_profile_id INTEGER NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','removed')),
  assigned_by_user_id INTEGER,
  assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  suspended_at DATETIME,
  FOREIGN KEY(member_profile_id) REFERENCES member_profiles(id)
);

CREATE TABLE IF NOT EXISTS website_admin_permissions (
  website_admin_id INTEGER NOT NULL,
  permission_key TEXT NOT NULL,
  allowed INTEGER NOT NULL DEFAULT 1,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(website_admin_id, permission_key),
  FOREIGN KEY(website_admin_id) REFERENCES website_admins(id)
);

CREATE TABLE IF NOT EXISTS vault_sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  is_sensitive INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vault_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL DEFAULT 'section' CHECK (visibility IN ('section','members','restricted')),
  file_key TEXT,
  created_by_member_profile_id INTEGER,
  updated_by_member_profile_id INTEGER,
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(section_id) REFERENCES vault_sections(id)
);

CREATE TABLE IF NOT EXISTS document_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL,
  version_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  file_key TEXT,
  changed_by_member_profile_id INTEGER,
  change_note TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(document_id, version_number),
  FOREIGN KEY(document_id) REFERENCES vault_documents(id)
);

CREATE TABLE IF NOT EXISTS vault_projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planning',
  description TEXT NOT NULL DEFAULT '',
  lead_member_profile_id INTEGER,
  github_url TEXT,
  documentation_url TEXT,
  timeline TEXT,
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_by_member_profile_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(lead_member_profile_id) REFERENCES member_profiles(id)
);

CREATE TABLE IF NOT EXISTS vault_project_members (
  project_id INTEGER NOT NULL,
  member_profile_id INTEGER NOT NULL,
  responsibility TEXT,
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(project_id, member_profile_id),
  FOREIGN KEY(project_id) REFERENCES vault_projects(id),
  FOREIGN KEY(member_profile_id) REFERENCES member_profiles(id)
);

CREATE TABLE IF NOT EXISTS vault_project_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  file_key TEXT NOT NULL,
  uploaded_by_member_profile_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(project_id) REFERENCES vault_projects(id)
);

CREATE TABLE IF NOT EXISTS vault_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'todo',
  assigned_member_profile_id INTEGER,
  due_at TEXT,
  created_by_member_profile_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(project_id) REFERENCES vault_projects(id),
  FOREIGN KEY(assigned_member_profile_id) REFERENCES member_profiles(id)
);

CREATE TABLE IF NOT EXISTS meetings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section_id INTEGER,
  project_id INTEGER,
  title TEXT NOT NULL,
  held_at TEXT NOT NULL,
  agenda TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL DEFAULT 'members' CHECK (visibility IN ('members','restricted')),
  created_by_member_profile_id INTEGER,
  updated_by_member_profile_id INTEGER,
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(section_id) REFERENCES vault_sections(id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id INTEGER,
  actor_member_profile_id INTEGER,
  action TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS system_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_by_user_id INTEGER,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(status);
CREATE INDEX IF NOT EXISTS idx_subscribers_email ON subscribers(email);
CREATE INDEX IF NOT EXISTS idx_member_profiles_status ON member_profiles(status);
CREATE INDEX IF NOT EXISTS idx_member_profiles_role ON member_profiles(primary_role_id);
CREATE INDEX IF NOT EXISTS idx_codenames_status ON codenames(status);
CREATE INDEX IF NOT EXISTS idx_codename_events_session ON codename_selection_events(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_vault_documents_section ON vault_documents(section_id, is_archived, updated_at);
CREATE INDEX IF NOT EXISTS idx_vault_projects_status ON vault_projects(status, is_archived);
CREATE INDEX IF NOT EXISTS idx_vault_tasks_project ON vault_tasks(project_id, status);
CREATE INDEX IF NOT EXISTS idx_meetings_project ON meetings(project_id, held_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_subject ON audit_logs(subject_type, subject_id);
`;

// These are intentionally separate from CREATE TABLE so live D1 databases
// created by older versions receive non-destructive columns. Duplicate-column
// errors are safely ignored by runSafeMigrations below.
const SAFE_MIGRATIONS = [
  'ALTER TABLE applications ADD COLUMN reviewed_by_user_id INTEGER',
  'ALTER TABLE applications ADD COLUMN reviewed_at TEXT',
  'ALTER TABLE applications ADD COLUMN review_note TEXT',
  'ALTER TABLE applications ADD COLUMN member_profile_id INTEGER',
  'ALTER TABLE applications ADD COLUMN updated_at TEXT',
  'ALTER TABLE meetings ADD COLUMN project_id INTEGER',
];

const ROLE_SEEDS = [
  ['phantom', 'PHANTOM', 'Founder / Super Admin / Overall Coordination', 1],
  ['nexus', 'NEXUS', 'Projects & Innovation', 1],
  ['kernel', 'KERNEL', 'Technology & Infrastructure', 1],
  ['signal', 'SIGNAL', 'Media & Publicity', 1],
  ['pulse', 'PULSE', 'Members & Community', 1],
  ['vault', 'VAULT', 'Finance & Resources', 1],
  ['member', 'Member', 'Standard Code Rx member', 1],
  ['custom', 'Custom', 'Custom responsibility profile', 0],
] as const;

const ROLE_DEFAULT_SECTIONS: Record<string, string[]> = {
  nexus: ['projects'],
  kernel: ['technology'],
  signal: ['media'],
  pulse: ['members', 'meetings'],
  vault: ['finance', 'resources'],
};

const MEMBER_VIEW_SECTIONS = new Set(['society', 'meetings', 'projects', 'resources', 'sops', 'achievements', 'roadmap']);

const g = globalThis as Record<string, unknown>;

const asRows = async <T>(statement: D1PreparedStatement): Promise<T[]> => {
  const result = await statement.all<T>();
  return result.results || [];
};

const runSafeMigrations = async (db: D1Database) => {
  for (const statement of SAFE_MIGRATIONS) {
    try {
      await db.prepare(statement).run();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/duplicate column name|already exists/i.test(message)) throw error;
    }
  }
};

const seedRolesAndPermissions = async (db: D1Database) => {
  for (const [code, name, description, isSystem] of ROLE_SEEDS) {
    await db.prepare('INSERT OR IGNORE INTO roles (code, name, description, is_system) VALUES (?, ?, ?, ?)')
      .bind(code, name, description, isSystem).run();
  }

  const roles = await asRows<{ id: number; code: string }>(db.prepare('SELECT id, code FROM roles'));
  const roleByCode = new Map(roles.map((role) => [role.code, role.id]));
  const sections = VAULT_SECTION_SEEDS.map(([slug]) => slug);

  for (const [code, roleId] of roleByCode) {
    for (const section of sections) {
      let permissions = [0, 0, 0, 0, 0];
      if (code === 'phantom') permissions = [1, 1, 1, 1, 1];
      else if (code === 'member' && MEMBER_VIEW_SECTIONS.has(section)) permissions = [1, 0, 0, 0, 0];
      else if ((ROLE_DEFAULT_SECTIONS[code] || []).includes(section)) permissions = [1, 1, 1, 1, 1];
      else if (section === 'society' || section === 'roadmap') permissions = [1, 0, 0, 0, 0];

      await db.prepare(
        `INSERT OR IGNORE INTO role_permissions
         (role_id, section_slug, can_view, can_create, can_edit, can_delete, can_manage)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(roleId, section, ...permissions).run();
    }
  }
};

const seedVaultSections = async (db: D1Database) => {
  for (const [slug, title, description, order] of VAULT_SECTION_SEEDS) {
    await db.prepare(
      'INSERT OR IGNORE INTO vault_sections (slug, title, description, is_sensitive, sort_order) VALUES (?, ?, ?, ?, ?)'
    ).bind(slug, title, description, slug === 'finance' ? 1 : 0, order).run();
  }
};

const ensurePhantom = async (env: Env) => {
  const db = env.DB;
  const email = String(env.PHANTOM_EMAIL || env.ADMIN_EMAIL || '').trim().toLowerCase();
  if (!email) return;
  let userRows = await asRows<any>(db.prepare('SELECT id, email, name FROM users WHERE email = ?').bind(email));
  if (!userRows[0]) {
    const password = String(env.ADMIN_PASSWORD || '').trim();
    if (!password) {
      console.warn('[code-rx] PHANTOM account was not seeded: set ADMIN_PASSWORD as a Cloudflare secret for a fresh database.');
      return;
    }
    const hash = await hashPassword(password);
    const created = await db.prepare('INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)')
      .bind(email, 'PHANTOM', hash, 'admin').run();
    userRows = [{ id: Number(created.meta.last_row_id), email, name: 'PHANTOM' }];
  }

  const user = userRows[0];
  await db.prepare("UPDATE users SET role = 'admin', name = COALESCE(NULLIF(name, ''), 'PHANTOM') WHERE id = ?").bind(user.id).run();

  const phantomRoleRows = await asRows<{ id: number }>(db.prepare("SELECT id FROM roles WHERE code = 'phantom'"));
  const phantomRoleId = phantomRoleRows[0]?.id;
  let memberRows = await asRows<{ id: number }>(db.prepare('SELECT id FROM members WHERE email = ?').bind(email));
  if (!memberRows[0]) {
    const created = await db.prepare(
      'INSERT INTO members (name, email, phone, role, joined_date, points, level, is_active) VALUES (?, ?, NULL, ?, ?, 0, ?, 1)'
    ).bind('PHANTOM', email, 'phantom', new Date().toISOString().slice(0, 10), 'Founder / Super Admin').run();
    memberRows = [{ id: Number(created.meta.last_row_id) }];
  }

  const profileRows = await asRows<{ id: number }>(db.prepare('SELECT id FROM member_profiles WHERE user_id = ?').bind(user.id));
  if (!profileRows[0]) {
    const code = await allocateMemberCode(db);
    await db.prepare(
      `INSERT INTO member_profiles (user_id, member_record_id, member_code, status, primary_role_id, created_by_user_id)
       VALUES (?, ?, ?, 'active', ?, ?)`
    ).bind(user.id, memberRows[0].id, code, phantomRoleId ?? null, user.id).run();
  } else {
    await db.prepare("UPDATE member_profiles SET status = 'active', primary_role_id = ? WHERE id = ?")
      .bind(phantomRoleId ?? null, profileRows[0].id).run();
  }
};

/**
 * Runs once per isolate. All changes are additive: no existing website table,
 * account, membership record, or site-content row is dropped or replaced.
 */
export async function ensureSchema(env: Env): Promise<void> {
  if (g.__codeRxSchemaReady) return;
  const db = env.DB;
  const statements = SCHEMA.split(';').map((statement) => statement.trim()).filter(Boolean);
  for (const statement of statements) await db.prepare(statement).run();
  await runSafeMigrations(db);

  await db.prepare('INSERT OR IGNORE INTO site_content (id, data, updated_at) VALUES (1, ?, CURRENT_TIMESTAMP)').bind('{}').run();
  await db.prepare('INSERT OR IGNORE INTO member_sequences (id, next_value) VALUES (1, 1)').run();
  await seedRolesAndPermissions(db);
  await seedVaultSections(db);
  await ensurePhantom(env);

  g.__codeRxSchemaReady = true;
}
