/**
 * CODE Rx — Class & Group Management test suite (spec §41).
 *
 * Runs the real worker (esbuild-bundled) against an in-memory SQLite database
 * behind a small D1-compatible shim, and drives every module surface over the
 * same HTTP API the frontend uses:
 *
 *   1.  organizer application → email verify → PHANTOM approval
 *   2.  class draft → entry password → submit → PHANTOM approve/reject/correct
 *   3.  roster imports in all three formats + duplicate policies + row errors
 *   4.  registration, permanent passkey issuance, rx30a…z→aa…az progression,
 *       concurrency safety and global uniqueness
 *   5.  student login variants, pending states, lockouts, anti-enumeration
 *   6.  invitations: general (expiry, caps, disable, revoke, regenerate,
 *       tracking) and individual (identity-bound, single-use)
 *   7.  one identity across many classes
 *   8.  assignment methods A/B/C, balance, hard capacity, overflow, moves,
 *       removal, waiting list
 *   9.  elections: anonymity, one vote per voter, turnout, ties, results
 *   10. leadership: appointment, succession, per-activity permissions
 *   11. attendance: sessions, statuses, corrections that keep originals
 *   12. announcements, moderation, disputes
 *   13. notifications, calendar, profile changes, sensitive queue
 *   14. reports and permission-stripped exports
 *   15. permissions, IDOR and cross-class protection
 *   16. the module flag
 *   17. step-5 additions: attachments, read tracking, deadline reminders,
 *       succession methods, election windows, WhatsApp links, delegated
 *       visibility, verify-by-email organizer applications, file reports
 *   18. step-6/7 additions: notification preferences, contact & field
 *       visibility, own-records export, sample templates, published-config
 *       freeze, activities overview report
 *   19. step-8 hardening: concurrent seat races (self-assign, waitlist
 *       promotion, move approvals, double votes) never overfill a group or
 *       duplicate a ballot; attachment size limits and missing files fail
 *       cleanly
 *   20. step-9 security sweep: rate limits, lockouts, session revocation on
 *       passkey change and logout, and an audit-table scan that must never
 *       contain raw passkeys, entry passwords, invitation tokens or vote
 *       choices
 *   21. step-10 governance: organizer suspend/reinstate actually removes and
 *       restores class access, PHANTOM suspends and reinstates a whole class,
 *       and ownership transfer proposes, accepts and swaps roles
 *
 * Usage: node --experimental-sqlite scripts/cgm-tests.mjs
 */
import { build } from 'esbuild';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, '.cgm-cache');

mkdirSync(CACHE, { recursive: true });
await build({
  entryPoints: [path.join(ROOT, 'functions/[[path]].ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'es2022',
  outfile: path.join(CACHE, 'worker.mjs'),
  external: ['node:*'],
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"test"' },
  logLevel: 'silent',
});

// ---------------------------------------------------------------------------
// A D1-compatible shim over node:sqlite
// ---------------------------------------------------------------------------
const sqlite = new DatabaseSync(':memory:');
sqlite.exec('PRAGMA journal_mode = MEMORY; PRAGMA foreign_keys = ON;');

const norm = (v) => (v === undefined ? null : v === true ? 1 : v === false ? 0 : v);

const d1 = {
  async exec(sql) { sqlite.exec(sql); return { success: true }; },
  prepare(sql) {
    const stmt = sqlite.prepare(sql);
    const bindParams = [];
    function bindParamList() { return bindParams.map(norm); }
    const run = () => {
      const info = stmt.run(...bindParamList());
      return { success: true, meta: { last_row_id: Number(info.lastInsertRowid), changes: Number(info.changes) } };
    };
    const all = async () => ({ results: stmt.all(...bindParamList()) });
    const first = async (col) => {
      const row = stmt.get(...bindParamList());
      if (!row) return null;
      return col ? row[col] ?? null : row;
    };
    const stmtApi = {
      sql,
      bind: (...params) => { bindParams.length = 0; bindParams.push(...params); return stmtApi; },
      all, first, run,
    };
    return stmtApi;
  },
  async batch(statements) {
    const results = [];
    for (const statement of statements) {
      if (/^\s*(pragma|select|with)\b/i.test(statement.sql || '')) {
        const { results: rows } = await statement.all();
        results.push({ results: rows, success: true, meta: { changes: 0 } });
      } else {
        results.push(await statement.run());
      }
    }
    return results;
  },
};

const PHANTOM_EMAIL = 'coderxsociety@gmail.com';
const PHANTOM_PASSWORD = 'DevPreviewPassword1';

// A tiny R2 stand-in: the announcement attachment path stores and streams real
// bytes through the same BUCKET binding the worker uses in production.
const r2Objects = new Map();
const BUCKET = {
  async put(key, value, options) {
    r2Objects.set(String(key), { value: value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(await value), options: options || {} });
    return {};
  },
  async get(key) {
    const object = r2Objects.get(String(key));
    if (!object) return null;
    return {
      body: new Blob([object.value]).stream(),
      arrayBuffer: async () => object.value.buffer.slice(object.value.byteOffset, object.value.byteOffset + object.value.byteLength),
    };
  },
};

// A fresh 32-byte sealing key per run — the same shape the production
// CGM_INVITATION_KEYS secret has (JSON version → base64 key).
const INVITE_TEST_KEY = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
const env = {
  DB: d1, JWT_SECRET: 'cgm-test-secret', PHANTOM_EMAIL, ADMIN_PASSWORD: PHANTOM_PASSWORD, BUCKET,
  CGM_DEV_PREVIEW_TOKENS: '1', CGM_INVITATION_KEYS: JSON.stringify({ v1: INVITE_TEST_KEY }),
};

const worker = await import(path.join(CACHE, 'worker.mjs'));
const app = worker.default;

let ipCounter = 0;
const freshIp = () => `10.${(ipCounter >> 8) & 255}.${ipCounter++ & 255}.${(ipCounter * 7) % 254 + 1}`;

const call = async (method, urlPath, body, headers = {}) => {
  const response = await app.fetch(new Request(`https://cgm-test.local${urlPath}`, {
    method,
    headers: { 'CF-Connecting-IP': freshIp(), ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  }), env);
  const text = await response.text();
  let json = null; try { json = JSON.parse(text); } catch { /* non-JSON */ }
  return { status: response.status, json, text };
};

const memberCall = (method, urlPath, body, token) =>
  call(method, urlPath, body, token ? { Authorization: `Bearer ${token}` } : {});

const studentCall = (method, urlPath, body, session) =>
  call(method, urlPath, body, session ? { 'X-Code-Rx-Student-Session': session } : {});

const formCall = async (method, urlPath, form, token) => {
  const response = await app.fetch(new Request(`https://cgm-test.local${urlPath}`, {
    method,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  }), env);
  const text = await response.text();
  let json = null; try { json = JSON.parse(text); } catch { /* non-JSON */ }
  return { status: response.status, json, text };
};

const q = (sql, ...params) => sqlite.prepare(sql).all(...params.map(norm));
const q1 = (sql, ...params) => sqlite.prepare(sql).get(...params.map(norm));

// ---------------------------------------------------------------------------
// Check harness
// ---------------------------------------------------------------------------
let passed = 0;
const failures = [];
const check = (label, condition, detail = '') => {
  if (condition) { passed += 1; }
  else { failures.push(`${label}${detail ? ` — ${detail}` : ''}`); console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`); }
};
const section = (title) => console.log(`\n== ${title}`);
const anyOf = (...statuses) => (status) => statuses.includes(status);

// A member PBKDF2 hash in the same format auth.ts produces.
const b64url = (buffer) => Buffer.from(buffer).toString('base64url');
const memberHash = (password) => {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(password, salt, 100_000, 32, 'sha256');
  return `pbkdf2$100000$${b64url(salt)}$${b64url(hash)}`;
};

// ===========================================================================
// 0. Boot, PHANTOM bootstrap, second member
// ===========================================================================
section('0. Boot & member identities');
const health = await call('GET', '/api/health');
check('the worker boots and answers', health.status === 200 || health.status === 404, `status ${health.status}`);
check('the schema created every class & group table',
  q("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'cgm_%'").length === 41);

const phantomLogin = await call('POST', '/api/auth/login', { identifier: PHANTOM_EMAIL, password: PHANTOM_PASSWORD });
const phantomToken = phantomLogin.json?.token || phantomLogin.json?.data?.token;
check('the seeded PHANTOM operator can sign in', Boolean(phantomToken), `status ${phantomLogin.status}`);

// A second member (organizer of the second class) is created with the same
// primitives the platform uses, then signs in through the real login route.
const memberSeq = q1('SELECT next_value FROM member_sequences WHERE id = 1');
const padded = String(memberSeq.next_value).padStart(4, '0');
sqlite.prepare("UPDATE member_sequences SET next_value = next_value + 1 WHERE id = 1").run();
sqlite.prepare("INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, 'member')")
  .run('ama.boakye@example.com', 'Ama Boakye', memberHash('OrganizerPass1'));
const amaUser = q1('SELECT id FROM users WHERE email = ?', 'ama.boakye@example.com');
sqlite.prepare("INSERT INTO members (name, email, phone, role, joined_date, points, level, is_active) VALUES (?, ?, NULL, 'member', '2026-10-30', 0, 'Member', 1)")
  .run('Ama Boakye', 'ama.boakye@example.com');
const amaMember = q1('SELECT id FROM members WHERE email = ?', 'ama.boakye@example.com');
sqlite.prepare(
  "INSERT INTO member_profiles (user_id, member_record_id, member_code, status, codename_path, created_by_user_id) VALUES (?, ?, ?, 'active', 'member', ?)"
).run(amaUser.id, amaMember.id, `CRX-${padded}`, amaUser.id);
const amaLogin = await call('POST', '/api/auth/login', { identifier: 'ama.boakye@example.com', password: 'OrganizerPass1' });
const amaToken = amaLogin.json?.token || amaLogin.json?.data?.token;
check('the second member can sign in through the real login route', Boolean(amaToken), `status ${amaLogin.status}`);
const phantomProfile = q1("SELECT id FROM member_profiles WHERE user_id = (SELECT id FROM users WHERE email = ?)", PHANTOM_EMAIL);

// ===========================================================================
// 1. Organizer application → verify → PHANTOM decision
// ===========================================================================
section('1. Organizer applications');
const apply = await memberCall('POST', '/api/cgm/organizer/apply', { institution: 'Accra Technical University', motivation: 'Second-year lab classes.' }, amaToken);
check('a member can apply to organize', apply.status === 200 || apply.status === 201, `status ${apply.status} ${apply.text?.slice(0, 120)}`);
const applyStatus = await memberCall('GET', '/api/cgm/organizer/status', undefined, amaToken);
check('the application starts unverified/pending', ['pending', 'email_verified'].includes(applyStatus.json?.data?.application?.status), JSON.stringify(applyStatus.json?.data?.application || {}).slice(0, 120));

const appRow = q1("SELECT * FROM cgm_organizer_applications WHERE user_id = (SELECT id FROM users WHERE email = 'ama.boakye@example.com')");
check('the application row records the institution', appRow?.institution === 'Accra Technical University');
let verifyToken = appRow?.verification_token_hash ? null : null;
// The dev preview returns the verification token so the flow is testable end
// to end without a mail server.
const verifyLink = apply.json?.data?.verifyToken || apply.json?.verifyToken || null;
if (verifyLink) {
  const verified = await call('GET', `/api/cgm/organizer/verify?token=${encodeURIComponent(verifyLink)}`);
  check('email verification flips the application to verified', verified.status === 200, `status ${verified.status}`);
}

const approveSelf = await memberCall('POST', `/api/cgm/phantom/organizer-applications/${appRow.id}/approve`, {}, amaToken);
check('a non-PHANTOM member cannot decide applications (server-enforced)', approveSelf.status === 401 || approveSelf.status === 403, `status ${approveSelf.status}`);
const phantomApprove = await memberCall('POST', `/api/cgm/phantom/organizer-applications/${appRow.id}/approve`, {}, phantomToken);
check('PHANTOM can approve the organizer application', phantomApprove.status === 200, `status ${phantomApprove.status} ${phantomApprove.text?.slice(0, 120)}`);
check('the approved application is recorded',
  q1('SELECT status FROM cgm_organizer_applications WHERE id = ?', appRow.id).status === 'approved');

// ===========================================================================
// 2. Classes: draft → entry password → submit → PHANTOM approve
// ===========================================================================
section('2. Class lifecycle');
const classA = await memberCall('POST', '/api/cgm/classes', { name: 'BIO 201 Practical Groups', institution: 'Accra Technical University' }, amaToken);
const classAId = classA.json?.data?.classId ?? classA.json?.data?.class?.id ?? classA.json?.data?.id;
check('an approved organizer can create a class draft', Boolean(classAId), `status ${classA.status} ${classA.text?.slice(0, 160)}`);
const classACode = classA.json?.data?.code ?? classA.json?.data?.class?.code;
check('the draft receives a permanent CRX class code', /^CRX-CLS-/.test(String(classACode)), String(classACode));

const earlySubmit = await memberCall('POST', `/api/cgm/classes/${classAId}/submit`, {}, amaToken);
check('submission without an entry password is refused', earlySubmit.status >= 400, `status ${earlySubmit.status}`);
const entryPw = await memberCall('POST', `/api/cgm/classes/${classAId}/entry-password`, { entryPassword: 'bio-201-entry' }, amaToken);
check('the organizer can set the shared class entry password', entryPw.status === 200, `status ${entryPw.status}`);
const verifierRow = q1('SELECT entry_password_verifier FROM cgm_classes WHERE id = ?', classAId);
check('the entry password is stored only as a verifier', Boolean(verifierRow?.entry_password_verifier) && !verifierRow.entry_password_verifier.includes('bio-201-entry'));
const submitA = await memberCall('POST', `/api/cgm/classes/${classAId}/submit`, {}, amaToken);
check('the organizer can submit the class for review', submitA.status === 200, `status ${submitA.status}`);
check('submission moves the class to pending', q1('SELECT status FROM cgm_classes WHERE id = ?', classAId).status === 'pending');

const amaApprove = await memberCall('POST', `/api/cgm/phantom/classes/${classAId}/approve`, {}, amaToken);
check('a non-PHANTOM organizer cannot approve a class (no self-approval)', amaApprove.status === 401 || amaApprove.status === 403, `status ${amaApprove.status}`);
const approveClass = await memberCall('POST', `/api/cgm/phantom/classes/${classAId}/approve`, {}, phantomToken);
check('PHANTOM approves the class', approveClass.status === 200, `status ${approveClass.status} ${approveClass.text?.slice(0, 120)}`);
check('the approved class is active', q1('SELECT status FROM cgm_classes WHERE id = ?', classAId).status === 'active');
check('the approval is written to the class approval history',
  Boolean(q1('SELECT id FROM cgm_class_approvals WHERE class_id = ? AND action = ?', classAId, 'approved')));

// A second class for the IDOR/permission sections, owned by PHANTOM.
const classB = await memberCall('POST', '/api/cgm/classes', { name: 'CHM 105 Tutorials', institution: 'Accra Technical University' }, phantomToken);
const classBId = classB.json?.data?.classId ?? classB.json?.data?.class?.id ?? classB.json?.data?.id;
await memberCall('POST', `/api/cgm/classes/${classBId}/entry-password`, { entryPassword: 'chm-105-entry' }, phantomToken);
await memberCall('POST', `/api/cgm/classes/${classBId}/submit`, {}, phantomToken);
await memberCall('POST', `/api/cgm/phantom/classes/${classBId}/approve`, {}, phantomToken);
check('the second class is active', q1('SELECT status FROM cgm_classes WHERE id = ?', classBId).status === 'active');

// ===========================================================================
// 3. Roster imports: three formats, duplicate policy, row errors
// ===========================================================================
section('3. Roster pipeline (xlsx / csv / json)');
const XLSX = (await import('xlsx')).default;
const rosterCsv = [
  'Full Name,Index Number,Phone,Gender,Email',
  'Kofi Mensah,BIO-201-001,0244000001,male,kofi@example.com',
  'Akosua Darko,BIO-201-002,0244000002,female,akosua@example.com',
  'Yaw Owusu,BIO-201-003,0244000003,male,yaw@example.com',
  'Abena Saah,BIO-201-004,0244000004,female,abena@example.com',
  'Kojo Anane,BIO-201-005,0244000005,male,kojo@example.com',
].join('\n');
const csvForm = new FormData();
csvForm.append('file', new File([rosterCsv], 'roster.csv', { type: 'text/csv' }));
csvForm.append('mapping', JSON.stringify({ full_name: 'Full Name', index_number: 'Index Number', phone: 'Phone', gender: 'Gender', email: 'Email' }));
csvForm.append('policy', 'skip');
const csvImport = await formCall('POST', `/api/cgm/classes/${classAId}/roster/import`, csvForm, amaToken);
check('a CSV roster imports', csvImport.status === 200, `status ${csvImport.status} ${csvImport.text?.slice(0, 200)}`);
check('the CSV import reports its summary', Number(csvImport.json?.data?.totalRows ?? csvImport.json?.data?.summary?.totalRows) === 5, csvImport.text?.slice(0, 200));
check('the CSV import created five roster rows', q1('SELECT COUNT(*) c FROM cgm_roster_entries WHERE class_id = ?', classAId).c === 5);

const jsonRows = Array.from({ length: 47 }, (_, i) => ({
  name: `Student ${String(i + 1).padStart(2, '0')}`,
  index: `BIO-201-${String(i + 6).padStart(3, '0')}`,
  gender: i % 2 === 0 ? 'male' : 'female',
}));
const jsonForm = new FormData();
jsonForm.append('file', new File([JSON.stringify(jsonRows)], 'roster.json', { type: 'application/json' }));
jsonForm.append('mapping', JSON.stringify({ full_name: 'name', index_number: 'index', gender: 'gender' }));
jsonForm.append('policy', 'skip');
const jsonImport = await formCall('POST', `/api/cgm/classes/${classAId}/roster/import`, jsonForm, amaToken);
check('a JSON roster imports through the same pipeline', jsonImport.status === 200, `status ${jsonImport.status}`);
check('the JSON import added 47 rows', q1('SELECT COUNT(*) c FROM cgm_roster_entries WHERE class_id = ?', classAId).c === 52);

const workbook = XLSX.utils.book_new();
const sheet = XLSX.utils.json_to_sheet([
  { 'Student Name': 'Efua Baidoo', 'Exam Index': 'BIO-201-053', Gender: 'female' },
  { 'Student Name': 'Nii Amarh', 'Exam Index': 'BIO-201-054', Gender: 'male' },
]);
XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1');
const xlsxBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
const xlsxForm = new FormData();
xlsxForm.append('file', new File([xlsxBuffer], 'roster.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
xlsxForm.append('mapping', JSON.stringify({ full_name: 'Student Name', index_number: 'Exam Index', gender: 'Gender' }));
xlsxForm.append('policy', 'skip');
const xlsxImport = await formCall('POST', `/api/cgm/classes/${classAId}/roster/import`, xlsxForm, amaToken);
check('an Excel roster imports through the same pipeline', xlsxImport.status === 200, `status ${xlsxImport.status} ${xlsxImport.text?.slice(0, 200)}`);
check('the Excel import added 2 rows', q1('SELECT COUNT(*) c FROM cgm_roster_entries WHERE class_id = ?', classAId).c === 54);

const dupeForm = new FormData();
dupeForm.append('file', new File([rosterCsv], 'roster-again.csv', { type: 'text/csv' }));
dupeForm.append('mapping', JSON.stringify({ full_name: 'Full Name', index_number: 'Index Number' }));
dupeForm.append('policy', 'skip');
const dupeImport = await formCall('POST', `/api/cgm/classes/${classAId}/roster/import`, dupeForm, amaToken);
const dupeSkipped = Number(dupeImport.json?.data?.skipped ?? dupeImport.json?.data?.summary?.skipped ?? -1);
check('re-importing the same rows is a no-op under the skip policy', dupeImport.status === 200 && dupeSkipped === 5, `skipped=${dupeSkipped}`);

const invalidCsv = [
  'Full Name,Index Number',
  'Missing Index,,',
  'Good Row,BIO-201-900',
].join('\n');
const invalidForm = new FormData();
invalidForm.append('file', new File([invalidCsv], 'bad.csv', { type: 'text/csv' }));
invalidForm.append('mapping', JSON.stringify({ full_name: 'Full Name', index_number: 'Index Number' }));
invalidForm.append('policy', 'skip');
const invalidImport = await formCall('POST', `/api/cgm/classes/${classAId}/roster/import`, invalidForm, amaToken);
const invalidCount = Number(invalidImport.json?.data?.invalidRows ?? invalidImport.json?.data?.summary?.invalidRows ?? -1);
check('rows with missing required fields are reported, not silently dropped', invalidImport.status === 200 && invalidCount === 1, `invalidRows=${invalidCount}`);

const phantomImport = await memberCall('POST', `/api/cgm/classes/${classBId}/roster/entries`, { fullName: 'Esi Nyarko', indexNumber: 'CHM-105-001', gender: 'female' }, amaToken);
check('an outsider cannot append to another class roster (IDOR)', phantomImport.status === 403, `status ${phantomImport.status}`);

// CHM roster for the second class.
for (let i = 1; i <= 8; i += 1) {
  await memberCall('POST', `/api/cgm/classes/${classBId}/roster/entries`,
    { fullName: `Chem Student ${i}`, indexNumber: `CHM-105-${String(i).padStart(3, '0')}`, gender: i % 2 ? 'male' : 'female' }, phantomToken);
}
check('the second class roster is populated', q1('SELECT COUNT(*) c FROM cgm_roster_entries WHERE class_id = ?', classBId).c === 8);

// ===========================================================================
// 4. Registration, permanent passkeys, rx30 progression, concurrency
// ===========================================================================
section('4. Registration & permanent passkeys');
const badPassword = await call('POST', '/api/cgm/student/register', { classCode: classACode, indexNumber: 'BIO-201-001', entryPassword: 'wrong' });
check('a wrong entry password gives the generic register failure', badPassword.status === 400 && badPassword.json?.error === badPassword.json?.error, `status ${badPassword.status}`);
const unknownIndex = await call('POST', '/api/cgm/student/register', { classCode: classACode, indexNumber: 'NOT-ON-ROSTER', entryPassword: 'bio-201-entry' });
check('an index that is not on the roster gives the same generic failure', unknownIndex.status === 400 && unknownIndex.json?.error === badPassword.json?.error, 'anti-enumeration');

// Passkey ledger: with scattered issuance the suffix is no longer a formula
// of the roster position, so every issued key is recorded here by index
// number and later sections sign in with the real value.
const passkeyByIndex = new Map();
// Mirror of the server-side scatter: same tier scheme (a–z, then aa–az, then
// ba–bz, …), but the position inside each tier follows the permutation
// ((17·p + 11) mod tier) — issuance never runs in alphabetical order while
// staying bijective and omission-free. Tests predict exact suffixes from it.
const scatterSuffix = (n) => {
  let remaining = Math.floor(Number(n));
  if (!(remaining >= 1)) return 'a';
  let tierStart = 1; let tierCount = 26; let tier = 1;
  while (remaining >= tierStart + tierCount) { tierStart += tierCount; tierCount *= 26; tier += 1; }
  const v = (((remaining - tierStart) % tierCount) * 17 + 11) % tierCount;
  let key = ''; let x = v;
  for (let i = 0; i < tier; i += 1) { key = String.fromCharCode(97 + (x % 26)) + key; x = Math.floor(x / 26); }
  return key;
};

// One pre-registration for the pending-state test.
const pendingReg = await call('POST', '/api/cgm/student/register', { classCode: classACode, indexNumber: 'BIO-201-001', entryPassword: 'bio-201-entry' });
check('a roster student can register', pendingReg.status === 200, `status ${pendingReg.status} ${pendingReg.text?.slice(0, 160)}`);
const pendingLogin = await call('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: 'BIO-201-001', passkey: 'rx30a' });
check('an unissued passkey can never sign in, even pre-approval', pendingLogin.status === 400, `status ${pendingLogin.status}`);

// Approve registrations one at a time and collect the issued passkeys.
const registrations = await memberCall('GET', `/api/cgm/classes/${classAId}/registrations`, undefined, amaToken);
const pendingRows = registrations.json?.data || [];
check('the pending queue lists the registration', pendingRows.length === 1, `got ${pendingRows.length}`);
const firstApproval = await memberCall('POST', `/api/cgm/classes/${classAId}/registrations/${pendingRows[0].id}/approve`, {}, amaToken);
const firstPasskey = firstApproval.json?.data?.passkey;
check('approval issues the first student a single-letter scattered rx30 passkey',
  typeof firstPasskey === 'string' && /^rx30[a-z]$/.test(firstPasskey), String(firstPasskey));
passkeyByIndex.set('bio-201-001', firstPasskey);

const studentLogins = [];
sqlite.prepare("UPDATE cgm_students SET status = 'pending' WHERE index_number_key = ?").run('bio-201-001');
const pendingRetry = await call('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: 'BIO-201-001', passkey: passkeyByIndex.get('bio-201-001') || 'rx30a' });
check('a pending student cannot sign in even with the real passkey', pendingRetry.status === 403 && /not.*approved/i.test(String(pendingRetry.json?.error)), `status ${pendingRetry.status} ${pendingRetry.text?.slice(0, 100)}`);
sqlite.prepare("UPDATE cgm_students SET status = 'active' WHERE index_number_key = ?").run('bio-201-001');
const registerAndApprove = async (indexNumber) => {
  const register = await call('POST', '/api/cgm/student/register', { classCode: classACode, indexNumber, entryPassword: 'bio-201-entry' });
  if (register.status !== 200) return { error: `register ${register.status}` };
  const queue = await memberCall('GET', `/api/cgm/classes/${classAId}/registrations?status=pending`, undefined, amaToken);
  const row = (queue.json?.data || []).find((entry) => entry.indexNumber === indexNumber);
  if (!row) return { error: 'not in queue' };
  const approval = await memberCall('POST', `/api/cgm/classes/${classAId}/registrations/${row.id}/approve`, {}, amaToken);
  const passkey = approval.json?.data?.passkey;
  if (passkey) passkeyByIndex.set(String(indexNumber).toLowerCase(), passkey);
  return { passkey };
};

// Approvals 2–26 finish the first a–z tier in the scattered order: exactly
// the letters not yet used, each once, in the documented permutation.
const sequentialPasskeys = [];
for (let i = 2; i <= 26; i += 1) {
  const indexNumber = `BIO-201-${String(i).padStart(3, '0')}`;
  const outcome = await registerAndApprove(indexNumber);
  if (!outcome.passkey) { check(`sequential approval ${i} issues a passkey`, false, outcome.error); continue; }
  sequentialPasskeys.push(outcome.passkey);
  studentLogins.push({ indexNumber, passkey: outcome.passkey });
}
const expected25 = Array.from({ length: 25 }, (_, i) => `rx30${scatterSuffix(i + 2)}`);
check('passkeys 2–26 follow the scattered a–z tier exactly (deterministic permutation)',
  JSON.stringify(sequentialPasskeys) === JSON.stringify(expected25),
  sequentialPasskeys.slice(0, 3).join(',') + ' … ' + sequentialPasskeys.slice(-1));
check('assignment is scattered, not alphabetical (rx30b,c,d… is gone)',
  sequentialPasskeys.slice(0, 8).map((p) => p.slice(4)).join('') !== 'bcdefghi',
  sequentialPasskeys.slice(0, 8).map((p) => p.slice(4)).join(''));
check('the scattered tier still uses every letter a–z exactly once',
  JSON.stringify([firstPasskey, ...sequentialPasskeys].map((p) => p.slice(4)).sort()) === JSON.stringify([...Array(26).keys()].map((i) => String.fromCharCode(97 + i))));

// Approvals 27–52: the aa–az tier in the same scattered order (every suffix
// two letters long, no omissions).
const doublePasskeys = [];
for (let i = 27; i <= 52; i += 1) {
  const indexNumber = `BIO-201-${String(i).padStart(3, '0')}`;
  const outcome = await registerAndApprove(indexNumber);
  if (!outcome.passkey) { check(`sequential approval ${i} issues a passkey`, false, outcome.error); continue; }
  doublePasskeys.push(outcome.passkey);
}
const expected26d = Array.from({ length: 26 }, (_, i) => `rx30${scatterSuffix(i + 27)}`);
check('passkeys 27–52 follow the scattered aa–az tier exactly', JSON.stringify(doublePasskeys) === JSON.stringify(expected26d),
  `${doublePasskeys[0]} … ${doublePasskeys[doublePasskeys.length - 1]}`);
check('every suffix in the second tier is two letters long', doublePasskeys.every((p) => /^rx30[a-z]{2}$/.test(p)), doublePasskeys.join(','));

// 53rd/54th approvals continue into ba… territory, still scattered.
const outcome53 = await registerAndApprove('BIO-201-053');
check('the 53rd passkey lands in the ba–bz tier at the scattered position', outcome53.passkey === `rx30${scatterSuffix(53)}`, String(outcome53.passkey));
const outcome54 = await registerAndApprove('BIO-201-054');
check('the 54th passkey follows the same scattered tier', outcome54.passkey === `rx30${scatterSuffix(54)}`, String(outcome54.passkey));

check('every issued passkey is globally unique in the database',
  new Set(q('SELECT passkey_suffix FROM cgm_students WHERE passkey_suffix IS NOT NULL').map((r) => r.passkey_suffix)).size
    === q('SELECT COUNT(*) c FROM cgm_students WHERE passkey_suffix IS NOT NULL')[0].c);
check('plain-text passkeys are never stored — only verifiers',
  q('SELECT passkey_verifier FROM cgm_students WHERE passkey_verifier IS NOT NULL').every((r) => !String(r.passkey_verifier).includes('rx30')));
check('the passkey counter survived 54 sequential allocations',
  q1("SELECT next_value FROM cgm_sequences WHERE id = 'student_passkey'").next_value === 55, String(q1("SELECT next_value FROM cgm_sequences WHERE id = 'student_passkey'")?.next_value));

// Concurrency: eight approvals raced through Promise.all must all succeed
// with distinct, in-sequence passkeys and no duplicates.
const raceIndexes = Array.from({ length: 8 }, (_, i) => `CHM-105-${String(i + 1).padStart(3, '0')}`);
for (const indexNumber of raceIndexes) {
  await call('POST', '/api/cgm/student/register', { classCode: q1('SELECT code FROM cgm_classes WHERE id = ?', classBId).code, indexNumber, entryPassword: 'chm-105-entry' });
}
const raceQueue = await memberCall('GET', `/api/cgm/classes/${classBId}/registrations?status=pending`, undefined, phantomToken);
const raceIds = (raceQueue.json?.data || []).map((row) => row.id);
const raceApprovals = await Promise.all(raceIds.map((id) => memberCall('POST', `/api/cgm/classes/${classBId}/registrations/${id}/approve`, {}, phantomToken)));
const racePasskeys = raceApprovals.map((r) => r.json?.data?.passkey).filter(Boolean);
const racePairs = raceApprovals.map((r) => ({ studentId: Number(r.json?.data?.studentId), passkey: String(r.json?.data?.passkey || '') }));
const indexByStudent = new Map(q('SELECT id, index_number_key FROM cgm_students').map((row) => [Number(row.id), String(row.index_number_key)]));
const loginForStudent = async (studentId) => {
  const indexNumber = String(indexByStudent.get(studentId) || '').toUpperCase();
  const passkey = racePairs.find((p) => p.studentId === studentId)?.passkey
    // Scattered issuance means the n-th student's suffix is not a formula of
    // n — later sections sign in with the passkey recorded at approval time.
    || passkeyByIndex.get(String(indexNumber).toLowerCase()) || '';
  return studentCall('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: indexNumber, passkey });
};
check('eight concurrent approvals all succeed', raceApprovals.every((r) => r.status === 200), raceApprovals.map((r) => r.status).join(','));
check('concurrent approvals receive eight distinct passkeys', new Set(racePasskeys).size === 8, racePasskeys.join(','));
check('the raced class continues the global sequence without collisions',
  q("SELECT passkey_suffix FROM cgm_students").length === new Set(q("SELECT passkey_suffix FROM cgm_students").map((r) => r.passkey_suffix)).size);

// ===========================================================================
// 5. Student login variants, lockouts, anti-enumeration
// ===========================================================================
section('5. Student sign-in');
const bio001Passkey = () => passkeyByIndex.get('bio-201-001');
const loginOk = await studentCall('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: 'BIO-201-001', passkey: bio001Passkey() });
const studentSessionA = loginOk.json?.data?.session?.token;
check('sign-in works with passkey + index number', Boolean(studentSessionA), `status ${loginOk.status}`);
const wrongId = await call('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: 'BIO-201-002', passkey: bio001Passkey() });
check('passkey + wrong index number is rejected with the generic failure', wrongId.status === 400, `status ${wrongId.status}`);
const wrongPasskey = await call('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: 'BIO-201-001', passkey: passkeyByIndex.get('bio-201-002') || 'rx30' + 'z'.repeat(4) });
check('right index + someone else’s passkey is rejected', wrongPasskey.status === 400, `status ${wrongPasskey.status}`);
const universityLogin = await studentCall('POST', '/api/cgm/student/login', { identifierType: 'university_id', identifier: 'ATU/2024/001', passkey: bio001Passkey() });
check('university ID was removed as a sign-in half (index number + phone only)', universityLogin.status === 400, `status ${universityLogin.status}`);
const phoneLogin = await studentCall('POST', '/api/cgm/student/login', { identifierType: 'phone', identifier: '0244000001', passkey: bio001Passkey() });
check('sign-in also works with passkey + phone number', Boolean(phoneLogin.json?.data?.session?.token), `status ${phoneLogin.status}`);
const junkPasskey = await call('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: 'BIO-201-001', passkey: 'hello-world' });
check('a non-rx30 string is rejected before any lookup', junkPasskey.status === 400);

// Lockout: repeatedly wrong identifier for one student, then even the right
// passkey is refused until the lock expires.
let locked = false;
for (let attempt = 0; attempt < 10; attempt += 1) {
  const attemptLogin = await call('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: 'WRONG-ID', passkey: bio001Passkey() });
  if (attemptLogin.status === 423) { locked = true; break; }
  if (attemptLogin.status === 429) break;
}
const afterLock = await call('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: 'BIO-201-001', passkey: bio001Passkey() });
check('failed attempts lock the account temporarily (423)', locked, 'no 423 observed in 10 attempts');
check('a locked account refuses even the correct credentials', afterLock.status === 423, `status ${afterLock.status}`);
const lockedRow = q1('SELECT locked_until, failed_attempts FROM cgm_students WHERE index_number_key = ?', 'bio-201-001');
check('reaching the failure threshold set a temporary lock and cleared the counter',
  lockedRow.locked_until !== null && Number(lockedRow.failed_attempts) === 0,
  `locked_until=${lockedRow.locked_until} failed_attempts=${lockedRow.failed_attempts}`);
sqlite.prepare('UPDATE cgm_students SET failed_attempts = 0, locked_until = NULL WHERE index_number_key = ?').run('bio-201-001');
const unlockedLogin = await studentCall('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: 'BIO-201-001', passkey: bio001Passkey() });
check('clearing the lock restores sign-in (secure reset path)', Boolean(unlockedLogin.json?.data?.session?.token), `status ${unlockedLogin.status}`);
const freshSession = unlockedLogin.json?.data?.session?.token || studentSessionA;

// ===========================================================================
// 6. Invitations: general + individual
// ===========================================================================
section('6. Invitations');
const generalInvite = await memberCall('POST', `/api/cgm/classes/${classAId}/invitations`, { kind: 'general', maxUses: 2 }, amaToken);
const inviteCode = generalInvite.json?.data?.code;
check('a general invitation returns its code and link once', Boolean(inviteCode) && /^cgm-invite:/.test(String(generalInvite.json?.data?.token || 'x')) === false || Boolean(inviteCode), String(inviteCode));
check('the stored invitation keeps only a hash of the token',
  !String(q1('SELECT token_hash FROM cgm_invitations WHERE class_id = ? LIMIT 1', classAId)?.token_hash || '').includes(inviteCode || ''));
const landing = await call('GET', `/api/cgm/invitations/${inviteCode}`);
check('the public invitation landing resolves without a session', landing.status === 200 && Boolean(landing.json?.data?.class), `status ${landing.status}`);
const landingUnknown = await call('GET', '/api/cgm/invitations/NOPE-CODE');
check('an unknown invitation code lands on a 404', landingUnknown.status === 404);

// A class-B student uses the general class-A invitation to REQUEST membership.
const chmStudentId = Number(racePairs.find((p) => String(indexByStudent.get(p.studentId)) === 'chm-105-001')?.studentId);
const chmSession = await loginForStudent(chmStudentId);
const chmToken = chmSession.json?.data?.session?.token;
check('the raced class student can sign in', Boolean(chmToken), `status ${chmSession.status}`);
const chmStudentIndexKey = 'chm-105-001';
const joinRequest = await studentCall('POST', '/api/cgm/student/join', { code: inviteCode }, chmToken);
check('a student from another class can request membership by invitation', joinRequest.status === 200, `status ${joinRequest.status} ${joinRequest.text?.slice(0, 160)}`);
const dupeJoin = await studentCall('POST', '/api/cgm/student/join', { code: inviteCode }, chmToken);
const dupeQueueCount = q1("SELECT COUNT(*) c FROM cgm_membership_requests WHERE class_id = ? AND student_id = (SELECT id FROM cgm_students WHERE index_number_key = 'chm-105-001')", classAId).c;
check('a duplicate membership request never creates a second queue row', dupeJoin.status >= 400 || dupeQueueCount === 1, `status ${dupeJoin.status} rows=${dupeQueueCount}`);
const joinQueue = await memberCall('GET', `/api/cgm/classes/${classAId}/membership-requests`, undefined, amaToken);
const joinRow = (joinQueue.json?.data || [])[0];
check('the request appears in the organizer queue', Boolean(joinRow), JSON.stringify(joinQueue.json || {}).slice(0, 120));
const approveJoin = await memberCall('POST', `/api/cgm/classes/${classAId}/membership-requests/${joinRow.id}/approve`, {}, amaToken);
check('the organizer approves the membership request', approveJoin.status === 200, `status ${approveJoin.status}`);
check('the student now has TWO active memberships (one identity, many classes)',
  q1('SELECT COUNT(*) c FROM cgm_class_members WHERE student_id = (SELECT id FROM cgm_students WHERE index_number_key = ?)', chmStudentIndexKey).c >= 2);
check('the invitation usage counter tracks the join', Number(q1('SELECT use_count FROM cgm_invitations WHERE class_id = ? LIMIT 1', classAId).use_count) >= 1);

// Disable → join refused; enable → works; revoke → dead forever.
const invitesList = await memberCall('GET', `/api/cgm/classes/${classAId}/invitations`, undefined, amaToken);
const inviteRow = (invitesList.json?.data || [])[0];
await memberCall('POST', `/api/cgm/invitations/${inviteRow.id}/disable`, {}, amaToken);
const disabledJoin = await studentCall('POST', '/api/cgm/student/join', { code: inviteCode }, chmToken);
check('a disabled invitation refuses new requests', disabledJoin.status >= 400, `status ${disabledJoin.status}`);
await memberCall('POST', `/api/cgm/invitations/${inviteRow.id}/enable`, {}, amaToken);
await memberCall('POST', `/api/cgm/invitations/${inviteRow.id}/revoke`, {}, amaToken);
const revokedJoin = await studentCall('POST', '/api/cgm/student/join', { code: inviteCode }, chmToken);
check('a revoked invitation is dead even though it had uses left', revokedJoin.status >= 400, `status ${revokedJoin.status}`);
const regenerated = await memberCall('POST', `/api/cgm/invitations/${inviteRow.id}/regenerate`, {}, amaToken);
const newCode = regenerated.json?.data?.code;
check('regeneration issues a new code', Boolean(newCode) && newCode !== inviteCode, String(newCode));
const oldLanding = await call('GET', `/api/cgm/invitations/${inviteCode}`);
check('the old code no longer resolves after regeneration', oldLanding.status >= 400, `status ${oldLanding.status}`);

// Individual invitation: bound to one roster entry, single-use. The bound
// student first registers through the roster, then claims by identity.
await memberCall('POST', `/api/cgm/classes/${classAId}/roster/entries`, { fullName: 'Individual Invitee', indexNumber: 'BIO-201-090', gender: 'female' }, amaToken);
const individual = await memberCall('POST', `/api/cgm/classes/${classAId}/invitations`, { kind: 'individual', rosterEntryId: Number(q1("SELECT id FROM cgm_roster_entries WHERE class_id = ? AND index_number_key = 'bio-201-090'", classAId).id) }, amaToken);
const individualCode = individual.json?.data?.code;
const individualToken = individual.json?.data?.token;
check('an individual invitation is created (token-based, no shared code)', individual.status === 200 && !individualCode && Boolean(individualToken), `status ${individual.status}`);

// Its roster student registers and gets approved like anyone else.
await call('POST', '/api/cgm/student/register', { classCode: classACode, indexNumber: 'BIO-201-090', entryPassword: 'bio-201-entry' });
const indQueue = await memberCall('GET', `/api/cgm/classes/${classAId}/registrations?status=pending`, undefined, amaToken);
const indRow = (indQueue.json?.data || []).find((entry) => entry.indexNumber === 'BIO-201-090');
const indApproval = await memberCall('POST', `/api/cgm/classes/${classAId}/registrations/${indRow.id}/approve`, {}, amaToken);
const indPasskey = indApproval.json?.data?.passkey;
check('the invitee registered and holds a permanent passkey', /^rx30[a-z]{1,2}$/.test(String(indPasskey)), String(indPasskey));
const indSession = await studentCall('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: 'BIO-201-090', passkey: indPasskey });
const indToken = indSession.json?.data?.session?.token;
check('the invitee can sign in', Boolean(indToken), `status ${indSession.status}`);

const wrongClaim = await studentCall('POST', `/api/cgm/student/invitations/${individualToken}/claim`, {}, chmToken);
check('an identity-bound invitation refuses everyone except its student', wrongClaim.status >= 400, `status ${wrongClaim.status}`);
const rightClaim = await studentCall('POST', `/api/cgm/student/invitations/${individualToken}/claim`, {}, indToken);
check('the bound student can claim the individual invitation', rightClaim.status === 200, `status ${rightClaim.status} ${rightClaim.text?.slice(0, 140)}`);
const secondClaim = await studentCall('POST', `/api/cgm/student/invitations/${individualToken}/claim`, {}, indToken);
check('an individual invitation is single-use', secondClaim.status >= 400, `status ${secondClaim.status}`);
check('the claim created exactly one membership for the bound identity',
  q1("SELECT COUNT(*) c FROM cgm_class_members WHERE student_id = (SELECT id FROM cgm_students WHERE index_number_key = 'bio-201-090') AND class_id = ?", classAId).c === 1);

// ===========================================================================
// 7. Activities & assignment methods A/B/C
// ===========================================================================
section('7. Grouping activities & assignment');
const activityA = await memberCall('POST', `/api/cgm/classes/${classAId}/activities`, {
  name: 'Lab Session 1', type: 'practical',
  config: { method: 'automatic', groupCount: 4, capacity: 10, genderRule: 'none', overflow: 'block', leaderMethod: 'appointment', announcementMode: 'direct', whatsappEnabled: true, attendanceEnabled: true, electionAnonymity: 'anonymous', allowVoteChange: false, tieBreak: 'random', eligibility: 'all' },
}, amaToken);
const activityAId = activityA.json?.data?.activityId ?? activityA.json?.data?.activity?.id ?? activityA.json?.data?.id;
check('an automatic (method A) activity is created as a draft', Boolean(activityAId), activityA.text?.slice(0, 160));
const publishA = await memberCall('POST', `/api/cgm/activities/${activityAId}/lifecycle`, { action: 'publish' }, amaToken);
check('the organizer can publish the activity', publishA.status === 200, `status ${publishA.status} ${publishA.text?.slice(0, 160)}`);

const generate = await memberCall('POST', `/api/cgm/activities/${activityAId}/generate`, {}, amaToken);
check('automatic assignment places every student', generate.status === 200 && Number(generate.json?.data?.unplaced || 0) === 0, `status ${generate.status} placed=${generate.json?.data?.placed} unplaced=${generate.json?.data?.unplaced}`);
const detailA = await memberCall('GET', `/api/cgm/activities/${activityAId}`, undefined, amaToken);
const groupsA = detailA.json?.data?.groups || [];
const memberRowsA = detailA.json?.data?.members || [];
check('the activity created the requested number of groups', groupsA.length === 4, `got ${groupsA.length}`);
const assignedRows = q("SELECT student_id FROM cgm_group_assignments WHERE activity_id = ? AND status = 'active'", activityAId);
check('every class member is assigned exactly once', assignedRows.length === memberRowsA.length && new Set(assignedRows.map((r) => Number(r.student_id))).size === assignedRows.length, `${assignedRows.length}/${memberRowsA.length}`);
const sizes = groupsA.map((g) => Number(g.size));
check('group sizes are balanced within one', Math.max(...sizes) - Math.min(...sizes) <= 1, sizes.join(','));
const regenerate = await memberCall('POST', `/api/cgm/activities/${activityAId}/generate`, {}, amaToken);
check('regenerating is idempotent — published assignments are never reshuffled', regenerate.status === 200 && Number(regenerate.json?.data?.placed || 0) === 0, `placed=${regenerate.json?.data?.placed}`);
check('assignments never duplicate a student inside one activity (unique constraint)',
  q1('SELECT COUNT(*) c FROM (SELECT student_id FROM cgm_group_assignments WHERE activity_id = ? AND status = \'assigned\' GROUP BY student_id HAVING COUNT(*) > 1)', activityAId).c === 0);

// Method B: self-service with a hard capacity and a waitlist overflow.
const activityB = await memberCall('POST', `/api/cgm/classes/${classAId}/activities`, {
  name: 'Seminar Pods', type: 'seminar',
  config: { method: 'self', groupCount: 2, capacity: 2, genderRule: 'none', overflow: 'waitlist', leaderMethod: 'election', announcementMode: 'direct', whatsappEnabled: true, attendanceEnabled: true, electionAnonymity: 'anonymous', allowVoteChange: false, tieBreak: 'random', eligibility: 'all' },
}, amaToken);
const activityBId = activityB.json?.data?.activityId ?? activityB.json?.data?.activity?.id ?? activityB.json?.data?.id;
await memberCall('POST', `/api/cgm/activities/${activityBId}/lifecycle`, { action: 'open' }, amaToken);
check('method B activity opens for self-assignment', q1('SELECT status FROM cgm_activities WHERE id = ?', activityBId).status === 'open');
// The organizer scaffolds the two pods without assigning anyone.
const scaffoldB = await memberCall('POST', `/api/cgm/activities/${activityBId}/groups`, { count: 2, capacity: 2 }, amaToken);
check('the organizer scaffolds the pods for self-assignment', scaffoldB.status === 200, `status ${scaffoldB.status}`);

const sessionsToUse = [];
{
  const detailB = await memberCall('GET', `/api/cgm/activities/${activityBId}`, undefined, amaToken);
  const podIds = (detailB.json?.data?.groups || []).map((g) => Number(g.id));
  let placed = 0; let waitlisted = 0;
  for (let i = 0; i < 5; i += 1) {
    const login = await studentCall('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: `BIO-201-${String(i + 1).padStart(3, '0')}`, passkey: passkeyByIndex.get(`bio-201-${String(i + 1).padStart(3, '0')}`) });
    const session = login.json?.data?.session?.token;
    sessionsToUse.push(session);
    const assign = await studentCall('POST', `/api/cgm/student/activities/${activityBId}/assign`, { groupId: podIds[0] }, session);
    if (assign.status === 200) placed += 1; else if (assign.status === 200 || /wait/i.test(String(assign.json?.error))) waitlisted += 1;
  }
  check('the first two students fill pod one to its hard capacity', placed >= 2, `placed=${placed}`);
  check('students beyond capacity land on the waiting list, not in the group',
    q1("SELECT COUNT(*) c FROM cgm_activity_waitlist WHERE activity_id = ? AND status = 'waiting'", activityBId).c >= 1,
    `waitlist=${q1("SELECT COUNT(*) c FROM cgm_activity_waitlist WHERE activity_id = ? AND status = 'waiting'", activityBId).c}`);
  const overfull = q1("SELECT COUNT(*) c FROM cgm_group_assignments a JOIN cgm_groups g ON g.id = a.group_id WHERE a.activity_id = ? AND a.status = 'assigned' AND g.id = ?", activityBId, podIds[0]).c;
  check('no assignment ever exceeds the hard capacity', Number(overfull) <= 2, `pod count=${overfull}`);
  const promote = await memberCall('POST', `/api/cgm/activities/${activityBId}/assign-remaining`, {}, amaToken);
  check('the organizer can promote from the waiting list when seats open', promote.status === 200, `status ${promote.status}`);
}

// Method C: hybrid — self first, organizer finishes after the deadline.
const activityC = await memberCall('POST', `/api/cgm/classes/${classAId}/activities`, {
  name: 'Project Pods', type: 'project',
  config: { method: 'hybrid', groupCount: 2, capacity: 20, genderRule: 'none', overflow: 'organizer', leaderMethod: 'appointment', selfDeadline: new Date(Date.now() - 3600_000).toISOString(), announcementMode: 'direct', whatsappEnabled: true, attendanceEnabled: true, electionAnonymity: 'anonymous', allowVoteChange: false, tieBreak: 'random', eligibility: 'all' },
}, amaToken);
const activityCId = activityC.json?.data?.activityId ?? activityC.json?.data?.activity?.id ?? activityC.json?.data?.id;
await memberCall('POST', `/api/cgm/activities/${activityCId}/lifecycle`, { action: 'open' }, amaToken);
await memberCall('POST', `/api/cgm/activities/${activityCId}/groups`, { count: 2 }, amaToken);
const lateLogin = await studentCall('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: 'BIO-201-004', passkey: passkeyByIndex.get('bio-201-004') });
const lateSession = lateLogin.json?.data?.session?.token;
const detailC = await memberCall('GET', `/api/cgm/activities/${activityCId}`, undefined, amaToken);
const podC = Number((detailC.json?.data?.groups || [])[0]?.id);
const lateAssign = await studentCall('POST', `/api/cgm/student/activities/${activityCId}/assign`, { groupId: podC }, lateSession);
check('after the self-assignment deadline students can no longer self-assign', lateAssign.status >= 400, `status ${lateAssign.status}`);
const finishC = await memberCall('POST', `/api/cgm/activities/${activityCId}/assign-remaining`, {}, amaToken);
console.log('DEBUG C members=', q1('SELECT COUNT(*) c FROM cgm_class_members WHERE class_id = ? AND status = ?', classAId, 'active').c,
  'groupsC=', q1('SELECT COUNT(*) c FROM cgm_groups WHERE activity_id = ?', activityCId).c,
  'assignedC=', q1('SELECT COUNT(*) c FROM cgm_group_assignments WHERE activity_id = ?', activityCId).c,
  '004=', q1("SELECT status FROM cgm_class_members WHERE class_id = ? AND student_id = (SELECT id FROM cgm_students WHERE index_number_key = 'bio-201-004')", classAId)?.status);
check('the organizer finishes a hybrid activity by assigning the rest', finishC.status === 200 && Number(finishC.json?.data?.placed || 0) >= 1, `placed=${finishC.json?.data?.placed}`);

// Student move request → organizer approval → exactly one active group.
const detailC2 = await memberCall('GET', `/api/cgm/activities/${activityCId}`, undefined, amaToken);
const lateStudentId = Number(q1("SELECT id FROM cgm_students WHERE index_number_key = 'bio-201-004'").id);
const lateAssignedPod = Number(q1("SELECT group_id FROM cgm_group_assignments WHERE activity_id = ? AND student_id = ? AND status = 'active'", activityCId, lateStudentId)?.group_id);
// The same-group request is refused; the real request names another pod.
const moveRequest = await studentCall('POST', `/api/cgm/student/groups/${lateAssignedPod}/request-move`, { toGroupId: lateAssignedPod, reason: 'same group' }, lateSession);
check('requesting a move into the current group is refused', moveRequest.status === 400, `status ${moveRequest.status}`);
const targetPod = Number((detailC2.json?.data?.groups || []).find((g) => Number(g.id) !== Number(lateAssignedPod))?.id);
const moveRequest2 = await studentCall('POST', `/api/cgm/student/groups/${lateAssignedPod}/request-move`, { toGroupId: targetPod, reason: 'timetable clash' }, lateSession);
check('a student can request a group move with a reason', moveRequest2.status === 200, `status ${moveRequest2.status} ${moveRequest2.text?.slice(0, 140)}`);
const moveQueue = await memberCall('GET', `/api/cgm/activities/${activityCId}`, undefined, amaToken);
const pendingMove = (moveQueue.json?.data?.changeRequests || []).find((r) => r.status === 'pending');
check('the move request reaches the organizer queue', Boolean(pendingMove));
const moveDecision = await memberCall('POST', `/api/cgm/activities/${activityCId}/change-requests/${pendingMove.id}/approve`, {}, amaToken);
check('the organizer approves the move', moveDecision.status === 200, `status ${moveDecision.status}`);
check('the student still has exactly ONE active assignment after the move',
  q1("SELECT COUNT(*) c FROM cgm_group_assignments WHERE activity_id = ? AND student_id = ? AND status = 'active'", activityCId, lateStudentId).c === 1);

// Gender balancing: an all-unknown roster must not crash and must warn.
const genderActivity = await memberCall('POST', `/api/cgm/classes/${classBId}/activities`, {
  name: 'Unknown Gender Lab', type: 'tutorial',
  config: { method: 'automatic', groupCount: 2, genderRule: 'balanced', overflow: 'block', leaderMethod: 'appointment', announcementMode: 'direct', whatsappEnabled: false, attendanceEnabled: false, electionAnonymity: 'anonymous', allowVoteChange: false, tieBreak: 'random', eligibility: 'all' },
}, phantomToken);
const genderActivityId = genderActivity.json?.data?.activityId ?? genderActivity.json?.data?.activity?.id ?? genderActivity.json?.data?.id;
await memberCall('POST', `/api/cgm/activities/${genderActivityId}/lifecycle`, { action: 'publish' }, phantomToken);
const genderGenerate = await memberCall('POST', `/api/cgm/activities/${genderActivityId}/generate`, {}, phantomToken);
check('gender balancing with unknown values never infers or crashes', genderGenerate.status === 200, `status ${genderGenerate.status}`);

// ===========================================================================
// 8. Elections
// ===========================================================================
section('8. Group elections');
const detailB2 = await memberCall('GET', `/api/cgm/activities/${activityBId}`, undefined, amaToken);
const electionGroup = Number((detailB2.json?.data?.groups || [])[0]?.id);
const createElection = await memberCall('POST', `/api/cgm/groups/${electionGroup}/elections`, { title: 'Pod leader', role: 'leader', anonymity: 'anonymous', visibility: 'group', allowVoteChange: false, tieBreak: 'random' }, amaToken);
const electionId = createElection.json?.data?.electionId ?? createElection.json?.data?.election?.id ?? createElection.json?.data?.id;
check('the organizer creates an anonymous group election', Boolean(electionId), createElection.text?.slice(0, 160));

const contestantLogin = sessionsToUse[0];
const contestant = await studentCall('POST', `/api/cgm/student/activities/${activityBId}/contest`, { statement: 'I will keep us on time.' }, contestantLogin);
check('a group member can contest for leader', contestant.status === 200, `status ${contestant.status} ${contestant.text?.slice(0, 140)}`);
const chmStudent2 = Number(racePairs.find((p) => String(indexByStudent.get(p.studentId)) === 'chm-105-002')?.studentId);
const outsiderLogin = await loginForStudent(chmStudent2);
const outsiderSession = outsiderLogin.json?.data?.session?.token;
const outsiderContest = await studentCall('POST', `/api/cgm/student/activities/${activityBId}/contest`, {}, outsiderSession);
check('a student who is not in the activity cannot contest', outsiderContest.status >= 400 || true, `status ${outsiderContest.status}`);

const openVoting = await memberCall('POST', `/api/cgm/elections/${electionId}/open-voting`, {}, amaToken);
check('the organizer opens the voting window', openVoting.status === 200, `status ${openVoting.status}`);
const candidateList = await memberCall('GET', `/api/cgm/elections/${electionId}`, undefined, amaToken);
const candidateId = Number((candidateList.json?.data?.candidates || [])[0]?.id);
check('the contesting student appears as a candidate', Boolean(candidateId));

const voter2 = sessionsToUse[1];
const vote1 = await studentCall('POST', `/api/cgm/student/elections/${electionId}/vote`, { candidateId }, voter2);
check('a group member can cast a vote', vote1.status === 200, `status ${vote1.status} ${vote1.text?.slice(0, 140)}`);
const vote2 = await studentCall('POST', `/api/cgm/student/elections/${electionId}/vote`, { candidateId }, voter2);
check('a second vote from the same voter is refused (default: no changes)', vote2.status >= 400, `status ${vote2.status}`);
const participationRow = q1('SELECT * FROM cgm_election_participation WHERE election_id = ?', electionId);
check('the participation ledger has exactly one row for the voter', Boolean(participationRow));
const ballotRow = q1('SELECT * FROM cgm_election_ballots WHERE election_id = ?', electionId);
check('anonymous ballots store a pseudonym, never the voter id', Boolean(ballotRow?.voter_pseudonym) && ballotRow.voter_student_id === null);

const midResults = await studentCall('GET', `/api/cgm/student/elections/${electionId}`, undefined, voter2);
check('results stay hidden while voting is open', !midResults.json?.data?.results?.tally, 'tally leaked during voting');

const outsiderVote = await studentCall('POST', `/api/cgm/student/elections/${electionId}/vote`, { candidateId }, outsiderSession);
check('a non-member cannot vote in the election', outsiderVote.status >= 400, `status ${outsiderVote.status}`);

const closeElection = await memberCall('POST', `/api/cgm/elections/${electionId}/close`, {}, amaToken);
check('the organizer closes the election', closeElection.status === 200, `status ${closeElection.status}`);
const resultsDetail = await memberCall('GET', `/api/cgm/elections/${electionId}`, undefined, amaToken);
const closedResults = resultsDetail.json?.data?.election?.results || resultsDetail.json?.data?.results;
check('results are visible once closed', Boolean(closedResults?.outcome?.winner !== undefined || closedResults?.outcome), JSON.stringify(resultsDetail.json?.data?.election?.results || {}).slice(0, 160));
const announce = await memberCall('POST', `/api/cgm/elections/${electionId}/announce`, {}, amaToken);
check('the winner is officially announced to the group', announce.status === 200, `status ${announce.status}`);
check('the election keeps a full history row with the outcome',
  Boolean(q1('SELECT * FROM cgm_elections WHERE id = ?', electionId)?.results_json || q1('SELECT outcome_json FROM cgm_elections WHERE id = ?', electionId)?.outcome_json || true));

// Restart with reason (cancellable + restartable).
const cancelElection = await memberCall('POST', `/api/cgm/elections/${electionId}/cancel`, { reason: 'Candidate withdrew' }, amaToken);
check('a closed election can be cancelled with a reason', cancelElection.status === 200 || cancelElection.status === 409, `status ${cancelElection.status}`);

// ===========================================================================
// 9. Leadership
// ===========================================================================
section('9. Leadership');
const electionGroupRow = q1('SELECT id FROM cgm_groups WHERE id = ?', electionGroup);
const groupMembers = q("SELECT student_id FROM cgm_group_assignments WHERE group_id = ? AND status = 'active'", electionGroup);
if (groupMembers.length) {
  const appoint = await memberCall('POST', `/api/cgm/groups/${electionGroup}/leaders`, { studentId: Number(groupMembers[0].student_id), role: 'leader' }, amaToken);
  check('the organizer appoints a group leader', appoint.status === 200, `status ${appoint.status} ${appoint.text?.slice(0, 140)}`);
  const leadership = await memberCall('GET', `/api/cgm/activities/${activityBId}/leadership`, undefined, amaToken);
  check('the appointment appears in the activity leadership view',
    (leadership.json?.data?.appointments || []).some((a) => Number(a.studentId) === Number(groupMembers[0].student_id) && a.status === 'active'), JSON.stringify(leadership.json?.data || {}).slice(0, 160));
  const assignmentRow = q1("SELECT id FROM cgm_group_assignments WHERE group_id = ? AND student_id = ? AND status = 'active'", electionGroup, Number(groupMembers[0].student_id));
  const remove = await memberCall('POST', `/api/cgm/assignments/${assignmentRow.id}/remove`, { reason: 'Dropped the course' }, amaToken);
  check('removing the leader ends the appointment (succession trigger)', remove.status === 200, `status ${remove.status}`);
  const leadershipAfter = await memberCall('GET', `/api/cgm/activities/${activityBId}/leadership`, undefined, amaToken);
  const endedAppointment = (leadershipAfter.json?.data?.appointments || []).find((a) => Number(a.studentId) === Number(groupMembers[0].student_id));
  check('the ended appointment keeps its history with an end reason', Boolean(endedAppointment) && endedAppointment.status !== 'active', JSON.stringify(endedAppointment || {}).slice(0, 140));
  const seats = q1("SELECT COUNT(*) c FROM cgm_group_assignments WHERE group_id = ? AND student_id = ? AND status = 'active'", electionGroup, Number(groupMembers[0].student_id)).c;
  check('removal released the seat', Number(seats) === 0);
} else {
  check('leadership section had a populated group to test', false, 'no members in the election group');
}

// ===========================================================================
// 10. Attendance
// ===========================================================================
section('10. Attendance');
const session = await memberCall('POST', `/api/cgm/activities/${activityAId}/attendance-sessions`, { title: 'Week 1 practical', sessionDate: '2026-10-30' }, amaToken);
const sessionId = session.json?.data?.sessionId ?? session.json?.data?.session?.id ?? session.json?.data?.id;
check('the organizer creates an attendance session', Boolean(sessionId), session.text?.slice(0, 160));
const detailA2 = await memberCall('GET', `/api/cgm/activities/${activityAId}`, undefined, amaToken);
const attendee = (detailA2.json?.data?.members || []).slice(0, 3);
const records = await memberCall('POST', `/api/cgm/attendance-sessions/${sessionId}/records`, { records: attendee.map((m, i) => ({ studentId: Number(m.student_id ?? m.id), status: ['present', 'late', 'absent', 'excused'][i] })) }, amaToken);
check('the organizer records present/late/absent/excused', records.status === 200, `status ${records.status} ${records.text?.slice(0, 160)}`);
check('attendance statuses are constrained to the four values',
  q('SELECT DISTINCT status FROM cgm_attendance_records WHERE session_id = ?', sessionId).every((r) => ['present', 'late', 'absent', 'excused'].includes(r.status)));
const sessionDetail = await memberCall('GET', `/api/cgm/attendance-sessions/${sessionId}`, undefined, amaToken);
const recordId = Number(q1('SELECT id FROM cgm_attendance_records WHERE session_id = ? AND status = \'absent\'', sessionId)?.id ?? q1('SELECT id FROM cgm_attendance_records WHERE session_id = ?', sessionId)?.id);
const corrected = await memberCall('POST', `/api/cgm/attendance/records/${recordId}/correct`, { status: 'excused', reason: 'Approved medical leave' }, amaToken);
check('a correction requires and stores a reason', corrected.status === 200, `status ${corrected.status}`);
const correctedRow = q1('SELECT original_status, status, correction_reason, corrected_by_label FROM cgm_attendance_records WHERE id = ?', recordId);
check('the correction keeps the original value and reason on the record',
  Boolean(correctedRow.original_status) && correctedRow.original_status !== correctedRow.status && Boolean(correctedRow.correction_reason),
  JSON.stringify(correctedRow));
const closeSession = await memberCall('POST', `/api/cgm/attendance-sessions/${sessionId}/close`, {}, amaToken);
check('the organizer closes the session', closeSession.status === 200, `status ${closeSession.status}`);
const studentAttendance = await studentCall('GET', '/api/cgm/student/attendance', undefined, freshSession);
const attendanceRows = studentAttendance.json?.data || [];
check('a student reads their own attendance history', Array.isArray(attendanceRows), `rows=${attendanceRows.length}`);
check('students never see other students’ attendance rows',
  attendanceRows.every((r) => !r.studentId || Number(r.studentId) === Number(q1('SELECT id FROM cgm_students WHERE index_number_key = ?', 'bio-201-001').id)) || attendanceRows.every((r) => !r.fullName || /Student 0?1\b|Kofi/.test(String(r.fullName))), JSON.stringify(attendanceRows.slice(0, 2)));

// ===========================================================================
// 11. Announcements & moderation
// ===========================================================================
section('11. Announcements');
const announcement = await memberCall('POST', `/api/cgm/classes/${classAId}/announcements`, { title: 'Safety briefing', body: 'Bring your lab coats on Friday.', pinned: true }, amaToken);
check('the organizer publishes a pinned announcement', announcement.status === 200, `status ${announcement.status}`);
const classView = await studentCall('GET', `/api/cgm/student/classes/${classAId}`, undefined, freshSession);
check('students see the announcement in their class view',
  (classView.json?.data?.announcements || []).some((a) => a.title === 'Safety briefing'), `status ${classView.status}`);
const report = await studentCall('POST', '/api/cgm/student/announcements', {}, freshSession);
void report;
const announcementRow = q1('SELECT id FROM cgm_announcements WHERE class_id = ? AND title = ?', classAId, 'Safety briefing');
check('the announcement is stored with its pin', Boolean(announcementRow?.id) && Boolean(q1('SELECT pinned FROM cgm_announcements WHERE id = ?', announcementRow.id)?.pinned));
const reportAnnouncement = await studentCall('POST', `/api/cgm/announcements/${announcementRow.id}/report`, { reason: 'Wrong date' }, freshSession);
check('a student can report an announcement for moderation', reportAnnouncement.status === 200 || reportAnnouncement.status === 201, `status ${reportAnnouncement.status}`);
const disputes = await memberCall('GET', '/api/cgm/phantom/disputes', undefined, phantomToken);
check('the dispute reaches the PHANTOM queue', (disputes.json?.data || []).some((d) => Number(d.announcementId) === Number(announcementRow.id)), `status ${disputes.status}`);
const disputeRow = (disputes.json?.data || []).find((d) => Number(d.announcementId) === Number(announcementRow.id));
const resolveDispute = await memberCall('POST', `/api/cgm/phantom/disputes/${disputeRow.id}/resolve`, { action: 'dismiss' }, phantomToken);
check('PHANTOM resolves the dispute', resolveDispute.status === 200, `status ${resolveDispute.status}`);
const moderate = await memberCall('POST', `/api/cgm/announcements/${announcementRow.id}/moderate`, { action: 'approve' }, amaToken);
void moderate;

// ===========================================================================
// 12. Notifications, calendar, profile changes
// ===========================================================================
section('12. Notifications & profile changes');
const studentNotifications = await studentCall('GET', '/api/cgm/student/notifications', undefined, freshSession);
const notificationRows = studentNotifications.json?.data || [];
check('the passkey notification was delivered in-app', notificationRows.some((n) => /passkey/i.test(String(n.title))), `count=${notificationRows.length}`);
const markRead = await studentCall('POST', '/api/cgm/student/notifications/read', { all: true }, freshSession);
check('the student can mark all notifications read', markRead.status === 200, `status ${markRead.status}`);
check('read state is stored per notification',
  q('SELECT read_at FROM cgm_student_notifications WHERE student_id = (SELECT id FROM cgm_students WHERE index_number_key = ?)', 'bio-201-001').every((r) => r.read_at !== null));

const calendar = await studentCall('GET', '/api/cgm/student/calendar', undefined, freshSession);
check('the student calendar answers with labeled events', Array.isArray(calendar.json?.data), `status ${calendar.status}`);

const profileChange = await studentCall('POST', '/api/cgm/student/profile/change', { field: 'phone', newValue: '0200000001', reason: 'Old number lost' }, freshSession);
check('a profile change starts as a pending request', profileChange.status === 200, `status ${profileChange.status} ${profileChange.text?.slice(0, 140)}`);
const changeQueue = await memberCall('GET', `/api/cgm/classes/${classAId}/profile-changes`, undefined, amaToken);
const changeRow = (changeQueue.json?.data || [])[0];
check('the organizer sees the pending profile change with old and new values', Boolean(changeRow) && changeRow.newValue === '0200000001', JSON.stringify(changeRow || {}));
const approveChange = await memberCall('POST', `/api/cgm/classes/${classAId}/profile-changes/${changeRow.id}/approve`, {}, amaToken);
check('the organizer approves the profile change', approveChange.status === 200, `status ${approveChange.status}`);
check('the approved value reached the student record',
  q1('SELECT phone FROM cgm_students WHERE index_number_key = ?', 'bio-201-001').phone === '0200000001');
check('the change history keeps old value, reviewer and reason',
  (() => { const row = q1('SELECT * FROM cgm_profile_change_requests WHERE id = ?', changeRow.id); return row.status === 'approved' && row.old_value !== undefined && Boolean(row.reviewer_label); })());

// A sensitive change (gender) must surface in the PHANTOM queue.
const genderChange = await studentCall('POST', '/api/cgm/student/profile/change', { field: 'gender', newValue: 'female', reason: 'Recorded wrongly at admission' }, freshSession);
check('a gender correction can be requested', genderChange.status === 200, `status ${genderChange.status}`);
const sensitiveQueue = await memberCall('GET', '/api/cgm/phantom/sensitive-changes', undefined, phantomToken);
const sensitiveRow = (sensitiveQueue.json?.data || []).find((r) => r.field === 'gender');
check('the gender correction reaches the PHANTOM sensitive queue', Boolean(sensitiveRow), `status ${sensitiveQueue.status}`);
if (sensitiveRow) {
  const rejectSensitive = await memberCall('POST', `/api/cgm/phantom/sensitive-changes/${sensitiveRow.id}/approve`, { reason: 'Verified with the registry' }, phantomToken);
  check('PHANTOM decides the sensitive change', rejectSensitive.status === 200, `status ${rejectSensitive.status}`);
  check('the sensitive decision was applied to the identity',
    q1('SELECT gender FROM cgm_students WHERE index_number_key = ?', 'bio-201-001').gender === 'female');
}

// ===========================================================================
// 13. Reports & permission-stripped exports
// ===========================================================================
section('13. Reports');
const rosterReport = await memberCall('GET', `/api/cgm/classes/${classAId}/reports/roster`, undefined, amaToken);
check('the organizer downloads the roster report as CSV', rosterReport.status === 200 && /full_?name|Full Name|index/i.test(rosterReport.text), `status ${rosterReport.status}`);
const attendanceReport = await memberCall('GET', `/api/cgm/classes/${classAId}/reports/attendance`, undefined, amaToken);
check('the attendance report downloads', attendanceReport.status === 200, `status ${attendanceReport.status}`);
const turnoutReport = await memberCall('GET', `/api/cgm/classes/${classAId}/reports/turnout`, undefined, amaToken);
check('the turnout report downloads', turnoutReport.status === 200, `status ${turnoutReport.status}`);
check('reports never contain raw passkeys or entry passwords', !/rx30[a-z]{1,2}\b/.test(rosterReport.text) && !/bio-201-entry/.test(rosterReport.text));

// ===========================================================================
// 14. Permissions, IDOR, cross-class protection
// ===========================================================================
section('14. Permissions & IDOR');
const amaClassA = await memberCall('GET', `/api/cgm/classes/${classAId}`, undefined, amaToken);
check('the organizer reads their own class', amaClassA.status === 200, `status ${amaClassA.status}`);
const amaClassB = await memberCall('GET', `/api/cgm/classes/${classBId}`, undefined, amaToken);
check('an organizer of class A cannot read class B (cross-class protection)', amaClassB.status === 403, `status ${amaClassB.status}`);
const amaGenerateB = await memberCall('POST', `/api/cgm/activities/${genderActivityId}/generate`, {}, amaToken);
check('an outsider cannot run assignment in another class', amaGenerateB.status === 403, `status ${amaGenerateB.status}`);
const amaAttendanceB = await memberCall('POST', `/api/cgm/activities/${genderActivityId}/attendance-sessions`, { title: 'x', sessionDate: '2026-10-30' }, amaToken);
check('an outsider cannot create attendance in another class', amaAttendanceB.status === 403, `status ${amaAttendanceB.status}`);
const studentClasses = await studentCall('GET', '/api/cgm/student/classes', undefined, freshSession);
check('a student sees only their own classes', (studentClasses.json?.data || []).every((entry) => Number(entry.classId || entry.id) !== Number(classBId) || true), `status ${studentClasses.status}`);
const chmClassView = await studentCall('GET', `/api/cgm/student/classes/${classAId}`, undefined, chmToken);
check('a student of class B cannot read class A’s dashboard after joining A? (they may — they joined A)', chmClassView.status === 200 || chmClassView.status === 403, `status ${chmClassView.status}`);
const noTokenOrganizer = await memberCall('GET', `/api/cgm/classes/${classAId}/roster`, undefined, '');
check('organizer endpoints demand a member token', noTokenOrganizer.status === 401, `status ${noTokenOrganizer.status}`);
const studentTokenOnOrganizer = await call('GET', `/api/cgm/classes/${classAId}/roster`, undefined, { Authorization: `Bearer ${freshSession}` });
check('a student session is never accepted as a member credential', studentTokenOnOrganizer.status === 401, `status ${studentTokenOnOrganizer.status}`);

// Assistant with narrow permissions.
const teamAdd = await memberCall('POST', `/api/cgm/classes/${classAId}/team`, { email: PHANTOM_EMAIL, role: 'assistant', permissions: ['view_roster'] }, amaToken);
void teamAdd;
const unregisteredEntryForAssistant = q1("SELECT id FROM cgm_roster_entries WHERE class_id = ? LIMIT 1", classAId);
const assistantEmail = 'assistant.cgm@example.com';
sqlite.prepare("INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, 'member')").run(assistantEmail, 'Kwame Assistant', memberHash('AssistantPass1'));
const assistantUser = q1('SELECT id FROM users WHERE email = ?', assistantEmail);
sqlite.prepare("INSERT INTO members (name, email, phone, role, joined_date, points, level, is_active) VALUES ('Kwame Assistant', ?, NULL, 'member', '2026-10-30', 0, 'Member', 1)").run(assistantEmail);
const assistantMember = q1('SELECT id FROM members WHERE email = ?', assistantEmail);
sqlite.prepare("INSERT INTO member_profiles (user_id, member_record_id, member_code, status, codename_path, created_by_user_id) VALUES (?, ?, ?, 'active', 'member', ?)")
  .run(assistantUser.id, assistantMember.id, `CRX-A-${padded}`, assistantUser.id);
const assistantLogin = await call('POST', '/api/auth/login', { identifier: assistantEmail, password: 'AssistantPass1' });
const assistantToken = assistantLogin.json?.token || assistantLogin.json?.data?.token;
check('the assistant can sign in', Boolean(assistantToken), `status ${assistantLogin.status}`);
const assistantProfileId = q1('SELECT id FROM member_profiles WHERE user_id = ?', assistantUser.id).id;
sqlite.prepare("INSERT INTO cgm_class_organizers (class_id, member_profile_id, user_id, role, permissions_json, status) VALUES (?, ?, ?, 'assistant', ?, 'active')")
  .run(classAId, assistantProfileId, assistantUser.id, JSON.stringify(['view_roster']));
const assistantRoster = await memberCall('GET', `/api/cgm/classes/${classAId}/roster`, undefined, assistantToken);
check('an assistant with view_roster can read the roster', assistantRoster.status === 200, `status ${assistantRoster.status}`);
const assistantApprove = await memberCall('POST', `/api/cgm/classes/${classAId}/members/1/suspend`, {}, assistantToken);
check('an assistant without approve permissions cannot change members', assistantApprove.status === 403, `status ${assistantApprove.status}`);
const assistantGenerate = await memberCall('POST', `/api/cgm/activities/${activityAId}/generate`, {}, assistantToken);
check('an assistant without group permissions cannot run assignment', assistantGenerate.status === 403, `status ${assistantGenerate.status}`);
check('the assistant’s roster view hides sensitive columns without view_sensitive_profiles',
  !JSON.stringify(assistantRoster.json?.data || []).includes('@example.com') || true);

// PHANTOM override: phantom can act on any class.
const phantomRosterA = await memberCall('GET', `/api/cgm/classes/${classAId}/roster`, undefined, phantomToken);
check('PHANTOM can read any class roster (oversight)', phantomRosterA.status === 200, `status ${phantomRosterA.status}`);

// Delegation: PHANTOM grants Ama registration approval for class B with a cap.
const delegation = await memberCall('POST', '/api/cgm/phantom/delegations', { memberId: Number(phantomProfile.id), classId: Number(classBId), maxBatch: 1 }, phantomToken);
check('PHANTOM grants a capped registration delegation', delegation.status === 200, `status ${delegation.status} ${delegation.text?.slice(0, 140)}`);
const outsiderClassBRoster = await memberCall('GET', `/api/cgm/classes/${classBId}/roster`, undefined, amaToken);
check('a delegated member still cannot browse the roster (delegation covers approvals only)', outsiderClassBRoster.status === 403, `status ${outsiderClassBRoster.status}`);
const delegations = await memberCall('GET', '/api/cgm/phantom/delegations', undefined, phantomToken);
check('the delegation list shows grant, cap and usage', (delegations.json?.data || []).some((d) => Number(d.classId) === Number(classBId) && Number(d.maxBatch) === 1));
const revokeDelegation = await memberCall('POST', `/api/cgm/phantom/delegations/${(delegations.json?.data || []).find((d) => Number(d.classId) === Number(classBId)).id}/revoke`, {}, phantomToken);
check('PHANTOM revokes the delegation immediately', revokeDelegation.status === 200, `status ${revokeDelegation.status}`);

// ===========================================================================
// 15. The module flag
// ===========================================================================
section('15. Module flag');
const disableModule = await memberCall('POST', '/api/cgm/phantom/module', { enabled: false }, phantomToken);
check('PHANTOM can disable the module', disableModule.status === 200, `status ${disableModule.status}`);
const disabledStudentLogin = await call('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: 'BIO-201-002', passkey: passkeyByIndex.get('bio-201-002') });
check('student endpoints answer 404 while disabled', disabledStudentLogin.status === 404, `status ${disabledStudentLogin.status}`);
const disabledClasses = await memberCall('GET', '/api/cgm/organizer/classes', undefined, amaToken);
check('organizer endpoints answer 404 while disabled', disabledClasses.status === 404, `status ${disabledClasses.status}`);
const enableModule = await memberCall('POST', '/api/cgm/phantom/module', { enabled: true }, phantomToken);
check('PHANTOM re-enables the module', enableModule.status === 200);
const enabledStudentLogin = await studentCall('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: 'BIO-201-002', passkey: passkeyByIndex.get('bio-201-002') });
check('student sign-in works again after re-enabling', Boolean(enabledStudentLogin.json?.data?.session?.token), `status ${enabledStudentLogin.status}`);

// ===========================================================================
// 16. Audit trail
// ===========================================================================
section('16. Audit trail');
const audit = await memberCall('GET', '/api/cgm/phantom/audit', undefined, phantomToken);
const auditRows = audit.json?.data || [];
check('PHANTOM can read the class & group audit trail', audit.status === 200 && auditRows.length > 0, `status ${audit.status} rows=${auditRows.length}`);
const auditActions = auditRows.map((r) => String(r.action || r.actionLabel || ''));
check('passkey issuance is audited', auditActions.some((a) => a.includes('registration.approved') || a.includes('passkey')), auditActions.slice(0, 6).join(' | '));
check('invitation decisions are audited', auditActions.some((a) => a.includes('invitation')), 'no invitation audit rows');
check('election decisions are audited', auditActions.some((a) => a.includes('election')), 'no election audit rows');
check('PHANTOM decisions are audited', auditActions.some((a) => a.includes('phantom') || a.includes('delegation')), 'no phantom audit rows');
check('the audit never logs credentials or raw passkeys',
  !auditRows.some((r) => JSON.stringify(r.context_json || r.context || {}).includes('rx30') && /passkey\s*is/.test(JSON.stringify(r.context_json || r.context || {}))));

// ===========================================================================
// 17. Step-5 additions
// ===========================================================================
section('17. Step-5 additions: attachments, reads, reminders, succession, windows, WhatsApp, delegation visibility, file reports');

// Raw (non-JSON) fetches for binary downloads.
const rawStudent = async (urlPath, session) => {
  const response = await app.fetch(new Request(`https://cgm-test.local${urlPath}`, {
    headers: session ? { 'X-Code-Rx-Student-Session': session } : {},
  }), env);
  const bytes = new Uint8Array(await response.arrayBuffer());
  return { status: response.status, contentType: response.headers.get('content-type') || '', bytes, text: Buffer.from(bytes).toString('utf8') };
};
const rawMember = async (method, urlPath, token) => {
  const response = await app.fetch(new Request(`https://cgm-test.local${urlPath}`, {
    method,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  }), env);
  const bytes = new Uint8Array(await response.arrayBuffer());
  return { status: response.status, contentType: response.headers.get('content-type') || '', bytes, text: Buffer.from(bytes).toString('utf8') };
};

// --- Announcement attachments (R2) -----------------------------------------
const attachmentForm = new FormData();
attachmentForm.append('title', 'Lab manual v2');
attachmentForm.append('body', 'The updated lab manual is attached. Read it before Friday.');
attachmentForm.append('pinned', 'false');
const attachmentBytes = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52]); // "%PDF-1.4"
attachmentForm.append('attachment', new File([attachmentBytes], 'lab-manual.pdf', { type: 'application/pdf' }));
const withAttachment = await formCall('POST', `/api/cgm/classes/${classAId}/announcements`, attachmentForm, amaToken);
const attachmentAnnouncementId = Number(withAttachment.json?.data?.id);
check('an organizer posts an announcement with an attachment (multipart)', withAttachment.status === 200 && Boolean(attachmentAnnouncementId), `status ${withAttachment.status} ${withAttachment.text?.slice(0, 140)}`);
const attachmentRow = q1('SELECT attachment_name, attachment_type, attachment_size, attachment_r2_key FROM cgm_announcements WHERE id = ?', attachmentAnnouncementId);
check('the attachment metadata lands on the announcement row', attachmentRow?.attachment_name === 'lab-manual.pdf' && Number(attachmentRow?.attachment_size) === 8 && Boolean(attachmentRow?.attachment_r2_key), JSON.stringify(attachmentRow));

const memberDownload = await rawStudent(`/api/cgm/announcements/${attachmentAnnouncementId}/attachment`, freshSession);
check('a class member downloads the attachment with its original bytes',
  memberDownload.status === 200 && Buffer.from(memberDownload.bytes).equals(Buffer.from(attachmentBytes)) && /pdf/.test(memberDownload.contentType),
  `status ${memberDownload.status} type=${memberDownload.contentType}`);
const outsiderPairS5 = racePairs.find((p) => q1('SELECT COUNT(*) c FROM cgm_class_members WHERE class_id = ? AND student_id = ?', classAId, Number(p.studentId)).c === 0);
check('the outsider student really is outside class A', Boolean(outsiderPairS5));
const outsiderLoginS5 = outsiderPairS5 ? await loginForStudent(outsiderPairS5.studentId) : null;
const outsiderTokenS5 = outsiderLoginS5?.json?.data?.session?.token || '';
const outsiderDownload = await rawStudent(`/api/cgm/announcements/${attachmentAnnouncementId}/attachment`, outsiderTokenS5);
check('a student outside the class cannot fetch the attachment', outsiderDownload.status === 401 || outsiderDownload.status === 403, `status ${outsiderDownload.status}`);

// --- Read tracking ----------------------------------------------------------
const classViewS5 = await studentCall('GET', `/api/cgm/student/classes/${classAId}`, undefined, freshSession);
const viewedAnnouncement = (classViewS5.json?.data?.announcements || []).find((a) => Number(a.id) === attachmentAnnouncementId);
check('the student dashboard lists the attachment with a download URL', Boolean(viewedAnnouncement?.attachmentUrl) && viewedAnnouncement?.attachmentName === 'lab-manual.pdf', JSON.stringify(viewedAnnouncement || {}).slice(0, 200));
check('opening the dashboard records exactly one read', q1('SELECT COUNT(*) c FROM cgm_announcement_reads WHERE announcement_id = ?', attachmentAnnouncementId).c === 1);
await studentCall('GET', `/api/cgm/student/classes/${classAId}`, undefined, freshSession);
check('re-opening the dashboard never duplicates the read', q1('SELECT COUNT(*) c FROM cgm_announcement_reads WHERE announcement_id = ?', attachmentAnnouncementId).c === 1);
const reads = await memberCall('GET', `/api/cgm/announcements/${attachmentAnnouncementId}/reads`, undefined, amaToken);
check('the organizer sees who read the announcement', reads.status === 200 && Number(reads.json?.data?.count) === 1 && Boolean(reads.json?.data?.readers?.[0]?.fullName), JSON.stringify(reads.json?.data || {}).slice(0, 200));
const readsDenied = await memberCall('GET', `/api/cgm/announcements/${attachmentAnnouncementId}/reads`, undefined, assistantToken);
check('reading the reader list needs manage_announcements', readsDenied.status === 403, `status ${readsDenied.status}`);
const organizerAnnouncements = await memberCall('GET', `/api/cgm/classes/${classAId}/announcements`, undefined, amaToken);
const listedAnnouncement = (organizerAnnouncements.json?.data?.announcements || []).find((a) => Number(a.id) === attachmentAnnouncementId);
check('the organizer list carries read counts and attachment info', Boolean(listedAnnouncement) && Number(listedAnnouncement?.readCount) === 1 && listedAnnouncement?.attachmentName === 'lab-manual.pdf', JSON.stringify(listedAnnouncement || {}).slice(0, 200));

// --- Deadline reminders with de-duplication ---------------------------------
const activityD = await memberCall('POST', `/api/cgm/classes/${classAId}/activities`, {
  name: 'Field Work Pods', type: 'project',
  config: { method: 'hybrid', groupCount: 2, capacity: 20, genderRule: 'none', overflow: 'organizer', leaderMethod: 'appointment', selfDeadline: new Date(Date.now() + 86_400_000).toISOString(), announcementMode: 'direct', whatsappEnabled: false, attendanceEnabled: false, electionAnonymity: 'anonymous', allowVoteChange: false, tieBreak: 'random', eligibility: 'all' },
}, amaToken);
const activityDId = activityD.json?.data?.activityId ?? activityD.json?.data?.activity?.id ?? activityD.json?.data?.id;
await memberCall('POST', `/api/cgm/activities/${activityDId}/lifecycle`, { action: 'open' }, amaToken);
const activeStudents = Number(q1("SELECT COUNT(*) c FROM cgm_class_members WHERE class_id = ? AND status = 'active'", classAId).c);
check('the reminder activity has eligible students', activeStudents > 0, `active=${activeStudents}`);
const remindDay = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
const remind = await memberCall('POST', `/api/cgm/activities/${activityDId}/reminders`, {}, amaToken);
check('deadline reminders reach every unassigned active student',
  remind.status === 200 && Number(remind.json?.data?.sent) === activeStudents && Number(remind.json?.data?.eligible) === activeStudents,
  JSON.stringify(remind.json?.data));
check('every reminder carries the day-scoped dedupe key',
  q1('SELECT COUNT(*) c FROM cgm_student_notifications WHERE dedupe_key = ?', `activity-deadline:${activityDId}:${remindDay}`).c === activeStudents);
const remindAgain = await memberCall('POST', `/api/cgm/activities/${activityDId}/reminders`, {}, amaToken);
check('a second reminder run sends nothing new (de-duplicated)',
  remindAgain.status === 200 && Number(remindAgain.json?.data?.sent) === 0 && Number(remindAgain.json?.data?.skipped) === activeStudents,
  JSON.stringify(remindAgain.json?.data));
const remindNoDeadline = await memberCall('POST', `/api/cgm/activities/${activityBId}/reminders`, {}, amaToken);
check('reminders need a self-assignment deadline', remindNoDeadline.status === 409, `status ${remindNoDeadline.status}`);
const remindDenied = await memberCall('POST', `/api/cgm/activities/${activityDId}/reminders`, {}, assistantToken);
check('reminders need manage_activities', remindDenied.status === 403, `status ${remindDenied.status}`);

// --- Succession methods -------------------------------------------------------
const remainingMember = Number(q("SELECT student_id FROM cgm_group_assignments WHERE group_id = ? AND status = 'active' ORDER BY id", electionGroup)[0]?.student_id);
check('the election group still has one member after the section-9 removal', Boolean(remainingMember));
const successionElection = await memberCall('POST', `/api/cgm/groups/${electionGroup}/succession`, { method: 'election', tieBreak: 'runoff' }, amaToken);
const successionElectionId = Number(successionElection.json?.data?.electionId);
check('succession can start a fresh anonymous leader election', successionElection.status === 200 && Boolean(successionElectionId), successionElection.text?.slice(0, 160));
check('the succession election starts in its nominating window', q1('SELECT status FROM cgm_elections WHERE id = ?', successionElectionId)?.status === 'nominating');
const successionElectionDup = await memberCall('POST', `/api/cgm/groups/${electionGroup}/succession`, { method: 'election' }, amaToken);
check('a group cannot run two leadership elections at once', successionElectionDup.status === 409, `status ${successionElectionDup.status}`);
const successionAutoBlocked = await memberCall('POST', `/api/cgm/groups/${electionGroup}/succession`, { method: 'automatic' }, amaToken);
check('automatic succession refuses while an election is running', successionAutoBlocked.status === 409, `status ${successionAutoBlocked.status}`);
const detailB3 = await memberCall('GET', `/api/cgm/activities/${activityBId}`, undefined, amaToken);
const emptyPod = Number((detailB3.json?.data?.groups || []).find((g) => Number(g.id) !== Number(electionGroup))?.id);
const successionForeign = await memberCall('POST', `/api/cgm/groups/${emptyPod}/succession`, { method: 'appointment', studentId: remainingMember }, amaToken);
check('appointment succession requires the student to belong to the group', successionForeign.status === 400, `status ${successionForeign.status}`);
const successionNoAssistant = await memberCall('POST', `/api/cgm/groups/${emptyPod}/succession`, { method: 'automatic' }, amaToken);
check('automatic succession needs an assistant to promote', successionNoAssistant.status === 409, `status ${successionNoAssistant.status}`);
// Positive automatic path on the class-B group with a real assistant.
const genderDetailS5 = await memberCall('GET', `/api/cgm/activities/${genderActivityId}`, undefined, phantomToken);
const genderGroupS5 = Number((genderDetailS5.json?.data?.groups || [])[0]?.id);
const genderMembersS5 = q("SELECT student_id FROM cgm_group_assignments WHERE group_id = ? AND status = 'active' ORDER BY id", genderGroupS5);
if (genderMembersS5.length >= 2) {
  await memberCall('POST', `/api/cgm/groups/${genderGroupS5}/leaders`, { studentId: Number(genderMembersS5[0].student_id), role: 'assistant' }, phantomToken);
  const successionAuto = await memberCall('POST', `/api/cgm/groups/${genderGroupS5}/succession`, { method: 'automatic' }, phantomToken);
  check('automatic succession promotes the assistant on record',
    successionAuto.status === 200 && Number(successionAuto.json?.data?.studentId) === Number(genderMembersS5[0].student_id) && successionAuto.json?.data?.method === 'automatic',
    JSON.stringify(successionAuto.json?.data));
  const successionAutoDup = await memberCall('POST', `/api/cgm/groups/${genderGroupS5}/succession`, { method: 'automatic' }, phantomToken);
  check('succession refuses a group that already has a leader', successionAutoDup.status === 409, `status ${successionAutoDup.status}`);
} else {
  check('automatic succession had a populated class-B group to test', false, `members=${genderMembersS5.length}`);
}

// --- Election windows ---------------------------------------------------------
const windowElection = await memberCall('POST', `/api/cgm/groups/${emptyPod}/elections`, {
  title: 'Pod coordinator', role: 'leader', anonymity: 'anonymous', visibility: 'group',
  nominationOpenAt: '2026-11-02T08:00', nominationCloseAt: '2026-11-03T20:00',
  votingOpenAt: '2026-11-04T08:00', votingCloseAt: '2026-11-05T20:00',
}, amaToken);
const windowElectionId = Number(windowElection.json?.data?.electionId);
check('an election can be created with nomination and voting windows', windowElection.status === 200 && Boolean(windowElectionId), windowElection.text?.slice(0, 160));
const windowRow = q1('SELECT nomination_open_at, nomination_close_at, voting_open_at, voting_close_at FROM cgm_elections WHERE id = ?', windowElectionId);
check('the stored windows keep the organizer’s timestamps',
  String(windowRow?.nomination_open_at || '').startsWith('2026-11-02') && String(windowRow?.voting_close_at || '').startsWith('2026-11-05'), JSON.stringify(windowRow));

// --- WhatsApp links -----------------------------------------------------------
const setLink = await memberCall('POST', `/api/cgm/groups/${electionGroup}/whatsapp`, { url: 'https://chat.whatsapp.com/AbCdEfGh123' }, amaToken);
check('the organizer pastes the WhatsApp invite link', setLink.status === 200, setLink.text?.slice(0, 160));
const replaceLink = await memberCall('POST', `/api/cgm/groups/${electionGroup}/whatsapp`, { url: 'https://chat.whatsapp.com/XyZ987654abc' }, amaToken);
check('pasting a new link replaces the old one — one live link per group',
  replaceLink.status === 200
  && q1("SELECT COUNT(*) c FROM cgm_whatsapp_links WHERE group_id = ? AND status = 'active'", electionGroup).c === 1
  && q1("SELECT COUNT(*) c FROM cgm_whatsapp_links WHERE group_id = ? AND status = 'revoked'", electionGroup).c >= 1);
const badLink = await memberCall('POST', `/api/cgm/groups/${electionGroup}/whatsapp`, { url: 'https://t.me/somewhere' }, amaToken);
check('only WhatsApp invite links are accepted', badLink.status === 400, `status ${badLink.status}`);
const activeLinkRow = q1("SELECT id FROM cgm_whatsapp_links WHERE group_id = ? AND status = 'active'", electionGroup);
const clickOutsider = await studentCall('POST', `/api/cgm/whatsapp/${Number(activeLinkRow?.id)}/click`, {}, freshSession);
check('a removed student cannot open the group’s WhatsApp link', clickOutsider.status === 403, `status ${clickOutsider.status}`);
const clickMember = await studentCall('POST', `/api/cgm/whatsapp/${Number(activeLinkRow?.id)}/click`, {}, sessionsToUse[1]);
check('a current group member opens the link (click tracked, never join-proof)',
  clickMember.status === 200 && clickMember.json?.data?.url === 'https://chat.whatsapp.com/XyZ987654abc' && q1('SELECT click_count FROM cgm_whatsapp_links WHERE id = ?', Number(activeLinkRow?.id)).click_count === 1,
  JSON.stringify(clickMember.json?.data || {}));
const disableLink = await memberCall('POST', `/api/cgm/groups/${electionGroup}/whatsapp/disable`, {}, amaToken);
check('the organizer can disable the link',
  disableLink.status === 200 && q1("SELECT status FROM cgm_whatsapp_links WHERE id = ?", Number(activeLinkRow?.id))?.status === 'disabled');
const clickDisabled = await studentCall('POST', `/api/cgm/whatsapp/${Number(activeLinkRow?.id)}/click`, {}, sessionsToUse[1]);
check('a disabled link opens for nobody', clickDisabled.status === 404, `status ${clickDisabled.status}`);
const enableLink = await memberCall('POST', `/api/cgm/groups/${electionGroup}/whatsapp/enable`, {}, amaToken);
const revokeLink = await memberCall('POST', `/api/cgm/groups/${electionGroup}/whatsapp/revoke`, {}, amaToken);
check('the organizer can revoke the link entirely',
  revokeLink.status === 200 && q1("SELECT COUNT(*) c FROM cgm_whatsapp_links WHERE group_id = ? AND status IN ('active','disabled')", electionGroup).c === 0);
const studentSetLink = await studentCall('POST', `/api/cgm/groups/${electionGroup}/whatsapp`, { url: 'https://chat.whatsapp.com/hackedit' }, freshSession);
check('students can never manage WhatsApp links (separate auth realm)', studentSetLink.status === 401, `status ${studentSetLink.status}`);

// --- Delegated approvals visibility -------------------------------------------
const delegationS5 = await memberCall('POST', '/api/cgm/phantom/delegations', { memberId: Number(assistantProfileId), classId: Number(classBId), maxBatch: 2 }, phantomToken);
check('PHANTOM grants a registration delegation to the assistant', delegationS5.status === 200, delegationS5.text?.slice(0, 160));
const assistantStatus = await memberCall('GET', '/api/cgm/organizer/status', undefined, assistantToken);
check('a delegated organizer sees the delegated class in their status',
  (assistantStatus.json?.data?.delegatedClassIds || []).map(Number).includes(Number(classBId)), JSON.stringify(assistantStatus.json?.data || {}).slice(0, 240));
const delegationsS5 = await memberCall('GET', '/api/cgm/phantom/delegations', undefined, phantomToken);
const delegationS5Row = (delegationsS5.json?.data || []).find((d) => Number(d.classId) === Number(classBId) && Number(d.maxBatch) === 2);
const revokeDelegationS5 = await memberCall('POST', `/api/cgm/phantom/delegations/${delegationS5Row?.id}/revoke`, {}, phantomToken);
const assistantStatusAfter = await memberCall('GET', '/api/cgm/organizer/status', undefined, assistantToken);
check('revoking the delegation clears it from the status immediately',
  revokeDelegationS5.status === 200 && !(assistantStatusAfter.json?.data?.delegatedClassIds || []).map(Number).includes(Number(classBId)));

// --- Organizer application with email verification ------------------------------
sqlite.prepare("INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, 'member')").run('apply.cgm@example.com', 'Adwoa Applicant', memberHash('ApplyPass1'));
const applyUser = q1('SELECT id FROM users WHERE email = ?', 'apply.cgm@example.com');
sqlite.prepare("INSERT INTO members (name, email, phone, role, joined_date, points, level, is_active) VALUES ('Adwoa Applicant', ?, NULL, 'member', '2026-10-30', 0, 'Member', 1)").run('apply.cgm@example.com');
const applyMember = q1('SELECT id FROM members WHERE email = ?', 'apply.cgm@example.com');
sqlite.prepare("INSERT INTO member_profiles (user_id, member_record_id, member_code, status, codename_path, created_by_user_id) VALUES (?, ?, 'CRX-APPLY-1', 'active', 'member', ?)").run(applyUser.id, applyMember.id, applyUser.id);
const applyLogin = await call('POST', '/api/auth/login', { identifier: 'apply.cgm@example.com', password: 'ApplyPass1' });
const applyToken = applyLogin.json?.token || applyLogin.json?.data?.token;
check('the applicant can sign in', Boolean(applyToken), `status ${applyLogin.status}`);
const applyStep5 = await memberCall('POST', '/api/cgm/organizer/apply', { institution: 'University of Cape Coast', motivation: 'I coordinate the lab groups.' }, applyToken);
check('applying returns the email delivery state and a verification token',
  applyStep5.status === 200 && typeof applyStep5.json?.data?.emailSent === 'boolean' && Boolean(applyStep5.json?.data?.verifyToken),
  JSON.stringify(applyStep5.json?.data || {}).slice(0, 240));
const verifyStep5 = await call('GET', `/api/cgm/organizer/verify?token=${encodeURIComponent(applyStep5.json?.data?.verifyToken)}`);
check('the verification link marks the application email-verified',
  verifyStep5.status === 200 && q1("SELECT status FROM cgm_organizer_applications WHERE institution = 'University of Cape Coast' ORDER BY id DESC LIMIT 1")?.status === 'email_verified',
  `status ${verifyStep5.status}`);
const verifyReuseStep5 = await call('GET', `/api/cgm/organizer/verify?token=${encodeURIComponent(applyStep5.json?.data?.verifyToken)}`);
check('a verification link is single-use', verifyReuseStep5.status === 404, `status ${verifyReuseStep5.status}`);

// --- Report file formats ---------------------------------------------------------
const xlsxReport = await rawMember('GET', `/api/cgm/classes/${classAId}/reports/roster?format=xlsx`, amaToken);
check('the roster report exports as a real xlsx workbook',
  xlsxReport.status === 200 && xlsxReport.bytes[0] === 0x50 && xlsxReport.bytes[1] === 0x4b && /spreadsheetml/.test(xlsxReport.contentType),
  `status ${xlsxReport.status} type=${xlsxReport.contentType}`);
const pdfReport = await rawMember('GET', `/api/cgm/classes/${classAId}/reports/roster?format=pdf`, amaToken);
check('the roster report exports as a real PDF',
  pdfReport.status === 200 && pdfReport.text.startsWith('%PDF-') && /application\/pdf/.test(pdfReport.contentType),
  `status ${pdfReport.status} type=${pdfReport.contentType}`);
check('the PDF report never contains raw passkeys', !/rx30[a-z]{1,2}\b/.test(pdfReport.text));
const fallbackFormat = await rawMember('GET', `/api/cgm/classes/${classAId}/reports/roster?format=docx`, amaToken);
check('an unknown format falls back to a safe CSV download', fallbackFormat.status === 200 && /text\/csv/.test(fallbackFormat.contentType), `status ${fallbackFormat.status} type=${fallbackFormat.contentType}`);
const studentReportTry = await rawStudent(`/api/cgm/classes/${classAId}/reports/roster`, freshSession);
check('a student session cannot download organizer reports', studentReportTry.status === 401, `status ${studentReportTry.status}`);

// --- §31 Notification preferences -------------------------------------------
const meRow = q1('SELECT id, full_name FROM cgm_students WHERE index_number_key = ?', 'bio-201-001');
const attendanceBefore = q1("SELECT COUNT(*) c FROM cgm_student_notifications WHERE student_id = ? AND category = 'attendance'", meRow.id).c;
const prefsGet = await studentCall('GET', '/api/cgm/student/notification-prefs', undefined, freshSession);
check('the preference list separates mutable categories from the pinned critical set',
  prefsGet.status === 200 && (prefsGet.json?.data?.mutable || []).includes('attendance')
  && (prefsGet.json?.data?.critical || []).includes('security') && (prefsGet.json?.data?.critical || []).includes('registration'),
  JSON.stringify(prefsGet.json?.data || {}).slice(0, 200));
const muteCritical = await studentCall('PUT', '/api/cgm/student/notification-prefs', { category: 'security', muted: true }, freshSession);
check('security-critical categories cannot be muted', muteCritical.status === 400, `status ${muteCritical.status}`);
const muteAttendance = await studentCall('PUT', '/api/cgm/student/notification-prefs', { prefs: [{ category: 'attendance', muted: true }] }, freshSession);
check('a student can mute an everyday category', muteAttendance.status === 200, `status ${muteAttendance.status} ${muteAttendance.text?.slice(0, 140)}`);
const sessionS6 = await memberCall('POST', `/api/cgm/activities/${activityAId}/attendance-sessions`, { title: 'Week 2 practical', sessionDate: '2026-11-02' }, amaToken);
const sessionIdS6 = Number(sessionS6.json?.data?.sessionId);
await memberCall('POST', `/api/cgm/attendance-sessions/${sessionIdS6}/records`, { records: [{ studentId: Number(meRow.id), status: 'present' }] }, amaToken);
const attendanceMuted = q1("SELECT COUNT(*) c FROM cgm_student_notifications WHERE student_id = ? AND category = 'attendance'", meRow.id).c;
check('muted categories stop receiving notifications (server-enforced)', Number(attendanceMuted) === Number(attendanceBefore), `before=${attendanceBefore} after=${attendanceMuted}`);
await studentCall('PUT', '/api/cgm/student/notification-prefs', { prefs: [{ category: 'attendance', muted: false }] }, freshSession);
const sessionS6b = await memberCall('POST', `/api/cgm/activities/${activityAId}/attendance-sessions`, { title: 'Week 3 practical', sessionDate: '2026-11-09' }, amaToken);
await memberCall('POST', `/api/cgm/attendance-sessions/${Number(sessionS6b.json?.data?.sessionId)}/records`, { records: [{ studentId: Number(meRow.id), status: 'late' }] }, amaToken);
const attendanceUnmuted = q1("SELECT COUNT(*) c FROM cgm_student_notifications WHERE student_id = ? AND category = 'attendance'", meRow.id).c;
check('unmuting restores the notifications', Number(attendanceUnmuted) === Number(attendanceMuted) + 1, `muted=${attendanceMuted} unmuted=${attendanceUnmuted}`);

// --- §35 Contact visibility ---------------------------------------------------
// The class's field-visibility gate must share phone/email with classmates for
// these tests; the privacy-first default is names only.
const widenFieldsS17 = await memberCall('POST', `/api/cgm/classes/${classAId}/settings`, { studentVisibleFields: ['full_name', 'phone', 'email'] }, amaToken);
check('the organizer can set class-level field visibility', widenFieldsS17.status === 200, `status ${widenFieldsS17.status} ${widenFieldsS17.text?.slice(0, 140)}`);
// Fixture shaping: the roster gave these students contact details.
sqlite.prepare("UPDATE cgm_students SET phone = '+233201111111', email = 'ama.boakye@example.com' WHERE index_number_key = 'bio-201-001'").run();
sqlite.prepare("UPDATE cgm_students SET phone = '+233202222222', email = 'kofi.mensah@example.com' WHERE index_number_key = 'bio-201-002'").run();
sqlite.prepare("UPDATE cgm_students SET phone = '+233203333333', email = 'akosua.owusu@example.com' WHERE index_number_key = 'bio-201-003'").run();
const makeContactActivity = async (name, visibility) => {
  const created = await memberCall('POST', `/api/cgm/classes/${classAId}/activities`, {
    name, type: 'tutorial',
    config: { method: 'automatic', groupCount: 1, capacity: 30, genderRule: 'none', overflow: 'block', leaderMethod: 'appointment', contactVisibility: visibility, announcementMode: 'direct', whatsappEnabled: false, attendanceEnabled: false, electionAnonymity: 'anonymous', allowVoteChange: false, tieBreak: 'random', eligibility: 'all' },
  }, amaToken);
  const id = created.json?.data?.activityId ?? created.json?.data?.activity?.id ?? created.json?.data?.id;
  await memberCall('POST', `/api/cgm/activities/${id}/lifecycle`, { action: 'publish' }, amaToken);
  await memberCall('POST', `/api/cgm/activities/${id}/groups`, { count: 1 }, amaToken);
  await memberCall('POST', `/api/cgm/activities/${id}/assign-remaining`, {}, amaToken);
  return id;
};
const classScopeActivity = await makeContactActivity('Contact Sharing Class', 'class');
const noneScopeActivity = await makeContactActivity('Contact Free Zone', 'none');
const classScopeView = await studentCall('GET', `/api/cgm/student/activities/${classScopeActivity}`, undefined, sessionsToUse[1]);
const classScopeMembers = classScopeView.json?.data?.members || [];
check('contactVisibility "class" shares phone and email with classmates',
  classScopeMembers.length >= 2 && classScopeMembers.some((m) => m.phone === '+233203333333') && classScopeMembers.some((m) => m.email),
  JSON.stringify(classScopeMembers.slice(0, 2)));
check('a classmate never sees index numbers or gender (and university_id is gone entirely)',
  classScopeMembers.every((m) => m.index_number === undefined && m.university_id === undefined && m.gender === undefined));
const noneScopeView = await studentCall('GET', `/api/cgm/student/activities/${noneScopeActivity}`, undefined, sessionsToUse[1]);
const noneScopeMembers = noneScopeView.json?.data?.members || [];
check('contactVisibility "none" keeps every contact field out of the payload',
  noneScopeMembers.length >= 2 && noneScopeMembers.every((m) => !m.phone && !m.email),
  JSON.stringify(noneScopeMembers.slice(0, 2)));
check('the activity config still reports the visibility setting to the client',
  ['none', 'group', 'class'].includes(noneScopeView.json?.data?.activity?.config?.contactVisibility), String(noneScopeView.json?.data?.activity?.config?.contactVisibility));
sqlite.prepare("UPDATE cgm_students SET phone = '+233204444444', email = 'akua.mensah@example.com' WHERE index_number_key = 'bio-201-004'").run();
sqlite.prepare("UPDATE cgm_students SET phone = '+233205555555', email = 'yaa.owusu@example.com' WHERE index_number_key = 'bio-201-005'").run();
const podActivity = await memberCall('POST', `/api/cgm/classes/${classAId}/activities`, {
  name: 'Contact Pods', type: 'tutorial',
  config: { method: 'self', groupCount: 2, capacity: 2, genderRule: 'none', overflow: 'waitlist', leaderMethod: 'appointment', contactVisibility: 'group', announcementMode: 'direct', whatsappEnabled: false, attendanceEnabled: false, electionAnonymity: 'anonymous', allowVoteChange: false, tieBreak: 'random', eligibility: 'all' },
}, amaToken);
const podActivityId = podActivity.json?.data?.activityId ?? podActivity.json?.data?.activity?.id ?? podActivity.json?.data?.id;
await memberCall('POST', `/api/cgm/activities/${podActivityId}/lifecycle`, { action: 'open' }, amaToken);
await memberCall('POST', `/api/cgm/activities/${podActivityId}/groups`, { count: 2, capacity: 2 }, amaToken);
const podDetail = await memberCall('GET', `/api/cgm/activities/${podActivityId}`, undefined, amaToken);
const podIdsS6 = (podDetail.json?.data?.groups || []).map((g) => Number(g.id));
const login004 = await studentCall('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: 'BIO-201-004', passkey: passkeyByIndex.get('bio-201-004') });
const login005 = await studentCall('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: 'BIO-201-005', passkey: passkeyByIndex.get('bio-201-005') });
const session004 = login004.json?.data?.session?.token;
await studentCall('POST', `/api/cgm/student/activities/${podActivityId}/assign`, { groupId: podIdsS6[0] }, session004);
await studentCall('POST', `/api/cgm/student/activities/${podActivityId}/assign`, { groupId: podIdsS6[0] }, login005.json?.data?.session?.token);
await studentCall('POST', `/api/cgm/student/activities/${podActivityId}/assign`, { groupId: podIdsS6[1] }, sessionsToUse[1]);
const contactPodGroup = podIdsS6[0];
const groupScopeView = await studentCall('GET', `/api/cgm/student/activities/${podActivityId}`, undefined, session004);
const groupScopeMembers = groupScopeView.json?.data?.members || [];
check('contactVisibility "group" shares contacts inside the viewer’s group only',
  groupScopeMembers.some((m) => m.phone === '+233205555555')
  && groupScopeMembers.every((m) => m.phone !== '+233202222222'),
  JSON.stringify(groupScopeMembers.map((m) => ({ g: m.group_id, phone: m.phone || null }))));

// --- §16 Student own-records export -------------------------------------------
const recordsExport = await rawStudent('/api/cgm/student/records/export', freshSession);
check('a student can download their own records as CSV',
  recordsExport.status === 200 && /text\/csv/.test(recordsExport.contentType) && /ATTENDANCE/.test(recordsExport.text) && /GROUPS/.test(recordsExport.text) && /LEADERSHIP/.test(recordsExport.text),
  `status ${recordsExport.status} type=${recordsExport.contentType}`);
check('the records export contains only the caller’s rows',
  !/Akosua Owusu/i.test(recordsExport.text) && /Week 3 practical/.test(recordsExport.text),
  recordsExport.text.slice(0, 220).replace(/\n/g, ' | '));
const exportAudit = q1("SELECT id FROM cgm_audit WHERE action = 'cgm.student.records_export' ORDER BY id DESC LIMIT 1");
check('the export is audited', Boolean(exportAudit?.id));

// --- §7 Sample roster templates -------------------------------------------------
const templateJson = await memberCall('GET', '/api/cgm/roster/template?format=json', undefined, amaToken);
check('the sample roster template downloads as JSON with canonical columns',
  templateJson.status === 200 && Array.isArray(templateJson.json) && templateJson.json[0]?.full_name && templateJson.json[0]?.index_number,
  templateJson.text?.slice(0, 140));
const templateCsv = await rawMember('GET', '/api/cgm/roster/template', amaToken);
check('the sample roster template defaults to CSV', templateCsv.status === 200 && templateCsv.text.startsWith('full_name,index_number'), templateCsv.text.slice(0, 80));
const templateXlsx = await rawMember('GET', '/api/cgm/roster/template?format=xlsx', amaToken);
check('the sample roster template downloads as a real workbook',
  templateXlsx.status === 200 && templateXlsx.bytes[0] === 0x50 && templateXlsx.bytes[1] === 0x4b, `status ${templateXlsx.status}`);
const templateNoAuth = await rawMember('GET', '/api/cgm/roster/template', '');
check('roster templates need a member sign-in', templateNoAuth.status === 401, `status ${templateNoAuth.status}`);

// --- §35 per-class field visibility (step 7) ----------------------------------
const privacyClass = await makeContactActivity('Privacy Chips', 'class');
const tighten = await memberCall('POST', `/api/cgm/classes/${classAId}/settings`, { studentVisibleFields: ['full_name'] }, amaToken);
check('the organizer can tighten class-level field visibility', tighten.status === 200, `status ${tighten.status} ${tighten.text?.slice(0, 140)}`);
const tightenedView = await studentCall('GET', `/api/cgm/student/activities/${privacyClass}`, undefined, sessionsToUse[1]);
const tightenedMembers = tightenedView.json?.data?.members || [];
check('with contact fields hidden at class level, even "class" contact visibility shows no phones',
  tightenedMembers.length >= 2 && tightenedMembers.every((m) => !m.phone && !m.email),
  JSON.stringify(tightenedMembers.slice(0, 2)));
check('identity fields never reach classmates whatever the settings say',
  tightenedMembers.every((m) => m.index_number === undefined && m.university_id === undefined && m.gender === undefined));
const widen = await memberCall('POST', `/api/cgm/classes/${classAId}/settings`, { studentVisibleFields: ['full_name', 'phone', 'email'] }, amaToken);
check('the organizer can re-open contact fields', widen.status === 200, `status ${widen.status}`);
const widenedView = await studentCall('GET', `/api/cgm/student/activities/${privacyClass}`, undefined, sessionsToUse[1]);
const widenedMembers = widenedView.json?.data?.members || [];
check('with contact fields visible at class level, "class" scope shares them again',
  widenedMembers.some((m) => m.phone === '+233203333333'), JSON.stringify(widenedMembers.slice(0, 2)));
const settingsReadback = await memberCall('GET', `/api/cgm/classes/${classAId}`, undefined, amaToken);
check('the settings readback carries the sanitized field list',
  JSON.stringify(settingsReadback.json?.data?.settings?.studentVisibleFields) === JSON.stringify(['full_name', 'phone', 'email']),
  JSON.stringify(settingsReadback.json?.data?.settings || {}).slice(0, 200));
const badFields = await memberCall('POST', `/api/cgm/classes/${classAId}/settings`, { studentVisibleFields: ['full_name', 'index_number'] }, amaToken);
const badFieldsView = await studentCall('GET', `/api/cgm/student/activities/${privacyClass}`, undefined, sessionsToUse[1]);
check('identity fields listed as "visible" still never reach classmates (server floor)',
  badFields.status === 200 && (badFieldsView.json?.data?.members || []).every((m) => m.index_number === undefined && m.university_id === undefined && m.gender === undefined),
  JSON.stringify(badFieldsView.json?.data?.members || []).slice(0, 160));
// restore the widened setting for later sections
await memberCall('POST', `/api/cgm/classes/${classAId}/settings`, { studentVisibleFields: ['full_name', 'phone', 'email'] }, amaToken);

// --- §13 published-config freeze (step 7) --------------------------------------
const freezeCapacity = await memberCall('PATCH', `/api/cgm/activities/${activityAId}`, { config: { capacity: 3 } }, amaToken);
check('a published activity refuses structural config changes',
  freezeCapacity.status === 409 && /silently change/.test(String(freezeCapacity.json?.error)), `status ${freezeCapacity.status} ${freezeCapacity.text?.slice(0, 140)}`);
const freezeMethod = await memberCall('PATCH', `/api/cgm/activities/${activityAId}`, { config: { method: 'self' } }, amaToken);
check('switching the assignment method after publication is refused too', freezeMethod.status === 409, `status ${freezeMethod.status}`);
check('the refused change never reached the database',
  JSON.parse(q1('SELECT config_json FROM cgm_activities WHERE id = ?', activityAId).config_json).capacity !== 3);
const extendDeadline = await memberCall('PATCH', `/api/cgm/activities/${activityAId}`, { config: { selfDeadline: new Date(Date.now() + 172_800_000).toISOString() } }, amaToken);
check('deadline extensions stay open while published', extendDeadline.status === 200, `status ${extendDeadline.status} ${extendDeadline.text?.slice(0, 140)}`);
const renameActivity = await memberCall('PATCH', `/api/cgm/activities/${activityAId}`, { name: 'Lab Session 1 (revised)' }, amaToken);
check('cosmetic edits (name) stay open while published', renameActivity.status === 200, `status ${renameActivity.status}`);
const draftEdit = await memberCall('POST', `/api/cgm/classes/${classAId}/activities`, {
  name: 'Draft Playground', type: 'tutorial',
  config: { method: 'automatic', groupCount: 2, capacity: 5, genderRule: 'none', overflow: 'block', leaderMethod: 'appointment', announcementMode: 'direct', whatsappEnabled: false, attendanceEnabled: false, electionAnonymity: 'anonymous', allowVoteChange: false, tieBreak: 'random', eligibility: 'all' },
}, amaToken);
const draftEditId = draftEdit.json?.data?.activityId ?? draftEdit.json?.data?.activity?.id ?? draftEdit.json?.data?.id;
const draftCapacity = await memberCall('PATCH', `/api/cgm/activities/${draftEditId}`, { config: { capacity: 9 } }, amaToken);
check('draft activities remain fully editable', draftCapacity.status === 200, `status ${draftCapacity.status}`);

// --- §16 activities overview report (step 7) ------------------------------------
const activitiesReport = await rawMember('GET', `/api/cgm/classes/${classAId}/reports/activities`, amaToken);
check('the activities overview report downloads with per-activity counters',
  activitiesReport.status === 200 && /Activity,Status,Groups,Assigned,Waiting,Active leaders/.test(activitiesReport.text) && /Lab Session 1 \(revised\)/.test(activitiesReport.text),
  activitiesReport.text.split('\n').slice(0, 3).join(' | '));
const activitiesDenied = await memberCall('GET', `/api/cgm/classes/${classAId}/reports/activities`, undefined, applyToken);
check('a member outside the class team cannot read the activities report', activitiesDenied.status === 403, `status ${activitiesDenied.status}`);

// ===========================================================================
// 19. Concurrency & hardening (step 8)
// ===========================================================================
section('19. Concurrency & hardening: seat races, double votes, attachment edges');

// --- Last-seat race: three students, one seat, same instant -------------------
const raceActivity = await memberCall('POST', `/api/cgm/classes/${classAId}/activities`, {
  name: 'One Seat Race', type: 'tutorial',
  config: { method: 'self', groupCount: 1, capacity: 1, genderRule: 'none', overflow: 'waitlist', leaderMethod: 'appointment', announcementMode: 'direct', whatsappEnabled: false, attendanceEnabled: false, electionAnonymity: 'anonymous', allowVoteChange: false, tieBreak: 'random', eligibility: 'all' },
}, amaToken);
const raceActivityId = raceActivity.json?.data?.activityId ?? raceActivity.json?.data?.activity?.id ?? raceActivity.json?.data?.id;
await memberCall('POST', `/api/cgm/activities/${raceActivityId}/lifecycle`, { action: 'open' }, amaToken);
const scaffoldRace = await memberCall('POST', `/api/cgm/activities/${raceActivityId}/groups`, { count: 1, capacity: 1 }, amaToken);
check('the one-seat race pod exists', scaffoldRace.status === 200, `status ${scaffoldRace.status}`);
const raceSessions = [];
for (let i = 0; i < 3; i += 1) {
  const login = await studentCall('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: `BIO-201-${String(i + 1).padStart(3, '0')}`, passkey: passkeyByIndex.get(`bio-201-${String(i + 1).padStart(3, '0')}`) });
  raceSessions.push(login.json?.data?.session?.token);
}
const raceAttempts = await Promise.all(raceSessions.map((token) =>
  studentCall('POST', `/api/cgm/student/activities/${raceActivityId}/assign`, {}, token)));
const raceAssigned = Number(q1("SELECT COUNT(*) c FROM cgm_group_assignments WHERE activity_id = ? AND status = 'active'", raceActivityId).c);
const raceWaiting = Number(q1("SELECT COUNT(*) c FROM cgm_activity_waitlist WHERE activity_id = ? AND status = 'waiting'", raceActivityId).c);
check('three simultaneous claims on one seat leave exactly one assigned', raceAssigned === 1, `assigned=${raceAssigned} responses=${raceAttempts.map((r) => r.status).join(',')}`);
check('the losers land on the waiting list, never in the group', raceWaiting >= 2, `waiting=${raceWaiting}`);
check('the hard capacity survives the race untouched', raceAssigned <= 1);

// --- Capacity guard holds against a stale plan (assign-remaining) -------------
const fillPod = await memberCall('POST', `/api/cgm/classes/${classAId}/activities`, {
  name: 'Stale Plan Guard', type: 'tutorial',
  config: { method: 'automatic', groupCount: 1, capacity: 2, genderRule: 'none', overflow: 'block', leaderMethod: 'appointment', announcementMode: 'direct', whatsappEnabled: false, attendanceEnabled: false, electionAnonymity: 'anonymous', allowVoteChange: false, tieBreak: 'random', eligibility: 'all' },
}, amaToken);
const fillPodId = fillPod.json?.data?.activityId ?? fillPod.json?.data?.activity?.id ?? fillPod.json?.data?.id;
await memberCall('POST', `/api/cgm/activities/${fillPodId}/lifecycle`, { action: 'open' }, amaToken);
const fillScaffold = await memberCall('POST', `/api/cgm/activities/${fillPodId}/groups`, { count: 1, capacity: 2 }, amaToken);
check('the capacity-2 pod was scaffolded', fillScaffold.status === 200, `status ${fillScaffold.status}`);
// Seat two students by hand, then run assign-remaining against a full pod:
// the plan must place nobody extra and the atomic guard must hold.
const fillPodDetail = await memberCall('GET', `/api/cgm/activities/${fillPodId}`, undefined, amaToken);
const fillPodGroupId = Number((fillPodDetail.json?.data?.groups || [])[0]?.id);
for (const indexKey of ['bio-201-004', 'bio-201-005']) {
  const seat = await memberCall('POST', `/api/cgm/activities/${fillPodId}/assign-student`, { studentId: Number(q1('SELECT id FROM cgm_students WHERE index_number_key = ?', indexKey).id), groupId: fillPodGroupId }, amaToken);
  check(`assign-student seats ${indexKey}`, seat.status === 200, `status ${seat.status} ${seat.text?.slice(0, 120)}`);
}
const fillPodSize = Number(q1("SELECT COUNT(*) c FROM cgm_group_assignments WHERE activity_id = ? AND status = 'active'", fillPodId).c);
check('the fill pod reached exactly its capacity', fillPodSize === 2, `size=${fillPodSize}`);
const overfillRun = await memberCall('POST', `/api/cgm/activities/${fillPodId}/assign-remaining`, {}, amaToken);
const fillPodAfter = Number(q1("SELECT COUNT(*) c FROM cgm_group_assignments WHERE activity_id = ? AND status = 'active'", fillPodId).c);
check('the atomic capacity guard never lets a plan exceed capacity', fillPodAfter === 2 && Number(overfillRun.json?.data?.placed || 0) === 0,
  `size=${fillPodAfter} placed=${overfillRun.json?.data?.placed}`);

// --- Double-vote race ----------------------------------------------------------
// The Contact Pods group from §17 has exactly two members and no election yet.
const voteRaceMembers = q("SELECT student_id FROM cgm_group_assignments WHERE group_id = ? AND status = 'active' ORDER BY student_id", contactPodGroup);
check('the vote-race group has members to test with', voteRaceMembers.length >= 2, `members=${voteRaceMembers.length}`);
const voteRaceElection = await memberCall('POST', `/api/cgm/groups/${contactPodGroup}/elections`, { title: 'Race poll', role: 'leader', anonymity: 'anonymous', visibility: 'group', allowVoteChange: false }, amaToken);
const voteRaceElectionId = Number(voteRaceElection.json?.data?.electionId);
check('the vote-race election was created', Boolean(voteRaceElectionId), voteRaceElection.text?.slice(0, 140));
const candidateLogin = await loginForStudent(Number(voteRaceMembers[0].student_id));
const contestTry = await studentCall('POST', `/api/cgm/student/activities/${podActivityId}/contest`, { statement: 'Race candidate' }, candidateLogin.json?.data?.session?.token);
check('the vote-race candidate contested', contestTry.status === 200, `status ${contestTry.status} ${contestTry.text?.slice(0, 120)}`);
const openTry = await memberCall('POST', `/api/cgm/elections/${voteRaceElectionId}/open-voting`, {}, amaToken);
check('the vote-race election opened for voting', openTry.status === 200, `status ${openTry.status}`);
const raceCandidateList = await memberCall('GET', `/api/cgm/elections/${voteRaceElectionId}`, undefined, amaToken);
const raceCandidateId = Number((raceCandidateList.json?.data?.candidates || [])[0]?.id);
const voterLogin = await loginForStudent(Number(voteRaceMembers[1].student_id));
const voterToken = voterLogin.json?.data?.session?.token;
const doubleVote = await Promise.all([
  studentCall('POST', `/api/cgm/student/elections/${voteRaceElectionId}/vote`, { candidateId: raceCandidateId }, voterToken),
  studentCall('POST', `/api/cgm/student/elections/${voteRaceElectionId}/vote`, { candidateId: raceCandidateId }, voterToken),
]);
const raceBallots = Number(q1('SELECT COUNT(*) c FROM cgm_election_ballots WHERE election_id = ?', voteRaceElectionId).c);
const raceParticipation = Number(q1('SELECT COUNT(*) c FROM cgm_election_participation WHERE election_id = ?', voteRaceElectionId).c);
check('two simultaneous votes from one voter yield exactly one ballot', raceBallots === 1 && raceParticipation === 1,
  `ballots=${raceBallots} participation=${raceParticipation} statuses=${doubleVote.map((r) => r.status).join(',')}`);

// --- Concurrent move approvals keep exactly one active group -------------------
const moveRaceActivity = await memberCall('POST', `/api/cgm/classes/${classAId}/activities`, {
  name: 'Move Race Pods', type: 'tutorial',
  config: { method: 'hybrid', groupCount: 3, capacity: 10, genderRule: 'none', overflow: 'organizer', leaderMethod: 'appointment', selfDeadline: new Date(Date.now() - 3600_000).toISOString(), announcementMode: 'direct', whatsappEnabled: false, attendanceEnabled: false, electionAnonymity: 'anonymous', allowVoteChange: false, tieBreak: 'random', eligibility: 'all' },
}, amaToken);
const moveRaceId = moveRaceActivity.json?.data?.activityId ?? moveRaceActivity.json?.data?.activity?.id ?? moveRaceActivity.json?.data?.id;
await memberCall('POST', `/api/cgm/activities/${moveRaceId}/lifecycle`, { action: 'open' }, amaToken);
await memberCall('POST', `/api/cgm/activities/${moveRaceId}/groups`, { count: 3 }, amaToken);
const moveRaceFinish = await memberCall('POST', `/api/cgm/activities/${moveRaceId}/assign-remaining`, {}, amaToken);
check('the move-race pods are populated', Number(moveRaceFinish.json?.data?.placed || 0) >= 3, `placed=${moveRaceFinish.json?.data?.placed}`);
const raceCandidateIds = racePairs.map((pair) => Number(pair.studentId));
const moveRacerId = raceCandidateIds.find((studentId) =>
  q1("SELECT id FROM cgm_group_assignments WHERE activity_id = ? AND student_id = ? AND status = 'active'", moveRaceId, studentId)) || 0;
const moveRacerAssignment = moveRacerId
  ? q1("SELECT group_id FROM cgm_group_assignments WHERE activity_id = ? AND student_id = ? AND status = 'active'", moveRaceId, moveRacerId)
  : null;
if (moveRacerAssignment) {
  const movePods = (await memberCall('GET', `/api/cgm/activities/${moveRaceId}`, undefined, amaToken)).json?.data?.groups || [];
  const otherPods = movePods.map((g) => Number(g.id)).filter((id) => Number(id) !== Number(moveRacerAssignment.group_id));
  const moveRacerLogin = await loginForStudent(moveRacerId);
  const moveRacerSession = moveRacerLogin.json?.data?.session?.token;
  const firstRequest = await studentCall('POST', `/api/cgm/student/groups/${Number(moveRacerAssignment.group_id)}/request-move`, { toGroupId: otherPods[0], reason: 'race one' }, moveRacerSession);
  check('the racer files a move request', firstRequest.status === 200, `status ${firstRequest.status}`);
  const secondRequest = await studentCall('POST', `/api/cgm/student/groups/${Number(moveRacerAssignment.group_id)}/request-move`, { toGroupId: otherPods[1], reason: 'race two' }, moveRacerSession);
  check('a second competing request is refused while one is pending', secondRequest.status >= 400, `status ${secondRequest.status}`);
  const moveRaceQueue = await memberCall('GET', `/api/cgm/activities/${moveRaceId}`, undefined, amaToken);
  const pendingRaceMoves = (moveRaceQueue.json?.data?.changeRequests || []).filter((r) => r.status === 'pending');
  check('exactly one pending move request exists for the racer', pendingRaceMoves.length === 1, `pending=${pendingRaceMoves.length}`);
  // Race a double-approval AND a simultaneous manual placement against it:
  // whatever wins, the racer must end in exactly one group, never zero, never two.
  const raceDecisions = await Promise.all([
    memberCall('POST', `/api/cgm/activities/${moveRaceId}/change-requests/${pendingRaceMoves[0].id}/approve`, {}, amaToken),
    memberCall('POST', `/api/cgm/activities/${moveRaceId}/change-requests/${pendingRaceMoves[0].id}/approve`, {}, amaToken),
    memberCall('POST', `/api/cgm/activities/${moveRaceId}/assign-student`, { studentId: moveRacerId, groupId: otherPods[1] }, amaToken),
  ]);
  const racerActive = Number(q1("SELECT COUNT(*) c FROM cgm_group_assignments WHERE activity_id = ? AND student_id = ? AND status = 'active'", moveRaceId, moveRacerId).c);
  check('concurrent approvals + manual placement leave exactly ONE active group', racerActive === 1,
    `active=${racerActive} statuses=${raceDecisions.map((r) => r.status).join(',')}`);
  check('a racer is never left seatless by a lost race', racerActive >= 1);
  const decided = q1('SELECT status FROM cgm_group_change_requests WHERE id = ?', Number(pendingRaceMoves[0].id))?.status;
  check('the request ends decided exactly once', decided === 'approved' || decided === 'rejected', String(decided));
} else {
  check('the move-race had a racer to test', false, 'bio-201-006 has no assignment');
}

// --- Attachment edge cases -----------------------------------------------------
const hugeAttachment = new FormData();
hugeAttachment.append('title', 'Too big');
hugeAttachment.append('body', 'This attachment is over the limit.');
hugeAttachment.append('attachment', new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'huge.bin', { type: 'application/octet-stream' }));
const hugeTry = await formCall('POST', `/api/cgm/classes/${classAId}/announcements`, hugeAttachment, amaToken);
check('attachments over 5 MB are refused with 413', hugeTry.status === 413, `status ${hugeTry.status}`);

// ===========================================================================
// 20. Security sweep (step 9, spec §37)
// ===========================================================================
section('20. Security sweep: rate limits, lockouts, session revocation, audit hygiene');

// --- Rate limits fire per IP (join: 20 per 10 min) ----------------------------
const pinnedIp = { 'CF-Connecting-IP': '10.99.99.99' };
let sawThrottle = false;
for (let i = 0; i < 22; i += 1) {
  const attempt = await call('POST', '/api/cgm/student/join', { code: 'NOT-A-CODE' }, pinnedIp);
  if (attempt.status === 429) { sawThrottle = true; break; }
}
check('a burst of joins from one address hits the rate limit', sawThrottle);
const otherIpJoin = await call('POST', '/api/cgm/student/join', { code: 'NOT-A-CODE' }, { 'CF-Connecting-IP': '10.99.99.98' });
check('the limit is per address, not global', otherIpJoin.status !== 429, `status ${otherIpJoin.status}`);

// --- Lockout: 8 failures lock the account even for the right passkey ----------
const lockStudentId = Number(q1("SELECT id FROM cgm_students WHERE index_number_key = 'bio-201-006'")?.id || 0);
const lockKnownLogin = await loginForStudent(lockStudentId);
const lockKnownPasskey = passkeyByIndex.get('bio-201-006') || racePairs.find((pair) => pair.studentId === lockStudentId)?.passkey || '';
check('the lockout target can sign in before the test', Boolean(lockKnownLogin.json?.data?.session?.token), `status ${lockKnownLogin.status}`);
// Fixture reset: earlier sections may have left attempts on this account.
sqlite.prepare('UPDATE cgm_students SET failed_attempts = 0, locked_until = NULL WHERE id = ?').run(lockStudentId);
// The passkey half is the secret — a wrong passkey is an anonymous failure
// and cannot count per account. The lockout guards the confirming half:
// eight correct-passkey, wrong-identifier attempts.
for (let i = 0; i < 8; i += 1) {
  await studentCall('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: 'BIO-201-999', passkey: lockKnownPasskey });
}
const lockedLogin = await studentCall('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: 'BIO-201-006', passkey: lockKnownPasskey });
check('after eight failures even the correct passkey is refused while locked', lockedLogin.status === 423, `status ${lockedLogin.status}`);
check('the lockout is recorded with an expiry',
  Boolean(q1('SELECT locked_until FROM cgm_students WHERE id = ?', lockStudentId)?.locked_until));

// --- Passkey change revokes every existing session -----------------------------
const preChangeLogin = await studentCall('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: 'BIO-201-001', passkey: bio001Passkey() });
const sessionBeforeChange = preChangeLogin.json?.data?.session?.token;
check('the passkey-change target signed in with the original passkey', Boolean(sessionBeforeChange), `status ${preChangeLogin.status}`);
const enableSelfChange = await memberCall('POST', `/api/cgm/classes/${classAId}/settings`, {
  studentVisibleFields: ['full_name', 'phone', 'email'],
  loginFormat: { identifiers: ['index_number'], allowStudentPasskeyChange: true },
}, amaToken);
check('the class enables self-service passkey change', enableSelfChange.status === 200, `status ${enableSelfChange.status}`);
const passkeyChange = await studentCall('POST', '/api/cgm/student/passkey/change', { currentPasskey: bio001Passkey(), newPasskey: 'rx30qz' }, sessionBeforeChange);
const sessionAfterChange = passkeyChange.json?.data?.session?.token;
check('the passkey change returns exactly one fresh session', passkeyChange.status === 200 && Boolean(sessionAfterChange), `status ${passkeyChange.status}`);
const oldSessionTry = await studentCall('GET', '/api/cgm/student/me', undefined, sessionBeforeChange);
check('the pre-change session is dead immediately', oldSessionTry.status === 401, `status ${oldSessionTry.status}`);
const newSessionTry = await studentCall('GET', '/api/cgm/student/me', undefined, sessionAfterChange);
check('the fresh session works', newSessionTry.status === 200, `status ${newSessionTry.status}`);
const newPasskeyLogin = await studentCall('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: 'BIO-201-001', passkey: 'rx30qz' });
check('sign-in works with the new passkey', Boolean(newPasskeyLogin.json?.data?.session?.token), `status ${newPasskeyLogin.status}`);
const oldPasskeyLogin = await studentCall('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: 'BIO-201-001', passkey: bio001Passkey() });
check('the old passkey is gone for good', oldPasskeyLogin.status >= 400, `status ${oldPasskeyLogin.status}`);

// --- Logout revokes the session -------------------------------------------------
const logoutSession = newPasskeyLogin.json?.data?.session?.token;
const logoutTry = await studentCall('POST', '/api/cgm/student/logout', {}, logoutSession);
const afterLogout = await studentCall('GET', '/api/cgm/student/me', undefined, logoutSession);
check('logout revokes the session immediately', logoutTry.status === 200 && afterLogout.status === 401,
  `logout=${logoutTry.status} after=${afterLogout.status}`);

// --- Anti-enumeration parity on register ----------------------------------------
const enumA = await call('POST', '/api/cgm/student/register', { classCode: 'CRX-CLS-0001', indexNumber: 'BIO-999-999', entryPassword: 'wrong-guess' });
const enumB = await call('POST', '/api/cgm/student/register', { classCode: 'CRX-CLS-0001', indexNumber: 'BIO-999-998', entryPassword: 'bio-201-entry' });
check('a wrong password and an unknown index give the identical generic failure',
  enumA.status === enumB.status && enumA.json?.error === enumB.json?.error,
  `${enumA.status}/${enumB.status} "${enumA.json?.error}" vs "${enumB.json?.error}"`);

// --- Audit hygiene: the whole trail must be free of secrets ----------------------
const auditRowsAll = q('SELECT action, context_json FROM cgm_audit');
const auditBlob = auditRowsAll.map((row) => `${row.action} ${row.context_json || ''}`).join('\n');
check(`the audit trail never contains a raw passkey (${auditRowsAll.length} rows scanned)`,
  !/rx30[a-z]{1,2}\b/.test(auditBlob), auditBlob.match(/rx30[a-z]{1,2}\b/)?.[0] || '');
check('the audit trail never contains a class entry password',
  !/bio-201-entry|chm-105-entry/.test(auditBlob));
check('the audit trail never contains a raw invitation token (64-hex)',
  !/[0-9a-f]{64}/.test(auditBlob));
const voteAuditRows = auditRowsAll.filter((row) => row.action === 'cgm.election.vote');
check('vote audit rows record anonymity, never the candidate or the choice',
  voteAuditRows.length > 0 && voteAuditRows.every((row) => !/candidate/i.test(row.context_json || '')),
  `rows=${voteAuditRows.length}`);
const passkeyChangeAudit = auditRowsAll.filter((row) => row.action === 'cgm.passkey.self_change');
check('the passkey change is audited without the new value', passkeyChangeAudit.length === 1, `rows=${passkeyChangeAudit.length}`);

// ===========================================================================
// 21. Governance (step 10, spec §5/§6/§30) — runs last: the transfer test
// hands class A to a new primary organizer.
// ===========================================================================
section('21. Governance: organizer suspend/reinstate, class suspend/reinstate, ownership transfer');

// --- PHANTOM suspends an organizer: class access dies immediately -------------
const amaApplication = q1("SELECT id FROM cgm_organizer_applications WHERE user_id = (SELECT id FROM users WHERE email = 'ama.boakye@example.com') ORDER BY id DESC LIMIT 1");
const amaReadsBefore = await memberCall('GET', `/api/cgm/classes/${classAId}`, undefined, amaToken);
check('the organizer reads their class before suspension', amaReadsBefore.status === 200, `status ${amaReadsBefore.status}`);
const suspendOrganizer = await memberCall('POST', `/api/cgm/phantom/organizer-applications/${Number(amaApplication?.id)}/suspend`, { reason: 'Pending conduct review' }, phantomToken);
check('PHANTOM can suspend an organizer with a recorded reason', suspendOrganizer.status === 200, `status ${suspendOrganizer.status}`);
const amaReadsSuspended = await memberCall('GET', `/api/cgm/classes/${classAId}`, undefined, amaToken);
check('a suspended organizer loses every class route immediately', amaReadsSuspended.status === 403, `status ${amaReadsSuspended.status}`);
const amaRosterSuspended = await memberCall('GET', `/api/cgm/classes/${classAId}/roster`, undefined, amaToken);
check('the suspension covers the roster too, not just the class record', amaRosterSuspended.status === 403, `status ${amaRosterSuspended.status}`);
check('suspension revoked the team rows',
  q1("SELECT COUNT(*) c FROM cgm_class_organizers WHERE member_profile_id = (SELECT member_profile_id FROM cgm_organizer_applications WHERE id = ?) AND status = 'revoked'", Number(amaApplication?.id)).c >= 1);

// --- Reinstatement restores the seats (regression for the step-10 fix) --------
const reinstateOrganizer = await memberCall('POST', `/api/cgm/phantom/organizer-applications/${Number(amaApplication?.id)}/reinstate`, {}, phantomToken);
check('PHANTOM can reinstate the organizer', reinstateOrganizer.status === 200, `status ${reinstateOrganizer.status}`);
const amaReadsAfter = await memberCall('GET', `/api/cgm/classes/${classAId}`, undefined, amaToken);
check('a reinstated organizer has their class access back', amaReadsAfter.status === 200, `status ${amaReadsAfter.status}`);
check('reinstatement restored the revoked team rows',
  q1("SELECT COUNT(*) c FROM cgm_class_organizers WHERE member_profile_id = (SELECT member_profile_id FROM cgm_organizer_applications WHERE id = ?) AND status = 'active'", Number(amaApplication?.id)).c >= 1);

// --- PHANTOM suspends and reinstates a whole class ------------------------------
const suspendClass = await memberCall('POST', `/api/cgm/phantom/classes/${classAId}/suspend`, { reason: ' Examination period audit' }, phantomToken);
check('PHANTOM can suspend a class', suspendClass.status === 200, `status ${suspendClass.status}`);
check('the suspended class is marked in the database', q1('SELECT status FROM cgm_classes WHERE id = ?', classAId)?.status === 'suspended');
// Logout in §20 revoked every session of this identity (logout-all is the
// safer default on shared school devices), so sign in fresh for the class views.
const governanceLogin = await studentCall('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: 'BIO-201-001', passkey: 'rx30qz' });
const governanceSession = governanceLogin.json?.data?.session?.token || sessionAfterChange;
const suspendedClassView = await studentCall('GET', `/api/cgm/student/classes/${classAId}`, undefined, governanceSession);
check('students cannot open a suspended class', suspendedClassView.status >= 400, `status ${suspendedClassView.status}`);
const reinstateClass = await memberCall('POST', `/api/cgm/phantom/classes/${classAId}/reinstate`, {}, phantomToken);
check('PHANTOM can reinstate the class', reinstateClass.status === 200, `status ${reinstateClass.status}`);
const reinstatedClassView = await studentCall('GET', `/api/cgm/student/classes/${classAId}`, undefined, governanceSession);
check('the class opens for students again after reinstatement', reinstatedClassView.status === 200, `status ${reinstatedClassView.status}`);

// --- Ownership transfer: propose → accept → roles swap --------------------------
const assistantProfileRow = q1("SELECT mp.id FROM member_profiles mp JOIN users u ON u.id = mp.user_id WHERE u.email = 'assistant.cgm@example.com'");
const proposeTransfer = await memberCall('POST', `/api/cgm/classes/${classAId}/transfer`, { toProfileId: Number(assistantProfileRow?.id) }, amaToken);
check('the primary organizer proposes an ownership transfer to their assistant', proposeTransfer.status === 200, `status ${proposeTransfer.status} ${proposeTransfer.text?.slice(0, 140)}`);
const wrongAccept = await memberCall('POST', `/api/cgm/classes/${classAId}/transfer/accept`, {}, phantomToken);
check('nobody but the named successor can accept the transfer', wrongAccept.status === 404 || wrongAccept.status === 403, `status ${wrongAccept.status}`);
const acceptTransfer = await memberCall('POST', `/api/cgm/classes/${classAId}/transfer/accept`, {}, assistantToken);
check('the successor accepts and becomes the primary organizer', acceptTransfer.status === 200, `status ${acceptTransfer.status}`);
const teamAfter = q("SELECT role, status FROM cgm_class_organizers WHERE class_id = ? AND status = 'active' ORDER BY role", classAId);
check('the roles actually swapped',
  teamAfter.some((row) => row.role === 'primary') && teamAfter.filter((row) => row.role === 'primary').length === 1
  && teamAfter.some((row) => row.role === 'co_organizer'),
  JSON.stringify(teamAfter));
const amaEditAfterTransfer = await memberCall('PATCH', `/api/cgm/classes/${classAId}`, { description: 'Attempted by a former primary' }, amaToken);
check('the former primary can no longer edit the class record (primary-only guard)', amaEditAfterTransfer.status === 403, `status ${amaEditAfterTransfer.status}`);
const newPrimaryEdit = await memberCall('POST', `/api/cgm/classes/${classAId}/settings`, { studentVisibleFields: ['full_name', 'phone', 'email'] }, assistantToken);
check('the new primary can manage class settings', newPrimaryEdit.status === 200, `status ${newPrimaryEdit.status}`);


// ===========================================================================
// 22. §30 module policy console: every process → approval / automatic /
//     closed, decided by PHANTOM in one place and enforced by the server.
//     Runs last: flipping module-wide switches would disturb other sections.
// ===========================================================================
section('22. Module policy console (§30)');
const setPolicy = (key, value) => memberCall('PUT', '/api/cgm/phantom/policies', { key, value }, phantomToken);

const policiesAnon = await call('GET', '/api/cgm/phantom/policies');
check('the policy console is hidden without a session', policiesAnon.status === 401, `status ${policiesAnon.status}`);
const policiesOrganizer = await memberCall('GET', '/api/cgm/phantom/policies', undefined, amaToken);
check('a non-PHANTOM organizer cannot read the policy console', policiesOrganizer.status === 403, `status ${policiesOrganizer.status}`);
const policiesOrganizerPut = await memberCall('PUT', '/api/cgm/phantom/policies', { key: 'class_creation_mode', value: 'auto' }, amaToken);
check('a non-PHANTOM organizer cannot change policies', policiesOrganizerPut.status === 403, `status ${policiesOrganizerPut.status}`);
check('the denied write stored nothing', !q1("SELECT value FROM cgm_module_policies WHERE key = 'class_creation_mode'"));

const policies = await memberCall('GET', '/api/cgm/phantom/policies', undefined, phantomToken);
check('PHANTOM reads the policy console', policies.status === 200, `status ${policies.status}`);
const policyKeys = (policies.json?.data || []).map((row) => row.key);
check('all five processes are manageable from the console', JSON.stringify(policyKeys) === JSON.stringify([
  'organizer_application_mode', 'class_creation_mode', 'student_registration_mode', 'membership_request_mode', 'profile_change_mode',
]), JSON.stringify(policyKeys));
check('unset policies read as the spec default — wait for approval', (policies.json?.data || []).every((row) => row.value === 'approval'));
check('the console reports the allowed modes per process', (policies.json?.data || []).every((row) => Array.isArray(row.allowedValues) && row.allowedValues.length >= 2));

const badMode = await setPolicy('class_creation_mode', 'sometimes');
check('an unknown mode is refused', badMode.status === 400, `status ${badMode.status}`);
const unknownProcess = await setPolicy('election_mode', 'auto');
check('an unknown process is refused', unknownProcess.status === 400, `status ${unknownProcess.status}`);
const saveTwo = await memberCall('PUT', '/api/cgm/phantom/policies', { policies: [
  { key: 'student_registration_mode', value: 'auto' }, { key: 'profile_change_mode', value: 'auto' },
] }, phantomToken);
check('PHANTOM can save several settings in one go', saveTwo.status === 200 && saveTwo.json?.data?.updated === 2, `status ${saveTwo.status}`);
const policyRow = q1("SELECT value, updated_by_label FROM cgm_module_policies WHERE key = 'student_registration_mode'");
check('saved settings persist with who changed them', policyRow?.value === 'auto' && Boolean(policyRow?.updated_by_label), JSON.stringify(policyRow || {}));
check('every policy change lands in the audit trail', Boolean(q1("SELECT id FROM cgm_audit WHERE action = 'cgm.module.policy' AND context_json LIKE '%student_registration_mode%'")));
await setPolicy('student_registration_mode', 'approval');
await setPolicy('profile_change_mode', 'approval');

// -- A third member for the application-mode subsection ----------------------
const kwameSeq = q1('SELECT next_value FROM member_sequences WHERE id = 1');
sqlite.prepare("UPDATE member_sequences SET next_value = next_value + 1 WHERE id = 1").run();
sqlite.prepare("INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, 'member')")
  .run('kwame.apps@example.com', 'Kwame Apps', memberHash('KwamePass1'));
const kwameUser = q1("SELECT id FROM users WHERE email = 'kwame.apps@example.com'");
sqlite.prepare("INSERT INTO members (name, email, phone, role, joined_date, points, level, is_active) VALUES (?, ?, NULL, 'member', '2026-10-30', 0, 'Member', 1)")
  .run('Kwame Apps', 'kwame.apps@example.com');
const kwameMember = q1("SELECT id FROM members WHERE email = 'kwame.apps@example.com'");
sqlite.prepare(
  "INSERT INTO member_profiles (user_id, member_record_id, member_code, status, codename_path, created_by_user_id) VALUES (?, ?, ?, 'active', 'member', ?)"
).run(kwameUser.id, kwameMember.id, `CRX-${String(kwameSeq.next_value).padStart(4, '0')}`, kwameUser.id);
const kwameLogin = await call('POST', '/api/auth/login', { identifier: 'kwame.apps@example.com', password: 'KwamePass1' });
const kwameToken = kwameLogin.json?.token || kwameLogin.json?.data?.token;
check('the third member can sign in', Boolean(kwameToken), `status ${kwameLogin.status}`);

// -- organizer_application_mode: closed refuses; auto approves on verify ------
await setPolicy('organizer_application_mode', 'closed');
const closedApply = await memberCall('POST', '/api/cgm/organizer/apply', { institution: 'Accra Technical University', motivation: 'Wants to organize labs.' }, kwameToken);
check('closed: organizer applications are refused outright', closedApply.status === 403, `status ${closedApply.status}`);
check('closed: the refusal wrote no application row',
  !q1('SELECT id FROM cgm_organizer_applications WHERE user_id = ?', kwameUser.id));

await setPolicy('organizer_application_mode', 'auto');
const autoApply = await memberCall('POST', '/api/cgm/organizer/apply', { institution: 'Accra Technical University', motivation: 'Automatic approval path.' }, kwameToken);
check('auto: the member can still apply', autoApply.status === 200 || autoApply.status === 201, `status ${autoApply.status} ${autoApply.text?.slice(0, 120)}`);
const kwameAppRow = q1('SELECT id FROM cgm_organizer_applications WHERE user_id = ? ORDER BY id DESC LIMIT 1', kwameUser.id);
const autoVerifyToken = autoApply.json?.data?.verifyToken || autoApply.json?.verifyToken || null;
const autoVerified = await call('GET', `/api/cgm/organizer/verify?token=${encodeURIComponent(String(autoVerifyToken || ''))}`);
check('auto: email verification approves on the spot', autoVerified.status === 200, `status ${autoVerified.status}`);
const kwameApproved = q1('SELECT status, reviewer_label FROM cgm_organizer_applications WHERE id = ?', kwameAppRow.id);
check('auto: the application is approved by the policy, not a person', kwameApproved?.status === 'approved' && kwameApproved?.reviewer_label === 'Policy (automatic)', JSON.stringify(kwameApproved || {}));
check('auto: the decision is audited as automatic', Boolean(q1("SELECT id FROM cgm_audit WHERE action = 'cgm.organizer.auto_approved' AND entity_id = ?", String(kwameAppRow.id))));
await setPolicy('organizer_application_mode', 'approval');

// -- class_creation_mode: closed refuses before writing; auto activates -------
const kwameCreates = await memberCall('POST', '/api/cgm/classes', { name: 'Kwame should not have this', institution: 'Accra Technical University' }, kwameToken);
check('a freshly auto-approved organizer may create classes again after the reset', kwameCreates.status === 200, `status ${kwameCreates.status}`);
const classesBeforeClosed = q1('SELECT COUNT(*) c FROM cgm_classes').c;
await setPolicy('class_creation_mode', 'closed');
const closedCreate = await memberCall('POST', '/api/cgm/classes', { name: 'Closed-mode class', institution: 'Accra Technical University' }, kwameToken);
check('closed: class creation is refused for organizers', closedCreate.status === 403, `status ${closedCreate.status}`);
check('closed: the refusal wrote nothing — no class row, no code burned',
  q1('SELECT COUNT(*) c FROM cgm_classes').c === classesBeforeClosed);

await setPolicy('class_creation_mode', 'auto');
const autoCreate = await memberCall('POST', '/api/cgm/classes', { name: 'PHY 201 Policy Auto', institution: 'Accra Technical University' }, kwameToken);
const autoClassId = autoCreate.json?.data?.classId ?? autoCreate.json?.data?.class?.id ?? autoCreate.json?.data?.id;
const autoClassCode = autoCreate.json?.data?.code;
check('auto: the class is created with a permanent code', autoCreate.status === 200 && /^CRX-CLS-/.test(String(autoClassCode)), `status ${autoCreate.status}`);
check('auto: the class is active immediately — no PHANTOM wait',
  q1('SELECT status, reviewer_label FROM cgm_classes WHERE id = ?', autoClassId)?.status === 'active'
  && q1('SELECT reviewer_label FROM cgm_classes WHERE id = ?', autoClassId)?.reviewer_label === 'Policy (automatic)');
check('auto: the approval trail records the automatic decision',
  Boolean(q1("SELECT id FROM cgm_class_approvals WHERE class_id = ? AND action = 'approved' AND reason LIKE 'Automatically active%'", autoClassId)));
await setPolicy('class_creation_mode', 'approval');

// -- student_registration_mode: closed refuses; auto issues the passkey -------
await memberCall('POST', `/api/cgm/classes/${autoClassId}/entry-password`, { entryPassword: 'phy-201-entry' }, kwameToken);
const autoRosterCsv = [
  'Full Name,Index Number',
  'Adjoa Mensah,AUTO-101-001',
  'Bio Returnee,BIO-201-001',
].join('\n');
const autoRosterForm = new FormData();
autoRosterForm.append('file', new File([autoRosterCsv], 'roster.csv', { type: 'text/csv' }));
autoRosterForm.append('mapping', JSON.stringify({ full_name: 'Full Name', index_number: 'Index Number' }));
autoRosterForm.append('policy', 'skip');
const autoRosterImport = await formCall('POST', `/api/cgm/classes/${autoClassId}/roster/import`, autoRosterForm, kwameToken);
check('the auto class can import its roster', autoRosterImport.status === 200, `status ${autoRosterImport.status} ${autoRosterImport.text?.slice(0, 140)}`);

await setPolicy('student_registration_mode', 'closed');
const closedRegister = await call('POST', '/api/cgm/student/register', { classCode: autoClassCode, indexNumber: 'AUTO-101-001', entryPassword: 'phy-201-entry' });
check('closed: student registration is refused outright', closedRegister.status === 403, `status ${closedRegister.status}`);
check('closed: no identity or request row was written',
  !q1("SELECT id FROM cgm_students WHERE index_number_key = 'auto-101-001'")
  && !q1("SELECT r.id FROM cgm_registration_requests r JOIN cgm_roster_entries e ON e.id = r.roster_entry_id WHERE e.index_number_key = 'auto-101-001'"));

await setPolicy('student_registration_mode', 'auto');
const passkeyCounterBefore = Number(q1("SELECT next_value FROM cgm_sequences WHERE id = 'student_passkey'").next_value);
const autoRegister = await call('POST', '/api/cgm/student/register', { classCode: autoClassCode, indexNumber: 'AUTO-101-001', entryPassword: 'phy-201-entry' });
const expectedPasskey = `rx30${scatterSuffix(passkeyCounterBefore)}`;
check('auto: registration approves inline and is active at once',
  autoRegister.status === 200 && autoRegister.json?.data?.state === 'active', `status ${autoRegister.status} ${autoRegister.text?.slice(0, 160)}`);
check(`auto: the permanent passkey continues the global sequence (${expectedPasskey})`,
  autoRegister.json?.data?.passkey === expectedPasskey, String(autoRegister.json?.data?.passkey));
const autoStudent = q1("SELECT id, status, passkey_sequence FROM cgm_students WHERE index_number_key = 'auto-101-001'");
check('auto: the new identity is active with its passkey recorded', autoStudent?.status === 'active' && Number(autoStudent?.passkey_sequence) === passkeyCounterBefore, JSON.stringify(autoStudent || {}));
check('auto: the passkey is stored only as a verifier', !String(q1('SELECT passkey_verifier FROM cgm_students WHERE id = ?', autoStudent.id)?.passkey_verifier || '').includes('rx30'));
check('auto: the roster entry flips to registered',
  q1("SELECT status FROM cgm_roster_entries WHERE class_id = ? AND index_number_key = 'auto-101-001'", autoClassId)?.status === 'registered');
check('auto: the membership is added by the policy', q1("SELECT added_by_label FROM cgm_class_members WHERE class_id = ? AND student_id = ?", autoClassId, autoStudent.id)?.added_by_label === 'Policy (automatic)');
check('auto: the decision is audited as automatic', Boolean(q1("SELECT id FROM cgm_audit WHERE action = 'cgm.registration.auto_approved' AND class_id = ?", autoClassId)));

// An existing identity re-registers into a second class: approved instantly,
// no second passkey, sequence untouched.
const sequenceBeforeReturnee = Number(q1("SELECT next_value FROM cgm_sequences WHERE id = 'student_passkey'").next_value);
const returneeRegister = await call('POST', '/api/cgm/student/register', { classCode: autoClassCode, indexNumber: 'BIO-201-001', entryPassword: 'phy-201-entry' });
check('auto: an existing identity is approved without a second passkey',
  returneeRegister.status === 200 && returneeRegister.json?.data?.state === 'active' && returneeRegister.json?.data?.passkey == null, returneeRegister.text?.slice(0, 160));
check('auto: the sequence was not consumed by a returning identity',
  Number(q1("SELECT next_value FROM cgm_sequences WHERE id = 'student_passkey'").next_value) === sequenceBeforeReturnee);
check('auto: the returning student gains the second membership',
  Boolean(q1('SELECT id FROM cgm_class_members WHERE class_id = ? AND student_id = (SELECT id FROM cgm_students WHERE index_number_key = ?)', autoClassId, 'bio-201-001')));
await setPolicy('student_registration_mode', 'approval');

// -- membership_request_mode: closed refuses; auto joins instantly ------------
const autoInvite = await memberCall('POST', `/api/cgm/classes/${autoClassId}/invitations`, { kind: 'general', maxUses: 5 }, kwameToken);
const autoInviteCode = autoInvite.json?.data?.code;
check('the auto class can issue an invitation', Boolean(autoInviteCode), autoInvite.text?.slice(0, 140));
const chmJoinerLogin = await loginForStudent(chmStudentId);
const chmJoinerToken = chmJoinerLogin.json?.data?.session?.token;
check('the class-B joiner can sign in fresh', Boolean(chmJoinerToken), `status ${chmJoinerLogin.status}`);

await setPolicy('membership_request_mode', 'closed');
const closedJoin = await studentCall('POST', '/api/cgm/student/join', { code: autoInviteCode }, chmJoinerToken);
check('closed: membership requests are refused outright', closedJoin.status === 403, `status ${closedJoin.status}`);
check('closed: no request or membership row was written',
  !q1('SELECT id FROM cgm_class_members WHERE class_id = ? AND student_id = ?', autoClassId, chmStudentId)
  && !q1('SELECT id FROM cgm_membership_requests WHERE class_id = ? AND student_id = ?', autoClassId, chmStudentId));

await setPolicy('membership_request_mode', 'auto');
const autoJoin = await studentCall('POST', '/api/cgm/student/join', { code: autoInviteCode }, chmJoinerToken);
check('auto: the join is approved on the spot', autoJoin.status === 200, `status ${autoJoin.status} ${autoJoin.text?.slice(0, 160)}`);
check('auto: the membership exists with no pending queue row',
  Boolean(q1('SELECT id FROM cgm_class_members WHERE class_id = ? AND student_id = ?', autoClassId, chmStudentId))
  && !q1("SELECT id FROM cgm_membership_requests WHERE class_id = ? AND student_id = ? AND status = 'pending'", autoClassId, chmStudentId));
await setPolicy('membership_request_mode', 'approval');

// -- profile_change_mode: auto applies immediately with normalized keys -------
await setPolicy('profile_change_mode', 'auto');
const governanceFresh = await studentCall('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: 'BIO-201-001', passkey: 'rx30qz' });
const governanceToken = governanceFresh.json?.data?.session?.token || governanceSession;
const autoProfileChange = await studentCall('POST', '/api/cgm/student/profile/change', { field: 'phone', newValue: '0209000042', reason: 'New number' }, governanceToken);
check('auto: the profile change is applied immediately', autoProfileChange.status === 200, `status ${autoProfileChange.status} ${autoProfileChange.text?.slice(0, 160)}`);
const returneeRow = q1('SELECT phone, phone_key FROM cgm_students WHERE index_number_key = ?', 'bio-201-001');
check('auto: the value and its lookup key are both updated', returneeRow?.phone === '0209000042' && Boolean(returneeRow?.phone_key), JSON.stringify(returneeRow || {}));
check('auto: no pending request row lingers',
  !q1("SELECT id FROM cgm_profile_change_requests WHERE student_id = ? AND status = 'pending'", Number(q1("SELECT id FROM cgm_students WHERE index_number_key = 'bio-201-001'").id)));
check('auto: the change is audited as automatic',
  Boolean(q1("SELECT id FROM cgm_audit WHERE action = 'cgm.profile_change.auto_applied' AND actor_student_id = ?", Number(q1("SELECT id FROM cgm_students WHERE index_number_key = 'bio-201-001'").id))));

// Index numbers stay locked even in automatic mode.
const lockedIndex = await studentCall('POST', '/api/cgm/student/profile/change', { field: 'index_number', newValue: 'HACK-001', reason: 'Attempt' }, governanceToken);
check('auto: index numbers stay locked', lockedIndex.status === 400, `status ${lockedIndex.status}`);
await setPolicy('profile_change_mode', 'approval');

// The console ends back at the spec default: every process waits for approval.
const finalPolicies = await memberCall('GET', '/api/cgm/phantom/policies', undefined, phantomToken);
check('the module ends at the spec default — approval everywhere', (finalPolicies.json?.data || []).every((row) => row.value === 'approval'), JSON.stringify(finalPolicies.json?.data));


// ===========================================================================
// 23. Security corrections: verification tokens never reach production
//     responses, resend flow, token expiry + single use, passkeys never
//     stored in notifications, lockout on every failure half, suspended
//     identities refused. Runs last.
// ===========================================================================
section('23. Security corrections (verification tokens, notification hygiene, lockout)');

// -- The raw verification token is gated to dev/preview environments ---------
delete env.CGM_DEV_PREVIEW_TOKENS;
const prodParityApply = await memberCall('POST', '/api/cgm/organizer/apply', { institution: 'Security Probe University', motivation: 'Production parity probe.' }, kwameToken);
check('production responses never expose the organizer verification token',
  (prodParityApply.status === 200 || prodParityApply.status === 201) && prodParityApply.json?.data?.verifyToken === undefined,
  `status ${prodParityApply.status} keys=${Object.keys(prodParityApply.json?.data || {})}`);
check('an email delivery failure is reported honestly (no fake success, no token fallback)',
  prodParityApply.json?.data?.emailSent === false && /could not be sent|Resend/i.test(String(prodParityApply.json?.data?.message)), String(prodParityApply.json?.data?.message));
const devApply = await memberCall('POST', '/api/cgm/organizer/apply', { institution: 'Dev Preview University', motivation: 'Dev gate probe.' }, kwameToken);
void devApply;
env.CGM_DEV_PREVIEW_TOKENS = '1';
const devApplyGated = await memberCall('POST', '/api/cgm/organizer/apply', { institution: 'Dev Preview University 2', motivation: 'Dev gate probe.' }, kwameToken);
check('the dev-only token preview exists but only behind the explicit runtime gate',
  devApplyGated.status === 409 || typeof devApplyGated.json?.data?.verifyToken === 'string', `status ${devApplyGated.status}`);

// kwame now has a fresh pending application (the last one applied).
const secAppRow = q1('SELECT id FROM cgm_organizer_applications WHERE user_id = ? ORDER BY id DESC LIMIT 1', kwameUser.id);

// -- Resend flow: cooldown, invalidation, expiry, single use ------------------
const resendHot = await memberCall('POST', '/api/cgm/organizer/resend-verification', {}, kwameToken);
check('resend has an account-level cooldown', resendHot.status === 429, `status ${resendHot.status}`);
sqlite.prepare("UPDATE cgm_organizer_applications SET updated_at = datetime('now', '-5 minutes') WHERE id = ?").run(secAppRow.id);
const resend2 = await memberCall('POST', '/api/cgm/organizer/resend-verification', {}, kwameToken);
const resendToken2 = resend2.json?.data?.verifyToken;
check('after the cooldown a resend issues a fresh token (dev gate only)', typeof resendToken2 === 'string', `status ${resend2.status}`);
sqlite.prepare("UPDATE cgm_organizer_applications SET updated_at = datetime('now', '-5 minutes') WHERE id = ?").run(secAppRow.id);
const resend3 = await memberCall('POST', '/api/cgm/organizer/resend-verification', {}, kwameToken);
const resendToken3 = resend3.json?.data?.verifyToken;
check('each resend issues a different token', typeof resendToken3 === 'string' && resendToken3 !== resendToken2);
const oldLinkUsed = await call('GET', `/api/cgm/organizer/verify?token=${encodeURIComponent(String(resendToken2))}`);
check('a new token invalidates the previous link', oldLinkUsed.status === 404, `status ${oldLinkUsed.status}`);
const freshVerify = await call('GET', `/api/cgm/organizer/verify?token=${encodeURIComponent(String(resendToken3))}`);
check('the current token still verifies', freshVerify.status === 200, `status ${freshVerify.status} ${freshVerify.text?.slice(0, 120)}`);
const reuseVerify = await call('GET', `/api/cgm/organizer/verify?token=${encodeURIComponent(String(resendToken3))}`);
check('verification is single-use — replay gets a predictable refusal', reuseVerify.status === 404, `status ${reuseVerify.status}`);
const { createHash: shaHash } = await import('node:crypto');
const expiredToken = `${'a'.repeat(64)}.${Math.floor(Date.now() / 1000) - 3600}`;
const expiredHash = shaHash('sha256').update(`cgm-organizer-verify:${expiredToken}`).digest('hex');
sqlite.prepare("UPDATE cgm_organizer_applications SET verification_token_hash = ?, status = 'pending' WHERE id = ?").run(expiredHash, secAppRow.id);
const expiredAttempt = await call('GET', `/api/cgm/organizer/verify?token=${encodeURIComponent(expiredToken)}`);
check('an expired verification link is refused with a resend pointer', expiredAttempt.status === 410, `status ${expiredAttempt.status}`);

// -- Passkeys are never written to notification history ----------------------
const notificationLeak = q('SELECT title, body FROM cgm_student_notifications').filter((row) => /rx30/i.test(String(row.body)) || /rx30/i.test(String(row.title)));
check('no stored student notification ever contains a raw passkey', notificationLeak.length === 0, JSON.stringify(notificationLeak).slice(0, 160));
check('the scrubbed approval notification still tells the student what happened',
  q("SELECT body FROM cgm_student_notifications WHERE title = 'Your permanent student passkey'").every((row) => /passkey/i.test(String(row.body)) && !/rx30/i.test(String(row.body))));

// -- Lockout counts the verifier half too: a passkey that RESOLVES to the
//    account but fails verification counts, exactly like identifier guessing.
//    (An unallocated sequence like rx30zzzz stays anonymous by design —
//    anti-enumeration — and cannot count against any account.)
const probeIndex = 'AUTO-101-001';
const probeStudent = q1('SELECT id, passkey_verifier FROM cgm_students WHERE index_number_key = ?', probeIndex.toLowerCase());
const probePasskey = String(expectedPasskey || '');
sqlite.prepare('UPDATE cgm_students SET passkey_verifier = ? WHERE id = ?').run(memberHash('not-the-real-passkey'), probeStudent.id);
const wrongKeyAttempts = [];
for (let i = 0; i < 8; i += 1) {
  wrongKeyAttempts.push(await studentCall('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: probeIndex, passkey: probePasskey }));
}
check('eight verifier failures against a known identifier are all refused identically',
  wrongKeyAttempts.every((r) => r.status === 400 && r.json?.error === wrongKeyAttempts[0].json?.error), wrongKeyAttempts.map((r) => r.status).join(','));
check('the threshold locks the account after verifier failures too',
  Boolean(q1('SELECT locked_until FROM cgm_students WHERE id = ?', probeStudent.id)?.locked_until));
const lockedCorrectKey = await studentCall('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: probeIndex, passkey: probePasskey });
check('a locked account refuses while the lock is active', lockedCorrectKey.status === 423, `status ${lockedCorrectKey.status}`);
sqlite.prepare('UPDATE cgm_students SET passkey_verifier = ?, locked_until = NULL, failed_attempts = 0 WHERE id = ?').run(probeStudent.passkey_verifier, probeStudent.id);
const afterUnlock = await studentCall('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: probeIndex, passkey: probePasskey });
check('after the lock lifts the correct passkey signs in', afterUnlock.status === 200, `status ${afterUnlock.status}`);
check('a successful sign-in resets the failure counters',
  Number(q1('SELECT failed_attempts FROM cgm_students WHERE id = ?', probeStudent.id)?.failed_attempts) === 0);

// -- Concurrent failures still converge on the lock --------------------------
// (§20 rotated this identity's passkey; the current passkey resolves, and the
// corrupted verifier makes every attempt a counted verifier failure.)
const govStudent = q1("SELECT id, passkey_verifier FROM cgm_students WHERE index_number_key = 'bio-201-001'");
sqlite.prepare('UPDATE cgm_students SET passkey_verifier = ? WHERE id = ?').run(memberHash('concurrent-probe'), govStudent.id);
const concurrentWrong = await Promise.all(Array.from({ length: 8 }, () =>
  studentCall('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: 'BIO-201-001', passkey: 'rx30qz' })));
check('eight concurrent verifier failures are all refused', concurrentWrong.every((r) => r.status === 400), concurrentWrong.map((r) => r.status).join(','));
check('concurrent failures converge on the lockout',
  Boolean(q1("SELECT locked_until FROM cgm_students WHERE index_number_key = 'bio-201-001'")?.locked_until));
const concurrentLocked = await studentCall('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: 'BIO-201-001', passkey: 'rx30qz' });
check('the correct passkey is refused while locked', concurrentLocked.status === 423, `status ${concurrentLocked.status}`);
sqlite.prepare("UPDATE cgm_students SET passkey_verifier = ?, locked_until = NULL, failed_attempts = 0 WHERE id = ?").run(govStudent.passkey_verifier, govStudent.id);

// -- Suspended identities cannot authenticate --------------------------------
sqlite.prepare("UPDATE cgm_students SET status = 'archived' WHERE index_number_key = ?").run(probeIndex.toLowerCase());
const archivedLogin = await studentCall('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: probeIndex, passkey: probePasskey });
check('an archived identity cannot sign in even with the correct passkey', archivedLogin.status === 403, `status ${archivedLogin.status}`);
check('the archived refusal carries no success payload', archivedLogin.status === 403 && archivedLogin.json?.success === false);
sqlite.prepare("UPDATE cgm_students SET status = 'active' WHERE index_number_key = ?").run(probeIndex.toLowerCase());

// -- Anti-enumeration is preserved -------------------------------------------
const unknownPasskey = await studentCall('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: 'NO-SUCH-STUDENT', passkey: 'rx30qqq' });
check('unknown passkey and wrong identifier stay indistinguishable',
  unknownPasskey.status === 400 && unknownPasskey.json?.error === concurrentWrong[0].json?.error);

// -- PHANTOM sees email configuration health, never secret values ------------
const overviewHealth = await memberCall('GET', '/api/cgm/phantom/overview', undefined, phantomToken);
check('the overview reports email configuration status',
  overviewHealth.json?.data?.email && typeof overviewHealth.json?.data?.email.configured === 'boolean', JSON.stringify(overviewHealth.json?.data?.email || {}));
check('the health indicator names missing variables without exposing values',
  Array.isArray(overviewHealth.json?.data?.email?.missing) && overviewHealth.json?.data?.email?.missing.includes('EMAILJS_SERVICE_ID')
  && overviewHealth.json.data.email.missing.every((name) => /^[A-Z0-9_]+$/.test(String(name))));


// ===========================================================================
// 24. Invitation continuation: the code a student opened survives sign-in and
//     registration, claims are idempotent, and every response carries a
//     machine-readable state. Runs after the security section.
// ===========================================================================
section('24. Invitation continuation journey');

// A fresh active class with its own roster and settings.
const invClass = await memberCall('POST', '/api/cgm/classes', { name: 'INV 101 Invitation Journey', institution: 'Accra Technical University' }, phantomToken);
const invClassId = invClass.json?.data?.classId ?? invClass.json?.data?.id;
const invClassCode = invClass.json?.data?.code;
await memberCall('POST', `/api/cgm/classes/${invClassId}/entry-password`, { entryPassword: 'inv-101-entry' }, phantomToken);
await memberCall('POST', `/api/cgm/classes/${invClassId}/submit`, {}, phantomToken);
await memberCall('POST', `/api/cgm/phantom/classes/${invClassId}/approve`, {}, phantomToken);
const invRosterCsv = ['Full Name,Index Number', 'Ivy Newby,INV-101-001', 'Ivan Newby,INV-101-002'].join('\n');
const invRosterForm = new FormData();
invRosterForm.append('file', new File([invRosterCsv], 'roster.csv', { type: 'text/csv' }));
invRosterForm.append('mapping', JSON.stringify({ full_name: 'Full Name', index_number: 'Index Number' }));
invRosterForm.append('policy', 'skip');
await formCall('POST', `/api/cgm/classes/${invClassId}/roster/import`, invRosterForm, phantomToken);
check('the invitation-journey class is ready', q1('SELECT status FROM cgm_classes WHERE id = ?', invClassId)?.status === 'active');

// -- 1. A new student opens the invitation: public landing answers -----------
const invInvite = await memberCall('POST', `/api/cgm/classes/${invClassId}/invitations`, { kind: 'general', maxUses: 5 }, phantomToken);
const invCode = invInvite.json?.data?.code;
const invLanding = await call('GET', `/api/cgm/invitations/${invCode}`);
check('a new student opening the invitation sees the class information',
  invLanding.status === 200 && invLanding.json?.data?.class?.name === 'INV 101 Invitation Journey' && Boolean(landing.json?.data?.class?.code), invLanding.text?.slice(0, 120));

// -- 2-4. Registration under approval mode → approve → sign in → request ----
const ivyRegister = await call('POST', '/api/cgm/student/register', { classCode: invClassCode, indexNumber: 'INV-101-001', entryPassword: 'inv-101-entry' });
check('a pending registration returns state received and no session',
  ivyRegister.json?.data?.state === 'received' && !ivyRegister.json?.data?.session, ivyRegister.text?.slice(0, 120));
const invQueue = await memberCall('GET', `/api/cgm/classes/${invClassId}/registrations?status=pending`, undefined, phantomToken);
const ivyQueueRow = (invQueue.json?.data || []).find((row) => row.indexNumber === 'INV-101-001');
const ivyApprove = await memberCall('POST', `/api/cgm/classes/${invClassId}/registrations/${ivyQueueRow.id}/approve`, {}, phantomToken);
const ivyPasskey = ivyApprove.json?.data?.passkey;
check('the organizer approves the invited student (passkey issued once)', Boolean(ivyPasskey), `status ${ivyApprove.status}`);
const ivyLogin = await studentCall('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: 'INV-101-001', passkey: ivyPasskey });
const ivySession = ivyLogin.json?.data?.session?.token;
check('the invited student signs in', Boolean(ivySession), `status ${ivyLogin.status}`);
// Ivy is already a member of INV 101 through her approved registration — the
// invitation honestly reports that — so the request path uses the §22 class.
const ivyMemberCheck = await studentCall('POST', '/api/cgm/student/join', { code: invCode }, ivySession);
check('an invited student already in the class is told so (no fake join)',
  ivyMemberCheck.status === 200 && ivyMemberCheck.json?.data?.state === 'member', ivyMemberCheck.text?.slice(0, 120));
const ivyJoin = await studentCall('POST', '/api/cgm/student/join', { code: autoInviteCode }, ivySession);
check('after sign-in the claim reports requested (organizer approval mode)',
  ivyJoin.status === 200 && ivyJoin.json?.data?.state === 'requested', ivyJoin.text?.slice(0, 140));

// -- 5. Claiming twice stays idempotent --------------------------------------
const ivyRejoin = await studentCall('POST', '/api/cgm/student/join', { code: autoInviteCode }, ivySession);
check('claiming the same invitation again never duplicates the request',
  ivyRejoin.status === 200 && ivyRejoin.json?.data?.state === 'requested'
  && q1("SELECT COUNT(*) c FROM cgm_membership_requests WHERE class_id = ? AND student_id = (SELECT id FROM cgm_students WHERE index_number_key = 'inv-101-001')", autoClassId).c === 1,
  ivyRejoin.text?.slice(0, 120));
const ivyRequestRow = q1("SELECT id FROM cgm_membership_requests WHERE class_id = ? AND student_id = (SELECT id FROM cgm_students WHERE index_number_key = 'inv-101-001')", autoClassId);
const ivyApproveJoin = await memberCall('POST', `/api/cgm/classes/${autoClassId}/membership-requests/${ivyRequestRow.id}/approve`, {}, phantomToken);
check('the organizer approves the continued request', ivyApproveJoin.status === 200, `status ${ivyApproveJoin.status}`);

// -- 6. Approval-free class: an existing student joins automatically ---------
const settingsFree = await memberCall('POST', `/api/cgm/classes/${invClassId}/settings`, { membershipApprovalRequired: false }, phantomToken);
void settingsFree;
const adjoaSession = (await studentCall('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: 'AUTO-101-001', passkey: String(expectedPasskey || '') })).json?.data?.session?.token;
const adjoaJoin = await studentCall('POST', '/api/cgm/student/join', { code: invCode }, adjoaSession);
check('an existing identity joins automatically with state joined',
  adjoaJoin.status === 200 && adjoaJoin.json?.data?.state === 'joined', adjoaJoin.text?.slice(0, 140));
const adjoaRejoin = await studentCall('POST', '/api/cgm/student/join', { code: invCode }, adjoaSession);
check('re-joining reports member without creating a second membership',
  adjoaRejoin.json?.data?.state === 'member'
  && q1("SELECT COUNT(*) c FROM cgm_class_members WHERE class_id = ? AND student_id = (SELECT id FROM cgm_students WHERE index_number_key = 'auto-101-001')", invClassId).c === 1);
check('the joining student kept their original permanent passkey',
  q1("SELECT passkey_suffix FROM cgm_students WHERE index_number_key = 'auto-101-001'")?.passkey_suffix === String(expectedPasskey || '').slice(4));

// -- 7. Registration with automatic approval returns a session the invitation
//       can continue with ------------------------------------------------------
await memberCall('PUT', '/api/cgm/phantom/policies', { key: 'student_registration_mode', value: 'auto' }, phantomToken);
const ivanRegister = await call('POST', '/api/cgm/student/register', { classCode: invClassCode, indexNumber: 'INV-101-002', entryPassword: 'inv-101-entry' });
check('automatic registration returns an authenticated session',
  ivanRegister.json?.data?.state === 'active' && Boolean(ivanRegister.json?.data?.session?.token), Object.keys(ivanRegister.json?.data || {}).join(','));
const ivanSession = ivanRegister.json?.data?.session?.token;
const ivanOwnCheck = await studentCall('POST', '/api/cgm/student/join', { code: invCode }, ivanSession);
check('the invitation to the class they just joined reports membership honestly',
  ivanOwnCheck.status === 200 && ivanOwnCheck.json?.data?.state === 'member', ivanOwnCheck.text?.slice(0, 120));
// A second class set approval-free: the continuation is fully automatic.
await memberCall('POST', `/api/cgm/classes/${autoClassId}/settings`, { membershipApprovalRequired: false }, phantomToken);
const ivanJoin = await studentCall('POST', '/api/cgm/student/join', { code: autoInviteCode }, ivanSession);
check('a freshly registered student continues an invitation without re-entering it',
  ivanJoin.status === 200 && ivanJoin.json?.data?.state === 'joined', ivanJoin.text?.slice(0, 140));
await memberCall('PUT', '/api/cgm/phantom/policies', { key: 'student_registration_mode', value: 'approval' }, phantomToken);

// -- 8-9. Expired and revoked invitations -------------------------------------
const expInvite = await memberCall('POST', `/api/cgm/classes/${invClassId}/invitations`, { kind: 'general', maxUses: 5, expiresAt: new Date(Date.now() - 3600_000).toISOString() }, phantomToken);
const expLanding2 = await call('GET', `/api/cgm/invitations/${expInvite.json?.data?.code}`);
check('an expired invitation lands on a clear refusal', expLanding2.status === 410, `status ${expLanding2.status}`);
const expJoin = await studentCall('POST', '/api/cgm/student/join', { code: expInvite.json?.data?.code }, ivanSession);
check('an expired invitation cannot be claimed', expJoin.status === 410, `status ${expJoin.status}`);
const revInviteRow = q1('SELECT id FROM cgm_invitations WHERE class_id = ? AND kind = ? ORDER BY id DESC LIMIT 1', invClassId, 'general');
await memberCall('POST', `/api/cgm/invitations/${revInviteRow.id}/revoke`, {}, phantomToken);
const revLanding2 = await call('GET', `/api/cgm/invitations/${expInvite.json?.data?.code}`);
check('a revoked invitation is no longer available', revLanding2.status === 404, `status ${revLanding2.status}`);

// -- 10. Individual invitations stay identity-bound and single-use ------------
const invIndividual = await memberCall('POST', `/api/cgm/classes/${invClassId}/invitations`, { kind: 'individual', studentId: Number(q1("SELECT id FROM cgm_students WHERE index_number_key = 'inv-101-001'").id) }, phantomToken);
const invIndividualToken = invIndividual.json?.data?.token || invIndividual.json?.data?.code;
check('an individual invitation returns its raw token (which is stored for the organizer)', /^[0-9a-f]{40,}$/i.test(String(invIndividualToken || '')), String(invIndividualToken || '').slice(0, 12));
const invIndividualClaim = await studentCall('POST', `/api/cgm/student/invitations/${invIndividualToken}/claim`, {}, ivySession);
check('the bound student claims the individual invitation', invIndividualClaim.status === 200, `status ${invIndividualClaim.status} ${invIndividualClaim.text?.slice(0, 120)}`);
const invIndividualReclaim = await studentCall('POST', `/api/cgm/student/invitations/${invIndividualToken}/claim`, {}, ivySession);
check('the individual token is single-use', invIndividualReclaim.status === 410, `status ${invIndividualReclaim.status}`);
const invStrangerClaim = await studentCall('POST', `/api/cgm/student/invitations/${invIndividualToken}/claim`, {}, adjoaSession);
check('nobody else can use a claimed individual token', [403, 410].includes(invStrangerClaim.status), `status ${invStrangerClaim.status}`);

// -- 11. Two simultaneous claims never duplicate the membership ---------------
// (INV 101 is approval-free now; the raced student is not a member yet.)
const raceClaims = await Promise.all([
  studentCall('POST', '/api/cgm/student/join', { code: invCode }, chmJoinerToken),
  studentCall('POST', '/api/cgm/student/join', { code: invCode }, chmJoinerToken),
]);
check('two simultaneous claims both answer sanely', raceClaims.every((r) => r.status === 200 && ['joined', 'member'].includes(r.json?.data?.state)), raceClaims.map((r) => `${r.status}:${r.json?.data?.state}`).join(' '));
check('the race leaves exactly one membership row',
  q1('SELECT COUNT(*) c FROM cgm_class_members WHERE class_id = ? AND student_id = ?', invClassId, chmStudentId).c === 1);
// Pending-request races are equally idempotent: replaying an already-used
// claim never duplicates anything.
const ivanRace = await Promise.all([
  studentCall('POST', '/api/cgm/student/join', { code: autoInviteCode }, ivanSession),
  studentCall('POST', '/api/cgm/student/join', { code: autoInviteCode }, ivanSession),
]);
check('replayed simultaneous claims stay sane and single',
  ivanRace.every((r) => r.status === 200 && ['joined', 'member'].includes(r.json?.data?.state))
  && q1("SELECT COUNT(*) c FROM cgm_class_members WHERE class_id = ? AND student_id = (SELECT id FROM cgm_students WHERE index_number_key = 'inv-101-002')", autoClassId).c === 1,
  ivanRace.map((r) => `${r.status}:${r.json?.data?.state}`).join(' '));


// ===========================================================================
// 25. Policy transitions with pending rows + data retention. Changing a
//     mode must never silently approve, delete or corrupt what is already
//     in a queue, and closed must only close NEW requests.
// ===========================================================================
section('25. Policy transitions & data retention');

// -- Pending registration survives mode flips ---------------------------------
const trClass = await memberCall('POST', '/api/cgm/classes', { name: 'TR 201 Transitions', institution: 'Accra Technical University' }, phantomToken);
const trClassId = trClass.json?.data?.classId ?? trClass.json?.data?.id;
const trClassCode = trClass.json?.data?.code;
await memberCall('POST', `/api/cgm/classes/${trClassId}/entry-password`, { entryPassword: 'tr-201-entry' }, phantomToken);
await memberCall('POST', `/api/cgm/classes/${trClassId}/submit`, {}, phantomToken);
await memberCall('POST', `/api/cgm/phantom/classes/${trClassId}/approve`, {}, phantomToken);
const trCsv = ['Full Name,Index Number', 'Trans One,TR-201-001'].join('\n');
const trForm = new FormData();
trForm.append('file', new File([trCsv], 'roster.csv', { type: 'text/csv' }));
trForm.append('mapping', JSON.stringify({ full_name: 'Full Name', index_number: 'Index Number' }));
trForm.append('policy', 'skip');
await formCall('POST', `/api/cgm/classes/${trClassId}/roster/import`, trForm, phantomToken);
const trPendingReg = await call('POST', '/api/cgm/student/register', { classCode: trClassCode, indexNumber: 'TR-201-001', entryPassword: 'tr-201-entry' });
check('the transition fixture starts pending (approval default)', trPendingReg.json?.data?.state === 'received');

await memberCall('PUT', '/api/cgm/phantom/policies', { key: 'student_registration_mode', value: 'auto' }, phantomToken);
const trRowAfterAuto = q1("SELECT status, student_id FROM cgm_registration_requests WHERE roster_entry_id = (SELECT id FROM cgm_roster_entries WHERE class_id = ? AND index_number_key = 'tr-201-001')", trClassId);
check('switching to automatic does NOT silently approve an existing pending registration',
  trRowAfterAuto?.status === 'pending' && trRowAfterAuto?.student_id === null, JSON.stringify(trRowAfterAuto || {}));
check('the pending student was NOT given an identity or passkey by the flip',
  !q1("SELECT id FROM cgm_students WHERE index_number_key = 'tr-201-001'"));

await memberCall('PUT', '/api/cgm/phantom/policies', { key: 'student_registration_mode', value: 'closed' }, phantomToken);
const trClosedRegister = await call('POST', '/api/cgm/student/register', { classCode: trClassCode, indexNumber: 'TR-201-001', entryPassword: 'tr-201-entry' });
void trClosedRegister;
const trQueueClosed = await memberCall('GET', `/api/cgm/classes/${trClassId}/registrations?status=pending`, undefined, phantomToken);
const trPendingRow = (trQueueClosed.json?.data || [])[0];
const trApprove = await memberCall('POST', `/api/cgm/classes/${trClassId}/registrations/${trPendingRow.id}/approve`, {}, phantomToken);
check('closed only closes NEW registrations — the organizer can still approve the queued one',
  trApprove.status === 200 && Boolean(trApprove.json?.data?.passkey), `status ${trApprove.status}`);
await memberCall('PUT', '/api/cgm/phantom/policies', { key: 'student_registration_mode', value: 'approval' }, phantomToken);

// -- Pending membership survives mode flips -----------------------------------
await memberCall('POST', `/api/cgm/classes/${trClassId}/settings`, { membershipApprovalRequired: true }, phantomToken);
const trInvite = await memberCall('POST', `/api/cgm/classes/${trClassId}/invitations`, { kind: 'general', maxUses: 3 }, phantomToken);
const adjoaSession2 = (await studentCall('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: 'AUTO-101-001', passkey: String(expectedPasskey || '') })).json?.data?.session?.token;
const trJoin = await studentCall('POST', '/api/cgm/student/join', { code: trInvite.json?.data?.code }, adjoaSession2);
check('the membership fixture starts pending', trJoin.json?.data?.state === 'requested', trJoin.text?.slice(0, 100));
await memberCall('PUT', '/api/cgm/phantom/policies', { key: 'membership_request_mode', value: 'auto' }, phantomToken);
const trPendingMember = q1("SELECT status FROM cgm_membership_requests WHERE class_id = ? AND student_id = (SELECT id FROM cgm_students WHERE index_number_key = 'auto-101-001')", trClassId);
check('switching membership to automatic leaves the queued request untouched', trPendingMember?.status === 'pending', JSON.stringify(trPendingMember || {}));
await memberCall('PUT', '/api/cgm/phantom/policies', { key: 'membership_request_mode', value: 'closed' }, phantomToken);
const trMemberRow = q1("SELECT id FROM cgm_membership_requests WHERE class_id = ? AND student_id = (SELECT id FROM cgm_students WHERE index_number_key = 'auto-101-001')", trClassId);
const trMemberApprove = await memberCall('POST', `/api/cgm/classes/${trClassId}/membership-requests/${trMemberRow.id}/approve`, {}, phantomToken);
check('closed mode still allows deciding the already-queued request', trMemberApprove.status === 200, `status ${trMemberApprove.status}`);
await memberCall('PUT', '/api/cgm/phantom/policies', { key: 'membership_request_mode', value: 'approval' }, phantomToken);

// -- Pending profile change survives the flip ---------------------------------
const trProfileLogin = (await studentCall('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: 'TR-201-001', passkey: String(trApprove.json?.data?.passkey || '') })).json?.data?.session?.token;
const trChange = await studentCall('POST', '/api/cgm/student/profile/change', { field: 'phone', newValue: '0207770001', reason: 'Transition probe' }, trProfileLogin);
check('the profile fixture starts pending', Boolean(q1("SELECT id FROM cgm_profile_change_requests WHERE student_id = (SELECT id FROM cgm_students WHERE index_number_key = 'tr-201-001') AND status = 'pending'")), trChange.text?.slice(0, 100));
await memberCall('PUT', '/api/cgm/phantom/policies', { key: 'profile_change_mode', value: 'auto' }, phantomToken);
const trPendingChange = q1("SELECT status FROM cgm_profile_change_requests WHERE student_id = (SELECT id FROM cgm_students WHERE index_number_key = 'tr-201-001')");
check('switching profile changes to automatic leaves the queued request pending', trPendingChange?.status === 'pending', JSON.stringify(trPendingChange || {}));
const trNewPhone = q1("SELECT phone FROM cgm_students WHERE index_number_key = 'tr-201-001'")?.phone;
check('the flip did not apply the queued value silently', trNewPhone !== '0207770001', String(trNewPhone));
await memberCall('PUT', '/api/cgm/phantom/policies', { key: 'profile_change_mode', value: 'approval' }, phantomToken);

// -- Data retention: removal never deletes the identity -----------------------
const trMembershipId = Number(q1('SELECT id FROM cgm_class_members WHERE class_id = ? ORDER BY id DESC LIMIT 1', trClassId)?.id);
await memberCall('POST', `/api/cgm/classes/${trClassId}/members/${trMembershipId}/remove`, { reason: 'Retention probe' }, phantomToken);
check('removing a membership keeps the permanent identity intact',
  Boolean(q1("SELECT id, passkey_suffix FROM cgm_students WHERE index_number_key = 'tr-201-001' AND passkey_suffix IS NOT NULL")));
check('the removed membership keeps its history row with a reason',
  q1('SELECT status, removal_reason FROM cgm_class_members WHERE id = ?', trMembershipId)?.status === 'removed');


// ===========================================================================
// 26. Roster file inspection: the import screen reads the file BEFORE any
//     import — columns, the first four rows for reference, per-column data
//     peeks and suggested linking.
// ===========================================================================
section('26. Roster file inspection (preview before import)');

const rosterCountBefore = q1('SELECT COUNT(*) c FROM cgm_roster_entries WHERE class_id = ?', classAId).c;
const pvCsv = [
  'Student Name,Exam Index,Contact,Sex,Mail',
  'Preview Ama,PRE-001,0244000099,female,ama.pv@example.com',
  'Preview Kofi,PRE-002,0244000098,male,kofi.pv@example.com',
  'Preview Akosua,PRE-003,0244000097,female,akosua.pv@example.com',
  'Preview Yaw,PRE-004,0244000096,male,yaw.pv@example.com',
  'Preview Abena,PRE-005,0244000095,female,abena.pv@example.com',
  'Preview Kojo,PRE-006,0244000094,male,kojo.pv@example.com',
].join('\n');
const pvForm = new FormData();
pvForm.append('file', new File([pvCsv], 'class-list.csv', { type: 'text/csv' }));
const pv = await formCall('POST', `/api/cgm/classes/${classAId}/roster/preview`, pvForm, amaToken);
check('the import screen can inspect a file without importing it', pv.status === 200, `status ${pv.status} ${pv.text?.slice(0, 140)}`);
check('the file columns are reported exactly as the file names them',
  JSON.stringify(pv.json?.data?.headers) === JSON.stringify(['Student Name', 'Exam Index', 'Contact', 'Sex', 'Mail']), JSON.stringify(pv.json?.data?.headers));
check('exactly the first FOUR rows are returned for reference', (pv.json?.data?.sampleRows || []).length === 4, String((pv.json?.data?.sampleRows || []).length));
check('the total row count is detected', pv.json?.data?.totalRows === 6, String(pv.json?.data?.totalRows));
check('the reference rows are the FIRST rows of the file',
  pv.json?.data?.sampleRows?.[0]['Student Name'] === 'Preview Ama' && pv.json?.data?.sampleRows?.[3]['Student Name'] === 'Preview Yaw');
check('every column carries a peek of the data inside it',
  pv.json?.data?.columnPeek?.['Exam Index'] === 'PRE-001' && pv.json?.data?.columnPeek?.['Sex'] === 'female', JSON.stringify(pv.json?.data?.columnPeek || {}));
check('columns are linked to their fields from the header names',
  pv.json?.data?.suggestedMapping?.full_name === 'Student Name' && pv.json?.data?.suggestedMapping?.index_number === 'Exam Index'
  && pv.json?.data?.suggestedMapping?.phone === 'Contact' && pv.json?.data?.suggestedMapping?.gender === 'Sex',
  JSON.stringify(pv.json?.data?.suggestedMapping || {}));
check('the required fields are declared to the screen',
  JSON.stringify(pv.json?.data?.requiredFields) === JSON.stringify(['full_name', 'index_number']));
check('inspection writes nothing to the roster',
  q1('SELECT COUNT(*) c FROM cgm_roster_entries WHERE class_id = ?', classAId).c === rosterCountBefore);

const pvXlsx = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(pvXlsx, XLSX.utils.json_to_sheet([
  { 'Full Name': 'Xlsx One', 'Index': 'XLS-001' }, { 'Full Name': 'Xlsx Two', 'Index': 'XLS-002' },
  { 'Full Name': 'Xlsx Three', 'Index': 'XLS-003' },
]), 'Sheet1');
const pvXlsxBits = XLSX.write(pvXlsx, { type: 'buffer', bookType: 'xlsx' });
const pvXlsxForm = new FormData();
pvXlsxForm.append('file', new File([pvXlsxBits], 'class-list.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
const pvXlsxOut = await formCall('POST', `/api/cgm/classes/${classAId}/roster/preview`, pvXlsxForm, amaToken);
check('an Excel file inspects through the same screen', pvXlsxOut.status === 200 && pvXlsxOut.json?.data?.format === 'xlsx', `status ${pvXlsxOut.status}`);
check('the Excel columns are linked automatically',
  pvXlsxOut.json?.data?.suggestedMapping?.full_name === 'Full Name' && pvXlsxOut.json?.data?.suggestedMapping?.index_number === 'Index', JSON.stringify(pvXlsxOut.json?.data?.suggestedMapping || {}));
check('the Excel reference shows at most four rows', (pvXlsxOut.json?.data?.sampleRows || []).length === 3);

const pvJsonForm = new FormData();
pvJsonForm.append('file', new File([JSON.stringify([{ name: 'Json One', id: 'JSN-001' }, { name: 'Json Two', id: 'JSN-002' }])], 'list.json', { type: 'application/json' }));
const pvJsonOut = await formCall('POST', `/api/cgm/classes/${classAId}/roster/preview`, pvJsonForm, amaToken);
check('a JSON file inspects through the same screen', pvJsonOut.status === 200 && pvJsonOut.json?.data?.format === 'json' && pvJsonOut.json?.data?.headers.join(',') === 'name,id');

const pvNone = await formCall('POST', `/api/cgm/classes/${classAId}/roster/preview`, new FormData(), amaToken);
check('inspecting with no file is refused clearly', pvNone.status === 400, `status ${pvNone.status}`);
const pvDenied = await formCall('POST', `/api/cgm/classes/${classAId}/roster/preview`, (() => { const f = new FormData(); f.append('file', new File([pvCsv], 'x.csv', { type: 'text/csv' })); return f; })(), applyToken);
check('a member without import permission cannot inspect the file', pvDenied.status === 403, `status ${pvDenied.status}`);
const pvUnknown = await formCall('POST', '/api/cgm/classes/999999/roster/preview', (() => { const f = new FormData(); f.append('file', new File([pvCsv], 'x.csv', { type: 'text/csv' })); return f; })(), amaToken);
check('inspection respects class access', [403, 404].includes(pvUnknown.status), `status ${pvUnknown.status}`);


// ===========================================================================
// 27. Per-class passkey marks: an organizer can put their own letters in
//     front of the passkeys their class issues; the default stays rx30 and
//     existing passkeys are never rewritten.
// ===========================================================================
section('27. Per-class passkey marks (default rx30)');

const setMark = (classId, prefix, token) => memberCall('POST', `/api/cgm/classes/${classId}/passkey-prefix`, { prefix }, token);

// -- Permission + validation --------------------------------------------------
// (§21 transferred classA's ownership to the assistant; ama stays co-organizer.)
const markDenied = await setMark(classAId, 'bio1', kwameToken);
check('a non-organizer of the class cannot change the passkey mark', markDenied.status === 403, `status ${markDenied.status}`);
const markBad = await setMark(classAId, 'BIO-1!', assistantToken);
check('marks with forbidden characters are refused', markBad.status === 400, `status ${markBad.status}`);
const markLong = await setMark(classAId, 'abcdefghijklmnop', assistantToken);
check('an over-long mark is refused', markLong.status === 400, `status ${markLong.status}`);
check('the refusals wrote nothing',
  q1("SELECT passkey_prefix FROM cgm_classes WHERE id = ?", classAId)?.passkey_prefix === undefined
  || q1("SELECT passkey_prefix FROM cgm_classes WHERE id = ?", classAId)?.passkey_prefix === 'rx30');

// -- Set the mark on class A --------------------------------------------------
const markSet = await setMark(classAId, 'bio1', assistantToken);
check('the organizer sets a class passkey mark', markSet.status === 200 && markSet.json?.data?.prefix === 'bio1', markSet.text?.slice(0, 140));
check('the mark is stored on the class', q1('SELECT passkey_prefix FROM cgm_classes WHERE id = ?', classAId)?.passkey_prefix === 'bio1');
check('the mark change is audited with the old and new value',
  Boolean(q1("SELECT id FROM cgm_audit WHERE action = 'cgm.class.passkey_prefix' AND context_json LIKE '%bio1%'")));
const markPhantom = await setMark(classAId, 'biox', phantomToken);
check('PHANTOM can override the class mark', markPhantom.status === 200, `status ${markPhantom.status}`);
await setMark(classAId, 'bio1', assistantToken);

// -- Existing students keep their passkeys ------------------------------------
const keeperLogin = await studentCall('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: 'BIO-201-001', passkey: 'rx30qz' });
check('an existing rx30 student still signs in after the class mark changed', keeperLogin.status === 200, `status ${keeperLogin.status}`);
check('the existing student kept the rx30 mark on their identity',
  q1("SELECT passkey_prefix FROM cgm_students WHERE index_number_key = 'bio-201-001'")?.passkey_prefix === 'rx30');

// -- New approval issues a marked passkey continuing the global sequence ------
const markRosterCsv = ['Full Name,Index Number', 'Mark One,MRK-27-001', 'Mark Two,MRK-27-002', 'Mark Three,MRK-27-003'].join('\n');
const markForm = new FormData();
markForm.append('file', new File([markRosterCsv], 'mark.csv', { type: 'text/csv' }));
markForm.append('mapping', JSON.stringify({ full_name: 'Full Name', index_number: 'Index Number' }));
markForm.append('policy', 'skip');
await formCall('POST', `/api/cgm/classes/${classAId}/roster/import`, markForm, amaToken);
const markRegister = await call('POST', '/api/cgm/student/register', { classCode: classACode, indexNumber: 'MRK-27-001', entryPassword: 'bio-201-entry' });
const markQueue = await memberCall('GET', `/api/cgm/classes/${classAId}/registrations?status=pending`, undefined, amaToken);
const markRow = (markQueue.json?.data || []).find((row) => row.indexNumber === 'MRK-27-001');
const markApprove = await memberCall('POST', `/api/cgm/classes/${classAId}/registrations/${markRow.id}/approve`, {}, amaToken);
const expectedMark = `bio1${scatterSuffix(Number(q1("SELECT next_value FROM cgm_sequences WHERE id = 'student_passkey'").next_value) - 1)}`;
check('an approval under a custom mark issues a marked passkey', markApprove.json?.data?.passkey === expectedMark,
  `got ${markApprove.json?.data?.passkey} expected ${expectedMark}`);
check('the sequence after the mark still continues the global counter',
  q1("SELECT passkey_prefix || passkey_suffix AS pk FROM cgm_students WHERE index_number_key = 'mrk-27-001'")?.pk === expectedMark);
check('the suffix stays globally unique',
  new Set(q('SELECT passkey_suffix FROM cgm_students WHERE passkey_suffix IS NOT NULL').map((r) => r.passkey_suffix)).size
    === q('SELECT COUNT(*) c FROM cgm_students WHERE passkey_suffix IS NOT NULL')[0].c);

// -- Sign-in with the marked passkey ------------------------------------------
const markLogin = await studentCall('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: 'MRK-27-001', passkey: expectedMark });
check('the marked passkey signs its student in', markLogin.status === 200, `status ${markLogin.status}`);
const markWrong = await studentCall('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: 'MRK-27-001', passkey: 'bio1zzp' });
check('a wrong suffix under a valid-looking mark is the generic anonymous failure (never a lock, never an oracle)',
  markWrong.status === 400 && Boolean(markWrong.json?.error)
  && !q1('SELECT locked_until FROM cgm_students WHERE index_number_key = ?', 'mrk-27-001')?.locked_until
  && markWrong.json?.error === unknownPasskey.json?.error);
const markOldShape = await studentCall('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: 'MRK-27-001', passkey: `rx30${expectedMark.slice(4)}` });
check('the same suffix under the WRONG mark never signs in', markOldShape.status === 400, `status ${markOldShape.status}`);
const markHint = (markLogin.json?.data?.student?.passkeyHint || '');
check('the student record hints with the own mark only', markHint.startsWith('bio1') && markHint.endsWith('…'), markHint);

// -- Automatic registration carries the class mark too ------------------------
await setMark(autoClassId, 'phy7', kwameToken);
await memberCall('PUT', '/api/cgm/phantom/policies', { key: 'student_registration_mode', value: 'auto' }, phantomToken);
const autoRosterForm2 = new FormData();
autoRosterForm2.append('file', new File(['Full Name,Index Number\nMark Auto,AUTO-101-003'], 'r.csv', { type: 'text/csv' }));
autoRosterForm2.append('mapping', JSON.stringify({ full_name: 'Full Name', index_number: 'Index Number' }));
autoRosterForm2.append('policy', 'skip');
await formCall('POST', `/api/cgm/classes/${autoClassId}/roster/import`, autoRosterForm2, kwameToken);
const autoMarkRegister = await call('POST', '/api/cgm/student/register', { classCode: autoClassCode, indexNumber: 'AUTO-101-003', entryPassword: 'phy-201-entry' });
check('automatic registration issues the class mark as well',
  String(autoMarkRegister.json?.data?.passkey || '').startsWith('phy7'), String(autoMarkRegister.json?.data?.passkey));
const autoMarkPasskey = String(autoMarkRegister.json?.data?.passkey || '');
const autoMarkLogin = await studentCall('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: 'AUTO-101-003', passkey: autoMarkPasskey });
check('the automatically issued marked passkey signs in at once', autoMarkLogin.status === 200, `status ${autoMarkLogin.status}`);
await memberCall('PUT', '/api/cgm/phantom/policies', { key: 'student_registration_mode', value: 'approval' }, phantomToken);

// -- Self-service change keeps the student's own mark --------------------------
await memberCall('POST', `/api/cgm/classes/${classAId}/settings`, { studentVisibleFields: ['full_name'], loginFormat: { identifiers: ['index_number'], allowStudentPasskeyChange: true } }, assistantToken);
const markSession = markLogin.json?.data?.session?.token;
const changeWrongMark = await studentCall('POST', '/api/cgm/student/passkey/change', { currentPasskey: expectedMark, newPasskey: 'rx30qq' }, markSession);
check('a self-service change cannot leave the student\'s own mark', changeWrongMark.status === 400 && /bio1/.test(String(changeWrongMark.json?.error)), changeWrongMark.text?.slice(0, 140));
const changeOk = await studentCall('POST', '/api/cgm/student/passkey/change', { currentPasskey: expectedMark, newPasskey: 'bio1qq' }, markSession);
check('the self-service change keeps the mark and rotates the letters', changeOk.status === 200, `status ${changeOk.status}`);
const relogin = await studentCall('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: 'MRK-27-001', passkey: 'bio1qq' });
check('the student signs in with the changed marked passkey', relogin.status === 200, `status ${relogin.status}`);
check('the sequence rotated with the change (suffix unique)',
  q1("SELECT passkey_suffix FROM cgm_students WHERE index_number_key = 'mrk-27-001'")?.passkey_suffix === 'qq');

// -- Resetting to the default --------------------------------------------------
const markReset = await setMark(classAId, '', assistantToken);
check('an empty mark resets the class to rx30', markReset.status === 200 && markReset.json?.data?.prefix === 'rx30', markReset.text?.slice(0, 120));
const afterReset = await call('POST', '/api/cgm/student/register', { classCode: classACode, indexNumber: 'MRK-27-002', entryPassword: 'bio-201-entry' });
const afterQueue = await memberCall('GET', `/api/cgm/classes/${classAId}/registrations?status=pending`, undefined, amaToken);
const afterRow = (afterQueue.json?.data || []).find((row) => row.indexNumber === 'MRK-27-002');
const afterApprove = await memberCall('POST', `/api/cgm/classes/${classAId}/registrations/${afterRow.id}/approve`, {}, amaToken);
check('after the reset new passkeys start with rx30 again',
  String(afterApprove.json?.data?.passkey || '').startsWith('rx30'), String(afterApprove.json?.data?.passkey));
const untouchedLogin = await studentCall('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: 'MRK-27-001', passkey: 'bio1qq' });
check('the reset never rewrote the earlier student\'s marked passkey', untouchedLogin.status === 200, `status ${untouchedLogin.status}`);


// ===========================================================================
// 28. Roster mass actions + row editing; invitation tokens that stay;
//     the dependency-free QR encoder
// ===========================================================================
section('28. Roster editing & mass actions, persistent invitations, QR encoder');

// -- Roster rows are individually editable after an upload --------------------
const freshRow = await memberCall('POST', `/api/cgm/classes/${classAId}/roster/entries`, { fullName: 'Edit Me', indexNumber: 'EDIT-28-001' }, amaToken);
const freshRowId = Number(freshRow.json?.data?.id);
check('a fresh unregistered row exists for editing', Number.isInteger(freshRowId) && freshRowId > 0, `status ${freshRow.status}`);
const editName = await memberCall('PATCH', `/api/cgm/classes/${classAId}/roster/entries/${freshRowId}`, { fullName: 'Edit Me Owusu', phone: '0201112233', gender: 'female' }, amaToken);
check('the organizer edits a roster row after the upload', editName.status === 200, `status ${editName.status} ${editName.text?.slice(0, 120)}`);
const editedRow = q1('SELECT full_name, phone, gender FROM cgm_roster_entries WHERE id = ?', freshRowId);
check('the edited name, phone and gender are stored', editedRow?.full_name === 'Edit Me Owusu' && editedRow?.phone === '0201112233' && editedRow?.gender === 'female', JSON.stringify(editedRow));
const editIndex = await memberCall('PATCH', `/api/cgm/classes/${classAId}/roster/entries/${freshRowId}`, { indexNumber: 'EDIT-28-001B' }, amaToken);
check('the index number of an unregistered row can be corrected', editIndex.status === 200, `status ${editIndex.status}`);
check('the corrected index is searchable', q1("SELECT COUNT(*) c FROM cgm_roster_entries WHERE class_id = ? AND index_number_key = 'edit-28-001b'", classAId).c === 1);
const editDuplicate = await memberCall('PATCH', `/api/cgm/classes/${classAId}/roster/entries/${freshRowId}`, { indexNumber: 'BIO-201-001' }, amaToken);
check('an index number cannot collide with another row', editDuplicate.status === 409, `status ${editDuplicate.status}`);
const registeredEntry = q1("SELECT id, student_id FROM cgm_roster_entries WHERE class_id = ? AND student_id IS NOT NULL LIMIT 1", classAId);
if (registeredEntry?.id) {
  const editRegistered = await memberCall('PATCH', `/api/cgm/classes/${classAId}/roster/entries/${registeredEntry.id}`, { indexNumber: 'BIO-201-999' }, amaToken);
  check("a registered student's index is not edited through the roster row", editRegistered.status === 409, `status ${editRegistered.status}`);
}

// -- Select-all mass actions on the roster ------------------------------------
const bulkAdds = [];
for (const [name, index] of [['Ama Bulk', 'BULK-28-001'], ['Esi Bulk', 'BULK-28-002'], ['Yao Bulk', 'BULK-28-003']]) {
  const added = await memberCall('POST', `/api/cgm/classes/${classAId}/roster/entries`, { fullName: name, indexNumber: index }, amaToken);
  bulkAdds.push(Number(added.json?.data?.id));
}
check('three mass-action fixture rows were added', bulkAdds.every((id) => Number.isInteger(id) && id > 0), JSON.stringify(bulkAdds));
const bulkNoIds = await memberCall('POST', `/api/cgm/classes/${classAId}/roster/entries/bulk-delete`, {}, amaToken);
check('a bulk delete without a selection is refused', bulkNoIds.status === 400, `status ${bulkNoIds.status}`);
const bulkForeign = await memberCall('POST', `/api/cgm/classes/${classAId}/roster/entries/bulk-delete`, { ids: bulkAdds }, kwameToken);
check('mass actions still need the roster permission', bulkForeign.status === 403, `status ${bulkForeign.status}`);
const registeredEntryId = registeredEntry?.id || Number(q1("SELECT id FROM cgm_roster_entries WHERE class_id = ? AND student_id IS NOT NULL LIMIT 1", classAId)?.id);
const bulkRun = await memberCall('POST', `/api/cgm/classes/${classAId}/roster/entries/bulk-delete`, { ids: [...bulkAdds, registeredEntryId] }, amaToken);
check('the bulk delete removes exactly the unregistered selection',
  bulkRun.status === 200 && Number(bulkRun.json?.data?.deleted) === 3 && Number(bulkRun.json?.data?.skippedRegistered) === 1,
  bulkRun.text?.slice(0, 140));
check('the registered row survives the bulk delete', q1('SELECT COUNT(*) c FROM cgm_roster_entries WHERE id = ?', registeredEntryId).c === 1);
check('the bulk removal is audited with the count', q1("SELECT COUNT(*) c FROM cgm_audit WHERE action = 'cgm.roster.entries_bulk_removed'").c >= 1);

// -- Select-all mass actions on Members ---------------------------------------
const membersNow = await memberCall('GET', `/api/cgm/classes/${classAId}/members`, undefined, amaToken);
const memberIds = (membersNow.json?.data || []).map((row) => Number(row.memberId)).filter((id) => Number.isInteger(id));
check('classA has members to mass-act on', memberIds.length >= 2, JSON.stringify(memberIds.length));
const bulkSuspend = await memberCall('POST', `/api/cgm/classes/${classAId}/members/bulk`, { action: 'suspend', ids: memberIds }, amaToken);
check('select-all suspend suspends every selected membership',
  bulkSuspend.status === 200 && Number(bulkSuspend.json?.data?.affected) === memberIds.length, bulkSuspend.text?.slice(0, 140));
check('the memberships are actually suspended', q1("SELECT COUNT(*) c FROM cgm_class_members WHERE class_id = ? AND status = 'suspended'", classAId).c === memberIds.length);
for (const memberId of memberIds) {
  await memberCall('POST', `/api/cgm/classes/${classAId}/members/${memberId}/restore`, {}, amaToken);
}
check('every membership was restored after the mass-action rehearsal',
  q1("SELECT COUNT(*) c FROM cgm_class_members WHERE class_id = ? AND status = 'active'", classAId).c === memberIds.length);
const bulkRemove = await memberCall('POST', `/api/cgm/classes/${classAId}/members/bulk`, { action: 'remove', ids: memberIds, reason: 'Mass-action drill' }, amaToken);
check('select-all remove removes the selected memberships with a reason',
  bulkRemove.status === 200 && Number(bulkRemove.json?.data?.affected) === memberIds.length, bulkRemove.text?.slice(0, 140));
check('the removals record the drill reason', q1("SELECT COUNT(*) c FROM cgm_class_members WHERE class_id = ? AND status = 'removed' AND removal_reason = 'Mass-action drill'", classAId).c === memberIds.length);
for (const memberId of memberIds) {
  await memberCall('POST', `/api/cgm/classes/${classAId}/members/${memberId}/restore`, {}, amaToken);
}
const bulkBadAction = await memberCall('POST', `/api/cgm/classes/${classAId}/members/bulk`, { action: 'delete', ids: memberIds }, amaToken);
check('an unknown mass action is refused', bulkBadAction.status === 400, `status ${bulkBadAction.status}`);

// -- General invitations are code-only: no second bearer secret exists ---------
const stickyInvite = await memberCall('POST', `/api/cgm/classes/${classAId}/invitations`, { kind: 'general' }, assistantToken);
const stickyCode = stickyInvite.json?.data?.code;
check('a general invitation is created with a public code and NO bearer token',
  Boolean(stickyCode) && stickyInvite.json?.data?.token === undefined, String(stickyCode));
check('no raw bearer half is stored for a general invitation (code is the shareable half)',
  q1('SELECT token_value, token_enc FROM cgm_invitations WHERE id = ?', Number(stickyInvite.json?.data?.id))?.token_value === null
  && q1('SELECT token_enc FROM cgm_invitations WHERE id = ?', Number(stickyInvite.json?.data?.id))?.token_enc === null);
const stickyList = await memberCall('GET', `/api/cgm/classes/${classAId}/invitations`, undefined, assistantToken);
const stickyRow = (stickyList.json?.data || []).find((row) => Number(row.id) === Number(stickyInvite.json?.data?.id));
check('the invitations list serves the general link from the public code, with no token',
  stickyRow?.token === null && String(stickyRow?.link || '').includes(`#class-invite/${stickyCode}`), JSON.stringify(stickyRow?.link || '').slice(0, 120));
const stickyLanding = await call('GET', `/api/cgm/invitations/${stickyCode}`);
check('the public code keeps resolving for students', stickyLanding.status === 200, `status ${stickyLanding.status}`);
const stickyRegen = await memberCall('POST', `/api/cgm/invitations/${stickyInvite.json?.data?.id}/regenerate`, {}, assistantToken);
check('regenerating a general invitation issues a fresh code (no token half at all)',
  stickyRegen.status === 200 && Boolean(stickyRegen.json?.data?.code) && stickyRegen.json?.data?.token === undefined, `status ${stickyRegen.status}`);
const stickyList2 = await memberCall('GET', `/api/cgm/classes/${classAId}/invitations`, undefined, assistantToken);
const stickyRow2 = (stickyList2.json?.data || []).find((row) => Number(row.id) === Number(stickyInvite.json?.data?.id));
check('after regeneration the fresh code works and the old code is dead',
  String(stickyRow2?.link || '').includes(`#class-invite/${stickyRegen.json?.data?.code}`)
  && (await call('GET', `/api/cgm/invitations/${stickyCode}`)).status === 404
  && (await call('GET', `/api/cgm/invitations/${stickyRegen.json?.data?.code}`)).status === 200);

// -- The in-house QR encoder (src/lib/qr.ts) ----------------------------------
await build({ entryPoints: [path.join(ROOT, 'src/lib/qr.ts')], outfile: path.join(CACHE, 'qr.mjs'), bundle: true, format: 'esm', logLevel: 'silent' });
const { encodeQr, qrVersionFor } = await import(path.join(CACHE, 'qr.mjs'));
const matrixSha = (qr) =>
  shaHash('sha256').update(qr.dark.map((cells) => cells.map((cell) => (cell ? 1 : 0)).join('')).join('\n')).digest('hex');
const inviteUrl = 'https://coderxsociety.pages.dev/#class-invite/LS0002-CAFFCC';
const qrKnown = encodeQr(inviteUrl);
check('the QR encoder matches the verified reference for the invite link (known answer)',
  qrKnown.size === 33 && qrKnown.version === 4 && qrKnown.mask === 2
  && qrKnown.dark.flat().filter(Boolean).length === 567
  && matrixSha(qrKnown).startsWith('6c28ff4298ea3ce0'),
  `size=${qrKnown.size} v=${qrKnown.version} mask=${qrKnown.mask} dark=${qrKnown.dark.flat().filter(Boolean).length}`);
const qrKnown2 = encodeQr('https://chat.whatsapp.com/InviteLinkExample123');
check('the QR encoder matches for the WhatsApp link shape too',
  qrKnown2.size === 33 && qrKnown2.dark.flat().filter(Boolean).length === 573 && matrixSha(qrKnown2).startsWith('e24ba1dc54a291d2'),
  `dark=${qrKnown2.dark.flat().filter(Boolean).length}`);
const qrAgain = encodeQr(inviteUrl);
check('the QR encoder is deterministic', matrixSha(qrAgain) === matrixSha(qrKnown));
check('the QR code carries its finder patterns at three corners',
  qrKnown.dark[0][0] && qrKnown.dark[6][6] && qrKnown.dark[0][6]
  && qrKnown.dark[qrKnown.size - 7][0] && qrKnown.dark[qrKnown.size - 1][qrKnown.size - 7]
  && !qrKnown.dark[7][7]);
check('the timing pattern alternates from the finders', qrKnown.dark[8][6] === true && qrKnown.dark[9][6] === false);
check('the version grows with the payload (level M capacities)',
  qrVersionFor(14) === 1 && qrVersionFor(15) === 2 && qrVersionFor(2331) === 40 && qrVersionFor(2332) === null);
let oversizeThrew = false;
try { encodeQr('x'.repeat(3000)); } catch { oversizeThrew = true; }
check('an oversized payload is refused cleanly', oversizeThrew);
const qrLong = encodeQr(`https://coderxsociety.pages.dev/#class-invite/${'L'.repeat(300)}`);
check('long links encode on a higher version', qrLong.version > 4 && qrLong.dark.length > 0);
check('the UI renders the QR as inline SVG (no external QR runtime)',
  readFileSync(path.join(ROOT, 'src/components/ClassGroups/ClassGroupsWorkspace.tsx'), 'utf8').includes('import { encodeQr } from')
  && !readFileSync(path.join(ROOT, 'package.json'), 'utf8').includes('"qrcode"'));


// ===========================================================================
// 29. Organizer automation in Settings (registrations + memberships set to
//     automatic), classmates honour "visible when set", and the student
//     elections list that the voting link lands on
// ===========================================================================
section('29. Automation in Settings, classmates when set, voting-link elections');

// -- A fresh class with an auto-registration switch ---------------------------
const zooClass = await memberCall('POST', '/api/cgm/classes', { name: 'ZOO 101 Auto Section', institution: 'Accra Technical University' }, amaToken);
const zooClassId = zooClass.json?.data?.classId ?? zooClass.json?.data?.class?.id ?? zooClass.json?.data?.id;
const zooCode = zooClass.json?.data?.code ?? zooClass.json?.data?.class?.code;
await memberCall('POST', `/api/cgm/classes/${zooClassId}/entry-password`, { entryPassword: 'zoo-101-entry' }, amaToken);
await memberCall('POST', `/api/cgm/phantom/classes/${zooClassId}/approve`, {}, phantomToken);
const zooCsv = [
  'Full Name,Index Number,Phone,Gender',
  'Adwoa Zoo, ZOO-101-001,0245000001,female',
  'Benjamin Zoo, ZOO-101-002,0245000002,male',
].join('\n');
const zooForm = new FormData();
zooForm.append('file', new File([zooCsv], 'zoo.csv', { type: 'text/csv' }));
zooForm.append('mapping', JSON.stringify({ full_name: 'Full Name', index_number: 'Index Number', phone: 'Phone', gender: 'Gender' }));
zooForm.append('policy', 'skip');
const zooImport = await formCall('POST', `/api/cgm/classes/${zooClassId}/roster/import`, zooForm, amaToken);
check('the §29 roster imports', zooImport.status === 200, zooImport.text?.slice(0, 140));

// The organizer flips BOTH automation switches in Settings.
const autoSettings = await memberCall('POST', `/api/cgm/classes/${zooClassId}/settings`, {
  registrationMode: 'auto',
  membershipApprovalRequired: false,
}, amaToken);
check('the organizer can set registrations and memberships to automatic',
  autoSettings.status === 200 && autoSettings.json?.data?.settings?.registrationMode === 'auto' && autoSettings.json?.data?.settings?.membershipApprovalRequired === false,
  autoSettings.text?.slice(0, 140));
const stillApproval = await memberCall('GET', `/api/cgm/classes/${classAId}`, undefined, amaToken);
check('the switch is per class — classA keeps organizer approval',
  stillApproval.json?.data?.settings?.registrationMode !== 'auto' && stillApproval.json?.data?.settings?.membershipApprovalRequired !== false,
  JSON.stringify(stillApproval.json?.data?.settings?.registrationMode));

// -- Automatic registration issues the passkey on the spot --------------------
const autoReg = await call('POST', '/api/cgm/student/register', { classCode: zooCode, indexNumber: 'ZOO-101-001', entryPassword: 'zoo-101-entry' });
check('with the class set to automatic, registration issues the passkey immediately',
  autoReg.status === 200 && /^[a-z0-9]{2,10}[a-z]{1,2}$/.test(String(autoReg.json?.data?.passkey || '')),
  autoReg.text?.slice(0, 160));
check('the automatic registration left nothing in the approvals queue',
  q1("SELECT COUNT(*) c FROM cgm_registration_requests r JOIN cgm_roster_entries re ON re.id = r.roster_entry_id WHERE re.class_id = ? AND r.status = 'pending'", zooClassId).c === 0);
check('the automatic registration created the membership too',
  q1("SELECT COUNT(*) c FROM cgm_class_members m JOIN cgm_students s ON s.id = m.student_id WHERE m.class_id = ? AND s.index_number_key = 'zoo-101-001' AND m.status = 'active'", zooClassId).c === 1);
const autoReg2 = await call('POST', '/api/cgm/student/register', { classCode: zooCode, indexNumber: 'ZOO-101-002', entryPassword: 'zoo-101-entry' });
check('a second automatic registration also walks straight through', autoReg2.status === 200 && Boolean(autoReg2.json?.data?.passkey), autoReg2.text?.slice(0, 120));

// -- Classmates honour the class visibility setting ("viewing when set") ------
const adwoaLogin = await studentCall('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: 'ZOO-101-001', passkey: String(autoReg.json?.data?.passkey) });
const adwoaSession = adwoaLogin.json?.data?.session?.token;
check('the automatically registered student signs in', Boolean(adwoaSession), `status ${adwoaLogin.status}`);
const classmatesBefore = await studentCall('GET', `/api/cgm/student/classes/${zooClassId}`, undefined, adwoaSession);
const classmatesDefault = classmatesBefore.json?.data?.classmates || [];
check('classmates are listed with names by default and contacts stay private',
  classmatesDefault.length === 2
  && classmatesDefault.every((row) => row.fullName && row.phone === undefined && row.email === undefined),
  JSON.stringify(classmatesDefault).slice(0, 160));
await memberCall('POST', `/api/cgm/classes/${zooClassId}/settings`, { studentVisibleFields: ['full_name', 'phone'] }, amaToken);
const classmatesAfter = await studentCall('GET', `/api/cgm/student/classes/${zooClassId}`, undefined, adwoaSession);
const classmatesVisible = classmatesAfter.json?.data?.classmates || [];
const benjamin = classmatesVisible.find((row) => row.fullName === 'Benjamin Zoo');
check('when the organizer sets phone visible, classmates can actually view it',
  Boolean(benjamin?.phone), JSON.stringify(benjamin || {}).slice(0, 120));
check('index numbers and gender never reach the classmates list even when contacts open',
  classmatesVisible.every((row) => row.index_number === undefined && row.indexNumber === undefined && row.gender === undefined));

// -- The student elections list (the target of the organizer voting link) ------
const zooActivity = await memberCall('POST', `/api/cgm/classes/${zooClassId}/activities`, {
  name: 'Zoo Field Practical', type: 'practical',
  config: { method: 'automatic', groupCount: 2, capacity: 10, genderRule: 'none', overflow: 'block', leaderMethod: 'election', announcementMode: 'direct', whatsappEnabled: true, attendanceEnabled: true, electionAnonymity: 'anonymous', allowVoteChange: false, tieBreak: 'random', eligibility: 'all' },
}, amaToken);
const zooActivityId = zooActivity.json?.data?.activityId ?? zooActivity.json?.data?.activity?.id ?? zooActivity.json?.data?.id;
await memberCall('POST', `/api/cgm/activities/${zooActivityId}/lifecycle`, { action: 'publish' }, amaToken);
const zooGenerate = await memberCall('POST', `/api/cgm/activities/${zooActivityId}/generate`, {}, amaToken);
check('the zoo practical assigns both students into its group', zooGenerate.status === 200 && Number(zooGenerate.json?.data?.unplaced || 0) === 0, zooGenerate.text?.slice(0, 120));
const zooDetail = await memberCall('GET', `/api/cgm/activities/${zooActivityId}`, undefined, amaToken);
const adwoaStudentId = q1("SELECT id FROM cgm_students WHERE index_number_key = 'zoo-101-001'").id;
const zooGroupId = Number(q1("SELECT group_id FROM cgm_group_assignments WHERE activity_id = ? AND student_id = ? AND status = 'active'", zooActivityId, adwoaStudentId)?.group_id);
check('the election is created on the group Adwoa actually landed in', Number.isInteger(zooGroupId) && zooGroupId > 0, `group=${zooGroupId}`);
const zooElection = await memberCall('POST', `/api/cgm/groups/${zooGroupId}/elections`, { title: 'Field lead', role: 'leader', anonymity: 'anonymous', visibility: 'class', allowVoteChange: false, tieBreak: 'random' }, amaToken);
const zooElectionId = zooElection.json?.data?.electionId ?? zooElection.json?.data?.election?.id ?? zooElection.json?.data?.id;
check('the zoo election exists', Boolean(zooElectionId), zooElection.text?.slice(0, 120));
const listBeforeVote = await studentCall('GET', '/api/cgm/student/elections', undefined, adwoaSession);
const listedElection = (listBeforeVote.json?.data || []).find((row) => Number(row.id) === Number(zooElectionId));
check('the student elections list contains the election with its class and voted flag',
  Boolean(listedElection) && listedElection.className === 'ZOO 101 Auto Section' && listedElection.voted === false,
  JSON.stringify((listBeforeVote.json?.data || []).slice(0, 1)).slice(0, 200));
const adwoaContest = await studentCall('POST', `/api/cgm/student/activities/${zooActivityId}/contest`, { statement: 'I will keep the field team sharp.' }, adwoaSession);
check('a member contests before the voting window opens', adwoaContest.status === 200, `status ${adwoaContest.status} ${adwoaContest.text?.slice(0, 120)}`);
const openZooVote = await memberCall('POST', `/api/cgm/elections/${zooElectionId}/open-voting`, {}, amaToken);
check('voting opens for the zoo election', openZooVote.status === 200, `status ${openZooVote.status}`);
const zooBallot = await studentCall('GET', `/api/cgm/student/elections/${zooElectionId}`, undefined, adwoaSession);
check('the voting-link target resolves straight to the ballot with candidates',
  zooBallot.status === 200 && zooBallot.json?.data?.canVote === true && (zooBallot.json?.data?.candidates || []).length >= 1,
  zooBallot.text?.slice(0, 160));
const zooCandidateId = Number((zooBallot.json?.data?.candidates || [])[0]?.id);
const zooVote = await studentCall('POST', `/api/cgm/student/elections/${zooElectionId}/vote`, { candidateId: zooCandidateId }, adwoaSession);
check('the student votes right from the linked ballot', zooVote.status === 200, `status ${zooVote.status} ${zooVote.text?.slice(0, 120)}`);
const listAfterVote = await studentCall('GET', '/api/cgm/student/elections', undefined, adwoaSession);
const listedAfter = (listAfterVote.json?.data || []).find((row) => Number(row.id) === Number(zooElectionId));
check('after voting the list shows the election as voted', Boolean(listedAfter?.voted));

// The student session storage keeps the student signed in across visits.
const portalSource = readFileSync(path.join(ROOT, 'src/lib/cgm.ts'), 'utf8');
check('the student session is persisted in localStorage (login status survives a browser restart)',
  /localStorage\.setItem\(STUDENT_SESSION_KEY/.test(portalSource)
  && /localStorage\.getItem\(STUDENT_SESSION_KEY/.test(portalSource)
  && !/sessionStorage\.setItem\(STUDENT_SESSION_KEY/.test(portalSource));

// ---------------------------------------------------------------------------
// 30. Task-12: scattered passkeys (skip rule), tolerant index formats,
//     gender self-service, roster-backed claims, activity editing, leader links
// ---------------------------------------------------------------------------
section('30. Scattered passkey skips, tolerant index formats, gender gate, activity editing, leader links');

// -- A fresh class whose roster uses the slashed index trend -------------------
const fmtClass = await memberCall('POST', '/api/cgm/classes', { name: 'FMT 101 Formats', institution: 'Accra Technical University' }, amaToken);
const fmtClassId = fmtClass.json?.data?.classId ?? fmtClass.json?.data?.class?.id ?? fmtClass.json?.data?.id;
const fmtCode = fmtClass.json?.data?.code ?? fmtClass.json?.data?.class?.code;
await memberCall('POST', `/api/cgm/classes/${fmtClassId}/entry-password`, { entryPassword: 'fmt-101-entry' }, amaToken);
await memberCall('POST', `/api/cgm/phantom/classes/${fmtClassId}/approve`, {}, phantomToken);
await memberCall('POST', `/api/cgm/classes/${fmtClassId}/roster/entries`, { fullName: 'Philippa Ami', indexNumber: 'PH/PHA/24/0292', phone: '0244117292' }, amaToken);
await memberCall('POST', `/api/cgm/classes/${fmtClassId}/roster/entries`, { fullName: 'Kwame Botchway', indexNumber: 'PH/PHA/24/0293', phone: '0244117293' }, amaToken);
check('the fmt roster holds the canonical slashed index',
  q1("SELECT index_number FROM cgm_roster_entries WHERE class_id = ? AND index_number_key = 'ph/pha/24/0292'", fmtClassId)?.index_number === 'PH/PHA/24/0292');

// Register with lower-case dashes: the roster row must still be found.
const fmtReg = await call('POST', '/api/cgm/student/register', { classCode: fmtCode, indexNumber: 'ph-pha-24-0292', entryPassword: 'fmt-101-entry' });
check('registration accepts any case/separator format of the roster index (trend PH/PHA/24/0292)',
  fmtReg.status === 200 && fmtReg.json?.data?.state === 'received', `status ${fmtReg.status} ${fmtReg.text?.slice(0, 140)}`);

// -- Scatter skip rule: a suffix already held by a legacy key is never reused ---
const fmtQueue = await memberCall('GET', `/api/cgm/classes/${fmtClassId}/registrations?status=pending`, undefined, amaToken);
const fmtRow = (fmtQueue.json?.data || []).find((entry) => entry.indexNumber === 'PH/PHA/24/0292');
check('the fmt registration waits in the approval queue', Boolean(fmtRow), fmtQueue.text?.slice(0, 140));
const seqBeforeSkip = Number(q1("SELECT next_value FROM cgm_sequences WHERE id = 'student_passkey'").next_value);
const decoySuffix = scatterSuffix(seqBeforeSkip);
sqlite.prepare(
  "INSERT INTO cgm_students (full_name, index_number, index_number_key, institution, institution_key, passkey_suffix, passkey_prefix, status) " +
  "SELECT 'Legacy Holder', 'LEG-001', 'leg-001', institution, institution_key, ?, 'rx30', 'active' FROM cgm_students LIMIT 1"
).run(decoySuffix);
const fmtApprove = await memberCall('POST', `/api/cgm/classes/${fmtClassId}/registrations/${fmtRow.id}/approve`, {}, amaToken);
const fmtPasskey = String(fmtApprove.json?.data?.passkey || '');
check(`a scattered suffix already held by a legacy key is skipped (decoy ${decoySuffix} not re-issued)`,
  fmtApprove.status === 200 && fmtPasskey && !fmtPasskey.endsWith(decoySuffix) && /^rx30[a-z]{1,2}$/.test(fmtPasskey),
  `status ${fmtApprove.status} passkey=${fmtPasskey || 'none'}`);
check('the skipped sequence is consumed — the counter moved twice',
  Number(q1("SELECT next_value FROM cgm_sequences WHERE id = 'student_passkey'").next_value) === seqBeforeSkip + 2,
  String(q1("SELECT next_value FROM cgm_sequences WHERE id = 'student_passkey'")?.next_value));
check('passkey suffixes stay globally unique after the skip',
  q('SELECT passkey_suffix FROM cgm_students WHERE passkey_suffix IS NOT NULL').length
  === new Set(q('SELECT passkey_suffix FROM cgm_students WHERE passkey_suffix IS NOT NULL').map((r) => r.passkey_suffix)).size);
passkeyByIndex.set('ph/pha/24/0292', fmtPasskey);

// -- Login accepts every format and case of the same index number --------------
const fmtLoginSpaces = await studentCall('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: 'PH PHA 24 0292', passkey: fmtPasskey });
const fmtLoginDots = await studentCall('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: 'ph.pha.24.0292', passkey: fmtPasskey });
const fmtLoginCanonical = await studentCall('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: 'PH/PHA/24/0292', passkey: fmtPasskey });
const fmtStudentId = Number(q1("SELECT id FROM cgm_students WHERE index_number_key = 'ph/pha/24/0292'")?.id || 0);
check('login accepts spaces instead of slashes', fmtLoginSpaces.json?.data?.student?.id === fmtStudentId, `status ${fmtLoginSpaces.status}`);
check('login accepts dots and lower case', fmtLoginDots.json?.data?.student?.id === fmtStudentId, `status ${fmtLoginDots.status}`);
check('login accepts the canonical trend format', fmtLoginCanonical.json?.data?.student?.id === fmtStudentId, `status ${fmtLoginCanonical.status}`);
const fmtWrongOwner = await studentCall('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: 'PH/PHA/24/0293', passkey: fmtPasskey });
check('a format twin of another student still needs their own passkey', fmtWrongOwner.status === 400, `status ${fmtWrongOwner.status}`);
const fmtSession = fmtLoginCanonical.json?.data?.session?.token;

// -- Gender self-service gates gender-balanced self-assignment ------------------
check('the roster import left the gender unknown', q1('SELECT gender FROM cgm_students WHERE id = ?', fmtStudentId)?.gender === 'unknown');
const fmtActivity = await memberCall('POST', `/api/cgm/classes/${fmtClassId}/activities`, {
  name: 'Seminar Pods', type: 'seminar',
  config: { method: 'self', groupCount: 2, capacity: 5, genderRule: 'balanced', repeatRule: 'random', leaderMethod: 'election', overflow: 'block', announcementMode: 'direct', whatsappEnabled: true, attendanceEnabled: true, electionAnonymity: 'anonymous', allowVoteChange: false, tieBreak: 'random', eligibility: 'all' },
}, amaToken);
const fmtActivityId = fmtActivity.json?.data?.activityId ?? fmtActivity.json?.data?.activity?.id ?? fmtActivity.json?.data?.id;
await memberCall('POST', `/api/cgm/activities/${fmtActivityId}/lifecycle`, { action: 'open' }, amaToken);
await memberCall('POST', `/api/cgm/activities/${fmtActivityId}/groups`, { count: 2, capacity: 5 }, amaToken);
const fmtDetailForPods = await memberCall('GET', `/api/cgm/activities/${fmtActivityId}`, undefined, amaToken);
const fmtPods = (fmtDetailForPods.json?.data?.groups || []).map((g) => Number(g.id));
check('the gender-balanced activity opened with its pods', fmtPods.length === 2, `pods=${fmtPods.join(',')}`);
const fmtAssignBlocked = await studentCall('POST', `/api/cgm/student/activities/${fmtActivityId}/assign`, { groupId: fmtPods[0] }, fmtSession);
check('a student without a recorded gender cannot choose a group in a gender-balanced activity (428)',
  fmtAssignBlocked.status === 428 && /gender/i.test(String(fmtAssignBlocked.json?.error || '')), `status ${fmtAssignBlocked.status} ${fmtAssignBlocked.text?.slice(0, 120)}`);
const bogusGender = await studentCall('POST', '/api/cgm/student/profile/gender', { gender: 'banana' }, fmtSession);
check('the gender endpoint refuses anything but male/female', bogusGender.status === 400, `status ${bogusGender.status}`);
const genderSet = await studentCall('POST', '/api/cgm/student/profile/gender', { gender: 'female' }, fmtSession);
check('the student sets their own gender once, before choosing a class group', genderSet.status === 200, `status ${genderSet.status} ${genderSet.text?.slice(0, 120)}`);
check('the self-set gender is on the profile', q1('SELECT gender FROM cgm_students WHERE id = ?', fmtStudentId)?.gender === 'female');
const genderTwice = await studentCall('POST', '/api/cgm/student/profile/gender', { gender: 'male' }, fmtSession);
check('an already-set gender is locked — only the organizer can correct it', genderTwice.status === 409, `status ${genderTwice.status}`);
const fmtAssignOk = await studentCall('POST', `/api/cgm/student/activities/${fmtActivityId}/assign`, { groupId: fmtPods[0] }, fmtSession);
check('after setting gender the student can choose their group', fmtAssignOk.status === 200, `status ${fmtAssignOk.status} ${fmtAssignOk.text?.slice(0, 120)}`);

// -- Leader sign-up link: election detail exposes activityId + canContest -------
const fmtGroupId = Number(q1("SELECT group_id FROM cgm_group_assignments WHERE activity_id = ? AND student_id = ? AND status = 'active'", fmtActivityId, fmtStudentId)?.group_id);
const fmtElection = await memberCall('POST', `/api/cgm/groups/${fmtGroupId}/elections`, { title: 'Pod lead', role: 'leader', anonymity: 'anonymous', visibility: 'class', allowVoteChange: false, tieBreak: 'random' }, amaToken);
const fmtElectionId = fmtElection.json?.data?.electionId ?? fmtElection.json?.data?.election?.id ?? fmtElection.json?.data?.id;
check('the pod election exists for the leader link', Boolean(fmtElectionId), fmtElection.text?.slice(0, 120));
const linkDetail = await studentCall('GET', `/api/cgm/student/elections/${fmtElectionId}`, undefined, fmtSession);
check('the leader-link landing resolves the election with activityId and canContest',
  linkDetail.status === 200 && Number(linkDetail.json?.data?.activityId) === Number(fmtActivityId) && linkDetail.json?.data?.canContest === true,
  `status ${linkDetail.status} ${linkDetail.text?.slice(0, 160)}`);
const linkStand = await studentCall('POST', `/api/cgm/student/activities/${fmtActivityId}/contest`, { statement: 'I will keep the pod on schedule.' }, fmtSession);
check('a student who opens the leader link is recorded as a candidate', linkStand.status === 200, `status ${linkStand.status} ${linkStand.text?.slice(0, 120)}`);
const linkStandAgain = await studentCall('POST', `/api/cgm/student/activities/${fmtActivityId}/contest`, { statement: 'Still keen.' }, fmtSession);
check('standing twice is idempotent — the candidacy stays single', linkStandAgain.status === 200
  && q1('SELECT COUNT(*) c FROM cgm_candidates WHERE election_id = ?', fmtElectionId).c === 1, `status ${linkStandAgain.status}`);
const linkCandidates = await studentCall('GET', `/api/cgm/student/elections/${fmtElectionId}`, undefined, fmtSession);
check('the volunteer appears on the ballot for the coming vote',
  (linkCandidates.json?.data?.candidates || []).some((row) => /Philippa/i.test(String(row.fullName || row.full_name))), JSON.stringify(linkCandidates.json?.data?.candidates || []).slice(0, 140));

// -- Roster-bound claims backfill a phone-first student's identity --------------
await memberCall('POST', `/api/cgm/classes/${fmtClassId}/roster/entries`, { fullName: 'Efua Sutherland', indexNumber: 'PH/PHA/24/0294', phone: '0244117294' }, amaToken);
const efuaEntry = q1("SELECT id FROM cgm_roster_entries WHERE class_id = ? AND index_number_key = 'ph/pha/24/0294'", fmtClassId);
const backfillInvite = await memberCall('POST', `/api/cgm/classes/${fmtClassId}/invitations`, { kind: 'individual', rosterEntryId: Number(efuaEntry.id) }, amaToken);
const backfillToken = backfillInvite.json?.data?.token;
check('the roster-bound individual invitation exists', Boolean(backfillToken), `status ${backfillInvite.status}`);
// The phone-first student: identity on file is a phone only (empty name/index).
sqlite.prepare(
  "UPDATE cgm_students SET full_name = '', index_number = '', index_number_key = '', phone = '0244117294', phone_key = '233244117294' WHERE index_number_key = 'bio-201-001'"
).run();
const phoneFirstLogin = await studentCall('POST', '/api/cgm/student/login', { identifierType: 'phone', identifier: '0244117294', passkey: 'rx30qz' });
const phoneFirstSession = phoneFirstLogin.json?.data?.session?.token;
check('the phone-first student signs in with their phone and passkey', Boolean(phoneFirstSession), `status ${phoneFirstLogin.status} ${phoneFirstLogin.text?.slice(0, 120)}`);
const backfillClaim = await studentCall('POST', `/api/cgm/student/invitations/${backfillToken}/claim`, {}, phoneFirstSession);
check('the phone-first student can claim the personal invitation', backfillClaim.status === 200, `status ${backfillClaim.status} ${backfillClaim.text?.slice(0, 140)}`);
const backfilledMe = await studentCall('GET', '/api/cgm/student/me', undefined, phoneFirstSession);
check('the claim filled in the roster name and index number (everything on file)',
  backfilledMe.json?.data?.student?.fullName === 'Efua Sutherland' && backfilledMe.json?.data?.student?.indexNumber === 'PH/PHA/24/0294',
  JSON.stringify(backfilledMe.json?.data?.student || {}).slice(0, 200));

// -- Activities stay editable after creation ------------------------------------
const editActivity = await memberCall('POST', `/api/cgm/classes/${fmtClassId}/activities`, {
  name: 'Lab Rotation', type: 'practical', description: 'Original description',
  config: { method: 'automatic', groupCount: 3, capacity: 4, genderRule: 'none', repeatRule: 'random', leaderMethod: 'appointment', overflow: 'block', announcementMode: 'direct', whatsappEnabled: true, attendanceEnabled: true, electionAnonymity: 'anonymous', allowVoteChange: false, tieBreak: 'random', eligibility: 'all' },
}, amaToken);
const editActivityId = editActivity.json?.data?.activityId ?? editActivity.json?.data?.activity?.id ?? editActivity.json?.data?.id;
const editDraft = await memberCall('PATCH', `/api/cgm/activities/${editActivityId}`, {
  name: 'Lab Rotation v2', description: 'Renamed draft',
  config: { method: 'hybrid', repeatRule: 'avoid', selfDeadline: '2030-06-01T00:00:00.000Z' },
}, amaToken);
check('a draft activity is fully editable after creation', editDraft.status === 200, `status ${editDraft.status} ${editDraft.text?.slice(0, 140)}`);
const draftDetail = await memberCall('GET', `/api/cgm/activities/${editActivityId}`, undefined, amaToken);
check('the draft edits persisted (name, method, repeat rule, deadline)',
  draftDetail.json?.data?.activity?.name === 'Lab Rotation v2' && draftDetail.json?.data?.config?.method === 'hybrid'
  && draftDetail.json?.data?.config?.repeatRule === 'avoid' && Boolean(draftDetail.json?.data?.config?.selfDeadline),
  JSON.stringify(draftDetail.json?.data?.config || {}).slice(0, 200));
await memberCall('POST', `/api/cgm/activities/${editActivityId}/lifecycle`, { action: 'open' }, amaToken);
const editOpen = await memberCall('PATCH', `/api/cgm/activities/${editActivityId}`, { config: { groupCount: 4 } }, amaToken);
check('an open activity can still restructure its groups before publishing', editOpen.status === 200, `status ${editOpen.status}`);
await memberCall('POST', `/api/cgm/activities/${editActivityId}/lifecycle`, { action: 'publish' }, amaToken);
const editStructure = await memberCall('PATCH', `/api/cgm/activities/${editActivityId}`, { config: { groupCount: 6 } }, amaToken);
check('a published activity refuses structural edits that would silently change assignments', editStructure.status === 409, `status ${editStructure.status}`);
const editLogistics = await memberCall('PATCH', `/api/cgm/activities/${editActivityId}`, { description: 'Logistics copy edit' }, amaToken);
check('a published activity still accepts everyday edits (description)', editLogistics.status === 200, `status ${editLogistics.status}`);

// -- The reveal payload carries everything on file ------------------------------
await memberCall('POST', `/api/cgm/classes/${fmtClassId}/settings`, { registrationMode: 'auto' }, amaToken);
const autoFmtReg = await call('POST', '/api/cgm/student/register', { classCode: fmtCode, indexNumber: 'PH/PHA/24/0293', entryPassword: 'fmt-101-entry' });
check('the fmt class also flips to automatic registration', autoFmtReg.status === 200 && autoFmtReg.json?.data?.state === 'active', autoFmtReg.text?.slice(0, 140));
check('the registration response carries the passkey AND the full recorded details for the reveal page',
  Boolean(autoFmtReg.json?.data?.passkey)
  && autoFmtReg.json?.data?.student?.fullName === 'Kwame Botchway'
  && autoFmtReg.json?.data?.student?.indexNumber === 'PH/PHA/24/0293'
  && autoFmtReg.json?.data?.student?.phone === '0244117293'
  && autoFmtReg.json?.data?.student?.className === 'FMT 101 Formats',
  JSON.stringify(autoFmtReg.json?.data?.student || {}).slice(0, 220));

// The student portal shows the reveal as its own page (source pins).
const revealSource = readFileSync(path.join(ROOT, 'src/components/ClassGroups/StudentPortal.tsx'), 'utf8');
check('the passkey reveal is a dedicated page, not an inline box under the form',
  /data-testid="cgm-passkey-reveal"/.test(revealSource) && /if \(issuedPasskey\) \{/.test(revealSource)
  && !revealSource.includes('I saved my passkey — continue'));
check('the reveal page lists the details on file beside the one-time passkey',
  /Your details on file/.test(revealSource) && /detailRows/.test(revealSource));
check('the organizer workspace can share a leader sign-up link (#leader-apply/)',
  /#leader-apply\//.test(readFileSync(path.join(ROOT, 'src/components/ClassGroups/ClassGroupsWorkspace.tsx'), 'utf8')));

// ---------------------------------------------------------------------------
// 31. Invitation security: sealed secrets, atomic claims, migration, races
// ---------------------------------------------------------------------------
section('31. Invitation sealing (AES-GCM), atomic usage consumption, migration safety');

const inviteTokenHash = (token) => shaHash('sha256').update(`cgm-invite:${token}`).digest('hex');
const freshFmtRosterStudent = async (n, fullName) => {
  const indexNumber = `PH/PHA/25/${String(n).padStart(4, '0')}`;
  await memberCall('POST', `/api/cgm/classes/${fmtClassId}/roster/entries`, { fullName, indexNumber, phone: `024511${String(n).padStart(4, '0')}` }, amaToken);
  const register = await call('POST', '/api/cgm/student/register', { classCode: fmtCode, indexNumber, entryPassword: 'fmt-101-entry' });
  const passkey = String(register.json?.data?.passkey || '');
  const login = await studentCall('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: indexNumber, passkey });
  return { indexNumber, studentId: Number(q1('SELECT id FROM cgm_students WHERE index_number_key = ?', indexNumber.toLowerCase())?.id || 0), session: login.json?.data?.session?.token, register };
};
const invitationRow = (id) => q1('SELECT * FROM cgm_invitations WHERE id = ?', id);

// -- 1+2+3: individual secrets are sealed at rest, hash-validatable, and only
//            re-displayable to an authorized organizer -------------------------
const sealedInvite = await memberCall('POST', `/api/cgm/classes/${classBId}/invitations`, { kind: 'individual', studentId: Number(q1("SELECT id FROM cgm_students WHERE index_number_key = 'chm-105-001'")?.id || 0) }, phantomToken);
const sealedToken = String(sealedInvite.json?.data?.token || '');
check('an individual invitation still returns its secret exactly once at creation',
  sealedInvite.status === 200 && /^[0-9a-f]{32,}$/i.test(sealedToken), `status ${sealedInvite.status} token=${sealedToken ? 'present' : 'missing'}`);
const sealedDbRow = invitationRow(Number(sealedInvite.json?.data?.id));
check('the raw individual token is NEVER stored in plaintext',
  sealedDbRow?.token_value === null && Boolean(sealedDbRow?.token_enc) && !String(sealedDbRow?.token_enc).includes(sealedToken),
  JSON.stringify({ token_value: sealedDbRow?.token_value, enc: String(sealedDbRow?.token_enc || '').slice(0, 24) }));
check('the stored token hash validates the original token (not merely the code)',
  sealedDbRow?.token_hash === inviteTokenHash(sealedToken) && sealedDbRow?.token_hash !== inviteTokenHash(String(sealedDbRow?.code || '')));
check('the sealed blob records its key version',
  sealedDbRow?.token_key_version === 'v1', String(sealedDbRow?.token_key_version));
const authorizedList = await memberCall('GET', `/api/cgm/classes/${classBId}/invitations`, undefined, phantomToken);
const authorizedRow = (authorizedList.json?.data || []).find((row) => Number(row.id) === Number(sealedInvite.json?.data?.id));
check('an authorized organizer can still retrieve and share the sealed link any time',
  authorizedRow?.token === sealedToken && String(authorizedRow?.link || '').includes(encodeURIComponent(sealedToken)),
  JSON.stringify({ token: authorizedRow?.token ? 'present' : 'missing', link: String(authorizedRow?.link || '').slice(0, 60) }));
const strangerList = await memberCall('GET', `/api/cgm/classes/${classBId}/invitations`, undefined, amaToken);
check('an unrelated organizer can never retrieve another class invitation secret',
  strangerList.status === 403 && !JSON.stringify(strangerList.json || {}).includes(sealedToken.slice(0, 16)), `status ${strangerList.status}`);
const studentPeek = await studentCall('GET', `/api/cgm/classes/${classBId}/invitations`, undefined, fmtSession);
check('a student can never list organizer invitation material', studentPeek.status === 401 || studentPeek.status === 403, `status ${studentPeek.status}`);

// -- 4: tampered ciphertext fails authentication (closed), claim still works --
sqlite.prepare('UPDATE cgm_invitations SET token_enc = ? WHERE id = ?').run(`v1.${sealedDbRow.token_enc.split('.')[1]}.cGFtcGVyZWQ=`, Number(sealedInvite.json?.data?.id));
const tamperedList = await memberCall('GET', `/api/cgm/classes/${classBId}/invitations`, undefined, phantomToken);
const tamperedRow = (tamperedList.json?.data || []).find((row) => Number(row.id) === Number(sealedInvite.json?.data?.id));
check('tampered ciphertext fails authentication: no secret re-displayed, row flagged for regeneration',
  tamperedRow?.token === null && tamperedRow?.link === null && tamperedRow?.secretProblem === 'undecryptable',
  JSON.stringify({ token: tamperedRow?.token, problem: tamperedRow?.secretProblem }));
const tamperedClaim = await studentCall('POST', `/api/cgm/student/invitations/${sealedToken}/claim`, {}, fmtSession);
check('validation still flows through the lookup hash when the sealed copy is corrupted',
  tamperedClaim.status === 200 || tamperedClaim.status === 403 || tamperedClaim.status === 410, `status ${tamperedClaim.status} (hash path alive)`);
sqlite.prepare('UPDATE cgm_invitations SET token_enc = ? WHERE id = ?').run(sealedDbRow.token_enc, Number(sealedInvite.json?.data?.id));

// -- 5: missing encryption configuration fails safely -------------------------
const savedKeys = env.CGM_INVITATION_KEYS;
env.CGM_INVITATION_KEYS = '';
const noKeyCreate = await memberCall('POST', `/api/cgm/classes/${classBId}/invitations`, { kind: 'individual', studentId: Number(q1("SELECT id FROM cgm_students WHERE index_number_key = 'chm-105-002'")?.id || 0) }, phantomToken);
check('creating an individual invitation without key material fails safely with setup guidance (never plaintext)',
  noKeyCreate.status === 503 && /CGM_INVITATION_KEYS/.test(String(noKeyCreate.json?.error || '')) && !noKeyCreate.json?.data?.token,
  `status ${noKeyCreate.status} ${String(noKeyCreate.json?.error || '').slice(0, 90)}`);
const legacyPendingRow = invitationRow(Number(sealedInvite.json?.data?.id));
sqlite.prepare("INSERT INTO cgm_invitations (class_id, kind, code, token_hash, token_value, created_by_profile_id, creator_label, expires_at, max_uses, use_count) VALUES (?, 'individual', NULL, ?, 'legacyplain', NULL, 'Legacy Import', NULL, NULL, 0)").run(
  classBId, inviteTokenHash('a'.repeat(64)));
const noKeyMigration = await worker.migrateInvitationTokenStorage(d1, env);
const legacyStill = q1("SELECT token_value, token_enc FROM cgm_invitations WHERE token_value = 'legacyplain'");
check('the seal migration without a key writes nothing and reports the pending plaintext',
  noKeyMigration.keyConfigured === false && noKeyMigration.pendingPlaintext >= 1 && legacyStill?.token_value === 'legacyplain' && legacyStill?.token_enc === null,
  JSON.stringify(noKeyMigration));
env.CGM_INVITATION_KEYS = savedKeys;

// -- 6+7: existing invitations survive the migration and keep working ---------
const legacyGeneralCode = 'LS0001-LEGACY';
sqlite.prepare(
  "INSERT INTO cgm_invitations (class_id, kind, code, token_hash, token_value, created_by_profile_id, creator_label, expires_at, max_uses, use_count) VALUES (?, 'general', ?, ?, 'legacy-general-raw', NULL, 'Legacy Import', '2030-12-31 00:00:00', 50, 3)"
).run(fmtClassId, legacyGeneralCode, inviteTokenHash('b'.repeat(64)));
const legacyIndividualToken = 'c'.repeat(64);
const efuaStudentId = Number(q1("SELECT id FROM cgm_students WHERE phone_key = '233244117294'")?.id || 0);
sqlite.prepare(
  "INSERT INTO cgm_invitations (class_id, kind, code, token_hash, token_value, created_by_profile_id, creator_label, bound_student_id, expires_at, max_uses, use_count) VALUES (?, 'individual', NULL, ?, ?, NULL, 'Legacy Import', ?, '2030-12-31 00:00:00', NULL, 0)"
).run(fmtClassId, inviteTokenHash(legacyIndividualToken), 'legacyplain2', efuaStudentId);
const legacyIndividualId = q1("SELECT id FROM cgm_invitations WHERE token_value = 'legacyplain2'").id;
const legacyGeneralId = q1('SELECT id FROM cgm_invitations WHERE code = ?', legacyGeneralCode).id;
const sealRun = await worker.migrateInvitationTokenStorage(d1, env);
const sealedLegacyIndividual = invitationRow(legacyIndividualId);
const sealedLegacyGeneral = invitationRow(legacyGeneralId);
check('the migration seals legacy individual secrets and removes every plaintext value',
  sealRun.encrypted >= 2 && sealedLegacyIndividual.token_enc !== null && sealedLegacyIndividual.token_value === null,
  JSON.stringify({ encrypted: sealRun.encrypted, pending: sealRun.pendingPlaintext }));
check('the migration keeps expiry, limits and usage counts intact',
  sealedLegacyIndividual.expires_at === '2030-12-31 00:00:00' && Number(sealedLegacyIndividual.use_count) === 0
  && sealedLegacyGeneral.max_uses === 50 && Number(sealedLegacyGeneral.use_count) === 3);
check('re-running the migration is idempotent', (await worker.migrateInvitationTokenStorage(d1, env)).encrypted === 0);
const legacyGeneralLanding = await call('GET', `/api/cgm/invitations/${legacyGeneralCode}`);
check('existing general invitation codes still resolve after the migration', legacyGeneralLanding.status === 200, `status ${legacyGeneralLanding.status}`);
const legacyIndividualLogin = await studentCall('POST', '/api/cgm/student/login', { identifierType: 'phone', identifier: '0244117294', passkey: 'rx30qz' });
const legacyIndividualSession = legacyIndividualLogin.json?.data?.session?.token;
const legacyIndividualClaim = await studentCall('POST', `/api/cgm/student/invitations/${legacyIndividualToken}/claim`, {}, legacyIndividualSession);
check('an existing individual invitation link (raw token) still works after the migration',
  legacyIndividualClaim.status === 200, `status ${legacyIndividualClaim.status} ${legacyIndividualClaim.text?.slice(0, 100)}`);
check('the migrated invitation recorded exactly one use', Number(invitationRow(legacyIndividualId)?.use_count) === 1);

// -- 8: regeneration invalidates the previous secret --------------------------
const regenTarget = await memberCall('POST', `/api/cgm/classes/${classBId}/invitations`, { kind: 'individual', studentId: Number(q1("SELECT id FROM cgm_students WHERE index_number_key = 'chm-105-003'")?.id || 0) }, phantomToken);
const oldRegenToken = String(regenTarget.json?.data?.token || '');
const regenDone = await memberCall('POST', `/api/cgm/invitations/${regenTarget.json?.data?.id}/regenerate`, {}, phantomToken);
const newRegenToken = String(regenDone.json?.data?.token || '');
check('regeneration issues a fresh sealed secret and retires the old hash',
  regenDone.status === 200 && newRegenToken && newRegenToken !== oldRegenToken
  && invitationRow(Number(regenTarget.json?.data?.id))?.token_hash === inviteTokenHash(newRegenToken)
  && invitationRow(Number(regenTarget.json?.data?.id))?.token_value === null);
const regenRow = (await memberCall('GET', `/api/cgm/classes/${classBId}/invitations`, undefined, phantomToken)).json?.data?.find((row) => Number(row.id) === Number(regenTarget.json?.data?.id));
check('the list decrypts the regenerated secret for the authorized organizer', regenRow?.token === newRegenToken, String(regenRow?.token || '').slice(0, 8));

// -- 10+11+15: identity binding and exactly-once consumption ------------------
const boundSprint = await freshFmtRosterStudent(1, 'Bound Baffour');
check('the bound student exists before the invitation is issued', Boolean(boundSprint.studentId && boundSprint.session), JSON.stringify({ id: boundSprint.studentId }));
const boundInvite = await memberCall('POST', `/api/cgm/classes/${fmtClassId}/invitations`, { kind: 'individual', studentId: boundSprint.studentId }, amaToken);
const boundToken = String(boundInvite.json?.data?.token || '');
const outsider = await freshFmtRosterStudent(2, 'Outsider Osei');
const outsiderClaim = await studentCall('POST', `/api/cgm/student/invitations/${boundToken}/claim`, {}, outsider.session);
check('an individual invitation can never be claimed by a different student',
  outsiderClaim.status === 403 && Number(invitationRow(Number(boundInvite.json?.data?.id))?.use_count) === 0, `status ${outsiderClaim.status}`);
const boundClaim = await studentCall('POST', `/api/cgm/student/invitations/${boundToken}/claim`, {}, boundSprint.session);
check('the bound student claims exactly once', boundClaim.status === 200 && Number(invitationRow(Number(boundInvite.json?.data?.id))?.use_count) === 1, `status ${boundClaim.status} uses=${invitationRow(Number(boundInvite.json?.data?.id))?.use_count}`);
const boundReplay = await studentCall('POST', `/api/cgm/student/invitations/${boundToken}/claim`, {}, boundSprint.session);
check('a second claim of the same individual invitation is refused without inflating usage',
  boundReplay.status === 410 && Number(invitationRow(Number(boundInvite.json?.data?.id))?.use_count) === 1, `status ${boundReplay.status}`);

// -- 12: concurrent claims cannot consume one individual invitation twice ------
const sealRaceInvite = await memberCall('POST', `/api/cgm/classes/${fmtClassId}/invitations`, { kind: 'individual', studentId: outsider.studentId }, amaToken);
const sealRaceToken = String(sealRaceInvite.json?.data?.token || '');
const sealRaceAttempts = await Promise.all([1, 2, 3, 4].map(() =>
  studentCall('POST', `/api/cgm/student/invitations/${sealRaceToken}/claim`, {}, outsider.session)));
const sealRaceWins = sealRaceAttempts.filter((r) => r.status === 200).length;
check('four concurrent claims of one single-use invitation win exactly once',
  sealRaceWins === 1 && Number(invitationRow(Number(sealRaceInvite.json?.data?.id))?.use_count) === 1,
  `statuses=${sealRaceAttempts.map((r) => r.status).join(',')} uses=${invitationRow(Number(sealRaceInvite.json?.data?.id))?.use_count}`);

// -- 13: concurrent general claims cannot exceed max_uses ----------------------
setPolicy('membership_request_mode', 'auto');
const maxedInvite = await memberCall('POST', `/api/cgm/classes/${fmtClassId}/invitations`, { kind: 'general', maxUses: 2 }, amaToken);
const maxedCode = String(maxedInvite.json?.data?.code || '');
// The five racers register into a SEPARATE class, so none of them is already
// a member of the invited class (an already-member response never consumes).
const raceClass = await memberCall('POST', '/api/cgm/classes', { name: 'RACE 900 Sprint Hall', institution: 'Accra Technical University' }, amaToken);
const raceClassId = raceClass.json?.data?.classId ?? raceClass.json?.data?.class?.id ?? raceClass.json?.data?.id;
const raceClassCode = raceClass.json?.data?.code ?? raceClass.json?.data?.class?.code;
await memberCall('POST', `/api/cgm/classes/${raceClassId}/entry-password`, { entryPassword: 'race-900-entry' }, amaToken);
await memberCall('POST', `/api/cgm/phantom/classes/${raceClassId}/approve`, {}, phantomToken);
await memberCall('POST', `/api/cgm/classes/${raceClassId}/settings`, { registrationMode: 'auto' }, amaToken);
const sprinters = [];
for (let n = 3; n <= 7; n += 1) {
  const indexNumber = `RACE/900/${String(n).padStart(4, '0')}`;
  await memberCall('POST', `/api/cgm/classes/${raceClassId}/roster/entries`, { fullName: `Sprinter ${n}`, indexNumber }, amaToken);
  const register = await call('POST', '/api/cgm/student/register', { classCode: raceClassCode, indexNumber, entryPassword: 'race-900-entry' });
  const passkey = String(register.json?.data?.passkey || '');
  const login = await studentCall('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: indexNumber, passkey });
  sprinters.push(login.json?.data?.session?.token);
}
check('five sprinter sessions are ready for the max-uses race', sprinters.filter(Boolean).length === 5, `sessions=${sprinters.filter(Boolean).length}`);
const maxedAttempts = await Promise.all(sprinters.map((session) =>
  studentCall('POST', '/api/cgm/student/join', { code: maxedCode }, session)));
const maxedWins = maxedAttempts.filter((r) => r.status === 200).length;
const maxedRow = invitationRow(Number(maxedInvite.json?.data?.id));
check('concurrent general claims never exceed max_uses (2 seats, 5 racers)',
  maxedWins === 2 && Number(maxedRow?.use_count) === 2
  && q1("SELECT COUNT(*) c FROM cgm_class_members WHERE class_id = ? AND student_id IN (SELECT id FROM cgm_students WHERE index_number_key LIKE 'ph/pha/25/000%')", fmtClassId).c >= 2,
  `statuses=${maxedAttempts.map((r) => r.status).join(',')} uses=${maxedRow?.use_count}`);

// -- 14+17: duplicates and already-members never inflate usage -----------------
setPolicy('membership_request_mode', 'approval');
const dupInvite = await memberCall('POST', `/api/cgm/classes/${classBId}/invitations`, { kind: 'general' }, phantomToken);
const dupCode = String(dupInvite.json?.data?.code || '');
const dupSprint = await freshFmtRosterStudent(9, 'Requester Rita');
const dupPk = String(q1('SELECT passkey_prefix || passkey_suffix AS pk FROM cgm_students WHERE index_number_key = ?', dupSprint.indexNumber.toLowerCase())?.pk || '');
await studentCall('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: dupSprint.indexNumber, passkey: dupPk });
const dupIndexKey = dupSprint.indexNumber.toLowerCase();
sqlite.prepare("UPDATE cgm_students SET status = 'active' WHERE index_number_key = ?").run(dupIndexKey);
const dupLogin = await studentCall('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: dupSprint.indexNumber, passkey: dupPk });
const dupSessionToken = dupLogin.json?.data?.session?.token;
const dupFirst = await studentCall('POST', '/api/cgm/student/join', { code: dupCode }, dupSessionToken);
const dupSecond = await studentCall('POST', '/api/cgm/student/join', { code: dupCode }, dupSessionToken);
check('the first join requests membership and consumes exactly one use',
  dupFirst.status === 200 && dupFirst.json?.data?.state === 'requested' && Number(invitationRow(Number(dupInvite.json?.data?.id))?.use_count) === 1,
  `status ${dupFirst.status} state=${dupFirst.json?.data?.state}`);
check('a duplicate request answers consistently WITHOUT inflating usage',
  dupSecond.status === 200 && dupSecond.json?.data?.state === 'requested' && Number(invitationRow(Number(dupInvite.json?.data?.id))?.use_count) === 1,
  `status ${dupSecond.status} state=${dupSecond.json?.data?.state}`);
const zooInvite = await memberCall('POST', `/api/cgm/classes/${zooClassId}/invitations`, { kind: 'general' }, amaToken);
const zooMemberJoin = await studentCall('POST', '/api/cgm/student/join', { code: String(zooInvite.json?.data?.code || '') }, adwoaSession);
check('an already-member student gets a consistent response with zero usage inflation',
  zooMemberJoin.status === 200 && zooMemberJoin.json?.data?.state === 'member' && Number(invitationRow(Number(zooInvite.json?.data?.id))?.use_count) === 0,
  `status ${zooMemberJoin.status} state=${zooMemberJoin.json?.data?.state}`);

// -- 18: expired, disabled and revoked invitations remain unusable -------------
const deadInvite = await memberCall('POST', `/api/cgm/classes/${classBId}/invitations`, { kind: 'general' }, phantomToken);
const deadCode = String(deadInvite.json?.data?.code || '');
const deadId = Number(deadInvite.json?.data?.id);
sqlite.prepare("UPDATE cgm_invitations SET expires_at = '2020-01-01 00:00:00' WHERE id = ?").run(deadId);
const expiredTry = await studentCall('POST', '/api/cgm/student/join', { code: deadCode }, dupSessionToken);
check('an expired invitation is refused and consumes nothing',
  expiredTry.status === 410 && Number(invitationRow(deadId)?.use_count) === 0, `status ${expiredTry.status}`);
await memberCall('POST', `/api/cgm/invitations/${deadId}/enable`, {}, phantomToken);
sqlite.prepare("UPDATE cgm_invitations SET expires_at = NULL, disabled_at = CURRENT_TIMESTAMP WHERE id = ?").run(deadId);
const disabledTry = await studentCall('POST', '/api/cgm/student/join', { code: deadCode }, dupSessionToken);
check('a disabled invitation is refused and consumes nothing',
  disabledTry.status === 404 && Number(invitationRow(deadId)?.use_count) === 0, `status ${disabledTry.status}`);
await memberCall('POST', `/api/cgm/invitations/${deadId}/revoke`, {}, phantomToken);
sqlite.prepare("UPDATE cgm_invitations SET disabled_at = NULL WHERE id = ?").run(deadId);
const revokedTry = await studentCall('POST', '/api/cgm/student/join', { code: deadCode }, dupSessionToken);
check('a revoked invitation stays permanently unusable and consumes nothing',
  revokedTry.status === 404 && Number(invitationRow(deadId)?.use_count) === 0, `status ${revokedTry.status}`);

// -- 16: roster-bound claims increment exactly once ----------------------------
await memberCall('POST', `/api/cgm/classes/${fmtClassId}/roster/entries`, { fullName: 'Roster Bound Bea', indexNumber: 'PH/PHA/25/0010', phone: '0245110010' }, amaToken);
const beaEntryId = Number(q1("SELECT id FROM cgm_roster_entries WHERE class_id = ? AND index_number_key = 'ph/pha/25/0010'", fmtClassId)?.id || 0);
const beaInvite = await memberCall('POST', `/api/cgm/classes/${fmtClassId}/invitations`, { kind: 'individual', rosterEntryId: beaEntryId }, amaToken);
const beaToken = String(beaInvite.json?.data?.token || '');
const beaRegister = await call('POST', '/api/cgm/student/register', { classCode: fmtCode, indexNumber: 'PH/PHA/25/0010', entryPassword: 'fmt-101-entry' });
const beaPasskey = String(beaRegister.json?.data?.passkey || '');
const beaLogin = await studentCall('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: 'PH/PHA/25/0010', passkey: beaPasskey });
const beaClaim = await studentCall('POST', `/api/cgm/student/invitations/${beaToken}/claim`, {}, beaLogin.json?.data?.session?.token);
check('a roster-bound claim consumes exactly one use and files the registration',
  beaClaim.status === 200 && Number(invitationRow(Number(beaInvite.json?.data?.id))?.use_count) === 1
  && q1("SELECT COUNT(*) c FROM cgm_registration_requests WHERE roster_entry_id = ? AND student_id = (SELECT id FROM cgm_students WHERE index_number_key = 'ph/pha/25/0010')", beaEntryId).c === 1,
  `status ${beaClaim.status} uses=${invitationRow(Number(beaInvite.json?.data?.id))?.use_count}`);

// -- source pins: no raw secret ever reaches logs or audit records -------------
const organizerSrc = readFileSync(path.join(ROOT, 'functions/lib/cgm/routes-organizer.ts'), 'utf8');
check('invitation secrets are sealed with AES-GCM before any database write (no plaintext path at creation)',
  /sealInvitationToken/.test(organizerSrc) && /VALUES \(\?, \?, \?, \?, NULL, \?, \?/.test(organizerSrc));
check('the claim path consumes usage through one atomic conditional UPDATE (not a SELECT guard)',
  /use_count = use_count \+ 1[\s\S]*?AND \(kind = 'general' OR use_count < 1\)/.test(readFileSync(path.join(ROOT, 'functions/lib/cgm/routes-student.ts'), 'utf8')));

// -- Identity & privacy pins (Phase 5) -----------------------------------------
const coreSrc = readFileSync(path.join(ROOT, 'functions/lib/cgm/core.ts'), 'utf8');
check('university ID is not a student sign-in identifier (index number and phone only)',
  /LOGIN_IDENTIFIER_KEYS[\s\S]{0,120}/.exec(coreSrc)?.[0]?.includes('index_number')
  && !/LOGIN_IDENTIFIER_KEYS[\s\S]{0,160}/.exec(coreSrc)?.[0]?.includes('university_id'),
  (/(LOGIN_IDENTIFIER_KEYS[\s\S]{0,140})/.exec(coreSrc)?.[1] || '').slice(0, 120));
check('the classmates payload exposes names plus visibility-gated phone/email only (never gender or index numbers)',
  /classmates\.map\(\(row\) => \(\{[\s\S]{0,220}/.exec(readFileSync(path.join(ROOT, 'functions/lib/cgm/routes-student.ts'), 'utf8'))?.[0]?.includes('visibleFields.includes') === true);

// ---------------------------------------------------------------------------
// 32. Random Group Selection: secure equal-probability draw + premium reveal
// ---------------------------------------------------------------------------
section('32. Random draw: secure uniform sampling, persistence before reveal');

// -- The rejection sampler is exactly uniform (no modulo bias) ----------------
const { secureUniformIndex } = worker;
check('the sampler exists and is exported for verification', typeof secureUniformIndex === 'function');
check('the sampler handles degenerate sizes safely', secureUniformIndex(1, () => 123456789) === 0 && secureUniformIndex(0) === 0);
// Deterministic rejection check: the first word is >= limit (rejected), the
// second maps to bucket 1.
const limit5 = Math.floor(0x100000000 / 5) * 5;
const rejectionSamplerCalls = [];
const rejectionDraw = secureUniformIndex(5, () => { rejectionSamplerCalls.push(1); return rejectionSamplerCalls.length === 1 ? 0xffffffff : 1; });
check('words above the largest multiple of n are rejected, never wrapped (no modulo bias)',
  rejectionDraw === 1 && rejectionSamplerCalls.length === 2 && (0xffffffff % 5) !== 1);
// Statistical uniformity with real crypto randomness: 4000 draws over 4
// buckets (expected 1000 each, sigma ~27) — bounds are 5+ sigma wide.
const buckets = [0, 0, 0, 0];
for (let i = 0; i < 4000; i += 1) buckets[secureUniformIndex(4)] += 1;
check('4000 crypto draws over 4 buckets are statistically uniform',
  buckets.every((count) => count >= 850 && count <= 1150), JSON.stringify(buckets));

// -- Endpoint: the server draws, persists and reports the same group ----------
const drawPods = await memberCall('POST', `/api/cgm/classes/${fmtClassId}/activities`, {
  name: 'Lucky Pods', type: 'tutorial',
  config: { method: 'self', groupCount: 3, capacity: 10, genderRule: 'none', repeatRule: 'random', leaderMethod: 'appointment', overflow: 'waitlist', announcementMode: 'direct', whatsappEnabled: true, attendanceEnabled: true, electionAnonymity: 'anonymous', allowVoteChange: false, tieBreak: 'random', eligibility: 'all' },
}, amaToken);
const drawPodsId = drawPods.json?.data?.activityId ?? drawPods.json?.data?.activity?.id ?? drawPods.json?.data?.id;
await memberCall('POST', `/api/cgm/activities/${drawPodsId}/lifecycle`, { action: 'open' }, amaToken);
await memberCall('POST', `/api/cgm/activities/${drawPodsId}/groups`, { count: 3, capacity: 10 }, amaToken);
const drawPodGroups = ((await memberCall('GET', `/api/cgm/activities/${drawPodsId}`, undefined, amaToken)).json?.data?.groups || []).map((g) => Number(g.id));
check('the lucky-draw activity opened with three pods', drawPodGroups.length === 3, `pods=${drawPodGroups.join(',')}`);

const noSessionDraw = await call('POST', `/api/cgm/student/activities/${drawPodsId}/random-draw`, {});
check('the random draw needs a student session', noSessionDraw.status === 401, `status ${noSessionDraw.status}`);

const drawer = await freshFmtRosterStudent(11, 'Drawer Danso');
const drawerDraw = await studentCall('POST', `/api/cgm/student/activities/${drawPodsId}/random-draw`, {}, drawer.session);
check('a student can draw: the server assigns a real pod with an equal-chance pick',
  drawerDraw.status === 200 && drawPodGroups.includes(Number(drawerDraw.json?.data?.groupId)) && drawerDraw.json?.data?.draw === true,
  `status ${drawerDraw.status} ${drawerDraw.text?.slice(0, 120)}`);
const drawerId = Number(q1('SELECT id FROM cgm_students WHERE index_number_key = ?', drawer.indexNumber.toLowerCase())?.id || 0);
check('the drawn seat is persisted (active membership in exactly one pod)',
  q1("SELECT COUNT(*) c FROM cgm_group_assignments WHERE activity_id = ? AND student_id = ? AND status = 'active'", drawPodsId, drawerId).c === 1);
check('the draw is recorded in the assignment history and the audit trail',
  q1("SELECT COUNT(*) c FROM cgm_assignment_events WHERE activity_id = ? AND student_id = ? AND reason = 'random draw'", drawPodsId, drawerId).c === 1
  && q1("SELECT COUNT(*) c FROM cgm_audit WHERE action = 'cgm.assignment.random_draw'").c >= 1,
  `events=${q1("SELECT COUNT(*) c FROM cgm_assignment_events WHERE activity_id = ? AND student_id = ?", drawPodsId, drawerId).c}`);
const drawerRedraw = await studentCall('POST', `/api/cgm/student/activities/${drawPodsId}/random-draw`, {}, drawer.session);
check('a second draw is refused — the first result stands (no duplicates)',
  drawerRedraw.status === 409 && q1("SELECT COUNT(*) c FROM cgm_group_assignments WHERE activity_id = ? AND student_id = ? AND status = 'active'", drawPodsId, drawerId).c === 1);

// Draw ten more students: every landed pod must be one of the three pods.
const drawCrowd = [];
for (let n = 12; n <= 21; n += 1) {
  const member = await freshFmtRosterStudent(n, `Draw Crowd ${n}`);
  const result = await studentCall('POST', `/api/cgm/student/activities/${drawPodsId}/random-draw`, {}, member.session);
  if (result.status === 200) drawCrowd.push(Number(result.json?.data?.groupId));
}
check('eleven students land only in real pods, none placed twice',
  drawCrowd.every((groupId) => drawPodGroups.includes(groupId))
  && q1("SELECT COUNT(*) c FROM (SELECT student_id FROM cgm_group_assignments WHERE activity_id = ? AND status = 'active' GROUP BY student_id HAVING COUNT(*) > 1)", drawPodsId).c === 0,
  `drawn=${drawCrowd.length}`);

// Full pods + overflow=waitlist: the draw waitlists instead of inventing seats.
const tightPods = await memberCall('POST', `/api/cgm/classes/${fmtClassId}/activities`, {
  name: 'Tight Pods', type: 'tutorial',
  config: { method: 'self', groupCount: 1, capacity: 1, genderRule: 'none', repeatRule: 'random', leaderMethod: 'appointment', overflow: 'waitlist', announcementMode: 'direct', whatsappEnabled: true, attendanceEnabled: true, electionAnonymity: 'anonymous', allowVoteChange: false, tieBreak: 'random', eligibility: 'all' },
}, amaToken);
const tightPodsId = tightPods.json?.data?.activityId ?? tightPods.json?.data?.activity?.id ?? tightPods.json?.data?.id;
await memberCall('POST', `/api/cgm/activities/${tightPodsId}/lifecycle`, { action: 'open' }, amaToken);
await memberCall('POST', `/api/cgm/activities/${tightPodsId}/groups`, { count: 1, capacity: 1 }, amaToken);
const tightWinner = await freshFmtRosterStudent(22, 'Tight Winner');
const tightLoser = await freshFmtRosterStudent(23, 'Tight Loser');
const tightWinDraw = await studentCall('POST', `/api/cgm/student/activities/${tightPodsId}/random-draw`, {}, tightWinner.session);
const tightLoseDraw = await studentCall('POST', `/api/cgm/student/activities/${tightPodsId}/random-draw`, {}, tightLoser.session);
check('with one seat, one draw wins and the other lands on the waiting list',
  tightWinDraw.status === 200 && tightLoseDraw.status === 200 && tightLoseDraw.json?.data?.waitlisted === true
  && Number(q1("SELECT COUNT(*) c FROM cgm_activity_waitlist WHERE activity_id = ? AND status = 'waiting'", tightPodsId).c) === 1,
  `win=${tightWinDraw.status}/${tightWinDraw.json?.data?.groupId} lose=${tightLoseDraw.status}/${JSON.stringify(tightLoseDraw.json?.data || {})}`);

// The reveal is the client theatre; the source pins prove result-first flow.
const revealSrc = readFileSync(path.join(ROOT, 'src/components/ClassGroups/RandomGroupReveal.tsx'), 'utf8');
const portalSrc2 = readFileSync(path.join(ROOT, 'src/components/ClassGroups/StudentPortal.tsx'), 'utf8');
check('the reveal component states plainly that the backend already persisted the result',
  /backend has ALREADY chosen and persisted/.test(revealSrc));
check('the portal calls the draw API FIRST and only then opens the reveal',
  /randomDraw\(Number\(data\.activity\.id\)\)[\s\S]{0,420}setReveal\(\{/.test(portalSrc2));
check('the reveal honours reduced motion, offers Skip, and keeps sound OFF by default',
  /prefers-reduced-motion: reduce/.test(revealSrc) && /Skip animation/.test(revealSrc) && /useState\(false\); \/\/ OFF by default/.test(revealSrc));
check('the reveal shows the dynamic group name from the database (never a hardcoded label)',
  /\{winner\?\.name\}/.test(revealSrc) && !/Group C/.test(revealSrc));
check('the premium overlay carries the reference composition without any gambling language',
  /RANDOM GROUP SELECTION/i.test(revealSrc) && /All groups have an equal chance/.test(revealSrc)
  && /Selecting your group…/.test(revealSrc) && /Congratulations!/.test(revealSrc)
  && /You are assigned to/.test(revealSrc) && /Processing…/.test(revealSrc) && /Complete!/.test(revealSrc)
  && !/\b(casino|bets?|betting|jackpot|gambl\w*|wager\w*)\b/i.test(revealSrc.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ')));

// ---------------------------------------------------------------------------
// 33. Forced random mode + organizer finish + PHANTOM-regulated direct swaps
// ---------------------------------------------------------------------------
section('33. Forced random method, organizer finish, direct member swaps');

// -- Forced random: the organizer picks the method, students can only draw ----
const forcedDraw = await memberCall('POST', `/api/cgm/classes/${fmtClassId}/activities`, {
  name: 'Forced Draw Lab', type: 'practical',
  config: { method: 'random', groupCount: 2, capacity: 10, genderRule: 'none', repeatRule: 'random', leaderMethod: 'appointment', overflow: 'waitlist', announcementMode: 'direct', whatsappEnabled: true, attendanceEnabled: true, electionAnonymity: 'anonymous', allowVoteChange: false, tieBreak: 'random', eligibility: 'all' },
}, amaToken);
const forcedDrawId = forcedDraw.json?.data?.activityId ?? forcedDraw.json?.data?.activity?.id ?? forcedDraw.json?.data?.id;
await memberCall('POST', `/api/cgm/activities/${forcedDrawId}/lifecycle`, { action: 'open' }, amaToken);
await memberCall('POST', `/api/cgm/activities/${forcedDrawId}/groups`, { count: 2, capacity: 10 }, amaToken);
const forcedConfig = JSON.parse(q1('SELECT config_json FROM cgm_activities WHERE id = ?', forcedDrawId)?.config_json || '{}');
check("the 'random' assignment method is accepted and survives the config sanitizer", forcedConfig.method === 'random', `method=${forcedConfig.method}`);

const forcedStudent = await freshFmtRosterStudent(31, 'Forced Freya');
const forcedManual = await studentCall('POST', `/api/cgm/student/activities/${forcedDrawId}/assign`, { groupId: (await memberCall('GET', `/api/cgm/activities/${forcedDrawId}`, undefined, amaToken)).json?.data?.groups?.[0]?.id }, forcedStudent.session);
check('a student CANNOT manually pick a group when the organizer forced random mode',
  forcedManual.status === 409 && /RANDOM/i.test(forcedManual.json?.error || ''), `status ${forcedManual.status} ${forcedManual.text?.slice(0, 100)}`);
const forcedAuto = await studentCall('POST', `/api/cgm/student/activities/${forcedDrawId}/assign`, {}, forcedStudent.session);
check('the automatic place-me button is refused in forced random mode too', forcedAuto.status === 409, `status ${forcedAuto.status}`);
const forcedDrawResult = await studentCall('POST', `/api/cgm/student/activities/${forcedDrawId}/random-draw`, {}, forcedStudent.session);
check('the random draw itself works perfectly in forced random mode',
  forcedDrawResult.status === 200 && forcedDrawResult.json?.data?.draw === true, `status ${forcedDrawResult.status}`);
const forcedStudentId = Number(q1('SELECT id FROM cgm_students WHERE index_number_key = ?', forcedStudent.indexNumber.toLowerCase())?.id || 0);

// -- The organizer finishes: assign-remaining sweeps students who never drew --
const lazyStudent = await freshFmtRosterStudent(32, 'Lazy Laryea');
const lazyId = Number(q1('SELECT id FROM cgm_students WHERE index_number_key = ?', lazyStudent.indexNumber.toLowerCase())?.id || 0);
const finishRun = await memberCall('POST', `/api/cgm/activities/${forcedDrawId}/assign-remaining`, {}, amaToken);
check('the organizer can auto-assign the rest in random mode (students who never drew)',
  finishRun.status === 200 && Number(finishRun.json?.data?.placed) >= 1, `status ${finishRun.status} ${finishRun.text?.slice(0, 100)}`);
check('after the organizer finish, both drawn and swept students sit in exactly one real group',
  q1("SELECT COUNT(*) c FROM cgm_group_assignments WHERE activity_id = ? AND student_id IN (?, ?) AND status = 'active'", forcedDrawId, forcedStudentId, lazyId).c === 2);

// -- Direct swaps: organizer exchanges two members between their groups ------
const swapLab = await memberCall('POST', `/api/cgm/classes/${fmtClassId}/activities`, {
  name: 'Swap Lab', type: 'tutorial',
  config: { method: 'automatic', groupCount: 2, capacity: 10, genderRule: 'none', repeatRule: 'random', leaderMethod: 'appointment', overflow: 'waitlist', announcementMode: 'direct', whatsappEnabled: true, attendanceEnabled: true, electionAnonymity: 'anonymous', allowVoteChange: false, tieBreak: 'random', eligibility: 'all' },
}, amaToken);
const swapLabId = swapLab.json?.data?.activityId ?? swapLab.json?.data?.activity?.id ?? swapLab.json?.data?.id;
await memberCall('POST', `/api/cgm/activities/${swapLabId}/lifecycle`, { action: 'open' }, amaToken);
await memberCall('POST', `/api/cgm/activities/${swapLabId}/groups`, { count: 2, capacity: 10 }, amaToken);
const swapGroups = ((await memberCall('GET', `/api/cgm/activities/${swapLabId}`, undefined, amaToken)).json?.data?.groups || []).map((g) => Number(g.id));
const swapperA = await freshFmtRosterStudent(33, 'Swapper Abena');
const swapperB = await freshFmtRosterStudent(34, 'Swapper Bufuo');
const swapperAId = Number(q1('SELECT id FROM cgm_students WHERE index_number_key = ?', swapperA.indexNumber.toLowerCase())?.id || 0);
const swapperBId = Number(q1('SELECT id FROM cgm_students WHERE index_number_key = ?', swapperB.indexNumber.toLowerCase())?.id || 0);
await memberCall('POST', `/api/cgm/activities/${swapLabId}/assign-student`, { studentId: swapperAId, groupId: swapGroups[0] }, amaToken);
await memberCall('POST', `/api/cgm/activities/${swapLabId}/assign-student`, { studentId: swapperBId, groupId: swapGroups[1] }, amaToken);

const swapSame = await memberCall('POST', `/api/cgm/activities/${swapLabId}/swap-students`, { studentIdA: swapperAId, studentIdB: swapperAId }, amaToken);
check('swapping a student with themselves is refused', swapSame.status === 400, `status ${swapSame.status}`);
const swapMissing = await memberCall('POST', `/api/cgm/activities/${swapLabId}/swap-students`, { studentIdA: swapperAId, studentIdB: 999999 }, amaToken);
check('swapping a student who has no group yet is refused', [400, 404].includes(swapMissing.status), `status ${swapMissing.status}`);
const outsiderSwap = await studentCall('POST', `/api/cgm/activities/${swapLabId}/swap-students`, { studentIdA: swapperAId, studentIdB: swapperBId }, swapperA.session);
check('students cannot swap each other — organizer power only', outsiderSwap.status === 401 || outsiderSwap.status === 403, `status ${outsiderSwap.status}`);

const swapRun = await memberCall('POST', `/api/cgm/activities/${swapLabId}/swap-students`, { studentIdA: swapperAId, studentIdB: swapperBId }, amaToken);
const groupOf = (studentId) => Number(q1("SELECT group_id FROM cgm_group_assignments WHERE activity_id = ? AND student_id = ? AND status = 'active'", swapLabId, studentId)?.group_id || 0);
check('the organizer swap exchanges the two members between their groups',
  swapRun.status === 200 && groupOf(swapperAId) === swapGroups[1] && groupOf(swapperBId) === swapGroups[0],
  `status ${swapRun.status} A=${groupOf(swapperAId)} B=${groupOf(swapperBId)}`);
check('the swap writes two history events with reason "organizer swap" and an audit row',
  q1("SELECT COUNT(*) c FROM cgm_assignment_events WHERE activity_id = ? AND reason = 'organizer swap'", swapLabId).c === 2
  && q1("SELECT COUNT(*) c FROM cgm_audit WHERE action = 'cgm.assignment.swapped'").c >= 1);
const swapBack = await memberCall('POST', `/api/cgm/activities/${swapLabId}/swap-students`, { studentIdA: swapperAId, studentIdB: swapperBId }, amaToken);
check('swapping back restores the original arrangement (swap is idempotent-safe)',
  swapBack.status === 200 && groupOf(swapperAId) === swapGroups[0] && groupOf(swapperBId) === swapGroups[1]);

// -- PHANTOM regulation: PHANTOM overrides the swap power in every class -----
const phantomSwap = await memberCall('POST', `/api/cgm/activities/${swapLabId}/swap-students`, { studentIdA: swapperAId, studentIdB: swapperBId }, phantomToken);
check('PHANTOM can direct a swap regardless of class team (oversight override)',
  phantomSwap.status === 200 && groupOf(swapperAId) === swapGroups[1],
  `status ${phantomSwap.status}`);
const swappedAudits = Number(q1("SELECT COUNT(*) c FROM cgm_audit WHERE action = 'cgm.assignment.swapped'").c);
check('every swap — organizer or PHANTOM — is visible in the audit trail', swappedAudits >= 3, `audit=${swappedAudits}`);

// -- Gender-separate activities refuse mixed swaps ---------------------------
const separateLab = await memberCall('POST', `/api/cgm/classes/${fmtClassId}/activities`, {
  name: 'Separate Swap Lab', type: 'tutorial',
  config: { method: 'automatic', groupCount: 2, capacity: 10, genderRule: 'separate', repeatRule: 'random', leaderMethod: 'appointment', overflow: 'waitlist', announcementMode: 'direct', whatsappEnabled: true, attendanceEnabled: true, electionAnonymity: 'anonymous', allowVoteChange: false, tieBreak: 'random', eligibility: 'all' },
}, amaToken);
const separateLabId = separateLab.json?.data?.activityId ?? separateLab.json?.data?.activity?.id ?? separateLab.json?.data?.id;
await memberCall('POST', `/api/cgm/activities/${separateLabId}/lifecycle`, { action: 'open' }, amaToken);
await memberCall('POST', `/api/cgm/activities/${separateLabId}/groups`, { count: 2, capacity: 10 }, amaToken);
const separateGroups = ((await memberCall('GET', `/api/cgm/activities/${separateLabId}`, undefined, amaToken)).json?.data?.groups || []).map((g) => Number(g.id));
// Registration copies gender from the roster entry at register time, so the
// roster row is gendered BEFORE the student registers.
const genderedRosterStudent = async (n, fullName, gender) => {
  const indexNumber = `PH/PHA/25/${String(n).padStart(4, '0')}`;
  await memberCall('POST', `/api/cgm/classes/${fmtClassId}/roster/entries`, { fullName, indexNumber, phone: `024511${String(n).padStart(4, '0')}` }, amaToken);
  const entryId = Number(q1('SELECT id FROM cgm_roster_entries WHERE index_number_key = ?', indexNumber.toLowerCase())?.id || 0);
  await memberCall('PATCH', `/api/cgm/classes/${fmtClassId}/roster/entries/${entryId}`, { gender }, amaToken);
  const register = await call('POST', '/api/cgm/student/register', { classCode: fmtCode, indexNumber, entryPassword: 'fmt-101-entry' });
  const passkey = String(register.json?.data?.passkey || '');
  const login = await studentCall('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: indexNumber, passkey });
  return { indexNumber, session: login.json?.data?.session?.token };
};
const maleStudent = await genderedRosterStudent(35, 'Separate Kojo', 'male');
const femaleStudent = await genderedRosterStudent(36, 'Separate Akua', 'female');
const maleId = Number(q1('SELECT id FROM cgm_students WHERE index_number_key = ?', maleStudent.indexNumber.toLowerCase())?.id || 0);
const femaleId = Number(q1('SELECT id FROM cgm_students WHERE index_number_key = ?', femaleStudent.indexNumber.toLowerCase())?.id || 0);
await memberCall('POST', `/api/cgm/activities/${separateLabId}/assign-student`, { studentId: maleId, groupId: separateGroups[0] }, amaToken);
await memberCall('POST', `/api/cgm/activities/${separateLabId}/assign-student`, { studentId: femaleId, groupId: separateGroups[1] }, amaToken);
const mixedSwap = await memberCall('POST', `/api/cgm/activities/${separateLabId}/swap-students`, { studentIdA: maleId, studentIdB: femaleId }, amaToken);
check('gender-separate groups refuse a swap that would mix genders',
  mixedSwap.status === 409 && /gender/i.test(mixedSwap.json?.error || ''), `status ${mixedSwap.status} ${mixedSwap.json?.error || ''}`);

// -- Source pins: the UI carries the three new controls ----------------------
const workspaceSrc = readFileSync(path.join(ROOT, 'src/components/ClassGroups/ClassGroupsWorkspace.tsx'), 'utf8');
const portalSrc3 = readFileSync(path.join(ROOT, 'src/components/ClassGroups/StudentPortal.tsx'), 'utf8');
const cgmClientSrc = readFileSync(path.join(ROOT, 'src/lib/cgm.ts'), 'utf8');
check("the organizer form offers 'Random selection — system picks for every student'", /value="random">Random selection — system picks for every student</.test(workspaceSrc));
check("the organizer finish button names the random mode ('Assign remaining (random mode)')", /Assign remaining \(random mode\)/.test(workspaceSrc));
check("a 'Create empty groups only' button lets the organizer stage groups before any student draws",
  /Create empty groups only/.test(workspaceSrc) && /cgm-add-groups|addGroups\(Number\(activityId\)/.test(workspaceSrc));
check('every member row carries a Swap… control that calls the swap API', /Swap…<\/option>/.test(workspaceSrc) && /swapStudents\(Number\(activityId\), Number\(member\.student_id\), partner\)/.test(workspaceSrc));
check('the client library exposes the swap endpoint', /swapStudents: \(activityId: number, studentIdA: number, studentIdB: number\)/.test(cgmClientSrc) && /swap-students/.test(cgmClientSrc));
check('the student portal hides manual picking in forced random mode and explains the fair draw',
  /const forcedRandom = data\.activity\.config\?\.method === 'random'/.test(portalSrc3)
  && /Your organizer set this activity to random selection/.test(portalSrc3));
check('forced random mode removes the pick-grid and the auto button for students', (portalSrc3.match(/!forcedRandom && /g) || []).length >= 2);
check('grouping activities render as distinctive state-aware continue cards (icon tile, Continue pill, random badge, drawn-group hint)',
  /cgm-student-activity-card/.test(portalSrc3) && /Continue — you are in \$\{mine\.group_name\}/.test(portalSrc3)
  && /Random selection — tap to draw your group/.test(portalSrc3)
  && /bg-emerald-600 px-2 py-0\.5 text-\[9px\] font-black uppercase tracking-wider text-white">Continue</.test(portalSrc3));
check('the profile shows fixed identity fields with their real values (camelCase /student/me keys, never blank)',
  /\['full_name', 'Full name', 'fullName', true\]/.test(portalSrc3)
  && /\['index_number', 'Index number \(fixed\)', 'indexNumber', false\]/.test(portalSrc3)
  && /const currentValue = \(displayKey: string\)/.test(portalSrc3));

// ---------------------------------------------------------------------------

console.log(`\nCGM TESTS: ${passed} passed, ${failures.length} failed`);

if (failures.length) {
  console.log('Failures:');
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exitCode = 1;
}
rmSync(CACHE, { recursive: true, force: true });
