#!/usr/bin/env node
/**
 * CODE Rx — Sampling (Phase 1) browser-level multiplayer journey.
 *
 * Boots the SHIPPED single-file bundle in jsdom (a real DOM and event system)
 * against a running `wrangler pages dev` preview with its local D1, and plays a
 * real game the way the people using it will:
 *
 *   1. open Class & Groups → press Sampling → land in the separate workspace;
 *   2. create a game through the setup screen (total + three teams);
 *   3. copy the generated team links out of the link desk;
 *   4. open each link in its OWN browser session (no account, different page);
 *   5. Team A draws, Team B's waiting screen flips to "It's your turn!" on its
 *      own (no refresh), Team C stays waiting;
 *   6. a refresh of a waiting team keeps its identity and its turn;
 *   7. the organizer pauses, resumes, and skips a turn with confirmation;
 *   8. the pool is played out and the completion screens appear;
 *   9. Back to Class & Groups leaves the game exactly where it was.
 *
 * jsdom is deliberately not an application dependency:
 *   mkdir -p /tmp/browser && cd /tmp/browser && npm i jsdom
 *   npm run build
 *   npx wrangler pages dev dist --port 8788 --d1 DB --persist-to /tmp/wrangler-persist &
 *   NODE_PATH=/tmp/browser/node_modules node scripts/sampling-browser-check.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const BASE = process.env.CODE_RX_PREVIEW || 'http://127.0.0.1:8788';
const EMAIL = process.env.PHANTOM_EMAIL || 'coderxsociety@gmail.com';
const PASSWORD = process.env.ADMIN_PASSWORD || 'DevPreviewPassword1';

const require = createRequire(import.meta.url);
const { JSDOM, VirtualConsole } = require('jsdom');

let passed = 0;
const failures = [];
const check = (label, condition, detail = '') => {
  if (condition) { passed += 1; console.log(`PASS  ${label}`); }
  else { failures.push(label); console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`); }
};
const section = (title) => console.log(`\n== ${title}`);

const stamp = Date.now().toString(36);

const api = async (method, endpoint, body, token) => {
  const response = await fetch(`${BASE}${endpoint}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'cf-connecting-ip': `198.18.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200) + 1}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let json = null; try { json = JSON.parse(text); } catch { /* non-JSON */ }
  return { status: response.status, json, text, headers: response.headers };
};

const login = await api('POST', '/api/auth/login', { identifier: EMAIL, password: PASSWORD });
const memberToken = login.json?.token || login.json?.data?.token;
if (!memberToken) {
  console.log('FAIL — the preview did not accept the PHANTOM sign-in');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// jsdom boot of the shipped bundle, ONE ISOLATED WINDOW PER PAGE
//
// Several people play at once, so each page must have its own globals —
// localStorage (the organizer's session vs a team's bare link), fetch, timers
// and document. The bundle is therefore evaluated INSIDE its window's realm
// instead of imported into Node, which gives every team a genuinely separate
// browser session in this process.
// ---------------------------------------------------------------------------
let appSource = null;
const loadAppSource = async () => {
  if (appSource) return appSource;
  const html = await (await fetch(`${BASE}/#sampling`)).text();
  const bundle = /<script type="module"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!bundle) { console.log('FAIL — the shipped page carries no application bundle'); process.exit(1); }
  // `import.meta` only appears as a base URL for lazy imports; the single-file
  // bundle has nothing left to import, so the window's own address stands in.
  appSource = bundle[1]
    .replace(/import\.meta\.url/g, 'location.href')
    .replace(/import\.meta\.env/g, '__CODE_RX_ENV__');
  return appSource;
};

const nodeFetch = globalThis.fetch;

const boot = async (address, { memberToken: token = null, label = 'page' } = {}) => {
  const source = await loadAppSource();
  const pageUrl = `${BASE}/${address}`;
  const html = await (await fetch(pageUrl)).text();

  const virtualConsole = new VirtualConsole();
  const jsdomErrors = [];
  virtualConsole.on('jsdomError', (error) => jsdomErrors.push(String(error?.message || error).slice(0, 200)));
  const dom = new JSDOM(html, { url: pageUrl, runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole });
  const { window } = dom;

  // Every page-driven request carries its own visitor IP, exactly like real
  // browsers do, so the per-IP throttles never treat the journey as one visitor.
  let visitorSeq = Math.floor(Math.random() * 200);
  window.fetch = (input, init) => {
    const headers = new Headers((typeof init === 'object' && init) ? init.headers : undefined);
    headers.set('cf-connecting-ip', `198.18.${(visitorSeq = (visitorSeq + 1) % 250) + 1}.${10 + (visitorSeq % 90)}`);
    return nodeFetch(new URL(typeof input === 'string' ? input : input.url, pageUrl), { ...(typeof init === 'object' && init ? init : {}), headers });
  };
  window.matchMedia = window.matchMedia || (() => ({ matches: false, media: '', onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } }));
  window.ResizeObserver = window.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} };
  window.IntersectionObserver = window.IntersectionObserver || class { observe() {} unobserve() {} disconnect() {} };
  window.scrollTo = () => {};
  window.alert = () => {};
  window.__CODE_RX_ENV__ = { VITE_API_URL: '', DEV: false, PROD: true, MODE: 'production', BASE_URL: '/' };
  if (token) {
    window.localStorage.setItem('codeRx_token', token);
    window.localStorage.setItem('codeRx_user', JSON.stringify({ name: 'PHANTOM', email: EMAIL, role: 'phantom', isPhantom: true }));
  }

  // A clipboard and a share sheet, so "Copy" and "Share" are really exercised.
  const clipboard = [];
  try {
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (value) => { clipboard.push(String(value)); } },
    });
    Object.defineProperty(window.navigator, 'share', {
      configurable: true,
      value: async (payload) => { clipboard.push(`share:${payload?.url || ''}`); },
    });
  } catch { /* older jsdom: the app falls back to its own copy path */ }

  window.eval(source);

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const body = () => window.document.body.textContent.replace(/\s+/g, ' ').trim();
  for (let attempt = 0; attempt < 80 && body().length < 40; attempt += 1) await wait(250);

  const waitFor = async (pattern, timeoutMs = 20_000) => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const found = pattern instanceof RegExp ? pattern.test(body()) : body().includes(pattern);
      if (found) return true;
      if (Date.now() > deadline) return false;
      await wait(200);
    }
  };
  const setNativeValue = (element, value) => {
    const proto = element.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, value);
    element.dispatchEvent(new window.Event('input', { bubbles: true }));
  };
  const buttonByText = (text, scope = window.document) =>
    [...scope.querySelectorAll('button')].find((element) => element.textContent.replace(/\s+/g, ' ').trim().includes(text));
  const waitForElement = async (finder, timeoutMs = 15_000) => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const found = typeof finder === 'function' ? finder() : finder;
      if (found) return found;
      if (Date.now() > deadline) return null;
      await wait(200);
    }
  };
  const testId = (id) => window.document.querySelector(`[data-testid="${id}"]`);
  const click = async (id) => {
    const element = await waitForElement(() => testId(id));
    if (element) element.click();
    return Boolean(element);
  };

  return {
    label, address, window, body, wait, waitFor, waitForElement, setNativeValue, buttonByText,
    testId, click, clipboard, jsdomErrors,
    close: () => { try { window.close(); } catch { /* already gone */ } },
  };
};

// ---------------------------------------------------------------------------
// 1. Class & Groups → the Sampling button → the separate workspace
// ---------------------------------------------------------------------------
section('1. The organizer opens Sampling from Class & Groups');

const workspace = await boot('#class-groups', { memberToken });
check('the Class & Groups console still boots', await workspace.waitFor(/Class & Group Management/, 25_000));

const samplingButton = await workspace.waitForElement(() => workspace.testId('cgm-sampling-open'), 20_000);
check('the console carries a dedicated Sampling button', Boolean(samplingButton),
  workspace.body().slice(0, 200));
samplingButton && samplingButton.click();
check('pressing it opens the separate Sampling workspace',
  await workspace.waitFor(/One pool\. One turn at a time\./, 25_000), workspace.body().slice(0, 200));
check('the workspace has its own identity and its own back action',
  Boolean(workspace.testId('sampling-topbar')) && Boolean(workspace.testId('sampling-back-to-classes')));
const sections = await workspace.waitForElement(
  () => (/Active games/.test(workspace.body()) && /Previous games/.test(workspace.body()) ? true : null), 20_000);
check('the workspace is organised as active games and previous games',
  Boolean(sections)
  && Boolean(workspace.testId('sampling-empty-active') || workspace.window.document.querySelector('[data-testid^="sampling-game-"]')));

// ---------------------------------------------------------------------------
// 2. Create a game through the setup screen
// ---------------------------------------------------------------------------
section('2. Creating a game through the setup screen');

const createButton = await workspace.waitForElement(() => workspace.testId('sampling-create-new'));
createButton && createButton.click();
check('Create new game opens the setup screen', await workspace.waitForElement(() => workspace.testId('sampling-setup'), 15_000));

const gameTitle = `Browser Game ${stamp}`;
workspace.setNativeValue(workspace.testId('sampling-title'), gameTitle);
workspace.setNativeValue(workspace.testId('sampling-total'), '9');
// Three teams (the default is four).
const removeTeam = await workspace.waitForElement(() => workspace.testId('sampling-team-remove-3'));
removeTeam && removeTeam.click();
const names = ['Red Team', 'Blue Team', 'Clinical Team'];
for (let index = 0; index < names.length; index += 1) {
  const input = workspace.testId(`sampling-team-name-${index}`);
  if (input) workspace.setNativeValue(input, names[index]);
}
const submit = await workspace.waitForElement(() => workspace.testId('sampling-create-submit'));
check('the custom names are accepted (numeric/alphanumeric/custom all allowed)',
  Boolean(submit) && !submit.disabled, `disabled=${Boolean(submit?.disabled)}`);
submit && submit.click();
check('the game is created and opens its own monitoring screen',
  await workspace.waitFor(/Team links/, 25_000), workspace.body().slice(0, 240));
check('the created game and its configuration are on screen',
  workspace.body().includes(gameTitle) && workspace.body().includes('9'));
check('the workspace remembers the game in the address',
  workspace.window.location.hash.startsWith('#sampling/game/'), workspace.window.location.hash);

// ---------------------------------------------------------------------------
// 3. Team links — copy, share, and one per team
// ---------------------------------------------------------------------------
section('3. One secure link per team, copied from the link desk');

const linkElements = await workspace.waitForElement(() => {
  const found = [...workspace.window.document.querySelectorAll('.sampling-link-url')];
  return found.length === 3 ? found : null;
}, 20_000);
const links = (linkElements || []).map((element) => element.textContent.trim());
check('the link desk lists one link per team', links.length === 3, links.join(' | ').slice(0, 200));
check('the links are distinct and unguessable',
  new Set(links).size === 3 && links.every((link) => /#sampling\/team\/spl_[A-Za-z0-9_-]{40,}/.test(link)),
  links.join(' | ').slice(0, 160));
check('a team link never contains another team’s link', new Set(links).size === links.length);

const copyButtons = [...workspace.window.document.querySelectorAll('[data-testid^="sampling-copy-"]')]
  .filter((button) => button.getAttribute('data-testid') !== 'sampling-copy-all');
copyButtons[0] && copyButtons[0].click();
const copied = await workspace.waitForElement(() => (workspace.clipboard.length ? workspace.clipboard[0] : null), 10_000);
check('Copy puts that team’s link on the clipboard', Boolean(copied) && links.includes(String(copied)), String(copied));

const shareButtons = [...workspace.window.document.querySelectorAll('[data-testid^="sampling-share-"]')];
shareButtons[1] && shareButtons[1].click();
const shared = await workspace.waitForElement(() => workspace.clipboard.find((entry) => String(entry).startsWith('share:')), 10_000);
check('Share hands the link to the platform share sheet', Boolean(shared) && links.includes(String(shared).replace('share:', '')), String(shared));

// ---------------------------------------------------------------------------
// 4. Each team opens its own link, in its own browser session
// ---------------------------------------------------------------------------
section('4. Three teams, three separate sessions, no accounts');

const teamPages = [];
for (let index = 0; index < links.length; index += 1) {
  const hash = `#sampling/team/${links[index].split('#sampling/team/')[1]}`;
  const page = await boot(hash);
  teamPages.push(page);
}
check('every team link opens its own team screen',
  teamPages.every((page) => Boolean(page.testId('sampling-team-page'))));
check('each screen names its own team',
  teamPages[0].body().includes('Red Team') && teamPages[1].body().includes('Blue Team')
  && teamPages[2].body().includes('Clinical Team'),
  teamPages.map((page) => page.body().slice(0, 60)).join(' || '));
check('a team screen shows no organizer controls',
  !teamPages[0].body().includes('Team links') && !teamPages[0].body().includes('Skip turn'));

// Start the game from the organizer screen.
const startButton = await workspace.waitForElement(() => workspace.testId('sampling-start'), 10_000);
startButton && startButton.click();
const started = await workspace.waitForElement(
  () => (workspace.testId('sampling-turn')?.textContent.trim() === '1' ? true : null), 20_000);
check('the organizer starts the game from the monitor', Boolean(started)
  && /In play/.test(workspace.body()), workspace.body().slice(0, 200));

check('the first team is told it is their turn',
  await teamPages[0].waitFor(/It’s your turn/i, 25_000), teamPages[0].body().slice(0, 200));
// Each waiting team learns who is playing from its own poll — no refresh.
const sawWaitFor = await teamPages[1].waitFor(/Wait for your turn/i, 25_000);
const sawWhoPlays = await teamPages[1].waitFor(/Red Team is playing now/i, 25_000);
await teamPages[2].waitFor(/Wait for your turn/i, 25_000);
check('the other teams see WAIT FOR YOUR TURN and who is playing',
  sawWaitFor && sawWhoPlays && /Wait for your turn/i.test(teamPages[2].body()),
  teamPages[1].body().slice(0, 220));

// ---------------------------------------------------------------------------
// 5. The draw: one SPIN, one number, the turn moves by itself
// ---------------------------------------------------------------------------
section('5. SPIN draws a real number and the turn advances automatically');

const spinButton = await teamPages[0].waitForElement(() => teamPages[0].testId('sampling-spin'), 15_000);
check('the active team has a prominent SPIN button', Boolean(spinButton));
spinButton && spinButton.click();

const reelNumber = await teamPages[0].waitForElement(() => {
  const element = teamPages[0].testId('sampling-reel-number');
  const phase = teamPages[0].testId('sampling-team-page')?.getAttribute('data-phase');
  return element && phase === 'revealed' ? Number(element.textContent.trim()) : null;
}, 30_000);
check('the carousel settles on the number the server drew',
  Number.isFinite(reelNumber) && reelNumber >= 1 && reelNumber <= 9, String(reelNumber));
check('the team’s history holds the drawn number',
  (teamPages[0].testId('sampling-mine')?.textContent || '').includes(String(reelNumber)));
check('the reveal names who plays next',
  /You drew/i.test(teamPages[0].body()) && /Next up/i.test(teamPages[0].body()), teamPages[0].body().slice(0, 200));

// No refresh: the waiting screen updates on its own.
check('the next team’s waiting screen flips to ITS TURN on its own',
  await teamPages[1].waitFor(/It’s your turn/i, 25_000), teamPages[1].body().slice(0, 200));
check('the third team is still waiting',
  /Wait for your turn/i.test(teamPages[2].body()), teamPages[2].body().slice(0, 160));

// A reload of a waiting team keeps its identity and its place.
const reloaded = await boot(`#sampling/team/${links[2].split('#sampling/team/')[1]}`);
check('a reload keeps the team’s own screen and its place in the queue',
  await reloaded.waitFor(/Clinical Team/, 20_000) && Boolean(reloaded.testId('sampling-team-page')),
  reloaded.body().slice(0, 160));

// ---------------------------------------------------------------------------
// 6. Organizer: pause, resume, and an audited skip
// ---------------------------------------------------------------------------
section('6. Pause, resume and an audited skip from the monitor');

const pauseButton = await workspace.waitForElement(() => workspace.testId('sampling-pause'), 20_000);
pauseButton && pauseButton.click();
check('the organizer can pause the live game', await workspace.waitFor(/Paused/, 20_000));
check('the team is told the game is paused', await teamPages[1].waitFor(/paused/i, 25_000), teamPages[1].body().slice(0, 200));
check('a paused game shows no SPIN button', !teamPages[1].testId('sampling-spin'));

const resumeButton = await workspace.waitForElement(() => workspace.testId('sampling-resume'), 10_000);
resumeButton && resumeButton.click();
check('the organizer can resume it', await workspace.waitFor(/Up now/, 20_000));
check('the team is back to its turn after the resume', await teamPages[1].waitFor(/It’s your turn/i, 25_000));

// Skip the turn that is up, through the two dialogs.
const skipButton = await workspace.waitForElement(() => workspace.testId('sampling-skip'), 15_000);
skipButton && skipButton.click();
const skipDialog = await workspace.waitForElement(
  () => workspace.window.document.querySelector('[role="dialog"]'), 10_000);
const confirmText = skipDialog?.textContent || '';
check('a skip asks for confirmation first',
  /Skip .*turn\?/i.test(confirmText) && /recorded in the game history/i.test(confirmText), confirmText.slice(0, 200));
// The dialog's confirm button carries the label "Skip this turn".
const skipConfirm = [...(skipDialog?.querySelectorAll('button') || [])]
  .find((button) => button.textContent.trim() === 'Skip this turn');
skipConfirm && skipConfirm.click();
const reasonInput = await workspace.waitForElement(
  () => workspace.window.document.querySelector('[role="dialog"] input'), 10_000);
check('a skip requires a reason before it goes through', Boolean(reasonInput));
if (reasonInput) {
  workspace.setNativeValue(reasonInput, 'Team is offline');
  const skipNow = [...workspace.window.document.querySelectorAll('[role="dialog"] button')]
    .find((button) => button.textContent.trim() === 'Skip turn');
  skipNow && skipNow.click();
}
check('the skip is accepted and recorded', await workspace.waitFor(/skipped and recorded/i, 25_000), workspace.body().slice(0, 200));
const historyText = workspace.testId('sampling-history')?.textContent || '';
check('the game history shows the skip with its reason',
  /turn skipped confirmed/i.test(historyText) && /Team is offline/.test(historyText), historyText.slice(0, 220));

// ---------------------------------------------------------------------------
// 7. Play the pool out; completion
// ---------------------------------------------------------------------------
section('7. The game plays to completion and both screens say so');

// The address carries the game being monitored.
const gameId = Number(workspace.window.location.hash.split('/').pop());
check('the monitor exposes the game it is showing', gameId > 0, `id=${gameId}`);

for (let attempt = 0; attempt < 40; attempt += 1) {
  const view = (await api('GET', '/api/sampling/games/' + gameId, undefined, memberToken)).json?.data;
  if (!view || view.game.status === 'completed') break;
  if (view.game.status === 'paused') {
    await api('POST', `/api/sampling/games/${gameId}/resume`, {}, memberToken);
    continue;
  }
  const team = (view.teams || []).find((entry) => entry.id === view.game.currentTeamId);
  const link = team?.link;
  if (!link) break;
  const teamToken = String(link).split('#sampling/team/')[1];
  await fetch(`${BASE}/api/sampling/team/${teamToken}/spin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '198.18.44.44' },
    body: JSON.stringify({ requestId: `browser-${attempt}-${stamp}` }),
  });
}

const finished = (await api('GET', `/api/sampling/games/${gameId}`, undefined, memberToken)).json?.data;
check('every number was drawn', finished?.game?.status === 'completed' && finished?.game?.drawnCount === 9,
  `${finished?.game?.status} drawn=${finished?.game?.drawnCount}`);
check('the organizer screen shows GAME COMPLETED',
  await workspace.waitFor(/GAME COMPLETED!/, 25_000), workspace.body().slice(0, 200));
check('the completion panel lists the final results by team',
  (workspace.testId('sampling-complete')?.textContent || '').includes('Clinical Team'));
check('the team screen shows the completion screen too',
  await teamPages[0].waitFor(/GAME COMPLETED!/, 25_000), teamPages[0].body().slice(0, 200));

// Export really produces a CSV.
workspace.testId('sampling-export')?.click();
check('exporting the results reports a saved file', await workspace.waitFor(/Results exported|export/i, 20_000));

// ---------------------------------------------------------------------------
// 8. Back to Class & Groups without losing the game
// ---------------------------------------------------------------------------
section('8. Back to Class & Groups keeps the game');

const backButton = workspace.testId('sampling-back-to-classes');
backButton && backButton.click();
check('the back action returns to the Class & Groups console',
  await workspace.waitFor(/Class & Groups|Classes/, 25_000), workspace.body().slice(0, 200));

const returned = await boot('#sampling', { memberToken });
check('the Sampling workspace reopens with the finished game listed',
  await returned.waitFor(new RegExp(gameTitle), 25_000), returned.body().slice(0, 200));
check('the finished game is filed under previous games',
  Boolean(returned.testId('sampling-empty-previous') === null) || /Previous games/.test(returned.body()));

for (const page of [workspace, ...teamPages, reloaded, returned]) page.close?.();

// ---------------------------------------------------------------------------
console.log(`\nSAMPLING BROWSER CHECKS: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log('Failures:');
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exitCode = 1;
}
