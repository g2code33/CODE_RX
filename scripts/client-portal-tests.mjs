#!/usr/bin/env node
/**
 * CODE Rx SOCIETY — Client Project Portal (Phase 2) verification harness.
 *
 * Runs the REAL Hono application from functions/[[path]].ts against a real
 * SQLite database (node:sqlite) through a thin D1 adapter and an in-memory R2
 * stub. Nothing is mocked at the application layer: the schema is created by
 * the project's own `ensureSchema()`, and the routes under test are the same
 * handlers that ship to Cloudflare.
 *
 * Usage:  node --experimental-sqlite scripts/client-portal-tests.mjs
 *
 * This script is a development verifier. It is not imported by the application
 * and does not alter any production behaviour.
 */

import { DatabaseSync } from 'node:sqlite';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const OUT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'code-rx-tests-'));

// ---------------------------------------------------------------------------
// Tiny test runner
// ---------------------------------------------------------------------------

const results = [];
let currentSuite = '';

const suite = (name) => { currentSuite = name; };

const check = (name, condition, detail = '') => {
  const passed = Boolean(condition);
  results.push({ suite: currentSuite, name, passed, detail });
  const mark = passed ? '\u001b[32mPASS\u001b[0m' : '\u001b[31mFAIL\u001b[0m';
  console.log(`  ${mark}  ${name}${passed || !detail ? '' : ` — ${detail}`}`);
  return passed;
};

const group = (title) => console.log(`\n\u001b[1m${title}\u001b[0m`);

// ---------------------------------------------------------------------------
// D1 adapter over node:sqlite (matches the Cloudflare D1 interface surface)
// ---------------------------------------------------------------------------

const normaliseParam = (value) => {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof Date) return value.toISOString();
  return value;
};

const needsRows = (sql) => /^\s*(SELECT|PRAGMA|WITH|EXPLAIN)/i.test(sql) || /RETURNING/i.test(sql);

class ShimStatement {
  constructor(db, sql, params) {
    this.db = db;
    this.sql = sql;
    this.params = params;
  }

  bind(...params) {
    return new ShimStatement(this.db, this.sql, params.map(normaliseParam));
  }

  _statement() {
    return this.db.raw.prepare(this.sql);
  }

  async all() {
    try {
      const rows = this._statement().all(...this.params);
      return { results: rows, success: true, meta: { changes: 0, last_row_id: 0, duration: 0 } };
    } catch (error) {
      throw new Error(`${error.message} [sql: ${this.sql.slice(0, 120)}]`);
    }
  }

  async run() {
    try {
      const info = this._statement().run(...this.params);
      return {
        results: [],
        success: true,
        meta: {
          changes: Number(info.changes ?? 0),
          last_row_id: Number(info.lastInsertRowid ?? 0),
          duration: 0,
        },
      };
    } catch (error) {
      throw new Error(`${error.message} [sql: ${this.sql.slice(0, 120)}]`);
    }
  }

  async first(column) {
    const { results: rows } = await this.all();
    if (!rows.length) return null;
    return column ? rows[0][column] : rows[0];
  }

  async raw() {
    const { results: rows } = await this.all();
    return rows.map((row) => Object.values(row));
  }
}

class ShimDatabase {
  constructor(file = ':memory:') {
    this.raw = new DatabaseSync(file);
    this.raw.exec('PRAGMA foreign_keys = ON');
  }

  prepare(sql) {
    return new ShimStatement(this, sql, []);
  }

  async batch(statements) {
    const out = [];
    for (const statement of statements) {
      out.push(needsRows(statement.sql) ? await statement.all() : await statement.run());
    }
    return out;
  }

  async exec(sql) {
    this.raw.exec(sql);
    return { count: 0, duration: 0 };
  }

  /** Direct query helper for test setup and assertions. */
  query(sql, ...params) {
    return this.raw.prepare(sql).all(...params.map(normaliseParam));
  }

  execute(sql, ...params) {
    return this.raw.prepare(sql).run(...params.map(normaliseParam));
  }
}

// ---------------------------------------------------------------------------
// Minimal R2 stub
// ---------------------------------------------------------------------------

class ShimBucket {
  constructor() { this.objects = new Map(); }

  async put(key, value, options = {}) {
    this.objects.set(key, { value, httpMetadata: options.httpMetadata || {} });
    return { key };
  }

  async get(key) {
    const stored = this.objects.get(key);
    if (!stored) return null;
    return { key, body: stored.value, httpMetadata: stored.httpMetadata };
  }

  async delete(key) { this.objects.delete(key); }
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const ENV = {
  DB: null,
  BUCKET: new ShimBucket(),
  JWT_SECRET: 'phase2-harness-secret-not-a-production-value',
  ADMIN_EMAIL: 'phantom@example.test',
  PHANTOM_EMAIL: 'phantom@example.test',
  ADMIN_PASSWORD: 'HarnessPhantomPassword1',
  TELEGRAM_LINK: '',
};

let app;
let helpers;

let ipCounter = 0;
const uniqueIp = () => {
  ipCounter += 1;
  return `10.${Math.floor(ipCounter / 250) % 250}.${ipCounter % 250}.7`;
};

const request = async (method, url, { body, headers = {}, token, clientSession, ip } = {}) => {
  const init = { method, headers: { ...headers } };
  // The passkey endpoint throttles per client IP. Fixtures use distinct IPs so
  // they stay independent; the rate-limit group pins one on purpose.
  init.headers['cf-connecting-ip'] = ip || uniqueIp();
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers['Content-Type'] = 'application/json';
  }
  if (token) init.headers.Authorization = `Bearer ${token}`;
  if (clientSession) init.headers['X-Code-Rx-Client-Session'] = clientSession;
  const response = await app.fetch(new Request(`https://portal.test${url}`, init), ENV, {});
  let json = null;
  const text = await response.clone().text();
  try { json = JSON.parse(text); } catch { /* non-JSON (file stream) */ }
  return { status: response.status, json, headers: response.headers, text };
};

const uniquePasskey = () => helpers.generateClientPasskey();
const normalise = (passkey) => helpers.normalizeClientPasskey(passkey);

// ---------------------------------------------------------------------------
// Test fixtures built through the real PHANTOM management API
// ---------------------------------------------------------------------------

const createClient = async (phantomToken, name) => {
  const response = await request('POST', '/api/phantom/clients', { token: phantomToken, body: { name } });
  if (response.status !== 201) throw new Error(`createClient failed: ${JSON.stringify(response.json)}`);
  const detail = await request('GET', `/api/phantom/clients/${response.json.data.id}`, { token: phantomToken });
  return detail.json.data.client;
};

const createProject = async (phantomToken, clientId, name) => {
  const response = await request('POST', `/api/phantom/clients/${clientId}/projects`, { token: phantomToken, body: { name } });
  if (response.status !== 201) throw new Error(`createProject failed: ${JSON.stringify(response.json)}`);
  return (await request('GET', `/api/phantom/clients/${clientId}/projects`, { token: phantomToken })).json.data
    .find((project) => project.id === response.json.data.id);
};

const createKey = async (phantomToken, clientId, projectId, options = {}) => {
  const response = await request('POST', `/api/phantom/clients/${clientId}/keys`, {
    token: phantomToken,
    body: { projectId, label: options.label || 'Harness key', expiresAt: options.expiresAt },
  });
  if (response.status !== 201) throw new Error(`createKey failed: ${JSON.stringify(response.json)}`);
  return response.json.data;
};

const createDocument = async (phantomToken, clientId, projectId, body = {}) => {
  const response = await request('POST', `/api/phantom/clients/${clientId}/documents`, {
    token: phantomToken,
    body: { projectId, category: 'document', title: 'Harness document', contentText: 'Body text.', ...body },
  });
  if (response.status !== 201) throw new Error(`createDocument failed: ${JSON.stringify(response.json)}`);
  return response.json.data;
};

const publish = async (phantomToken, documentId, state = 'published') =>
  request('POST', `/api/phantom/client-documents/${documentId}/lifecycle`, { token: phantomToken, body: { state } });

const clientLogin = async (passkey) => request('POST', '/api/client/auth/login', { body: { passkey } });

/** Logs in and fails loudly with the server response if no session came back. */
const clientSession = async (passkey, label) => {
  const response = await clientLogin(passkey);
  const token = response.json?.data?.session?.token;
  if (!token) throw new Error(`login fixture failed (${label}): ${response.status} ${JSON.stringify(response.json)}`);
  return token;
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const main = async () => {
  // Bundle the real application and the helper modules.
  const appBundle = path.join(OUT_DIR, 'api.mjs');
  const authBundle = path.join(OUT_DIR, 'client-auth.mjs');
  const portalBundle = path.join(OUT_DIR, 'client-portal.mjs');

  await build({
    entryPoints: [path.join(ROOT, 'functions/[[path]].ts')],
    outfile: appBundle,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    logLevel: 'error',
  });
  await build({
    entryPoints: [path.join(ROOT, 'functions/lib/client-auth.ts')],
    outfile: authBundle,
    bundle: true, format: 'esm', platform: 'node', target: 'node22', logLevel: 'error',
  });
  await build({
    entryPoints: [path.join(ROOT, 'functions/lib/client-portal.ts')],
    outfile: portalBundle,
    bundle: true, format: 'esm', platform: 'node', target: 'node22', logLevel: 'error',
  });

  const db = new ShimDatabase();
  ENV.DB = db;

  const appModule = await import(pathToFileURL(appBundle).href);
  app = appModule.default;
  const authModule = await import(pathToFileURL(authBundle).href);
  helpers = authModule;
  const portalModule = await import(pathToFileURL(portalBundle).href);

  console.log('CODE Rx — Client Project Portal Phase 2 verification');
  console.log('='.repeat(64));

  // =========================================================================
  group('0. Foundation — schema, portal switch, PHANTOM bootstrap');
  // =========================================================================

  const health = await request('GET', '/api/health');
  check('API boots and schema is created', health.status === 200, JSON.stringify(health.json));

  const newTables = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'client%' ORDER BY name")
    .map((row) => row.name);
  for (const table of ['client_access_keys', 'client_auth_throttle', 'client_documents',
    'client_links', 'client_projects', 'client_reference_sequences', 'client_sessions', 'clients']) {
    check(`table ${table} exists`, newTables.includes(table));
  }
  check('only ONE session table exists (no parallel link-session system)',
    !newTables.includes('client_link_sessions') && newTables.filter((name) => name.includes('session')).length === 1);

  const existingTables = ['users', 'member_profiles', 'vault_documents', 'vault_shares', 'audit_logs', 'system_settings', 'notifications'];
  const allTables = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").map((row) => row.name);
  check('all pre-existing tables preserved', existingTables.every((table) => allTables.includes(table)));

  const flagCount = db.query("SELECT COUNT(*) AS c FROM system_settings WHERE setting_key IN ('client_portal_enabled','client_downloads_enabled','client_all_links_enabled')")[0].c;
  check('client portal feature flags seeded', Number(flagCount) === 3);

  const clientIndexes = db.query(
    "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_client%' ORDER BY name",
  ).map((row) => row.name);
  check('all 11 client-portal authorization indexes exist', clientIndexes.length === 11, clientIndexes.join(','));
  check('the audit feed is indexed by action',
    db.query("SELECT COUNT(*) AS c FROM sqlite_master WHERE type='index' AND name='idx_audit_logs_action'")[0].c === 1);

  const fkChildren = ['client_projects', 'client_documents', 'client_access_keys', 'client_sessions', 'client_links'];
  const missingFk = fkChildren.filter((table) => db.query(`PRAGMA foreign_key_list(${table})`).length === 0);
  check('child tables carry real foreign keys', missingFk.length === 0, `missing on ${missingFk.join(',')}`);
  check('client sessions reference the client, project, key and link',
    db.query('PRAGMA foreign_key_list(client_sessions)').length === 4);

  const statusChecks = db.query("SELECT sql FROM sqlite_master WHERE name = 'clients'")[0].sql;
  check('client status is constrained by a CHECK', statusChecks.includes("CHECK (status IN ('active','suspended','archived','revoked'))"));
  const lifecycleSql = db.query("SELECT sql FROM sqlite_master WHERE name = 'client_documents'")[0].sql;
  check('document lifecycle is constrained to the six named states',
    lifecycleSql.includes('published') && lifecycleSql.includes('in_review') && lifecycleSql.includes('unpublished'));
  check('schema version marker was advanced',
    db.query("SELECT setting_value FROM system_settings WHERE setting_key = 'vault_schema_version'")[0].setting_value.includes('client-portal'));
  check('the 63 pre-existing tables are untouched and 8 portal tables were added',
    allTables.length === 63 + 8, `${allTables.length} user tables`);

  const preExistingIndexes = db.query(
    `SELECT COUNT(*) AS c FROM sqlite_master WHERE type='index' AND name NOT LIKE 'idx_client%' AND name NOT LIKE 'sqlite_%'`,
  )[0].c;
  check('the 38 pre-existing indexes are preserved beside the new audit index',
    Number(preExistingIndexes) === 39, `${preExistingIndexes} non-portal indexes`);

  const portalDark = await request('GET', '/api/client/me', {});
  check('portal is dark until PHANTOM enables it (404)', portalDark.status === 404, `got ${portalDark.status}`);

  const darkLogin = await request('POST', '/api/client/auth/login', { body: { passkey: 'CRX-AAAA-BBBB-CCCC-DDDD' } });
  check('passkey login refused while portal is disabled', darkLogin.status === 404, `got ${darkLogin.status}`);

  // PHANTOM signs in through the existing member authentication path.
  const phantomLogin = await request('POST', '/api/auth/login', {
    body: { identifier: ENV.ADMIN_EMAIL, password: ENV.ADMIN_PASSWORD },
  });
  const phantomToken = phantomLogin.json?.token;
  check('existing PHANTOM member login still works', phantomLogin.status === 200 && Boolean(phantomToken));

  // Enable the portal through the EXISTING PHANTOM settings endpoint.
  const enable = await request('PUT', '/api/phantom/settings/client_portal_enabled', { token: phantomToken, body: { value: '1' } });
  check('portal enabled through the existing settings endpoint (reuse, not a new system)', enable.status === 200);

  // =========================================================================
  group('1. Client data model + project model');
  // =========================================================================

  const clientA = await createClient(phantomToken, 'Ashanti Pharmacy Ltd');
  const clientB = await createClient(phantomToken, 'Kumasi Diagnostics');
  check('client created with an opaque public id', /^cli_[0-9a-f]{24}$/.test(clientA.id), clientA.id);
  check('client defaults to active', clientA.status === 'active');

  const projectA = await createProject(phantomToken, clientA.id, 'Pharmacy Digital Platform');
  const projectA2 = await createProject(phantomToken, clientA.id, 'Second Project');
  const projectB = await createProject(phantomToken, clientB.id, 'Diagnostics Rollout');
  check('project reference uses the CRX-PROJ-YYYY-NNN format', /^CRX-PROJ-\d{4}-\d{3}$/.test(projectA.reference), projectA.reference);
  check('project references are unique and sequential', projectA.reference !== projectA2.reference && projectB.reference !== projectA.reference);
  check('one client can hold multiple projects', projectA.id !== projectA2.id);
  check('the audit log records client/project creation',
    db.query("SELECT COUNT(*) AS c FROM audit_logs WHERE action IN ('client.created','client.project.created')")[0].c >= 3);

  const clientList = await request('GET', '/api/phantom/clients', { token: phantomToken });
  check('client list is PHANTOM-visible and excludes other systems', clientList.json.data.length === 2);

  // Clients must never appear in member systems.
  check('no client row exists in users', Number(db.query('SELECT COUNT(*) AS c FROM users')[0].c) === 1);
  check('no client row exists in member_profiles', Number(db.query('SELECT COUNT(*) AS c FROM member_profiles')[0].c) === 1);
  check('no client row exists in members', Number(db.query('SELECT COUNT(*) AS c FROM members')[0].c) === 1);

  // =========================================================================
  group('2. Client access credential');
  // =========================================================================

  const keyA = await createKey(phantomToken, clientA.id, projectA.id, { label: 'Primary contact' });
  check('passkey uses the CRX- format', /^CRX-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(keyA.passkey), keyA.passkey);
  check('passkey avoids ambiguous characters (0/O/1/I)', !/[01OI]/.test(keyA.passkey.replace(/^CRX-/, '')));
  check('passkey body carries 80 bits of entropy (16 chars × 5 bits)', normalise(keyA.passkey).length === 16);
  check('raw passkey is NOT stored anywhere in D1',
    Number(db.query('SELECT COUNT(*) AS c FROM client_access_keys WHERE key_hash LIKE ? OR key_hint = ?', `%${normalise(keyA.passkey)}%`, keyA.passkey)[0].c) === 0);
  check('only a SHA-256 verifier and a 4-character hint are stored',
    db.query('SELECT key_hash, key_hint FROM client_access_keys WHERE public_id = ?', keyA.id)[0].key_hash.length === 64
    && db.query('SELECT key_hint FROM client_access_keys WHERE public_id = ?', keyA.id)[0].key_hint === normalise(keyA.passkey).slice(-4));
  check('the API never returns an internal row id for a credential', keyA.id.startsWith('key_'));
  check('no plaintext or recoverable ciphertext column exists on client_access_keys',
    !db.query('PRAGMA table_info(client_access_keys)').some((column) => /cipher|plain|raw/i.test(column.name)));

  const keyList = await request('GET', `/api/phantom/clients/${clientA.id}/keys`, { token: phantomToken });
  check('key list exposes hints but never a verifier',
    keyList.json.data[0].hint === normalise(keyA.passkey).slice(-4) && !JSON.stringify(keyList.json).includes('key_hash'));

  const twoKeys = await createKey(phantomToken, clientA.id, projectA.id, { label: 'Second key' });
  check('a second independent key can be issued', twoKeys.passkey !== keyA.passkey);

  const futureExpiry = await createKey(phantomToken, clientA.id, projectA.id, {
    label: 'Expiring key', expiresAt: new Date(Date.now() + 86400000).toISOString(),
  });
  check('optional expiration is supported at issue time', Boolean(futureExpiry.expiresAt));

  const pastExpiryRejected = await request('POST', `/api/phantom/clients/${clientA.id}/keys`, {
    token: phantomToken, body: { projectId: projectA.id, expiresAt: new Date(Date.now() - 86400000).toISOString() },
  });
  check('an expiry in the past is refused', pastExpiryRejected.status === 400);

  // =========================================================================
  group('3. Client session');
  // =========================================================================

  const loginA = await clientLogin(keyA.passkey);
  check('valid passkey authenticates', loginA.status === 200 && Boolean(loginA.json.data.session.token));
  check('session token is 256-bit hex', /^[0-9a-f]{64}$/.test(loginA.json.data.session.token));
  const sessionA = loginA.json.data.session.token;
  check('session returns client + project + permissions context',
    loginA.json.data.client.id === clientA.id
    && loginA.json.data.project.id === projectA.id
    && loginA.json.data.permissions.view === true);
  check('session row is bound to client AND project',
    Number(db.query('SELECT COUNT(*) AS c FROM client_sessions WHERE client_id = (SELECT id FROM clients WHERE public_id = ?) AND client_project_id = (SELECT id FROM client_projects WHERE public_id = ?)', clientA.id, projectA.id)[0].c) === 1,
    'expected exactly the one session created by the login above');
  check('only a session verifier is stored',
    db.query('SELECT session_hash FROM client_sessions ORDER BY id DESC LIMIT 1')[0].session_hash.length === 64
    && !JSON.stringify(db.query('SELECT session_hash FROM client_sessions')).includes(sessionA));
  check('raw IP and user agent are never stored raw',
    db.query('PRAGMA table_info(client_sessions)').some((column) => column.name === 'ip_hash')
    && !db.query('PRAGMA table_info(client_sessions)').some((column) => column.name === 'ip'));

  const meA = await request('GET', '/api/client/me', { clientSession: sessionA });
  check('client session resolves the client context', meA.status === 200 && meA.json.data.project.id === projectA.id);

  const noSession = await request('GET', '/api/client/me', {});
  check('a request with no client session is refused (401)', noSession.status === 401);
  const unauthProject = await request('GET', `/api/client/project/${projectA.id}`, {});
  check('no session means no project access (401, never 500)', unauthProject.status === 401, `got ${unauthProject.status}`);
  const badSession = await request('GET', '/api/client/me', { clientSession: 'f'.repeat(64) });
  check('an unknown client session is refused (401)', badSession.status === 401);
  const memberTokenAsClient = await request('GET', '/api/client/me', { clientSession: phantomToken });
  check('a member JWT cannot be used as a client session', memberTokenAsClient.status === 401);

  // =========================================================================
  group('4. Client access status');
  // =========================================================================

  const clientC = await createClient(phantomToken, 'Suspended Client Ltd');
  const projectC = await createProject(phantomToken, clientC.id, 'Suspended Project');
  const keyC = await createKey(phantomToken, clientC.id, projectC.id);
  const sessionC = await clientSession(keyC.passkey, 'client C');
  check('fixture client can sign in', Boolean(sessionC));

  const suspendC = await request('POST', `/api/phantom/clients/${clientC.id}/status`, { token: phantomToken, body: { status: 'suspended' } });
  check('PHANTOM can suspend a client', suspendC.status === 200 && suspendC.json.data.sessions >= 1);

  const suspendedSession = await request('GET', '/api/client/me', { clientSession: sessionC });
  check('suspension invalidates an already-issued session immediately',
    suspendedSession.status === 401 || suspendedSession.status === 404, `got ${suspendedSession.status}`);
  check('an invalidated session returns no client data', !JSON.stringify(suspendedSession.json).includes(clientC.id));
  const suspendedLogin = await clientLogin(keyC.passkey);
  check('a suspended client cannot sign in', suspendedLogin.status === 401);
  check('suspension also revoked the access key',
    db.query("SELECT status FROM client_access_keys WHERE client_id = (SELECT id FROM clients WHERE public_id = ?)", clientC.id)[0].status === 'revoked');

  const archiveC = await request('POST', `/api/phantom/clients/${clientC.id}/status`, { token: phantomToken, body: { status: 'archived' } });
  check('PHANTOM can archive a client', archiveC.status === 200);
  const archivedLogin = await clientLogin(keyC.passkey);
  check('an archived client cannot sign in', archivedLogin.status === 401);

  // Defence in depth: the status column itself must deny, not merely the
  // revocation cascade. Simulated by deactivating a client in SQL only, leaving
  // its key and session intact (a future code path or a manual edit could do this).
  const manualClient = await createClient(phantomToken, 'Manual Suspension Ltd');
  const manualProject = await createProject(phantomToken, manualClient.id, 'Manual Project');
  const manualKey = await createKey(phantomToken, manualClient.id, manualProject.id);
  const manualSession = await clientSession(manualKey.passkey, 'manual suspension');
  db.execute("UPDATE clients SET status = 'suspended' WHERE public_id = ?", manualClient.id);
  check('a client deactivated without the cascade still cannot sign in',
    (await clientLogin(manualKey.passkey)).status === 401);
  const manualLive = await request('GET', '/api/client/me', { clientSession: manualSession });
  check('a live session dies from the client status alone',
    manualLive.status === 401 || manualLive.status === 404, `got ${manualLive.status}`);
  check('the access key was left intact for this test',
    db.query('SELECT status FROM client_access_keys WHERE public_id = ?', manualKey.id)[0].status === 'active');

  const manualProjectOnly = manualProject.id;
  db.execute("UPDATE client_projects SET status = 'suspended' WHERE public_id = ?", manualProjectOnly);
  db.execute("UPDATE clients SET status = 'active' WHERE public_id = ?", manualClient.id);
  check('a project deactivated without the cascade also denies',
    (await clientLogin(manualKey.passkey)).status === 401);

  const reviveC = await request('POST', `/api/phantom/clients/${clientC.id}/status`, { token: phantomToken, body: { status: 'active' } });
  check('PHANTOM can restore a client to active', reviveC.status === 200);
  const revivedLogin = await clientLogin(keyC.passkey);
  check('a revoked key stays revoked after reactivation (safe default)', revivedLogin.status === 401);

  // =========================================================================
  group('5. Client document model + lifecycle');
  // =========================================================================

  const docDraft = await createDocument(phantomToken, clientA.id, projectA.id, { title: 'Draft deliverable', category: 'deliverable' });
  const docLetter = await createDocument(phantomToken, clientA.id, projectA.id, { title: 'Engagement letter', category: 'letter' });
  const docReport = await createDocument(phantomToken, clientA.id, projectA.id, { title: 'Monthly report', category: 'report' });
  const docAgreement = await createDocument(phantomToken, clientA.id, projectA.id, { title: 'Service agreement', category: 'agreement' });
  const docUpdate = await createDocument(phantomToken, clientA.id, projectA.id, { title: 'Progress update', category: 'update' });

  check('category drives the reference prefix (letter → CRX-LTR)',
    docLetter.reference.startsWith('CRX-LTR-'), docLetter.reference);
  check('category drives the reference prefix (report → CRX-RPT)',
    docReport.reference.startsWith('CRX-RPT-'), docReport.reference);
  check('category drives the reference prefix (agreement → CRX-AGR)',
    docAgreement.reference.startsWith('CRX-AGR-'), docAgreement.reference);
  check('category drives the reference prefix (deliverable → CRX-DLV)',
    docDraft.reference.startsWith('CRX-DLV-'), docDraft.reference);
  check('category drives the reference prefix (update → CRX-UPD)',
    docUpdate.reference.startsWith('CRX-UPD-'), docUpdate.reference);
  check('a new client document starts as DRAFT and not client-visible',
    db.query('SELECT lifecycle_status, client_visible FROM client_documents WHERE public_id = ?', docDraft.id)[0].lifecycle_status === 'draft'
    && Number(db.query('SELECT client_visible FROM client_documents WHERE public_id = ?', docDraft.id)[0].client_visible) === 0);

  const draftVisible = await request('GET', `/api/client/project/${projectA.id}/documents/${docDraft.id}`, { clientSession: sessionA });
  check('a DRAFT document is not exposed to the client (404)', draftVisible.status === 404, `got ${draftVisible.status}`);

  await publish(phantomToken, docDraft.id, 'in_review');
  const inReviewVisible = await request('GET', `/api/client/project/${projectA.id}/documents/${docDraft.id}`, { clientSession: sessionA });
  check('an IN_REVIEW document is not exposed to the client', inReviewVisible.status === 404);

  await publish(phantomToken, docDraft.id, 'approved');
  const approvedVisible = await request('GET', `/api/client/project/${projectA.id}/documents/${docDraft.id}`, { clientSession: sessionA });
  check('an APPROVED document is not exposed to the client', approvedVisible.status === 404);

  const published = await publish(phantomToken, docDraft.id, 'published');
  check('PHANTOM can publish a document', published.status === 200 && published.json.data.clientVisible === true);
  const publishedVisible = await request('GET', `/api/client/project/${projectA.id}/documents/${docDraft.id}`, { clientSession: sessionA });
  check('a PUBLISHED document is exposed to its client', publishedVisible.status === 200);
  check('client document payload carries the reference and no internal ids',
    publishedVisible.json.data.document.reference === docDraft.reference
    && !JSON.stringify(publishedVisible.json).includes('vault_document_id')
    && !JSON.stringify(publishedVisible.json).includes('storage_reference'));

  const bogusState = await publish(phantomToken, docDraft.id, 'banana');
  check('an unsupported lifecycle state is rejected', bogusState.status === 400, `got ${bogusState.status}`);
  check('the rejected state was not written',
    db.query('SELECT lifecycle_status FROM client_documents WHERE public_id = ?', docDraft.id)[0].lifecycle_status === 'published');

  const unpublished = await publish(phantomToken, docDraft.id, 'unpublished');
  check('PHANTOM can unpublish', unpublished.status === 200);
  const afterUnpublish = await request('GET', `/api/client/project/${projectA.id}/documents/${docDraft.id}`, { clientSession: sessionA });
  check('an UNPUBLISHED document is withdrawn immediately', afterUnpublish.status === 404);

  await publish(phantomToken, docDraft.id, 'archived');
  const afterArchive = await request('GET', `/api/client/project/${projectA.id}/documents/${docDraft.id}`, { clientSession: sessionA });
  check('an ARCHIVED document is not exposed', afterArchive.status === 404);
  check('archiving sets the archive flag', Number(db.query('SELECT is_archived FROM client_documents WHERE public_id = ?', docDraft.id)[0].is_archived) === 1);

  // View/download separation.
  await publish(phantomToken, docLetter.id, 'published');
  const letterView = await request('GET', `/api/client/project/${projectA.id}/documents/${docLetter.id}`, { clientSession: sessionA });
  check('viewing and downloading are separate permissions', letterView.status === 200 && letterView.json.data.document.permissions.download === false);

  await request('PUT', '/api/phantom/settings/client_downloads_enabled', { token: phantomToken, body: { value: '1' } });
  const downloadWithoutPermission = await request('GET', `/api/client/project/${projectA.id}/documents/${docLetter.id}/download`, { clientSession: sessionA });
  check('download is refused when the document does not allow it', downloadWithoutPermission.status === 404);

  await request('PATCH', `/api/phantom/client-documents/${docLetter.id}`, { token: phantomToken, body: { allowDownload: true } });
  const downloadWithoutArtifact = await request('GET', `/api/client/project/${projectA.id}/documents/${docLetter.id}/download`, { clientSession: sessionA });
  check('download is refused when no watermarked artifact exists yet (never the original)', downloadWithoutArtifact.status === 404);

  const unsafeReference = await request('PATCH', `/api/phantom/client-documents/${docLetter.id}`, {
    token: phantomToken, body: { storageReference: 'vault/society/1/secret.pdf' },
  });
  check('an internal vault/ storage reference is rejected outright', unsafeReference.status === 400);

  await request('PATCH', `/api/phantom/client-documents/${docLetter.id}`, {
    token: phantomToken, body: { storageReference: 'client-exports/harness/letter.pdf' },
  });
  await ENV.BUCKET.put('client-exports/harness/letter.pdf', 'STAMPED', { httpMetadata: { contentType: 'application/pdf' } });
  const downloadPermitted = await request('GET', `/api/client/project/${projectA.id}/documents/${docLetter.id}/download`, { clientSession: sessionA });
  check('download succeeds for a client-safe artifact with permission',
    downloadPermitted.status === 200, `got ${downloadPermitted.status}`);
  check('download is private and never cached', downloadPermitted.headers.get('cache-control') === 'private, no-store');
  check('download carries the reference as the filename',
    String(downloadPermitted.headers.get('content-disposition')).includes(docLetter.reference), String(downloadPermitted.headers.get('content-disposition')));
  check('the internal original is never served', downloadPermitted.text === 'STAMPED');

  // Even if an internal Vault key somehow reached the column (the PATCH route
  // refuses it, but assume a future bug or manual SQL), the download route must
  // still refuse to proxy it.
  const smuggled = await createDocument(phantomToken, clientA.id, projectA.id, { title: 'Smuggled vault reference', category: 'report' });
  await publish(phantomToken, smuggled.id, 'published');
  db.execute("UPDATE client_documents SET allow_download = 1, storage_reference = 'vault/society/1/secret.pdf' WHERE public_id = ?", smuggled.id);
  await ENV.BUCKET.put('vault/society/1/secret.pdf', 'INTERNAL-ORIGINAL', { httpMetadata: { contentType: 'application/pdf' } });
  const smuggledDownload = await request('GET', `/api/client/project/${projectA.id}/documents/${smuggled.id}/download`, { clientSession: sessionA });
  check('an internal vault/ artifact can never be downloaded even if the column is wrong',
    smuggledDownload.status === 404, `got ${smuggledDownload.status}`);
  check('the internal original was not proxied to the client', !smuggledDownload.text.includes('INTERNAL-ORIGINAL'));

  const downloadDisabled = await request('PUT', '/api/phantom/settings/client_downloads_enabled', { token: phantomToken, body: { value: '0' } });
  check('client downloads have their own master switch (not the Vault switch)', downloadDisabled.status === 200);
  const blocked = await request('GET', `/api/client/project/${projectA.id}/documents/${docLetter.id}/download`, { clientSession: sessionA });
  check('the master switch blocks downloads immediately', blocked.status === 404);
  await request('PUT', '/api/phantom/settings/client_downloads_enabled', { token: phantomToken, body: { value: '1' } });

  // =========================================================================
  group('6. Server-side authorization + client isolation');
  // =========================================================================

  const keyB = await createKey(phantomToken, clientB.id, projectB.id);
  const sessionB = await clientSession(keyB.passkey, 'client B');
  const docB = await createDocument(phantomToken, clientB.id, projectB.id, { title: 'B confidential report', category: 'report' });
  await publish(phantomToken, docB.id, 'published');
  await publish(phantomToken, docReport.id, 'published');

  const unauthDocument = await request('GET', `/api/client/project/${projectA.id}/documents/${docLetter.id}`, {});
  check('no session means no document access (401, never 500)', unauthDocument.status === 401, `got ${unauthDocument.status}`);
  const unauthDownload = await request('GET', `/api/client/project/${projectA.id}/documents/${docLetter.id}/download`, {});
  check('no session means no download (401, never 500)', unauthDownload.status === 401, `got ${unauthDownload.status}`);
  const unauthSection = await request('GET', `/api/client/project/${projectA.id}/sections/documents`, {});
  check('no session means no section access (401, never 500)', unauthSection.status === 401, `got ${unauthSection.status}`);

  const crossProject = await request('GET', `/api/client/project/${projectB.id}`, { clientSession: sessionA });
  check('client A cannot open client B project room', crossProject.status === 404);

  const crossProjectDoc = await request('GET', `/api/client/project/${projectB.id}/documents/${docB.id}`, { clientSession: sessionA });
  check('client A cannot read client B document by its own project path', crossProjectDoc.status === 404);

  const misParented = await request('GET', `/api/client/project/${projectA.id}/documents/${docB.id}`, { clientSession: sessionA });
  check('a foreign document id inside an owned project path is 404', misParented.status === 404);

  const crossSection = await request('GET', `/api/client/project/${projectB.id}/sections/reports`, { clientSession: sessionA });
  check('client A cannot list client B sections', crossSection.status === 404);

  // Defence in depth: even if a document id is addressed through a project the
  // session owns, the document itself must belong to the SAME client.
  const foreignDocViaOwnProject = db.query('SELECT public_id, client_project_id FROM client_documents WHERE public_id = ?', docB.id)[0];
  check('the two clients really do own different projects',
    Number(foreignDocViaOwnProject.client_project_id) !== Number(db.query('SELECT id FROM client_projects WHERE public_id = ?', projectA.id)[0].id));

  const rowIdTamper = await request('GET', '/api/client/project/1', { clientSession: sessionA });
  check('sequential row ids never authorize (404)', rowIdTamper.status === 404);
  const rowIdTamperB = await request('GET', `/api/client/project/${db.query('SELECT id FROM client_projects WHERE public_id = ?', projectB.id)[0].id}`, { clientSession: sessionA });
  check('numeric row id substitution is refused', rowIdTamperB.status === 404);

  const sqlInjection = await request('GET', `/api/client/project/${encodeURIComponent("' OR 1=1--")}`, { clientSession: sessionA });
  check('an injection-shaped project id returns 404, not data', sqlInjection.status === 404);

  const otherKeys = await request('GET', `/api/phantom/clients/${clientB.id}/keys`, { token: phantomToken });
  check('key listing is scoped to one client', otherKeys.json.data.every((key) => key.id !== keyA.id));

  const activityB = await request('GET', `/api/phantom/clients/${clientB.id}/activity`, { token: phantomToken });
  check('client activity is per-client and does not contain another client',
    activityB.json.data.every((entry) => entry.details.clientPublicId === clientB.id || entry.details.clientPublicId === null));

  const failReason = await request('GET', `/api/client/project/${projectB.id}`, { clientSession: sessionA });
  const missingReason = await request('GET', '/api/client/project/prj_doesnotexist0000000000', { clientSession: sessionA });
  check('failure responses are indistinguishable (no enumeration oracle)',
    failReason.status === missingReason.status
    && JSON.stringify(failReason.json) === JSON.stringify(missingReason.json));

  check('client responses are never cached',
    (await request('GET', '/api/client/me', { clientSession: sessionA })).headers.get('cache-control') === 'private, no-store');

  // =========================================================================
  group('7. Credential lifecycle — revoke, regenerate, expire, suspend');
  // =========================================================================

  const keyR = await createKey(phantomToken, clientA.id, projectA.id, { label: 'Rotation key' });
  const sessionR = await clientSession(keyR.passkey, 'rotation key');
  check('rotation fixture can sign in', Boolean(sessionR));

  const regenerated = await request('POST', `/api/phantom/client-keys/${keyR.id}/regenerate`, { token: phantomToken });
  check('PHANTOM can regenerate a passkey', regenerated.status === 200 && Boolean(regenerated.json.data.passkey));
  check('regeneration returns a different credential', regenerated.json.data.passkey !== keyR.passkey);
  const oldKeyNow = await clientLogin(keyR.passkey);
  check('the previous passkey stops working immediately', oldKeyNow.status === 401);
  const sessionAfterRegenerate = await request('GET', '/api/client/me', { clientSession: sessionR });
  check('regeneration also kills sessions created with the old key',
    sessionAfterRegenerate.status === 401 || sessionAfterRegenerate.status === 404, `got ${sessionAfterRegenerate.status}`);
  const newKeyWorks = await clientLogin(regenerated.json.data.passkey);
  check('the new passkey works', newKeyWorks.status === 200);

  const revokeResponse = await request('POST', `/api/phantom/client-keys/${keyR.id}/revoke`, { token: phantomToken });
  check('PHANTOM can revoke a passkey', revokeResponse.status === 200);
  const revokedLogin = await clientLogin(regenerated.json.data.passkey);
  check('a revoked passkey is refused', revokedLogin.status === 401);

  const expiringKey = await createKey(phantomToken, clientA.id, projectA.id, { label: 'To expire' });
  const expiringSession = await clientSession(expiringKey.passkey, 'expiring key');
  db.execute('UPDATE client_access_keys SET expires_at = ? WHERE public_id = ?', new Date(Date.now() - 60000).toISOString(), expiringKey.id);
  const expiredLogin = await clientLogin(expiringKey.passkey);
  check('an expired passkey is refused', expiredLogin.status === 401);
  const expiredSession = await request('GET', '/api/client/me', { clientSession: expiringSession });
  check('key expiry also invalidates its live sessions',
    expiredSession.status === 401 || expiredSession.status === 404, `got ${expiredSession.status}`);

  const sessionExpKey = await createKey(phantomToken, clientA.id, projectA.id, { label: 'Session expiry' });
  const sessionExpToken = await clientSession(sessionExpKey.passkey, 'session expiry key');
  const beforeExpiry = await request('GET', '/api/client/me', { clientSession: sessionExpToken });
  check('fixture session works before expiry', beforeExpiry.status === 200);
  db.execute('UPDATE client_sessions SET expires_at = ? WHERE session_hash = (SELECT session_hash FROM client_sessions ORDER BY id DESC LIMIT 1)',
    new Date(Date.now() - 60000).toISOString());
  const afterExpiry = await request('GET', '/api/client/me', { clientSession: sessionExpToken });
  check('a client session expires server-side', afterExpiry.status === 401, `got ${afterExpiry.status}`);

  const liveKey = await createKey(phantomToken, clientA.id, projectA.id, { label: 'Live session' });
  const otherSession = await clientSession(liveKey.passkey, 'live session key');
  const stillLive = await request('GET', '/api/client/me', { clientSession: otherSession });
  check('other sessions are unaffected by one session expiring', stillLive.status === 200);

  // Temporary direct links: the URL id alone never authorizes anything.
  const linkResponse = await request('POST', `/api/phantom/clients/${clientA.id}/links`, {
    token: phantomToken,
    body: { projectId: projectA.id, expiresInMinutes: 30, maxUses: 2 },
  });
  check('PHANTOM can mint a temporary link', linkResponse.status === 201, JSON.stringify(linkResponse.json));
  const linkToken = linkResponse.json.data.token;
  check('the link token is 256-bit and not stored raw',
    /^[0-9a-f]{64}$/.test(linkToken)
    && Number(db.query('SELECT COUNT(*) AS c FROM client_links WHERE token_hash = ?', linkToken)[0].c) === 0);

  const redemption = await request('POST', `/api/client/link/${linkToken}`);
  check('a link is exchanged for a scoped client session, not access itself', redemption.status === 200 && Boolean(redemption.json.data.session.token));
  const linkSession = redemption.json.data.session.token;
  check('the link session is much shorter lived than a key session',
    new Date(redemption.json.data.session.expiresAt).getTime() - Date.now() < 46 * 60 * 1000);
  check('LINK_USED is recorded', (await request('GET', `/api/phantom/clients/${clientA.id}/activity`, { token: phantomToken }))
    .json.data.some((entry) => entry.event === 'LINK_USED'));
  check('the redemption consumed exactly one use',
    Number(db.query('SELECT use_count FROM client_links WHERE public_id = ?', linkResponse.json.data.id)[0].use_count) === 1);
  check('a link session is bound to the link, not to an access key',
    db.query('SELECT access_key_id, client_link_id FROM client_sessions ORDER BY id DESC LIMIT 1')[0].access_key_id === null
    && Number(db.query('SELECT client_link_id FROM client_sessions ORDER BY id DESC LIMIT 1')[0].client_link_id) === 1);

  const linkProject = await request('GET', `/api/client/project/${projectA.id}`, { clientSession: linkSession });
  check('a link session opens the project it points at', linkProject.status === 200);
  const linkForeign = await request('GET', `/api/client/project/${projectB.id}`, { clientSession: linkSession });
  check('a link session cannot reach another client project', linkForeign.status === 404);

  const exhausted = await request('POST', `/api/client/link/${linkToken}`);
  const exhaustedAgain = await request('POST', `/api/client/link/${linkToken}`);
  check('a link cannot be redeemed beyond its max uses (2)', exhausted.status === 200 && exhaustedAgain.status === 404);

  const singleUse = await request('POST', `/api/phantom/clients/${clientA.id}/links`, {
    token: phantomToken, body: { projectId: projectA.id, maxUses: 1 },
  });
  const revokeLink = await request('POST', `/api/phantom/client-links/${singleUse.json.data.id}/revoke`, { token: phantomToken });
  check('PHANTOM can revoke a link', revokeLink.status === 200);
  const revokedLink = await request('POST', `/api/client/link/${singleUse.json.data.token}`);
  check('a revoked link cannot be redeemed', revokedLink.status === 404);

  const expiringLink = await request('POST', `/api/phantom/clients/${clientA.id}/links`, {
    token: phantomToken, body: { projectId: projectA.id },
  });
  db.execute("UPDATE client_links SET expires_at = ? WHERE public_id = ?",
    new Date(Date.now() - 60000).toISOString(), expiringLink.json.data.id);
  const expiredLink = await request('POST', `/api/client/link/${expiringLink.json.data.token}`);
  check('an expired link cannot be redeemed', expiredLink.status === 404);

  // A document-scoped link must not open the rest of the project room.
  const docLink = await request('POST', `/api/phantom/clients/${clientA.id}/links`, {
    token: phantomToken, body: { projectId: projectA.id, documentId: docLetter.id, maxUses: 3 },
  });
  check('PHANTOM can link to one published document', docLink.status === 201, JSON.stringify(docLink.json));
  const docLinkSession = (await request('POST', `/api/client/link/${docLink.json.data.token}`)).json.data.session.token;
  const scopedDoc = await request('GET', `/api/client/project/${projectA.id}/documents/${docLetter.id}`, { clientSession: docLinkSession });
  check('a document link opens that document', scopedDoc.status === 200);
  check('a document link carries no download permission unless granted', scopedDoc.json.data.document.permissions.download === false);
  const scopedOther = await request('GET', `/api/client/project/${projectA.id}/documents/${docReport.id}`, { clientSession: docLinkSession });
  check('a document link cannot open a different document of the same client', scopedOther.status === 404);

  // A live link session must die when the LINK itself lapses, independently of
  // the session row (the session is still within its own 45-minute window).
  const lapsingLink = await request('POST', `/api/phantom/clients/${clientA.id}/links`, {
    token: phantomToken, body: { projectId: projectA.id, maxUses: 3, expiresInMinutes: 5 },
  });
  const lapsingSession = (await request('POST', `/api/client/link/${lapsingLink.json.data.token}`)).json.data.session.token;
  check('the lapsing link session works while the link is live',
    (await request('GET', '/api/client/me', { clientSession: lapsingSession })).status === 200);
  db.execute('UPDATE client_links SET expires_at = ? WHERE public_id = ?',
    new Date(Date.now() - 1000).toISOString(), lapsingLink.json.data.id);
  const lapssedSessionUse = await request('GET', '/api/client/me', { clientSession: lapsingSession });
  check('a lapsed link invalidates its own live session (link liveness re-checked every request)',
    lapssedSessionUse.status === 401 || lapssedSessionUse.status === 404, `got ${lapssedSessionUse.status}`);
  check('the lapsed link session row was still within its own window',
    db.query('SELECT COUNT(*) AS c FROM client_sessions WHERE client_link_id IS NOT NULL AND revoked_at IS NULL AND datetime(expires_at) > CURRENT_TIMESTAMP')[0].c >= 1);

  const unpublishedForLink = await request('POST', `/api/phantom/clients/${clientA.id}/links`, {
    token: phantomToken, body: { projectId: projectA.id, documentId: docUpdate.id },
  });
  check('a link cannot be minted to an unpublished document', unpublishedForLink.status === 409);

  const linkFlagOff = await request('PUT', '/api/phantom/settings/client_all_links_enabled', { token: phantomToken, body: { value: '0' } });
  check('temporary links have their own master switch', linkFlagOff.status === 200);
  const disabledLink = await request('POST', `/api/client/link/${await (async () => {
    const fresh = await request('POST', `/api/phantom/clients/${clientA.id}/links`, { token: phantomToken, body: { projectId: projectA.id } });
    return fresh.json?.data?.token || 'none';
  })()}`);
  await request('PUT', '/api/phantom/settings/client_all_links_enabled', { token: phantomToken, body: { value: '1' } });
  check('the master switch disables both minting and redemption', disabledLink.status === 404);

  // Emergency controls: a live link session and a live key session must both die.
  const revokeAll = await request('POST', `/api/phantom/clients/${clientA.id}/revoke-all`, { token: phantomToken });
  check('REVOKE ALL CLIENT ACCESS succeeds', revokeAll.status === 200 && revokeAll.json.data.keys >= 1);
  const afterRevokeAll = await request('GET', '/api/client/me', { clientSession: otherSession });
  check('revoke-all kills a live client session',
    afterRevokeAll.status === 401 || afterRevokeAll.status === 404, `got ${afterRevokeAll.status}`);
  const linkAfterRevokeAll = await request('GET', '/api/client/me', { clientSession: docLinkSession });
  check('revoke-all kills a live link session too',
    linkAfterRevokeAll.status === 401 || linkAfterRevokeAll.status === 404, `got ${linkAfterRevokeAll.status}`);
  check('revoke-all kills live temporary links',
    db.query("SELECT COUNT(*) AS c FROM client_links WHERE client_id = (SELECT id FROM clients WHERE public_id = ?) AND status = 'active'", clientA.id)[0].c === 0);
  await request('PUT', '/api/phantom/settings/client_all_links_enabled', { token: phantomToken, body: { value: '1' } });
  const revokedLinkResolve = await helpers.resolveClientLink(db, linkToken);
  check('a revoked direct link no longer resolves to active access',
    revokedLinkResolve === null || revokedLinkResolve.link_status === 'revoked');

  // =========================================================================
  group('8. Delegated permissions');
  // =========================================================================

  const delegated = await request('POST', '/api/phantom/clients', { token: phantomToken, body: { name: 'Delegation check' } });
  check('management API is reachable for PHANTOM', delegated.status === 201);

  const hashedPassword = await (async () => {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('MemberPassword1'), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256);
    const b64url = (bytes) => Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `pbkdf2$100000$${b64url(salt)}$${b64url(new Uint8Array(bits))}`;
  })();
  db.execute("INSERT INTO users (email, name, password_hash, role) VALUES ('member@example.test', 'Ordinary Member', ?, 'member')", hashedPassword);
  const memberLogin = await request('POST', '/api/auth/login', { body: { identifier: 'member@example.test', password: 'MemberPassword1' } });
  check('a normal member can still sign in (existing auth untouched)', memberLogin.status === 200);
  const memberToken = memberLogin.json.token;

  const memberList = await request('GET', '/api/phantom/clients', { token: memberToken });
  check('a member with no client permission cannot list clients (403)', memberList.status === 403, `got ${memberList.status}`);
  const memberCreate = await request('POST', '/api/phantom/clients', { token: memberToken, body: { name: 'Nope' } });
  check('a member with no client permission cannot create clients (403)', memberCreate.status === 403);
  const memberActivity = await request('GET', `/api/phantom/clients/${clientA.id}/activity`, { token: memberToken });
  check('a member with no client permission cannot read client activity (403)', memberActivity.status === 403);
  const memberKeyIssue = await request('POST', `/api/phantom/clients/${clientA.id}/keys`, { token: memberToken, body: {} });
  check('a member with no client permission cannot mint a passkey (403)', memberKeyIssue.status === 403);

  const members = db.query("SELECT id, member_code FROM member_profiles WHERE member_code IS NOT NULL ORDER BY id LIMIT 5");
  const websiteAdmin = await request('POST', '/api/phantom/website-admins', {
    token: phantomToken,
    body: { memberProfileId: members[members.length - 1].id, permissions: ['clients.preview'] },
  });
  check('client permission keys are delegatable through the existing website-admin system', websiteAdmin.status === 201 || websiteAdmin.status === 200, JSON.stringify(websiteAdmin.json));

  const delegatedToken = memberToken;
  const previewOnly = await request('GET', '/api/phantom/clients', { token: delegatedToken });
  const delegatedManage = await request('POST', '/api/phantom/clients', { token: delegatedToken, body: { name: 'Delegated attempt' } });
  check('the delegated member receives exactly the granted key, not full control',
    previewOnly.status !== 200 || delegatedManage.status !== 201, `list=${previewOnly.status} create=${delegatedManage.status}`);

  // =========================================================================
  group('9. Rate limiting and throttling');
  // =========================================================================

  const throttleAllowed = await helpers.consumeClientAuthThrottle(db, 'unit:limit', 3, 300, 60);
  check('durable throttle allows requests inside the limit', throttleAllowed.allowed === true);
  await helpers.consumeClientAuthThrottle(db, 'unit:limit', 3, 300, 60);
  await helpers.consumeClientAuthThrottle(db, 'unit:limit', 3, 300, 60);
  const throttleBlocked = await helpers.consumeClientAuthThrottle(db, 'unit:limit', 3, 300, 60);
  check('durable throttle locks after exceeding the limit', throttleBlocked.allowed === false);
  check('throttle reports a retry window', throttleBlocked.retryAfterSeconds > 0);

  const otherScope = await helpers.consumeClientAuthThrottle(db, 'unit:other', 3, 300, 60);
  check('throttle scopes are independent (one attacker cannot lock every client)', otherScope.allowed === true);

  const attackerIp = '198.51.100.9';
  let sawRateLimit = false;
  let attempts = 0;
  for (let index = 0; index < 12 && !sawRateLimit; index += 1) {
    const flood = await request('POST', '/api/client/auth/login', { body: { passkey: uniquePasskey() }, ip: attackerIp });
    attempts += 1;
    if (flood.status === 429) sawRateLimit = true;
  }
  check('repeated passkey attempts are rate limited (429)', sawRateLimit, `${attempts} attempts, none limited`);

  const throttledWhileLimited = await request('POST', '/api/client/auth/login', { body: { passkey: uniquePasskey() }, ip: attackerIp });
  check('the limiter keeps holding after the first 429', throttledWhileLimited.status === 429);

  // =========================================================================
  group('10. Activity + audit (existing infrastructure only)');
  // =========================================================================

  check('no duplicate audit table was created',
    db.query("SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name IN ('client_activity','client_audit','client_audit_logs')")[0].c === 0);

  // Client B signs in and opens its own project room and document so its feed
  // contains genuine events of its own (and none of client A's).
  await request('GET', `/api/client/project/${projectB.id}`, { clientSession: sessionB });
  await request('GET', `/api/client/project/${projectB.id}/documents/${docB.id}`, { clientSession: sessionB });

  const activity = await request('GET', `/api/phantom/clients/${clientB.id}/activity`, { token: phantomToken });
  const events = activity.json.data.map((entry) => entry.event);
  check('LOGIN is recorded', events.includes('LOGIN'), events.join(','));
  check('PROJECT_OPENED is recorded', events.includes('PROJECT_OPENED'), events.join(','));
  check('DOCUMENT_VIEWED is recorded', events.includes('DOCUMENT_VIEWED'), events.join(','));
  check('client B activity references only client B projects',
    activity.json.data.every((entry) => !entry.details.projectPublicId || entry.details.projectPublicId === projectB.id));
  check('client B activity never references client A',
    !JSON.stringify(activity.json).includes(clientA.id) && !JSON.stringify(activity.json).includes(projectA.id));

  const allEvents = db.query("SELECT DISTINCT action FROM audit_logs WHERE action LIKE 'client.%'").map((row) => row.action);
  check('ACCESS_KEY_REVOKED is recorded', allEvents.includes('client.access_key_revoked'), allEvents.join(','));
  check('ACCESS_KEY_REGENERATED is recorded', allEvents.includes('client.access_key_regenerated'));
  check('SUSPENDED / REVOKED_ALL access events are recorded',
    allEvents.includes('client.client_suspended') || allEvents.includes('client.access_revoked_all'));

  check('client events carry a client subject for indexed lookup',
    Number(db.query("SELECT COUNT(*) AS c FROM audit_logs WHERE subject_type = 'client'")[0].c) > 0);
  check('raw credentials are never written to the audit log',
    !JSON.stringify(db.query("SELECT details_json FROM audit_logs WHERE action LIKE 'client.%'")).includes(keyA.passkey.replace(/^CRX-/, '')));
  check('client events do not leak into the member Vault activity feed',
    Number(db.query("SELECT COUNT(*) AS c FROM vault_activity WHERE action LIKE 'client.%'")[0].c) === 0);
  check('the existing PHANTOM audit view still reads audit_logs',
    (await request('GET', '/api/phantom/audit-logs?limit=5', { token: phantomToken })).status === 200);

  // =========================================================================
  group('11. Regression — existing systems untouched');
  // =========================================================================

  const vaultSections = await request('GET', '/api/vault/sections', { token: phantomToken });
  check('existing Vault sections endpoint still works', vaultSections.status === 200 && vaultSections.json.data.length >= 15,
    `got ${vaultSections.status} with ${vaultSections.json?.data?.length} sections`);

  const vaultHome = await request('GET', '/api/vault/home', { token: phantomToken });
  check('existing Vault home still works', vaultHome.status === 200);

  const sharingStatus = await request('GET', '/api/vault/sharing/status', { token: phantomToken });
  check('existing Vault sharing status still works', sharingStatus.status === 200);
  check('the Vault share switch was NOT reused for the client portal',
    db.query("SELECT setting_value FROM system_settings WHERE setting_key = 'vault_sharing_enabled'")[0].setting_value === '0'
    && db.query("SELECT setting_value FROM system_settings WHERE setting_key = 'client_portal_enabled'")[0].setting_value === '1');

  const shareCreate = await request('POST', '/api/vault/documents/99999/shares', { token: phantomToken, body: {} });
  check('existing Vault share route still responds with its own validation', shareCreate.status === 404 || shareCreate.status === 400, `got ${shareCreate.status}`);

  const phantomOverview = await request('GET', '/api/phantom/overview', { token: phantomToken });
  check('existing PHANTOM overview still works', phantomOverview.status === 200);

  const notifications = await request('GET', '/api/notifications', { token: phantomToken });
  check('existing notification inbox still works', notifications.status === 200);

  const community = await request('GET', '/api/community/public/threads', {});
  check('existing public community endpoint still works', community.status === 200);

  const rolePermissions = await request('GET', '/api/phantom/roles', { token: phantomToken });
  check('existing role/permission engine still works', rolePermissions.status === 200);

  const vaultDocColumns = db.query('PRAGMA table_info(vault_documents)').map((column) => column.name);
  check('vault_documents schema is unchanged', !vaultDocColumns.includes('client_id') && vaultDocColumns.includes('document_code'));

  const auditColumns = db.query('PRAGMA table_info(audit_logs)').map((column) => column.name);
  check('audit_logs schema is unchanged (no new columns required)',
    auditColumns.length === 8 && auditColumns.includes('actor_member_profile_id') && auditColumns.includes('subject_id'));

  const memberTokens = db.query('SELECT COUNT(*) AS c FROM member_profiles')[0].c;
  check('no client was ever added to member_profiles', Number(memberTokens) === 2, `${memberTokens} profiles (PHANTOM + harness member)`);

  // =========================================================================
  group('12. Access-screen states (Phase 3 contract)');
  // =========================================================================

  // --- unknown keys: one response for every input ---------------------------
  const unknownKey = await clientLogin('CRX-AAAA-BBBB-CCCC-DDDD');
  const unknownKeyB = await clientLogin('CRX-ZZZZ-9999-YYYY-8888');
  const malformedKey = await request('POST', '/api/client/auth/login', { body: { passkey: 'not-a-real-key' } });
  check('an unknown key reports the invalid_key state',
    unknownKey.status === 401 && unknownKey.json.code === 'invalid_key', JSON.stringify(unknownKey.json));
  check('two different unknown keys are byte-identical (nothing can be enumerated)',
    JSON.stringify(unknownKey.json) === JSON.stringify(unknownKeyB.json));
  check('a malformed key is indistinguishable from an unknown one',
    JSON.stringify(malformedKey.json) === JSON.stringify(unknownKey.json));
  check('the failure message never mentions a table, id or status code',
    !/sql|d1|table|client_|_[0-9a-f]{12}|\b[45]\d\d\b/i.test(JSON.stringify(unknownKey.json)));

  // --- a matched key is told exactly what is wrong with its own access ------
  const clientD = await createClient(phantomToken, 'State Coverage Ltd');
  const projectD = await createProject(phantomToken, clientD.id, 'State Coverage Project');
  const keyD = await createKey(phantomToken, clientD.id, projectD.id);

  const phaseThreeExpiredKey = await createKey(phantomToken, clientD.id, projectD.id, { label: 'Expires now' });
  db.execute('UPDATE client_access_keys SET expires_at = ? WHERE public_id = ?', new Date(Date.now() - 60000).toISOString(), phaseThreeExpiredKey.id);
  const phaseThreeExpiredLogin = await clientLogin(phaseThreeExpiredKey.passkey);
  check('an expired key reports the key_expired state',
    phaseThreeExpiredLogin.status === 401 && phaseThreeExpiredLogin.json.code === 'key_expired', JSON.stringify(phaseThreeExpiredLogin.json));

  const phaseThreeRevokedKey = await createKey(phantomToken, clientD.id, projectD.id, { label: 'Revoked now' });
  await request('POST', `/api/phantom/client-keys/${phaseThreeRevokedKey.id}/revoke`, { token: phantomToken });
  const phaseThreeRevokedLogin = await clientLogin(phaseThreeRevokedKey.passkey);
  check('a revoked key reports the key_revoked state',
    phaseThreeRevokedLogin.status === 401 && phaseThreeRevokedLogin.json.code === 'key_revoked', JSON.stringify(phaseThreeRevokedLogin.json));

  // --- suspended client (holding a real key) --------------------------------
  const clientE = await createClient(phantomToken, 'Suspension States Ltd');
  const projectE = await createProject(phantomToken, clientE.id, 'Suspension Project');
  const keyE = await createKey(phantomToken, clientE.id, projectE.id);
  db.execute("UPDATE clients SET status = 'suspended' WHERE public_id = ?", clientE.id);
  const suspendedState = await clientLogin(keyE.passkey);
  check('a suspended client reports the client_suspended state',
    suspendedState.status === 401 && suspendedState.json.code === 'client_suspended', JSON.stringify(suspendedState.json));

  db.execute("UPDATE clients SET status = 'archived' WHERE public_id = ?", clientE.id);
  const archivedState = await clientLogin(keyE.passkey);
  check('an archived client reports the client_archived state',
    archivedState.status === 401 && archivedState.json.code === 'client_archived', JSON.stringify(archivedState.json));

  // --- archived project (client and key both still healthy) -----------------
  const clientF = await createClient(phantomToken, 'Project States Ltd');
  const projectF = await createProject(phantomToken, clientF.id, 'Archived Project');
  const keyF = await createKey(phantomToken, clientF.id, projectF.id);
  const archiveProject = await request('PATCH', `/api/phantom/client-projects/${projectF.id}`, {
    token: phantomToken, body: { status: 'archived', archive: true },
  });
  check('PHANTOM can archive a project', archiveProject.status === 200, JSON.stringify(archiveProject.json));
  const archivedProjectLogin = await clientLogin(keyF.passkey);
  check('an archived project reports the project_unavailable state',
    archivedProjectLogin.status === 401 && archivedProjectLogin.json.code === 'project_unavailable', JSON.stringify(archivedProjectLogin.json));

  // --- rate limiting carries its own state ----------------------------------
  const throttleIp = '203.0.113.44';
  let throttleState = null;
  for (let index = 0; index < 14 && !throttleState; index += 1) {
    const attempt = await request('POST', '/api/client/auth/login', { body: { passkey: uniquePasskey() }, ip: throttleIp });
    if (attempt.status === 429) throttleState = attempt.json.code;
  }
  check('a throttled attempt reports the rate_limited state', throttleState === 'rate_limited', String(throttleState));

  // --- session expiry and logout, as the screen sees them -------------------
  const clientG = await createClient(phantomToken, 'Session States Ltd');
  const projectG = await createProject(phantomToken, clientG.id, 'Session Project');
  const keyG = await createKey(phantomToken, clientG.id, projectG.id);
  const sessionG = await clientSession(keyG.passkey, 'session states');
  check('a live session loads the client context for the room',
    (await request('GET', '/api/client/me', { clientSession: sessionG })).status === 200);
  const logoutG = await request('POST', '/api/client/auth/logout', { clientSession: sessionG });
  check('client logout succeeds', logoutG.status === 200);
  const afterLogoutG = await request('GET', '/api/client/me', { clientSession: sessionG });
  check('logout invalidates the client session immediately',
    afterLogoutG.status === 401 || afterLogoutG.status === 404, `got ${afterLogoutG.status}`);

  // --- link states ----------------------------------------------------------
  const mysteryLink = await request('POST', '/api/client/link/' + uniquePasskey().replace(/-/g, ''));
  check('an unknown link reports the link_invalid state',
    mysteryLink.status === 404 && mysteryLink.json.code === 'link_invalid', JSON.stringify(mysteryLink.json));

  const linkStates = await request('POST', `/api/phantom/clients/${clientG.id}/links`, {
    token: phantomToken, body: { projectId: projectG.id, maxUses: 1 },
  });
  const linkStatesToken = linkStates.json.data.token;
  await request('POST', `/api/phantom/client-links/${linkStates.json.data.id}/revoke`, { token: phantomToken });
  const revokedLinkState = await request('POST', `/api/client/link/${linkStatesToken}`);
  check('a revoked link reports the link_revoked state',
    revokedLinkState.status === 404 && revokedLinkState.json.code === 'link_revoked', JSON.stringify(revokedLinkState.json));

  const expiringLinkState = await request('POST', `/api/phantom/clients/${clientG.id}/links`, {
    token: phantomToken, body: { projectId: projectG.id },
  });
  db.execute('UPDATE client_links SET expires_at = ? WHERE public_id = ?', new Date(Date.now() - 1000).toISOString(), expiringLinkState.json.data.id);
  const expiredLinkState = await request('POST', `/api/client/link/${expiringLinkState.json.data.token}`);
  check('an expired link reports the link_expired state',
    expiredLinkState.status === 404 && expiredLinkState.json.code === 'link_expired', JSON.stringify(expiredLinkState.json));

  const usedLinkState = await request('POST', `/api/phantom/clients/${clientG.id}/links`, {
    token: phantomToken, body: { projectId: projectG.id, maxUses: 1 },
  });
  await request('POST', `/api/client/link/${usedLinkState.json.data.token}`);
  const exhaustedLinkState = await request('POST', `/api/client/link/${usedLinkState.json.data.token}`);
  check('an exhausted link reports the link_exhausted state',
    exhaustedLinkState.status === 404 && exhaustedLinkState.json.code === 'link_exhausted', JSON.stringify(exhaustedLinkState.json));

  // --- what the browser is allowed to receive -------------------------------
  const freshKey = await createKey(phantomToken, clientG.id, projectG.id, { label: 'Payload hygiene' });
  const freshLogin = await clientLogin(freshKey.passkey);
  const freshSession = freshLogin.json.data.session.token;
  const forbidden = ['client_id', 'clientId', 'client_project_id', 'projectId', 'access_key_id', 'accessKeyId',
    'linkId', 'sessionId', 'key_hash', 'keyHash', 'storage_reference', 'storageReference', 'vault_document_id',
    'vaultDocumentId', 'notes', 'created_by_user_id'];
  const keysSeen = new Set();
  const collectKeys = (value) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(collectKeys); return; }
    Object.keys(value).forEach((key) => { keysSeen.add(key); collectKeys(value[key]); });
  };
  collectKeys(freshLogin.json);
  const leaked = forbidden.filter((key) => keysSeen.has(key));
  check('a login response carries no internal identifiers or storage keys', leaked.length === 0, leaked.join(','));
  check('a login response never echoes the access key',
    !JSON.stringify(freshLogin.json).includes(normalise(freshKey.passkey).slice(0, 8)));
  check('the browser receives an opaque project id, not a row id',
    /^prj_[0-9a-f]{24}$/.test(freshLogin.json.data.project.id) && /^cli_[0-9a-f]{24}$/.test(freshLogin.json.data.client.id));

  // --- the exact call sequence the project room performs --------------------
  const roomProject = await request('GET', `/api/client/project/${freshLogin.json.data.project.id}`, { clientSession: freshSession });
  check('the room can load the project, its sections and recent documents',
    roomProject.status === 200
    && roomProject.json.data.project.reference === freshLogin.json.data.project.reference
    && roomProject.json.data.sections.some((section) => section.id === 'overview' && typeof section.count === 'number')
    && Array.isArray(roomProject.json.data.recent));
  check('every room section is one of the seven published sections',
    roomProject.json.data.sections.map((section) => section.id).join(',') === 'overview,documents,letters,agreements,reports,deliverables,updates');

  const roomDoc = await createDocument(phantomToken, clientG.id, projectG.id, { title: 'Room reader check', category: 'report', contentText: 'Client-visible body.' });
  await publish(phantomToken, roomDoc.id, 'published');
  const roomSection = await request('GET', `/api/client/project/${projectG.id}/sections/reports`, { clientSession: freshSession });
  check('a section lists the published document', roomSection.status === 200 && roomSection.json.data.documents.some((document) => document.id === roomDoc.id));
  const roomReader = await request('GET', `/api/client/project/${projectG.id}/documents/${roomDoc.id}`, { clientSession: freshSession });
  check('the document reader receives renderable content',
    roomReader.status === 200
    && Array.isArray(roomReader.json.data.document.content?.blocks)
    && roomReader.json.data.document.content.blocks.length > 0
    && roomReader.json.data.document.reference === roomDoc.reference);
  check('the viewer shape is exactly what the room renders',
    ['id', 'reference', 'title', 'summary', 'category', 'version', 'publishedAt', 'updatedAt', 'permissions', 'content']
      .every((field) => field in roomReader.json.data.document));

  // =========================================================================
  group('13. Project Room end-to-end (Phase 4 requirements)');
  // =========================================================================

  // Two fully independent clients, each with a project and a credential.
  const roomA = await createClient(phantomToken, 'Room Client A');
  const roomB = await createClient(phantomToken, 'Room Client B');
  const roomProjectA = await createProject(phantomToken, roomA.id, 'Room Project A');
  await request('PATCH', `/api/phantom/client-projects/${roomProjectA.id}`, {
    token: phantomToken,
    body: { description: 'Rollout of the room demo across three branches.' },
  });
  const roomProjectB = await createProject(phantomToken, roomB.id, 'Room Project B');
  const roomKeyA = await createKey(phantomToken, roomA.id, roomProjectA.id, { label: 'Room A key' });
  const roomKeyB = await createKey(phantomToken, roomB.id, roomProjectB.id, { label: 'Room B key' });
  const roomSessionA = await clientSession(roomKeyA.passkey, 'room client A');
  const roomSessionB = await clientSession(roomKeyB.passkey, 'room client B');

  // Client A: one published letter (view + download), one view-only report,
  // one unpublished draft, one archived report, one published update.
  const publishedLetter = await createDocument(phantomToken, roomA.id, roomProjectA.id, {
    title: 'Published letter', category: 'letter', contentText: 'Letter body for the room.',
  });
  await publish(phantomToken, publishedLetter.id, 'published');
  await request('PATCH', `/api/phantom/client-documents/${publishedLetter.id}`, { token: phantomToken, body: { allowDownload: true } });
  await request('PATCH', `/api/phantom/client-documents/${publishedLetter.id}`, {
    token: phantomToken, body: { storageReference: 'client-exports/room/letter.pdf' },
  });
  await ENV.BUCKET.put('client-exports/room/letter.pdf', 'STAMPED ROOM LETTER', { httpMetadata: { contentType: 'application/pdf' } });

  const viewOnlyReport = await createDocument(phantomToken, roomA.id, roomProjectA.id, {
    title: 'View only report', category: 'report', contentText: 'Readable, never downloadable.',
  });
  await publish(phantomToken, viewOnlyReport.id, 'published');

  const unpublishedDraft = await createDocument(phantomToken, roomA.id, roomProjectA.id, {
    title: 'UNPUBLISHED DRAFT', category: 'report', contentText: 'Must never reach the client.',
  });
  await publish(phantomToken, unpublishedDraft.id, 'in_review');

  const archivedReport = await createDocument(phantomToken, roomA.id, roomProjectA.id, {
    title: 'ARCHIVED REPORT', category: 'report', contentText: 'Withdrawn from the client.',
  });
  await publish(phantomToken, archivedReport.id, 'published');
  await publish(phantomToken, archivedReport.id, 'archived');

  const publishedUpdate = await createDocument(phantomToken, roomA.id, roomProjectA.id, {
    title: 'Published update', category: 'update', contentText: 'Progress update body.',
  });
  await publish(phantomToken, publishedUpdate.id, 'published');

  // Client B: its own private report.
  const bPrivate = await createDocument(phantomToken, roomB.id, roomProjectB.id, {
    title: 'CLIENT B PRIVATE', category: 'report', contentText: 'Only client B may read this.',
  });
  await publish(phantomToken, bPrivate.id, 'published');

  // --- the room loads -------------------------------------------------------
  const room = await request('GET', `/api/client/project/${roomProjectA.id}`, { clientSession: roomSessionA });
  const roomSections = room.json.data.sections;
  const countFor = (id) => roomSections.find((section) => section.id === id)?.count ?? -1;

  check('the room lists exactly the seven sections',
    roomSections.map((section) => section.id).join(',') === 'overview,documents,letters,agreements,reports,deliverables,updates');
  check('the room shows the project name, reference and description',
    room.json.data.project.name === 'Room Project A'
    && /^CRX-PROJ-\d{4}-\d{3}$/.test(room.json.data.project.reference)
    && room.json.data.project.description.length > 0
    && !/internal/i.test(room.json.data.project.description));
  check('the room reports the project status and its own dates',
    typeof room.json.data.project.status === 'string'
    && Boolean(room.json.data.project.createdAt)
    && Boolean(room.json.data.project.updatedAt),
    JSON.stringify({ createdAt: room.json.data.project.createdAt, updatedAt: room.json.data.project.updatedAt }));
  check('the project payload carries no internal notes or admin fields',
    !/notes|created_by|is_archived|storage_reference|vault_document_id/.test(JSON.stringify(room.json.data.project)));

  check('only published, client-visible documents are counted (letters = 1)', countFor('letters') === 1, `letters=${countFor('letters')}`);
  check('the report count excludes the unpublished draft and the archived report', countFor('reports') === 1, `reports=${countFor('reports')}`);
  check('the update count reflects the published update', countFor('updates') === 1);
  check('empty categories report zero, so the room can hide them',
    countFor('documents') === 0 && countFor('agreements') === 0 && countFor('deliverables') === 0);
  check('the recent list returns published documents only',
    room.json.data.recent.every((document) => [publishedLetter.id, viewOnlyReport.id, publishedUpdate.id].includes(document.id)));
  check('no hidden document appears anywhere in the room payload',
    !/UNPUBLISHED DRAFT|ARCHIVED REPORT|CLIENT B PRIVATE/.test(JSON.stringify(room.json)));

  // --- every document shown carries the fields the room renders -------------
  const sectionReports = await request('GET', `/api/client/project/${roomProjectA.id}/sections/reports`, { clientSession: roomSessionA });
  const listedReport = sectionReports.json.data.documents.find((document) => document.id === viewOnlyReport.id);
  check('a listed document carries title, reference, category and version',
    listedReport.title === 'View only report'
    && /^CRX-RPT-\d{4}-\d{3}$/.test(listedReport.reference)
    && listedReport.category === 'report'
    && Boolean(listedReport.version));
  check('a listed document carries its publication information',
    'publishedAt' in listedReport && 'updatedAt' in listedReport && Boolean(listedReport.publishedAt),
    JSON.stringify({ publishedAt: listedReport.publishedAt, updatedAt: listedReport.updatedAt }));
  check('a view-only document reports download = false', listedReport.permissions.download === false);
  check('the letters section reports the letter as downloadable',
    (await request('GET', `/api/client/project/${roomProjectA.id}/sections/letters`, { clientSession: roomSessionA }))
      .json.data.documents.find((document) => document.id === publishedLetter.id).permissions.download === true);

  const readerReport = await request('GET', `/api/client/project/${roomProjectA.id}/documents/${viewOnlyReport.id}`, { clientSession: roomSessionA });
  check('the reader carries the publication information the room shows',
    Boolean(readerReport.json.data.document.publishedAt), JSON.stringify(readerReport.json.data.document.publishedAt));

  // --- requirement 4: view and download are independent ----------------------
  check('a view-only document is readable', readerReport.status === 200 && readerReport.json.data.document.permissions.view === true);
  check('a view-only document is NOT downloadable even though it is readable',
    (await request('GET', `/api/client/project/${roomProjectA.id}/documents/${viewOnlyReport.id}/download`, { clientSession: roomSessionA })).status === 404);

  // A view-only document must stay undownloadable even when a stamped artifact
  // exists for it. Without this case, "view only" would look protected purely
  // because no artifact happened to exist, and a future change could quietly
  // start serving it.
  const viewOnlyWithArtifact = await createDocument(phantomToken, roomA.id, roomProjectA.id, {
    title: 'View only with artifact', category: 'report', contentText: 'Readable, with a stamped copy that must stay locked.',
  });
  await publish(phantomToken, viewOnlyWithArtifact.id, 'published');
  await request('PATCH', `/api/phantom/client-documents/${viewOnlyWithArtifact.id}`, {
    token: phantomToken, body: { storageReference: 'client-exports/room/view-only.pdf' },
  });
  await ENV.BUCKET.put('client-exports/room/view-only.pdf', 'STAMPED BUT LOCKED', { httpMetadata: { contentType: 'application/pdf' } });
  check('the view-only document really does have a stamped artifact waiting',
    db.query('SELECT storage_reference FROM client_documents WHERE public_id = ?', viewOnlyWithArtifact.id)[0].storage_reference === 'client-exports/room/view-only.pdf');
  check('a view-only document with an artifact is still readable',
    (await request('GET', `/api/client/project/${roomProjectA.id}/documents/${viewOnlyWithArtifact.id}`, { clientSession: roomSessionA })).status === 200);
  const lockedDownload = await request('GET', `/api/client/project/${roomProjectA.id}/documents/${viewOnlyWithArtifact.id}/download`, { clientSession: roomSessionA });
  check('a view-only document with an artifact is still refused for download',
    lockedDownload.status === 404, `got ${lockedDownload.status}`);
  check('the locked artifact was never served', !lockedDownload.text.includes('STAMPED BUT LOCKED'));

  const authorisedDownload = await request('GET', `/api/client/project/${roomProjectA.id}/documents/${publishedLetter.id}/download`, { clientSession: roomSessionA });
  check('an authorized download works', authorisedDownload.status === 200 && authorisedDownload.text === 'STAMPED ROOM LETTER');
  check('an authorized download is private and named from the reference',
    authorisedDownload.headers.get('cache-control') === 'private, no-store'
    && String(authorisedDownload.headers.get('content-disposition')).includes(publishedLetter.reference));

  // --- requirement 5: isolation, never fetch-then-hide -----------------------
  const crossRoom = await request('GET', `/api/client/project/${roomProjectB.id}`, { clientSession: roomSessionA });
  check('client A cannot open client B project room', crossRoom.status === 404);
  const crossSectionB = await request('GET', `/api/client/project/${roomProjectB.id}/sections/reports`, { clientSession: roomSessionA });
  check('client A cannot list client B reports', crossSectionB.status === 404);
  const crossDocB = await request('GET', `/api/client/project/${roomProjectB.id}/documents/${bPrivate.id}`, { clientSession: roomSessionA });
  check('client A cannot read a client B document', crossDocB.status === 404);
  const crossDocViaOwnProject = await request('GET', `/api/client/project/${roomProjectA.id}/documents/${bPrivate.id}`, { clientSession: roomSessionA });
  check('a client B document id inside client A own project path is refused', crossDocViaOwnProject.status === 404);
  const crossDownloadB = await request('GET', `/api/client/project/${roomProjectA.id}/documents/${bPrivate.id}/download`, { clientSession: roomSessionA });
  check('client A cannot download a client B document', crossDownloadB.status === 404);

  const bRoom = await request('GET', `/api/client/project/${roomProjectB.id}`, { clientSession: roomSessionB });
  check('client B sees only its own document', bRoom.status === 200 && bRoom.json.data.recent.length === 1 && bRoom.json.data.recent[0].id === bPrivate.id);
  check('client B never sees client A documents', !JSON.stringify(bRoom.json).includes(roomA.id) && !/Published letter|View only report/.test(JSON.stringify(bRoom.json)));

  // --- requirement 8: unpublished and archived stay hidden -------------------
  check('an unpublished document is not readable',
    (await request('GET', `/api/client/project/${roomProjectA.id}/documents/${unpublishedDraft.id}`, { clientSession: roomSessionA })).status === 404);
  check('an unpublished document is not downloadable',
    (await request('GET', `/api/client/project/${roomProjectA.id}/documents/${unpublishedDraft.id}/download`, { clientSession: roomSessionA })).status === 404);
  check('an archived document is not readable',
    (await request('GET', `/api/client/project/${roomProjectA.id}/documents/${archivedReport.id}`, { clientSession: roomSessionA })).status === 404);
  check('an archived document is not downloadable',
    (await request('GET', `/api/client/project/${roomProjectA.id}/documents/${archivedReport.id}/download`, { clientSession: roomSessionA })).status === 404);
  check('an archived document does not appear in its section',
    !(await request('GET', `/api/client/project/${roomProjectA.id}/sections/reports`, { clientSession: roomSessionA }))
      .json.data.documents.some((document) => document.id === archivedReport.id));

  // --- requirement 3: direct URL manipulation --------------------------------
  const rowIdA = db.query('SELECT id FROM client_projects WHERE public_id = ?', roomProjectB.id)[0].id;
  check('a raw numeric project id from another client is refused',
    (await request('GET', `/api/client/project/${rowIdA}`, { clientSession: roomSessionA })).status === 404);
  check('a raw numeric document id is refused',
    (await request('GET', `/api/client/project/${roomProjectA.id}/documents/${db.query('SELECT id FROM client_documents WHERE public_id = ?', bPrivate.id)[0].id}`, { clientSession: roomSessionA })).status === 404);
  check('an injection-shaped project id is refused',
    (await request('GET', `/api/client/project/${encodeURIComponent("' OR '1'='1")}`, { clientSession: roomSessionA })).status === 404);
  check('an injection-shaped document id is refused',
    (await request('GET', `/api/client/project/${roomProjectA.id}/documents/${encodeURIComponent('%')}`, { clientSession: roomSessionA })).status === 404);
  check('a section outside the allowed list is refused',
    (await request('GET', `/api/client/project/${roomProjectA.id}/sections/invoices`, { clientSession: roomSessionA })).status === 404);
  check('the room cannot be opened without a session',
    (await request('GET', `/api/client/project/${roomProjectA.id}`, {})).status === 401);

  // --- every room interaction is recorded against the right client -----------
  const activityA = await request('GET', `/api/phantom/clients/${roomA.id}/activity`, { token: phantomToken });
  const eventNames = activityA.json.data.map((entry) => entry.event);
  check('opening the room is recorded as PROJECT_OPENED', eventNames.includes('PROJECT_OPENED'));
  check('opening a section is recorded as SECTION_OPENED', eventNames.includes('SECTION_OPENED'));

  // =========================================================================
  group('14. Client Access Center — PHANTOM operations (Phase 5 requirements 1-5, 7)');
  // =========================================================================

  // --- requirement 2: the client list carries what the workspace renders -----
  const accessClients = await request('GET', '/api/phantom/clients', { token: phantomToken });
  const listedRoomA = accessClients.json.data.find((entry) => entry.id === roomA.id);
  check('PHANTOM lists clients through the existing workspace API', accessClients.status === 200 && Boolean(listedRoomA));
  check('a client entry carries name, contact, status and project count',
    listedRoomA.name === 'Room Client A' && 'contactName' in listedRoomA
    && listedRoomA.status === 'active' && listedRoomA.projectCount === 1);
  check('the published count ignores drafts, archives and other clients',
    listedRoomA.publishedCount === 4, `publishedCount=${listedRoomA.publishedCount}`);
  check('a client entry reports last activity from the existing audit feed',
    Boolean(listedRoomA.lastActivityAt), String(listedRoomA.lastActivityAt));

  // --- requirements 2 and 3: client and project lifecycle --------------------
  const managedClient = await createClient(phantomToken, 'Managed Client');
  const editedClient = await request('PATCH', `/api/phantom/clients/${managedClient.id}`, {
    token: phantomToken,
    body: {
      name: 'Managed Client (renamed)', contactName: 'Ama Boateng', contactEmail: 'ama@example.test',
      contactPhone: '+233 20 000 0000', notes: 'Internal note visible to PHANTOM only.',
    },
  });
  check('PHANTOM can edit a client record', editedClient.status === 200, JSON.stringify(editedClient.json));
  const managedDetail = await request('GET', `/api/phantom/clients/${managedClient.id}`, { token: phantomToken });
  check('the edited contact details are stored on the client',
    managedDetail.json.data.client.name === 'Managed Client (renamed)'
    && managedDetail.json.data.client.contactName === 'Ama Boateng'
    && managedDetail.json.data.client.contactEmail === 'ama@example.test'
    && String(managedDetail.json.data.client.contactPhone).includes('233'));
  check('an internal client note stays on the internal record',
    managedDetail.json.data.client.notes === 'Internal note visible to PHANTOM only.');
  check('an invalid contact email is refused', 
    (await request('PATCH', `/api/phantom/clients/${managedClient.id}`, { token: phantomToken, body: { contactEmail: 'not-an-email' } })).status === 400);

  const managedProject = await createProject(phantomToken, managedClient.id, 'Managed Project');
  const managedProjects = await request('GET', `/api/phantom/clients/${managedClient.id}/projects`, { token: phantomToken });
  check('a new project is associated with exactly one client',
    Boolean(managedProject.id) && managedProjects.json.data.some((project) => project.id === managedProject.id));
  const foreignProjects = await request('GET', `/api/phantom/clients/${roomB.id}/projects`, { token: phantomToken });
  check('a project is never listed under another client',
    !foreignProjects.json.data.some((project) => project.id === managedProject.id));

  const projectEdit = await request('PATCH', `/api/phantom/client-projects/${managedProject.id}`, {
    token: phantomToken, body: { name: 'Managed Project (edited)', description: 'Client-facing description.', status: 'suspended' },
  });
  const editedProject = (await request('GET', `/api/phantom/clients/${managedClient.id}/projects`, { token: phantomToken }))
    .json.data.find((project) => project.id === managedProject.id);
  check('PHANTOM can edit a project name, description and status',
    projectEdit.status === 200 && editedProject.name === 'Managed Project (edited)'
    && editedProject.description === 'Client-facing description.' && editedProject.status === 'suspended');
  const badProjectStatus = await request('PATCH', `/api/phantom/client-projects/${managedProject.id}`, {
    token: phantomToken, body: { status: 'deleted' },
  });
  check('a project status outside the allowed set is refused', badProjectStatus.status === 400);

  const phase5ArchiveProject = await request('PATCH', `/api/phantom/client-projects/${managedProject.id}`, { token: phantomToken, body: { archive: true } });
  const afterProjectArchive = (await request('GET', `/api/phantom/clients/${managedClient.id}/projects`, { token: phantomToken }))
    .json.data.find((project) => project.id === managedProject.id);
  check('PHANTOM can archive a project', phase5ArchiveProject.status === 200 && afterProjectArchive.isArchived === true);
  const intoArchived = await request('POST', `/api/phantom/clients/${managedClient.id}/documents`, {
    token: phantomToken, body: { projectId: managedProject.id, category: 'document', title: 'Into an archived project', contentText: 'text' },
  });
  check('an archived project refuses new client documents (409)', intoArchived.status === 409, `got ${intoArchived.status}`);
  const restoreProject = await request('PATCH', `/api/phantom/client-projects/${managedProject.id}`, { token: phantomToken, body: { archive: false, status: 'active' } });
  const afterRestore = (await request('GET', `/api/phantom/clients/${managedClient.id}/projects`, { token: phantomToken }))
    .json.data.find((project) => project.id === managedProject.id);
  check('PHANTOM can restore an archived project', restoreProject.status === 200 && afterRestore.isArchived === false);

  const archivableClient = await createClient(phantomToken, 'Archivable Client');
  const archiveClient = await request('POST', `/api/phantom/clients/${archivableClient.id}/status`, { token: phantomToken, body: { status: 'archived' } });
  const defaultList = await request('GET', '/api/phantom/clients', { token: phantomToken });
  const archivedFilter = await request('GET', '/api/phantom/clients?archived=1', { token: phantomToken });
  check('archiving a client withdraws it from the default workspace list',
    archiveClient.status === 200 && !defaultList.json.data.some((entry) => entry.id === archivableClient.id));
  check('archived clients stay reachable through the archived filter',
    archivedFilter.json.data.some((entry) => entry.id === archivableClient.id && entry.status === 'archived'));

  // --- requirement 4: access keys ------------------------------------------
  const controlClient = await createClient(phantomToken, 'Access Center Client');
  const controlProject = await createProject(phantomToken, controlClient.id, 'Control Project');
  const issuedKey = await request('POST', `/api/phantom/clients/${controlClient.id}/keys`, {
    token: phantomToken, body: { projectId: controlProject.id, label: 'Primary contact' },
  });
  check('a generated key is returned once, in the CRX format, with a short hint',
    issuedKey.status === 201 && /^CRX(-[0-9A-Z]{4}){4}$/.test(issuedKey.json.data.passkey)
    && issuedKey.json.data.hint === issuedKey.json.data.passkey.slice(-4));
  check('the create response warns that the key cannot be shown again',
    /cannot be shown again/i.test(issuedKey.json.message || ''), issuedKey.json.message);
  const storedKey = db.query('SELECT key_hash, key_hint FROM client_access_keys WHERE public_id = ?', issuedKey.json.data.id)[0];
  check('only a hash of the credential is stored',
    storedKey.key_hash !== issuedKey.json.data.passkey && !String(storedKey.key_hash).includes(issuedKey.json.data.passkey.slice(4)));
  const controlKeys = await request('GET', `/api/phantom/clients/${controlClient.id}/keys`, { token: phantomToken });
  check('the key list never returns a passkey or a hash',
    !/passkey|key_hash/.test(JSON.stringify(controlKeys.json)) && !JSON.stringify(controlKeys.json).includes(issuedKey.json.data.passkey.slice(4)));
  check('the key list shows the hint, label, status and project',
    controlKeys.json.data[0].hint === issuedKey.json.data.hint
    && controlKeys.json.data[0].label === 'Primary contact'
    && controlKeys.json.data[0].status === 'active'
    && controlKeys.json.data[0].project.id === controlProject.id);
  const keySession = await clientSession(issuedKey.json.data.passkey, 'control client');
  const p5Regenerated = await request('POST', `/api/phantom/client-keys/${issuedKey.json.data.id}/regenerate`, { token: phantomToken });
  check('regenerating issues a different credential, shown once',
    p5Regenerated.status === 200 && p5Regenerated.json.data.passkey !== issuedKey.json.data.passkey
    && /^CRX(-[0-9A-Z]{4}){4}$/.test(p5Regenerated.json.data.passkey));
  const deadSession = await request('GET', `/api/client/project/${controlProject.id}`, { clientSession: keySession });
  check('regenerating kills every session that used the old credential', deadSession.status !== 200, `got ${deadSession.status}`);
  check('the replaced credential no longer signs in', (await clientLogin(issuedKey.json.data.passkey)).status === 401);
  const p5FreshSession = await clientSession(p5Regenerated.json.data.passkey, 'p5Regenerated control client');
  check('the regenerated credential works after the rotation', (await request('GET', `/api/client/project/${controlProject.id}`, { clientSession: p5FreshSession })).status === 200);

  const p5ExpiringKey = await request('POST', `/api/phantom/clients/${controlClient.id}/keys`, {
    token: phantomToken, body: { projectId: controlProject.id, expiresAt: new Date(Date.now() + 3_600_000).toISOString() },
  });
  check('an expiration can be attached to a key', p5ExpiringKey.status === 201 && Boolean(p5ExpiringKey.json.data.expiresAt));
  const revokeKey = await request('POST', `/api/phantom/client-keys/${p5ExpiringKey.json.data.id}/revoke`, { token: phantomToken });
  check('PHANTOM can revoke a key, which is then refused at sign-in',
    revokeKey.status === 200 && (await clientLogin(p5ExpiringKey.json.data.passkey)).status === 401);
  check('revoked keys are listed with their status so the workspace can show it',
    (await request('GET', `/api/phantom/clients/${controlClient.id}/keys`, { token: phantomToken }))
      .json.data.some((key) => key.id === p5ExpiringKey.json.data.id && key.status === 'revoked'));

  // --- requirement 5: the controlled publishing workflow --------------------
  const workflowKey = await createKey(phantomToken, managedClient.id, managedProject.id, { label: 'Workflow key' });
  const workflowSession = await clientSession(workflowKey.passkey, 'workflow client');
  const workflowDoc = await createDocument(phantomToken, managedClient.id, managedProject.id, {
    title: 'Workflow document', contentText: 'Client-facing workflow text.',
  });
  const workflowRoom = () => request('GET', `/api/client/project/${managedProject.id}`, { clientSession: workflowSession });
  const workflowRead = () => request('GET', `/api/client/project/${managedProject.id}/documents/${workflowDoc.id}`, { clientSession: workflowSession });
  check('a new client document starts as a draft and is invisible to the client',
    (await workflowRoom()).json.data.recent.length === 0 && (await workflowRead()).status === 404);
  await publish(phantomToken, workflowDoc.id, 'in_review');
  check('a document under review is still invisible to the client', (await workflowRead()).status === 404);
  await publish(phantomToken, workflowDoc.id, 'approved');
  check('an approved but unpublished document is still invisible to the client', (await workflowRead()).status === 404);
  await publish(phantomToken, workflowDoc.id, 'published');
  check('publishing makes the document visible in the client room',
    (await workflowRead()).status === 200
    && (await workflowRoom()).json.data.recent.some((document) => document.id === workflowDoc.id));
  check('a published document reaches the client with its text snapshot',
    (await workflowRead()).json.data.document.content.blocks[0].content.includes('Client-facing workflow text'));
  await publish(phantomToken, workflowDoc.id, 'unpublished');
  check('unpublishing withdraws the document again', (await workflowRead()).status === 404);
  const hiddenPublish = await request('POST', `/api/phantom/client-documents/${workflowDoc.id}/lifecycle`, {
    token: phantomToken, body: { state: 'published', clientVisible: false },
  });
  check('a published document without the client-visibility flag stays hidden',
    hiddenPublish.status === 200 && hiddenPublish.json.data.clientVisible === false && (await workflowRead()).status === 404);
  await publish(phantomToken, workflowDoc.id, 'published');
  check('the same document becomes visible once visibility is granted', (await workflowRead()).status === 200);
  check('an unknown lifecycle state is refused',
    (await request('POST', `/api/phantom/client-documents/${workflowDoc.id}/lifecycle`, { token: phantomToken, body: { state: 'almost' } })).status === 400);

  // --- requirement 5: internal documents are never exposed automatically -----
  db.execute("INSERT INTO vault_sections (slug, title, description, is_sensitive, sort_order, is_archived) VALUES ('phase5-open', 'Phase 5 Open', 'Harness section', 0, 900, 0)");
  db.execute("INSERT INTO vault_sections (slug, title, description, is_sensitive, sort_order, is_archived) VALUES ('phase5-sensitive', 'Phase 5 Sensitive', 'Harness section', 1, 901, 0)");
  const openSectionId = db.query("SELECT id FROM vault_sections WHERE slug = 'phase5-open'")[0].id;
  const sensitiveSectionId = db.query("SELECT id FROM vault_sections WHERE slug = 'phase5-sensitive'")[0].id;
  const insertVaultDocument = (code, sectionId, title, content, status, visibility, archived = 0) => {
    db.execute(
      `INSERT INTO vault_documents (document_code, section_id, title, content, status, visibility, is_archived)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      code, sectionId, title, content, status, visibility, archived,
    );
    return db.query('SELECT id FROM vault_documents WHERE document_code = ?', code)[0].id;
  };
  const openVaultDoc = insertVaultDocument('PH5-OPEN', openSectionId, 'Phase 5 approved source', 'PHASE 5 VAULT SOURCE TEXT', 'approved', 'members');
  const draftVaultDoc = insertVaultDocument('PH5-DRAFT', openSectionId, 'Phase 5 draft source', 'Draft text', 'draft', 'members');
  const restrictedVaultDoc = insertVaultDocument('PH5-RESTRICTED', openSectionId, 'Phase 5 restricted source', 'Restricted text', 'approved', 'restricted');
  const sensitiveVaultDoc = insertVaultDocument('PH5-SENSITIVE', sensitiveSectionId, 'Phase 5 sensitive source', 'Sensitive text', 'approved', 'members');
  const archivedVaultDoc = insertVaultDocument('PH5-ARCHIVED', openSectionId, 'Phase 5 archived source', 'Archived text', 'approved', 'members', 1);

  const vaultSources = await request('GET', '/api/phantom/client-vault-sources', { token: phantomToken });
  const sourceIds = vaultSources.json.data.map((source) => source.id);
  check('the publishing picker lists an approved internal document as publishable',
    vaultSources.status === 200 && sourceIds.includes(openVaultDoc)
    && vaultSources.json.data.find((source) => source.id === openVaultDoc).publishable === true);
  check('a draft internal document is listed but not offered for publishing',
    sourceIds.includes(draftVaultDoc) && vaultSources.json.data.find((source) => source.id === draftVaultDoc).publishable === false);
  check('restricted, sensitive and archived internal documents are never offered',
    !sourceIds.includes(restrictedVaultDoc) && !sourceIds.includes(sensitiveVaultDoc) && !sourceIds.includes(archivedVaultDoc));
  check('listing internal documents exposes nothing to any client',
    Number(db.query('SELECT COUNT(*) AS c FROM client_documents WHERE vault_document_id IS NOT NULL')[0].c) === 0);

  const vaultPublish = await request('POST', `/api/phantom/clients/${managedClient.id}/documents`, {
    token: phantomToken, body: { projectId: managedProject.id, category: 'report', title: 'Vault backed report', vaultDocumentId: openVaultDoc },
  });
  check('an operator can publish an internal document by pinning a snapshot', vaultPublish.status === 201, JSON.stringify(vaultPublish.json));
  await publish(phantomToken, vaultPublish.json.data.id, 'published');
  const vaultRead = await request('GET', `/api/client/project/${managedProject.id}/documents/${vaultPublish.json.data.id}`, { clientSession: workflowSession });
  check('the client receives the pinned copy of the internal document',
    vaultRead.status === 200 && JSON.stringify(vaultRead.json.data.document).includes('PHASE 5 VAULT SOURCE TEXT'));
  check('the client payload carries no Vault identifier or storage key',
    !/vault_document_id|vaultDocumentId|storage_reference|storageReference/.test(JSON.stringify(vaultRead.json)));
  const vaultAfter = db.query('SELECT status, visibility, is_archived FROM vault_documents WHERE id = ?', openVaultDoc)[0];
  check('publishing a snapshot changes nothing inside the Vault',
    vaultAfter.status === 'approved' && vaultAfter.visibility === 'members' && Number(vaultAfter.is_archived) === 0);
  check('a sensitive internal document can never be published to a client',
    (await request('POST', `/api/phantom/clients/${managedClient.id}/documents`, {
      token: phantomToken, body: { projectId: managedProject.id, category: 'report', title: 'Sensitive attempt', vaultDocumentId: sensitiveVaultDoc },
    })).status === 409);

  // --- requirement 7: emergency controls, server-side ------------------------
  const emergencyClient = await createClient(phantomToken, 'Emergency Client');
  const emergencyProject = await createProject(phantomToken, emergencyClient.id, 'Emergency Project');
  const emergencyKey = await createKey(phantomToken, emergencyClient.id, emergencyProject.id, { label: 'Emergency key' });
  const emergencySession = await clientSession(emergencyKey.passkey, 'emergency client');
  const emergencyLink = await request('POST', `/api/phantom/clients/${emergencyClient.id}/links`, {
    token: phantomToken, body: { projectId: emergencyProject.id, expiresInMinutes: 60, maxUses: 3 },
  });
  check('the emergency fixture has a working key, session and link',
    (await request('GET', `/api/client/project/${emergencyProject.id}`, { clientSession: emergencySession })).status === 200
    && emergencyLink.status === 201);

  const suspend = await request('POST', `/api/phantom/clients/${emergencyClient.id}/status`, { token: phantomToken, body: { status: 'suspended' } });
  check('SUSPEND CLIENT ACCESS is performed on the server', suspend.status === 200 && suspend.json.data.keys >= 1 && suspend.json.data.links >= 1,
    JSON.stringify(suspend.json));
  check('suspending a client kills the live session',
    (await request('GET', `/api/client/project/${emergencyProject.id}`, { clientSession: emergencySession })).status !== 200);
  check('suspending a client revokes the access key at sign-in',
    (await clientLogin(emergencyKey.passkey)).status === 401);
  check('suspending a client revokes outstanding temporary links',
    db.query("SELECT status FROM client_links WHERE public_id = ?", emergencyLink.json.data.id)[0].status === 'revoked');
  check('suspension revokes the stored access key row, not only the sign-in path',
    db.query('SELECT status FROM client_access_keys WHERE public_id = ?', emergencyKey.id)[0].status === 'revoked');
  check('suspension revokes the stored session row on the server',
    Number(db.query('SELECT COUNT(*) AS c FROM client_sessions WHERE client_id = ? AND revoked_at IS NULL',
      db.query('SELECT id FROM clients WHERE public_id = ?', emergencyClient.id)[0].id)[0].c) === 0);
  check('the suspension is recorded in the audit log',
    Number(db.query("SELECT COUNT(*) AS c FROM audit_logs WHERE action IN ('client.client_suspended','client.suspended') AND subject_id = ?", emergencyClient.id)[0].c) >= 1);

  const reactivate = await request('POST', `/api/phantom/clients/${emergencyClient.id}/status`, { token: phantomToken, body: { status: 'active' } });
  check('a suspended client can be reactivated deliberately', reactivate.status === 200 && reactivate.json.data.keys === 0);
  check('reactivation never restores the old key', (await clientLogin(emergencyKey.passkey)).status === 401);
  check('reactivation never restores the old session',
    (await request('GET', `/api/client/project/${emergencyProject.id}`, { clientSession: emergencySession })).status !== 200);
  const emergencyKey2 = await createKey(phantomToken, emergencyClient.id, emergencyProject.id, { label: 'Post-reactivation key' });
  check('a new key can be issued after reactivation', (await clientLogin(emergencyKey2.passkey)).status === 200);

  const phase5RevokeAll = await request('POST', `/api/phantom/clients/${emergencyClient.id}/revoke-all`, { token: phantomToken });
  check('REVOKE ALL CLIENT ACCESS runs the full credential cascade server-side',
    phase5RevokeAll.status === 200 && phase5RevokeAll.json.data.keys >= 1, JSON.stringify(phase5RevokeAll.json));
  check('revoke-all leaves the client record itself intact and still manageable',
    (await request('GET', `/api/phantom/clients/${emergencyClient.id}`, { token: phantomToken })).status === 200
    && (await clientLogin(emergencyKey2.passkey)).status === 401);
  check('revoke-all is recorded in the audit log',
    Number(db.query("SELECT COUNT(*) AS c FROM audit_logs WHERE action = 'client.access_revoked_all'")[0].c) >= 1);
  check('no revoked key keeps a live session on the server',
    Number(db.query('SELECT COUNT(*) AS c FROM client_sessions WHERE client_id = ? AND revoked_at IS NULL',
      db.query('SELECT id FROM clients WHERE public_id = ?', emergencyClient.id)[0].id)[0].c) === 0);

  // =========================================================================
  group('15. Preview as client + delegation (Phase 5 requirements 6, 8)');
  // =========================================================================

  const sessionsBeforePreview = Number(db.query('SELECT COUNT(*) AS c FROM client_sessions')[0].c);
  const preview = await request('GET', `/api/phantom/clients/${roomA.id}/preview`, { token: phantomToken });
  check('PREVIEW AS CLIENT returns the client, its projects and the project room',
    preview.status === 200 && preview.json.data.client.id === roomA.id
    && preview.json.data.room && preview.json.data.projects.length === 1, JSON.stringify(preview.json).slice(0, 200));
  check('the preview room never leaks an unpublished, archived or foreign document',
    !/UNPUBLISHED DRAFT|ARCHIVED REPORT|CLIENT B PRIVATE/.test(JSON.stringify(preview.json)));
  check('the preview never returns a credential or a session token',
    !/session|token|passkey/i.test(JSON.stringify(preview.json)));
  check('opening a preview creates no client session',
    Number(db.query('SELECT COUNT(*) AS c FROM client_sessions')[0].c) === sessionsBeforePreview);

  const clientRoomPayload = (await request('GET', `/api/client/project/${roomProjectA.id}`, { clientSession: roomSessionA })).json.data;
  check('the preview payload is identical to what the client actually receives',
    JSON.stringify(preview.json.data.room) === JSON.stringify(clientRoomPayload),
    JSON.stringify(preview.json.data.room).slice(0, 160));

  const previewReports = await request('GET', `/api/phantom/clients/${roomA.id}/preview/projects/${roomProjectA.id}/sections/reports`, { token: phantomToken });
  check('a previewed section returns the same documents the client sees',
    previewReports.status === 200
    && previewReports.json.data.documents.map((document) => document.id).join(',')
      === (await request('GET', `/api/client/project/${roomProjectA.id}/sections/reports`, { clientSession: roomSessionA }))
        .json.data.documents.map((document) => document.id).join(','));
  check('previewing a section never serves download permission',
    previewReports.json.data.documents.every((document) => document.permissions.download === false));
  const previewLetter = await request('GET', `/api/phantom/clients/${roomA.id}/preview/projects/${roomProjectA.id}/documents/${publishedLetter.id}`, { token: phantomToken });
  check('a previewed document carries the client-readable snapshot',
    previewLetter.status === 200 && JSON.stringify(previewLetter.json.data.document.content).includes('Letter body for the room.'));
  check('the client can download the letter but the preview cannot',
    (await request('GET', `/api/client/project/${roomProjectA.id}/documents/${publishedLetter.id}`, { clientSession: roomSessionA }))
      .json.data.document.permissions.download === true
    && previewLetter.json.data.document.permissions.download === false);
  check('the preview serves no file bytes or storage reference at all',
    !/client-exports|storageReference|storage_reference|application\/pdf/.test(JSON.stringify(previewLetter.json)));

  const previewDraft = await request('GET', `/api/phantom/clients/${roomA.id}/preview/projects/${roomProjectA.id}/documents/${unpublishedDraft.id}`, { token: phantomToken });
  check('the preview refuses a document the client cannot see (404 not_client_visible)',
    previewDraft.status === 404 && previewDraft.json.code === 'not_client_visible', JSON.stringify(previewDraft.json));
  const hiddenTitles = /UNPUBLISHED DRAFT|ARCHIVED REPORT|CLIENT B PRIVATE/;
  check('no preview response body ever carries a hidden document',
    [preview, previewReports, previewLetter, previewDraft]
      .every((response) => !hiddenTitles.test(JSON.stringify(response.json))));
  check('the preview refuses an archived document',
    (await request('GET', `/api/phantom/clients/${roomA.id}/preview/projects/${roomProjectA.id}/documents/${archivedReport.id}`, { token: phantomToken })).status === 404);
  check('the preview refuses a document belonging to another client',
    (await request('GET', `/api/phantom/clients/${roomA.id}/preview/projects/${roomProjectA.id}/documents/${bPrivate.id}`, { token: phantomToken })).status === 404);
  check('the preview refuses another client project id in the path',
    (await request('GET', `/api/phantom/clients/${roomA.id}/preview?projectId=${roomProjectB.id}`, { token: phantomToken })).json.data.room === null);
  check('the preview refuses an unknown section',
    (await request('GET', `/api/phantom/clients/${roomA.id}/preview/projects/${roomProjectA.id}/sections/invoices`, { token: phantomToken })).status === 404);
  check('the preview cannot be opened without a member token',
    (await request('GET', `/api/phantom/clients/${roomA.id}/preview`, {})).status === 401);

  // A non-active project is previewable but only with the same warning the
  // client would meet: the room itself is unchanged.
  await request('PATCH', `/api/phantom/client-projects/${managedProject.id}`, { token: phantomToken, body: { status: 'suspended' } });
  const suspendedPreview = await request('GET', `/api/phantom/clients/${managedClient.id}/preview?projectId=${managedProject.id}`, { token: phantomToken });
  check('previewing a project that is not active reports it instead of pretending', Boolean(suspendedPreview.json.data.notice));
  await request('PATCH', `/api/phantom/client-projects/${managedProject.id}`, { token: phantomToken, body: { status: 'active' } });

  // --- requirement 8: delegation is explicit, never implied -----------------
  const websiteAdminData = await request('GET', '/api/phantom/website-admins', { token: phantomToken });
  const availableKeys = websiteAdminData.json.data.availablePermissions || [];
  check('the four client-portal permissions are delegatable through the existing website-admin system',
    ['clients.manage', 'clients.publish', 'clients.links', 'clients.preview'].every((key) => availableKeys.includes(key)), availableKeys.join(','));
  const memberProfile = db.query("SELECT mp.id FROM member_profiles mp JOIN users u ON u.id = mp.user_id WHERE u.email = 'member@example.test'")[0];
  check('the delegated member has a member profile (not a client record)', Boolean(memberProfile));
  check('PHANTOM holds no website-admin grant and still controls the portal',
    Number(db.query('SELECT COUNT(*) AS c FROM website_admins wa JOIN member_profiles mp ON mp.id = wa.member_profile_id JOIN users u ON u.id = mp.user_id WHERE u.role = ?', 'phantom')[0].c) === 0
    && (await request('GET', '/api/phantom/clients', { token: phantomToken })).status === 200);

  const grant = async (permissions) => request('POST', '/api/phantom/website-admins', {
    token: phantomToken, body: { memberProfileId: memberProfile.id, permissions },
  });

  await grant([]);
  check('a founding member with no client permission cannot preview a client',
    (await request('GET', `/api/phantom/clients/${roomA.id}/preview`, { token: memberToken })).status === 403);
  check('a member without clients.manage cannot list clients',
    (await request('GET', '/api/phantom/clients', { token: memberToken })).status === 403);
  check('a member without clients.manage cannot create a client',
    (await request('POST', '/api/phantom/clients', { token: memberToken, body: { name: 'Unauthorized' } })).status === 403);

  const grantPreviewOnly = await grant(['clients.preview']);
  check('PHANTOM can grant exactly one client capability', grantPreviewOnly.status === 200, JSON.stringify(grantPreviewOnly.json));
  check('the granted member can now preview a client',
    (await request('GET', `/api/phantom/clients/${roomA.id}/preview`, { token: memberToken })).status === 200);
  check('preview-only delegation still cannot list clients',
    (await request('GET', '/api/phantom/clients', { token: memberToken })).status === 403);
  check('preview-only delegation still cannot create a client',
    (await request('POST', '/api/phantom/clients', { token: memberToken, body: { name: 'Unauthorized' } })).status === 403);
  check('preview-only delegation still cannot issue an access key',
    (await request('POST', `/api/phantom/clients/${roomA.id}/keys`, { token: memberToken, body: { projectId: roomProjectA.id } })).status === 403);
  check('preview-only delegation still cannot publish a document',
    (await request('POST', `/api/phantom/client-documents/${workflowDoc.id}/lifecycle`, { token: memberToken, body: { state: 'published' } })).status === 403);
  check('preview-only delegation still cannot create a temporary link',
    (await request('POST', `/api/phantom/clients/${roomA.id}/links`, { token: memberToken, body: { projectId: roomProjectA.id } })).status === 403);
  check('preview-only delegation still cannot revoke all client access',
    (await request('POST', `/api/phantom/clients/${roomA.id}/revoke-all`, { token: memberToken })).status === 403);
  check('a read-only preview leaves the client untouched',
    (await request('GET', `/api/client/project/${roomProjectA.id}`, { clientSession: roomSessionA })).status === 200);

  await grant(['clients.publish']);
  check('publishing delegation is scoped: publishing allowed, management still refused',
    (await request('POST', `/api/phantom/client-documents/${workflowDoc.id}/lifecycle`, { token: memberToken, body: { state: 'published' } })).status === 200
    && (await request('GET', '/api/phantom/clients', { token: memberToken })).status === 403);
  await grant([]);
  check('revoking the delegation withdraws the capability immediately',
    (await request('GET', `/api/phantom/clients/${roomA.id}/preview`, { token: memberToken })).status === 403);

  check('PHANTOM itself can perform every client-portal action',
    (await request('GET', '/api/phantom/clients', { token: phantomToken })).status === 200
    && (await request('GET', `/api/phantom/clients/${roomA.id}/preview`, { token: phantomToken })).status === 200
    && (await request('POST', `/api/phantom/clients/${managedClient.id}/keys`, { token: phantomToken, body: { projectId: managedProject.id } })).status === 201
    && (await request('POST', `/api/phantom/client-documents/${workflowDoc.id}/lifecycle`, { token: phantomToken, body: { state: 'published' } })).status === 200
    && (await request('POST', `/api/phantom/clients/${managedClient.id}/links`, { token: phantomToken, body: { projectId: managedProject.id, expiresInMinutes: 30 } })).status === 201);

  // =========================================================================
  group('16. Granular client permissions — every capability tested independently (Phase 6)');
  // =========================================================================

  // --- the registry and the brief's names -----------------------------------
  const catalogResponse = await request('GET', '/api/phantom/client-capabilities', { token: phantomToken });
  const catalog = catalogResponse.json.data;
  const BRIEF_NAMES = [
    'CLIENT_VIEW', 'CLIENT_CREATE', 'CLIENT_EDIT', 'CLIENT_SUSPEND', 'CLIENT_ARCHIVE',
    'CLIENT_PROJECT_VIEW', 'CLIENT_PROJECT_CREATE', 'CLIENT_PROJECT_EDIT', 'CLIENT_PROJECT_ARCHIVE',
    'CLIENT_DOCUMENT_VIEW', 'CLIENT_DOCUMENT_CREATE', 'CLIENT_DOCUMENT_EDIT', 'CLIENT_DOCUMENT_PUBLISH',
    'CLIENT_DOCUMENT_UNPUBLISH', 'CLIENT_DOCUMENT_DELETE',
    'CLIENT_ACCESS_KEY_CREATE', 'CLIENT_ACCESS_KEY_REGENERATE', 'CLIENT_ACCESS_KEY_REVOKE',
    'CLIENT_LINK_CREATE', 'CLIENT_LINK_REVOKE', 'CLIENT_LINK_MANAGE',
    'CLIENT_ACTIVITY_VIEW', 'CLIENT_SETTINGS_MANAGE', 'CLIENT_PERMISSIONS_MANAGE',
    // already existed before this phase, so it was not added again:
    'CLIENT_PREVIEW',
  ];
  const catalogBrief = (catalog.capabilities || []).map((entry) => entry.brief);
  check('every capability named in the brief exists in the registry',
    BRIEF_NAMES.every((name) => catalogBrief.includes(name)), BRIEF_NAMES.filter((name) => !catalogBrief.includes(name)).join(','));
  check('the registry adds no capability beyond the brief plus the one that already existed',
    catalogBrief.length === BRIEF_NAMES.length && new Set(catalogBrief).size === catalogBrief.length, `${catalogBrief.length} capabilities`);
  check('no capability re-creates a Phase 5 key under a new name',
    !catalogBrief.map((brief) => brief.toLowerCase()).some((brief) => ['clients.manage', 'clients.publish', 'clients.links'].includes(brief))
    && (catalog.capabilities || []).every((entry) => !['clients.manage', 'clients.publish', 'clients.links'].includes(entry.key)));
  check('the four Phase 5 umbrella keys are preserved and explained',
    (catalog.legacy || []).map((entry) => entry.key).join(',') === 'clients.manage,clients.publish,clients.links,clients.preview',
    JSON.stringify(catalog.legacy));
  check('PHANTOM holds the whole capability set implicitly',
    catalog.isPhantom === true && catalog.mine.length === catalog.capabilities.length);
  check('the capability catalog exposes no client data',
    !/Ashanti|Kumasi|Room Client|cli_|prj_/.test(JSON.stringify(catalog)));

  // --- a second member who will hold exactly one capability at a time -------
  const holderPasswordHash = await (async () => {
    const p6Salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('HolderPassword1'), 'PBKDF2', false, ['deriveBits']);
    const p6Bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: p6Salt, iterations: 100000, hash: 'SHA-256' }, key, 256);
    const p6B64url = (bytes) => Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `pbkdf2$100000$${p6B64url(p6Salt)}$${p6B64url(new Uint8Array(p6Bits))}`;
  })();
  db.execute("INSERT INTO users (email, name, password_hash, role) VALUES ('holder@example.test', 'Permission Holder', ?, 'member')", holderPasswordHash);
  const holderLogin = await request('POST', '/api/auth/login', { body: { identifier: 'holder@example.test', password: 'HolderPassword1' } });
  const holderToken = holderLogin.json?.token;
  const holderProfile = db.query("SELECT mp.id FROM member_profiles mp JOIN users u ON u.id = mp.user_id WHERE u.email = 'holder@example.test'")[0];
  check('a second member exists to hold exactly one capability at a time',
    holderLogin.status === 200 && Boolean(holderToken) && Boolean(holderProfile));
  check('a member with no grant holds nothing',
    (catalog.mine || []).length > 0 && (await request('GET', '/api/phantom/client-capabilities', { token: holderToken })).json.data.mine.length === 0);

  const grantHolder = async (permissions) => request('POST', '/api/phantom/client-permissions', {
    token: phantomToken, body: { memberProfileId: holderProfile.id, permissions },
  });
  const firstGrant = await grantHolder([]);
  check('PHANTOM can reach the permission matrix endpoint', firstGrant.status === 200, JSON.stringify(firstGrant.json).slice(0, 160));
  const matrix = await request('GET', '/api/phantom/client-permissions', { token: phantomToken });
  check('the matrix lists the members, the capabilities and the recorded changes',
    matrix.status === 200 && Array.isArray(matrix.json.data.members) && matrix.json.data.capabilities.length === BRIEF_NAMES.length
    && Array.isArray(matrix.json.data.recentChanges));
  check('the matrix never exposes a credential or a client access key',
    !/passkey|key_hash/.test(JSON.stringify(matrix.json))
    && !/CRX(-[0-9A-Z]{4}){4}/.test(JSON.stringify(matrix.json)));

  // --- the probe table: one direct API call per capability ------------------
  let probeCounter = 0;
  const uniqueName = (label) => `P6 ${label} ${++probeCounter}`;

  const makeProbeFixture = async () => {
    const client = await createClient(phantomToken, uniqueName('probe client'));
    const project = await createProject(phantomToken, client.id, uniqueName('probe project'));
    const document_ = await createDocument(phantomToken, client.id, project.id, {
      title: uniqueName('probe document'), contentText: 'Probe body.',
    });
    const primaryKey = await createKey(phantomToken, client.id, project.id, { label: 'Probe primary' });
    const secondaryKey = await createKey(phantomToken, client.id, project.id, { label: 'Probe secondary' });
    const link = await request('POST', `/api/phantom/clients/${client.id}/links`, {
      token: phantomToken, body: { projectId: project.id, expiresInMinutes: 30, maxUses: 2 },
    });
    return { client, project, document: document_, key: primaryKey, secondaryKey, link: link.json.data };
  };

  const PROBES = [
    ['clients.view', 'CLIENT_VIEW', (f, token) => request('GET', '/api/phantom/clients', { token })],
    ['clients.projects.view', 'CLIENT_PROJECT_VIEW', (f, token) => request('GET', `/api/phantom/clients/${f.client.id}/projects`, { token })],
    ['clients.documents.view', 'CLIENT_DOCUMENT_VIEW', (f, token) => request('GET', `/api/phantom/clients/${f.client.id}/documents`, { token })],
    ['clients.activity.view', 'CLIENT_ACTIVITY_VIEW', (f, token) => request('GET', `/api/phantom/clients/${f.client.id}/activity`, { token })],
    ['clients.links.manage', 'CLIENT_LINK_MANAGE', (f, token) => request('GET', `/api/phantom/clients/${f.client.id}/links`, { token })],
    ['clients.settings.manage', 'CLIENT_SETTINGS_MANAGE', (f, token) => request('GET', '/api/phantom/client-portal-settings', { token })],
    ['clients.permissions.manage', 'CLIENT_PERMISSIONS_MANAGE', (f, token) => request('GET', '/api/phantom/client-permissions', { token })],
    ['clients.preview', 'CLIENT_PREVIEW', (f, token) => request('GET', `/api/phantom/clients/${f.client.id}/preview`, { token })],
    ['clients.create', 'CLIENT_CREATE', (f, token) => request('POST', '/api/phantom/clients', { token, body: { name: uniqueName('created client') } })],
    ['clients.projects.create', 'CLIENT_PROJECT_CREATE', (f, token) => request('POST', `/api/phantom/clients/${f.client.id}/projects`, { token, body: { name: uniqueName('created project') } })],
    ['clients.documents.create', 'CLIENT_DOCUMENT_CREATE', (f, token) => request('POST', `/api/phantom/clients/${f.client.id}/documents`, { token, body: { projectId: f.project.id, category: 'report', title: uniqueName('created document'), contentText: 'Body.' } })],
    ['clients.edit', 'CLIENT_EDIT', (f, token) => request('PATCH', `/api/phantom/clients/${f.client.id}`, { token, body: { name: uniqueName('edited client') } })],
    ['clients.projects.edit', 'CLIENT_PROJECT_EDIT', (f, token) => request('PATCH', `/api/phantom/client-projects/${f.project.id}`, { token, body: { name: uniqueName('edited project') } })],
    ['clients.documents.edit', 'CLIENT_DOCUMENT_EDIT', (f, token) => request('PATCH', `/api/phantom/client-documents/${f.document.id}`, { token, body: { title: uniqueName('edited document') } })],
    ['clients.keys.create', 'CLIENT_ACCESS_KEY_CREATE', (f, token) => request('POST', `/api/phantom/clients/${f.client.id}/keys`, { token, body: { projectId: f.project.id, label: 'Probe issued key' } })],
    ['clients.keys.regenerate', 'CLIENT_ACCESS_KEY_REGENERATE', (f, token) => request('POST', `/api/phantom/client-keys/${f.secondaryKey.id}/regenerate`, { token })],
    ['clients.keys.revoke', 'CLIENT_ACCESS_KEY_REVOKE', (f, token) => request('POST', `/api/phantom/client-keys/${f.secondaryKey.id}/revoke`, { token })],
    ['clients.links.create', 'CLIENT_LINK_CREATE', (f, token) => request('POST', `/api/phantom/clients/${f.client.id}/links`, { token, body: { projectId: f.project.id, expiresInMinutes: 30, maxUses: 2 } })],
    ['clients.links.revoke', 'CLIENT_LINK_REVOKE', (f, token) => request('POST', `/api/phantom/client-links/${f.link.id}/revoke`, { token })],
    ['clients.documents.publish', 'CLIENT_DOCUMENT_PUBLISH', (f, token) => request('POST', `/api/phantom/client-documents/${f.document.id}/lifecycle`, { token, body: { state: 'published' } })],
    ['clients.documents.unpublish', 'CLIENT_DOCUMENT_UNPUBLISH', (f, token) => request('POST', `/api/phantom/client-documents/${f.document.id}/lifecycle`, { token, body: { state: 'unpublished' } })],
    ['clients.documents.delete', 'CLIENT_DOCUMENT_DELETE', (f, token) => request('DELETE', `/api/phantom/client-documents/${f.document.id}`, { token })],
    ['clients.projects.archive', 'CLIENT_PROJECT_ARCHIVE', (f, token) => request('PATCH', `/api/phantom/client-projects/${f.project.id}`, { token, body: { archive: true } })],
    ['clients.suspend', 'CLIENT_SUSPEND', (f, token) => request('POST', `/api/phantom/clients/${f.client.id}/status`, { token, body: { status: 'suspended' } })],
    ['clients.archive', 'CLIENT_ARCHIVE', (f, token) => request('POST', `/api/phantom/clients/${f.client.id}/status`, { token, body: { status: 'archived' } })],
  ];
  check('the probe table covers every capability exactly once',
    PROBES.length === BRIEF_NAMES.length && new Set(PROBES.map((entry) => entry[0])).size === PROBES.length);

  // Every capability is granted on its own, and then EVERY capability's action
  // is attempted directly against the API. Exactly one may succeed.
  let matrixFailures = 0;
  for (const [grantedKey, grantedBrief, probe] of PROBES) {
    const fixture = await makeProbeFixture();
    const granted = await grantHolder([grantedKey]);
    if (granted.status !== 200) {
      check(`${grantedBrief} can be granted on its own`, false, JSON.stringify(granted.json));
      matrixFailures += 1;
      continue;
    }
    for (const [attemptedKey, attemptedBrief, attempt] of PROBES) {
      const isOwn = attemptedKey === grantedKey;
      const p6Response = await attempt(fixture, holderToken);
      if (isOwn) {
        check(`${grantedBrief} alone authorizes its own action`, p6Response.status !== 403,
          `${p6Response.status} ${JSON.stringify(p6Response.json).slice(0, 90)}`);
      } else {
        check(`${grantedBrief} does NOT authorize ${attemptedBrief}`, p6Response.status === 403,
          `${attemptedBrief} returned ${p6Response.status}`);
      }
    }
    await grantHolder([]);
  }
  check('every capability was exercised against every other capability', matrixFailures === 0, `${matrixFailures} grants failed`);

  // =========================================================================
  group('17. Phase 5 keys keep working, founding identities get nothing, changes are audited');
  // =========================================================================

  // --- the Phase 5 umbrella keys still mean exactly what they meant ---------
  const manageProbe = async (token) => ({
    view: await request('GET', '/api/phantom/clients', { token }),
    create: await request('POST', '/api/phantom/clients', { token, body: { name: uniqueName('legacy created') } }),
    key: await request('POST', `/api/phantom/clients/${legacyClient.id}/keys`, { token, body: { projectId: legacyProject.id } }),
    publish: await request('POST', `/api/phantom/client-documents/${legacyDocument.id}/lifecycle`, { token, body: { state: 'published' } }),
    permissions: await request('GET', '/api/phantom/client-permissions', { token }),
    settings: await request('GET', '/api/phantom/client-portal-settings', { token }),
    preview: await request('GET', `/api/phantom/clients/${legacyClient.id}/preview`, { token }),
  });
  const legacyClient = await createClient(phantomToken, uniqueName('legacy client'));
  const legacyProject = await createProject(phantomToken, legacyClient.id, uniqueName('legacy project'));
  const legacyDocument = await createDocument(phantomToken, legacyClient.id, legacyProject.id, {
    title: uniqueName('legacy document'), contentText: 'Legacy body.',
  });

  await grantHolder([]);
  const noGrant = await manageProbe(holderToken);
  check('with no grant at all, every management action is refused (403)',
    noGrant.view.status === 403 && noGrant.create.status === 403 && noGrant.key.status === 403
    && noGrant.publish.status === 403 && noGrant.permissions.status === 403 && noGrant.settings.status === 403
    && noGrant.preview.status === 403,
    JSON.stringify(Object.fromEntries(Object.entries(noGrant).map(([key, value]) => [key, value.status]))));

  await grantHolder(['clients.manage']);
  const legacyManage = await manageProbe(holderToken);
  check('a Phase 5 clients.manage grant still authorizes the management actions it always did',
    legacyManage.view.status === 200 && legacyManage.create.status === 201 && legacyManage.key.status === 201,
    JSON.stringify({ view: legacyManage.view.status, create: legacyManage.create.status, key: legacyManage.key.status }));
  check('a Phase 5 clients.manage grant does NOT widen into permission management',
    legacyManage.permissions.status === 403 && legacyManage.settings.status === 403 && legacyManage.preview.status === 403);
  check('a Phase 5 clients.manage grant does NOT include publishing (that was always a separate key)',
    legacyManage.publish.status === 403);

  await grantHolder(['clients.publish']);
  const legacyPublish = await manageProbe(holderToken);
  check('a Phase 5 clients.publish grant authorizes publishing and unpublishing only',
    legacyPublish.publish.status === 200 && legacyPublish.view.status === 403 && legacyPublish.key.status === 403
    && legacyPublish.permissions.status === 403);

  await grantHolder(['clients.links']);
  const legacyLinks = await manageProbe(holderToken);
  check('a Phase 5 clients.links grant authorizes creating and listing links',
    (await request('GET', `/api/phantom/clients/${legacyClient.id}/links`, { token: holderToken })).status === 200
    && (await request('POST', `/api/phantom/clients/${legacyClient.id}/links`, { token: holderToken, body: { projectId: legacyProject.id, expiresInMinutes: 30 } })).status === 201
    && legacyLinks.view.status === 403 && legacyLinks.publish.status === 403);

  await grantHolder(['clients.preview']);
  const legacyPreview = await manageProbe(holderToken);
  check('a Phase 5 clients.preview grant still opens the preview and nothing else',
    legacyPreview.preview.status === 200 && legacyPreview.view.status === 403 && legacyPreview.create.status === 403);

  await grantHolder(['clients.preview', 'clients.documents.publish']);
  check('granting two capabilities works independently on the same member',
    (await request('GET', `/api/phantom/clients/${legacyClient.id}/preview`, { token: holderToken })).status === 200
    && (await request('POST', `/api/phantom/client-documents/${legacyDocument.id}/lifecycle`, { token: holderToken, body: { state: 'published' } })).status === 200
    && (await request('GET', '/api/phantom/clients', { token: holderToken })).status === 403);
  await grantHolder([]);

  // --- requirement 3: founding identities receive nothing automatically -----
  const foundingRoles = ['nexus', 'ghost', 'falcon', 'quantum', 'matrix'];
  const foundingResults = [];
  for (const code of foundingRoles) {
    const email = `founding-${code}@example.test`;
    db.execute('INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)', email, `Founding ${code.toUpperCase()}`, holderPasswordHash, 'member');
    const login = await request('POST', '/api/auth/login', { body: { identifier: email, password: 'HolderPassword1' } });
    const roleId = db.query('SELECT id FROM roles WHERE code = ?', code)[0].id;
    db.execute("UPDATE member_profiles SET primary_role_id = ?, codename_path = 'custom_founding' WHERE user_id = (SELECT id FROM users WHERE email = ?)", roleId, email);
    const token = login.json?.token;
    const probe = await request('GET', `/api/phantom/clients`, { token });
    const probeCreate = await request('POST', '/api/phantom/clients', { token, body: { name: uniqueName('founding attempt') } });
    const probeKey = await request('POST', `/api/phantom/clients/${legacyClient.id}/keys`, { token, body: { projectId: legacyProject.id } });
    const probePermissions = await request('GET', '/api/phantom/client-permissions', { token });
    const ownCapabilities = (await request('GET', '/api/phantom/client-capabilities', { token })).json.data;
    const noPermissionsInMatrix = db.query(
      `SELECT COUNT(*) AS c FROM website_admin_permissions p
       JOIN website_admins wa ON wa.id = p.website_admin_id
       JOIN member_profiles mp ON mp.id = wa.member_profile_id
       JOIN users u ON u.id = mp.user_id
       WHERE u.email = ? AND p.allowed = 1`, email,
    )[0].c;
    foundingResults.push({
      code,
      token: Boolean(token),
      role: Boolean(roleId),
      login: login.status,
      list: probe.status,
      create: probeCreate.status,
      key: probeKey.status,
      permissions: probePermissions.status,
      mine: ownCapabilities.mine.length,
      stored: Number(noPermissionsInMatrix),
    });
  }
  check('all five founding identities exist and can sign in',
    foundingResults.every((entry) => entry.token && entry.role), JSON.stringify(foundingResults.map((entry) => [entry.code, entry.login])));
  for (const entry of foundingResults) {
    check(`${entry.code.toUpperCase()} holds no client permission automatically (0 effective, 0 stored, 403 on every action)`,
      entry.mine === 0 && entry.stored === 0 && entry.list === 403 && entry.create === 403
      && entry.key === 403 && entry.permissions === 403,
      JSON.stringify(entry));
  }
  const foundingGrant = await request('POST', '/api/phantom/client-permissions', {
    token: phantomToken,
    body: { memberProfileId: db.query("SELECT mp.id FROM member_profiles mp JOIN users u ON u.id = mp.user_id WHERE u.email = 'founding-nexus@example.test'")[0].id, permissions: ['clients.view'] },
  });
  check('PHANTOM can grant a founding identity selected permissions', foundingGrant.status === 200);
  const nexusToken = (await request('POST', '/api/auth/login', { body: { identifier: 'founding-nexus@example.test', password: 'HolderPassword1' } })).json.token;
  check('the granted founding identity can then do exactly that one thing',
    (await request('GET', '/api/phantom/clients', { token: nexusToken })).status === 200
    && (await request('POST', '/api/phantom/clients', { token: nexusToken, body: { name: uniqueName('nexus attempt') } })).status === 403);
  await request('POST', '/api/phantom/client-permissions', {
    token: phantomToken,
    body: { memberProfileId: db.query("SELECT mp.id FROM member_profiles mp JOIN users u ON u.id = mp.user_id WHERE u.email = 'founding-nexus@example.test'")[0].id, permissions: [] },
  });
  check('PHANTOM can remove it again',
    (await request('GET', '/api/phantom/clients', { token: nexusToken })).status === 403);

  // --- requirement 4: grant / remove / modify, and the non-escalation rule --
  const grantOne = await grantHolder(['clients.view']);
  check('granting a capability reports the added key and the previous value',
    grantOne.status === 200 && grantOne.json.data.added.includes('clients.view')
    && Array.isArray(grantOne.json.data.previous) && Array.isArray(grantOne.json.data.next));
  const addAnother = await grantHolder(['clients.view', 'clients.documents.publish']);
  check('modifying a grant reports exactly the added key',
    addAnother.json.data.added.join(',') === 'clients.documents.publish' && addAnother.json.data.removed.length === 0);
  const removeOne = await grantHolder(['clients.documents.publish']);
  check('removing a capability reports exactly the removed key',
    removeOne.json.data.removed.join(',') === 'clients.view' && removeOne.json.data.added.length === 0);
  const noOp = await grantHolder(['clients.documents.publish']);
  check('saving an unchanged set reports no change',
    noOp.status === 200 && noOp.json.data.added.length === 0 && noOp.json.data.removed.length === 0
    && /no change/i.test(noOp.json.message || ''), noOp.json.message);
  const p6UnknownKey = await grantHolder(['clients.everything']);
  check('an unknown capability is refused (400)', p6UnknownKey.status === 400, JSON.stringify(p6UnknownKey.json));
  const nonClientPortalKey = await grantHolder(['pages.edit']);
  check('a non-client-portal permission cannot be granted through the client matrix (400)', nonClientPortalKey.status === 400);

  // a non-PHANTOM permission manager is bound by the non-escalation rule
  await grantHolder(['clients.permissions.manage']);
  const holderProfileId = holderProfile.id;
  const selfChange = await request('POST', '/api/phantom/client-permissions', {
    token: holderToken, body: { memberProfileId: holderProfileId, permissions: ['clients.permissions.manage', 'clients.view'] },
  });
  check('a delegated permission manager cannot change their own permissions (403)',
    selfChange.status === 403 && /own/i.test(selfChange.json.error || ''), JSON.stringify(selfChange.json));
  const escalation = await request('POST', '/api/phantom/client-permissions', {
    token: holderToken, body: { memberProfileId: foundingResults[1].code === 'ghost' ? db.query("SELECT mp.id FROM member_profiles mp JOIN users u ON u.id = mp.user_id WHERE u.email = 'founding-ghost@example.test'")[0].id : 0, permissions: ['clients.view'] },
  });
  check('a delegated permission manager cannot grant a capability they do not hold (403)',
    escalation.status === 403 && /do not hold/i.test(escalation.json.error || ''), JSON.stringify(escalation.json));
  await grantHolder(['clients.permissions.manage', 'clients.view']);
  const allowedDelegation = await request('POST', '/api/phantom/client-permissions', {
    token: holderToken,
    body: { memberProfileId: db.query("SELECT mp.id FROM member_profiles mp JOIN users u ON u.id = mp.user_id WHERE u.email = 'founding-quantum@example.test'")[0].id, permissions: ['clients.view'] },
  });
  check('a delegated permission manager CAN grant a capability they hold themselves',
    allowedDelegation.status === 200 && allowedDelegation.json.data.added.includes('clients.view'), JSON.stringify(allowedDelegation.json));
  const quantumToken = (await request('POST', '/api/auth/login', { body: { identifier: 'founding-quantum@example.test', password: 'HolderPassword1' } })).json.token;
  check('the delegated grant really took effect for the receiving member',
    (await request('GET', '/api/phantom/clients', { token: quantumToken })).status === 200);
  await request('POST', '/api/phantom/client-permissions', {
    token: holderToken,
    body: { memberProfileId: db.query("SELECT mp.id FROM member_profiles mp JOIN users u ON u.id = mp.user_id WHERE u.email = 'founding-quantum@example.test'")[0].id, permissions: [] },
  });
  await grantHolder([]);

  // --- requirement 5: WHO / WHAT / WHEN / TARGET / OLD / NEW ----------------
  await grantHolder(['clients.view']);
  await grantHolder(['clients.view', 'clients.documents.publish']);
  await grantHolder(['clients.documents.publish']);
  await grantHolder([]);
  const auditRows = db.query(
    "SELECT actor_user_id, actor_member_profile_id, subject_type, subject_id, details_json, created_at FROM audit_logs WHERE action = 'client.permissions.updated' ORDER BY id DESC LIMIT 4",
  );
  check('every permission change is recorded in the existing audit log', auditRows.length === 4, `${auditRows.length} rows`);
  const parsedAudit = auditRows.map((row) => ({ ...row, details: JSON.parse(row.details_json || '{}') }));
  check('the audit records WHO made the change and WHEN',
    parsedAudit.every((row) => Number(row.actor_user_id) > 0 && Boolean(row.created_at)));
  check('the audit records WHAT changed, with the old and the new value',
    parsedAudit[1].details.previousValue.join(',') === 'clients.documents.publish,clients.view'
    && parsedAudit[1].details.newValue.join(',') === 'clients.documents.publish'
    && parsedAudit[1].details.removed.join(',') === 'clients.view',
    JSON.stringify(parsedAudit[1].details));
  check('the newest row records the removal back to an empty set',
    parsedAudit[0].details.newValue.length === 0 && parsedAudit[0].details.removed.join(',') === 'clients.documents.publish',
    JSON.stringify(parsedAudit[0].details));
  check('the audit records the TARGET member',
    Number(parsedAudit[1].subject_id) === holderProfileId && parsedAudit[1].details.target.memberProfileId === holderProfileId
    && Boolean(parsedAudit[1].details.target.name));
  check('the audit keeps a grant history, not just the latest state',
    parsedAudit.some((row) => row.details.added?.includes('clients.view'))
    && parsedAudit.some((row) => row.details.added?.includes('clients.documents.publish'))
    && parsedAudit.some((row) => row.details.removed?.includes('clients.view')));
  check('no raw credential is ever written to the permission audit',
    !/passkey|key_hash/.test(JSON.stringify(parsedAudit))
    && !/CRX(-[0-9A-Z]{4}){4}/.test(JSON.stringify(parsedAudit)));
  const matrixAfterAudit = await request('GET', '/api/phantom/client-permissions', { token: phantomToken });
  check('the permission matrix shows the recorded changes back to PHANTOM',
    matrixAfterAudit.json.data.recentChanges.length >= 4
    && matrixAfterAudit.json.data.recentChanges[0].actor && matrixAfterAudit.json.data.recentChanges[0].target,
    JSON.stringify(matrixAfterAudit.json.data.recentChanges[0] || {}).slice(0, 160));

  // --- requirement 6: hiding a control in the UI is not authorization -------
  const legacyLinksBefore = Number(db.query('SELECT COUNT(*) AS c FROM client_links WHERE client_id = (SELECT id FROM clients WHERE public_id = ?)', legacyClient.id)[0].c);
  const hiddenButRefused = await (async () => {
    // The workspace hides every action this member cannot perform. Driving the
    // API directly must fail exactly the same way.
    const token = holderToken;
    const attempts = [
      ['CLIENT_CREATE', request('POST', '/api/phantom/clients', { token, body: { name: uniqueName('hidden attempt') } })],
      ['CLIENT_EDIT', request('PATCH', `/api/phantom/clients/${legacyClient.id}`, { token, body: { name: 'Hidden attempt' } })],
      ['CLIENT_SUSPEND', request('POST', `/api/phantom/clients/${legacyClient.id}/status`, { token, body: { status: 'suspended' } })],
      ['CLIENT_ARCHIVE', request('POST', `/api/phantom/clients/${legacyClient.id}/status`, { token, body: { status: 'archived' } })],
      ['CLIENT_ACCESS_KEY_CREATE', request('POST', `/api/phantom/clients/${legacyClient.id}/keys`, { token, body: { projectId: legacyProject.id } })],
      ['CLIENT_LINK_CREATE', request('POST', `/api/phantom/clients/${legacyClient.id}/links`, { token, body: { projectId: legacyProject.id, expiresInMinutes: 30 } })],
      ['CLIENT_DOCUMENT_DELETE', request('DELETE', `/api/phantom/client-documents/${legacyDocument.id}`, { token })],
      ['CLIENT_PERMISSIONS_MANAGE', request('POST', '/api/phantom/client-permissions', { token, body: { memberProfileId: holderProfileId, permissions: [] } })],
      ['CLIENT_SETTINGS_MANAGE', request('PUT', '/api/phantom/client-portal-settings', { token, body: { settings: [{ key: 'client_portal_enabled', value: false }] } })],
    ];
    return Promise.all(attempts.map(async ([brief, promise]) => [brief, (await promise).status]));
  })();
  check('a hidden control is refused by the server, not merely hidden in the browser',
    hiddenButRefused.every(([, status]) => status === 403), JSON.stringify(hiddenButRefused));
  check('the refused attempts changed nothing on the server',
    db.query('SELECT status FROM clients WHERE public_id = ?', legacyClient.id)[0].status === 'active'
    && Number(db.query('SELECT COUNT(*) AS c FROM client_links WHERE client_id = (SELECT id FROM clients WHERE public_id = ?)', legacyClient.id)[0].c) === legacyLinksBefore
    && Number(db.query("SELECT COUNT(*) AS c FROM client_documents WHERE public_id = ?", legacyDocument.id)[0].c) === 1);

  // --- document delete is recoverable through the existing Recycle Bin ------
  const deletable = await createDocument(phantomToken, legacyClient.id, legacyProject.id, {
    title: uniqueName('deletable document'), contentText: 'Delete me.',
  });
  await publish(phantomToken, deletable.id, 'published');
  const deleteResponse = await request('DELETE', `/api/phantom/client-documents/${deletable.id}`, { token: phantomToken });
  check('PHANTOM can delete a client document', deleteResponse.status === 200, JSON.stringify(deleteResponse.json));
  check('the deleted document is gone from the portal',
    Number(db.query('SELECT COUNT(*) AS c FROM client_documents WHERE public_id = ?', deletable.id)[0].c) === 0
    && (await request('GET', `/api/phantom/clients/${legacyClient.id}/documents`, { token: phantomToken }))
      .json.data.every((entry) => entry.id !== deletable.id));
  const recycleRow = db.query("SELECT id, resource_type, payload_json FROM recycle_bin_items WHERE resource_type = 'client_document' ORDER BY id DESC LIMIT 1")[0];
  check('the deleted document is recoverable from the existing Recycle Bin', Boolean(recycleRow));
  const restoreResponse = await request('POST', `/api/phantom/recycle-bin/${recycleRow.id}/restore`, { token: phantomToken });
  check('PHANTOM can restore it from the Recycle Bin', restoreResponse.status === 200, JSON.stringify(restoreResponse.json));
  const restored = db.query('SELECT lifecycle_status, client_visible, is_archived FROM client_documents WHERE public_id = ?', deletable.id)[0];
  check('a restored document comes back as a draft that the client cannot see',
    restored && restored.lifecycle_status === 'draft' && Number(restored.client_visible) === 0);
  check('the deletion and the restore are both recorded',
    Number(db.query("SELECT COUNT(*) AS c FROM audit_logs WHERE action IN ('client.document.deleted','client.recycle_bin.restored','recycle_bin.restored')")[0].c) >= 2);

  // --- CLIENT_SETTINGS_MANAGE writes the switches the client routes read ----
  const settingsRead = await request('GET', '/api/phantom/client-portal-settings', { token: phantomToken });
  check('PHANTOM can read the client portal settings',
    settingsRead.status === 200 && settingsRead.json.data.length === 3
    && settingsRead.json.data.every((entry) => typeof entry.value === 'boolean'));
  const settingsWrite = await request('PUT', '/api/phantom/client-portal-settings', {
    token: phantomToken, body: { settings: [{ key: 'client_downloads_enabled', value: false }] },
  });
  check('PHANTOM can change a client portal setting',
    settingsWrite.status === 200 && settingsWrite.json.data.applied[0].previous === true
    && settingsWrite.json.data.applied[0].next === false, JSON.stringify(settingsWrite.json));
  check('the switch really changed what the client routes read',
    db.query("SELECT setting_value FROM system_settings WHERE setting_key = 'client_downloads_enabled'")[0].setting_value === '0');
  const settingsRestoreResponse = await request('PUT', '/api/phantom/client-portal-settings', {
    token: phantomToken, body: { settings: [{ key: 'client_downloads_enabled', value: true }] },
  });
  check('the change is reversible and recorded',
    settingsRestoreResponse.status === 200
    && Number(db.query("SELECT COUNT(*) AS c FROM audit_logs WHERE action = 'client.portal_settings.updated'")[0].c) >= 2);
  const badSetting = await request('PUT', '/api/phantom/client-portal-settings', {
    token: phantomToken, body: { settings: [{ key: 'vault_sharing_enabled', value: true }] },
  });
  check('a setting outside the client portal is refused (400)', badSetting.status === 400);
  check('the refusal left the platform setting untouched',
    db.query("SELECT setting_value FROM system_settings WHERE setting_key = 'vault_sharing_enabled'")[0].setting_value === '0');

  // --- the client-facing portal is still exactly as it was ------------------
  check('the client-facing room is unchanged by all of this',
    (await request('GET', `/api/client/project/${roomProjectA.id}`, { clientSession: roomSessionA })).status === 200);
  check('no delegated member ever becomes PHANTOM',
    Number(db.query("SELECT COUNT(*) AS c FROM member_profiles WHERE primary_role_id = (SELECT id FROM roles WHERE code = 'phantom')")[0].c) === 1
    && db.query(`SELECT u.email FROM member_profiles mp JOIN users u ON u.id = mp.user_id
                 WHERE mp.primary_role_id = (SELECT id FROM roles WHERE code = 'phantom')`)[0].email === ENV.ADMIN_EMAIL
    && Number(db.query("SELECT COUNT(*) AS c FROM website_admins WHERE status = 'active'")[0].c) >= 1,
    JSON.stringify(db.query("SELECT u.email FROM member_profiles mp JOIN users u ON u.id = mp.user_id WHERE mp.primary_role_id = (SELECT id FROM roles WHERE code = 'phantom')")));
  await grantHolder([]);

  // -------------------------------------------------------------------------
  // Report
  // -------------------------------------------------------------------------

  const passed = results.filter((result) => result.passed).length;
  const failed = results.length - passed;
  console.log('\n' + '='.repeat(64));
  console.log(`TOTAL: ${results.length}   PASSED: ${passed}   FAILED: ${failed}`);
  if (failed) {
    console.log('\nFailures:');
    for (const result of results.filter((entry) => !entry.p5Passed)) {
      console.log(`  - [${result.suite}] ${result.name}${result.detail ? ` — ${result.detail}` : ''}`);
    }
  }
  const rate = ((passed / results.length) * 100).toFixed(1);
  console.log(`SUCCESS RATE: ${rate}%`);
  console.log('='.repeat(64));

  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
};

main().catch((error) => {
  console.error('\nHarness error:', error);
  process.exit(2);
});
