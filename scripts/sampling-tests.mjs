/**
 * CODE Rx — Sampling (Phase 1) test suite.
 *
 * Drives the REAL worker (esbuild-bundled) against an in-memory SQLite database
 * behind the same D1-compatible shim the Class & Group suite uses, and plays the
 * game entirely over the same HTTP API the two frontends use.
 *
 * What it proves, in order:
 *   1. configuration validation (totals, team counts, names, duplicates);
 *   2. creation → one secure, distinct, unguessable link per team;
 *   3. automatic sequential turns (A → B → C → D → A) and "only the active team
 *      can draw";
 *   4. one shared pool, no repeats, equal probability, CSPRNG-backed picks;
 *   5. duplicate requests and simultaneous requests never draw twice;
 *   6. pause / resume / audited skip (and that a skip consumes no number);
 *   7. revocation and regeneration, team-token isolation, IDOR protection;
 *   8. completion, results export and game history;
 *   9. regression: the rest of the platform still answers.
 *
 * Usage: node --experimental-sqlite scripts/sampling-tests.mjs
 */
import { build } from 'esbuild';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, '.sampling-cache');
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
await build({
  entryPoints: [path.join(ROOT, 'functions/lib/sampling/core.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'es2022',
  outfile: path.join(CACHE, 'core.mjs'),
  logLevel: 'silent',
});

// ---------------------------------------------------------------------------
// D1-compatible shim over node:sqlite
// ---------------------------------------------------------------------------
const sqlite = new DatabaseSync(':memory:');
sqlite.exec('PRAGMA journal_mode = MEMORY; PRAGMA foreign_keys = ON;');

const norm = (value) => (value === undefined ? null : value === true ? 1 : value === false ? 0 : value);

const d1 = {
  async exec(sql) { sqlite.exec(sql); return { success: true }; },
  prepare(sql) {
    const statement = sqlite.prepare(sql);
    const params = [];
    const run = () => {
      const info = statement.run(...params.map(norm));
      return { success: true, meta: { last_row_id: Number(info.lastInsertRowid), changes: Number(info.changes) } };
    };
    const all = async () => ({ results: statement.all(...params.map(norm)) });
    const first = async (column) => {
      const row = statement.get(...params.map(norm));
      if (!row) return null;
      return column ? row[column] ?? null : row;
    };
    const api = { sql, bind: (...next) => { params.length = 0; params.push(...next); return api; }, all, first, run };
    return api;
  },
  async batch(statements) {
    const results = [];
    for (const statement of statements) {
      if (/^\s*(pragma|select|with)\b/i.test(statement.sql || '')) {
        results.push({ results: (await statement.all()).results, success: true, meta: { changes: 0 } });
      } else {
        results.push(await statement.run());
      }
    }
    return results;
  },
};

const PHANTOM_EMAIL = 'coderxsociety@gmail.com';
const PHANTOM_PASSWORD = 'DevPreviewPassword1';
const INVITE_TEST_KEY = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
const env = {
  DB: d1,
  JWT_SECRET: 'sampling-test-secret',
  PHANTOM_EMAIL,
  ADMIN_PASSWORD: PHANTOM_PASSWORD,
  CGM_INVITATION_KEYS: JSON.stringify({ v1: INVITE_TEST_KEY }),
};

const worker = await import(path.join(CACHE, 'worker.mjs'));
const app = worker.default;
const core = await import(path.join(CACHE, 'core.mjs'));

let ipCounter = 0;
const freshIp = () => `198.51.${(ipCounter >> 8) & 255}.${(ipCounter++ & 255)}`;

const call = async (method, urlPath, body, headers = {}) => {
  const response = await app.fetch(new Request(`https://sampling-test.local${urlPath}`, {
    method,
    headers: { 'CF-Connecting-IP': freshIp(), ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  }), env);
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON */ }
  return { status: response.status, json, text, headers: response.headers };
};
const memberCall = (method, urlPath, body, token) =>
  call(method, urlPath, body, token ? { Authorization: `Bearer ${token}` } : {});
const teamCall = (method, urlPath, body) => call(method, urlPath, body);

const q = (sql, ...params) => sqlite.prepare(sql).all(...params.map(norm));
const q1 = (sql, ...params) => sqlite.prepare(sql).get(...params.map(norm));

let passed = 0;
const failures = [];
const check = (label, condition, detail = '') => {
  if (condition) passed += 1;
  else {
    failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
};
const section = (title) => console.log(`\n== ${title}`);

const b64url = (buffer) => Buffer.from(buffer).toString('base64url');
const memberHash = (password) => {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(password, salt, 100_000, 32, 'sha256');
  return `pbkdf2$100000$${b64url(salt)}$${b64url(hash)}`;
};

// ---------------------------------------------------------------------------
// 0. Boot and two member identities
// ---------------------------------------------------------------------------
section('0. Boot, schema and identities');

const health = await call('GET', '/api/health');
check('the worker boots', health.status === 200 || health.status === 404, `status ${health.status}`);

const phantomLogin = await call('POST', '/api/auth/login', { identifier: PHANTOM_EMAIL, password: PHANTOM_PASSWORD });
const phantomToken = phantomLogin.json?.token || phantomLogin.json?.data?.token;
check('the seeded PHANTOM operator can sign in', Boolean(phantomToken), `status ${phantomLogin.status}`);

const makeMember = async (email, name) => {
  const seq = q1('SELECT next_value FROM member_sequences WHERE id = 1');
  const padded = String(seq.next_value).padStart(4, '0');
  sqlite.prepare('UPDATE member_sequences SET next_value = next_value + 1 WHERE id = 1').run();
  sqlite.prepare("INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, 'member')")
    .run(email, name, memberHash('OrganizerPass1'));
  const user = q1('SELECT id FROM users WHERE email = ?', email);
  sqlite.prepare("INSERT INTO members (name, email, phone, role, joined_date, points, level, is_active) VALUES (?, ?, NULL, 'member', '2026-11-01', 0, 'Member', 1)")
    .run(name, email);
  const member = q1('SELECT id FROM members WHERE email = ?', email);
  sqlite.prepare("INSERT INTO member_profiles (user_id, member_record_id, member_code, status, codename_path, created_by_user_id) VALUES (?, ?, ?, 'active', 'member', ?)")
    .run(user.id, member.id, `CRX-${padded}`, user.id);
  const login = await call('POST', '/api/auth/login', { identifier: email, password: 'OrganizerPass1' });
  return login.json?.token || login.json?.data?.token;
};

const ownerToken = await makeMember('sam.organizer@example.com', 'Sam Organizer');
const strangerToken = await makeMember('other.organizer@example.com', 'Other Organizer');
check('two independent organizer sessions exist', Boolean(ownerToken) && Boolean(strangerToken));

const samplingTables = q("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'sampling_%' ORDER BY name").map((row) => row.name);
check('the sampling tables exist (games, teams, draws, events)',
  JSON.stringify(samplingTables) === JSON.stringify(['sampling_draws', 'sampling_events', 'sampling_games', 'sampling_teams']),
  samplingTables.join(','));
check('the pool is protected by a UNIQUE(game_id, number) index',
  Boolean(q1("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_sampling_draw_number'")));
check('one draw per turn is protected by a UNIQUE(game_id, turn_index) index',
  Boolean(q1("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_sampling_draw_turn'")));
check('a retried request is protected by a UNIQUE(game_id, idempotency_key) index',
  Boolean(q1("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_sampling_draw_request'")));
check('team credentials are unique across the platform',
  Boolean(q1("SELECT name FROM sqlite_master WHERE type='index' AND name='sqlite_autoindex_sampling_teams_1'"))
  && /token_hash TEXT NOT NULL UNIQUE/.test(q1("SELECT sql FROM sqlite_master WHERE name='sampling_teams'").sql));

// ---------------------------------------------------------------------------
// 1. Configuration validation
// ---------------------------------------------------------------------------
section('1. Game configuration is validated before anything is created');

const anon = await call('POST', '/api/sampling/games', { title: 'x', totalNumbers: 10, teamNames: ['A'] });
check('a signed-out visitor cannot create a game', anon.status === 401, `status ${anon.status}`);

const noTeams = await memberCall('POST', '/api/sampling/games', { totalNumbers: 10, teamNames: [] }, ownerToken);
check('a game needs at least one team', noTeams.status === 400 && /at least one team/i.test(noTeams.json?.error || ''), noTeams.text?.slice(0, 120));

const zeroTotal = await memberCall('POST', '/api/sampling/games', { totalNumbers: 0, teamNames: ['A'] }, ownerToken);
check('a total of 0 is refused', zeroTotal.status === 400, `status ${zeroTotal.status}`);

const hugeTotal = await memberCall('POST', '/api/sampling/games', { totalNumbers: 100_000, teamNames: ['A'] }, ownerToken);
check('an absurd total is refused with the allowed range named', hugeTotal.status === 400 && /between 1 and 2000/.test(hugeTotal.json?.error || ''), hugeTotal.text?.slice(0, 140));

const fractional = await memberCall('POST', '/api/sampling/games', { totalNumbers: 10.5, teamNames: ['A'] }, ownerToken);
check('a fractional total is refused', fractional.status === 400, `status ${fractional.status}`);

const duplicateNames = await memberCall('POST', '/api/sampling/games', { totalNumbers: 10, teamNames: ['Red Team', ' red team '] }, ownerToken);
check('two teams cannot share a name (case/space insensitive)', duplicateNames.status === 400 && /both called/i.test(duplicateNames.json?.error || ''), duplicateNames.text?.slice(0, 140));

const blankName = await memberCall('POST', '/api/sampling/games', { totalNumbers: 10, teamNames: ['Team A', '   '] }, ownerToken);
check('a blank team name is refused and named by position', blankName.status === 400 && /Team 2 needs a name/.test(blankName.json?.error || ''), blankName.text?.slice(0, 140));

const tooManyTeams = await memberCall('POST', '/api/sampling/games', {
  totalNumbers: 50,
  teamNames: Array.from({ length: 41 }, (_, index) => `Team ${index + 1}`),
}, ownerToken);
check('more than 40 teams is refused', tooManyTeams.status === 400, `status ${tooManyTeams.status}`);

const longName = await memberCall('POST', '/api/sampling/games', { totalNumbers: 10, teamNames: ['x'.repeat(41)] }, ownerToken);
check('a 41-character team name is refused', longName.status === 400, `status ${longName.status}`);

check('no game was created by any refused request', Number(q1('SELECT COUNT(*) c FROM sampling_games').c) === 0);

// ---------------------------------------------------------------------------
// 2. Creation + links
// ---------------------------------------------------------------------------
section('2. Creating a game generates one secure link per team');

const created = await memberCall('POST', '/api/sampling/games', {
  title: 'Pharmacy Quiz Draw',
  instructions: 'One number each, in turn. No skipping.',
  totalNumbers: 100,
  teamNames: ['Team A', 'Team B', 'Team C', 'Team D'],
}, ownerToken);
check('the organizer creates a game', created.status === 200, `status ${created.status} ${created.text?.slice(0, 160)}`);

const bundle = created.json?.data;
const gameId = Number(bundle?.game?.id);
check('the game starts in draft with every number available',
  bundle?.game?.status === 'draft' && bundle?.game?.drawnCount === 0 && bundle?.game?.remaining === 100,
  JSON.stringify(bundle?.game || {}).slice(0, 200));
check('four teams were created in the configured order',
  (bundle?.teams || []).map((team) => team.name).join(',') === 'Team A,Team B,Team C,Team D',
  (bundle?.teams || []).map((team) => team.name).join(','));
check('every team has its own link', (bundle?.teams || []).length === 4 && bundle.teams.every((team) => /#sampling\/team\/spl_/.test(String(team.link))));
check('the four links are all different', new Set(bundle.teams.map((team) => team.link)).size === 4);
check('each token is 32 random bytes of URL-safe text',
  bundle.teams.every((team) => /#sampling\/team\/spl_[A-Za-z0-9_-]{43}$/.test(team.link)),
  bundle.teams[0]?.link);
check('the raw token is never stored in the database',
  q('SELECT token_hash, token_enc FROM sampling_teams').every((row) => row.token_hash && !String(row.token_hash).startsWith('spl_')));
check('the stored credential is the sealed copy, not the token',
  q('SELECT token_enc FROM sampling_teams').every((row) => /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(String(row.token_enc))),
  JSON.stringify(q('SELECT id, token_enc FROM sampling_teams').map((row) => [row.id, String(row.token_enc)])));
check('a token hash is not reversible to the link',
  bundle.teams.every((team) => {
    const raw = String(team.link).split('#sampling/team/')[1];
    return !q('SELECT token_hash FROM sampling_teams').some((row) => String(row.token_hash).includes(raw));
  }));
check('the configuration is exactly what the organizer set',
  bundle?.game?.title === 'Pharmacy Quiz Draw' && bundle?.game?.totalNumbers === 100 && bundle?.game?.teamCount === 4);
check('the game history records the creation',
  Boolean(q1("SELECT id FROM sampling_events WHERE game_id = ? AND action = 'game_created'", gameId)));

const publicId = q1('SELECT public_id FROM sampling_games WHERE id = ?', gameId).public_id;
check('the game carries an unguessable public id', /^[0-9a-f]{16}$/.test(String(publicId)), String(publicId));

const teamLinks = bundle.teams.map((team) => String(team.link));
const tokenOf = (index) => teamLinks[index].split('#sampling/team/')[1];

const strangerView = await memberCall('GET', `/api/sampling/games/${gameId}`, undefined, strangerToken);
check('another organizer cannot open this game (IDOR refused)', strangerView.status === 403, `status ${strangerView.status}`);
const phantomView = await memberCall('GET', `/api/sampling/games/${gameId}`, undefined, phantomToken);
check('PHANTOM oversight can inspect the game', phantomView.status === 200, `status ${phantomView.status}`);

// ---------------------------------------------------------------------------
// 3. Team interface + turn order
// ---------------------------------------------------------------------------
section('3. Teams take turns automatically, in the configured order');

const viewA = await teamCall('GET', `/api/sampling/team/${tokenOf(0)}`);
check('a team link opens the team interface', viewA.status === 200, `status ${viewA.status} ${viewA.text?.slice(0, 120)}`);
check('the team sees its own name', viewA.json?.data?.team?.name === 'Team A');
check('the team sees the shared game state (100 numbers, none drawn yet)',
  viewA.json?.data?.game?.totalNumbers === 100 && viewA.json?.data?.game?.remaining === 100);
check('a team link never exposes another team’s token or link',
  viewA.text.includes('spl_') === false && !/token_hash|token_enc|"link"/.test(viewA.text),
  viewA.text.slice(0, 200));
check('the team link exposes no organizer controls',
  !/canManage|"events"|regenerate|revoke|organizerLabel|ownerUserId/.test(viewA.text));

const earlySpin = await teamCall('POST', `/api/sampling/team/${tokenOf(1)}/spin`, { requestId: 'early-b' });
check('a team cannot draw before the game starts', earlySpin.status === 423 || earlySpin.status === 409, `status ${earlySpin.status}`);

const started = await memberCall('POST', `/api/sampling/games/${gameId}/start`, {}, ownerToken);
check('the organizer starts the game', started.status === 200 && started.json?.data?.game?.status === 'active', started.text?.slice(0, 140));
check('the first team is up', started.json?.data?.game?.currentTeamName === 'Team A');
check('starting the game is in the history', Boolean(q1("SELECT id FROM sampling_events WHERE game_id = ? AND action='game_started'", gameId)));

const notYourTurn = await teamCall('POST', `/api/sampling/team/${tokenOf(1)}/spin`, { requestId: 'b-1' });
check('only the active team may draw (Team B is refused)', notYourTurn.status === 409 && notYourTurn.json?.code === 'not_your_turn', notYourTurn.text?.slice(0, 140));
check('the refused draw did not consume a number', Number(q1('SELECT COUNT(*) c FROM sampling_draws WHERE game_id = ?', gameId).c) === 0);
check('the refused draw did not advance the turn',
  Number(q1('SELECT current_turn FROM sampling_games WHERE id = ?', gameId).current_turn) === 0);

const waitingB = await teamCall('GET', `/api/sampling/team/${tokenOf(1)}`);
check('the waiting team is told whose turn it is',
  waitingB.json?.data?.isMyTurn === false && waitingB.json?.data?.game?.currentTeamName === 'Team A');
const activeA = await teamCall('GET', `/api/sampling/team/${tokenOf(0)}`);
check('the active team is told it is their turn', activeA.json?.data?.isMyTurn === true);

const spins = [];
for (let index = 0; index < 8; index += 1) {
  const teamIndex = index % 4;
  const before = q1('SELECT current_team_id FROM sampling_games WHERE id = ?', gameId);
  const expectedTeamId = Number(q1('SELECT id FROM sampling_teams WHERE game_id = ? AND position = ?', gameId, teamIndex + 1).id);
  check(`turn ${index + 1}: Team ${'ABCD'[teamIndex]} is the active team`, Number(before.current_team_id) === expectedTeamId,
    `active=${before.current_team_id} expected=${expectedTeamId}`);
  const spin = await teamCall('POST', `/api/sampling/team/${tokenOf(teamIndex)}/spin`, { requestId: `turn-${index + 1}` });
  spins.push(spin);
  check(`turn ${index + 1}: Team ${'ABCD'[teamIndex]} draws one number`,
    spin.status === 200 && Number(spin.json?.data?.draw?.number) >= 1 && Number(spin.json?.data?.draw?.number) <= 100,
    spin.text?.slice(0, 140));
  const after = await teamCall('GET', `/api/sampling/team/${tokenOf((teamIndex + 1) % 4)}`);
  check(`turn ${index + 1}: the next team is up automatically`,
    after.json?.data?.isMyTurn === true, `active=${after.json?.data?.game?.currentTeamName}`);
  check(`turn ${index + 1}: a non-active team cannot jump the queue`,
    (await teamCall('POST', `/api/sampling/team/${tokenOf((teamIndex + 2) % 4)}/spin`, { requestId: `jump-${index}` })).status === 409);
}

const drawnNumbers = q('SELECT number FROM sampling_draws WHERE game_id = ?', gameId).map((row) => Number(row.number));
check('eight draws were recorded', drawnNumbers.length === 8);
check('no number was drawn twice', new Set(drawnNumbers).size === drawnNumbers.length);
check('every drawn number is inside 1…100', drawnNumbers.every((number) => number >= 1 && number <= 100));
check('the four teams each drew twice',
  q('SELECT team_id, COUNT(*) c FROM sampling_draws WHERE game_id = ? GROUP BY team_id', gameId).every((row) => Number(row.c) === 2));
check('the game is 8 numbers in, 92 left, turn 8',
  Number(q1('SELECT drawn_count FROM sampling_games WHERE id = ?', gameId).drawn_count) === 8
  && Number(q1('SELECT current_turn FROM sampling_games WHERE id = ?', gameId).current_turn) === 8);

const teamHistoryA = await teamCall('GET', `/api/sampling/team/${tokenOf(0)}`);
check('a team sees its own drawn numbers in history',
  (teamHistoryA.json?.data?.team?.numbers || []).length === 2
  && teamHistoryA.json.data.team.drawCount === 2);
check('the team sees the shared board (every team’s numbers), but no credentials',
  (teamHistoryA.json?.data?.teams || []).length === 4
  && teamHistoryA.json.data.teams.every((team) => Array.isArray(team.draws)));

// ---------------------------------------------------------------------------
// 4. Duplicate + concurrent requests
// ---------------------------------------------------------------------------
section('4. A retry cannot draw twice, and simultaneous requests cannot either');

const nextTokenIndex = (() => {
  const position = Number(q1(
    'SELECT position FROM sampling_teams WHERE id = (SELECT current_team_id FROM sampling_games WHERE id = ?)', gameId).position);
  return position - 1;
})();
const beforeRetry = Number(q1('SELECT drawn_count FROM sampling_games WHERE id = ?', gameId).drawn_count);
const firstCall = await teamCall('POST', `/api/sampling/team/${tokenOf(nextTokenIndex)}/spin`, { requestId: 'retry-key-1' });
const replayCall = await teamCall('POST', `/api/sampling/team/${tokenOf(nextTokenIndex)}/spin`, { requestId: 'retry-key-1' });
check('the first request draws a number', firstCall.status === 200 && firstCall.json?.data?.replayed === false);
check('a retry with the same key returns the SAME number', replayCall.status === 200
  && Number(replayCall.json?.data?.draw?.number) === Number(firstCall.json?.data?.draw?.number)
  && replayCall.json?.data?.replayed === true,
  `${firstCall.json?.data?.draw?.number} vs ${replayCall.json?.data?.draw?.number}`);
check('the retry did not consume a second number',
  Number(q1('SELECT drawn_count FROM sampling_games WHERE id = ?', gameId).drawn_count) === beforeRetry + 1);

// Two distinct requests racing for the same turn.
const racingIndex = (() => {
  const position = Number(q1(
    'SELECT position FROM sampling_teams WHERE id = (SELECT current_team_id FROM sampling_games WHERE id = ?)', gameId).position);
  return position - 1;
})();
const beforeRace = Number(q1('SELECT drawn_count FROM sampling_games WHERE id = ?', gameId).drawn_count);
const raceResults = await Promise.all([
  teamCall('POST', `/api/sampling/team/${tokenOf(racingIndex)}/spin`, { requestId: 'race-a' }),
  teamCall('POST', `/api/sampling/team/${tokenOf(racingIndex)}/spin`, { requestId: 'race-b' }),
  teamCall('POST', `/api/sampling/team/${tokenOf(racingIndex)}/spin`, { requestId: 'race-c' }),
]);
const accepted = raceResults.filter((result) => result.status === 200);
check('only one of three simultaneous spins is accepted', accepted.length === 1,
  raceResults.map((result) => result.status).join(','));
check('the race consumed exactly one number',
  Number(q1('SELECT drawn_count FROM sampling_games WHERE id = ?', gameId).drawn_count) === beforeRace + 1);
check('the race advanced the turn exactly once',
  Number(q1('SELECT current_turn FROM sampling_games WHERE id = ?', gameId).current_turn) === beforeRace + 1);

// Two teams racing while only one of them is up.
const activePosition = Number(q1(
  'SELECT position FROM sampling_teams WHERE id = (SELECT current_team_id FROM sampling_games WHERE id = ?)', gameId).position);
const activeIndex = activePosition - 1;
// Two places ahead: that team is not up even if the first draw lands first.
const otherIndex = (activeIndex + 2) % 4;
const crossRace = await Promise.all([
  teamCall('POST', `/api/sampling/team/${tokenOf(activeIndex)}/spin`, { requestId: 'cross-a' }),
  teamCall('POST', `/api/sampling/team/${tokenOf(otherIndex)}/spin`, { requestId: 'cross-b' }),
]);
check('a team that is not up cannot sneak a draw in during a race',
  crossRace.filter((result) => result.status === 200).length === 1
  && crossRace[0].status === 200 && crossRace[1].status === 409,
  crossRace.map((result) => result.status).join(','));

check('every draw still has a unique number and a unique turn',
  (() => {
    const numbers = q('SELECT number FROM sampling_draws WHERE game_id = ?', gameId).map((row) => Number(row.number));
    const turns = q('SELECT turn_index FROM sampling_draws WHERE game_id = ?', gameId).map((row) => Number(row.turn_index));
    return new Set(numbers).size === numbers.length && new Set(turns).size === turns.length;
  })());
check('every draw belongs to the team whose turn it was',
  q(`SELECT d.turn_index, t.position FROM sampling_draws d JOIN sampling_teams t ON t.id = d.team_id
      WHERE d.game_id = ? ORDER BY d.turn_index`, gameId)
    .every((row) => Number(row.turn_index) % 4 === Number(row.position) - 1));

// ---------------------------------------------------------------------------
// 5. Randomness
// ---------------------------------------------------------------------------
section('5. The draw is uniform and cryptographically sourced');

const counts = new Array(10).fill(0);
const source = (target) => {
  const bytes = randomBytes(4);
  target[0] = bytes.readUInt32LE(0);
};
for (let index = 0; index < 40_000; index += 1) counts[core.uniformIndex(10, source)] += 1;
const expected = 40_000 / 10;
const chiSquare = counts.reduce((sum, value) => sum + ((value - expected) ** 2) / expected, 0);
check('uniformIndex spreads 40 000 picks evenly over 10 buckets (chi² under 27.9)',
  chiSquare < 27.9, `chi²=${chiSquare.toFixed(2)} counts=${counts.join(',')}`);
check('uniformIndex only ever returns an in-range value',
  Array.from({ length: 5000 }, () => core.uniformIndex(7, source)).every((value) => value >= 0 && value < 7));
check('uniformIndex rejects a non-positive range', (() => {
  try { core.uniformIndex(0, source); return false; } catch { return true; }
})());

const poolCounts = new Map();
for (let index = 0; index < 20_000; index += 1) {
  const value = core.pickAvailableNumber([3, 17, 42, 99], source);
  poolCounts.set(value, (poolCounts.get(value) || 0) + 1);
}
check('pickAvailableNumber can pick every available number and nothing else',
  [...poolCounts.keys()].sort((a, b) => a - b).join(',') === '3,17,42,99',
  [...poolCounts.keys()].join(','));
check('pickAvailableNumber never picks an already-taken number',
  core.pickAvailableNumber(core.availableNumbers(100, Array.from({ length: 99 }, (_, index) => index + 2)), source) === 1);
check('availableNumbers is the complement of what was drawn',
  JSON.stringify(core.availableNumbers(5, [2, 4])) === JSON.stringify([1, 3, 5]));

{
  const fs = await import('node:fs');
  const coreSource = fs.readFileSync(path.join(ROOT, 'functions/lib/sampling/core.ts'), 'utf8');
  const code = coreSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  check('the authority for randomness is the platform CSPRNG, never Math.random',
    /crypto\.getRandomValues/.test(code) && !/Math\.random/.test(code));
}

// ---------------------------------------------------------------------------
// 6. Pause, resume, skip
// ---------------------------------------------------------------------------
section('6. Pause, resume, and a skip that is confirmed and audited');

const paused = await memberCall('POST', `/api/sampling/games/${gameId}/pause`, {}, ownerToken);
check('the organizer can pause the game', paused.status === 200 && paused.json?.data?.game?.status === 'paused');

const pausedIndex = Number(q1(
  'SELECT position FROM sampling_teams WHERE id = (SELECT current_team_id FROM sampling_games WHERE id = ?)', gameId).position) - 1;
const pausedSpin = await teamCall('POST', `/api/sampling/team/${tokenOf(pausedIndex)}/spin`, { requestId: 'paused-1' });
check('a paused game refuses draws (423)', pausedSpin.status === 423, `status ${pausedSpin.status}`);
const pausedView = await teamCall('GET', `/api/sampling/team/${tokenOf(pausedIndex)}`);
check('the team sees the game is paused, not its turn', pausedView.json?.data?.game?.status === 'paused' && pausedView.json?.data?.isMyTurn === false);
check('pausing is in the history', Boolean(q1("SELECT id FROM sampling_events WHERE game_id = ? AND action='game_paused'", gameId)));

const resumed = await memberCall('POST', `/api/sampling/games/${gameId}/resume`, {}, ownerToken);
check('the organizer can resume it', resumed.status === 200 && resumed.json?.data?.game?.status === 'active');
check('resuming is in the history', Boolean(q1("SELECT id FROM sampling_events WHERE game_id = ? AND action='game_resumed'", gameId)));

const turnBeforeSkip = Number(q1('SELECT current_turn FROM sampling_games WHERE id = ?', gameId).current_turn);
const drawCountBeforeSkip = Number(q1('SELECT drawn_count FROM sampling_games WHERE id = ?', gameId).drawn_count);
const skippedPosition = Number(q1(
  'SELECT position FROM sampling_teams WHERE id = (SELECT current_team_id FROM sampling_games WHERE id = ?)', gameId).position);

const unconfirmed = await memberCall('POST', `/api/sampling/games/${gameId}/skip`, { expectedTurn: turnBeforeSkip }, ownerToken);
check('a skip without an explicit confirmation is refused', unconfirmed.status === 400);
const stale = await memberCall('POST', `/api/sampling/games/${gameId}/skip`, { expectedTurn: turnBeforeSkip + 5, confirm: true }, ownerToken);
check('a skip against a stale board is refused', stale.status === 409, `status ${stale.status}`);
const strangerSkip = await memberCall('POST', `/api/sampling/games/${gameId}/skip`, { expectedTurn: turnBeforeSkip, confirm: true }, strangerToken);
check('another organizer cannot skip a turn in this game', strangerSkip.status === 403, `status ${strangerSkip.status}`);

const skipped = await memberCall('POST', `/api/sampling/games/${gameId}/skip`, {
  expectedTurn: turnBeforeSkip,
  confirm: true,
  reason: 'Team is offline',
}, ownerToken);
check('the organizer can skip the current team', skipped.status === 200, skipped.text?.slice(0, 160));
check('the skip advanced the turn by exactly one',
  Number(q1('SELECT current_turn FROM sampling_games WHERE id = ?', gameId).current_turn) === turnBeforeSkip + 1);
check('the skip consumed no number',
  Number(q1('SELECT drawn_count FROM sampling_games WHERE id = ?', gameId).drawn_count) === drawCountBeforeSkip);
check('the next team is now up',
  Number(q1('SELECT position FROM sampling_teams WHERE id = (SELECT current_team_id FROM sampling_games WHERE id = ?)', gameId).position)
    === ((skippedPosition % 4) + 1));
check('the skip is audited with the team, the reason and the turn',
  (() => {
    const row = q1("SELECT * FROM sampling_events WHERE game_id = ? AND action='turn_skipped_confirmed'", gameId);
    if (!row) return false;
    const detail = JSON.parse(row.detail_json);
    return detail.reason === 'Team is offline' && detail.turn === turnBeforeSkip + 1 && typeof detail.teamName === 'string';
  })());
check('the platform audit trail also carries the skip',
  Boolean(q1("SELECT id FROM audit_logs WHERE action = 'sampling.turn_skipped_confirmed' AND subject_id = ?", String(gameId))));

const skipHistory = await memberCall('GET', `/api/sampling/games/${gameId}/history`, undefined, ownerToken);
check('the organizer’s history lists the skip',
  (skipHistory.json?.data?.events || []).some((event) => event.action === 'turn_skipped_confirmed'));

// ---------------------------------------------------------------------------
// 7. Links: revoke, regenerate, isolation
// ---------------------------------------------------------------------------
section('7. Team links can be revoked and regenerated, and never leak across teams');

const revoked = await memberCall('POST', `/api/sampling/games/${gameId}/teams/${Number(q1('SELECT id FROM sampling_teams WHERE game_id = ? AND position = 4', gameId).id)}/revoke`, { confirm: true }, ownerToken);
check('the organizer can revoke a team link', revoked.status === 200, revoked.text?.slice(0, 140));
const revokedView = await teamCall('GET', `/api/sampling/team/${tokenOf(3)}`);
check('a revoked link stops working at once', revokedView.status === 403, `status ${revokedView.status}`);

const unconfirmedRegen = await memberCall('POST', `/api/sampling/games/${gameId}/teams/${Number(q1('SELECT id FROM sampling_teams WHERE game_id = ? AND position = 1', gameId).id)}/regenerate`, {}, ownerToken);
check('regenerating a link needs confirmation', unconfirmedRegen.status === 400);

const regenerated = await memberCall('POST', `/api/sampling/games/${gameId}/teams/${Number(q1('SELECT id FROM sampling_teams WHERE game_id = ? AND position = 1', gameId).id)}/regenerate`, { confirm: true }, ownerToken);
const newLinkA = String(regenerated.json?.data?.link || '');
check('regenerating issues a brand-new link', regenerated.status === 200 && /#sampling\/team\/spl_/.test(newLinkA) && newLinkA !== teamLinks[0]);
check('the old link stops working', (await teamCall('GET', `/api/sampling/team/${tokenOf(0)}`)).status === 404);
check('the new link works', (await teamCall('GET', `/api/sampling/team/${newLinkA.split('#sampling/team/')[1]}`)).status === 200);

const restored = await memberCall('POST', `/api/sampling/games/${gameId}/teams/${Number(q1('SELECT id FROM sampling_teams WHERE game_id = ? AND position = 4', gameId).id)}/restore`, {}, ownerToken);
const restoredLink = String(restored.json?.data?.link || '');
check('restoring a revoked team issues a fresh, working link',
  restored.status === 200 && (await teamCall('GET', `/api/sampling/team/${restoredLink.split('#sampling/team/')[1]}`)).status === 200);

const tokenIsolation = await teamCall('GET', `/api/sampling/team/${newLinkA.split('#sampling/team/')[1]}`);
check('a team link never returns organizer-only fields',
  !('events' in (tokenIsolation.json?.data || {})) && !('organizer' in (tokenIsolation.json?.data || {}))
  && !JSON.stringify(tokenIsolation.json?.data || {}).includes('spl_'));

const teamOnOrganizerRoute = await memberCall('GET', `/api/sampling/games/${gameId}`, undefined, `spl_${'a'.repeat(43)}`);
check('a team token cannot open an organizer route', teamOnOrganizerRoute.status === 401, `status ${teamOnOrganizerRoute.status}`);
const badToken = await teamCall('GET', '/api/sampling/team/spl_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
check('an invented token is refused', badToken.status === 404 || badToken.status === 429, `status ${badToken.status}`);
const shortToken = await teamCall('GET', '/api/sampling/team/short');
check('a short/obviously-wrong token is refused without a lookup', shortToken.status === 404, `status ${shortToken.status}`);

// A burst of guesses is rate limited per IP.
const guessIp = { 'CF-Connecting-IP': '203.0.113.250' };
const guessStatuses = [];
for (let index = 0; index < 260; index += 1) {
  const response = await call('GET', `/api/sampling/team/spl_${String(index).padStart(43, 'x')}`, undefined, guessIp);
  guessStatuses.push(response.status);
}
check('token guessing is rate limited', guessStatuses.filter((status) => status === 429).length > 0,
  `429s=${guessStatuses.filter((status) => status === 429).length}`);

// ---------------------------------------------------------------------------
// 8. Playing a game to completion
// ---------------------------------------------------------------------------
section('8. A small game is played to completion — every number, once');

const small = await memberCall('POST', '/api/sampling/games', {
  title: 'Quick Draw',
  totalNumbers: 12,
  teamNames: ['Red Team', 'Blue Team', 'Clinical Team'],
}, ownerToken);
const smallId = Number(small.json?.data?.game?.id);
const smallLinks = small.json.data.teams.map((team) => String(team.link).split('#sampling/team/')[1]);
check('a game with three custom-named teams is created', small.status === 200 && small.json.data.game.teamCount === 3);
await memberCall('POST', `/api/sampling/games/${smallId}/start`, {}, ownerToken);

const completionOrder = [];
for (let index = 0; index < 12; index += 1) {
  const teamIndex = index % 3;
  const response = await teamCall('POST', `/api/sampling/team/${smallLinks[teamIndex]}/spin`, { requestId: `small-${index}` });
  if (response.status !== 200) {
    check(`completion: draw ${index + 1} failed`, false, response.text?.slice(0, 140));
    break;
  }
  completionOrder.push(Number(response.json.data.draw.number));
}
const smallGame = q1('SELECT * FROM sampling_games WHERE id = ?', smallId);
check('all 12 numbers were drawn', Number(smallGame.drawn_count) === 12);
check('the game is marked completed', smallGame.status === 'completed');
check('the completion timestamp is recorded', Boolean(smallGame.completed_at));
check('every number from 1 to 12 was drawn exactly once',
  [...completionOrder].sort((a, b) => a - b).join(',') === Array.from({ length: 12 }, (_, index) => index + 1).join(','),
  completionOrder.join(','));
check('the pool is empty', Number(q1('SELECT COUNT(*) c FROM sampling_draws WHERE game_id = ?', smallId).c) === 12);

const afterCompletion = await teamCall('POST', `/api/sampling/team/${smallLinks[0]}/spin`, { requestId: 'after-done' });
check('a completed game refuses further draws (410)', afterCompletion.status === 410, `status ${afterCompletion.status}`);
const completionView = await teamCall('GET', `/api/sampling/team/${smallLinks[0]}`);
check('the completion screen data says GAME COMPLETED', completionView.json?.data?.game?.status === 'completed'
  && completionView.json.data.game.remaining === 0 && Boolean(completionView.json.data.game.completedAt));
check('the completion view still carries the full draw history',
  (completionView.json?.data?.draws || []).length === 12);

const csv = await memberCall('GET', `/api/sampling/games/${smallId}/export?format=csv`, undefined, ownerToken);
check('the organizer can export the results as CSV', csv.status === 200 && /text\/csv/.test(String(csv.headers.get('content-type'))));
check('the CSV names the game, the teams and every number',
  /Quick Draw/.test(csv.text) && /Red Team/.test(csv.text) && /Clinical Team/.test(csv.text)
  && csv.text.split('\n').filter((line) => /^\d+,[^,]+,\d+,/.test(line)).length === 12,
  csv.text.split('\n').slice(0, 3).join(' | '));
const jsonExport = await memberCall('GET', `/api/sampling/games/${smallId}/export?format=json`, undefined, ownerToken);
check('the JSON export carries one row per draw',
  (jsonExport.json?.data?.draws || []).length === 12
  && jsonExport.json.data.teams.every((team) => Array.isArray(team.draws) && team.draws.length === 4));

const endCompleted = await memberCall('POST', `/api/sampling/games/${smallId}/end`, { confirm: true }, ownerToken);
check('a completed game cannot be ended again', endCompleted.status === 409, `status ${endCompleted.status}`);

// ---------------------------------------------------------------------------
// 9. Configuration protection
// ---------------------------------------------------------------------------
section('9. A started game cannot be quietly reconfigured');

const renameAttempt = await memberCall('PATCH', `/api/sampling/games/${gameId}`, { title: 'Hacked', totalNumbers: 5 }, ownerToken);
check('there is no route that edits a game configuration', renameAttempt.status === 404 || renameAttempt.status === 405, `status ${renameAttempt.status}`);
const deleteAttempt = await memberCall('DELETE', `/api/sampling/games/${gameId}`, undefined, ownerToken);
check('a game cannot be deleted (only ended)', deleteAttempt.status === 404 || deleteAttempt.status === 405, `status ${deleteAttempt.status}`);
check('the original configuration is untouched',
  q1('SELECT title, total_numbers, team_count FROM sampling_games WHERE id = ?', gameId).title === 'Pharmacy Quiz Draw'
  && Number(q1('SELECT total_numbers FROM sampling_games WHERE id = ?', gameId).total_numbers) === 100
  && Number(q1('SELECT team_count FROM sampling_games WHERE id = ?', gameId).team_count) === 4);
check('team names are untouched',
  q('SELECT name FROM sampling_teams WHERE game_id = ? ORDER BY position', gameId).map((row) => row.name).join(',')
    === 'Team A,Team B,Team C,Team D');

const ended = await memberCall('POST', `/api/sampling/games/${gameId}/end`, { confirm: true, reason: 'Time ran out' }, ownerToken);
check('the organizer can end a game early (with confirmation)', ended.status === 200 && ended.json?.data?.game?.status === 'ended');
const endedSpin = await teamCall('POST', `/api/sampling/team/${newLinkA.split('#sampling/team/')[1]}/spin`, { requestId: 'ended-1' });
check('an ended game refuses draws', endedSpin.status === 410, `status ${endedSpin.status}`);
check('ending is in the history', Boolean(q1("SELECT id FROM sampling_events WHERE game_id = ? AND action='game_ended'", gameId)));

// ---------------------------------------------------------------------------
// 10. Workspace listing
// ---------------------------------------------------------------------------
section('10. The workspace lists active and previous games');

const list = await memberCall('GET', '/api/sampling/games', undefined, ownerToken);
check('the organizer sees their own games', list.status === 200 && (list.json?.data?.games || []).length === 2,
  `${(list.json?.data?.games || []).length}`);
check('the finished games are filed under previous',
  (list.json?.data?.previous || []).length === 2 && (list.json?.data?.active || []).length === 0);
const otherList = await memberCall('GET', '/api/sampling/games', undefined, strangerToken);
check('another organizer sees none of them', (otherList.json?.data?.games || []).length === 0);
const phantomList = await memberCall('GET', '/api/sampling/games', undefined, phantomToken);
check('PHANTOM sees every game for oversight', (phantomList.json?.data?.games || []).length === 2);

const emptyState = await memberCall('GET', '/api/sampling/games', undefined, strangerToken);
check('an organizer with no games gets an empty list, not an error',
  emptyState.status === 200 && Array.isArray(emptyState.json?.data?.games) && emptyState.json.data.games.length === 0);

// ---------------------------------------------------------------------------
// 11. Regression: the rest of the platform still works
// ---------------------------------------------------------------------------
section('11. Existing surfaces are untouched');

check('the Class & Group module still answers',
  (await memberCall('GET', '/api/cgm/organizer/status', undefined, ownerToken)).status === 200);
check('site content still answers', (await call('GET', '/api/site-content')).status === 200 || (await call('GET', '/api/site-content')).status === 404);
check('the CGM tables are still all present',
  Number(q1("SELECT COUNT(*) c FROM sqlite_master WHERE type='table' AND name LIKE 'cgm_%'").c) === 52);

// ---------------------------------------------------------------------------
console.log(`\nSAMPLING TESTS: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log('Failures:');
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exitCode = 1;
}
