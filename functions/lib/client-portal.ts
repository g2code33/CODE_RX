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
import {
  clientSessionHash,
  CLIENT_SESSION_HEADER,
  CLIENT_LINK_DEFAULT_MAX_USES,
  CLIENT_LINK_DEFAULT_TTL_MINUTES,
  resolveClientSessionRecord,
} from './client-auth';

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
  'DOCUMENT_SAVED',
  'DOCUMENT_SENT',
  'LINK_CREATED',
  'LINK_USED',
  'LINK_EXPIRED',
  'LINK_REVOKED',
  'ACCESS_KEY_REVOKED',
  'ACCESS_KEY_REGENERATED',
  'ACCESS_DENIED',
  'CLIENT_SUSPENDED',
  'ACCESS_REVOKED_ALL',
] as const;
export type ClientActivityEvent = typeof CLIENT_ACTIVITY_EVENTS[number];

// ---------------------------------------------------------------------------
// Temporary project links — destinations, access modes and scope (Phase 7)
// ---------------------------------------------------------------------------

/**
 * The ten things a temporary link may open. The stored values are the Phase 5
 * `client_links.destination_type` values; `file` is stored as a `document`
 * destination whose intent is 'file', so no existing row changes meaning.
 */
export const CLIENT_LINK_DESTINATIONS = [
  'project', 'overview', 'documents', 'letters', 'agreements',
  'reports', 'deliverables', 'updates', 'document', 'file',
] as const;
export type ClientLinkDestination = typeof CLIENT_LINK_DESTINATIONS[number];

/** Destinations that name one of the room's sections. */
export const CLIENT_LINK_SECTION_DESTINATIONS = [
  'documents', 'letters', 'agreements', 'reports', 'deliverables', 'updates',
] as const;

export const CLIENT_LINK_DESTINATION_LABELS: Record<ClientLinkDestination, string> = {
  project: 'Project Room',
  overview: 'Project Overview',
  documents: 'Documents',
  letters: 'Letters',
  agreements: 'Agreements',
  reports: 'Reports',
  deliverables: 'Deliverables',
  updates: 'Updates',
  document: 'Specific document',
  file: 'Specific file',
};

/** The brief's access modes. Storage keeps the Phase 5 `passkey`/`direct` values. */
export const CLIENT_LINK_ACCESS_MODES = ['REQUIRE_PASSKEY', 'DIRECT_ACCESS'] as const;
export type ClientLinkAccessMode = typeof CLIENT_LINK_ACCESS_MODES[number];

export type ClientLinkIntent = 'view' | 'file';

/** Storage value → brief name. Unknown storage values are treated as passkey. */
export const linkAccessMode = (stored: unknown): ClientLinkAccessMode =>
  String(stored) === 'direct' ? 'DIRECT_ACCESS' : 'REQUIRE_PASSKEY';

/** Brief name → storage value. */
export const linkAccessModeValue = (brief: unknown): 'passkey' | 'direct' =>
  String(brief || '').trim().toUpperCase() === 'DIRECT_ACCESS' ? 'direct' : 'passkey';

export const isClientLinkDestination = (value: unknown): value is ClientLinkDestination =>
  typeof value === 'string' && (CLIENT_LINK_DESTINATIONS as readonly string[]).includes(value);

export const isClientLinkSectionDestination = (value: unknown): boolean =>
  typeof value === 'string' && (CLIENT_LINK_SECTION_DESTINATIONS as readonly string[]).includes(value);

/**
 * Expiry choices offered by the operator UI and accepted by the server, in
 * minutes. Custom expirations are any other value inside the same window.
 */
export const CLIENT_LINK_TTL_PRESETS = [15, 60, 360, 1440, 4320, 10080] as const;
export const CLIENT_LINK_MIN_TTL_MINUTES = 5;
export const CLIENT_LINK_MAX_TTL_MINUTES = 7 * 24 * 60;
export const CLIENT_LINK_MAX_USES_LIMIT = 50;

/** Clamps a requested lifetime into the supported window. Never trusts the browser. */
export const clampLinkTtlMinutes = (value: unknown): number => {
  const minutes = Math.floor(Number(value));
  if (!Number.isFinite(minutes) || minutes <= 0) return CLIENT_LINK_DEFAULT_TTL_MINUTES;
  return Math.min(CLIENT_LINK_MAX_TTL_MINUTES, Math.max(CLIENT_LINK_MIN_TTL_MINUTES, minutes));
};

/**
 * `maxUses` absent means the operator asked for the single-use default; an
 * explicit null/empty/0 means the link is not use-limited.
 */
export const resolveLinkMaxUses = (value: unknown): number | null => {
  if (value === undefined) return CLIENT_LINK_DEFAULT_MAX_USES;
  if (value === null || value === '' || Number(value) === 0) return null;
  const uses = Math.floor(Number(value));
  if (!Number.isFinite(uses) || uses < 1) return CLIENT_LINK_DEFAULT_MAX_USES;
  return Math.min(CLIENT_LINK_MAX_USES_LIMIT, uses);
};

/**
 * The destination a stored link points at, in the shape the client app and the
 * operator UI both use. `label` is client-safe wording only.
 */
export interface ClientLinkDestinationDescriptor {
  destination: ClientLinkDestination;
  intent: ClientLinkIntent;
  /** Section id when the destination is a room section, otherwise null. */
  section: string | null;
  /** Public document id for document/file destinations, otherwise null. */
  documentId: string | null;
  label: string;
}

export const describeLinkDestination = (row: {
  destination_type?: unknown;
  destination_id?: unknown;
  destination_intent?: unknown;
  document_public_id?: unknown;
}): ClientLinkDestinationDescriptor => {
  const stored = String(row?.destination_type || '');
  const intent: ClientLinkIntent = String(row?.destination_intent || 'view') === 'file' ? 'file' : 'view';
  const documentId = row?.document_public_id === null || row?.document_public_id === undefined
    ? (typeof row?.destination_id === 'string' ? row.destination_id : null)
    : String(row.document_public_id);
  const destination: ClientLinkDestination = intent === 'file'
    ? 'file'
    : (isClientLinkDestination(stored) ? stored : (documentId ? 'document' : 'project'));
  return {
    destination,
    intent,
    section: isClientLinkSectionDestination(destination) ? destination : null,
    documentId: destination === 'document' || destination === 'file' ? documentId : null,
    label: CLIENT_LINK_DESTINATION_LABELS[destination],
  };
};

/** The client-visible scope of one request's session. */
export interface ClientLinkScope {
  /** False for a key session: the whole project room is the destination. */
  restricted: boolean;
  destination: ClientLinkDestination;
  intent: ClientLinkIntent;
  section: string | null;
  /** Opaque public id of the destination document, when there is one. */
  documentId: string | null;
  /** The same document's row id, used for authorization comparisons. */
  documentRowId: number | null;
}

/**
 * Derives the scope from the principal itself. Everything is read from the
 * resolved session/link row, so a tampered URL cannot widen it.
 */
export const clientLinkScope = (
  principal: Pick<ClientPrincipal, 'linkId' | 'linkDestination' | 'linkIntent' | 'linkDocumentId' | 'linkDocumentPublicId'>,
): ClientLinkScope => {
  const empty: ClientLinkScope = {
    restricted: false, destination: 'project', intent: 'view', section: null, documentId: null, documentRowId: null,
  };
  if (principal.linkId === null) return empty;
  const destination: ClientLinkDestination = principal.linkIntent === 'file'
    ? 'file'
    : (isClientLinkDestination(principal.linkDestination) ? principal.linkDestination : 'project');
  const documentScoped = destination === 'document' || destination === 'file';
  return {
    restricted: true,
    destination,
    intent: destination === 'file' ? 'file' : 'view',
    section: isClientLinkSectionDestination(destination) ? destination : null,
    documentId: documentScoped
      ? (principal.linkDocumentPublicId
        ?? (principal.linkDocumentId === null ? null : String(principal.linkDocumentId)))
      : null,
    documentRowId: documentScoped ? principal.linkDocumentId : null,
  };
};

/**
 * May this session open the project's room root? A file link exists to deliver
 * one file, so it never opens the room at all.
 */
export const clientLinkAllowsProjectRoot = (scope: ClientLinkScope): boolean =>
  !scope.restricted || scope.destination !== 'file';

/** May this session open one of the room's sections? */
export const clientLinkAllowsSection = (scope: ClientLinkScope, section: string): boolean => {
  if (!scope.restricted) return true;
  if (scope.destination === 'project') return true;
  if (scope.destination === 'overview') return section === 'overview';
  if (scope.destination === 'document' || scope.destination === 'file') return false;
  return scope.section === section;
};

/** The document category behind a room section. */
export const SECTION_CATEGORY_FOR_SECTION: Record<string, string> = {
  documents: 'document',
  letters: 'letter',
  agreements: 'agreement',
  reports: 'report',
  deliverables: 'deliverable',
  updates: 'update',
};

/**
 * May this session open one document? A link that names a single document only
 * ever opens that one; a section link only opens documents of its own category.
 */
export const clientLinkTargetsDocument = (
  scope: ClientLinkScope,
  document: { id: number | string; public_id?: string | null },
): boolean => {
  if (scope.documentRowId !== null) return Number(document.id) === scope.documentRowId;
  if (scope.documentId === null) return false;
  return String(scope.documentId) === String(document.id)
    || String(scope.documentId) === String(document.public_id ?? '');
};

export const clientLinkAllowsDocument = (
  scope: ClientLinkScope,
  document: { id: number | string; public_id?: string | null; category?: string | null },
): boolean => {
  if (!scope.restricted) return true;
  if (scope.destination === 'file') return false;
  if (scope.destination === 'document') return clientLinkTargetsDocument(scope, document);
  if (scope.destination === 'project' || scope.destination === 'overview') return true;
  return SECTION_CATEGORY_FOR_SECTION[String(scope.section)] === String(document.category || '');
};

/** May this session download one document's client file? */
export const clientLinkAllowsDownload = (
  scope: ClientLinkScope,
  document: { id: number | string; public_id?: string | null; category?: string | null },
): boolean => {
  if (!scope.restricted) return true;
  if (scope.destination === 'file') return clientLinkTargetsDocument(scope, document);
  return clientLinkAllowsDocument(scope, document);
};

/** Maps a destination to the room section it opens, when it opens one. */
export const linkSectionForDestination = (destination: ClientLinkDestination): string | null =>
  isClientLinkSectionDestination(destination) ? destination : null;

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

/**
 * Access-screen failure states.
 *
 * Phase 2 answered every credential failure with one identical message, which is
 * the strongest anti-enumeration position. Phase 3 needs actionable states on the
 * access screen, so a distinction is drawn ONLY after the presented passkey has
 * matched a stored row (or the presented link token has matched a stored hash).
 * A key that does not exist therefore still produces exactly one response, for
 * every input, so nothing about the client base can be enumerated. A person who
 * already holds a real key learns only the state of their own access — which
 * they could establish anyway, since they hold the credential.
 *
 * Messages are written for a client, never a developer: no status codes, table
 * names, ids or internal detail reach the browser.
 */
export const CLIENT_FAILURE_STATES = {
  invalid_key: 'This project access key was not recognised. Check the key and try again.',
  key_expired: 'This project access key has expired. Please contact Code Rx Society for a new one.',
  key_revoked: 'This project access key has been revoked. Please contact Code Rx Society if you still need access.',
  client_suspended: 'Access for this client is currently suspended. Please contact Code Rx Society.',
  client_archived: 'This client account has been archived, so access is closed.',
  client_revoked: 'Access for this client has been withdrawn. Please contact Code Rx Society.',
  project_unavailable: 'The project linked to this access key is not available at the moment.',
  no_project: 'This access key is not linked to a project yet. Please contact Code Rx Society.',
  link_invalid: 'This access link was not recognised. Please ask Code Rx Society for a new one.',
  link_expired: 'This access link has expired. Please ask Code Rx Society for a new one.',
  link_revoked: 'This access link has been revoked. Please ask Code Rx Society for a new one.',
  link_exhausted: 'This access link has already been used the maximum number of times.',
  rate_limited: 'Too many attempts. Please wait a moment and try again.',
  unavailable: 'Client access is not available right now. Please try again shortly.',
} as const;

export type ClientFailureState = keyof typeof CLIENT_FAILURE_STATES;

/** The state a browser sees for a given server-side (audit) reason. */
export const CLIENT_FAILURE_STATE_FOR_REASON: Record<string, ClientFailureState> = {
  unknown_key: 'invalid_key',
  malformed_passkey: 'invalid_key',
  key_revoked: 'key_revoked',
  key_expired: 'key_expired',
  client_suspended: 'client_suspended',
  client_archived: 'client_archived',
  client_revoked: 'client_revoked',
  no_usable_project: 'no_project',
  link_invalid: 'link_invalid',
  link_expired: 'link_expired',
  link_revoked: 'link_revoked',
  link_exhausted: 'link_exhausted',
};

export const clientFailureStateFor = (reason: string): ClientFailureState => {
  const mapped = CLIENT_FAILURE_STATE_FOR_REASON[reason];
  if (mapped) return mapped;
  // Every project-side refusal is reported as one client-facing state.
  if (reason.startsWith('project_')) return 'project_unavailable';
  return 'invalid_key';
};

export const clientFailure = (state: string) => {
  const key = (state in CLIENT_FAILURE_STATES ? state : 'unavailable') as ClientFailureState;
  return { error: CLIENT_FAILURE_STATES[key], code: key };
};

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
  /** Set when the link is scoped to a single document (row id, for authorization). */
  linkDocumentId: number | null;
  /** The same document's opaque public id, for the client-facing payload. */
  linkDocumentPublicId: string | null;
  /**
   * Phase 7: the destination the link was issued for. A session minted from a
   * key has `linkDestination: null` and is unrestricted inside its project; a
   * link session may only reach what its destination names. The value always
   * comes from the stored link row, never from the browser.
   */
  linkDestination: ClientLinkDestination | null;
  /** 'view' opens the reader, 'file' delivers the stamped client file only. */
  linkIntent: ClientLinkIntent;
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
      linkDocumentPublicId: record.link_destination_id ? String(record.link_destination_id) : null,
      linkDestination: record.link_destination_type ? (record.link_destination_type as ClientLinkDestination) : null,
      linkIntent: record.link_intent === 'file' ? 'file' : 'view',
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
    // The project's own client-facing fields, so the room's overview can show
    // the description, status and dates without a second query. Internal notes
    // and every admin-side column stay out of this shape.
    `SELECT p.id, p.public_id, p.reference_code, p.name, p.description, p.status,
            p.is_archived, p.created_at, p.updated_at,
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
    `SELECT d.id, d.public_id, d.client_id, d.client_project_id, d.reference_code, d.title, d.summary,
            d.category, d.version, d.lifecycle_status, d.client_visible, d.allow_view, d.allow_download,
            d.is_archived, d.published_at, d.updated_at,
            d.vault_document_id, d.vault_version_number
     FROM client_documents d
     WHERE d.public_id = ? AND d.client_id = ? AND d.client_project_id = ?`
  ).bind(requested, principal.clientId, Number(project.id)));

  const document = rows[0];
  if (!document) return clientNotFound();

  const base = clientDocumentExposure(document, project, { status: principal.clientStatus });
  if (!base.canView) return clientNotFound();

  // A temporary link can be narrower than the client's own permissions: it may
  // forbid downloading, point at a single document, or exist only to deliver a
  // file. Every one of those restrictions is applied here, server-side, on top
  // of the document's own flags — the link's destination comes from the stored
  // link row, never from the URL.
  let exposure = base;
  if (principal.linkId !== null) {
    const scope = clientLinkScope(principal);
    const mayRead = principal.linkAllowsView && clientLinkAllowsDocument(scope, document);
    // A link that only delivers a file — a file destination, or a download-only
    // link — may not read the document but must be able to reach its file.
    const mayTouch = mayRead
      || (principal.linkAllowsDownload && clientLinkAllowsDownload(scope, document));
    if (!mayTouch) return clientNotFound();
    exposure = {
      exposed: base.exposed,
      canView: base.canView && mayRead,
      canDownload: base.canDownload && principal.linkAllowsDownload && clientLinkAllowsDownload(scope, document),
    };
  }

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
  // The client's own project dates. Internal notes, delegation details and
  // every other admin-side field are deliberately absent from this shape.
  createdAt: row.created_at || null,
  updatedAt: row.updated_at || null,
});

/** Client-facing document shape. Never includes vault ids, storage keys, or client ids. */
/**
 * How long a document keeps its NEW / UPDATED badge. The badge is derived from
 * the timestamps the portal already stores — no new columns, no new writes — and
 * it is computed on the server so every client sees the same thing regardless of
 * their own clock.
 */
export const CLIENT_FRESHNESS_WINDOW_DAYS = 14;

const parsedTimestamp = (value: unknown): number | null => {
  if (!value) return null;
  const text = String(value);
  const time = new Date(text.includes('T') ? text : `${text.replace(' ', 'T')}Z`).getTime();
  return Number.isFinite(time) ? time : null;
};

/**
 * 'new'   — published recently and not changed since,
 * 'updated' — changed (or re-versioned) after publishing, recently,
 * null    — nothing worth flagging.
 */
export const documentFreshness = (
  row: { published_at?: unknown; updated_at?: unknown; version?: unknown },
  now: number = Date.now(),
): 'new' | 'updated' | null => {
  const published = parsedTimestamp(row.published_at);
  if (published === null) return null;
  const updated = parsedTimestamp(row.updated_at);
  const windowMs = CLIENT_FRESHNESS_WINDOW_DAYS * 86_400_000;
  const version = String(row.version || '1.0');
  const changedSincePublish = (updated !== null && updated > published + 60_000) || version !== '1.0';
  if (changedSincePublish) {
    const lastChange = Math.max(updated ?? 0, published);
    return now - lastChange <= windowMs ? 'updated' : null;
  }
  return now - published <= windowMs ? 'new' : null;
};

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
  // 'new' / 'updated' / null, from the timestamps above (Phase 9).
  freshness: documentFreshness(row),
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


