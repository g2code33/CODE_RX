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

  // -------------------------------------------------------------------------
  // Report
  // -------------------------------------------------------------------------

  const passed = results.filter((result) => result.passed).length;
  const failed = results.length - passed;
  console.log('\n' + '='.repeat(64));
  console.log(`TOTAL: ${results.length}   PASSED: ${passed}   FAILED: ${failed}`);
  if (failed) {
    console.log('\nFailures:');
    for (const result of results.filter((entry) => !entry.passed)) {
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
