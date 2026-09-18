/**
 * Client Project Portal — credential primitives.
 *
 * This module adds ONLY the credential pieces the client portal needs and
 * deliberately reuses the platform's existing security primitives:
 *   - `randomToken()`          → 32 bytes of CSPRNG entropy (functions/lib/vault.ts)
 *   - `sha256Hex()`            → the same verifier hashing used by Vault shares
 *   - `checkRateLimit()`       → the existing in-memory first line of defence
 *
 * It does not touch, replace, or duplicate member authentication. Clients are
 * not members and never receive a member JWT.
 *
 * Storage rule: a client passkey and a client session token are only ever
 * persisted as SHA-256 verifiers. Neither can be recovered from the database.
 */

import { randomToken, sha256Hex } from './vault';

// ---------------------------------------------------------------------------
// Human-readable CRX passkeys
// ---------------------------------------------------------------------------

/**
 * Passkey body alphabet. The visually ambiguous characters 0, O, 1 and I are
 * excluded so a passkey can be read from a printed letter or dictated by phone
 * without transcription errors.
 */
export const CLIENT_PASSKEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Displayed shape: `CRX-XXX-XXX-ABC`.
 *
 * The first two groups are random; the last group is a three-letter code
 * derived from the project the key opens, so a client can recognise which
 * project a key belongs to (and a support call can be resolved from the key
 * alone). Generation and parsing stay case-insensitive and separator-free.
 */
export const CLIENT_PASSKEY_GROUP_LENGTH = 3;
export const CLIENT_PASSKEY_GROUPS = 3;
export const CLIENT_PASSKEY_PREFIX = 'CRX';
/** The trailing project group is always letters, so it can be validated on its own. */
export const CLIENT_PASSKEY_CODE_LENGTH = 3;

/**
 * Random part: two groups of three from a 32-symbol alphabet = 32^6 ≈ 2^30
 * (about 1.07 billion combinations) in front of a project identifier that is
 * not secret.
 *
 * This is deliberately shorter and friendlier than the earlier 16-character
 * key, at the request of the product owner: a client reads it from a letter,
 * dictates it, or types it in three fixed boxes. Because the random space is
 * smaller, the durable throttling below is not optional: the per-IP limit, the
 * per-attempted-key limit, and the per-project-code limit that is applied after
 * a failed lookup (so a correct key is never blocked by someone else's attack).
 * Raising the strength later is a one-line change to
 * CLIENT_PASSKEY_RANDOM_LENGTH; every parser here accepts longer bodies, and
 * keys issued before this change (16-character bodies) keep working.
 */
export const CLIENT_PASSKEY_RANDOM_LENGTH = 6;
const PASSKEY_BODY_LENGTH = CLIENT_PASSKEY_RANDOM_LENGTH + CLIENT_PASSKEY_CODE_LENGTH;

/** Accepted body length range. Only a cheap pre-hash format filter — the hash is the verifier. */
const PASSKEY_MIN_BODY_LENGTH = 9;
const PASSKEY_MAX_BODY_LENGTH = 32;

/** Domain separator keeps client verifiers distinct from Vault share verifiers. */
const PASSKEY_HASH_DOMAIN = 'code-rx:client-access-key:v1:';
const SESSION_HASH_DOMAIN = 'code-rx:client-session:v1:';

const asRows = async <T>(statement: D1PreparedStatement): Promise<T[]> => {
  const result = await statement.all<T>();
  return result.results ?? [];
};

/**
 * Uniform selection without modulo bias. `crypto.getRandomValues` is the same
 * source `randomToken()` uses for Vault share links, so passkey entropy has the
 * same quality as the platform's existing bearer tokens.
 */
const randomAlphabetIndex = (alphabetLength: number): number => {
  const limit = Math.floor(256 / alphabetLength) * alphabetLength;
  const buffer = new Uint8Array(1);
  for (;;) {
    crypto.getRandomValues(buffer);
    if (buffer[0] < limit) return buffer[0] % alphabetLength;
  }
};

/**
 * Three-letter project code: the initials of the project name, ignoring
 * characters a passkey can never contain (I and O). When a name does not
 * provide three initials, the remaining letters of the name are used in order,
 * and `X` fills any gap, so a code always exists and is always typeable.
 */
export const clientProjectCode = (name?: string | null): string => {
  const words = String(name ?? '').toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  let code = '';
  for (const word of words) {
    if (CLIENT_PASSKEY_ALPHABET.includes(word[0]) && !code.includes(word[0])) code += word[0];
    if (code.length === CLIENT_PASSKEY_CODE_LENGTH) return code;
  }
  for (const word of words) {
    for (const character of word) {
      if (CLIENT_PASSKEY_ALPHABET.includes(character) && !code.includes(character)) code += character;
      if (code.length === CLIENT_PASSKEY_CODE_LENGTH) return code;
    }
  }
  return (code + 'XXX').slice(0, CLIENT_PASSKEY_CODE_LENGTH);
};

/** Display form: CRX-XXX-XXX-ABC */
export const formatClientPasskey = (body: string): string => {
  const groups = body.match(new RegExp(`.{1,${CLIENT_PASSKEY_GROUP_LENGTH}}`, 'g')) || [body];
  return `${CLIENT_PASSKEY_PREFIX}-${groups.join('-')}`;
};

/**
 * Generates a brand-new raw passkey for a project (or, failing that, a client).
 * The caller must show it once and never persist it.
 */
export const generateClientPasskey = (source?: string | null): string => {
  let body = '';
  for (let index = 0; index < CLIENT_PASSKEY_RANDOM_LENGTH; index += 1) {
    body += CLIENT_PASSKEY_ALPHABET[randomAlphabetIndex(CLIENT_PASSKEY_ALPHABET.length)];
  }
  return formatClientPasskey(body + clientProjectCode(source));
};

/**
 * Normalises anything a client types into the stored form: uppercase, no
 * separators, and an optional leading `CRX` removed. Returns null when the
 * value cannot be a passkey, so malformed input never reaches a hash lookup.
 */
export const normalizeClientPasskey = (value: unknown): string | null => {
  const compact = String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const body = compact.startsWith(CLIENT_PASSKEY_PREFIX) ? compact.slice(CLIENT_PASSKEY_PREFIX.length) : compact;
  if (body.length < PASSKEY_MIN_BODY_LENGTH || body.length > PASSKEY_MAX_BODY_LENGTH) return null;
  for (const character of body) {
    if (!CLIENT_PASSKEY_ALPHABET.includes(character)) return null;
  }
  return body;
};

/** SHA-256 verifier for a normalised passkey. The raw value is never stored. */
/**
 * Expiry values are stored as ISO-8601 UTC strings, matching member_activations.
 * Every SQL comparison wraps them in datetime(...) so SQLite parses them;
 * a raw string comparison against CURRENT_TIMESTAMP would treat a same-day
 * expiry as still valid because 'T' sorts above ' '.
 */
export const clientPasskeyHash = async (body: string): Promise<string> =>
  sha256Hex(`${PASSKEY_HASH_DOMAIN}${body}`);

// ---------------------------------------------------------------------------
// Client sessions
// ---------------------------------------------------------------------------

/** Short-lived by design: a client session is a working session, not a login. */
export const CLIENT_SESSION_TTL_SECONDS = 12 * 60 * 60; // 12 hours

/** Client sessions travel in their own header so they can never be mistaken for a member JWT. */
export const CLIENT_SESSION_HEADER = 'X-Code-Rx-Client-Session';

/** 32 CSPRNG bytes, the same token strength as an existing Vault share link. */
export const generateClientSessionToken = (): string => randomToken();

export const clientSessionHash = async (token: string): Promise<string> =>
  sha256Hex(`${SESSION_HASH_DOMAIN}${token}`);

// ---------------------------------------------------------------------------
// Access-key and session records
// ---------------------------------------------------------------------------

/**
 * Everything a client session needs to authorize a request, resolved from the
 * database in one query. A session is bound to exactly one client AND one
 * project, so the browser never supplies either identifier for authorization.
 */
export interface ClientSessionRecord {
  session_id: number;
  session_expires_at: string;
  access_key_id: number | null;
  key_status: string | null;
  key_expires_at: string | null;
  link_id: number | null;
  link_status: string | null;
  link_expires_at: string | null;
  link_allow_view: number | null;
  link_allow_download: number | null;
  link_document_id: number | null;
  /** Phase 7: the destination the link was issued for (stored values). */
  link_destination_type: string | null;
  link_destination_id: string | null;
  link_intent: string | null;
  client_id: number;
  client_public_id: string;
  client_name: string;
  client_contact_name: string | null;
  client_contact_email: string | null;
  client_status: string;
  client_project_id: number;
  project_public_id: string;
  project_reference: string;
  project_name: string;
  project_status: string;
  project_is_archived: number;
}

/**
 * Resolves a live session by its verifier hash.
 *
 * The join conditions enforce session liveness and key liveness in SQL; client
 * and project status are returned so the caller can distinguish "no credential"
 * from "credential exists but access was withdrawn" without leaking the
 * difference to the client.
 */
export const resolveClientSessionRecord = async (
  db: D1Database,
  sessionHash: string,
): Promise<ClientSessionRecord | null> => {
  const rows = await asRows<ClientSessionRecord>(db.prepare(
    `SELECT s.id AS session_id, s.expires_at AS session_expires_at,
            k.id AS access_key_id, k.status AS key_status, k.expires_at AS key_expires_at,
            l.id AS link_id, l.status AS link_status, l.expires_at AS link_expires_at,
            l.allow_view AS link_allow_view, l.allow_download AS link_allow_download,
            l.client_document_id AS link_document_id,
            l.destination_type AS link_destination_type, l.destination_id AS link_destination_id,
            l.destination_intent AS link_intent,
            cl.id AS client_id, cl.public_id AS client_public_id, cl.name AS client_name,
            cl.contact_name AS client_contact_name, cl.contact_email AS client_contact_email,
            cl.status AS client_status,
            p.id AS client_project_id, p.public_id AS project_public_id,
            p.reference_code AS project_reference, p.name AS project_name,
            p.status AS project_status, p.is_archived AS project_is_archived
     FROM client_sessions s
     LEFT JOIN client_access_keys k ON k.id = s.access_key_id
     LEFT JOIN client_links l ON l.id = s.client_link_id
     JOIN clients cl ON cl.id = s.client_id
     JOIN client_projects p ON p.id = s.client_project_id
     WHERE s.session_hash = ?
       AND s.revoked_at IS NULL
       AND datetime(s.expires_at) > CURRENT_TIMESTAMP
       AND (
         (s.access_key_id IS NOT NULL
           AND k.status = 'active'
           AND (k.expires_at IS NULL OR datetime(k.expires_at) > CURRENT_TIMESTAMP))
         OR
         (s.client_link_id IS NOT NULL
           AND l.status = 'active'
           AND (l.expires_at IS NULL OR datetime(l.expires_at) > CURRENT_TIMESTAMP))
       )
     LIMIT 1`
  ).bind(sessionHash));
  return rows[0] || null;
};

/** Creates a session row. Only the verifier hash is stored. */
export const createClientSession = async (
  db: D1Database,
  input: {
    clientId: number;
    clientProjectId: number;
    accessKeyId: number | null;
    clientLinkId: number | null;
    sessionHash: string;
    expiresAtIso: string;
    ipHash: string | null;
    userAgentHash: string | null;
  },
): Promise<number> => {
  const result = await db.prepare(
    `INSERT INTO client_sessions
     (client_id, client_project_id, access_key_id, client_link_id, session_hash, expires_at, ip_hash, user_agent_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    input.clientId,
    input.clientProjectId,
    input.accessKeyId,
    input.clientLinkId,
    input.sessionHash,
    input.expiresAtIso,
    input.ipHash,
    input.userAgentHash,
  ).run();
  return Number(result.meta.last_row_id);
};

/** Revokes every live session for one client. Used by suspend / revoke-all. */
export const revokeClientSessions = async (db: D1Database, clientId: number): Promise<number> => {
  const result = await db.prepare(
    `UPDATE client_sessions SET revoked_at = CURRENT_TIMESTAMP
     WHERE client_id = ? AND revoked_at IS NULL`
  ).bind(clientId).run();
  return Number(result.meta.changes || 0);
};

/** Revokes only the sessions that belong to one access key (single-key revoke). */
export const revokeClientSessionsForKey = async (db: D1Database, accessKeyId: number): Promise<number> => {
  const result = await db.prepare(
    `UPDATE client_sessions SET revoked_at = CURRENT_TIMESTAMP
     WHERE access_key_id = ? AND revoked_at IS NULL`
  ).bind(accessKeyId).run();
  return Number(result.meta.changes || 0);
};

/** Hashed client fingerprint for session binding. Never stores a raw IP or user agent. */
export const clientFingerprints = async (c: any) => {
  const ip = c.req.header('cf-connecting-ip')
    || c.req.header('x-real-ip')
    || c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
    || 'local';
  const userAgent = String(c.req.header('user-agent') || '').slice(0, 400);
  return {
    ipHash: (await sha256Hex(`code-rx:client-ip:v1:${ip}`)).slice(0, 32),
    userAgentHash: userAgent ? (await sha256Hex(`code-rx:client-ua:v1:${userAgent}`)).slice(0, 32) : null,
  };
};

// ---------------------------------------------------------------------------
// Opaque public identifiers
// ---------------------------------------------------------------------------

/**
 * Every client-visible object is addressed by an opaque public id, never by the
 * autoincrement row id. Sequential ids would let one client estimate another
 * client's volume and invite enumeration (Phase 1 sweep, section S).
 */
export const newClientPublicId = (prefix: string): string => `${prefix}_${randomToken().slice(0, 24)}`;

// ---------------------------------------------------------------------------
// Temporary links (Phase 2 foundation: table + validated resolution)
// ---------------------------------------------------------------------------

const LINK_HASH_DOMAIN = 'code-rx:client-link:v1:';

/** 32 CSPRNG bytes — the same token strength as an existing Vault share link. */
export const generateClientLinkToken = (): string => randomToken();

export const clientLinkHash = async (token: string): Promise<string> =>
  sha256Hex(`${LINK_HASH_DOMAIN}${token}`);

/** Direct-access link sessions are deliberately short-lived. */
export const CLIENT_LINK_SESSION_TTL_SECONDS = 45 * 60;

/** Defaults for a PHANTOM-issued temporary link. */
export const CLIENT_LINK_DEFAULT_TTL_MINUTES = 60;
export const CLIENT_LINK_DEFAULT_MAX_USES = 1;

export interface ClientLinkRecord {
  link_id: number;
  link_public_id: string;
  link_status: string;
  link_expires_at: string | null;
  link_allow_view: number;
  link_allow_download: number;
  link_destination_type: string;
  link_destination_id: string | null;
  link_intent: string;
  link_mode: 'passkey' | 'direct';
  destination_type: string;
  destination_id: string | null;
  allow_view: number;
  allow_download: number;
  max_uses: number | null;
  use_count: number;
  expires_at: string | null;
  client_id: number;
  client_public_id: string;
  client_name: string;
  client_contact_name: string | null;
  client_status: string;
  client_project_id: number;
  project_public_id: string;
  project_reference: string;
  project_name: string;
  project_description: string | null;
  project_status: string;
  project_is_archived: number;
  client_document_id: number | null;
  document_public_id: string | null;
  document_lifecycle: string | null;
  document_visible: number | null;
  document_allow_view: number | null;
  document_allow_download: number | null;
  document_reference: string | null;
}

/**
 * Resolves a link by its verifier hash together with the full ownership chain.
 * The caller still validates expiry, usage and status; this function only proves
 * that the token exists and returns everything needed to authorize it without
 * trusting any browser-supplied identifier.
 */
export const resolveClientLink = async (db: D1Database, token: string): Promise<ClientLinkRecord | null> => {
  const rows = await asRows<ClientLinkRecord>(db.prepare(
    `SELECT l.id AS link_id, l.public_id AS link_public_id, l.status AS link_status, l.mode AS link_mode,
            l.destination_type AS link_destination_type, l.destination_type, l.destination_id,
            l.destination_id AS link_destination_id, l.destination_intent AS link_intent,
            l.allow_view AS link_allow_view, l.allow_download AS link_allow_download,
            l.allow_view, l.allow_download,
            l.max_uses, l.use_count, l.expires_at AS link_expires_at, l.expires_at,
            cl.id AS client_id, cl.public_id AS client_public_id, cl.name AS client_name,
            cl.contact_name AS client_contact_name, cl.status AS client_status,
            p.id AS client_project_id, p.public_id AS project_public_id, p.reference_code AS project_reference,
            p.name AS project_name, p.description AS project_description,
            p.status AS project_status, p.is_archived AS project_is_archived,
            l.client_document_id, d.public_id AS document_public_id,
            d.lifecycle_status AS document_lifecycle, d.client_visible AS document_visible,
            d.allow_view AS document_allow_view, d.allow_download AS document_allow_download,
            d.reference_code AS document_reference
     FROM client_links l
     JOIN clients cl ON cl.id = l.client_id
     JOIN client_projects p ON p.id = l.client_project_id
     LEFT JOIN client_documents d ON d.id = l.client_document_id
     WHERE l.token_hash = ?
     LIMIT 1`
  ).bind(await clientLinkHash(token)));
  return rows[0] || null;
};

/**
 * Atomically consumes one use of a link.
 *
 * The guard lives in the WHERE clause so concurrent requests cannot exceed
 * `max_uses`: only one UPDATE can observe `use_count < max_uses`. The caller
 * must require `meta.changes === 1` (the same check the existing Vault share
 * replace/revoke handlers use).
 */
export const consumeClientLinkUse = async (db: D1Database, linkId: number): Promise<boolean> => {
  const result = await db.prepare(
    `UPDATE client_links SET use_count = use_count + 1, last_used_at = CURRENT_TIMESTAMP
     WHERE id = ?
       AND status = 'active'
       AND (max_uses IS NULL OR use_count < max_uses)
       AND (expires_at IS NULL OR datetime(expires_at) > CURRENT_TIMESTAMP)`
  ).bind(linkId).run();
  return Number(result.meta.changes || 0) === 1;
};

/**
 * Lists the links that are about to be marked expired, so the caller can record
 * LINK_EXPIRED against each one before the sweep. Bounded on purpose: a sweep
 * must never become a full-table operation.
 */
export const listExpiringClientLinks = async (
  db: D1Database,
  limit = 25,
): Promise<Array<{ id: number; public_id: string; client_public_id: string; destination_type: string }>> =>
  asRows<{ id: number; public_id: string; client_public_id: string; destination_type: string }>(db.prepare(
    `SELECT l.id, l.public_id, l.destination_type, cl.public_id AS client_public_id
     FROM client_links l JOIN clients cl ON cl.id = l.client_id
     WHERE l.status = 'active' AND l.expires_at IS NOT NULL AND datetime(l.expires_at) <= CURRENT_TIMESTAMP
     ORDER BY l.id LIMIT ?`
  ).bind(Math.max(1, Math.min(100, limit))));

/** Marks any link whose window has closed. Cheap, indexed, and safe to run periodically. */
export const expireClientLinks = async (db: D1Database): Promise<number> => {
  const result = await db.prepare(
    `UPDATE client_links SET status = 'expired', revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP)
     WHERE status = 'active' AND expires_at IS NOT NULL AND datetime(expires_at) <= CURRENT_TIMESTAMP`
  ).run();
  return Number(result.meta.changes || 0);
};

/** Revokes every live link (and link session) for one client — part of the suspend/revoke cascade. */
export const revokeClientLinks = async (db: D1Database, clientId: number): Promise<number> => {
  const result = await db.prepare(
    `UPDATE client_links SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP
     WHERE client_id = ? AND status = 'active'`
  ).bind(clientId).run();
  // Any session minted from one of those links dies with it.
  await db.prepare(
    `UPDATE client_sessions SET revoked_at = CURRENT_TIMESTAMP
     WHERE client_id = ? AND client_link_id IS NOT NULL AND revoked_at IS NULL`
  ).bind(clientId).run();
  return Number(result.meta.changes || 0);
};

/** Revokes every live access key for one client — part of the suspend/revoke cascade. */
export const revokeClientAccessKeys = async (db: D1Database, clientId: number): Promise<number> => {
  const result = await db.prepare(
    `UPDATE client_access_keys SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP
     WHERE client_id = ? AND status = 'active'`
  ).bind(clientId).run();
  return Number(result.meta.changes || 0);
};

// ---------------------------------------------------------------------------
// Brute-force throttling (D1-backed second layer)
// ---------------------------------------------------------------------------

/**
 * The in-memory `checkRateLimit()` is per-isolate, so it cannot be the only
 * protection on a credential endpoint. This is the same limiter concept, given
 * a durable window in D1 so that scaling across isolates cannot multiply the
 * allowed number of guesses.
 *
 * One row per scope, updated with a single atomic UPSERT, then read back. The
 * table is tiny and self-pruning.
 */
export interface ClientThrottleResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export const consumeClientAuthThrottle = async (
  db: D1Database,
  scopeKey: string,
  limit: number,
  windowSeconds: number,
  lockSeconds: number,
): Promise<ClientThrottleResult> => {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const windowThreshold = nowSeconds - windowSeconds;
  const lockModifier = `+${Math.max(1, Math.floor(lockSeconds))} seconds`;

  try {
    await db.prepare(
      `INSERT INTO client_auth_throttle (scope_key, attempts, window_started_at, locked_until)
       VALUES (?, 1, CURRENT_TIMESTAMP, NULL)
       ON CONFLICT(scope_key) DO UPDATE SET
         attempts = CASE WHEN CAST(strftime('%s', window_started_at) AS INTEGER) <= ? THEN 1 ELSE attempts + 1 END,
         window_started_at = CASE WHEN CAST(strftime('%s', window_started_at) AS INTEGER) <= ? THEN CURRENT_TIMESTAMP ELSE window_started_at END,
         locked_until = CASE
           WHEN locked_until IS NOT NULL AND CAST(strftime('%s', locked_until) AS INTEGER) > ? THEN locked_until
           WHEN (CASE WHEN CAST(strftime('%s', window_started_at) AS INTEGER) <= ? THEN 1 ELSE attempts + 1 END) > ? THEN datetime('now', ?)
           ELSE NULL
         END`
    ).bind(
      scopeKey,
      windowThreshold,
      windowThreshold,
      nowSeconds,
      windowThreshold,
      limit,
      lockModifier,
    ).run();
  } catch (error) {
    // Deliberate fail-open, and safe here: completing a login also requires a
    // successful D1 write (the session row) and the in-memory limiter below has
    // already been consulted. If D1 is unavailable, authentication cannot
    // succeed anyway, so a throttle-storage failure cannot enable guessing.
    console.error('[code-rx] client auth throttle write error:', error);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  const rows = await asRows<{ attempts: number; locked_at: number | null }>(db.prepare(
    `SELECT attempts,
            CASE WHEN locked_until IS NULL THEN NULL ELSE CAST(strftime('%s', locked_until) AS INTEGER) END AS locked_at
     FROM client_auth_throttle WHERE scope_key = ?`
  ).bind(scopeKey));

  const state = rows[0];
  if (!state) return { allowed: true, retryAfterSeconds: 0 };
  const lockedAt = state.locked_at === null || state.locked_at === undefined ? null : Number(state.locked_at);
  if (lockedAt && lockedAt > nowSeconds) {
    return { allowed: false, retryAfterSeconds: Math.max(1, lockedAt - nowSeconds) };
  }
  return { allowed: true, retryAfterSeconds: 0 };
};

/** Opportunistic pruning keeps the throttle table from growing with attacker IPs. */
export const pruneClientAuthThrottle = async (db: D1Database): Promise<void> => {
  try {
    await db.prepare("DELETE FROM client_auth_throttle WHERE window_started_at < datetime('now', '-1 day')").run();
  } catch (error) {
    console.error('[code-rx] client auth throttle prune error:', error);
  }
};

/** The same client-IP resolution the existing rate limiter uses, hashed before storage. */
export const clientThrottleKeys = async (c: any, normalizedPasskey: string | null) => {
  const ip = c.req.header('cf-connecting-ip')
    || c.req.header('x-real-ip')
    || c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
    || 'local';
  const ipHash = (await sha256Hex(`code-rx:client-ip:v1:${ip}`)).slice(0, 32);
  const keyHash = normalizedPasskey
    ? (await sha256Hex(`code-rx:client-attempt:v1:${normalizedPasskey}`)).slice(0, 32)
    : null;
  return {
    ipScope: `ip:${ipHash}`,
    keyScope: keyHash ? `key:${keyHash}` : null,
  };
};

// ---------------------------------------------------------------------------
// Credential limits
// ---------------------------------------------------------------------------

/** Per source IP: 40 attempts inside 5 minutes, then a 5 minute cool-down. */
export const CLIENT_AUTH_IP_LIMIT = 40;
export const CLIENT_AUTH_IP_WINDOW_SECONDS = 5 * 60;
export const CLIENT_AUTH_IP_LOCK_SECONDS = 5 * 60;

/** Per attempted passkey: 10 attempts inside 15 minutes, then a 30 minute cool-down. */
export const CLIENT_AUTH_KEY_LIMIT = 10;
export const CLIENT_AUTH_KEY_WINDOW_SECONDS = 15 * 60;
export const CLIENT_AUTH_KEY_LOCK_SECONDS = 30 * 60;

/**
 * Per project code, applied only AFTER a lookup has already failed.
 *
 * The short passkey is aimed at the project it opens, so an attacker who wants
 * one client's project would keep the same three-letter code while guessing the
 * random part. 500 failures inside 15 minutes (a real client never comes close)
 * cool that code down, which turns a feasible enumeration into an impractical
 * one. Because the limit is consulted only on a failed attempt, a client who
 * holds the correct key is never locked out by somebody else's attack.
 */
export const CLIENT_AUTH_CODE_LIMIT = 500;
export const CLIENT_AUTH_CODE_WINDOW_SECONDS = 15 * 60;
export const CLIENT_AUTH_CODE_LOCK_SECONDS = 15 * 60;

/**
 * The four-character-ish hint shown beside a key in the workspace: the project
 * code for a short key (so the list reads "…MSD"), the last four characters for
 * a key issued before this format. Display only — never an authentication factor.
 */
export const clientPasskeyHint = (normalizedBody: string): string =>
  normalizedBody.length === CLIENT_PASSKEY_RANDOM_LENGTH + CLIENT_PASSKEY_CODE_LENGTH
    ? normalizedBody.slice(-CLIENT_PASSKEY_CODE_LENGTH)
    : normalizedBody.slice(-4);

/** The project code a well-formed attempt was aimed at, or null for legacy keys. */
export const clientPasskeyCodeScope = (normalizedPasskey: string | null): string | null => {
  const expected = CLIENT_PASSKEY_RANDOM_LENGTH + CLIENT_PASSKEY_CODE_LENGTH;
  if (!normalizedPasskey || normalizedPasskey.length !== expected) return null;
  const code = normalizedPasskey.slice(-CLIENT_PASSKEY_CODE_LENGTH);
  return /^[A-Z]{3}$/.test(code) ? `code:${code}` : null;
};
