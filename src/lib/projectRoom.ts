/**
 * Project Room presentation rules.
 *
 * Pure functions with no React or DOM dependency, so the rules the room obeys
 * — which sections may be shown, what an empty section says, how a permission
 * is labelled — are unit tested directly rather than inferred from markup.
 *
 * Nothing here decides access. The server has already authorized every document
 * that reaches these functions; these helpers only decide how to present it.
 */

export interface RoomSection {
  id: string;
  label: string;
  count: number;
}

export interface RoomDocument {
  id: string;
  reference?: string | null;
  title: string;
  summary?: string;
  category: string;
  version?: string | null;
  publishedAt?: string | null;
  updatedAt?: string | null;
  /**
   * 'new' / 'updated' / null, decided by the server from the publication date,
   * the last change and the version — the timestamps the portal already keeps.
   * Anything else the server might send is ignored rather than rendered.
   */
  freshness?: 'new' | 'updated' | null;
  permissions?: { view?: boolean; download?: boolean };
  /**
   * The client's own signature, when they have signed this document. The room
   * shows it as a badge; a payload without it simply says nothing rather than
   * guessing that a document is unsigned.
   */
  signature?: { signerName: string; title?: string; at?: string | null } | null;
}

/** The NEW / UPDATED badge for a document, or null when it has neither. */
export const freshnessBadge = (
  document: RoomDocument | null | undefined,
): { label: 'NEW' | 'UPDATED'; title: string } | null => {
  if (document?.freshness === 'new') {
    return { label: 'NEW', title: 'Published recently' };
  }
  if (document?.freshness === 'updated') {
    return { label: 'UPDATED', title: 'Changed since it was first published' };
  }
  return null;
};

/**
 * The stamped client copy of a document.
 *
 * A room document no longer carries the internal text: what the client reads is
 * the artifact the server produced, and this is the server's description of it.
 * `available` false means the server refused to produce a copy — the client is
 * told so, and is never shown the internal original instead.
 */
export interface RoomDelivery {
  available: boolean;
  kind?: string | null;
  sourceKind?: string | null;
  label?: string;
  contentType?: string;
  designation?: string;
  stamped?: boolean;
  /**
   * True when PHANTOM saved raw unformatted delivery for this document: the
   * client receives the source file exactly as uploaded — an operator
   * decision, and the only way an unstamped file is ever rendered.
   */
  raw?: boolean;
  message?: string;
  reason?: string | null;
  viewerPath?: string | null;
  printPath?: string | null;
  downloadPath?: string | null;
}

/** Normalises whatever the server sent into a room-safe delivery descriptor. */
export const parseDelivery = (value: unknown): RoomDelivery => {
  const source = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const raw = source.raw === true;
  // Fail closed, twice over: the server has to say a copy is available, and it
  // has to confirm that copy is stamped — unless it explicitly marks the copy
  // as a raw delivery, which is a saved PHANTOM decision. A response that
  // admits to serving an unstamped file without that mark is treated as no
  // delivery at all, never rendered.
  const available = source.available === true && (source.stamped !== false || raw);
  return {
    available,
    kind: typeof source.kind === 'string' ? source.kind : null,
    sourceKind: typeof source.sourceKind === 'string' ? source.sourceKind : null,
    label: typeof source.label === 'string' ? source.label : available ? (raw ? 'Client copy' : 'Stamped copy') : 'Unavailable',
    contentType: typeof source.contentType === 'string' ? source.contentType : 'application/pdf',
    designation: typeof source.designation === 'string' ? source.designation : 'CLIENT PROJECT DOCUMENT',
    stamped: source.stamped !== false,
    raw,
    message: typeof source.message === 'string' ? source.message : '',
    reason: typeof source.reason === 'string' ? source.reason : null,
    viewerPath: typeof source.viewerPath === 'string' ? source.viewerPath : null,
    printPath: typeof source.printPath === 'string' ? source.printPath : null,
    downloadPath: typeof source.downloadPath === 'string' ? source.downloadPath : null,
  };
};

/** A document can be opened in the viewer or printed when a stamped copy exists. */
export const deliveryAvailable = (delivery: RoomDelivery | null | undefined): boolean => delivery?.available === true;
export const canPrint = (document: RoomDocument, delivery: RoomDelivery | null | undefined): boolean =>
  canView(document) && deliveryAvailable(delivery);

/** The client-facing explanation shown when no stamped copy can be produced. */
export const deliveryMessage = (delivery: RoomDelivery | null | undefined): string =>
  delivery?.message
  || 'A stamped Code Rx copy of this document is not available yet. Please contact Code Rx Society.';

/** The seven sections of a project room, in the order the client sees them. */
export const ROOM_SECTIONS = [
  { id: 'overview', label: 'Project Overview', empty: 'Nothing has been published to this project yet.' },
  { id: 'documents', label: 'Documents', empty: 'No documents available.' },
  { id: 'letters', label: 'Letters', empty: 'No letters available.' },
  { id: 'agreements', label: 'Agreements', empty: 'No agreements available.' },
  { id: 'reports', label: 'Reports', empty: 'No reports available.' },
  { id: 'deliverables', label: 'Deliverables', empty: 'No deliverables available.' },
  { id: 'updates', label: 'Updates', empty: 'No updates available.' },
] as const;

export const CATEGORY_LABELS: Record<string, string> = {
  document: 'Document',
  letter: 'Letter',
  agreement: 'Agreement',
  report: 'Report',
  deliverable: 'Deliverable',
  update: 'Update',
};

/**
 * Which room section a document of this category lives in. The server sends the
 * section for every document it lists and refuses anything outside the session's
 * scope; this mapping only decides which tab a link's destination document
 * should be opened under.
 */
export const CATEGORY_SECTIONS: Record<string, string> = {
  document: 'documents',
  letter: 'letters',
  agreement: 'agreements',
  report: 'reports',
  deliverable: 'deliverables',
  update: 'updates',
};

export const sectionForCategory = (category?: string | null): string =>
  CATEGORY_SECTIONS[String(category || '')] || 'overview';

/** Client-facing wording for a project status. Never leaks internal state names. */
export const PROJECT_STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  suspended: 'On hold',
  archived: 'Archived',
};

export const sectionLabel = (id: string): string =>
  ROOM_SECTIONS.find((section) => section.id === id)?.label || 'Project';

export const emptyMessageFor = (id: string): string =>
  ROOM_SECTIONS.find((section) => section.id === id)?.empty || 'No documents available.';

/**
 * A section is shown only when it actually contains content the client may see.
 * Project Overview is always shown, because it carries the project itself.
 *
 * `counts` come from the server and are computed from authorized rows only
 * (published + client-visible + viewable), so a hidden draft can never make a
 * section appear — and can never inflate a count.
 */
export const visibleSections = (
  sections: RoomSection[] | null | undefined,
  recentCount: number,
): RoomSection[] => {
  const byId = new Map<string, RoomSection>();
  for (const section of sections || []) byId.set(section.id, section);

  return ROOM_SECTIONS
    .map((definition) => {
      const fromServer = byId.get(definition.id);
      const count = definition.id === 'overview' ? recentCount : fromServer?.count ?? 0;
      return { id: definition.id, label: definition.label, count };
    })
    .filter((section) => section.id === 'overview' || section.count > 0);
};

export const hasAnyPublishedContent = (sections: RoomSection[] | null | undefined): boolean =>
  (sections || []).some((section) => section.id !== 'overview' && section.count > 0);

/**
 * View and Download are independent permissions. A document is only offered for
 * download when the server explicitly said so; viewing never implies downloading.
 */
export const canDownload = (document: RoomDocument): boolean => document.permissions?.download === true;
export const canView = (document: RoomDocument): boolean => document.permissions?.view !== false;

/** Short label describing the permission the client has on one document. */
export const permissionLabel = (document: RoomDocument): string =>
  canDownload(document) ? 'View and download' : 'View only';

export interface RoomDocumentFlags {
  /** True when this is the only document in its section. */
  soleDocument: boolean;
  downloadable: boolean;
  viewOnly: boolean;
}

export const documentFlags = (document: RoomDocument, sectionSize: number): RoomDocumentFlags => ({
  soleDocument: sectionSize === 1,
  downloadable: canDownload(document),
  viewOnly: !canDownload(document),
});

const parseDate = (value?: string | null): Date | null => {
  if (!value) return null;
  const text = String(value);
  const normalised = text.includes('T') ? text : `${text.replace(' ', 'T')}Z`;
  const parsed = new Date(normalised);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/** `17 Sep 2026`, or an em dash when there is nothing meaningful to show. */
export const formatDate = (value?: string | null): string => {
  const parsed = parseDate(value);
  if (!parsed) return '—';
  return parsed.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
};

/**
 * Publication information for one document. A document that has been updated
 * after publication shows both, so the client can tell "new" from "changed".
 */
export const publicationInfo = (document: RoomDocument): { primary: string; secondary: string | null } => {
  const published = parseDate(document.publishedAt);
  const updated = parseDate(document.updatedAt);

  if (!published && !updated) return { primary: 'Date unavailable', secondary: null };
  if (!published) return { primary: `Updated ${formatDate(document.updatedAt)}`, secondary: null };
  if (!updated) return { primary: `Published ${formatDate(document.publishedAt)}`, secondary: null };

  const sameMoment = Math.abs(updated.getTime() - published.getTime()) < 60_000;
  if (sameMoment) return { primary: `Published ${formatDate(document.publishedAt)}`, secondary: null };
  return {
    primary: `Published ${formatDate(document.publishedAt)}`,
    secondary: `Updated ${formatDate(document.updatedAt)}`,
  };
};

/** The project facts shown on the overview. All of them are the client's own. */
export interface ProjectOverviewInput {
  reference: string;
  status: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  publishedCount: number;
}

export const overviewFacts = (project: ProjectOverviewInput): Array<{ label: string; value: string }> => [
  { label: 'Status', value: PROJECT_STATUS_LABELS[project.status] || 'Active' },
  { label: 'Project reference', value: project.reference },
  { label: 'Opened', value: formatDate(project.createdAt) },
  { label: 'Last updated', value: formatDate(project.updatedAt) },
  {
    label: 'Documents available',
    value: project.publishedCount === 1 ? '1 document' : `${project.publishedCount} documents`,
  },
];

/** A safe filename for a downloaded copy, derived only from client-facing data. */
export const downloadFileName = (document: RoomDocument): string => {
  const base = (document.reference || document.title || 'code-rx-document')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `${base || 'code-rx-document'}.pdf`;
};
