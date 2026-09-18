/**
 * CODE Rx SOCIETY — client activity presentation (Phase 9).
 *
 * Client activity is already written to the existing `audit_logs` table by
 * `recordClientActivity` (Phases 3-8). This module logs nothing of its own: it
 * turns those rows into the timeline the PHANTOM workspace renders, resolves
 * which project and document an entry belongs to, and guarantees that nothing
 * sensitive can leave through the feed.
 *
 * The guarantee is enforced here rather than in the UI: an entry is built from
 * an allow-list, so a future route that records a token in `details` cannot
 * leak it. Raw passkeys, session tokens, key hashes, storage keys and internal
 * row ids are dropped, and any value that merely looks like one is dropped too.
 */

export type ClientActivityKind = 'project' | 'document' | 'link' | 'auth' | 'navigation' | 'security';

/** The order the workspace shows the filter chips in. */
export const CLIENT_ACTIVITY_KINDS: readonly ClientActivityKind[] =
  ['project', 'document', 'link', 'auth', 'navigation', 'security'];

export const CLIENT_ACTIVITY_KIND_LABELS: Record<ClientActivityKind, string> = {
  project: 'Project',
  document: 'Documents',
  link: 'Temporary links',
  auth: 'Sign-ins',
  navigation: 'Navigation',
  security: 'Security',
};

const EVENT_KINDS: Record<string, ClientActivityKind> = {
  LOGIN: 'auth',
  LOGOUT: 'auth',
  PROJECT_OPENED: 'navigation',
  SECTION_OPENED: 'navigation',
  DOCUMENT_VIEWED: 'document',
  DOCUMENT_DOWNLOADED: 'document',
  DOCUMENT_PUBLISHED: 'project',
  LINK_CREATED: 'link',
  LINK_USED: 'link',
  LINK_EXPIRED: 'link',
  LINK_REVOKED: 'link',
  ACCESS_KEY_REVOKED: 'security',
  ACCESS_KEY_REGENERATED: 'security',
  ACCESS_DENIED: 'security',
  CLIENT_SUSPENDED: 'security',
  ACCESS_REVOKED_ALL: 'security',
};

const EVENT_LABELS: Record<string, string> = {
  LOGIN: 'Signed in',
  LOGOUT: 'Signed out',
  PROJECT_OPENED: 'Opened the project room',
  SECTION_OPENED: 'Opened a project section',
  DOCUMENT_VIEWED: 'Viewed a document',
  DOCUMENT_DOWNLOADED: 'Downloaded the stamped copy',
  DOCUMENT_PUBLISHED: 'Published a document to the client',
  LINK_CREATED: 'Created a temporary link',
  LINK_USED: 'Opened a temporary link',
  LINK_EXPIRED: 'Temporary link expired',
  LINK_REVOKED: 'Temporary link revoked',
  ACCESS_KEY_REVOKED: 'Access key revoked',
  ACCESS_KEY_REGENERATED: 'Access key regenerated',
  ACCESS_DENIED: 'Access refused',
  CLIENT_SUSPENDED: 'Client access suspended',
  ACCESS_REVOKED_ALL: 'All client access revoked',
};

/** The event name as `recordClientActivity` stores it, from an audit row. */
export const clientActivityEvent = (action: unknown): string =>
  String(action || '').replace(/^client\./, '').toUpperCase().slice(0, 60);

export const activityKindFor = (event: string): ClientActivityKind => EVENT_KINDS[event] || 'project';

/** A human label; an unknown event is still shown readably rather than raw. */
export const activityLabelFor = (event: string): string => EVENT_LABELS[event]
  || event.toLowerCase().replace(/_/g, ' ').replace(/^./, (character) => character.toUpperCase());

export interface ActivityAccessMethod {
  id: 'access_key' | 'link_direct' | 'link_passkey' | 'staff' | 'system' | 'unknown';
  label: string;
}

/**
 * How the entry happened: which credential, link mode or staff session was used.
 * Derived from what the recorder already stored — no new logging is required.
 */
export const activityAccessMethod = (
  event: string,
  details: Record<string, unknown>,
  link?: { mode?: string | null } | null,
): ActivityAccessMethod => {
  const method = String(details.method || '').toLowerCase();
  const mode = String(details.mode || '').toUpperCase();
  const linkIsDirect = String(link?.mode || '') === 'direct';
  if (method === 'link_direct' || mode === 'DIRECT_ACCESS' || (details.linkId && linkIsDirect)) {
    return { id: 'link_direct', label: 'Temporary link (direct access)' };
  }
  if (method === 'passkey_with_link' || details.linkId) {
    return { id: 'link_passkey', label: 'Temporary link (passkey)' };
  }
  if (method === 'passkey' || details.accessKeyId || details.sessionId || details.clientPublicId) {
    return { id: 'access_key', label: 'Project access key' };
  }
  // Nothing client-side to read: the entry belongs to an operator action or to
  // the automatic sweep. An expiry is the platform's own doing, everything else
  // in that family is somebody at Code Rx Society.
  if (event === 'LINK_EXPIRED') return { id: 'system', label: 'Code Rx system' };
  if (EVENT_KINDS[event] === 'security' || EVENT_KINDS[event] === 'project' || EVENT_KINDS[event] === 'link') {
    return { id: 'staff', label: 'Code Rx staff' };
  }
  return { id: 'unknown', label: 'Unknown method' };
};

/** Keys that may be shown; everything else is dropped, whatever it contains. */
const SHOWABLE_KEYS = new Set([
  'clientPublicId', 'clientName', 'projectPublicId', 'projectName',
  'documentId', 'reference', 'title', 'category', 'delivery', 'section', 'destination',
  'mode', 'method', 'linkId', 'reason', 'sessionsRevoked', 'note', 'version', 'state',
  'previousState', 'clientVisible', 'expiresAt', 'usedAt', 'count',
]);

/** Anything matching this is never displayed, whoever put it there. */
const FORBIDDEN_VALUE = /[0-9a-f]{64}|^CRX(-[A-Z0-9]{4}){4}$|^client-exports\/|^vault\/|^session_|^key_/i;
const FORBIDDEN_KEY = /pass|token|secret|hash|authorization|artifact|cookie|ip$|useragent/i;

const scalar = (value: unknown): string | number | boolean | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value;
  const text = String(value);
  if (text.length > 200) return null;
  if (FORBIDDEN_VALUE.test(text)) return null;
  return text;
};

/**
 * The display-safe slice of a recorded entry. An allow-list plus a value check,
 * so a raw credential can never reach the workspace even if a future recorder
 * writes one.
 */
export const safeActivityDetails = (
  details: Record<string, unknown> = {},
  fallback: { clientPublicId?: string | null } = {},
): Record<string, string | number | boolean | null> => {
  const safe: Record<string, string | number | boolean | null> = {};
  if (!details.clientPublicId && fallback.clientPublicId) {
    // A publication is recorded by staff, so the recorder stores no principal;
    // the entry is still attributed to the client whose timeline it appears in.
    details = { ...details, clientPublicId: fallback.clientPublicId };
  }
  for (const [key, value] of Object.entries(details)) {
    if (!SHOWABLE_KEYS.has(key) || FORBIDDEN_KEY.test(key)) continue;
    if (Array.isArray(value)) {
      const list = value.map(scalar).filter((item): item is string | number | boolean => item !== null).slice(0, 20);
      if (list.length) safe[key] = list.join(', ');
      continue;
    }
    if (value && typeof value === 'object') continue;
    if (value === null) {
      // Nulls are kept for allow-listed keys: the payload mirrors the log rather
      // than silently omitting a field.
      safe[key] = null;
      continue;
    }
    const shown = scalar(value);
    if (shown !== null) safe[key] = shown;
  }
  return safe;
};

/** True when the entry was triggered by a client credential rather than staff. */
const isClientDriven = (method: ActivityAccessMethod): boolean =>
  method.id !== 'staff' && method.id !== 'system' && method.id !== 'unknown';

export interface ActivityProjectRef { id: string; name: string; reference: string }
export interface ActivityDocumentRef { id: string; reference: string | null; title: string; projectPublicId: string | null }
export interface ActivityLinkRef {
  id: string;
  destination: string | null;
  projectPublicId: string | null;
  /** 'direct' or 'passkey' — how the link authorizes, not what it opens. */
  mode?: string | null;
}

export interface ActivityLookups {
  projects?: Map<string, ActivityProjectRef>;
  documents?: Map<string, ActivityDocumentRef>;
  links?: Map<string, ActivityLinkRef>;
  /** The client whose timeline this row belongs to (its audit subject). */
  clientPublicId?: string | null;
}

export interface ClientActivityEntry {
  id: number;
  event: string;
  kind: ClientActivityKind;
  label: string;
  at: string;
  actor: { type: 'client' | 'staff' | 'system' | 'unknown'; name: string | null };
  accessMethod: ActivityAccessMethod;
  project: ActivityProjectRef | null;
  document: { id: string; reference: string | null; title: string } | null;
  summary: string;
  details: Record<string, string | number | boolean | null>;
}

/**
 * Builds one timeline entry from an audit row.
 *
 * Project resolution prefers what the recorder stored, then the document, then
 * the link — so an entry that only knows its document still lands in the right
 * project timeline.
 */
export const buildClientActivityEntry = (
  row: { id: number; action?: string; created_at?: string; details_json?: string | null },
  lookups: ActivityLookups = {},
): ClientActivityEntry => {
  let event = clientActivityEvent(row.action);
  let parsed: Record<string, unknown> = {};
  try {
    const value = JSON.parse(String(row.details_json || '{}'));
    if (value && typeof value === 'object' && !Array.isArray(value)) parsed = value as Record<string, unknown>;
  } catch {
    parsed = {};
  }
  const details = safeActivityDetails(parsed, { clientPublicId: lookups.clientPublicId || null });
  // Publication is recorded as DOCUMENT_VIEWED with `note: 'publication'`
  // (existing data — no new event type, no migration). It reads as publishing
  // rather than as a client reading, and it is not client-driven.
  const isPublication = event === 'DOCUMENT_VIEWED' && details.note === 'publication';
  if (isPublication) event = 'DOCUMENT_PUBLISHED';
  const linkRefForMethod = typeof parsed.linkId === 'string' ? lookups.links?.get(parsed.linkId) || null : null;
  const accessMethod = isPublication
    ? { id: 'staff' as const, label: 'Code Rx staff' }
    : activityAccessMethod(event, details, linkRefForMethod);

  const documentRef = typeof details.documentId === 'string' ? lookups.documents?.get(details.documentId) || null : null;
  const linkRef = typeof details.linkId === 'string' ? lookups.links?.get(details.linkId) || null : null;
  const projectPublicId = (typeof details.projectPublicId === 'string' ? details.projectPublicId : null)
    || documentRef?.projectPublicId || linkRef?.projectPublicId || null;
  const project = projectPublicId ? lookups.projects?.get(projectPublicId) || null : null;

  const clientName = typeof details.clientName === 'string' ? details.clientName : null;
  const actorName = isClientDriven(accessMethod) ? clientName : null;
  const document = documentRef
    ? { id: documentRef.id, reference: documentRef.reference, title: documentRef.title }
    : (typeof details.documentId === 'string'
      ? { id: details.documentId, reference: typeof details.reference === 'string' ? details.reference : null, title: '' }
      : null);

  const label = activityLabelFor(event);
  const summary = [
    actorName || (accessMethod.id === 'staff' ? 'Code Rx staff' : accessMethod.id === 'system' ? 'The Code Rx system' : 'A client'),
    label.charAt(0).toLowerCase() + label.slice(1),
    document ? (document.reference || document.title) : project ? project.name : '',
  ].filter(Boolean).join(' ');

  return {
    id: Number(row.id),
    event,
    kind: activityKindFor(event),
    label,
    at: String(row.created_at || ''),
    actor: {
      type: isClientDriven(accessMethod) ? 'client'
        : accessMethod.id === 'staff' ? 'staff'
          : accessMethod.id === 'system' ? 'system' : 'unknown',
      name: actorName,
    },
    accessMethod,
    project,
    document,
    summary,
    details,
  };
};

export interface ClientActivityPage {
  entries: ClientActivityEntry[];
  counts: Record<ClientActivityKind | 'all', number>;
  kinds: ClientActivityKind[];
}

/** Filters an entry set by kind and/or project, then slices it to `limit`. */
export const clientActivityPage = (
  entries: ClientActivityEntry[],
  options: { kind?: string | null; projectId?: string | null; documentId?: string | null; limit?: number } = {},
): ClientActivityPage => {
  const counts: Record<ClientActivityKind | 'all', number> = {
    all: entries.length, project: 0, document: 0, link: 0, auth: 0, navigation: 0, security: 0,
  };
  for (const entry of entries) counts[entry.kind] += 1;

  const kind = typeof options.kind === 'string' ? options.kind.toLowerCase() : '';
  const wanted = (CLIENT_ACTIVITY_KINDS as readonly string[]).includes(kind) ? kind as ClientActivityKind : null;
  const projectId = options.projectId || null;
  const documentId = options.documentId || null;
  const limit = Math.min(400, Math.max(1, Number(options.limit) || 60));

  const filtered = entries.filter((entry) => {
    if (wanted && entry.kind !== wanted) return false;
    if (projectId && entry.project?.id !== projectId) return false;
    if (documentId && entry.document?.id !== documentId) return false;
    return true;
  });
  return { entries: filtered.slice(0, limit), counts, kinds: [...CLIENT_ACTIVITY_KINDS] };
};
