/**
 * Temporary project link rules (Phase 7).
 *
 * Pure functions with no React or DOM dependency, so the destinations, the
 * access modes, the expiry choices and the landing decision can be unit tested
 * directly instead of being inferred from markup.
 *
 * Nothing here decides access. The server resolves the link token by its
 * verifier hash, validates expiry, revocation and uses, and derives the
 * destination from the stored link row — these helpers only describe what the
 * operator is choosing and where an authorized client lands.
 */

export type LinkDestinationId =
  | 'project'
  | 'overview'
  | 'documents'
  | 'letters'
  | 'agreements'
  | 'reports'
  | 'deliverables'
  | 'updates'
  | 'document'
  | 'file';

export interface LinkDestination {
  id: LinkDestinationId;
  label: string;
  /** Operator-facing explanation of exactly what the link opens. */
  hint: string;
  /** Requires a specific document to be chosen alongside the destination. */
  needsDocument: boolean;
  /** The kind of screen the destination produces for the client. */
  kind: 'room' | 'overview' | 'section' | 'document' | 'file';
}

/** The ten destinations the brief lists, in the order the dialog offers them. */
export const LINK_DESTINATIONS: LinkDestination[] = [
  { id: 'project', label: 'Project Room', hint: 'The whole room: every published section.', needsDocument: false, kind: 'room' },
  { id: 'overview', label: 'Project Overview', hint: 'The overview only — status, dates and the latest published items.', needsDocument: false, kind: 'overview' },
  { id: 'documents', label: 'Documents', hint: 'The Documents section only.', needsDocument: false, kind: 'section' },
  { id: 'letters', label: 'Letters', hint: 'The Letters section only.', needsDocument: false, kind: 'section' },
  { id: 'agreements', label: 'Agreements', hint: 'The Agreements section only.', needsDocument: false, kind: 'section' },
  { id: 'reports', label: 'Reports', hint: 'The Reports section only.', needsDocument: false, kind: 'section' },
  { id: 'deliverables', label: 'Deliverables', hint: 'The Deliverables section only.', needsDocument: false, kind: 'section' },
  { id: 'updates', label: 'Updates', hint: 'The Updates section only.', needsDocument: false, kind: 'section' },
  { id: 'document', label: 'Specific document', hint: 'One published document. The rest of the room stays closed.', needsDocument: true, kind: 'document' },
  { id: 'file', label: 'Specific file', hint: 'The stamped client copy of one document. Nothing else opens.', needsDocument: true, kind: 'file' },
];

export const LINK_DESTINATION_IDS: LinkDestinationId[] = LINK_DESTINATIONS.map((entry) => entry.id);

export const linkDestination = (id: string | null | undefined): LinkDestination | null =>
  LINK_DESTINATIONS.find((entry) => entry.id === id) || null;

export const linkDestinationLabel = (id: string | null | undefined): string =>
  linkDestination(id)?.label || 'Project Room';

export type LinkAccessMode = 'REQUIRE_PASSKEY' | 'DIRECT_ACCESS';

export interface LinkModeOption {
  id: LinkAccessMode;
  label: string;
  hint: string;
}

/**
 * REQUIRE_PASSKEY keeps the passkey as the credential: the link only names the
 * destination. DIRECT_ACCESS treats the token itself as the credential and
 * mints the minimum temporary authorization for that destination.
 */
export const LINK_ACCESS_MODES: LinkModeOption[] = [
  {
    id: 'REQUIRE_PASSKEY',
    label: 'Require passkey',
    hint: 'The client signs in with their project access key before the destination opens.',
  },
  {
    id: 'DIRECT_ACCESS',
    label: 'Direct access',
    hint: 'No passkey needed. The token is the credential and opens only this destination.',
  },
];

export const linkAccessModeLabel = (mode: string | null | undefined): string =>
  LINK_ACCESS_MODES.find((entry) => entry.id === mode)?.label || 'Require passkey';

export interface LinkTtlPreset {
  minutes: number;
  label: string;
  /** Human wording used in the expiry column of the links table. */
  short: string;
}

/** The lifetime the dialog starts on when no preset is chosen. */
export const LINK_TTL_MINUTES_FALLBACK = 60;

export const LINK_TTL_PRESETS: LinkTtlPreset[] = [
  { minutes: 15, label: '15 minutes', short: '15 min' },
  { minutes: 60, label: '1 hour', short: '1 hour' },
  { minutes: 360, label: '6 hours', short: '6 hours' },
  { minutes: 1440, label: '24 hours', short: '24 hours' },
  { minutes: 4320, label: '3 days', short: '3 days' },
  { minutes: 10080, label: '7 days', short: '7 days' },
];

/** Custom expirations live inside the same window the server accepts. */
export const LINK_TTL_MIN_MINUTES = 5;
export const LINK_TTL_MAX_MINUTES = 7 * 24 * 60;
export const LINK_MAX_USES_LIMIT = 50;

export const ttlLabel = (minutes: number | null | undefined): string => {
  if (minutes === null || minutes === undefined) return '—';
  const preset = LINK_TTL_PRESETS.find((entry) => entry.minutes === Number(minutes));
  if (preset) return preset.label;
  const value = Number(minutes);
  if (value < 60) return `${value} minutes`;
  if (value < 1440) return `${Math.round(value / 60)} hours`;
  return `${Math.round(value / 144)} days`;
};

/** Client-side validation mirroring the server's; the server validates again. */
export const validateLinkLifetime = (minutes: number | null | undefined): string | null => {
  if (minutes === null || minutes === undefined) return 'Choose how long this link stays valid.';
  const value = Number(minutes);
  if (!Number.isFinite(value) || !Number.isInteger(value)) return 'Enter the lifetime as a whole number of minutes.';
  if (value < LINK_TTL_MIN_MINUTES) return `The shortest link lasts ${LINK_TTL_MIN_MINUTES} minutes.`;
  if (value > LINK_TTL_MAX_MINUTES) return 'The longest link lasts 7 days.';
  return null;
};

export const validateLinkMaxUses = (uses: number | null | undefined): string | null => {
  if (uses === null || uses === undefined) return null; // unlimited
  const value = Number(uses);
  if (!Number.isInteger(value) || value < 1) return 'Maximum uses must be a whole number of 1 or more, or left unlimited.';
  if (value > LINK_MAX_USES_LIMIT) return `A link can be limited to at most ${LINK_MAX_USES_LIMIT} uses.`;
  return null;
};

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

export interface LinkPermissionSummary {
  label: string;
  detail: string;
}

/**
 * VIEW and DOWNLOAD are independent. A file destination is download-only by
 * definition; a document destination may allow both; a room or section link
 * carries the permission the operator chose, and each document's own permission
 * still applies on top.
 */
export const linkPermissionSummary = (link: { allowView?: boolean; allowDownload?: boolean; intent?: string }): LinkPermissionSummary => {
  if (link.intent === 'file') {
    return { label: 'Download only', detail: 'Delivers the stamped client file. The document text stays closed.' };
  }
  if (link.allowView !== false && link.allowDownload) {
    return { label: 'View and download', detail: 'Documents the client may download can be downloaded through this link.' };
  }
  if (link.allowView === false) {
    return { label: 'Download only', detail: 'The link downloads the file without opening the reader.' };
  }
  return { label: 'View only', detail: 'Reading only. Downloads stay closed, whatever the document allows.' };
};

/** `3 of 5 used`, `1 of 1 used`, or `Unlimited uses`. */
export const linkUsesLabel = (link: { useCount?: number; maxUses?: number | null }): string => {
  const used = Number(link.useCount || 0);
  if (link.maxUses === null || link.maxUses === undefined) return `${used} used · unlimited`;
  return `${used} of ${link.maxUses} used`;
};

// ---------------------------------------------------------------------------
// Landing and link state screens
// ---------------------------------------------------------------------------

export interface LinkDestinationPayload {
  restricted?: boolean;
  destination?: string | null;
  intent?: string | null;
  section?: string | null;
  documentId?: string | null;
}

export interface LinkLanding {
  kind: 'room' | 'overview' | 'section' | 'document' | 'file';
  /** Room section to open, or 'overview' when the destination is the room. */
  section: string;
  documentId: string | null;
  label: string;
  /** True when the room must not fetch the whole project (file links). */
  fileOnly: boolean;
}

/**
 * Where an authorized client lands. Derived from the destination the server
 * reported, never from the URL.
 */
export const landingFor = (payload: LinkDestinationPayload | null | undefined): LinkLanding => {
  const destination = linkDestination(payload?.destination || null);
  const documentId = payload?.documentId || null;
  if (!destination || payload?.restricted !== true) {
    return { kind: 'room', section: 'overview', documentId: null, label: 'Project Room', fileOnly: false };
  }
  if (destination.kind === 'file') {
    return { kind: 'file', section: 'overview', documentId, label: destination.label, fileOnly: true };
  }
  if (destination.kind === 'document') {
    return { kind: 'document', section: 'overview', documentId, label: destination.label, fileOnly: false };
  }
  if (destination.kind === 'section') {
    return { kind: 'section', section: destination.id, documentId: null, label: destination.label, fileOnly: false };
  }
  if (destination.kind === 'overview') {
    return { kind: 'overview', section: 'overview', documentId: null, label: destination.label, fileOnly: false };
  }
  return { kind: 'room', section: 'overview', documentId: null, label: destination.label, fileOnly: false };
};

export interface LinkStateScreen {
  /** The headline the brief requires, in caps. */
  headline: string;
  message: string;
  /** A short line of what the client can do next. */
  guidance: string;
}

/**
 * Professional end states for a link that cannot be used. `null` means the code
 * is not a link state and the ordinary access screen should handle it.
 */
export const LINK_STATE_SCREENS: Record<string, LinkStateScreen> = {
  link_expired: {
    headline: 'THIS LINK HAS EXPIRED',
    message: 'This temporary project link is no longer valid. For your protection, expired links stop working immediately.',
    guidance: 'Ask Code Rx Society for a new link, or sign in with your project access key.',
  },
  link_revoked: {
    headline: 'ACCESS REVOKED',
    message: 'Access through this link has been withdrawn. It can no longer be opened by anyone.',
    guidance: 'If you still need access, contact Code Rx Society and we will review it with you.',
  },
  link_exhausted: {
    headline: 'THIS LINK HAS ALREADY BEEN USED',
    message: 'This link reached the number of uses it was limited to, so it has stopped working.',
    guidance: 'Ask Code Rx Society for a fresh link if you need to open the project again.',
  },
  link_invalid: {
    headline: 'THIS LINK IS NOT VALID',
    message: 'The link could not be recognised. It may have been copied incompletely, or replaced by a newer one.',
    guidance: 'Check the link you were sent, or contact Code Rx Society for a new one.',
  },
};

export const linkStateScreen = (code: string | null | undefined): LinkStateScreen | null =>
  (code && LINK_STATE_SCREENS[code]) || null;

export const LINK_CONTACT_EMAIL = 'coderxsociety@gmail.com';

export const linkContactHref = (headline: string): string =>
  `mailto:${LINK_CONTACT_EMAIL}?subject=${encodeURIComponent(`Client portal — ${headline.toLowerCase()}`)}`;

/**
 * A link token is a credential. Only the shape is ever inspected in the browser;
 * the token is exchanged once and then removed from the address bar.
 */
export const looksLikeLinkToken = (value: string | null | undefined): boolean =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{32,160}$/.test(value.trim());

export const linkPath = (token: string): string => `/#client-portal/link/${encodeURIComponent(token)}`;
