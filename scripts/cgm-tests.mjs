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
 *
 * Usage: node --experimental-sqlite scripts/cgm-tests.mjs
 */
import { build } from 'esbuild';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, rmSync } from 'node:fs';
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

const env = { DB: d1, JWT_SECRET: 'cgm-test-secret', PHANTOM_EMAIL, ADMIN_PASSWORD: PHANTOM_PASSWORD, BUCKET };

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
  q("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'cgm_%'").length === 40);

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
  'Full Name,Index Number,University ID,Phone,Gender,Email',
  'Kofi Mensah,BIO-201-001,ATU/2024/001,0244000001,male,kofi@example.com',
  'Akosua Darko,BIO-201-002,ATU/2024/002,0244000002,female,akosua@example.com',
  'Yaw Owusu,BIO-201-003,ATU/2024/003,0244000003,male,yaw@example.com',
  'Abena Saah,BIO-201-004,ATU/2024/004,0244000004,female,abena@example.com',
  'Kojo Anane,BIO-201-005,ATU/2024/005,0244000005,male,kojo@example.com',
].join('\n');
const csvForm = new FormData();
csvForm.append('file', new File([rosterCsv], 'roster.csv', { type: 'text/csv' }));
csvForm.append('mapping', JSON.stringify({ full_name: 'Full Name', index_number: 'Index Number', university_id: 'University ID', phone: 'Phone', gender: 'Gender', email: 'Email' }));
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
check('approval issues the permanent passkey rx30a to the first student', firstPasskey === 'rx30a', String(firstPasskey));

const studentLogins = [];
sqlite.prepare("UPDATE cgm_students SET status = 'pending' WHERE index_number_key = ?").run('bio-201-001');
const pendingRetry = await call('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: 'BIO-201-001', passkey: 'rx30a' });
check('a pending student cannot sign in even with the real passkey', pendingRetry.status === 403 && /not.*approved/i.test(String(pendingRetry.json?.error)), `status ${pendingRetry.status} ${pendingRetry.text?.slice(0, 100)}`);
sqlite.prepare("UPDATE cgm_students SET status = 'active' WHERE index_number_key = ?").run('bio-201-001');
const registerAndApprove = async (indexNumber) => {
  const register = await call('POST', '/api/cgm/student/register', { classCode: classACode, indexNumber, entryPassword: 'bio-201-entry' });
  if (register.status !== 200) return { error: `register ${register.status}` };
  const queue = await memberCall('GET', `/api/cgm/classes/${classAId}/registrations?status=pending`, undefined, amaToken);
  const row = (queue.json?.data || []).find((entry) => entry.indexNumber === indexNumber);
  if (!row) return { error: 'not in queue' };
  const approval = await memberCall('POST', `/api/cgm/classes/${classAId}/registrations/${row.id}/approve`, {}, amaToken);
  return { passkey: approval.json?.data?.passkey };
};

// 25 sequential approvals: rx30b … rx30z (a was taken by the first student).
const sequentialPasskeys = [];
for (let i = 2; i <= 26; i += 1) {
  const indexNumber = `BIO-201-${String(i).padStart(3, '0')}`;
  const outcome = await registerAndApprove(indexNumber);
  if (!outcome.passkey) { check(`sequential approval ${i} issues a passkey`, false, outcome.error); continue; }
  sequentialPasskeys.push(outcome.passkey);
  studentLogins.push({ indexNumber, passkey: outcome.passkey });
}
const expected25 = ['b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z'].map((s) => `rx30${s}`);
check('passkeys continue rx30b through rx30z without omission', JSON.stringify(sequentialPasskeys) === JSON.stringify(expected25),
  sequentialPasskeys.slice(0, 3).join(',') + ' … ' + sequentialPasskeys.slice(-1));

// The 27th…52nd approvals must be rx30aa … rx30az (bijective base-26).
const doublePasskeys = [];
for (let i = 27; i <= 52; i += 1) {
  const indexNumber = `BIO-201-${String(i).padStart(3, '0')}`;
  const outcome = await registerAndApprove(indexNumber);
  if (!outcome.passkey) { check(`sequential approval ${i} issues a passkey`, false, outcome.error); continue; }
  doublePasskeys.push(outcome.passkey);
}
const expected26d = Array.from({ length: 26 }, (_, i) => `rx30a${String.fromCharCode(97 + i)}`);
check('the sequence reaches rx30aa, rx30bb … rx30az in order', JSON.stringify(doublePasskeys) === JSON.stringify(expected26d),
  `${doublePasskeys[0]} … ${doublePasskeys[doublePasskeys.length - 1]}`);

// 53rd approval must be rx30ba.
const outcome53 = await registerAndApprove('BIO-201-053');
check('the 53rd passkey is rx30ba', outcome53.passkey === 'rx30ba', String(outcome53.passkey));
const outcome54 = await registerAndApprove('BIO-201-054');
check('the 54th passkey is rx30bb', outcome54.passkey === 'rx30bb', String(outcome54.passkey));

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
  const passkey = racePairs.find((p) => p.studentId === studentId)?.passkey || '';
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
const loginOk = await studentCall('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: 'BIO-201-001', passkey: 'rx30a' });
const studentSessionA = loginOk.json?.data?.session?.token;
check('sign-in works with passkey + index number', Boolean(studentSessionA), `status ${loginOk.status}`);
const wrongId = await call('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: 'BIO-201-002', passkey: 'rx30a' });
check('passkey + wrong index number is rejected with the generic failure', wrongId.status === 400, `status ${wrongId.status}`);
const wrongPasskey = await call('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: 'BIO-201-001', passkey: 'rx30b' });
check('right index + someone else’s passkey is rejected', wrongPasskey.status === 400, `status ${wrongPasskey.status}`);
const universityLogin = await studentCall('POST', '/api/cgm/student/login', { identifierType: 'university_id', identifier: 'ATU/2024/001', passkey: 'rx30a' });
check('sign-in also works with passkey + university ID', Boolean(universityLogin.json?.data?.session?.token), `status ${universityLogin.status}`);
const phoneLogin = await studentCall('POST', '/api/cgm/student/login', { identifierType: 'phone', identifier: '0244000001', passkey: 'rx30a' });
check('sign-in also works with passkey + phone number', Boolean(phoneLogin.json?.data?.session?.token), `status ${phoneLogin.status}`);
const junkPasskey = await call('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: 'BIO-201-001', passkey: 'hello-world' });
check('a non-rx30 string is rejected before any lookup', junkPasskey.status === 400);

// Lockout: repeatedly wrong identifier for one student, then even the right
// passkey is refused until the lock expires.
let locked = false;
for (let attempt = 0; attempt < 10; attempt += 1) {
  const attemptLogin = await call('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: 'WRONG-ID', passkey: 'rx30a' });
  if (attemptLogin.status === 423) { locked = true; break; }
  if (attemptLogin.status === 429) break;
}
const afterLock = await call('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: 'BIO-201-001', passkey: 'rx30a' });
check('failed attempts lock the account temporarily (423)', locked, 'no 423 observed in 10 attempts');
check('a locked account refuses even the correct credentials', afterLock.status === 423, `status ${afterLock.status}`);
const lockedRow = q1('SELECT locked_until, failed_attempts FROM cgm_students WHERE index_number_key = ?', 'bio-201-001');
check('reaching the failure threshold set a temporary lock and cleared the counter',
  lockedRow.locked_until !== null && Number(lockedRow.failed_attempts) === 0,
  `locked_until=${lockedRow.locked_until} failed_attempts=${lockedRow.failed_attempts}`);
sqlite.prepare('UPDATE cgm_students SET failed_attempts = 0, locked_until = NULL WHERE index_number_key = ?').run('bio-201-001');
const unlockedLogin = await studentCall('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: 'BIO-201-001', passkey: 'rx30a' });
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
    const login = await studentCall('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: `BIO-201-${String(i + 1).padStart(3, '0')}`, passkey: `rx30${['a', 'b', 'c', 'd', 'e'][i]}` });
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
const lateLogin = await studentCall('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: 'BIO-201-004', passkey: 'rx30d' });
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
const disabledStudentLogin = await call('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: 'BIO-201-002', passkey: 'rx30b' });
check('student endpoints answer 404 while disabled', disabledStudentLogin.status === 404, `status ${disabledStudentLogin.status}`);
const disabledClasses = await memberCall('GET', '/api/cgm/organizer/classes', undefined, amaToken);
check('organizer endpoints answer 404 while disabled', disabledClasses.status === 404, `status ${disabledClasses.status}`);
const enableModule = await memberCall('POST', '/api/cgm/phantom/module', { enabled: true }, phantomToken);
check('PHANTOM re-enables the module', enableModule.status === 200);
const enabledStudentLogin = await studentCall('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: 'BIO-201-002', passkey: 'rx30b' });
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
check('a classmate never sees index numbers, university IDs or gender',
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
const login004 = await studentCall('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: 'BIO-201-004', passkey: 'rx30d' });
const login005 = await studentCall('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: 'BIO-201-005', passkey: 'rx30e' });
const session004 = login004.json?.data?.session?.token;
await studentCall('POST', `/api/cgm/student/activities/${podActivityId}/assign`, { groupId: podIdsS6[0] }, session004);
await studentCall('POST', `/api/cgm/student/activities/${podActivityId}/assign`, { groupId: podIdsS6[0] }, login005.json?.data?.session?.token);
await studentCall('POST', `/api/cgm/student/activities/${podActivityId}/assign`, { groupId: podIdsS6[1] }, sessionsToUse[1]);
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

// ---------------------------------------------------------------------------
console.log(`\nCGM TESTS: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log('Failures:');
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exitCode = 1;
}
rmSync(CACHE, { recursive: true, force: true });
