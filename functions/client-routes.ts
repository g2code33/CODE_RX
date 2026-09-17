/**
 * Client Project Portal — backend foundation routes.
 *
 * Registered additively from `functions/[[path]].ts`. No existing route,
 * guard, or helper is modified by this file.
 *
 *   Public client surface   /api/client/*           (client session credential)
 *   Management surface      /api/phantom/clients*   (PHANTOM or delegated member)
 *
 * Authorization rules implemented here:
 *   - The portal is dark until `client_portal_enabled` is switched on.
 *   - A client session is a D1-backed, revocable, 12-hour credential. It is
 *     never a member JWT, and it is transported in its own header.
 *   - Suspension, archival, revocation and unpublishing are re-evaluated on
 *     every request, so they take effect immediately.
 *   - The client id and project id always come from the session row. A browser
 *     can only ever supply opaque public ids, which must belong to that client.
 *   - Every authorization failure is an identical 404.
 */

import type { Hono } from 'hono';
import { requireAuth } from './lib/auth';
import { actorFromContext, audit } from './lib/vault';
import { checkRateLimit } from './lib/rate-limit';
import { cleanEmail, cleanOptionalStr, cleanStr } from './lib/validate';
import {
  clientThrottleKeys,
  consumeClientAuthThrottle,
  createClientSession,
  generateClientPasskey,
  generateClientSessionToken,
  normalizeClientPasskey,
  clientPasskeyHash,
  clientSessionHash,
  clientFingerprints,
  resolveClientLink,
  consumeClientLinkUse,
  generateClientLinkToken,
  clientLinkHash,
  newClientPublicId,
  pruneClientAuthThrottle,
  revokeClientAccessKeys,
  revokeClientLinks,
  revokeClientSessions,
  revokeClientSessionsForKey,
  CLIENT_AUTH_IP_LIMIT,
  CLIENT_AUTH_IP_WINDOW_SECONDS,
  CLIENT_AUTH_IP_LOCK_SECONDS,
  CLIENT_AUTH_KEY_LIMIT,
  CLIENT_AUTH_KEY_WINDOW_SECONDS,
  CLIENT_AUTH_KEY_LOCK_SECONDS,
  CLIENT_SESSION_TTL_SECONDS,
  CLIENT_LINK_SESSION_TTL_SECONDS,
  CLIENT_LINK_DEFAULT_TTL_MINUTES,
  CLIENT_LINK_DEFAULT_MAX_USES,
} from './lib/client-auth';
import {
  allocateClientReference,
  clientAllLinksEnabled,
  clientDocumentExposure,
  clientDownloadsEnabled,
  clientPortalEnabled,
  clientJson,
  clientNotFound,
  clientProjectUsable,
  clientUsable,
  publicDocument,
  publicProject,
  recordClientActivity,
  referenceKindForCategory,
  requireClientDocumentAccess,
  requireClientPermission,
  requireClientPortalEnabled,
  requireClientProjectAccess,
  requireClientSession,
  CLIENT_DOCUMENT_CATEGORIES,
  CLIENT_DOCUMENT_LIFECYCLE,
  type ClientDocumentCategory,
  type ClientDocumentLifecycle,
  type ClientPrincipal,
} from './lib/client-portal';

type ClientApp = Hono<any>;

const CLIENT_SECTIONS = ['overview', 'documents', 'letters', 'agreements', 'reports', 'deliverables', 'updates'] as const;
type ClientSection = typeof CLIENT_SECTIONS[number];

const SECTION_CATEGORY: Record<Exclude<ClientSection, 'overview'>, ClientDocumentCategory> = {
  documents: 'document',
  letters: 'letter',
  agreements: 'agreement',
  reports: 'report',
  deliverables: 'deliverable',
  updates: 'update',
};

/** One neutral message for every credential failure. Never a reason. */
const INVALID_KEY_MESSAGE = 'This project access key is not valid, has expired, or access has been withdrawn. Please contact Code Rx Society.';

const asRows = async <T>(statement: D1PreparedStatement): Promise<T[]> => {
  const result = await statement.all<T>();
  return result.results || [];
};

const one = async <T>(statement: D1PreparedStatement): Promise<T | null> => {
  const rows = await asRows<T>(statement);
  return rows[0] || null;
};

const integerParam = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const parseDate = (value: unknown): string | null => {
  const text = cleanOptionalStr(value, 40);
  if (!text) return null;
  const time = new Date(text).getTime();
  if (!Number.isFinite(time)) return null;
  return new Date(time).toISOString();
};

const safeDownloadName = (document: any) => {
  const base = String(document.reference_code || document.title || 'code-rx-client-document')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100) || 'code-rx-client-document';
  return `${base}.pdf`;
};

// ---------------------------------------------------------------------------
// Shared lookups
// ---------------------------------------------------------------------------

const findClientByPublicId = async (db: D1Database, publicId: string) => one<any>(
  db.prepare('SELECT * FROM clients WHERE public_id = ?').bind(publicId),
);

const findProjectByPublicId = async (db: D1Database, publicId: string) => one<any>(
  db.prepare('SELECT * FROM client_projects WHERE public_id = ?').bind(publicId),
);

const findDocumentByPublicId = async (db: D1Database, publicId: string) => one<any>(
  db.prepare('SELECT * FROM client_documents WHERE public_id = ?').bind(publicId),
);

/**
 * Applies the emergency cascade. Suspending, archiving, revoking or fully
 * revoking a client immediately kills every credential AND every temporary
 * access path belonging to that client. A previously issued direct link cannot
 * survive this, and the parent-status check on each request is the backstop.
 */
const cascadeClientAccessRevocation = async (db: D1Database, clientId: number) => {
  const keys = await revokeClientAccessKeys(db, clientId);
  const sessions = await revokeClientSessions(db, clientId);
  const links = await revokeClientLinks(db, clientId);
  return { keys, sessions, links };
};

// ---------------------------------------------------------------------------
// Public client API
// ---------------------------------------------------------------------------

const loginPayload = (principal: {
  clientPublicId: string;
  clientName: string;
  clientContactName: string | null;
  projectPublicId: string;
  projectReference: string;
  projectName: string;
  projectDescription: string;
}, permissions: { download: boolean }) => ({
  client: {
    id: principal.clientPublicId,
    name: principal.clientName,
    contactName: principal.clientContactName,
  },
  project: {
    id: principal.projectPublicId,
    reference: principal.projectReference,
    name: principal.projectName,
    description: principal.projectDescription,
  },
  permissions: { view: true, download: permissions.download },
});

export const registerClientRoutes = (app: ClientApp) => {
  // =========================================================================
  // CLIENT ACCESS — public (rate limited, throttled, uniform failures)
  // =========================================================================

  app.post('/api/client/auth/login', requireClientPortalEnabled, async (c: any) => {
    const db = c.env.DB;

    // Layer 1: the existing per-isolate limiter (unchanged helper).
    if (!checkRateLimit(c, 10, 60)) {
      return clientJson({ success: false, error: 'Too many attempts. Please wait a minute.' }, 429);
    }

    const body = await c.req.json().catch(() => ({}));
    const normalized = normalizeClientPasskey(body?.passkey);

    // Layer 2: durable per-IP and per-attempted-key throttling in D1. The
    // in-memory limiter alone cannot survive a scaled-out attacker.
    await pruneClientAuthThrottle(db);
    const throttleKeys = await clientThrottleKeys(c, normalized);
    const ipThrottle = await consumeClientAuthThrottle(c.env.DB, throttleKeys.ipScope,
      CLIENT_AUTH_IP_LIMIT, CLIENT_AUTH_IP_WINDOW_SECONDS, CLIENT_AUTH_IP_LOCK_SECONDS);
    if (!ipThrottle.allowed) {
      return clientJson({ success: false, error: 'Too many attempts. Please try again shortly.' }, 429);
    }
    if (throttleKeys.keyScope) {
      const keyThrottle = await consumeClientAuthThrottle(c.env.DB, throttleKeys.keyScope,
        CLIENT_AUTH_KEY_LIMIT, CLIENT_AUTH_KEY_WINDOW_SECONDS, CLIENT_AUTH_KEY_LOCK_SECONDS);
      if (!keyThrottle.allowed) {
        return clientJson({ success: false, error: 'Too many attempts. Please try again shortly.' }, 429);
      }
    }

    if (!normalized) {
      await recordClientActivity(db, 'ACCESS_DENIED', { details: { reason: 'malformed_passkey' } });
      return clientJson({ success: false, error: INVALID_KEY_MESSAGE }, 401);
    }

    const key = await one<any>(db.prepare(
      `SELECT k.id AS key_id, k.status AS key_status, k.expires_at AS key_expires_at, k.client_project_id AS key_project_id,
              cl.id AS client_id, cl.public_id AS client_public_id, cl.name AS client_name,
              cl.contact_name AS client_contact_name, cl.status AS client_status
       FROM client_access_keys k
       JOIN clients cl ON cl.id = k.client_id
       WHERE k.key_hash = ?`
    ).bind(await clientPasskeyHash(normalized)));

    // One uniform failure for unknown, revoked, expired, unbound, suspended and
    // archived. The real reason is written to the audit log, server-side only.
    const deny = async (reason: string) => {
      await recordClientActivity(db, 'ACCESS_DENIED', {
        clientPublicId: key?.client_public_id ?? null,
        details: { reason },
      });
      return clientJson({ success: false, error: INVALID_KEY_MESSAGE }, 401);
    };

    if (!key) return deny('unknown_key');
    if (key.key_status !== 'active') return deny('key_revoked');
    if (key.key_expires_at && new Date(key.key_expires_at).getTime() <= Date.now()) return deny('key_expired');
    if (!clientUsable({ status: key.client_status })) return deny(`client_${key.client_status}`);

    // The session must carry a project. If the key is project-scoped, that is
    // the project. Otherwise the client must have exactly one usable project —
    // ambiguous access is refused rather than guessed.
    let project = key.key_project_id
      ? await one<any>(db.prepare('SELECT * FROM client_projects WHERE id = ? AND client_id = ?').bind(key.key_project_id, key.client_id))
      : null;
    if (!project && !key.key_project_id) {
      const candidates = await asRows<any>(db.prepare(
        "SELECT * FROM client_projects WHERE client_id = ? AND status = 'active' AND is_archived = 0 ORDER BY id LIMIT 2"
      ).bind(key.client_id));
      if (candidates.length === 1) project = candidates[0];
    }
    if (!project) return deny('no_usable_project');
    if (!clientProjectUsable(project)) return deny(`project_${project.status}`);

    const fingerprints = await clientFingerprints(c);
    const sessionToken = generateClientSessionToken();
    const expiresAt = new Date(Date.now() + CLIENT_SESSION_TTL_SECONDS * 1000).toISOString();
    const sessionId = await createClientSession(db, {
      clientId: Number(key.client_id),
      clientProjectId: Number(project.id),
      accessKeyId: Number(key.key_id),
      clientLinkId: null,
      sessionHash: await clientSessionHash(sessionToken),
      expiresAtIso: expiresAt,
      ipHash: fingerprints.ipHash,
      userAgentHash: fingerprints.userAgentHash,
    });

    await db.prepare('UPDATE client_access_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?').bind(key.key_id).run();

    const principal: ClientPrincipal = {
      sessionId,
      clientId: Number(key.client_id),
      clientPublicId: key.client_public_id,
      clientName: key.client_name,
      clientContactName: key.client_contact_name ?? null,
      clientContactEmail: null,
      clientStatus: key.client_status,
      projectId: Number(project.id),
      projectPublicId: project.public_id,
      projectReference: project.reference_code,
      projectName: project.name,
      projectStatus: project.status,
      accessKeyId: Number(key.key_id),
      linkId: null,
      linkAllowsView: true,
      linkAllowsDownload: true,
      linkDocumentId: null,
      expiresAt,
    };

    await recordClientActivity(db, 'LOGIN', { principal, details: { method: 'passkey' } });

    return clientJson({
      success: true,
      data: {
        session: { token: sessionToken, expiresAt },
        ...loginPayload({ ...principal, projectDescription: project.description || '' }, {
          download: await clientDownloadsEnabled(db),
        }),
      },
    });
  });

  app.post('/api/client/auth/logout', requireClientPortalEnabled, requireClientSession, async (c: any) => {
    const principal = c.get('client') as ClientPrincipal;
    await c.env.DB.prepare('UPDATE client_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = ? AND revoked_at IS NULL')
      .bind(principal.sessionId).run();
    await recordClientActivity(c.env.DB, 'LOGOUT', { principal });
    return clientJson({ success: true });
  });

  /** Session context. Re-reads the database so a suspended client cannot keep working. */
  app.get('/api/client/me', requireClientPortalEnabled, requireClientSession, async (c: any) => {
    const principal = c.get('client') as ClientPrincipal;
    const project = await one<any>(c.env.DB.prepare('SELECT * FROM client_projects WHERE id = ?').bind(principal.projectId));
    if (!project) return clientNotFound();
    return clientJson({
      success: true,
      data: {
        session: { expiresAt: principal.expiresAt },
        ...loginPayload({ ...principal, projectDescription: project.description || '' }, {
          download: await clientDownloadsEnabled(c.env.DB),
        }),
      },
    });
  });

  app.get('/api/client/project/:projectId', requireClientPortalEnabled, requireClientSession, requireClientProjectAccess, async (c: any) => {
    const principal = c.get('client') as ClientPrincipal;
    const project = c.get('clientProject') as any;
    const db = c.env.DB;

    const counts = await asRows<{ category: string; total: number }>(db.prepare(
      `SELECT category, COUNT(*) AS total FROM client_documents
       WHERE client_id = ? AND client_project_id = ? AND is_archived = 0
         AND lifecycle_status = 'published' AND client_visible = 1
         AND allow_view = 1
       GROUP BY category`
    ).bind(principal.clientId, Number(project.id)));

    const byCategory: Record<string, number> = {};
    for (const section of Object.values(SECTION_CATEGORY)) byCategory[section] = 0;
    for (const row of counts) byCategory[String(row.category)] = Number(row.total || 0);

    const recent = await asRows<any>(db.prepare(
      `SELECT * FROM client_documents
       WHERE client_id = ? AND client_project_id = ? AND is_archived = 0
         AND lifecycle_status = 'published' AND client_visible = 1 AND allow_view = 1
       ORDER BY COALESCE(published_at, updated_at) DESC, id DESC LIMIT 5`
    ).bind(principal.clientId, Number(project.id)));

    await recordClientActivity(db, 'PROJECT_OPENED', { principal });

    return clientJson({
      success: true,
      data: {
        project: publicProject(project),
        sections: CLIENT_SECTIONS.map((section) => ({
          id: section,
          label: section.charAt(0).toUpperCase() + section.slice(1),
          count: section === 'overview' ? recent.length : byCategory[SECTION_CATEGORY[section]] || 0,
        })),
        recent: recent.map((row) => publicDocument(row, clientDocumentExposure(row, project, { status: principal.clientStatus }))),
      },
    });
  });

  app.get('/api/client/project/:projectId/sections/:section', requireClientPortalEnabled, requireClientSession, requireClientProjectAccess, async (c: any) => {
    const principal = c.get('client') as ClientPrincipal;
    const project = c.get('clientProject') as any;
    const section = String(c.req.param('section') || '').toLowerCase() as ClientSection;
    if (!CLIENT_SECTIONS.includes(section)) return clientNotFound();

    const db = c.env.DB;
    const rows = section === 'overview'
      ? await asRows<any>(db.prepare(
        `SELECT * FROM client_documents
         WHERE client_id = ? AND client_project_id = ? AND is_archived = 0
           AND lifecycle_status = 'published' AND client_visible = 1 AND allow_view = 1
         ORDER BY COALESCE(published_at, updated_at) DESC, id DESC LIMIT 50`
      ).bind(principal.clientId, Number(project.id)))
      : await asRows<any>(db.prepare(
        `SELECT * FROM client_documents
         WHERE client_id = ? AND client_project_id = ? AND category = ? AND is_archived = 0
           AND lifecycle_status = 'published' AND client_visible = 1 AND allow_view = 1
         ORDER BY COALESCE(published_at, updated_at) DESC, id DESC LIMIT 200`
      ).bind(principal.clientId, Number(project.id), SECTION_CATEGORY[section]));

    await recordClientActivity(db, 'SECTION_OPENED', { principal, details: { section } });

    const documents = rows.map((row) => publicDocument(row, clientDocumentExposure(row, project, { status: principal.clientStatus })));
    return clientJson({
      success: true,
      data: {
        project: publicProject(project),
        section,
        documents,
      },
    });
  });

  app.get('/api/client/project/:projectId/documents/:documentId', requireClientPortalEnabled, requireClientSession, requireClientProjectAccess, requireClientDocumentAccess, async (c: any) => {
    const principal = c.get('client') as ClientPrincipal;
    const project = c.get('clientProject') as any;
    const document = c.get('clientDocument') as any;
    const exposure = c.get('clientDocumentExposure') as { canView: boolean; canDownload: boolean };

    await recordClientActivity(c.env.DB, 'DOCUMENT_VIEWED', {
      principal,
      details: { documentId: document.public_id, reference: document.reference_code, category: document.category },
    });

    return clientJson({
      success: true,
      data: {
        project: publicProject(project),
        document: publicDocument(document, exposure, { includeContent: true }),
      },
    });
  });

  /**
   * Client download.
   *
   * This endpoint only ever serves an artifact that the stamping pipeline has
   * already produced and registered in `storage_reference`. It refuses anything
   * that is not already a client-safe `client-exports/...` object, so an
   * internal Vault key can never be proxied to a client, and a document whose
   * watermarked representation does not yet exist is simply not downloadable.
   */
  app.get('/api/client/project/:projectId/documents/:documentId/download', requireClientPortalEnabled, requireClientSession, requireClientProjectAccess, requireClientDocumentAccess, async (c: any) => {
    const principal = c.get('client') as ClientPrincipal;
    const document = c.get('clientDocument') as any;
    const exposure = c.get('clientDocumentExposure') as { canView: boolean; canDownload: boolean };
    const db = c.env.DB;

    const deny = async (reason: string) => {
      await recordClientActivity(db, 'ACCESS_DENIED', {
        principal,
        details: { reason, documentId: document.public_id },
      });
      return clientNotFound();
    };

    if (!exposure.canDownload) return deny('download_not_permitted');
    if (!await clientDownloadsEnabled(db)) return deny('downloads_disabled');

    // The authorization middleware keeps storage identifiers out of the shared
    // request context on purpose, so the artifact reference is re-read here,
    // scoped by the client/project/document the middleware already authorised.
    // A document can therefore never reach R2 through a tampered path.
    const artifact = await one<{ storage_reference: string | null }>(db.prepare(
      `SELECT storage_reference FROM client_documents
       WHERE id = ? AND client_id = ? AND client_project_id = ?`
    ).bind(Number(document.id), principal.clientId, Number(document.client_project_id)));
    const storageReference = String(artifact?.storage_reference || '').trim();
    if (!storageReference) return deny('no_client_artifact');
    if (!storageReference.startsWith('client-exports/')) return deny('unsafe_storage_reference');

    const object = await c.env.BUCKET.get(storageReference);
    if (!object) return deny('artifact_missing');

    await recordClientActivity(db, 'DOCUMENT_DOWNLOADED', {
      principal,
      details: { documentId: document.public_id, reference: document.reference_code, category: document.category },
    });

    return new Response(object.body, {
      headers: {
        'Content-Type': object.httpMetadata?.contentType || 'application/pdf',
        'Content-Disposition': `attachment; filename="${safeDownloadName(document)}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
      },
    });
  });

  /**
   * Temporary direct access. The link is exchanged for a normal, short-lived
   * client session — a URL id never authorizes anything by itself. The exchange
   * consumes one use atomically, re-validates the link server-side, and records
   * LINK_USED against the client.
   */
  app.post('/api/client/link/:token', async (c: any) => {
    const db = c.env.DB;
    if (!await clientPortalEnabled(db)) return clientNotFound();
    if (!await clientAllLinksEnabled(db)) return clientNotFound();

    // Same first layer as the passkey endpoint: link tokens are credentials too.
    if (!checkRateLimit(c, 20, 60)) {
      return clientJson({ success: false, error: 'Too many attempts. Please wait a minute.' }, 429);
    }

    const token = String(c.req.param('token') || '').trim();
    if (!token) return clientNotFound();

    const link = await resolveClientLink(db, token);
    if (!link) return clientNotFound();
    if (link.link_status !== 'active') return clientNotFound();
    if (link.link_expires_at && new Date(link.link_expires_at).getTime() <= Date.now()) return clientNotFound();
    if (!clientUsable({ status: link.client_status })) return clientNotFound();
    if (!clientProjectUsable({ status: link.project_status, is_archived: link.project_is_archived })) return clientNotFound();

    // One-use-per-redemption, enforced in SQL so concurrent attempts cannot
    // both win. A link that is out of uses is not an authorized credential.
    if (!await consumeClientLinkUse(db, Number(link.link_id))) return clientNotFound();

    const fingerprints = await clientFingerprints(c);
    const sessionToken = generateClientSessionToken();
    const expiresAt = new Date(Date.now() + CLIENT_LINK_SESSION_TTL_SECONDS * 1000).toISOString();
    const sessionId = await createClientSession(db, {
      clientId: Number(link.client_id),
      clientProjectId: Number(link.client_project_id),
      accessKeyId: null,
      clientLinkId: Number(link.link_id),
      sessionHash: await clientSessionHash(sessionToken),
      expiresAtIso: expiresAt,
      ipHash: fingerprints.ipHash,
      userAgentHash: fingerprints.userAgentHash,
    });

    const principal: ClientPrincipal = {
      sessionId,
      clientId: Number(link.client_id),
      clientPublicId: link.client_public_id,
      clientName: link.client_name,
      clientContactName: link.client_contact_name ?? null,
      clientContactEmail: null,
      clientStatus: link.client_status as ClientPrincipal['clientStatus'],
      projectId: Number(link.client_project_id),
      projectPublicId: link.project_public_id,
      projectReference: link.project_reference,
      projectName: link.project_name,
      projectStatus: link.project_status as ClientPrincipal['projectStatus'],
      accessKeyId: null,
      linkId: Number(link.link_id),
      linkAllowsView: Number(link.link_allow_view) === 1,
      linkAllowsDownload: Number(link.link_allow_download) === 1,
      linkDocumentId: link.client_document_id === null ? null : Number(link.client_document_id),
      expiresAt,
    };

    await recordClientActivity(db, 'LINK_USED', {
      principal,
      details: { linkId: link.link_public_id, destination: link.link_destination_type },
    });

    return clientJson({
      success: true,
      data: {
        session: { token: sessionToken, expiresAt },
        ...loginPayload({ ...principal, projectDescription: link.project_description || '' }, {
          download: principal.linkAllowsDownload && await clientDownloadsEnabled(db),
        }),
      },
    });
  });

  // =========================================================================
  // CLIENT ACCESS CENTER — PHANTOM, or a member PHANTOM has delegated to
  // =========================================================================

  const manage = requireClientPermission('clients.manage');
  const publish = requireClientPermission('clients.publish');
  const links = requireClientPermission('clients.links');

  app.get('/api/phantom/clients', requireAuth, manage, async (c: any) => {
    const includeArchived = c.req.query('archived') === '1';
    const clients = await asRows<any>(c.env.DB.prepare(
      `SELECT cl.*, 
              (SELECT COUNT(*) FROM client_projects p WHERE p.client_id = cl.id AND p.is_archived = 0) AS project_count,
              (SELECT COUNT(*) FROM client_access_keys k WHERE k.client_id = cl.id AND k.status = 'active') AS active_key_count,
              (SELECT COUNT(*) FROM client_documents d WHERE d.client_id = cl.id AND d.is_archived = 0) AS document_count
       FROM clients cl
       ${includeArchived ? '' : "WHERE cl.status <> 'archived'"}
       ORDER BY cl.updated_at DESC, cl.id DESC LIMIT 500`
    ));
    return c.json({
      success: true,
      data: clients.map((client) => ({
        id: client.public_id,
        name: client.name,
        contactName: client.contact_name || '',
        contactEmail: client.contact_email || '',
        contactPhone: client.contact_phone || '',
        status: client.status,
        notes: client.notes || '',
        projectCount: Number(client.project_count || 0),
        activeKeyCount: Number(client.active_key_count || 0),
        documentCount: Number(client.document_count || 0),
        createdAt: client.created_at,
        updatedAt: client.updated_at,
      })),
    });
  });

  app.post('/api/phantom/clients', requireAuth, manage, async (c: any) => {
    const db = c.env.DB;
    const actor = await actorFromContext(c);
    const body = await c.req.json().catch(() => ({}));
    const name = cleanStr(body.name, 2, 200);
    if (!name) return c.json({ success: false, error: 'An organisation or company name is required.' }, 400);
    const contactEmail = body.contactEmail === undefined || body.contactEmail === '' ? null : cleanEmail(body.contactEmail);
    if (body.contactEmail && !contactEmail) return c.json({ success: false, error: 'Enter a valid contact email address.' }, 400);

    const publicId = newClientPublicId('cli');
    const result = await db.prepare(
      `INSERT INTO clients (public_id, name, contact_name, contact_email, contact_phone, notes, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      publicId,
      name,
      cleanOptionalStr(body.contactName, 200),
      contactEmail,
      cleanOptionalStr(body.contactPhone, 60),
      cleanOptionalStr(body.notes, 4000) || '',
      actor?.userId ?? null,
    ).run();

    await audit(db, actor, 'client.created', 'client', Number(result.meta.last_row_id), { publicId, name });
    // Only the opaque public identifier crosses the API boundary.
    return c.json({ success: true, data: { id: publicId } }, 201);
  });

  app.get('/api/phantom/clients/:clientId', requireAuth, manage, async (c: any) => {
    const client = await findClientByPublicId(c.env.DB, String(c.req.param('clientId') || ''));
    if (!client) return c.json({ success: false, error: 'Client not found.' }, 404);
    const projects = await asRows<any>(c.env.DB.prepare(
      'SELECT * FROM client_projects WHERE client_id = ? ORDER BY is_archived, name COLLATE NOCASE'
    ).bind(client.id));
    return c.json({
      success: true,
      data: {
        client: {
          id: client.public_id,
          name: client.name,
          contactName: client.contact_name || '',
          contactEmail: client.contact_email || '',
          contactPhone: client.contact_phone || '',
          status: client.status,
          notes: client.notes || '',
          createdAt: client.created_at,
          updatedAt: client.updated_at,
        },
        projects: projects.map((project) => ({
          id: project.public_id,
          reference: project.reference_code,
          name: project.name,
          description: project.description || '',
          status: project.status,
          isArchived: Number(project.is_archived) === 1,
          createdAt: project.created_at,
          updatedAt: project.updated_at,
        })),
      },
    });
  });

  app.patch('/api/phantom/clients/:clientId', requireAuth, manage, async (c: any) => {
    const db = c.env.DB;
    const actor = await actorFromContext(c);
    const client = await findClientByPublicId(db, String(c.req.param('clientId') || ''));
    if (!client) return c.json({ success: false, error: 'Client not found.' }, 404);
    const body = await c.req.json().catch(() => ({}));

    const name = body.name === undefined ? client.name : cleanStr(body.name, 2, 200);
    if (!name) return c.json({ success: false, error: 'A valid organisation name is required.' }, 400);
    let contactEmail = client.contact_email;
    if (body.contactEmail !== undefined) {
      contactEmail = body.contactEmail === '' || body.contactEmail === null ? null : cleanEmail(body.contactEmail);
      if (body.contactEmail && !contactEmail) return c.json({ success: false, error: 'Enter a valid contact email address.' }, 400);
    }

    await db.prepare(
      `UPDATE clients SET name = ?, contact_name = ?, contact_email = ?, contact_phone = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).bind(
      name,
      body.contactName === undefined ? client.contact_name : cleanOptionalStr(body.contactName, 200),
      contactEmail,
      body.contactPhone === undefined ? client.contact_phone : cleanOptionalStr(body.contactPhone, 60),
      body.notes === undefined ? client.notes : (cleanOptionalStr(body.notes, 4000) || ''),
      client.id,
    ).run();

    await audit(db, actor, 'client.updated', 'client', client.id, { name });
    return c.json({ success: true, message: 'Client updated.' });
  });

  /**
   * Status control, including the emergency "SUSPEND CLIENT ACCESS".
   * Any state that denies access also runs the full credential cascade.
   */
  app.post('/api/phantom/clients/:clientId/status', requireAuth, manage, async (c: any) => {
    const db = c.env.DB;
    const actor = await actorFromContext(c);
    const client = await findClientByPublicId(db, String(c.req.param('clientId') || ''));
    if (!client) return c.json({ success: false, error: 'Client not found.' }, 404);
    const body = await c.req.json().catch(() => ({}));
    const status = String(body.status || '').toLowerCase();
    if (!['active', 'suspended', 'archived', 'revoked'].includes(status)) {
      return c.json({ success: false, error: 'Choose active, suspended, archived, or revoked.' }, 400);
    }

    await db.prepare(
      `UPDATE clients SET status = ?,
         suspended_at = CASE WHEN ? = 'suspended' THEN CURRENT_TIMESTAMP ELSE NULL END,
         archived_at = CASE WHEN ? = 'archived' THEN CURRENT_TIMESTAMP ELSE NULL END,
         revoked_at = CASE WHEN ? = 'revoked' THEN CURRENT_TIMESTAMP ELSE NULL END,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).bind(status, status, status, status, client.id).run();

    const cascade = status === 'active'
      ? { keys: 0, sessions: 0, links: 0 }
      : await cascadeClientAccessRevocation(db, client.id);

    await audit(db, actor, status === 'active' ? 'client.reactivated' : `client.${status}`, 'client', client.id, {
      previousStatus: client.status,
      status,
      ...cascade,
    });
    if (status !== 'active') {
      await recordClientActivity(db, status === 'suspended' ? 'CLIENT_SUSPENDED' : 'ACCESS_REVOKED_ALL', {
        clientPublicId: client.public_id,
        details: { status, ...cascade },
      });
    }

    return c.json({
      success: true,
      message: status === 'active'
        ? 'Client access restored. Previously issued keys remain revoked; issue a new key.'
        : 'Client access withdrawn. All access keys, sessions, and temporary links were revoked.',
      data: cascade,
    });
  });

  /**
   * "REVOKE ALL CLIENT ACCESS": kills every credential and every temporary
   * access path while leaving the client record itself intact so PHANTOM can
   * re-issue a key later.
   */
  app.post('/api/phantom/clients/:clientId/revoke-all', requireAuth, manage, async (c: any) => {
    const db = c.env.DB;
    const actor = await actorFromContext(c);
    const client = await findClientByPublicId(db, String(c.req.param('clientId') || ''));
    if (!client) return c.json({ success: false, error: 'Client not found.' }, 404);

    const cascade = await cascadeClientAccessRevocation(db, client.id);
    await audit(db, actor, 'client.access_revoked_all', 'client', client.id, cascade);
    await recordClientActivity(db, 'ACCESS_REVOKED_ALL', { clientPublicId: client.public_id, details: cascade });

    return c.json({
      success: true,
      message: 'All client access keys, sessions, and temporary links were revoked.',
      data: cascade,
    });
  });

  // ---------------- Projects ----------------

  app.get('/api/phantom/clients/:clientId/projects', requireAuth, manage, async (c: any) => {
    const client = await findClientByPublicId(c.env.DB, String(c.req.param('clientId') || ''));
    if (!client) return c.json({ success: false, error: 'Client not found.' }, 404);
    const projects = await asRows<any>(c.env.DB.prepare(
      'SELECT * FROM client_projects WHERE client_id = ? ORDER BY is_archived, name COLLATE NOCASE LIMIT 500'
    ).bind(client.id));
    return c.json({ success: true, data: projects.map((project) => ({
      id: project.public_id,
      reference: project.reference_code,
      name: project.name,
      description: project.description || '',
      status: project.status,
      isArchived: Number(project.is_archived) === 1,
      createdAt: project.created_at,
      updatedAt: project.updated_at,
    })) });
  });

  app.post('/api/phantom/clients/:clientId/projects', requireAuth, manage, async (c: any) => {
    const db = c.env.DB;
    const actor = await actorFromContext(c);
    const client = await findClientByPublicId(db, String(c.req.param('clientId') || ''));
    if (!client) return c.json({ success: false, error: 'Client not found.' }, 404);
    const body = await c.req.json().catch(() => ({}));
    const name = cleanStr(body.name, 2, 200);
    if (!name) return c.json({ success: false, error: 'A project name is required.' }, 400);

    const reference = await allocateClientReference(db, 'project');
    const publicId = newClientPublicId('prj');
    const result = await db.prepare(
      `INSERT INTO client_projects (public_id, client_id, reference_code, name, description, status, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, 'active', ?)`
    ).bind(
      publicId,
      client.id,
      reference,
      name,
      cleanOptionalStr(body.description, 10_000) || '',
      actor?.userId ?? null,
    ).run();

    const projectId = Number(result.meta.last_row_id);
    await audit(db, actor, 'client.project.created', 'client_project', projectId, { clientId: client.public_id, publicId, reference, name });
    return c.json({ success: true, data: { id: publicId, reference } }, 201);
  });

  app.patch('/api/phantom/client-projects/:projectId', requireAuth, manage, async (c: any) => {
    const db = c.env.DB;
    const actor = await actorFromContext(c);
    const project = await findProjectByPublicId(db, String(c.req.param('projectId') || ''));
    if (!project) return c.json({ success: false, error: 'Project not found.' }, 404);
    const body = await c.req.json().catch(() => ({}));

    const name = body.name === undefined ? project.name : cleanStr(body.name, 2, 200);
    if (!name) return c.json({ success: false, error: 'A valid project name is required.' }, 400);

    let status = project.status;
    if (body.status !== undefined) {
      status = String(body.status).toLowerCase();
      if (!['active', 'suspended', 'archived'].includes(status)) {
        return c.json({ success: false, error: 'Choose active, suspended, or archived.' }, 400);
      }
    }
    const isArchived = body.archive === undefined ? Number(project.is_archived) : (body.archive ? 1 : 0);
    if (body.archive !== undefined && typeof body.archive !== 'boolean') {
      return c.json({ success: false, error: 'Project archive must be true or false.' }, 400);
    }

    await db.prepare(
      `UPDATE client_projects SET name = ?, description = ?, status = ?, is_archived = ?,
         archived_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE NULL END,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).bind(
      name,
      body.description === undefined ? project.description : (cleanOptionalStr(body.description, 10_000) || ''),
      status,
      isArchived,
      isArchived,
      project.id,
    ).run();

    await audit(db, actor, 'client.project.updated', 'client_project', project.id, {
      name, status, isArchived: isArchived === 1,
    });
    return c.json({ success: true, message: 'Project updated.' });
  });

  // ---------------- Access keys ----------------

  app.get('/api/phantom/clients/:clientId/keys', requireAuth, manage, async (c: any) => {
    const client = await findClientByPublicId(c.env.DB, String(c.req.param('clientId') || ''));
    if (!client) return c.json({ success: false, error: 'Client not found.' }, 404);
    // key_hash is never selected: an operator can recognize a key by its hint,
    // but the credential itself is not retrievable.
    const keys = await asRows<any>(c.env.DB.prepare(
      `SELECT k.public_id, k.key_hint, k.label, k.status, k.expires_at, k.last_used_at, k.revoked_at, k.created_at,
              p.public_id AS project_public_id, p.name AS project_name
       FROM client_access_keys k
       LEFT JOIN client_projects p ON p.id = k.client_project_id
       WHERE k.client_id = ?
       ORDER BY k.created_at DESC, k.id DESC LIMIT 500`
    ).bind(client.id));
    return c.json({ success: true, data: keys.map((key) => ({
      id: key.public_id,
      hint: key.key_hint || null,
      label: key.label || '',
      status: key.status,
      expiresAt: key.expires_at || null,
      lastUsedAt: key.last_used_at || null,
      revokedAt: key.revoked_at || null,
      createdAt: key.created_at,
      project: key.project_public_id ? { id: key.project_public_id, name: key.project_name } : null,
    })) });
  });

  app.post('/api/phantom/clients/:clientId/keys', requireAuth, manage, async (c: any) => {
    const db = c.env.DB;
    const actor = await actorFromContext(c);
    const client = await findClientByPublicId(db, String(c.req.param('clientId') || ''));
    if (!client) return c.json({ success: false, error: 'Client not found.' }, 404);
    const body = await c.req.json().catch(() => ({}));

    let projectId: number | null = null;
    if (body.projectId) {
      const project = await findProjectByPublicId(db, String(body.projectId));
      if (!project || Number(project.client_id) !== Number(client.id)) {
        return c.json({ success: false, error: 'That project does not belong to this client.' }, 400);
      }
      if (project.is_archived === 1) return c.json({ success: false, error: 'Restore the project before scoping a key to it.' }, 409);
      projectId = Number(project.id);
    }

    let expiresAt: string | null = null;
    if (body.expiresAt) {
      expiresAt = parseDate(body.expiresAt);
      if (!expiresAt) return c.json({ success: false, error: 'Enter a valid expiry date.' }, 400);
      if (new Date(expiresAt).getTime() <= Date.now()) return c.json({ success: false, error: 'The expiry date must be in the future.' }, 400);
    }

    // Generation happens exactly once, here. Only the SHA-256 verifier and a
    // four-character hint are stored; the raw value is returned once and is not
    // recoverable afterwards.
    const passkey = generateClientPasskey();
    const normalized = normalizeClientPasskey(passkey)!;
    const keyPublicId = newClientPublicId('key');
    const result = await db.prepare(
      `INSERT INTO client_access_keys (public_id, client_id, client_project_id, key_hash, key_hint, label, expires_at, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      keyPublicId,
      client.id,
      projectId,
      await clientPasskeyHash(normalized),
      normalized.slice(-4),
      cleanOptionalStr(body.label, 120) || '',
      expiresAt,
      actor?.userId ?? null,
    ).run();

    const keyId = Number(result.meta.last_row_id);
    await audit(db, actor, 'client.access_key.created', 'client_access_key', keyId, {
      clientId: client.public_id, publicId: keyPublicId, projectId: body.projectId || null, expiresAt,
    });

    return c.json({
      success: true,
      data: { id: keyPublicId, passkey, hint: normalized.slice(-4), expiresAt },
      message: 'Copy this access key now and deliver it securely. It cannot be shown again.',
    }, 201);
  });

  /** Rotates the credential in place and kills every session that used the old one. */
  app.post('/api/phantom/client-keys/:keyId/regenerate', requireAuth, manage, async (c: any) => {
    const db = c.env.DB;
    const actor = await actorFromContext(c);
    const keyId = String(c.req.param('keyId') || '').trim();
    if (!keyId) return c.json({ success: false, error: 'Invalid key id.' }, 400);
    const key = await one<any>(db.prepare('SELECT * FROM client_access_keys WHERE public_id = ?').bind(keyId));
    if (!key) return c.json({ success: false, error: 'Access key not found.' }, 404);

    const passkey = generateClientPasskey();
    const normalized = normalizeClientPasskey(passkey)!;
    await db.prepare(
      `UPDATE client_access_keys SET key_hash = ?, key_hint = ?, status = 'active',
         revoked_at = NULL, revoked_by_user_id = NULL, last_used_at = NULL
       WHERE id = ?`
    ).bind(await clientPasskeyHash(normalized), normalized.slice(-4), Number(key.id)).run();

    const sessions = await revokeClientSessionsForKey(db, Number(key.id));
    await revokeClientLinks(db, Number(key.client_id));

    await audit(db, actor, 'client.access_key.regenerated', 'client_access_key', keyId, {
      clientId: key.client_id, sessionsRevoked: sessions,
    });
    await recordClientActivity(db, 'ACCESS_KEY_REGENERATED', {
      clientPublicId: null,
      details: { accessKeyId: keyId, sessionsRevoked: sessions },
    });

    return c.json({
      success: true,
      data: { id: key.public_id, passkey, hint: normalized.slice(-4), sessionsRevoked: sessions },
      message: 'New access key generated. The previous key and its sessions no longer work.',
    });
  });

  app.post('/api/phantom/client-keys/:keyId/revoke', requireAuth, manage, async (c: any) => {
    const db = c.env.DB;
    const actor = await actorFromContext(c);
    const keyId = String(c.req.param('keyId') || '').trim();
    if (!keyId) return c.json({ success: false, error: 'Invalid key id.' }, 400);
    const key = await one<any>(db.prepare('SELECT * FROM client_access_keys WHERE public_id = ?').bind(keyId));
    if (!key) return c.json({ success: false, error: 'Access key not found.' }, 404);
    if (key.status === 'revoked') return c.json({ success: true, message: 'This access key is already revoked.' });

    await db.prepare(
      `UPDATE client_access_keys SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP, revoked_by_user_id = ?
       WHERE id = ?`
    ).bind(actor?.userId ?? null, Number(key.id)).run();
    const sessions = await revokeClientSessionsForKey(db, Number(key.id));
    await revokeClientLinks(db, Number(key.client_id));

    await audit(db, actor, 'client.access_key.revoked', 'client_access_key', keyId, {
      clientId: key.client_id, sessionsRevoked: sessions,
    });
    await recordClientActivity(db, 'ACCESS_KEY_REVOKED', {
      clientPublicId: null,
      details: { accessKeyId: keyId, sessionsRevoked: sessions },
    });

    return c.json({ success: true, message: 'Access key revoked immediately.', data: { sessionsRevoked: sessions } });
  });

  app.post('/api/phantom/clients/:clientId/links', requireAuth, links, async (c: any) => {
    const db = c.env.DB;
    const actor = await actorFromContext(c);
    if (!await clientAllLinksEnabled(db)) {
      return c.json({ success: false, error: 'Temporary client links are switched off.' }, 403);
    }
    const client = await findClientByPublicId(db, String(c.req.param('clientId') || ''));
    if (!client) return c.json({ success: false, error: 'Client not found.' }, 404);

    const body = await c.req.json().catch(() => ({}));
    const project = await one<any>(db.prepare(
      'SELECT * FROM client_projects WHERE public_id = ? AND client_id = ?'
    ).bind(String(body.projectId || '').trim(), client.id));
    if (!project) return c.json({ success: false, error: 'Choose a project that belongs to this client.' }, 400);

    let document: any = null;
    if (body.documentId) {
      document = await one<any>(db.prepare(
        'SELECT * FROM client_documents WHERE public_id = ? AND client_id = ? AND client_project_id = ?'
      ).bind(String(body.documentId).trim(), client.id, project.id));
      if (!document) return c.json({ success: false, error: 'Choose a document that belongs to this project.' }, 400);
      if (!clientDocumentExposure(document, project, { status: client.status }).exposed) {
        return c.json({ success: false, error: 'Publish the document before linking to it.' }, 409);
      }
    }

    const allowDownload = body.allowDownload === true;
    if (allowDownload && !document) {
      return c.json({ success: false, error: 'Set download permission on the document itself.' }, 400);
    }
    if (allowDownload && Number(document.allow_download) !== 1) {
      return c.json({ success: false, error: 'This document does not allow downloads.' }, 409);
    }

    const expiryMinutes = Math.min(1440, Math.max(5, Number(body.expiresInMinutes) || CLIENT_LINK_DEFAULT_TTL_MINUTES));
    const maxUses = body.maxUses === undefined ? CLIENT_LINK_DEFAULT_MAX_USES : Math.max(1, Math.min(50, Number(body.maxUses) || 1));
    const destination = document ? 'document' : (cleanStr(body.section, 1, 40) || 'overview');

    const token = generateClientLinkToken();
    const publicId = newClientPublicId('lnk');
    const expiresAt = new Date(Date.now() + expiryMinutes * 60000).toISOString();
    await db.prepare(
      `INSERT INTO client_links
       (public_id, client_id, client_project_id, client_document_id, destination_type, destination_id,
        mode, token_hash, allow_view, allow_download, max_uses, expires_at, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, 'direct', ?, 1, ?, ?, ?, ?)`
    ).bind(
      publicId, client.id, project.id, document ? Number(document.id) : null,
      document ? 'document' : destination, document ? document.public_id : null,
      await clientLinkHash(token), allowDownload ? 1 : 0, maxUses, expiresAt, actor?.userId ?? null,
    ).run();

    await audit(db, actor, 'client.link.created', 'client_link', null, {
      clientId: client.public_id, publicId, projectId: project.public_id,
      documentId: document ? document.public_id : null, maxUses, expiresAt,
    });

    return c.json({
      success: true,
      data: {
        id: publicId,
        token,
        path: `/portal/link/${token}`,
        expiresAt,
        maxUses,
        allowDownload,
      },
      message: 'Copy this link now and deliver it securely. It cannot be shown again.',
    }, 201);
  });

  app.post('/api/phantom/client-links/:linkId/revoke', requireAuth, links, async (c: any) => {
    const db = c.env.DB;
    const actor = await actorFromContext(c);
    const link = await one<any>(db.prepare('SELECT * FROM client_links WHERE public_id = ?')
      .bind(String(c.req.param('linkId') || '').trim()));
    if (!link) return c.json({ success: false, error: 'Link not found.' }, 404);
    if (link.status !== 'active') return c.json({ success: true, message: 'This link is already inactive.' });

    await db.prepare("UPDATE client_links SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(Number(link.id)).run();
    const sessions = await db.prepare(
      'UPDATE client_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE client_link_id = ? AND revoked_at IS NULL'
    ).bind(Number(link.id)).run();

    await audit(db, actor, 'client.link.revoked', 'client_link', link.public_id, {
      clientId: link.client_id, sessionsRevoked: Number(sessions.meta.changes || 0),
    });
    return c.json({ success: true, message: 'Link revoked immediately.' });
  });

  // ---------------- Client documents ----------------

  app.get('/api/phantom/clients/:clientId/documents', requireAuth, manage, async (c: any) => {
    const client = await findClientByPublicId(c.env.DB, String(c.req.param('clientId') || ''));
    if (!client) return c.json({ success: false, error: 'Client not found.' }, 404);
    const projectFilter = cleanOptionalStr(c.req.query('project'), 80);
    const params: unknown[] = [client.id];
    let clause = 'WHERE d.client_id = ?';
    if (projectFilter) {
      const project = await findProjectByPublicId(c.env.DB, projectFilter);
      if (!project || Number(project.client_id) !== Number(client.id)) {
        return c.json({ success: false, error: 'That project does not belong to this client.' }, 400);
      }
      clause += ' AND d.client_project_id = ?';
      params.push(project.id);
    }
    const documents = await asRows<any>(c.env.DB.prepare(
      `SELECT d.*, p.public_id AS project_public_id, p.reference_code AS project_reference
       FROM client_documents d JOIN client_projects p ON p.id = d.client_project_id
       ${clause} ORDER BY d.updated_at DESC, d.id DESC LIMIT 500`
    ).bind(...params));

    return c.json({ success: true, data: documents.map((document) => ({
      id: document.public_id,
      reference: document.reference_code,
      title: document.title,
      summary: document.summary || '',
      category: document.category,
      version: document.version || null,
      lifecycle: document.lifecycle_status,
      clientVisible: Number(document.client_visible) === 1,
      allowView: Number(document.allow_view) === 1,
      allowDownload: Number(document.allow_download) === 1,
      isArchived: Number(document.is_archived) === 1,
      vaultDocumentId: document.vault_document_id === null ? null : Number(document.vault_document_id),
      vaultVersion: document.vault_version_number === null ? null : Number(document.vault_version_number),
      hasClientArtifact: Boolean(document.storage_reference),
      publishedAt: document.published_at || null,
      updatedAt: document.updated_at,
      project: { id: document.project_public_id, reference: document.project_reference },
    })) });
  });

  app.post('/api/phantom/clients/:clientId/documents', requireAuth, manage, async (c: any) => {
    const db = c.env.DB;
    const actor = await actorFromContext(c);
    const client = await findClientByPublicId(db, String(c.req.param('clientId') || ''));
    if (!client) return c.json({ success: false, error: 'Client not found.' }, 404);
    const body = await c.req.json().catch(() => ({}));

    const project = await findProjectByPublicId(db, String(body.projectId || ''));
    if (!project || Number(project.client_id) !== Number(client.id)) {
      return c.json({ success: false, error: 'Choose a project that belongs to this client.' }, 400);
    }
    if (project.is_archived === 1) return c.json({ success: false, error: 'Restore the project before adding documents.' }, 409);

    const category = String(body.category || 'document').toLowerCase();
    if (!CLIENT_DOCUMENT_CATEGORIES.includes(category as ClientDocumentCategory)) {
      return c.json({ success: false, error: 'Choose document, letter, agreement, report, deliverable, or update.' }, 400);
    }

    const title = cleanStr(body.title, 1, 200);
    if (!title) return c.json({ success: false, error: 'A document title is required.' }, 400);

    // A client document always carries content. It either pins an internal
    // Vault version (the preferred path) or carries a supplied plain-text
    // snapshot. It can never be an empty record that later resolves to the
    // wrong internal object.
    let vaultDocumentId: number | null = null;
    let vaultVersionNumber: number | null = null;
    let snapshot: string | null = null;
    let snapshotFormat = 'blocks';

    if (body.vaultDocumentId !== undefined && body.vaultDocumentId !== null && body.vaultDocumentId !== '') {
      const vaultId = integerParam(body.vaultDocumentId);
      if (!vaultId) return c.json({ success: false, error: 'Invalid Vault document reference.' }, 400);

      const vaultDocument = await one<any>(db.prepare(
        `SELECT d.id, d.is_archived, d.visibility, s.is_sensitive, s.is_archived AS section_archived
         FROM vault_documents d JOIN vault_sections s ON s.id = d.section_id WHERE d.id = ?`
      ).bind(vaultId));
      if (!vaultDocument || vaultDocument.is_archived === 1 || vaultDocument.section_archived === 1) {
        return c.json({ success: false, error: 'Active Vault document not found.' }, 404);
      }
      if (Number(vaultDocument.is_sensitive) === 1 || vaultDocument.visibility === 'restricted') {
        return c.json({ success: false, error: 'Sensitive or restricted Vault documents cannot be published to a client.' }, 409);
      }

      const snapshotRow = await one<any>(db.prepare(
        'SELECT version_number, content_json, content FROM document_versions WHERE document_id = ? ORDER BY version_number DESC LIMIT 1'
      ).bind(vaultId));
      if (snapshotRow) {
        vaultVersionNumber = Number(snapshotRow.version_number);
        snapshot = snapshotRow.content_json || JSON.stringify({ version: 1, blocks: [] });
      } else {
        const live = await one<any>(db.prepare('SELECT content_json, content FROM vault_documents WHERE id = ?').bind(vaultId));
        snapshot = live?.content_json || JSON.stringify({ version: 1, blocks: [] });
      }
      vaultDocumentId = vaultId;
    } else {
      const text = cleanOptionalStr(body.contentText, 200_000);
      if (!text) return c.json({ success: false, error: 'Link an approved Vault document or supply the document text.' }, 400);
      snapshot = text;
      snapshotFormat = 'text';
    }

    const referenceKind = referenceKindForCategory(category as ClientDocumentCategory);
    const reference = await allocateClientReference(db, referenceKind);

    const publicId = newClientPublicId('doc');
    const result = await db.prepare(
      `INSERT INTO client_documents
       (public_id, client_id, client_project_id, category, reference_code, title, summary, version,
        lifecycle_status, client_visible, allow_view, allow_download, vault_document_id, vault_version_number,
        content_snapshot, content_snapshot_format, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', 0, 1, 0, ?, ?, ?, ?, ?)`
    ).bind(
      publicId,
      client.id,
      project.id,
      category,
      reference,
      title,
      cleanOptionalStr(body.summary, 4000) || '',
      cleanOptionalStr(body.version, 40) || '1.0',
      vaultDocumentId,
      vaultVersionNumber,
      snapshot,
      snapshotFormat,
      actor?.userId ?? null,
    ).run();

    const documentId = Number(result.meta.last_row_id);
    await audit(db, actor, 'client.document.created', 'client_document', documentId, {
      clientId: client.public_id, projectId: project.public_id, publicId, reference, category, vaultDocumentId, vaultVersionNumber,
    });
    return c.json({ success: true, data: { id: publicId, reference, category } }, 201);
  });

  app.patch('/api/phantom/client-documents/:documentId', requireAuth, manage, async (c: any) => {
    const db = c.env.DB;
    const actor = await actorFromContext(c);
    const documentPublicId = String(c.req.param('documentId') || '').trim();
    if (!documentPublicId) return c.json({ success: false, error: 'Invalid document id.' }, 400);
    const document = await findDocumentByPublicId(db, documentPublicId);
    if (!document) return c.json({ success: false, error: 'Client document not found.' }, 404);
    const body = await c.req.json().catch(() => ({}));

    const title = body.title === undefined ? document.title : cleanStr(body.title, 1, 200);
    if (!title) return c.json({ success: false, error: 'A valid document title is required.' }, 400);

    let version = document.version;
    if (body.version !== undefined) {
      version = cleanOptionalStr(body.version, 40) || '1.0';
    }
    const allowView = body.allowView === undefined ? Number(document.allow_view) : (body.allowView ? 1 : 0);
    const allowDownload = body.allowDownload === undefined ? Number(document.allow_download) : (body.allowDownload ? 1 : 0);
    if (typeof body.allowView !== 'undefined' && typeof body.allowView !== 'boolean') {
      return c.json({ success: false, error: 'View permission must be true or false.' }, 400);
    }
    if (typeof body.allowDownload !== 'undefined' && typeof body.allowDownload !== 'boolean') {
      return c.json({ success: false, error: 'Download permission must be true or false.' }, 400);
    }
    // Download without view is not a state the client portal can express.
    const effectiveAllowDownload = allowView === 1 ? allowDownload : 0;
    const storageReference = body.storageReference === undefined
      ? document.storage_reference
      : cleanOptionalStr(body.storageReference, 700);
    if (storageReference && !String(storageReference).startsWith('client-exports/')) {
      return c.json({ success: false, error: 'A client artifact must live under client-exports/.' }, 400);
    }

    await db.prepare(
      `UPDATE client_documents SET title = ?, summary = ?, version = ?, allow_view = ?, allow_download = ?,
         storage_reference = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).bind(
      title,
      body.summary === undefined ? document.summary : (cleanOptionalStr(body.summary, 4000) || ''),
      version,
      allowView,
      effectiveAllowDownload,
      storageReference,
      document.id,
    ).run();

    await audit(db, actor, 'client.document.updated', 'client_document', document.id, {
      clientId: document.client_id,
      documentPublicId: document.public_id,
      allowView: allowView === 1, allowDownload: effectiveAllowDownload === 1,
    });
    return c.json({ success: true, message: 'Client document updated.' });
  });

  /**
   * Lifecycle control. Only `published` documents are ever exposed to a client,
   * and publication additionally requires the explicit client-visibility flag.
   */
  app.post('/api/phantom/client-documents/:documentId/lifecycle', requireAuth, publish, async (c: any) => {
    const db = c.env.DB;
    const actor = await actorFromContext(c);
    const documentPublicId = String(c.req.param('documentId') || '').trim();
    if (!documentPublicId) return c.json({ success: false, error: 'Invalid document id.' }, 400);
    const document = await findDocumentByPublicId(db, documentPublicId);
    if (!document) return c.json({ success: false, error: 'Client document not found.' }, 404);

    const body = await c.req.json().catch(() => ({}));
    const state = String(body.state || '').toLowerCase();
    if (!CLIENT_DOCUMENT_LIFECYCLE.includes(state as ClientDocumentLifecycle)) {
      return c.json({ success: false, error: 'Choose draft, in_review, approved, published, unpublished, or archived.' }, 400);
    }

    const publishNow = state === 'published';
    const clientVisible = publishNow
      ? (body.clientVisible === undefined ? 1 : (body.clientVisible ? 1 : 0))
      : 0;
    const isArchived = state === 'archived' ? 1 : 0;

    await db.prepare(
      `UPDATE client_documents SET lifecycle_status = ?, client_visible = ?, is_archived = ?,
         published_at = CASE WHEN ? = 1 THEN COALESCE(published_at, CURRENT_TIMESTAMP) ELSE published_at END,
         published_by_user_id = CASE WHEN ? = 1 THEN ? ELSE published_by_user_id END,
         unpublished_at = CASE WHEN ? IN ('unpublished','archived') THEN CURRENT_TIMESTAMP ELSE NULL END,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).bind(
      state,
      clientVisible,
      isArchived,
      publishNow ? 1 : 0,
      publishNow ? 1 : 0,
      actor?.userId ?? null,
      state,
      document.id,
    ).run();

    await audit(db, actor, `client.document.${state}`, 'client_document', document.id, {
      clientId: document.client_id,
      documentPublicId: document.public_id,
      previousState: document.lifecycle_status,
      state,
      clientVisible: clientVisible === 1,
    });
    if (state === 'published') {
      await recordClientActivity(db, 'DOCUMENT_VIEWED', {
        clientPublicId: null,
        details: { note: 'publication', documentId: document.public_id, reference: document.reference_code },
      });
    }

    return c.json({
      success: true,
      message: publishNow
        ? 'Document published to the client.'
        : `Document moved to ${state}.`,
      data: { state, clientVisible: clientVisible === 1 },
    });
  });

  // ---------------- Client activity (existing audit infrastructure) ----------------

  app.get('/api/phantom/clients/:clientId/activity', requireAuth, manage, async (c: any) => {
    const client = await findClientByPublicId(c.env.DB, String(c.req.param('clientId') || ''));
    if (!client) return c.json({ success: false, error: 'Client not found.' }, 404);
    const limit = Math.min(200, Math.max(1, Number(c.req.query('limit') || 60)));
    // Client activity lives in the existing audit_logs table — no second
    // logging system — and is indexed by (subject_type, subject_id).
    const rows = await asRows<any>(c.env.DB.prepare(
      `SELECT id, action, subject_id, details_json, created_at
       FROM audit_logs
       WHERE subject_type = 'client' AND subject_id = ?
       ORDER BY created_at DESC, id DESC LIMIT ?`
    ).bind(client.public_id, limit));
    return c.json({ success: true, data: rows.map((row) => {
      let details: Record<string, unknown> = {};
      try { details = JSON.parse(row.details_json || '{}'); } catch { details = {}; }
      return {
        id: row.id,
        event: String(row.action || '').replace(/^client\./, '').toUpperCase(),
        at: row.created_at,
        details,
      };
    }) });
  });
};
