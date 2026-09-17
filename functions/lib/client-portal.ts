/**
 * Client Project Portal — domain rules and server-side authorization.
 *
 * Design commitments enforced here (Phase 1 sweep, sections N/S/U):
 *   1. A client is NOT a member. Clients never receive a member JWT and never
 *      appear in users/member_profiles, so they cannot leak into member lists,
 *      leaderboards, notification audiences, community membership, or Vault
 *      permission checks.
 *   2. Client authority is resolved from a database row on every request, so
 *      suspension, revocation, unpublishing and project archiving all take
 *      effect immediately.
 *   3. Identifiers supplied by the browser are never trusted. The client id and
 *      project id always come from the resolved session/link row, and every
 *      object lookup is joined through that ownership.
 *   4. Every failure — wrong client, missing object, unpublished, revoked,
 *      expired — returns an identical 404 so error text cannot be used to
 *      enumerate other clients.
 *
 * Nothing in this module modifies or replaces an existing Vault, sharing,
 * permission, audit, notification, or storage mechanism.
 */

import type { Context, Next } from 'hono';
import type { Env } from '../env';
import { actorFromContext, audit, hasWebsitePermission } from './vault';
import { clientSessionHash, CLIENT_SESSION_HEADER, resolveClientSessionRecord } from './client-auth';

// ---------------------------------------------------------------------------
// Enumerations (stored as CHECK-constrained text, matching existing table style)
// ---------------------------------------------------------------------------

export const CLIENT_STATUSES = ['active', 'suspended', 'archived', 'revoked'] as const;
export type ClientStatus = typeof CLIENT_STATUSES[number];

export const CLIENT_PROJECT_STATUSES = ['active', 'suspended', 'archived'] as const;
export type ClientProjectStatus = typeof CLIENT_PROJECT_STATUSES[number];

export const CLIENT_ACCESS_KEY_STATUSES = ['active', 'revoked'] as const;

export const CLIENT_DOCUMENT_CATEGORIES = ['document', 'letter', 'agreement', 'report', 'deliverable', 'update'] as const;
export type ClientDocumentCategory = typeof CLIENT_DOCUMENT_CATEGORIES[number];

export const CLIENT_DOCUMENT_LIFECYCLE = ['draft', 'in_review', 'approved', 'published', 'unpublished', 'archived'] as const;
export type ClientDocumentLifecycle = typeof CLIENT_DOCUMENT_LIFECYCLE[number];

/** The only lifecycle state a client may ever receive. */
export const CLIENT_VISIBLE_LIFECYCLE: ClientDocumentLifecycle = 'published';

export const CLIENT_ACTIVITY_EVENTS = [
  'LOGIN',
  'LOGOUT',
  'PROJECT_OPENED',
  'SECTION_OPENED',
  'DOCUMENT_VIEWED',
  'DOCUMENT_DOWNLOADED',
  'LINK_USED',
  'ACCESS_KEY_REVOKED',
  'ACCESS_KEY_REGENERATED',
  'ACCESS_DENIED',
  'CLIENT_SUSPENDED',
  'ACCESS_REVOKED_ALL',
] as const;
export type ClientActivityEvent = typeof CLIENT_ACTIVITY_EVENTS[number];

// ---------------------------------------------------------------------------
// Row helpers
// ---------------------------------------------------------------------------

const asRows = async <T>(statement: D1PreparedStatement): Promise<T[]> => {
  const result = await statement.all<T>();
  return result.results || [];
};

// ---------------------------------------------------------------------------
// References (CRX-XXXX-YYYY-NNN), allocated atomically in D1
// ---------------------------------------------------------------------------

export type ClientReferenceKind = 'project' | 'document' | 'letter' | 'agreement' | 'report' | 'deliverable' | 'update';

const REFERENCE_PREFIX: Record<ClientReferenceKind, string> = {
  project: 'PROJ',
  document: 'DOC',
  letter: 'LTR',
  agreement: 'AGR',
  report: 'RPT',
  deliverable: 'DLV',
  update: 'UPD',
};

/**
 * Category-to-reference mapping. A letter is a letter: it gets a CRX-LTR code
 * even when the same folder also holds agreements and reports.
 */
export const referenceKindForCategory = (category: ClientDocumentCategory): ClientReferenceKind =>
  (CLIENT_DOCUMENT_CATEGORIES.includes(category) ? category : 'document') as ClientReferenceKind;

const formatReference = (kind: ClientReferenceKind, year: number, sequence: number) =>
  `CRX-${REFERENCE_PREFIX[kind]}-${year}-${String(sequence).padStart(3, '0')}`;

/**
 * Reserves the next readable reference for a kind and year.
 *
 * Uses the same atomic `UPDATE ... RETURNING` pattern as `allocateMemberCode()`
 * and `allocateDocumentCode()`, with a non-atomic fallback for older local
 * emulators. The UNIQUE constraint on the consuming column remains the real
 * guarantee, so a reference can never be duplicated.
 */
export const allocateClientReference = async (
  db: D1Database,
  kind: ClientReferenceKind,
  year = new Date().getUTCFullYear(),
): Promise<string> => {
  try {
    const rows = await asRows<{ sequence: number }>(db.prepare(
      `INSERT INTO client_reference_sequences (kind, year, next_value)
       VALUES (?, ?, 2)
       ON CONFLICT(kind, year) DO UPDATE SET next_value = next_value + 1
       RETURNING next_value - 1 AS sequence`
    ).bind(kind, year));
    const sequence = Number(rows[0]?.sequence);
    if (Number.isInteger(sequence) && sequence > 0) return formatReference(kind, year, sequence);
  } catch (error) {
    console.warn('[code-rx] client reference sequence RETURNING fallback:', error);
  }

  await db.prepare('INSERT OR IGNORE INTO client_reference_sequences (kind, year, next_value) VALUES (?, ?, 1)').bind(kind, year).run();
  const rows = await asRows<{ next_value: number }>(db.prepare('SELECT next_value FROM client_reference_sequences WHERE kind = ? AND year = ?').bind(kind, year));
  const sequence = Math.max(1, Number(rows[0]?.next_value || 1));
  await db.prepare('UPDATE client_reference_sequences SET next_value = ? WHERE kind = ? AND year = ?').bind(sequence + 1, kind, year).run();
  return formatReference(kind, year, sequence);
};

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

/**
 * Every client-facing response is private and never stored. `no-store` keeps a
 * client document out of browsers, proxies and the service worker.
 */
export const clientJson = (body: unknown, status: number = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });

/**
 * The single failure response for every client-scoped authorization failure.
 * Using one shape and one status for "not found", "not yours", "unpublished",
 * "revoked" and "expired" removes the enumeration oracle described in the
 * Phase 1 sweep.
 */
export const clientNotFound = () => clientJson({ success: false, error: 'Not found.' }, 404);

export const clientUnauthorized = () => clientJson({ success: false, error: 'Client session required.' }, 401);

/** Explicit denials (already-authenticated but forbidden) never leak a reason. */
export const clientForbidden = () => clientJson({ success: false, error: 'Not found.' }, 404);

export const clientError = (message: string, status = 400) => clientJson({ success: false, error: message }, status);

// ---------------------------------------------------------------------------
// Session principal
// ---------------------------------------------------------------------------

export interface ClientPrincipal {
  sessionId: number;
  clientId: number;
  clientPublicId: string;
  clientName: string;
  clientContactName: string | null;
  clientContactEmail: string | null;
  clientStatus: ClientStatus;
  projectId: number;
  projectPublicId: string;
  projectReference: string;
  projectName: string;
  projectStatus: ClientProjectStatus;
  accessKeyId: number | null;
  /** Set when the session was minted from a temporary link instead of a key. */
  linkId: number | null;
  linkAllowsView: boolean;
  linkAllowsDownload: boolean;
  /** Set when the link is scoped to a single document. */
  linkDocumentId: number | null;
  expiresAt: string;
}

export interface ClientDocumentRow {
  id: number;
  public_id: string;
  client_id: number;
  client_project_id: number;
  reference_code: string | null;
  title: string;
  category: ClientDocumentCategory;
  version: string | null;
  lifecycle_status: ClientDocumentLifecycle;
  client_visible: number;
  allow_view: number;
  allow_download: number;
  is_archived: number;
  vault_document_id: number | null;
  vault_version_number: number | null;
}

/**
 * The single exposure decision for a client document. A document is usable only
 * when it is PUBLISHED, explicitly client-visible, not archived, its project is
 * usable, and its client is usable.
 */
export const clientDocumentExposure = (
  document: Pick<ClientDocumentRow, 'lifecycle_status' | 'client_visible' | 'allow_view' | 'allow_download' | 'is_archived'>,
  project: { status: ClientProjectStatus; is_archived: number },
  client: { status: ClientStatus },
) => {
  const projectUsable = clientProjectUsable(project);
  const clientUsable = client.status === 'active';
  const exposed = clientUsable
    && projectUsable
    && document.is_archived !== 1
    && document.lifecycle_status === CLIENT_VISIBLE_LIFECYCLE
    && Number(document.client_visible) === 1;
  return {
    exposed,
    canView: exposed && Number(document.allow_view) === 1,
    canDownload: exposed && Number(document.allow_view) === 1 && Number(document.allow_download) === 1,
  };
};

export const clientProjectUsable = (project: { status: ClientProjectStatus | string; is_archived: number }) =>
  project.is_archived !== 1 && project.status !== 'archived' && project.status !== 'suspended';

export const clientUsable = (client: { status: ClientStatus | string }) => client.status === 'active';

// ---------------------------------------------------------------------------
// Session resolution and middleware
// ---------------------------------------------------------------------------

export const readClientSessionToken = (c: Context<{ Bindings: Env }>): string => {
  const header = c.req.header(CLIENT_SESSION_HEADER) || '';
  return header.trim();
};

/**
 * Resolves a presented client session credential into a server-side principal.
 * Every condition is re-checked against D1 on every call: the session is live,
 * the key is live, the client is active, and the project is usable.
 */
export const resolveClientPrincipal = async (
  db: D1Database,
  sessionToken: string,
): Promise<{ principal: ClientPrincipal | null; reason: 'ok' | 'no_credential' | 'invalid' | 'inactive' }> => {
  if (!sessionToken) return { principal: null, reason: 'no_credential' };

  const sessionHash = await clientSessionHash(sessionToken);
  const record = await resolveClientSessionRecord(db, sessionHash);
  if (!record) return { principal: null, reason: 'invalid' };
  if (!clientUsable({ status: record.client_status })
    || !clientProjectUsable({ status: record.project_status, is_archived: record.project_is_archived })) {
    return { principal: null, reason: 'inactive' };
  }

  return {
    principal: {
      sessionId: Number(record.session_id),
      clientId: Number(record.client_id),
      clientPublicId: record.client_public_id,
      clientName: record.client_name,
      clientContactName: record.client_contact_name ?? null,
      clientContactEmail: record.client_contact_email ?? null,
      clientStatus: record.client_status as ClientStatus,
      projectId: Number(record.client_project_id),
      projectPublicId: record.project_public_id,
      projectReference: record.project_reference,
      projectName: record.project_name,
      projectStatus: record.project_status as ClientProjectStatus,
      accessKeyId: record.access_key_id === null ? null : Number(record.access_key_id),
      linkId: record.link_id === null ? null : Number(record.link_id),
      // A key session is not link-restricted, so both permissions start open;
      // document-level flags still apply on top.
      linkAllowsView: record.link_allow_view === null ? true : Number(record.link_allow_view) === 1,
      linkAllowsDownload: record.link_allow_download === null ? true : Number(record.link_allow_download) === 1,
      linkDocumentId: record.link_document_id === null ? null : Number(record.link_document_id),
      expiresAt: record.session_expires_at,
    },
    reason: 'ok',
  };
};

/** Rejects with the uniform response when no live client session is present. */
export const requireClientSession = async (c: any, next: Next) => {
  const token = readClientSessionToken(c);
  if (!token) return clientUnauthorized();
  const { principal, reason } = await resolveClientPrincipal(c.env.DB, token);
  if (!principal) {
    return reason === 'inactive' ? clientNotFound() : clientUnauthorized();
  }
  c.set('client', principal);
  await next();
};

/**
 * Authorizes a project path parameter against the session's own project. The
 * client id and project id come from the session row; the browser only ever
 * supplies an opaque project public id, which must belong to that client.
 */
export const requireClientProjectAccess = async (c: any, next: Next) => {
  const principal = c.get('client') as ClientPrincipal | undefined;
  if (!principal) return clientUnauthorized();
  const requested = String(c.req.param('projectId') || '').trim();
  if (!requested) return clientNotFound();

  const rows = await asRows<any>(c.env.DB.prepare(
    `SELECT p.id, p.public_id, p.reference_code, p.name, p.status, p.is_archived,
            cl.status AS client_status
     FROM client_projects p
     JOIN clients cl ON cl.id = p.client_id
     WHERE p.public_id = ? AND p.client_id = ?`
  ).bind(requested, principal.clientId));

  const project = rows[0];
  if (!project) return clientNotFound();
  if (!clientProjectUsable(project) || !clientUsable({ status: project.client_status })) return clientNotFound();

  c.set('clientProject', project);
  await next();
};

/**
 * Authorizes a document path parameter inside the already-authorized project.
 * Only PUBLISHED, client-visible documents resolve; everything else is a 404.
 */
export const requireClientDocumentAccess = async (c: any, next: Next) => {
  const principal = c.get('client') as ClientPrincipal | undefined;
  const project = c.get('clientProject') as any;
  if (!principal || !project) return clientNotFound();

  const requested = String(c.req.param('documentId') || '').trim();
  if (!requested) return clientNotFound();

  const rows = await asRows<ClientDocumentRow>(c.env.DB.prepare(
    `SELECT d.id, d.public_id, d.client_id, d.client_project_id, d.reference_code, d.title,
            d.category, d.version, d.lifecycle_status, d.client_visible, d.allow_view, d.allow_download,
            d.is_archived, d.vault_document_id, d.vault_version_number
     FROM client_documents d
     WHERE d.public_id = ? AND d.client_id = ? AND d.client_project_id = ?`
  ).bind(requested, principal.clientId, Number(project.id)));

  const document = rows[0];
  if (!document) return clientNotFound();

  const base = clientDocumentExposure(document, project, { status: principal.clientStatus });
  if (!base.canView) return clientNotFound();

  // A temporary link can be narrower than the client's own permissions: it may
  // forbid downloading, or point at one single document. Both restrictions are
  // applied here, server-side, on top of the document's own flags.
  if (principal.linkId !== null) {
    if (!principal.linkAllowsView) return clientNotFound();
    if (principal.linkDocumentId !== null && Number(document.id) !== principal.linkDocumentId) return clientNotFound();
  }

  const exposure = {
    exposed: base.exposed,
    canView: base.canView && principal.linkAllowsView,
    canDownload: base.canDownload && principal.linkAllowsDownload,
  };

  c.set('clientDocument', document);
  c.set('clientDocumentExposure', exposure);
  await next();
};

/**
 * Derives an actor-like descriptor for the existing `audit()` writer.
 *
 * The Phase 1 sweep confirmed `audit_logs` carries no foreign key on
 * `actor_user_id`/`actor_member_profile_id`, so passing null keeps the member
 * actor columns honest while `details_json` records the client-side identity.
 * The audit writer also never throws, matching its existing contract.
 */
export const describeClientActor = (principal: ClientPrincipal | null, extra: Record<string, unknown> = {}) => ({
  clientId: principal?.clientId ?? null,
  clientPublicId: principal?.clientPublicId ?? null,
  clientName: principal?.clientName ?? null,
  projectId: principal?.projectId ?? null,
  projectPublicId: principal?.projectPublicId ?? null,
  accessKeyId: principal?.accessKeyId ?? null,
  sessionId: principal?.sessionId ?? null,
  ...extra,
});

/**
 * Client activity is written to the existing `audit_logs` table (no duplicate
 * audit system). Failures are swallowed by `audit()` exactly as they are for
 * every other platform action.
 */
export const recordClientActivity = async (
  db: D1Database,
  event: ClientActivityEvent,
  options: {
    principal?: ClientPrincipal | null;
    clientPublicId?: string | null;
    details?: Record<string, unknown>;
  } = {},
) => {
  // A single subject shape keeps one indexed query able to return the whole
  // activity history for one client (idx_audit_logs_subject).
  const clientPublicId = options.clientPublicId ?? options.principal?.clientPublicId ?? null;
  await audit(
    db,
    null,
    `client.${event.toLowerCase()}`,
    'client',
    clientPublicId,
    describeClientActor(options.principal ?? null, options.details || {}),
  );
};

// ---------------------------------------------------------------------------
// Settings / feature flags (existing system_settings table)
// ---------------------------------------------------------------------------

export const clientSetting = async (db: D1Database, key: string, fallback = '0'): Promise<string> => {
  const rows = await asRows<{ setting_value: string }>(db.prepare('SELECT setting_value FROM system_settings WHERE setting_key = ?').bind(key));
  return rows[0]?.setting_value ?? fallback;
};

export const clientPortalEnabled = async (db: D1Database) => (await clientSetting(db, 'client_portal_enabled', '0')) === '1';

export const clientDownloadsEnabled = async (db: D1Database) => (await clientSetting(db, 'client_downloads_enabled', '0')) === '1';

export const clientAllLinksEnabled = async (db: D1Database) => (await clientSetting(db, 'client_all_links_enabled', '1')) === '1';

/**
 * Master switch for the entire client portal. Applied to every public client
 * route before any credential work, so a paused portal cannot even be probed.
 */
export const requireClientPortalEnabled = async (c: any, next: Next) => {
  if (!await clientPortalEnabled(c.env.DB)) return clientNotFound();
  await next();
};

export const clientPermissionKeys = [
  'clients.manage',
  'clients.publish',
  'clients.links',
  'clients.preview',
] as const;

export type ClientPermissionKey = typeof clientPermissionKeys[number];

/**
 * Client-management authorization.
 *
 * Reuses the existing delegation engine (`website_admin_permissions`) instead of
 * inventing a second permission system: PHANTOM is implicitly allowed, and any
 * other member must have been granted the specific key by PHANTOM. A founding
 * codename alone grants nothing, which is exactly the requirement in the brief.
 */
export const requireClientPermission = (permission: ClientPermissionKey) => async (c: any, next: Next) => {
  const actor = await actorFromContext(c);
  if (!actor) return c.json({ success: false, error: 'Account not found' }, 404);
  if (!await hasWebsitePermission(c.env.DB, actor, permission)) {
    return c.json({ success: false, error: 'Client portal permission required.' }, 403);
  }
  await next();
};

// ---------------------------------------------------------------------------
// Serializers — internal identifiers never cross the client boundary
// ---------------------------------------------------------------------------

/**
 * Client-facing project shape. Deliberately omits row ids, client_id, internal
 * notes, and any Vault identifier (Phase 1 sweep, section S-14/S-18).
 */
export const publicProject = (row: any) => ({
  id: row.public_id,
  reference: row.reference_code,
  name: row.name,
  description: row.description || '',
  status: row.status,
  updatedAt: row.updated_at || null,
});

/** Client-facing document shape. Never includes vault ids, storage keys, or client ids. */
export const publicDocument = (row: any, exposure: { canView: boolean; canDownload: boolean }, options: { includeContent?: boolean } = {}) => ({
  id: row.public_id,
  reference: row.reference_code || null,
  title: row.title,
  summary: row.summary || '',
  category: row.category,
  version: row.version || null,
  direction: 'outbound',
  publishedAt: row.published_at || null,
  updatedAt: row.updated_at || null,
  permissions: { view: exposure.canView, download: exposure.canDownload },
  ...(options.includeContent ? { content: safeContentSnapshot(row.content_snapshot, row.content_snapshot_format) } : {}),
});

/**
 * Parses a stored snapshot defensively. A snapshot is written by this backend,
 * but it is still re-validated on the way out so a malformed row can never
 * render arbitrary markup in a client browser.
 */
export const safeContentSnapshot = (value: unknown, format: string): { version: number; format: string; blocks: unknown[] } => {
  const format_ = format === 'text' ? 'text' : 'blocks';
  if (format_ === 'text') {
    return { version: 1, format: 'text', blocks: [{ id: 'text', type: 'paragraph', content: escapeClientText(String(value ?? '')) }] };
  }
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    const blocks = parsed && typeof parsed === 'object' && Array.isArray((parsed as any).blocks) ? (parsed as any).blocks : [];
    return { version: 1, format: 'blocks', blocks: blocks.slice(0, 500) };
  } catch {
    return { version: 1, format: 'blocks', blocks: [] };
  }
};

/**
 * Minimal HTML escaping for the plain-text snapshot path. The block path is
 * sanitised by the existing Vault sanitizer before it is ever stored here.
 */
export const escapeClientText = (value: string) => value
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');


