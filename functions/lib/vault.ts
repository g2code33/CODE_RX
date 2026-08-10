import type { Context, Next } from 'hono';
import type { Env } from '../env';
import type { JwtPayload } from './auth';

export const VAULT_SECTION_SEEDS = [
  ['society', 'Society', 'Society charter, identity, and governance', 0],
  ['members', 'Members', 'Member records and community information', 1],
  ['meetings', 'Meetings', 'Meeting notes, agendas, and decisions', 2],
  ['projects', 'Projects', 'Project workspaces, tasks, and roadmaps', 3],
  ['technology', 'Technology', 'Technical systems, architecture, and infrastructure', 4],
  ['coding', 'Coding', 'Programming guides, code standards, and developer notes', 5],
  ['pharmacy-healthcare', 'Pharmacy & Healthcare', 'Clinical, pharmaceutical, and digital-health knowledge', 6],
  ['media', 'Media', 'Brand, media, graphics, and public communications', 7],
  ['resources', 'Resources', 'Learning and organizational resources', 8],
  ['sops', 'SOPs', 'Standard operating procedures', 9],
  ['research', 'Research', 'Research notes, evidence, and technical investigations', 10],
  ['ideas', 'Ideas', 'Proposals, concepts, and innovation backlog', 11],
  ['roadmap', 'Roadmap', 'Society direction and planning', 12],
  ['archive', 'Archive', 'Historical and archived records', 13],
  // Retained from the earlier secure Vault schema. PHANTOM may archive or
  // reconfigure it; retaining it prevents loss of any finance records.
  ['finance', 'Finance', 'Budgets, sponsorship, and financial records', 14],
] as const;

export const FOUNDING_CODENAMES = ['PHANTOM', 'NEXUS', 'GHOST', 'FALCON', 'QUANTUM', 'MATRIX'] as const;

export const VAULT_ACTIONS = ['view', 'create', 'edit', 'delete', 'manage'] as const;
export type VaultAction = typeof VAULT_ACTIONS[number];

export interface Actor {
  userId: number;
  email: string;
  name: string;
  userRole: string;
  profileId: number | null;
  memberCode: string | null;
  memberStatus: 'pending_activation' | 'active' | 'locked' | 'archived' | null;
  primaryRoleId: number | null;
  primaryRoleCode: string | null;
  codename: string | null;
  isPhantom: boolean;
  isWebsiteAdmin: boolean;
  websiteAdminId: number | null;
}

type AppContext = Context<{ Bindings: Env; Variables: { user: JwtPayload; actor: Actor } }>;

const asRows = async <T>(statement: D1PreparedStatement): Promise<T[]> => {
  const result = await statement.all<T>();
  return result.results || [];
};

const padMemberCode = (sequence: number) => `CRX-${String(sequence).padStart(4, '0')}`;

/** Atomically reserve a permanent member number. D1's SQLite supports RETURNING. */
export const allocateMemberCode = async (db: D1Database): Promise<string> => {
  try {
    const rows = await asRows<{ sequence: number }>(
      db.prepare('UPDATE member_sequences SET next_value = next_value + 1 WHERE id = 1 RETURNING next_value - 1 AS sequence')
    );
    const sequence = Number(rows[0]?.sequence);
    if (Number.isInteger(sequence) && sequence > 0) return padMemberCode(sequence);
  } catch (error) {
    // A very old local D1 emulator may not support RETURNING. The unique member
    // code constraint still protects production; this fallback is for dev only.
    console.warn('[code-rx] member sequence RETURNING fallback:', error);
  }

  const rows = await asRows<{ next_value: number }>(db.prepare('SELECT next_value FROM member_sequences WHERE id = 1'));
  const sequence = Math.max(1, Number(rows[0]?.next_value || 1));
  await db.prepare('UPDATE member_sequences SET next_value = ? WHERE id = 1').bind(sequence + 1).run();
  return padMemberCode(sequence);
};

const memberRoleId = async (db: D1Database, roleCode = 'member') => {
  const rows = await asRows<{ id: number }>(db.prepare('SELECT id FROM roles WHERE code = ?').bind(roleCode));
  return Number(rows[0]?.id || 0) || null;
};

/**
 * Legacy authenticated accounts predate member_profiles. They are preserved,
 * not deleted: the first authenticated request receives a migration profile and
 * permanent member ID so existing accounts can enter the Vault safely.
 */
export const ensureLegacyProfile = async (db: D1Database, userId: number): Promise<void> => {
  const userRows = await asRows<any>(db.prepare('SELECT id, email, name, role FROM users WHERE id = ?').bind(userId));
  const user = userRows[0];
  if (!user) return;

  const existing = await asRows<{ id: number }>(db.prepare('SELECT id FROM member_profiles WHERE user_id = ?').bind(userId));
  if (existing[0]) return;

  const code = await allocateMemberCode(db);
  const today = new Date().toISOString().slice(0, 10);
  let memberRows = await asRows<{ id: number }>(db.prepare('SELECT id FROM members WHERE email = ?').bind(user.email));
  if (!memberRows[0]) {
    const result = await db.prepare(
      'INSERT INTO members (name, email, phone, role, joined_date, points, level, is_active) VALUES (?, ?, NULL, ?, ?, 0, ?, 1)'
    ).bind(user.name || user.email, user.email, user.role === 'phantom' ? 'phantom' : 'member', today, 'Code Rx Member').run();
    memberRows = [{ id: Number(result.meta.last_row_id) }];
  }

  const roleCode = user.role === 'phantom' ? 'phantom' : 'member';
  const roleId = await memberRoleId(db, roleCode);
  await db.prepare(
    `INSERT INTO member_profiles (user_id, member_record_id, member_code, status, primary_role_id, created_by_user_id)
     VALUES (?, ?, ?, 'active', ?, ?)`
  ).bind(user.id, memberRows[0].id, code, roleId, user.id).run();
};

const actorRowsFor = (db: D1Database, userId: number) => asRows<any>(db.prepare(
  `SELECT
     u.id AS user_id, u.email, u.name, u.role AS user_role,
     mp.id AS profile_id, mp.member_code, mp.status AS member_status, mp.primary_role_id,
     r.code AS primary_role_code,
     c.display_name AS codename,
     wa.id AS website_admin_id, wa.status AS website_admin_status
   FROM users u
   LEFT JOIN member_profiles mp ON mp.user_id = u.id
   LEFT JOIN roles r ON r.id = mp.primary_role_id
   LEFT JOIN codenames c ON c.claimed_by_member_profile_id = mp.id AND c.status = 'claimed'
   LEFT JOIN website_admins wa ON wa.member_profile_id = mp.id AND wa.status = 'active'
   WHERE u.id = ?`
).bind(userId));

const actorFromRow = (row: any): Actor => {
  const isPhantom = row.user_role === 'phantom' || row.primary_role_code === 'phantom';
  return {
    userId: Number(row.user_id),
    email: row.email,
    name: row.name || '',
    userRole: row.user_role || 'member',
    profileId: row.profile_id === null || row.profile_id === undefined ? null : Number(row.profile_id),
    memberCode: row.member_code || null,
    memberStatus: row.member_status || null,
    primaryRoleId: row.primary_role_id === null || row.primary_role_id === undefined ? null : Number(row.primary_role_id),
    primaryRoleCode: row.primary_role_code || null,
    codename: row.codename || null,
    isPhantom,
    isWebsiteAdmin: Boolean(row.website_admin_id) || row.user_role === 'admin',
    websiteAdminId: row.website_admin_id === null || row.website_admin_id === undefined ? null : Number(row.website_admin_id),
  };
};

export const getActor = async (db: D1Database, userId: number): Promise<Actor | null> => {
  // Normal logins already have a profile: one query is enough. The legacy
  // profile migration runs only when that fast lookup finds no profile.
  let rows = await actorRowsFor(db, userId);
  let row = rows[0];
  if (!row) return null;
  if (row.profile_id === null || row.profile_id === undefined) {
    await ensureLegacyProfile(db, userId);
    rows = await actorRowsFor(db, userId);
    row = rows[0];
  }
  return row ? actorFromRow(row) : null;
};

export const actorFromContext = async (c: AppContext): Promise<Actor | null> => {
  const already = c.get('actor');
  if (already) return already;
  const payload = c.get('user');
  if (!payload) return null;
  const actor = await getActor(c.env.DB, Number(payload.sub));
  if (actor) c.set('actor', actor);
  return actor;
};

export const requirePhantom = async (c: AppContext, next: Next) => {
  const actor = await actorFromContext(c);
  if (!actor) return c.json({ success: false, error: 'Account not found' }, 404);
  if (!actor.isPhantom) return c.json({ success: false, error: 'PHANTOM authorization required' }, 403);
  await next();
};

const columnForAction: Record<VaultAction, string> = {
  view: 'can_view',
  create: 'can_create',
  edit: 'can_edit',
  delete: 'can_delete',
  manage: 'can_manage',
};

export const hasVaultPermission = async (db: D1Database, actor: Actor, section: string, action: VaultAction): Promise<boolean> => {
  if (actor.isPhantom) return true;
  if (!actor.profileId || actor.memberStatus !== 'active') return false;
  const column = columnForAction[action];
  const overrideRows = await asRows<any>(db.prepare(
    `SELECT ${column} AS allowed FROM member_permission_overrides WHERE member_profile_id = ? AND section_slug = ?`
  ).bind(actor.profileId, section));
  if (overrideRows[0] && overrideRows[0].allowed !== null && overrideRows[0].allowed !== undefined) {
    return Number(overrideRows[0].allowed) === 1;
  }
  if (!actor.primaryRoleId) return false;
  const roleRows = await asRows<any>(db.prepare(
    `SELECT ${column} AS allowed FROM role_permissions WHERE role_id = ? AND section_slug = ?`
  ).bind(actor.primaryRoleId, section));
  return Number(roleRows[0]?.allowed || 0) === 1;
};

export const requireVaultPermission = (sectionFromRequest: string | ((c: AppContext) => string), action: VaultAction) =>
  async (c: AppContext, next: Next) => {
    const actor = await actorFromContext(c);
    if (!actor) return c.json({ success: false, error: 'Account not found' }, 404);
    const section = typeof sectionFromRequest === 'function' ? sectionFromRequest(c) : sectionFromRequest;
    const sectionRows = await asRows<{ id: number }>(c.env.DB.prepare('SELECT id FROM vault_sections WHERE slug = ? AND is_archived = 0').bind(section));
    if (!sectionRows[0]) return c.json({ success: false, error: 'Unknown Vault section' }, 400);
    if (!await hasVaultPermission(c.env.DB, actor, section, action)) {
      return c.json({ success: false, error: 'You are not authorized for this Vault action' }, 403);
    }
    await next();
  };

export const hasWebsitePermission = async (db: D1Database, actor: Actor, permission: string): Promise<boolean> => {
  if (actor.isPhantom) return true;
  if (!actor.profileId || actor.memberStatus !== 'active') return false;
  // Legacy admins are retained during the migration. Phantom can explicitly
  // downgrade/remove them through Website Administration afterwards.
  if (actor.userRole === 'admin' && !actor.websiteAdminId) return true;
  if (!actor.websiteAdminId) return false;
  const rows = await asRows<any>(db.prepare(
    'SELECT allowed FROM website_admin_permissions WHERE website_admin_id = ? AND permission_key = ?'
  ).bind(actor.websiteAdminId, permission));
  return Number(rows[0]?.allowed || 0) === 1;
};

export const requireWebsitePermission = (permission: string) => async (c: AppContext, next: Next) => {
  const actor = await actorFromContext(c);
  if (!actor) return c.json({ success: false, error: 'Account not found' }, 404);
  if (!await hasWebsitePermission(c.env.DB, actor, permission)) {
    return c.json({ success: false, error: 'Website administration permission required' }, 403);
  }
  await next();
};

export const audit = async (
  db: D1Database,
  actor: Actor | null,
  action: string,
  subjectType: string,
  subjectId: string | number | null,
  details: Record<string, unknown> = {},
) => {
  try {
    await db.prepare(
      'INSERT INTO audit_logs (actor_user_id, actor_member_profile_id, action, subject_type, subject_id, details_json) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(
      actor?.userId ?? null,
      actor?.profileId ?? null,
      action.slice(0, 120),
      subjectType.slice(0, 80),
      subjectId === null ? null : String(subjectId).slice(0, 120),
      JSON.stringify(details).slice(0, 20_000),
    ).run();
  } catch (error) {
    // Audit failures must be observable but should not turn a successful core
    // operation into a false client error.
    console.error('[code-rx] audit log error:', error);
  }
};

export const randomToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
};

export const sha256Hex = async (value: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

export const normalizeCodename = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();
