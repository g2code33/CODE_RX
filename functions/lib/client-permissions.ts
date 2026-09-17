/**
 * CODE Rx SOCIETY — GRANULAR CLIENT-PORTAL CAPABILITIES (Phase 6)
 *
 * One registry, one authorization engine.
 *
 * The client portal's delegation reuses the platform's existing
 * `website_admins` / `website_admin_permissions` engine. Phase 5 delegated four
 * coarse keys (`clients.manage`, `clients.publish`, `clients.links`,
 * `clients.preview`). Phase 6 replaces the coarse checks with the granular
 * capabilities listed in the phase brief, without inventing a second role
 * system and without a destructive data migration:
 *
 *   • every Phase 5 key keeps working — it is expanded to the granular
 *     capabilities it always meant, so an existing grant never widens and never
 *     silently disappears;
 *   • PHANTOM remains the highest-authority controller and passes every check;
 *   • a founding codename (NEXUS, GHOST, FALCON, QUANTUM, MATRIX) grants
 *     nothing on its own — each capability must be granted explicitly;
 *   • every check is server-side. The UI reflects capabilities so operators do
 *     not see actions they cannot perform, but the server is the authority.
 *
 * The stored `permission_key` values follow the platform's existing dotted
 * convention; `brief` carries the name used in the phase brief so the mapping is
 * explicit in the API, the UI and the report.
 */

import { actorFromContext, audit, hasWebsitePermission, type Actor } from './vault';
import { clientPermissionKeys } from './client-portal';

const asRows = async <T>(statement: D1PreparedStatement): Promise<T[]> => {
  const result = await statement.all<T>();
  return result.results || [];
};

// ---------------------------------------------------------------------------
// The capability registry
// ---------------------------------------------------------------------------

export interface ClientCapability {
  /** Stored `website_admin_permissions.permission_key`. */
  key: string;
  /** The name used in the Phase 6 brief (kept verbatim for traceability). */
  brief: string;
  /** Operator-facing label. */
  label: string;
  /** Grouping used by the permission matrix. */
  group: string;
  /** One-line explanation of what the capability authorizes. */
  description: string;
  /** True for capabilities that already existed before Phase 6. */
  existing?: boolean;
  /** True when the capability is granted to nobody by default. */
  explicitOnly?: boolean;
}

export const CLIENT_CAPABILITIES: readonly ClientCapability[] = [
  {
    key: 'clients.view', brief: 'CLIENT_VIEW', label: 'View clients', group: 'Clients',
    description: 'List clients and open a client record, its projects and its access keys.',
  },
  {
    key: 'clients.create', brief: 'CLIENT_CREATE', label: 'Create clients', group: 'Clients',
    description: 'Add a new client organisation to the portal.',
  },
  {
    key: 'clients.edit', brief: 'CLIENT_EDIT', label: 'Edit clients', group: 'Clients',
    description: 'Change a client name, contact details or internal note.',
  },
  {
    key: 'clients.suspend', brief: 'CLIENT_SUSPEND', label: 'Suspend client access', group: 'Clients',
    description: 'Suspend or reactivate a client and revoke all of its access server-side.',
  },
  {
    key: 'clients.archive', brief: 'CLIENT_ARCHIVE', label: 'Archive clients', group: 'Clients',
    description: 'Archive a client so it leaves the active workspace without being destroyed.',
  },

  {
    key: 'clients.projects.view', brief: 'CLIENT_PROJECT_VIEW', label: 'View projects', group: 'Projects',
    description: "List a client's projects.",
  },
  {
    key: 'clients.projects.create', brief: 'CLIENT_PROJECT_CREATE', label: 'Create projects', group: 'Projects',
    description: 'Create a project for one client.',
  },
  {
    key: 'clients.projects.edit', brief: 'CLIENT_PROJECT_EDIT', label: 'Edit projects', group: 'Projects',
    description: 'Change a project name, description or status.',
  },
  {
    key: 'clients.projects.archive', brief: 'CLIENT_PROJECT_ARCHIVE', label: 'Archive projects', group: 'Projects',
    description: 'Archive or restore a project.',
  },

  {
    key: 'clients.documents.view', brief: 'CLIENT_DOCUMENT_VIEW', label: 'View client documents', group: 'Documents',
    description: 'List the documents held for a client, including drafts and lifecycle state.',
  },
  {
    key: 'clients.documents.create', brief: 'CLIENT_DOCUMENT_CREATE', label: 'Create client documents', group: 'Documents',
    description: 'Create a client document from an internal document or from client-facing text.',
  },
  {
    key: 'clients.documents.edit', brief: 'CLIENT_DOCUMENT_EDIT', label: 'Edit client documents', group: 'Documents',
    description: 'Change a client document title, summary, version, view and download permissions.',
  },
  {
    key: 'clients.documents.publish', brief: 'CLIENT_DOCUMENT_PUBLISH', label: 'Publish documents', group: 'Documents',
    description: 'Move a document through In review → Approved → Published to the client.',
  },
  {
    key: 'clients.documents.unpublish', brief: 'CLIENT_DOCUMENT_UNPUBLISH', label: 'Unpublish documents', group: 'Documents',
    description: 'Withdraw a published document from the client or archive it.',
  },
  {
    key: 'clients.documents.delete', brief: 'CLIENT_DOCUMENT_DELETE', label: 'Delete client documents', group: 'Documents',
    description: 'Remove a client document from the portal into the existing Recycle Bin.',
  },

  {
    key: 'clients.keys.create', brief: 'CLIENT_ACCESS_KEY_CREATE', label: 'Generate access keys', group: 'Access keys',
    description: 'Generate a client access key. It is shown once and stored only as a hash.',
  },
  {
    key: 'clients.keys.regenerate', brief: 'CLIENT_ACCESS_KEY_REGENERATE', label: 'Regenerate access keys', group: 'Access keys',
    description: 'Rotate an access key and end every session that used the old credential.',
  },
  {
    key: 'clients.keys.revoke', brief: 'CLIENT_ACCESS_KEY_REVOKE', label: 'Revoke access keys', group: 'Access keys',
    description: 'Revoke an access key so it can never sign in again.',
  },

  {
    key: 'clients.links.create', brief: 'CLIENT_LINK_CREATE', label: 'Create temporary links', group: 'Temporary links',
    description: 'Issue a temporary access link for a project or one published document.',
  },
  {
    key: 'clients.links.revoke', brief: 'CLIENT_LINK_REVOKE', label: 'Revoke temporary links', group: 'Temporary links',
    description: 'Revoke an outstanding temporary link.',
  },
  {
    key: 'clients.links.manage', brief: 'CLIENT_LINK_MANAGE', label: 'Manage temporary links', group: 'Temporary links',
    description: 'See every outstanding link for a client and revoke any of them.',
  },

  {
    key: 'clients.activity.view', brief: 'CLIENT_ACTIVITY_VIEW', label: 'View client activity', group: 'Activity',
    description: 'Read the client activity history recorded in the existing audit log.',
  },

  {
    key: 'clients.settings.manage', brief: 'CLIENT_SETTINGS_MANAGE', label: 'Manage portal settings', group: 'Settings',
    description: 'Control the client portal switches: portal enabled, downloads enabled, temporary links.',
  },

  {
    key: 'clients.permissions.manage', brief: 'CLIENT_PERMISSIONS_MANAGE', label: 'Manage client permissions', group: 'Permissions',
    description: 'Read the client permission matrix and grant, remove or modify client capabilities.',
  },

  // Phase 5 capability, kept exactly as it was: it was not in the Phase 6 list
  // because it already existed, so its key, meaning and grants are unchanged.
  {
    key: 'clients.preview', brief: 'CLIENT_PREVIEW', label: 'Preview as client', group: 'Preview',
    description: 'Open PREVIEW AS CLIENT for any client. Never weakens authorization and serves no file.',
    existing: true, explicitOnly: true,
  },
];

export const CLIENT_CAPABILITY_KEYS: readonly string[] = CLIENT_CAPABILITIES.map((entry) => entry.key);

export const clientCapability = (key: string): ClientCapability | null =>
  CLIENT_CAPABILITIES.find((entry) => entry.key === key) || null;

// ---------------------------------------------------------------------------
// Legacy Phase 5 umbrella keys — preserved, expanded, never widened
// ---------------------------------------------------------------------------

const LEGACY_WITHOUT_GRANULAR_EQUIVALENT = ['clients.preview'] as const;

/**
 * What each Phase 5 key always meant, expressed in granular capabilities.
 * `clients.manage` deliberately does NOT expand to permission management or
 * portal settings: in Phase 5 those actions were PHANTOM-only, so expanding
 * them here would silently widen an existing grant.
 */
export const LEGACY_CLIENT_PERMISSION_EXPANSIONS: Record<string, readonly string[]> = {
  'clients.manage': [
    'clients.view', 'clients.create', 'clients.edit', 'clients.suspend', 'clients.archive',
    'clients.projects.view', 'clients.projects.create', 'clients.projects.edit', 'clients.projects.archive',
    'clients.documents.view', 'clients.documents.create', 'clients.documents.edit', 'clients.documents.delete',
    'clients.keys.create', 'clients.keys.regenerate', 'clients.keys.revoke',
    'clients.activity.view',
  ],
  'clients.publish': ['clients.documents.publish', 'clients.documents.unpublish'],
  'clients.links': ['clients.links.create', 'clients.links.revoke', 'clients.links.manage'],
  'clients.preview': ['clients.preview'],
};

/** The Phase 5 keys themselves, read from the Phase 5 module (single source). */
export const LEGACY_CLIENT_PERMISSION_KEYS: readonly string[] = [...clientPermissionKeys];

/** Every key the client-portal delegation layer understands. */
export const CLIENT_PORTAL_PERMISSION_KEYS: readonly string[] = [
  ...CLIENT_CAPABILITY_KEYS,
  ...LEGACY_CLIENT_PERMISSION_KEYS,
  ...LEGACY_WITHOUT_GRANULAR_EQUIVALENT.filter((key) => !LEGACY_CLIENT_PERMISSION_KEYS.includes(key)),
];

export const isClientPortalPermissionKey = (key: unknown): boolean =>
  typeof key === 'string' && CLIENT_PORTAL_PERMISSION_KEYS.includes(key);

export const isClientCapabilityKey = (key: unknown): boolean =>
  typeof key === 'string' && CLIENT_CAPABILITY_KEYS.includes(key);

export const isLegacyClientPermissionKey = (key: unknown): boolean =>
  typeof key === 'string' && LEGACY_CLIENT_PERMISSION_KEYS.includes(key);

/** The capabilities a set of granted keys resolves to (granular + legacy). */
export const expandClientPermissionKeys = (granted: readonly string[]): Set<string> => {
  const resolved = new Set<string>();
  for (const key of granted) {
    if (isClientCapabilityKey(key)) resolved.add(key);
    for (const capability of LEGACY_CLIENT_PERMISSION_EXPANSIONS[key] || []) resolved.add(capability);
  }
  return resolved;
};

// ---------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------

/**
 * Effective capabilities for an actor. Mirrors the platform's existing
 * delegation semantics exactly: PHANTOM (and a legacy admin without a Website
 * Admin row) is implicitly allowed everything; any other account must be an
 * active member with an active Website Admin row holding the key.
 */
export const effectiveClientCapabilities = async (db: D1Database, actor: Actor | null): Promise<Set<string>> => {
  if (!actor) return new Set();
  if (actor.isPhantom || (actor.userRole === 'admin' && !actor.websiteAdminId)) return new Set(CLIENT_CAPABILITY_KEYS);
  if (!actor.profileId || actor.memberStatus !== 'active' || !actor.websiteAdminId) return new Set();
  const rows = await asRows<{ permission_key: string }>(db.prepare(
    'SELECT permission_key FROM website_admin_permissions WHERE website_admin_id = ? AND allowed = 1'
  ).bind(actor.websiteAdminId));
  return expandClientPermissionKeys(rows.map((row) => String(row.permission_key || '')));
};

/**
 * Server-side capability check. The primary check goes through the platform's
 * existing `hasWebsitePermission`, so PHANTOM, the legacy-admin rule, member
 * status and the delegated row are all decided by one engine; the legacy
 * umbrella keys are then expanded so Phase 5 grants keep working unchanged.
 */
export const hasClientCapability = async (db: D1Database, actor: Actor | null, capability: string): Promise<boolean> => {
  if (!actor) return false;
  if (await hasWebsitePermission(db, actor, capability)) return true;
  for (const [legacyKey, expansion] of Object.entries(LEGACY_CLIENT_PERMISSION_EXPANSIONS)) {
    if (!expansion.includes(capability)) continue;
    if (await hasWebsitePermission(db, actor, legacyKey)) return true;
  }
  return false;
};

/** The one refusal shape for every client-portal permission failure. */
export const clientPermissionDenied = (c: any, capability: string) =>
  c.json({
    success: false,
    error: 'Client portal permission required.',
    code: 'client_permission_required',
    permission: capability,
  }, 403);

/**
 * Returns a refusal response when the actor lacks the capability, otherwise
 * null. Used by routes whose capability depends on the request body (a status
 * change or a lifecycle step), where the whole check still happens before any
 * write.
 */
export const assertClientCapability = async (c: any, capability: string): Promise<Response | null> => {
  const actor = await actorFromContext(c);
  if (!actor) return c.json({ success: false, error: 'Account not found' }, 404);
  if (!await hasClientCapability(c.env.DB, actor, capability)) return clientPermissionDenied(c, capability);
  return null;
};

/** Hono middleware for a single capability. */
export const requireClientCapability = (capability: string) => async (c: any, next: any) => {
  const refusal = await assertClientCapability(c, capability);
  if (refusal) return refusal;
  await next();
};

/** Hono middleware for "any of these capabilities". */
export const requireAnyClientCapability = (capabilities: readonly string[]) => async (c: any, next: any) => {
  const actor = await actorFromContext(c);
  if (!actor) return c.json({ success: false, error: 'Account not found' }, 404);
  for (const capability of capabilities) {
    if (await hasClientCapability(c.env.DB, actor, capability)) { await next(); return; }
  }
  return clientPermissionDenied(c, capabilities[0]);
};

// ---------------------------------------------------------------------------
// Request-shape → capability resolution
// ---------------------------------------------------------------------------

/**
 * A client status change is two different capabilities. Anything that denies
 * access (suspend / revoke) or restores it is CLIENT_SUSPEND; archiving the
 * record is CLIENT_ARCHIVE.
 */
export const capabilityForClientStatus = (status: string): string =>
  (status === 'archived' ? 'clients.archive' : 'clients.suspend');

/** A document lifecycle step is publishing, unpublishing, or neither. */
export const capabilityForLifecycleState = (state: string): string => {
  if (state === 'unpublished' || state === 'archived') return 'clients.documents.unpublish';
  return 'clients.documents.publish';
};

/** A project update that changes the archive flag is the archive capability. */
export const capabilityForProjectUpdate = (body: any): string =>
  (body && body.archive === true ? 'clients.projects.archive' : 'clients.projects.edit');

// ---------------------------------------------------------------------------
// Delegation (grant / remove / modify) with a non-escalation rule
// ---------------------------------------------------------------------------

export interface PermissionChangeSet {
  previous: string[];
  next: string[];
  added: string[];
  removed: string[];
}

export const diffPermissionSets = (previous: Iterable<string>, next: Iterable<string>): PermissionChangeSet => {
  const before = Array.from(new Set(previous));
  const after = Array.from(new Set(next));
  return {
    previous: before.sort(),
    next: after.sort(),
    added: after.filter((key) => !before.includes(key)).sort(),
    removed: before.filter((key) => !after.includes(key)).sort(),
  };
};

/**
 * A delegated permission manager (`clients.permissions.manage`) may only work
 * inside the client-portal capability set, never on their own account, and they
 * cannot grant or remove a capability they do not hold themselves. PHANTOM is
 * unrestricted, which is what keeps PHANTOM the highest authority.
 */
export const permissionChangeRefusal = async (
  db: D1Database,
  actor: Actor,
  targetProfileId: number,
  changes: PermissionChangeSet,
): Promise<string | null> => {
  if (actor.isPhantom) return null;
  if (targetProfileId === actor.profileId) return 'You cannot change your own client permissions.';
  const requested = changes.added.concat(changes.removed);
  if (requested.some((key) => !isClientCapabilityKey(key))) {
    return 'A delegated permission manager can only manage client portal capabilities.';
  }
  const held = await effectiveClientCapabilities(db, actor);
  const beyond = requested.filter((key) => !held.has(key));
  if (beyond.length) return `You cannot grant or remove a capability you do not hold: ${beyond.join(', ')}.`;
  return null;
};

// ---------------------------------------------------------------------------
// Audit (requirement 5 — WHO, WHAT, WHEN, TARGET, OLD VALUE, NEW VALUE)
// ---------------------------------------------------------------------------

/**
 * Records a permission change on the existing audit_logs table. The actor and
 * timestamp come from the audit helper itself (`actor_user_id`,
 * `actor_member_profile_id`, `created_at`); the details carry the target and the
 * previous/next values so the change is reconstructable.
 */
export const auditPermissionChange = async (
  db: D1Database,
  actor: Actor | null,
  options: {
    targetProfileId: number;
    targetMemberCode?: string | null;
    targetName?: string | null;
    targetWebsiteAdminId?: number | null;
    changes: PermissionChangeSet;
    source: string;
  },
) => {
  await audit(db, actor, 'client.permissions.updated', 'member_profile', options.targetProfileId, {
    target: {
      memberProfileId: options.targetProfileId,
      memberCode: options.targetMemberCode ?? null,
      name: options.targetName ?? null,
      websiteAdminId: options.targetWebsiteAdminId ?? null,
    },
    previousValue: options.changes.previous,
    newValue: options.changes.next,
    added: options.changes.added,
    removed: options.changes.removed,
    source: options.source,
  });
};
