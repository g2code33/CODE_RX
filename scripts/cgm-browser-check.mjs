#!/usr/bin/env node
/**
 * CODE Rx — Class & Group Management browser-level journey check.
 *
 * Boots the SHIPPED single-file bundle in jsdom (a real DOM, real event
 * system) against a running `wrangler pages dev` preview with its local D1,
 * and drives the module's most important journeys exactly as a browser does:
 *
 *   1.  Organizer workspace: My Classes lists classes and can create a draft
 *       through the UI (create affordance exists even with classes present).
 *   2.  PHANTOM oversight: Class approvals approve a draft through the UI;
 *       Module settings change a policy and report success.
 *   3.  Student: an open invitation shows the class banner, registration is
 *       prefilled, the passkey is revealed exactly once behind an explicit
 *       confirmation, and the dashboard opens.
 *   4.  Invitation continuation: an existing student who opens another
 *       invitation and signs in has the invitation claimed automatically.
 *   5.  Mobile navigation: the nav toggle actually opens the sidebar.
 *
 * Opt-in like browser-dom-check.mjs: jsdom is deliberately not an application
 * dependency. Install it in a scratch directory and point NODE_PATH at it:
 *
 *   mkdir -p /tmp/browser && cd /tmp/browser && npm i jsdom
 *   npm run build
 *   npx wrangler pages dev dist --port 8788 &      # local D1, .dev.vars creds
 *   NODE_PATH=/tmp/browser/node_modules node scripts/cgm-browser-check.mjs
 *
 * Uses only data it creates itself (names prefixed "Browser Check").
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

const api = async (method, endpoint, body, token) => {
  const response = await fetch(`${BASE}${endpoint}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'cf-connecting-ip': `203.0.113.${Math.floor(Math.random() * 200) + 1}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let json = null; try { json = JSON.parse(text); } catch { /* non-JSON */ }
  return { status: response.status, json, text };
};

// ---------------------------------------------------------------------------
// Fixture: two active classes, rosters, invitations, automatic policies.
// ---------------------------------------------------------------------------
const phantom = await api('POST', '/api/auth/login', { identifier: EMAIL, password: PASSWORD });
const phantomToken = phantom.json?.token || phantom.json?.data?.token;
if (!phantomToken) { console.log('FAIL — PHANTOM could not sign in; is the preview running with .dev.vars?'); process.exit(1); }

const stamp = Date.now().toString(36);
await api('PUT', '/api/cgm/phantom/policies', { policies: [
  { key: 'student_registration_mode', value: 'auto' },
  { key: 'membership_request_mode', value: 'auto' },
  { key: 'class_creation_mode', value: 'approval' },
] }, phantomToken);

const makeClass = async (name) => {
  const created = await api('POST', '/api/cgm/classes', { name, institution: 'Browser Check University' }, phantomToken);
  const classId = created.json?.data?.classId ?? created.json?.data?.id;
  const code = created.json?.data?.code;
  await api('POST', `/api/cgm/classes/${classId}/submit`, {}, phantomToken);
  await api('POST', `/api/cgm/phantom/classes/${classId}/approve`, {}, phantomToken);
  return { classId, code };
};
const classA = await makeClass(`Browser Check Pharmacy Lab ${stamp}`);
const classB = await makeClass(`Browser Check Second ${stamp}`);
for (const entry of [classA, classB]) {
  await api('POST', `/api/cgm/classes/${entry.classId}/entry-password`, { entryPassword: 'browser-entry' }, phantomToken);
}
const studentIndex = `BRW-${stamp}-001`;
const rosterCsv = ['Full Name,Index Number', `Browser One,${studentIndex}`].join('\n');
const rosterForm = new FormData();
rosterForm.append('file', new File([rosterCsv], 'roster.csv', { type: 'text/csv' }));
rosterForm.append('mapping', JSON.stringify({ full_name: 'Full Name', index_number: 'Index Number' }));
rosterForm.append('policy', 'skip');
const rosterImport = await fetch(`${BASE}/api/cgm/classes/${classA.classId}/roster/import`, {
  method: 'POST', headers: { Authorization: `Bearer ${phantomToken}` }, body: rosterForm,
});
if (!rosterImport.ok) { console.log('FAIL — roster import for the browser fixture failed'); process.exit(1); }
const inviteA = (await api('POST', `/api/cgm/classes/${classA.classId}/invitations`, { kind: 'general', maxUses: 5 }, phantomToken)).json?.data?.code;
const inviteB = (await api('POST', `/api/cgm/classes/${classB.classId}/invitations`, { kind: 'general', maxUses: 5 }, phantomToken)).json?.data?.code;

// ---------------------------------------------------------------------------
// jsdom boot of the shipped bundle (same pattern as browser-dom-check.mjs).
// ---------------------------------------------------------------------------
const boot = async (address, { memberToken = null, memberUser = null, studentSession = null } = {}) => {
  const pageUrl = `${BASE}/${address}`;
  const html = await (await fetch(pageUrl)).text();
  const bundle = /<script type="module"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!bundle) { console.log('FAIL — the shipped page carries no application bundle'); process.exit(1); }
  const appFile = path.join(os.tmpdir(), `code-rx-cgm-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
  fs.writeFileSync(appFile, bundle[1]);

  const virtualConsole = new VirtualConsole();
  const jsdomErrors = [];
  virtualConsole.on('jsdomError', (error) => jsdomErrors.push(String(error?.message || error).slice(0, 200)));
  const dom = new JSDOM(html, { url: pageUrl, pretendToBeVisual: true, virtualConsole });
  const { window } = dom;

  // NOTE: AbortController/AbortSignal deliberately come from the WINDOW — the
  // app passes signals to window event listeners, and jsdom cannot convert
  // Node's signal implementations.
  const keep = new Set(['window', 'document', 'self', 'globalThis', 'fetch', 'crypto', 'location', 'navigator',
    'console', 'queueMicrotask', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance',
    'structuredClone', 'MessageChannel', 'MessagePort', 'Blob', 'File', 'FormData', 'Headers', 'Request',
    'Response', 'URL', 'URLSearchParams', 'TextEncoder', 'TextDecoder']);
  for (const key of Object.getOwnPropertyNames(window)) {
    if (keep.has(key)) continue;
    try { Object.defineProperty(globalThis, key, { value: window[key], configurable: true, writable: true }); } catch { /* frozen global */ }
  }
  const nodeFetch = globalThis.__codeRxNodeFetch || globalThis.fetch;
  globalThis.__codeRxNodeFetch = nodeFetch;
  // Every page-driven request carries its own visitor IP, exactly like real
  // browsers do — otherwise the per-IP throttles treat the whole journey as
  // one visitor and refuse the third registration.
  let visitorSeq = Math.floor(Math.random() * 200);
  const localFetch = (input, init) => {
    const headers = new Headers((typeof init === 'object' && init) ? init.headers : undefined);
    headers.set('cf-connecting-ip', `203.0.113.${(visitorSeq = (visitorSeq + 1) % 250) + 1}`);
    return nodeFetch(new URL(typeof input === 'string' ? input : input.url, pageUrl), { ...(typeof init === 'object' && init ? init : {}), headers });
  };
  window.fetch = localFetch;
  globalThis.fetch = localFetch;
  window.matchMedia = window.matchMedia || (() => ({ matches: false, media: '', onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } }));
  window.ResizeObserver = window.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} };
  window.IntersectionObserver = window.IntersectionObserver || class { observe() {} unobserve() {} disconnect() {} };
  window.scrollTo = () => {};
  window.alert = () => {};
  if (memberToken) window.localStorage.setItem('codeRx_token', memberToken);
  if (memberUser) window.localStorage.setItem('codeRx_user', JSON.stringify(memberUser));
  if (studentSession) window.localStorage.setItem('codeRx_cgmStudentSession', JSON.stringify(studentSession));
  globalThis.window = window;
  globalThis.document = window.document;

  await import(appFile);

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const body = () => window.document.body.textContent.replace(/\s+/g, ' ').trim();
  for (let attempt = 0; attempt < 60 && body().length < 40; attempt += 1) await wait(250);

  const waitFor = async (pattern, timeoutMs = 15_000) => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const found = pattern instanceof RegExp ? pattern.test(body()) : body().includes(pattern);
      if (found) return true;
      if (Date.now() > deadline) return false;
      await wait(250);
    }
  };
  const inputByLabel = (labelText) => {
    const label = [...window.document.querySelectorAll('label')].find((el) => el.textContent.replace(/\s+/g, ' ').trim().startsWith(labelText));
    return label ? window.document.getElementById(label.getAttribute('for') || '') : null;
  };
  const setNativeValue = (el, value) => {
    const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new window.Event('input', { bubbles: true }));
  };
  const buttonByText = (text, scope = window.document) =>
    [...scope.querySelectorAll('button')].find((el) => el.textContent.replace(/\s+/g, ' ').trim().includes(text));
  const submitButtonByText = (text, scope = window.document) =>
    [...scope.querySelectorAll('button[type="submit"]')].find((el) => el.textContent.replace(/\s+/g, ' ').trim().includes(text));
  const waitForElement = async (el, timeoutMs = 10_000) => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const found = typeof el === 'function' ? el() : el;
      if (found) return found;
      if (Date.now() > deadline) return null;
      await wait(250);
    }
  };

  return { window, body, wait, waitFor, waitForFor: waitFor, jsdomErrors, inputByLabel, setNativeValue, buttonByText, submitButtonByText, waitForElement };
};

/**
 * Picks an activity in the workspace picker. The picker only carries the
 * activities the class list has already returned, so a select made before the
 * options arrive silently keeps the empty value — wait for the option itself.
 */
const chooseActivity = async (page, activityId, timeoutMs = 25_000) => {
  const select = await page.waitForElement(() => {
    const element = page.window.document.querySelector('select[aria-label="Choose activity"]');
    if (!element) return null;
    return [...element.options].some((option) => option.value === String(activityId)) ? element : null;
  }, timeoutMs);
  if (!select) return false;
  Object.getOwnPropertyDescriptor(page.window.HTMLSelectElement.prototype, 'value').set.call(select, String(activityId));
  select.dispatchEvent(new page.window.Event('change', { bubbles: true }));
  return true;
};

/** Switches the workspace to a class before touching its activities. */
const switchClass = async (page, classId, timeoutMs = 20_000) => {
  const select = await page.waitForElement(
    () => page.window.document.querySelector('select[aria-label="Switch class"]'), timeoutMs);
  if (!select) return false;
  Object.getOwnPropertyDescriptor(page.window.HTMLSelectElement.prototype, 'value').set.call(select, String(classId));
  select.dispatchEvent(new page.window.Event('change', { bubbles: true }));
  return true;
};

// ---------------------------------------------------------------------------
// 1. Organizer workspace: My Classes + class creation through the UI
// ---------------------------------------------------------------------------
{
  const page = await boot('#class-groups', { memberToken: phantomToken, memberUser: { name: 'PHANTOM', email: EMAIL } });
  check('workspace boots with the My Classes navigation', await page.waitForFor('My Classes'));
  const classesNav = page.buttonByText('My Classes');
  classesNav && classesNav.click();
  check('an organizer with classes still has a create affordance', await page.waitForFor('tap a card to open it') && Boolean(page.buttonByText('New class')));
  page.buttonByText('New class').click();
  const nameInput = await page.waitForElement(() => page.inputByLabel('Class name *'));
  const draftName = `Browser Check UI Draft ${stamp}`;
  page.setNativeValue(nameInput, draftName);
  page.setNativeValue(page.inputByLabel('Institution *'), 'Browser Check University');
  page.buttonByText('Create draft').click();
  check('a class draft can be created through the UI', await page.waitForFor(draftName, 20_000));
}

// ---------------------------------------------------------------------------
// 2. PHANTOM oversight: approve the draft + module settings save
// ---------------------------------------------------------------------------
{
  const page = await boot('#class-groups/phantom', { memberToken: phantomToken, memberUser: { name: 'PHANTOM', email: EMAIL } });
  check('PHANTOM oversight boots', await page.waitForFor('PHANTOM'));
  // The Control Center hosts the class & groups oversight as its own tab.
  const cgTab = await page.waitForElement(() => page.buttonByText('Class Groups'));
  cgTab && cgTab.click();
  check('the Class Groups oversight opens inside the Control Center', await page.waitForFor('Module settings', 20_000));
  const approvalsTab = await page.waitForElement(() => page.buttonByText('Class approvals'));
  approvalsTab && approvalsTab.click();
  check('the UI-created draft reaches the Class approvals queue', await page.waitForFor(`Browser Check UI Draft ${stamp}`, 20_000));
  // The UI-created class is still a draft (creation policy = approval): the
  // override path is exactly how PHANTOM acts on it without a submission.
  const approveButton = await page.waitForElement(() => page.buttonByText('Submit &amp; approve (override)') || page.buttonByText('Submit & approve (override)'));
  approveButton && approveButton.click();
  const approveDebug = () => {
    const html = page.window.document.body.innerHTML;
    const at = html.indexOf(`Browser Check UI Draft ${stamp}`);
    const alert = page.window.document.querySelector('[role="status"]');
    return `status=${alert?.textContent || 'none'} ctx=${at >= 0 ? html.slice(at, at + 300).replace(/<[^>]*>/g, ' ') : 'draft-row-gone'}`;
  };
  check('PHANTOM approves the draft through the UI (override)',
    await page.waitForFor(/approved \(override\) — invitations can go live/, 20_000), approveDebug());

  const settingsTab = page.buttonByText('Module settings');
  settingsTab && settingsTab.click();
  check('the module settings console lists every process', await page.waitForFor('Profile changes'));
  const autoToggle = [...page.window.document.querySelectorAll('[role="radio"]')].find((el) => el.textContent.includes('Automatic — passkey issued at once'));
  autoToggle && autoToggle.click();
  const saveButton = await page.waitForElement(() => page.buttonByText('Save module settings'));
  saveButton && saveButton.click();
  check('changing a policy reports success', await page.waitForFor('Module settings saved', 20_000));
}

// ---------------------------------------------------------------------------
// 2b. PHANTOM attention: a number on every section, cleared the moment it is
//     opened — and the same event already sitting in the notice feed
// ---------------------------------------------------------------------------
{
  // A submission is a decision waiting on PHANTOM, so it must arrive as news.
  const badgeClassName = `Browser Check Badge ${stamp}`;
  const badgeCreated = await api('POST', '/api/cgm/classes', { name: badgeClassName, institution: 'Browser Check University' }, phantomToken);
  const badgeClassId = Number(badgeCreated.json?.data?.classId || 0);
  await api('POST', `/api/cgm/classes/${badgeClassId}/entry-password`, { entryPassword: 'badge-entry' }, phantomToken);
  await api('POST', `/api/cgm/classes/${badgeClassId}/submit`, {}, phantomToken);

  const feed = (await api('GET', '/api/phantom/inbox', undefined, phantomToken)).json?.data || {};
  const cgChannel = (feed.channels || []).find((channel) => channel.key === 'class_groups');
  check('a class submission lands in the Class & Groups notice channel',
    Boolean(cgChannel) && Number(cgChannel.unread) >= 1 && (feed.groups?.class_groups || []).some((item) => String(item.title).includes('Class awaiting approval')),
    JSON.stringify(cgChannel || {}));

  const boardBefore = (await api('GET', '/api/cgm/phantom/attention', undefined, phantomToken)).json?.data || {};
  const classesTabBefore = (boardBefore.tabs || []).find((tab) => tab.key === 'classes') || {};
  check('the attention board lists every section with a number',
    (boardBefore.tabs || []).length === 12 && (boardBefore.tabs || []).every((tab) => Number.isInteger(tab.unseen)),
    JSON.stringify((boardBefore.tabs || []).map((tab) => tab.key)));
  check('the new submission is counted as unseen work on the Class approvals tab',
    Number(classesTabBefore.unseen) >= 1 && Number(classesTabBefore.pending) >= 1, JSON.stringify(classesTabBefore));

  const page = await boot('#class-groups/phantom', { memberToken: phantomToken, memberUser: { name: 'PHANTOM', email: EMAIL } });
  await page.waitForFor('PHANTOM');
  const cgTab = await page.waitForElement(() => page.buttonByText('Class Groups'));
  cgTab && cgTab.click();
  await page.waitForFor('Module settings', 20_000);

  const badgeOf = () => page.window.document.querySelector('[data-testid="phantom-tab-badge-classes"]');
  const badgeEl = await page.waitForElement(badgeOf, 20_000);
  check('the Class approvals tab itself carries that number',
    Boolean(badgeEl) && Number(String(badgeEl.textContent).trim()) === Number(classesTabBefore.unseen),
    `badge=${badgeEl ? badgeEl.textContent : 'missing'} api=${classesTabBefore.unseen}`);

  const approvalsTab = await page.waitForElement(() => page.buttonByText('Class approvals'));
  approvalsTab && approvalsTab.click();
  check('opening the section shows the work it was counting', await page.waitForFor(badgeClassName, 20_000));
  const clearedInUi = await page.waitForElement(() => !badgeOf(), 20_000);
  check('the number disappears once PHANTOM has viewed the section', Boolean(clearedInUi));

  const boardAfter = (await api('GET', '/api/cgm/phantom/attention', undefined, phantomToken)).json?.data || {};
  const classesTabAfter = (boardAfter.tabs || []).find((tab) => tab.key === 'classes') || {};
  check('the server agrees: nothing new on that tab, the decisions are still waiting',
    Number(classesTabAfter.unseen) === 0 && Number(classesTabAfter.pending) >= 1,
    JSON.stringify(classesTabAfter));
  check('a viewed section keeps a marker for the work it still owes PHANTOM',
    Boolean(page.window.document.querySelector('[data-testid="phantom-tab-waiting-classes"]')));

  // Clearing one section must never clear another.
  const otherTabs = (boardAfter.tabs || []).filter((tab) => tab.key !== 'classes' && Number(tab.unseen) > 0);
  check('clearing Class approvals left the other tabs\' numbers alone',
    otherTabs.every((tab) => Number(tab.unseen) > 0),
    JSON.stringify(otherTabs.map((tab) => [tab.key, tab.unseen])));
}

// ---------------------------------------------------------------------------
// 2b2. The control-center navigation carries the same numbers — the sum of the
//      Class Groups sections, and it falls when PHANTOM opens one of them
// ---------------------------------------------------------------------------
{
  const page = await boot('#class-groups/phantom', { memberToken: phantomToken, memberUser: { name: 'PHANTOM', email: EMAIL } });
  await page.waitForFor('PHANTOM');

  const navBoard = (await api('GET', '/api/phantom/attention', undefined, phantomToken)).json?.data || {};
  const navSectionOf = (board, key) => (board.sections || []).find((entry) => entry.key === key) || {};
  const navBadge = () => page.window.document.querySelector('[data-testid="phantom-nav-badge-classgroups"]');
  const navBadgeEl = await page.waitForElement(navBadge, 20_000);
  check('the Class Groups tab carries the sum of its sections',
    Boolean(navBadgeEl) && Number(String(navBadgeEl.textContent).trim()) === Number(navSectionOf(navBoard, 'classgroups').unseen || 0),
    `badge=${navBadgeEl ? String(navBadgeEl.textContent).trim() : 'missing'} api=${navSectionOf(navBoard, 'classgroups').unseen}`);
  check('that sum is not a number of its own: it is every oversight section added up',
    Number(navSectionOf(navBoard, 'classgroups').unseen) >= 1
    && Number(navSectionOf(navBoard, 'classgroups').unseen) === Number(navBoard.classGroupsUnseen)
    && Number(navSectionOf(navBoard, 'overview').unseen) >= Number(navSectionOf(navBoard, 'classgroups').unseen),
    JSON.stringify((navBoard.sections || []).map((entry) => [entry.key, entry.unseen])));

  // Open the panel, then open the section that owes the most news.
  const cgNav = await page.waitForElement(() => page.window.document.querySelector('[data-testid="phantom-nav-classgroups"]'), 20_000);
  cgNav && cgNav.click();
  await page.waitForFor('Class & Group Management oversight', 20_000);

  const cgmBoard = (await api('GET', '/api/cgm/phantom/attention', undefined, phantomToken)).json?.data || {};
  const targetTab = (cgmBoard.tabs || []).find((entry) => Number(entry.unseen) > 0 && entry.key !== 'overview');
  const before = Number(navSectionOf(navBoard, 'classgroups').unseen || 0);
  const expected = before - Number(targetTab?.unseen || 0);
  const sectionButton = targetTab ? await page.waitForElement(() => page.buttonByText(targetTab.label), 20_000) : null;
  check('a section with news can be opened from inside the tab', Boolean(targetTab) && Boolean(sectionButton),
    `target=${targetTab?.label || 'none'}`);
  sectionButton && sectionButton.click();

  const droppedTo = await page.waitForElement(() => {
    const badge = navBadge();
    if (expected > 0) return badge && Number(String(badge.textContent).trim()) === expected ? badge : null;
    return !badge ? page.window.document.body : null;
  }, 20_000);
  check('opening that section takes its number off the Class Groups tab',
    Boolean(droppedTo),
    `expected=${expected} badge=${navBadge() ? String(navBadge().textContent).trim() : 'gone'} target=${targetTab?.label || 'none'} unseen=${targetTab?.unseen ?? 'none'}`);

  // And the server agrees with what the sidebar is showing.
  const navAfter = (await api('GET', '/api/phantom/attention', undefined, phantomToken)).json?.data || {};
  check('the server agrees: the sum fell by exactly that section',
    Number(navSectionOf(navAfter, 'classgroups').unseen) === expected
    && (expected > 0
      ? Number(String(navBadge()?.textContent || '').trim()) === expected
      : !navBadge()),
    `api=${navSectionOf(navAfter, 'classgroups').unseen} badge=${navBadge() ? String(navBadge().textContent).trim() : 'gone'}`);
}

// ---------------------------------------------------------------------------
// 2b2b. The bundle the browser actually receives carries the election fixes,
//       and the service worker can no longer pin an old build in the cache
// ---------------------------------------------------------------------------
{
  const shell = await (await fetch(`${BASE}/`)).text();
  check('the served bundle carries the ALL/CUSTOMIZE fixes, not an older build',
    shell.includes('goes on the ballot') && shell.includes('hand-picked member')
    && shell.includes('Recycle Bin'));
  const worker = await (await fetch(`${BASE}/sw.js`)).text();
  check('the served service worker takes the app shell from the network first',
    worker.includes('const isShell = request.mode === \'navigate\'')
    && /if \(isShell\) \{\s*event\.respondWith\(\s*fetch\(request\)/.test(worker));
  check('and its cache name is versioned past the stale one',
    /const CACHE = 'code-rx-v(\d+)'/.exec(worker) !== null
    && Number(/const CACHE = 'code-rx-v(\d+)'/.exec(worker)[1]) >= 8);
}

// ---------------------------------------------------------------------------
// 2b3. The organizer workspace carries a Recycle Bin, and an election record
//      can be deleted from the page into it
// ---------------------------------------------------------------------------
{
  const organizerToken = (await api('POST', '/api/auth/login', { identifier: EMAIL, password: PASSWORD })).json?.token;
  const page = await boot('#class-groups', { memberToken: organizerToken, memberUser: { name: 'PHANTOM', email: EMAIL } });
  await page.waitForFor('Class & Group Management', 20_000);
  const binLink = await page.waitForElement(() => page.buttonByText('Recycle Bin'), 20_000);
  check('the organizer navigation has a Recycle Bin', Boolean(binLink));
  binLink && binLink.click();
  const area = await page.waitForElement(() => page.window.document.querySelector('[data-testid="cgm-recycle-area"]'), 20_000);
  check('it opens the real bin, with the promise that deletes are reversible',
    Boolean(area) && /Restoring puts the records back exactly as/.test(page.body()));
}

// ---------------------------------------------------------------------------
// 2c. Moves & swaps: PHANTOM decides membership changes, and a decision stays
//     on the record after it is granted
// ---------------------------------------------------------------------------
{
  // The queue is part of the oversight panel, with the policy that governs it
  // exposed in the same place.
  const page = await boot('#class-groups/phantom', { memberToken: phantomToken, memberUser: { name: 'PHANTOM', email: EMAIL } });
  await page.waitForFor('PHANTOM');
  const cgTab = await page.waitForElement(() => page.buttonByText('Class Groups'));
  cgTab && cgTab.click();
  await page.waitForFor('Module settings', 20_000);
  const movesTab = await page.waitForElement(() => page.buttonByText('Moves & swaps'));
  check('the oversight panel has a Moves & swaps section', Boolean(movesTab));
  // A crowded panel: one chip for the whole queue, and the strip scrolls
  // instead of stacking a dozen pills over the content.
  const boardForChip = (await api('GET', '/api/cgm/phantom/attention', undefined, phantomToken)).json?.data || {};
  const chip = page.window.document.querySelector('[data-testid="phantom-queue-chip"]');
  check('a crowded panel keeps one chip with the work still waiting',
    Boolean(chip) && String(chip.textContent).trim() === `Queues (${Number(boardForChip.totalPending || 0)})`,
    `chip=${chip ? String(chip.textContent).trim() : 'missing'} api=${boardForChip.totalPending}`);
  const tabStrip = page.window.document.querySelector('[data-testid="phantom-tabstrip"]');
  check('the section strip is a scrollable rail instead of a wall of chips',
    Boolean(tabStrip) && String(tabStrip.className).includes('overflow-x-auto')
    && tabStrip.querySelectorAll('[data-testid^="phantom-tab-"]').length >= 12,
    tabStrip ? String(tabStrip.className) : 'missing');
  chip && chip.click();
  const activeQueue = await page.waitForElement(() => [...page.window.document.querySelectorAll('[data-testid]')]
    .find((el) => /^phantom-tab-[a-z-]+$/.test(String(el.getAttribute('data-testid')))
      && String(el.className).includes('bg-emerald-600')), 10_000);
  check('the chip opens the first queue that has work waiting', Boolean(activeQueue),
    `active=${activeQueue ? activeQueue.getAttribute('data-testid') : 'none'}`);

  movesTab && movesTab.click();
  check('opening it lists what organizers asked to move (empty state is honest)',
    await page.waitForFor('No membership-change requests yet.', 20_000), page.body().slice(0, 200));

  const settingsTab = page.buttonByText('Module settings');
  settingsTab && settingsTab.click();
  check('the module settings offer the choice PHANTOM asked for: moves wait, or apply at once',
    await page.waitForFor('Moving & swapping members', 20_000)
    && await page.waitForFor('Wait for PHANTOM approval', 5_000),
    page.body().slice(0, 200));

  // The audit trail must read as facts, never as "target — #—".
  const auditTab = await page.waitForElement(() => page.buttonByText('Audit trail'));
  auditTab && auditTab.click();
  await page.waitForFor('cgm', 20_000);
  const auditDashes = /·\s*target\s*—\s*#—/.test(page.body());
  check('the audit trail names its actor and target instead of printing dashes', !auditDashes,
    page.body().slice(0, 260));
  const auditRows = [...page.window.document.querySelectorAll('[data-testid="cgm-phantom-list-reveal"]')];
  check('a long audit trail is cut to the latest five with one "view more" control',
    auditRows.length === 0 || (await page.waitForFor('View more', 5_000)),
    auditRows.length ? 'reveal control shown' : 'trail shorter than five');
  if (auditRows.length) {
    auditRows[0].click();
    check('"view more" reveals the rest and offers the way back', await page.waitForFor('Show fewer', 5_000), page.body().slice(0, 200));
  }

}

// ---------------------------------------------------------------------------
// 3. Student: invitation landing → registration → one-time passkey → dashboard
// ---------------------------------------------------------------------------
let savedPasskey = '';
{
  const page = await boot(`#class-invite/${encodeURIComponent(inviteA)}`);
  check('the invitation banner shows the invited class', await page.waitForFor('You are invited') && await page.waitForFor('Browser Check Pharmacy Lab'));
  const classCodeInput = page.window.document.getElementById('cgm-class-code');
  check('registration opens with the class code prefilled', Boolean(classCodeInput) && classCodeInput.value === classA.code, String(classCodeInput?.value));
  page.setNativeValue(await page.waitForElement(() => page.inputByLabel('Your index number')), studentIndex);
  page.setNativeValue(page.inputByLabel('Shared class entry password'), 'browser-entry');
  page.buttonByText('Submit registration').click();
  const registerDebug = () => {
    const text = page.body();
    const at = text.indexOf('Shared class entry password');
    return `${page.window.document.querySelector('[role="alert"]')?.textContent || 'no-alert'} | form=${at >= 0 ? text.slice(at, at + 220) : 'gone'}`;
  };
  check('the permanent passkey opens its own reveal page (not an inline box under the form)',
    await page.waitForFor('shown only on this page', 40_000) && await page.waitForFor(/rx30[a-z]+/, 5_000), registerDebug());
  check('the register form is gone while the passkey page is up',
    !page.body().includes('Shared class entry password'), 'form still visible?');
  const revealCandidates = [...page.window.document.querySelectorAll('[data-testid="cgm-passkey-reveal"], div')]
    .filter((el) => el.textContent.includes('shown only on this page') && el.textContent.includes('cannot be re-issued'))
    .sort((a, b) => a.textContent.length - b.textContent.length);
  const revealBox = revealCandidates[0];
  savedPasskey = (revealBox?.textContent.match(/rx30[a-z]+/) || [''])[0];
  // The value is read from the innermost reveal box (never the header's
  // "looks like rx30a, rx30b" example text) and must be a well-formed key.
  check('the captured passkey is the real issued key from the reveal box',
    Boolean(revealBox) && /^rx30[a-z]+$/.test(savedPasskey), `captured=${savedPasskey} boxFound=${Boolean(revealBox)}`);
  check('the reveal page lists the details on file for the student',
    page.body().includes('Your details on file') && page.body().includes('Full name'), 'details missing');
  check('the student is not handed the dashboard before confirming the passkey was saved',
    Boolean(page.buttonByText('I have saved my passkey — continue')));
  const continueButton = page.buttonByText('I have saved my passkey — continue');
  page.buttonByText('I have saved my passkey — continue')?.click();
  check('the student dashboard opens after the confirmation',
    await page.waitForFor('CODE Rx Student Portal', 30_000), `errs=${page.jsdomErrors.slice(0, 3).join(' | ') || 'none'} body=${page.body().slice(0, 160)}`);
  check('the dashboard lists the joined class', await page.waitForFor('Browser Check Pharmacy Lab', 20_000));
  check('the student portal wears the CGP logo and keeps the zoom lock',
    Boolean(page.window.document.querySelector('img[src="/CGP.jpg"]'))
    && String(page.window.document.querySelector('meta[name="viewport"]')?.getAttribute('content') || '').includes('user-scalable=no'));
  check('the welcome board carries the unique Continue-to-groups CTA and a distinctive class door',
    Boolean(page.window.document.querySelector('[data-testid="cgm-continue-groups"]'))
    && Boolean(page.window.document.querySelector('[data-testid="cgm-class-nav-card"]')),
    page.body().slice(0, 160));
  const continueGroups = page.window.document.querySelector('[data-testid="cgm-continue-groups"]');
  continueGroups && continueGroups.click();
  check('Continue to choose group opens My Groups directly (the activity picker)',
    await page.waitForFor('Open an activity', 20_000), page.body().slice(0, 160));

  // 5. Mobile navigation: the toggle opens the sidebar.
  const toggle = page.window.document.querySelector('[aria-label="Toggle navigation"]');
  const before = toggle?.getAttribute('aria-expanded');
  toggle && toggle.click();
  await page.wait(400);
  check('mobile navigation toggle opens the sidebar', toggle && before === 'false' && toggle.getAttribute('aria-expanded') === 'true', `aria-expanded ${before} → ${toggle?.getAttribute('aria-expanded')}`);
  // Clicking ANYWHERE else closes it — the whole page is a dismiss target.
  const elsewhere = page.window.document.querySelector('main') || page.window.document.body;
  const down = new page.window.MouseEvent('pointerdown', { bubbles: true });
  elsewhere.dispatchEvent(down);
  await page.wait(300);
  check('clicking anywhere outside closes the student hamburger',
    toggle?.getAttribute('aria-expanded') === 'false', `aria-expanded ${toggle?.getAttribute('aria-expanded')}`);
  // …and the toggle itself still toggles (it is not swallowed by the dismiss).
  toggle && toggle.click();
  await page.wait(200);
  check('the hamburger itself still toggles after dismissing elsewhere',
    toggle?.getAttribute('aria-expanded') === 'true', `aria-expanded ${toggle?.getAttribute('aria-expanded')}`);
}

// ---------------------------------------------------------------------------
// 4. Invitation continuation: existing student signs in, invitation auto-claims
// ---------------------------------------------------------------------------
{
  const page = await boot(`#class-invite/${encodeURIComponent(inviteB)}`);
  await page.waitForFor('You are invited');
  const signInTab = await page.waitForElement(() => page.buttonByText('Sign in'));
  signInTab && signInTab.click();
  page.setNativeValue(await page.waitForElement(() => page.inputByLabel('Index number')), studentIndex);
  page.setNativeValue(page.inputByLabel('Permanent passkey'), savedPasskey);
  const signInSubmit = await page.waitForElement(() => page.submitButtonByText('Sign in'));
  signInSubmit && signInSubmit.click();
  const joinDebug = () => `${page.window.document.querySelector('[role="alert"]')?.textContent || 'no-alert'} | notice=${page.body().includes('Welcome —') ? 'yes' : 'no'} top=${page.body().slice(0, 130)}`;
  check('an existing student signs in and the invitation continues automatically',
    await page.waitForFor('Welcome — you have joined the class.', 40_000), joinDebug());
  check('the newly joined class appears on the dashboard',
    await page.waitForFor('Browser Check Second', 20_000), page.body().slice(page.body().indexOf('CODE Rx Student Portal'), page.body().indexOf('CODE Rx Student Portal') + 300));
  // Login status now survives browser restarts: the session lives in localStorage.
  check('the student login status is saved for the next visit (localStorage session)',
    Boolean(page.window.localStorage.getItem('codeRx_cgmStudentSession')),
    String(page.window.localStorage.getItem('codeRx_cgmStudentSession') || 'absent').slice(0, 80));
  check('the signed-in student sees their elections view from the portal navigation',
    (() => { const electionsNav = page.buttonByText('My Elections'); electionsNav && electionsNav.click(); return Boolean(electionsNav); })()
    && await page.waitForFor('My elections', 20_000), page.body().slice(0, 200));
}

// ---------------------------------------------------------------------------
// 7. The voting link + sign-out affordances
// ---------------------------------------------------------------------------
{
  // An organizer's voting link opens the student portal; after signing in the
  // student lands straight on that ballot (here: an unknown id still proves
  // the route boots the portal rather than the member workspace).
  const page = await boot('#student-vote/424242');
  check('a voting link boots the student portal sign-in', await page.waitForFor('Class & Group Management') && Boolean(page.inputByLabel('Permanent passkey')), page.body().slice(0, 160));
  const organizerPage = await boot('#class-groups', { memberToken: phantomToken, memberUser: { name: 'PHANTOM', email: EMAIL } });
  check('the organizer workspace shows the Sign out button', await organizerPage.waitForFor('Sign out'), organizerPage.body().slice(0, 200));
}

// ---------------------------------------------------------------------------
// 8. The per-group workspace: a group card click opens the full group page
// ---------------------------------------------------------------------------
let wsActivityId = null;
let wsClass = null;
{
  wsClass = await makeClass(`Browser Check Group WS ${stamp}`);
  const wsActivity = await api('POST', `/api/cgm/classes/${wsClass.classId}/activities`, {
    name: `Browser Check Pods ${stamp}`, type: 'tutorial',
    config: { method: 'random', groupCount: 3, capacity: 10, genderRule: 'none', repeatRule: 'random', leaderMethod: 'appointment', overflow: 'waitlist', announcementMode: 'direct', whatsappEnabled: true, attendanceEnabled: true, electionAnonymity: 'anonymous', allowVoteChange: false, tieBreak: 'random', eligibility: 'all' },
  }, phantomToken);
  wsActivityId = wsActivity.json?.data?.activityId ?? wsActivity.json?.data?.id;
  await api('POST', `/api/cgm/activities/${wsActivityId}/lifecycle`, { action: 'publish' }, phantomToken);
  await api('POST', `/api/cgm/classes/${wsClass.classId}/entry-password`, { entryPassword: 'rechoose-entry' }, phantomToken);

  const page = await boot('#class-groups', { memberToken: phantomToken, memberUser: { name: 'PHANTOM', email: EMAIL } });
  // Be explicit about BOTH pickers — the fixture's class first, then its own
  // activity — so the board can never be read off a different class.
  await switchClass(page, wsClass.classId);
  const groupsNav = page.buttonByText('Groups');
  groupsNav && groupsNav.click();
  check('the organizer reaches the Groups page', await page.waitForFor('Choose an activity', 20_000));
  const choseActivity = await chooseActivity(page, wsActivityId);
  check('the planned groups appear after publishing (defined at publish time)',
    choseActivity && await page.waitForFor('Group 1', 20_000) && await page.waitForFor('Group 3', 5_000),
    `chose=${choseActivity} body=${page.body().slice(0, 160)}`);
  // The board is a status board: each card is the group name plus its seat
  // count — no member lists — and the whole card opens the workspace.
  const boardCards = [...page.window.document.querySelectorAll('[data-testid="cgm-groups-board"] [data-testid="cgm-open-group"]')];
  check('the group board shows seat counts only — no member names on the board',
    boardCards.length >= 3
    && /\d+\/\d+|\d+\/∞/.test(boardCards[0].textContent)
    && !/Move…/.test(boardCards[0].textContent) && !/Swap…/.test(boardCards[0].textContent)
    && !boardCards.some((card) => /Browser One/.test(card.textContent)),
    `cards=${boardCards.length} first="${String(boardCards[0]?.textContent || '').trim().slice(0, 90)}"`);
  const groupCard = boardCards.find((el) => el.textContent.includes('Group 1')) || boardCards[0];
  groupCard && groupCard.click();
  check('clicking a group opens its dedicated workspace with every management section',
    await page.waitForFor('Back to groups', 20_000)
    && await page.waitForFor('WhatsApp group', 5_000)
    && await page.waitForFor('Recent history', 5_000)
    && await page.waitForFor('Leadership', 5_000)
    && await page.waitForFor('Notify members directly', 5_000),
    page.body().slice(0, 200));
  check('the CGP logo marks the organizer topbar and the viewport is zoom-locked',
    Boolean(page.window.document.querySelector('img[src="/CGP.jpg"]'))
    && String(page.window.document.querySelector('meta[name="viewport"]')?.getAttribute('content') || '').includes('user-scalable=no'),
    `viewport=${String(page.window.document.querySelector('meta[name="viewport"]')?.getAttribute('content') || 'none')}`);
  const sideNav = page.window.document.querySelector('nav[aria-label="Workspace navigation"]');
  check('entering a group auto-collapses the main Overview/Classes nav so the group hamburger leads',
    Boolean(sideNav) && sideNav.className.includes('cgm-sidenav--collapsed'),
    String(sideNav?.className || 'no nav'));
  const menuButton = page.window.document.querySelector('[data-testid="cgm-workspace-menu"]');
  menuButton && menuButton.click();
  check('the hamburger opens the workspace drawer listing all nine sections',
    await page.waitForFor('Workspace overview', 10_000)
    && await page.waitForFor('Every recorded change for this group', 5_000)
    && await page.waitForFor('Direct message into every member', 5_000),
    page.body().slice(0, 200));
  const drawerEl = page.window.document.querySelector('[data-testid="cgm-workspace-drawer"]');
  check('the sections drawer overlays from the LEFT edge', Boolean(drawerEl) && /(^| )left-0( |$)/.test(drawerEl.className) && !/right-0/.test(drawerEl.className), String(drawerEl?.className || 'no drawer'));
  const historyJump = page.window.document.querySelector('[data-testid="cgm-section-jump-history"]');
  historyJump && historyJump.click();
  check('a section opens as its own full page with a way back to the overview',
    await page.waitForFor('The audit trail of everything that happened here', 10_000)
    && Boolean(page.window.document.querySelector('[data-testid="cgm-section-page-history"]'))
    && Boolean(page.window.document.querySelector('[data-testid="cgm-section-back"]')),
    page.body().slice(0, 200));
  const sectionBack = page.window.document.querySelector('[data-testid="cgm-section-back"]');
  sectionBack && sectionBack.click();
  await page.waitForFor('Members (', 10_000);
  const sheetToggle = page.window.document.querySelector('[data-testid="cgm-member-sheet"]');
  sheetToggle && sheetToggle.click();
  check('the member sheet panel opens with field choices, the topic toggle, AOB and print/PNG/PDF outputs',
    await page.waitForFor('Member sheet — choose what to include', 10_000)
    && await page.waitForFor('Feature the group topic on the sheet', 5_000)
    && await page.waitForFor('AOB / other business (this sheet only)', 5_000)
    && await page.waitForFor('Download PNG', 5_000)
    && await page.waitForFor('Download PDF', 5_000),
    page.body().slice(0, 200));
  const topicToggle = page.window.document.querySelector('[data-testid="cgm-sheet-topic-toggle"]');
  check('the topic toggle defaults to ON', Boolean(topicToggle) && topicToggle.checked === true);
  const aobBox = page.window.document.querySelector('#cgm-aob');
  if (aobBox) {
    const taSetter = Object.getOwnPropertyDescriptor(page.window.HTMLTextAreaElement.prototype, 'value').set;
    taSetter.call(aobBox, 'Confirm lab coats before Friday');
    aobBox.dispatchEvent(new page.window.Event('input', { bubbles: true }));
  }
  // The agenda editor lives in Settings now; the sheet no longer prints it.
  const menuForSettings = page.window.document.querySelector('[data-testid="cgm-workspace-menu"]');
  menuForSettings && menuForSettings.click();
  await page.waitForFor('Workspace overview', 5_000);
  const settingsJump = page.window.document.querySelector('[data-testid="cgm-section-jump-settings"]');
  settingsJump && settingsJump.click();
  check('the Settings section page opens from the drawer with the identity facts grid',
    await page.waitForFor('Assignment method', 10_000) && await page.waitForFor('Capacity for THIS group', 5_000),
    page.body().slice(0, 200));
  const agendaBox = page.window.document.querySelector('#cgm-settings-agenda');
  if (agendaBox) {
    const taSetter2 = Object.getOwnPropertyDescriptor(page.window.HTMLTextAreaElement.prototype, 'value').set;
    taSetter2.call(agendaBox, '1. Review titration data');
    agendaBox.dispatchEvent(new page.window.Event('input', { bubbles: true }));
  }
  const saveAgenda = [...page.window.document.querySelectorAll('button')].find((el) => el.textContent.trim() === 'Save agenda');
  saveAgenda && saveAgenda.click();
  check('saving the group agenda from Settings confirms inside the workspace',
    await page.waitForFor('Agenda saved.', 15_000), page.body().slice(0, 200));
  const menuForSheet = page.window.document.querySelector('[data-testid="cgm-workspace-menu"]');
  menuForSheet && menuForSheet.click();
  await page.waitForFor('Workspace overview', 5_000);
  const sheetJump = page.window.document.querySelector('[data-testid="cgm-section-jump-sheet"]');
  sheetJump && sheetJump.click();
  await page.waitForFor('Member sheet — choose what to include', 10_000);
  const printBtn = [...page.window.document.querySelectorAll('button')].find((el) => el.textContent.trim() === 'Print');
  check('the sheet offers a working Print action with the renderer wired in', Boolean(printBtn) && typeof printBtn.click === 'function');
  const back = page.buttonByText('Back to groups');
  back && back.click();
  check('leaving the workspace returns to the group grid', await page.waitForFor('Create', 20_000) || await page.waitForFor('Choose an activity', 5_000));
  const sideNavAfter = page.window.document.querySelector('nav[aria-label="Workspace navigation"]');
  check('leaving the group restores the main nav', Boolean(sideNavAfter) && !sideNavAfter.className.includes('cgm-sidenav--collapsed'), String(sideNavAfter?.className || 'no nav'));

  // Small screen: the main nav is a drawer, and any click outside closes it.
  page.window.matchMedia = () => ({ matches: true, media: '(max-width: 860px)', onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } });
  const navToggle = page.window.document.querySelector('[data-testid="cgm-nav-toggle"]');
  navToggle && navToggle.click();
  await page.wait(300);
  const navDrawer = page.window.document.querySelector('nav[aria-label="Workspace navigation"]');
  check('the class & groups hamburger opens the navigation drawer on a small screen',
    Boolean(navDrawer) && navDrawer.className.includes('cgm-sidenav--open'), String(navDrawer?.className || 'no nav'));
  const outside = page.window.document.querySelector('main') || page.window.document.body;
  outside.dispatchEvent(new page.window.MouseEvent('pointerdown', { bubbles: true }));
  await page.wait(300);
  const navAfterDismiss = page.window.document.querySelector('nav[aria-label="Workspace navigation"]');
  check('clicking anywhere outside closes the class & groups hamburger',
    Boolean(navAfterDismiss) && !navAfterDismiss.className.includes('cgm-sidenav--open'), String(navAfterDismiss?.className || 'no nav'));
}

// ---------------------------------------------------------------------------
// Re-choose: the organizer asks inside the group, PHANTOM approves, and only
// then does the member start over. Driven entirely through the DOM.
// ---------------------------------------------------------------------------
{
  const organizer = { memberToken: phantomToken, memberUser: { name: 'PHANTOM', email: EMAIL } };
  let activityData = (await api('GET', `/api/cgm/activities/${wsActivityId}`, undefined, phantomToken)).json?.data || {};
  // The workspace fixture class starts empty — give it one member so the
  // organizer has somebody to ask to re-choose.
  if (!(activityData.unassigned || []).length) {
    const rcIndex = `BRW-${stamp}-RC`;
    await api('POST', `/api/cgm/classes/${wsClass.classId}/roster/entries`, { fullName: 'Rechoose Ria', indexNumber: rcIndex }, phantomToken);
    const registered = await fetch(`${BASE}/api/cgm/student/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.240' },
      body: JSON.stringify({ classCode: wsClass.code, indexNumber: rcIndex, entryPassword: 'rechoose-entry' }),
    });
    // Registrations wait for review under the default policy — approve it so
    // the identity becomes a real class member (this is the organizer's own
    // approve-permission path, the same one the UI uses).
    const queue = (await api('GET', `/api/cgm/classes/${wsClass.classId}/registrations`, undefined, phantomToken)).json?.data || [];
    const pendingRc = queue.find((row) => row.indexNumber === rcIndex);
    if (pendingRc) {
      await api('POST', `/api/cgm/classes/${wsClass.classId}/registrations/${pendingRc.id}/approve`, {}, phantomToken);
    }
    activityData = (await api('GET', `/api/cgm/activities/${wsActivityId}`, undefined, phantomToken)).json?.data || {};
    if (!(activityData.unassigned || []).length) {
      console.log(`  debug: register=${registered.status} queued=${Boolean(pendingRc)} members=${(activityData.members || []).length}`);
    }
  }
  const freeStudents = activityData.unassigned || [];
  const targetGroup = (activityData.groups || [])[0];
  if (!freeStudents.length || !targetGroup) {
    check('the re-choose fixture has a placeable member and a group', false,
      `unassigned=${freeStudents.length} groups=${(activityData.groups || []).length}`);
  } else {
    const placedStudent = freeStudents[0];
    const placed = await api('POST', `/api/cgm/activities/${wsActivityId}/assign-student`,
      { studentId: Number(placedStudent.id), groupId: Number(targetGroup.id) }, phantomToken);
    check('the re-choose fixture places a member in the first group', placed.status === 200, `status ${placed.status}`);

    const page = await boot('#class-groups', organizer);
    const groupsNav = page.buttonByText('Groups');
    groupsNav && groupsNav.click();
    await page.waitForFor('Choose an activity', 20_000);
    const chooser = page.window.document.querySelector('select[aria-label="Choose activity"]');
    const setter = Object.getOwnPropertyDescriptor(page.window.HTMLSelectElement.prototype, 'value').set;
    if (chooser) { setter.call(chooser, String(wsActivityId)); chooser.dispatchEvent(new page.window.Event('change', { bubbles: true })); }
    const card = await page.waitForElement(() => [...page.window.document.querySelectorAll('[data-testid="cgm-groups-board"] [data-testid="cgm-open-group"]')].find((el) => el.textContent.includes('Group 1')));
    card && card.click();
    const rechooseButton = await page.waitForElement(() => page.window.document.querySelector('[data-testid="cgm-rechoose-button"]'));
    check('the member row inside the group carries a working Re-choose button',
      Boolean(rechooseButton), page.body().slice(0, 160));
    rechooseButton && rechooseButton.click();
    const reasonBox = await page.waitForElement(() => page.window.document.querySelector('[id^="app-dialog-input-"]'));
    check('Re-choose opens the real dialog (the standalone workspaces now mount the dialog host)',
      Boolean(reasonBox) && /Ask .* to choose again\?/.test(page.body()),
      page.body().slice(0, 200));
    if (reasonBox) {
      const taSetter = Object.getOwnPropertyDescriptor(page.window.HTMLTextAreaElement.prototype, 'value').set;
      taSetter.call(reasonBox, 'Chosen before the roster settled');
      reasonBox.dispatchEvent(new page.window.Event('input', { bubbles: true }));
    }
    const sendToPhantom = await page.waitForElement(() => [...page.window.document.querySelectorAll('button')].find((el) => /Send to PHANTOM/i.test(el.textContent)));
    sendToPhantom && sendToPhantom.click();
    check('the request goes to pending and the row says it is awaiting PHANTOM',
      await page.waitForFor('Re-choose requested — waiting for PHANTOM approval', 20_000)
      && await page.waitForFor('Awaiting PHANTOM', 15_000),
      page.body().slice(0, 220));
    check('the member is still in the group while the request waits — nothing moved',
      Boolean(await api('GET', `/api/cgm/activities/${wsActivityId}/rechoose-requests`, undefined, phantomToken))
      && (await api('GET', `/api/cgm/activities/${wsActivityId}`, undefined, phantomToken)).json?.data?.members
        ?.some((row) => Number(row.id) === Number(placedStudent.id) && Number(row.group_id) === Number(targetGroup.id))
      && (await api('GET', `/api/cgm/activities/${wsActivityId}/rechoose-requests`, undefined, phantomToken)).json?.data
        ?.some((row) => Number(row.studentId) === Number(placedStudent.id) && row.status === 'pending'));

    // PHANTOM approves in its own console (Control Center → Class Groups).
    const phantomPage = await boot('#class-groups/phantom', organizer);
    const oversightTab = await phantomPage.waitForElement(() => phantomPage.buttonByText('Class Groups'));
    oversightTab && oversightTab.click();
    await phantomPage.waitForFor('Module settings', 20_000);
    const rechooseTab = await phantomPage.waitForElement(() => phantomPage.buttonByText('Re-choose requests'));
    rechooseTab && rechooseTab.click();
    const approve = await phantomPage.waitForElement(() => phantomPage.window.document.querySelector('[data-testid="cgm-phantom-approve-rechoose"]'));
    check('the pending request reaches the PHANTOM re-choose queue with a working Approve',
      Boolean(approve) && /choose a group again/.test(phantomPage.body()), phantomPage.body().slice(0, 200));
    approve && approve.click();
    check('PHANTOM approval confirms and the request leaves the pending queue',
      await phantomPage.waitForFor('may now choose a group again', 20_000)
      && (await api('GET', '/api/cgm/phantom/rechoose-requests', undefined, phantomToken)).json?.data
        ?.every((row) => Number(row.studentId) !== Number(placedStudent.id)),
      phantomPage.body().slice(0, 200));

    // Organizer reopens the group: the row now reports the approval.
    const reopened = await boot('#class-groups', organizer);
    const navAgain = reopened.buttonByText('Groups');
    navAgain && navAgain.click();
    await reopened.waitForFor('Choose an activity', 20_000);
    const chooser2 = reopened.window.document.querySelector('select[aria-label="Choose activity"]');
    if (chooser2) { setter.call(chooser2, String(wsActivityId)); chooser2.dispatchEvent(new reopened.window.Event('change', { bubbles: true })); }
    const card2 = await reopened.waitForElement(() => [...reopened.window.document.querySelectorAll('[data-testid="cgm-groups-board"] [data-testid="cgm-open-group"]')].find((el) => el.textContent.includes('Group 1')));
    card2 && card2.click();
    check('after approval the group shows the member released to choose again',
      await reopened.waitForFor('PHANTOM approved a fresh choice', 20_000)
      && Boolean(reopened.window.document.querySelector('[data-testid="cgm-rechoose-approved"]')),
      reopened.body().slice(0, 200));
  }
}


// ---------------------------------------------------------------------------
// Force Get: the organizer proposes a destination in the full-page workspace,
// PHANTOM approves it in its own console, and only then does the designated
// student's own draw land in that group. Every step is driven through the DOM.
// ---------------------------------------------------------------------------
{
  const organizer = { memberToken: phantomToken, memberUser: { name: 'PHANTOM', email: EMAIL } };
  const fgActivity = await api('POST', `/api/cgm/classes/${wsClass.classId}/activities`, {
    name: `Browser Check Force Get ${stamp}`, type: 'tutorial',
    config: { method: 'random', groupCount: 2, capacity: 5, genderRule: 'none', repeatRule: 'random', leaderMethod: 'appointment', overflow: 'waitlist', announcementMode: 'direct', whatsappEnabled: true, attendanceEnabled: true, electionAnonymity: 'anonymous', allowVoteChange: false, tieBreak: 'random', eligibility: 'all' },
  }, phantomToken);
  const fgActivityId = fgActivity.json?.data?.activityId ?? fgActivity.json?.data?.id;
  await api('POST', `/api/cgm/activities/${fgActivityId}/lifecycle`, { action: 'publish' }, phantomToken);

  // A member who has never sampled: their own draw must land on the approved group.
  const fgIndex = `BRW-${stamp}-FG`;
  await api('POST', `/api/cgm/classes/${wsClass.classId}/roster/entries`, { fullName: 'Force Faye', indexNumber: fgIndex }, phantomToken);
  const fgRegistered = await fetch(`${BASE}/api/cgm/student/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.231' },
    body: JSON.stringify({ classCode: wsClass.code, indexNumber: fgIndex, entryPassword: 'rechoose-entry' }),
  }).then((response) => response.json());
  const fgPasskey = String(fgRegistered?.data?.passkey || '');
  const fgQueue = (await api('GET', `/api/cgm/classes/${wsClass.classId}/registrations`, undefined, phantomToken)).json?.data || [];
  const fgPendingRegistration = fgQueue.find((row) => row.indexNumber === fgIndex);
  if (fgPendingRegistration) {
    await api('POST', `/api/cgm/classes/${wsClass.classId}/registrations/${fgPendingRegistration.id}/approve`, {}, phantomToken);
  }
  const fgLogin = await api('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: fgIndex, passkey: fgPasskey });
  const fgSession = fgLogin.json?.data?.session?.token;
  const fgStudentId = Number(fgLogin.json?.data?.student?.id || 0);
  const fgStudentDraw = () => fetch(`${BASE}/api/cgm/student/activities/${fgActivityId}/random-draw`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Code-Rx-Student-Session': String(fgSession) },
    body: JSON.stringify({}),
  }).then((response) => response.json());
  check('the Force Get fixture has a registered member and a live activity',
    Boolean(fgSession) && Boolean(fgActivityId), `session=${Boolean(fgSession)} activity=${Boolean(fgActivityId)}`);
  const fgApi = (await api('GET', `/api/cgm/activities/${fgActivityId}`, undefined, phantomToken)).json?.data || {};
  const fgGroupIds = (fgApi.groups || []).map((group) => Number(group.id));
  const fgGroupNames = (fgApi.groups || []).map((group) => String(group.name));
  const fgDestination = fgGroupIds[fgGroupIds.length - 1];

  const page = await boot('#class-groups', organizer);
  const groupsNav = page.buttonByText('Groups');
  groupsNav && groupsNav.click();
  await page.waitForFor('Choose an activity', 20_000);
  const chooser = page.window.document.querySelector('select[aria-label="Choose activity"]');
  const setter = Object.getOwnPropertyDescriptor(page.window.HTMLSelectElement.prototype, 'value').set;
  if (chooser) { setter.call(chooser, String(fgActivityId)); chooser.dispatchEvent(new page.window.Event('change', { bubbles: true })); }
  await page.waitForFor(fgGroupNames[0], 20_000);

  // 1. The button sits beside Assign Remaining.
  const assignButton = [...page.window.document.querySelectorAll('button')].find((el) => /Assign remaining/.test(el.textContent));
  const forceGetButton = page.window.document.querySelector('[data-testid="cgm-force-get-open"]');
  check('the Force Get button sits beside Assign Remaining on the Groups tab',
    Boolean(assignButton) && Boolean(forceGetButton) && assignButton.nextElementSibling === forceGetButton,
    `next=${String(assignButton?.nextElementSibling?.getAttribute('data-testid') || 'none')}`);

  // 2. It opens a dedicated full page, not a popup.
  forceGetButton && forceGetButton.click();
  const opened = await page.waitForElement(() => page.window.document.querySelector('[data-testid="cgm-force-get"]'), 20_000);
  check('clicking Force Get opens the dedicated full-page workspace',
    Boolean(opened) && await page.waitForFor(`Browser Check Force Get ${stamp}`, 15_000)
    && await page.waitForFor('Nothing moves until PHANTOM approves', 10_000),
    page.body().slice(0, 200));
  check('the workspace is a page of its own: the board and the group grid are gone',
    !page.window.document.querySelector('[data-testid="cgm-groups-board"]')
    && !page.window.document.querySelector('[role="dialog"]'),
    'no board/no dialog');

  // 3. The roster lists the real member with real destination names.
  const rows = () => [...page.window.document.querySelectorAll('[data-testid="cgm-force-get-row"]')];
  check('the roster lists the class member with a real group-name destination picker',
    rows().length >= 1 && rows().some((row) => /Force Faye/.test(row.textContent))
    && rows()[0].querySelector('[data-testid="cgm-force-get-group"]'),
    `rows=${rows().length}`);
  const destinationSelect = rows().find((row) => /Force Faye/.test(row.textContent))
    ?.querySelector('[data-testid="cgm-force-get-group"]');
  const options = [...(destinationSelect?.querySelectorAll('option') || [])].map((option) => option.textContent);
  check('the destination options are the activity\'s actual group names',
    fgGroupNames.every((name) => options.some((text) => text.includes(name))), options.join(' | ').slice(0, 120));

  // 4. Selection + bulk destination + preview.
  const forceFayeRow = rows().find((row) => /Force Faye/.test(row.textContent));
  const forceFayeCheckbox = forceFayeRow?.querySelector('[data-testid="cgm-force-get-select"]');
  forceFayeCheckbox && forceFayeCheckbox.click();
  await page.wait(200);
  const bulkSelect = page.window.document.querySelector('[data-testid="cgm-force-get-bulk-group"]');
  if (bulkSelect) { setter.call(bulkSelect, String(fgDestination)); bulkSelect.dispatchEvent(new page.window.Event('change', { bubbles: true })); }
  await page.wait(200);
  const bulkApply = page.window.document.querySelector('[data-testid="cgm-force-get-bulk-apply"]');
  bulkApply && bulkApply.click();
  await page.wait(300);
  const chosen = page.window.document.querySelector('[data-testid="cgm-force-get-row"] [data-testid="cgm-force-get-group"]');
  check('a bulk destination assigns the selected member a live proposed group',
    Number(chosen?.value) === Number(fgDestination), `value=${chosen?.value} expected=${fgDestination}`);
  const previewToggle = page.window.document.querySelector('[data-testid="cgm-force-get-preview-toggle"]');
  previewToggle && previewToggle.click();
  check('the preview shows the proposed distribution and the projected capacity',
    await page.waitForFor('Preview & send for approval', 10_000)
    && Boolean(page.window.document.querySelector('[data-testid="cgm-force-get-preview"]'))
    && /→/.test(page.body()) && /\d+ now → /.test(page.body().replace(/\s+/g, ' ')),
    page.body().slice(0, 220));

  // 5. Submit: it becomes a PENDING request, nothing moves.
  const explanationBox = page.window.document.querySelector('[data-testid="cgm-force-get-explanation"]');
  if (explanationBox) {
    const taSetter = Object.getOwnPropertyDescriptor(page.window.HTMLTextAreaElement.prototype, 'value').set;
    taSetter.call(explanationBox, 'Faye joined late — she must sit with her lab partner.');
    explanationBox.dispatchEvent(new page.window.Event('input', { bubbles: true }));
  }
  const submitButton = page.window.document.querySelector('[data-testid="cgm-force-get-submit"]');
  submitButton && submitButton.click();
  check('submitting reports the version sent to PHANTOM and that nothing moves yet',
    await page.waitForFor('sent to PHANTOM. Nothing moves until PHANTOM approves.', 20_000), page.body().slice(0, 220));
  check('the pending version is shown with its student count and a cancel control',
    Boolean(await page.waitForElement(() => page.window.document.querySelector('[data-testid="cgm-force-get-pending"]'), 10_000))
    && Boolean(page.window.document.querySelector('[data-testid="cgm-force-get-cancel"]')));
  const afterSubmit = (await api('GET', `/api/cgm/activities/${fgActivityId}`, undefined, phantomToken)).json?.data || {};
  check('nothing was assigned by submitting (the member is still unplaced)',
    (afterSubmit.members || []).every((row) => Number(row.id) !== fgStudentId || row.group_id === null || row.group_id === undefined),
    JSON.stringify((afterSubmit.members || []).filter((row) => Number(row.id) === fgStudentId)).slice(0, 160));
  const pendingQueue = (await api('GET', '/api/cgm/phantom/force-get/requests?status=pending', undefined, phantomToken)).json?.data || [];
  const pendingRequest = pendingQueue.find((row) => Number(row.activityId) === Number(fgActivityId));
  check('the request reached the PHANTOM queue with the organizer, class and count',
    Boolean(pendingRequest) && pendingRequest.studentCount === 1 && Boolean(pendingRequest.className),
    JSON.stringify(pendingRequest || {}).slice(0, 160));

  // 6. PHANTOM console: full detail, then approve.
  const phantomPage = await boot('#class-groups/phantom', organizer);
  const oversightTab = await phantomPage.waitForElement(() => phantomPage.buttonByText('Class Groups'));
  oversightTab && oversightTab.click();
  await phantomPage.waitForFor('Module settings', 20_000);
  const forceGetTab = await phantomPage.waitForElement(() => phantomPage.buttonByText('Force Get Requests'));
  check('PHANTOM has a Force Get Requests tab', Boolean(forceGetTab));
  forceGetTab && forceGetTab.click();
  check('the pending request is listed with the organizer and the explanation',
    await phantomPage.waitForFor(`Browser Check Force Get ${stamp}`, 20_000)
    && await phantomPage.waitForFor('must sit with her lab partner', 10_000),
    phantomPage.body().slice(0, 220));
  const detailButton = await phantomPage.waitForElement(() => phantomPage.window.document.querySelector('[data-testid="cgm-phantom-force-get-detail"]'));
  detailButton && detailButton.click();
  const panel = await phantomPage.waitForElement(() => phantomPage.window.document.querySelector('[data-testid="cgm-phantom-force-get-panel"]'), 15_000);
  check('the full detail panel shows current vs proposed, sampling state and capacity impact',
    Boolean(panel) && /now → \+/.test(phantomPage.body()) && /not sampled yet/.test(phantomPage.body()),
    phantomPage.body().slice(0, 240));
  const approveButton = await phantomPage.waitForElement(() => phantomPage.window.document.querySelector('[data-testid="cgm-phantom-approve-force-get"]'));
  check('the queue offers PHANTOM Approve and Reject-with-reason controls',
    Boolean(approveButton) && Boolean(phantomPage.window.document.querySelector('[data-testid="cgm-phantom-reject-force-get"]')));
  approveButton && approveButton.click();
  check('PHANTOM approval confirms and explains that the designations now hold seats',
    await phantomPage.waitForFor('Force Get v', 20_000) && await phantomPage.waitForFor('designations now reserve those seats', 10_000),
    phantomPage.body().slice(0, 220));

  // 7. Approval created a designation and still moved nobody.
  const afterApprove = (await api('GET', `/api/cgm/activities/${fgActivityId}`, undefined, phantomToken)).json?.data || {};
  const designatedGroup = (afterApprove.groups || []).find((group) => Number(group.id) === Number(fgDestination)) || {};
  check('approval reserves the seat without adding a member (nothing moved)',
    Number(designatedGroup.reserved) === 1 && Number(designatedGroup.size) === 0 && Number(designatedGroup.forced) === 0
    && (afterApprove.members || []).every((row) => Number(row.id) !== fgStudentId || row.group_id === null || row.group_id === undefined),
    JSON.stringify({ reserved: designatedGroup.reserved, size: designatedGroup.size }));

  // 8. The student still samples — and lands exactly in the approved group.
  const draw = await fgStudentDraw();
  check('the designated student still draws and lands in the approved group',
    draw?.success === true && Number(draw?.data?.groupId) === Number(fgDestination) && draw?.data?.designated === true,
    JSON.stringify(draw?.data || {}).slice(0, 160));
  const afterDraw = (await api('GET', `/api/cgm/activities/${fgActivityId}`, undefined, phantomToken)).json?.data || {};
  const filledGroup = (afterDraw.groups || []).find((group) => Number(group.id) === Number(fgDestination)) || {};
  check('the board now reads n/capacity with the forced subset counted separately',
    Number(filledGroup.size) === 1 && Number(filledGroup.forced) === 1 && Number(filledGroup.forced) <= Number(filledGroup.size)
    && Number(filledGroup.reserved) === 0,
    JSON.stringify(filledGroup).slice(0, 160));

  // 9. Reload the organizer board: the red bracket and the legend are rendered,
  //    and the group workspace badges the member as FORCED.
  const boardPage = await boot('#class-groups', organizer);
  const navAgain = boardPage.buttonByText('Groups');
  navAgain && navAgain.click();
  await boardPage.waitForFor('Choose an activity', 20_000);
  const chooser3 = boardPage.window.document.querySelector('select[aria-label="Choose activity"]');
  const setter3 = Object.getOwnPropertyDescriptor(boardPage.window.HTMLSelectElement.prototype, 'value').set;
  if (chooser3) { setter3.call(chooser3, String(fgActivityId)); chooser3.dispatchEvent(new boardPage.window.Event('change', { bubbles: true })); }
  await boardPage.waitForFor(fgGroupNames[0], 20_000);
  const forcedBadge = await boardPage.waitForElement(() => boardPage.window.document.querySelector('[data-testid="cgm-group-forced-count"]'));
  check('the board count shows the bracketed forced number in red (1/5 (1))',
    Boolean(forcedBadge) && forcedBadge.textContent.trim() === '(1)' && /text-red-600/.test(forcedBadge.className)
    && /1\/5/.test(boardPage.body()),
    `${forcedBadge?.textContent || 'none'} / ${boardPage.body().slice(0, 120)}`);
  check('a short legend explains the red bracket',
    Boolean(boardPage.window.document.querySelector('[data-testid="cgm-groups-legend"]'))
    && /organizer-forced members/.test(boardPage.body()));
  const groupCardAgain = [...boardPage.window.document.querySelectorAll('[data-testid="cgm-groups-board"] [data-testid="cgm-open-group"]')]
    .find((el) => el.textContent.includes(fgGroupNames[fgGroupIds.indexOf(fgDestination)]));
  groupCardAgain && groupCardAgain.click();
  check('the group workspace badges the forced member and shows who approved it',
    Boolean(await boardPage.waitForElement(() => boardPage.window.document.querySelector('[data-testid="cgm-member-forced"]'), 20_000))
    && await boardPage.waitForFor('Force Get →', 10_000)
    && await boardPage.waitForFor('applied', 10_000),
    boardPage.body().slice(0, 240));
  check('the group workspace summarises the approved designations for the organizer',
    Boolean(boardPage.window.document.querySelector('[data-testid="cgm-group-force-get"]'))
    && /students never see them here/.test(boardPage.body()));
  check('no student-facing payload leaks the organizer reasoning',
    !JSON.stringify((await api('GET', `/api/cgm/student/activities/${fgActivityId}`, undefined, fgSession)).json || {}).includes('lab partner'));
}

// ---------------------------------------------------------------------------
// Force Get gender separation, driven through the DOM: the organizer's preview
// refuses a proposal that would mix pools BEFORE it is sent, names the group and
// the students, and clears the moment the destination changes.
// ---------------------------------------------------------------------------
{
  const organizer = { memberToken: phantomToken, memberUser: { name: 'PHANTOM', email: EMAIL } };
  const poolConfig = {
    method: 'hybrid', groupCount: 2, capacity: 4, genderRule: 'separate', repeatRule: 'random',
    leaderMethod: 'appointment', overflow: 'waitlist', announcementMode: 'direct', whatsappEnabled: true,
    attendanceEnabled: true, electionAnonymity: 'anonymous', allowVoteChange: false, tieBreak: 'random', eligibility: 'all',
  };
  const poolActivity = await api('POST', `/api/cgm/classes/${wsClass.classId}/activities`, {
    name: `Browser Check Gender Pool ${stamp}`, type: 'tutorial', config: poolConfig,
  }, phantomToken);
  const poolActivityId = poolActivity.json?.data?.activityId ?? poolActivity.json?.data?.id;
  await api('POST', `/api/cgm/activities/${poolActivityId}/lifecycle`, { action: 'publish' }, phantomToken);

  // The gender is captured on the roster row and carried onto the student by
  // registration, so the organizer never needs a second edit.
  const addMember = async (fullName, indexNumber, gender) => {
    const entry = await api('POST', `/api/cgm/classes/${wsClass.classId}/roster/entries`,
      { fullName, indexNumber, gender }, phantomToken);
    const registered = await fetch(`${BASE}/api/cgm/student/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.240' },
      body: JSON.stringify({ classCode: wsClass.code, indexNumber, entryPassword: 'rechoose-entry' }),
    }).then((response) => response.json());
    const studentId = Number(registered?.data?.student?.id || 0);
    return { entryId: Number(entry.json?.data?.id || 0), studentId, gender };
  };
  const poolMia = await addMember('Pool Mia', `BRW-${stamp}-PM`, 'male');
  const poolFred = await addMember('Pool Fred', `BRW-${stamp}-PF`, 'female');
  const poolApi = (await api('GET', `/api/cgm/activities/${poolActivityId}`, undefined, phantomToken)).json?.data || {};
  const poolGroups = (poolApi.groups || []).map((group) => Number(group.id));
  check('the separated activity fixture has two members of different genders and real groups',
    Boolean(poolMia?.entryId) && Boolean(poolFred?.entryId) && poolGroups.length >= 2,
    `entries=${poolMia?.entryId}/${poolFred?.entryId} groups=${poolGroups.length} students=${poolMia?.studentId}/${poolFred?.studentId}`);

  const page = await boot('#class-groups', organizer);
  const nav = page.buttonByText('Groups');
  nav && nav.click();
  await page.waitForFor('Choose an activity', 20_000);
  const chooser = page.window.document.querySelector('select[aria-label="Choose activity"]');
  const setter = Object.getOwnPropertyDescriptor(page.window.HTMLSelectElement.prototype, 'value').set;
  if (chooser) { setter.call(chooser, String(poolActivityId)); chooser.dispatchEvent(new page.window.Event('change', { bubbles: true })); }
  await page.waitForFor('Browser Check Gender Pool', 20_000);
  const openButton = await page.waitForElement(() => page.window.document.querySelector('[data-testid="cgm-force-get-open"]'), 20_000);
  openButton && openButton.click();
  await page.waitForElement(() => page.window.document.querySelector('[data-testid="cgm-force-get"]'), 20_000);
  await page.waitForFor('Pool Mia', 15_000);

  const poolRows = () => [...page.window.document.querySelectorAll('[data-testid="cgm-force-get-row"]')];
  const rowFor = (name) => poolRows().find((row) => row.textContent.includes(name));
  const pick = (row, groupId) => {
    const select = row?.querySelector('[data-testid="cgm-force-get-group"]');
    if (!select) return;
    setter.call(select, String(groupId));
    select.dispatchEvent(new page.window.Event('change', { bubbles: true }));
  };
  rowFor('Pool Mia')?.querySelector('[data-testid="cgm-force-get-select"]')?.click();
  rowFor('Pool Fred')?.querySelector('[data-testid="cgm-force-get-select"]')?.click();
  await page.wait(200);
  pick(rowFor('Pool Mia'), poolGroups[0]);
  pick(rowFor('Pool Fred'), poolGroups[0]);
  await page.wait(300);
  const conflictBlock = await page.waitForElement(
    () => page.window.document.querySelector('[data-testid="cgm-force-get-gender-conflict"]'), 10_000);
  check('the preview refuses a mixed-gender destination and names the group, the pools and both students',
    Boolean(conflictBlock)
    && /Pool Mia|Pool Fred/.test(conflictBlock.textContent)
    && /male/.test(conflictBlock.textContent) && /female/.test(conflictBlock.textContent),
    conflictBlock?.textContent?.slice(0, 200) || page.body().slice(0, 200));
  const submitNow = page.window.document.querySelector('[data-testid="cgm-force-get-submit"]');
  check('submitting is blocked while the composition would mix pools', Boolean(submitNow) && submitNow.disabled,
    `disabled=${submitNow?.disabled}`);

  const previewToggle = page.window.document.querySelector('[data-testid="cgm-force-get-preview-toggle"]');
  previewToggle && previewToggle.click();
  await page.wait(200);
  check('the preview shows the live gender pools of each group before anything is sent',
    /Gender pools held now:/.test(page.body()), page.body().slice(0, 200));

  // Move one student to the other group: the conflict disappears and submit works.
  pick(rowFor('Pool Fred'), poolGroups[1]);
  await page.wait(300);
  const stillBlocked = page.window.document.querySelector('[data-testid="cgm-force-get-gender-conflict"]');
  const submitAfter = page.window.document.querySelector('[data-testid="cgm-force-get-submit"]');
  check('separating the destinations clears the conflict and re-enables submitting',
    !stillBlocked && Boolean(submitAfter) && !submitAfter.disabled,
    `blocked=${Boolean(stillBlocked)} disabled=${submitAfter?.disabled}`);
}

// ---------------------------------------------------------------------------
// Force Get covers the WHOLE roster: a person who is on the class roster but has
// never registered can be given a destination. The seat is held (capacity and
// gender included), and becomes their own designation when they register.
// ---------------------------------------------------------------------------
{
  const organizer = { memberToken: phantomToken, memberUser: { name: 'PHANTOM', email: EMAIL } };
  const rosterActivity = await api('POST', `/api/cgm/classes/${wsClass.classId}/activities`, {
    name: `Browser Check Roster Force ${stamp}`, type: 'tutorial',
    config: { method: 'random', groupCount: 2, capacity: 2, genderRule: 'none', repeatRule: 'random', leaderMethod: 'appointment', overflow: 'waitlist', announcementMode: 'direct', whatsappEnabled: true, attendanceEnabled: true, electionAnonymity: 'anonymous', allowVoteChange: false, tieBreak: 'random', eligibility: 'all' },
  }, phantomToken);
  const rosterActivityId = rosterActivity.json?.data?.activityId ?? rosterActivity.json?.data?.id;
  await api('POST', `/api/cgm/activities/${rosterActivityId}/lifecycle`, { action: 'publish' }, phantomToken);
  const rosterIndex = `BRW-${stamp}-UR`;
  const unregisteredEntry = await api('POST', `/api/cgm/classes/${wsClass.classId}/roster/entries`,
    { fullName: 'Unregistered Uma', indexNumber: rosterIndex, gender: 'female' }, phantomToken);
  const unregisteredEntryId = Number(unregisteredEntry.json?.data?.id || 0);
  const rosterApi = (await api('GET', `/api/cgm/activities/${rosterActivityId}`, undefined, phantomToken)).json?.data || {};
  const rosterGroupIds = (rosterApi.groups || []).map((group) => Number(group.id));

  const page = await boot('#class-groups', organizer);
  const groupsNav = page.buttonByText('Groups');
  groupsNav && groupsNav.click();
  await page.waitForFor('Choose an activity', 20_000);
  const chooser = page.window.document.querySelector('select[aria-label="Choose activity"]');
  const selectSetter = Object.getOwnPropertyDescriptor(page.window.HTMLSelectElement.prototype, 'value').set;
  if (chooser) {
    selectSetter.call(chooser, String(rosterActivityId));
    chooser.dispatchEvent(new page.window.Event('change', { bubbles: true }));
  }
  const openForceGet = await page.waitForElement(() => page.window.document.querySelector('[data-testid="cgm-force-get-open"]'), 20_000);
  openForceGet && openForceGet.click();
  await page.waitForElement(() => page.window.document.querySelector('[data-testid="cgm-force-get"]'), 20_000);

  const rowOf = (entryId) => [...page.window.document.querySelectorAll('[data-testid="cgm-force-get-unregistered-row"]')]
    .find((row) => Number(row.getAttribute('data-roster-entry-id')) === Number(entryId));
  const unregisteredRow = await page.waitForElement(() => rowOf(unregisteredEntryId), 20_000);
  check('the workspace lists a class-roster row that has not registered, marked NOT REGISTERED',
    Boolean(unregisteredRow) && /Unregistered Uma/.test(unregisteredRow.textContent || '')
    && /NOT REGISTERED/.test(unregisteredRow.textContent || '')
    && Boolean(unregisteredRow.querySelector('[data-testid="cgm-force-get-unregistered-group"]')),
    page.body().slice(0, 220));
  check('the page explains that the seat is held and becomes theirs when they register',
    /becomes their own designation/.test(page.body())
    && Boolean(page.window.document.querySelector('[data-testid="cgm-force-get-unregistered-note"]')));

  const entrySelect = rowOf(unregisteredEntryId)?.querySelector('[data-testid="cgm-force-get-unregistered-group"]');
  if (entrySelect) {
    selectSetter.call(entrySelect, String(rosterGroupIds[0]));
    entrySelect.dispatchEvent(new page.window.Event('change', { bubbles: true }));
  }
  await page.wait(150);
  const entryCheckbox = rowOf(unregisteredEntryId)?.querySelector('[data-testid="cgm-force-get-select"]');
  entryCheckbox && entryCheckbox.click();
  await page.wait(200);
  check('an unregistered row can be selected and given a destination like any member',
    Boolean(entryCheckbox?.checked) && Boolean(rowOf(unregisteredEntryId)?.querySelector('select')?.value),
    page.body().slice(0, 200));
  check('the live preview counts the unregistered student in the destination group',
    Boolean(page.window.document.querySelector('[data-testid="cgm-force-get-preview-toggle"]'))
    && /1 student\(s\) ready/.test(page.body().replace(/\s+/g, ' ')));

  const submitRoster = page.window.document.querySelector('[data-testid="cgm-force-get-submit"]');
  check('submitting is enabled for a request that only names an unregistered student',
    Boolean(submitRoster) && submitRoster.disabled === false);
  submitRoster && submitRoster.click();
  check('the request is sent to PHANTOM like any other version',
    await page.waitForFor('sent to PHANTOM. Nothing moves until PHANTOM approves.', 20_000), page.body().slice(0, 240));

  const rosterQueue = (await api('GET', '/api/cgm/phantom/force-get/requests?status=pending', undefined, phantomToken)).json?.data || [];
  const rosterRequest = rosterQueue.find((row) => Number(row.activityId) === Number(rosterActivityId));
  check('the PHANTOM queue counts the unregistered student in the request',
    Boolean(rosterRequest) && Number(rosterRequest.studentCount) === 1,
    JSON.stringify(rosterRequest || {}).slice(0, 160));
  const rosterDetail = (await api('GET', `/api/cgm/phantom/force-get/requests/${Number(rosterRequest?.id)}`, undefined, phantomToken)).json?.data || {};
  const rosterBucket = (rosterDetail.groups || []).find((bucket) => Number(bucket.groupId) === Number(rosterGroupIds[0])) || {};
  check('PHANTOM sees the unregistered row in the destination group, flagged as such',
    (rosterBucket.students || []).some((student) => Number(student.rosterEntryId) === unregisteredEntryId && student.unregistered === true),
    JSON.stringify(rosterBucket).slice(0, 200));

  const rosterApprove = await api('POST', `/api/cgm/phantom/force-get/requests/${Number(rosterRequest?.id)}/approve`,
    { version: Number(rosterRequest?.version) }, phantomToken);
  check('PHANTOM approval holds the seat instead of inventing an assignment', rosterApprove.status === 200,
    `status ${rosterApprove.status}`);
  const heldBoard = (await api('GET', `/api/cgm/activities/${rosterActivityId}`, undefined, phantomToken)).json?.data || {};
  const heldGroup = (heldBoard.groups || []).find((group) => Number(group.id) === Number(rosterGroupIds[0])) || {};
  check('the held seat shows as reserved with nobody added to the group',
    Number(heldGroup.reserved) === 1 && Number(heldGroup.size) === 0,
    JSON.stringify(heldGroup).slice(0, 160));

  // She registers: the held seat becomes her own designation, and she samples into it.
  const joinRegistration = await fetch(`${BASE}/api/cgm/student/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.246' },
    body: JSON.stringify({ classCode: wsClass.code, indexNumber: rosterIndex, entryPassword: 'rechoose-entry' }),
  }).then((response) => response.json());
  const joinQueue = (await api('GET', `/api/cgm/classes/${wsClass.classId}/registrations`, undefined, phantomToken)).json?.data || [];
  const joinPending = joinQueue.find((row) => row.indexNumber === rosterIndex);
  // The class may approve registrations automatically or through the organizer.
  const joinApproved = joinPending
    ? await api('POST', `/api/cgm/classes/${wsClass.classId}/registrations/${joinPending.id}/approve`, {}, phantomToken)
    : await Promise.resolve(null);
  const joinPasskey = String(joinApproved?.json?.data?.passkey || joinRegistration?.data?.passkey || '');
  const joinLogin = await api('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: rosterIndex, passkey: joinPasskey });
  const joinStudentId = Number(joinLogin.json?.data?.student?.id || 0);
  const joinRosterAfter = (await api('GET', `/api/cgm/activities/${rosterActivityId}/force-get`, undefined, phantomToken)).json?.data || {};
  check('registering converts the held seat into her own designation',
    joinStudentId > 0
    && Number(joinRosterAfter.unregisteredCount) === 0
    && (joinRosterAfter.students || []).some((student) => Number(student.id) === joinStudentId
      && student.designation && Number(student.designation.groupId) === Number(rosterGroupIds[0])),
    `pending=${Boolean(joinPending)} student=${joinStudentId} unregistered=${joinRosterAfter.unregisteredCount}`);
  const joinToken = joinLogin.json?.data?.session?.token;
  const joinDraw = await fetch(`${BASE}/api/cgm/student/activities/${rosterActivityId}/random-draw`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Code-Rx-Student-Session': String(joinToken) },
    body: JSON.stringify({}),
  }).then((response) => response.json());
  check('she still samples herself and lands in the seat that was held for her',
    joinDraw?.success === true && Number(joinDraw?.data?.groupId) === Number(rosterGroupIds[0]) && joinDraw?.data?.designated === true,
    JSON.stringify(joinDraw?.data || {}).slice(0, 160));
}

// ---------------------------------------------------------------------------
// A granted approval must stay on the record — same queue, marked APPROVED.
// ---------------------------------------------------------------------------
{
  // A decision that has been granted must still be readable afterwards.
  const fgQueue = (await api('GET', '/api/cgm/phantom/force-get/requests', undefined, phantomToken)).json?.data || [];
  const approvedRequest = fgQueue.find((row) => row.status === 'approved');
  check('an approved Force Get request is still returned by its queue', Boolean(approvedRequest),
    JSON.stringify(fgQueue.map((row) => row.status)).slice(0, 160));
  if (approvedRequest) {
    const second = await boot('#class-groups/phantom', { memberToken: phantomToken, memberUser: { name: 'PHANTOM', email: EMAIL } });
    await second.waitForFor('PHANTOM');
    const tab = await second.waitForElement(() => second.buttonByText('Class Groups'));
    tab && tab.click();
    await second.waitForFor('Module settings', 20_000);
    const fgTab = await second.waitForElement(() => second.buttonByText('Force Get Requests'));
    fgTab && fgTab.click();
    check('the approved request is still on the Force Get tab, marked APPROVED',
      await second.waitForFor(`Request #${approvedRequest.id}`, 20_000)
      && await second.waitForFor('APPROVED', 5_000),
      second.body().slice(0, 240));
    check('the decided row names who approved it', await second.waitForFor(/APPROVED by PHANTOM/, 5_000),
      second.body().slice(0, 240));
  }
}

// ---------------------------------------------------------------------------
// Forgot passkey, driven through the DOM from the SIGN-IN PAGE: request →
// organizer approval → the same page generates the new passkey → sign in works.
// ---------------------------------------------------------------------------
{
  const resetIndex = `BRW-${stamp}-RS`;
  await api('POST', `/api/cgm/classes/${wsClass.classId}/roster/entries`,
    { fullName: 'Reset Rana', indexNumber: resetIndex }, phantomToken);
  const resetRegistered = await fetch(`${BASE}/api/cgm/student/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.245' },
    body: JSON.stringify({ classCode: wsClass.code, indexNumber: resetIndex, entryPassword: 'rechoose-entry' }),
  }).then((response) => response.json());
  const resetOriginalPasskey = String(resetRegistered?.data?.passkey || '');

  const page = await boot('#class-groups/student');
  const resetOpen = await page.waitForElement(
    () => page.window.document.querySelector('[data-testid="cgm-student-passkey-reset-open"]'), 20_000);
  check('the sign-in page offers a Reset passkey control beside Sign in',
    Boolean(resetOpen) && /reset passkey/i.test(resetOpen.textContent || '')
    && Boolean(page.window.document.querySelector('form button[type="submit"]')),
    page.body().slice(0, 200));
  resetOpen && resetOpen.click();
  const panel = await page.waitForElement(
    () => page.window.document.querySelector('[data-testid="cgm-passkey-reset"]'), 15_000);
  check('it opens a reset panel that explains the organizer approves it first',
    Boolean(panel) && /organizer/i.test(page.body()) && /Generate new passkey/i.test(page.body()),
    page.body().slice(0, 240));

  const setValue = (selector, value) => {
    const field = page.window.document.querySelector(selector);
    if (!field) return false;
    const setter = Object.getOwnPropertyDescriptor(page.window.HTMLInputElement.prototype, 'value').set;
    setter.call(field, value);
    field.dispatchEvent(new page.window.Event('input', { bubbles: true }));
    return true;
  };
  const identifierField = await page.waitForElement(
    () => page.window.document.querySelector('[data-testid="cgm-passkey-reset-identifier"]'), 10_000);
  check('the reset form asks for the identifier, not the forgotten passkey',
    Boolean(identifierField) && !/passkey"/i.test(String(identifierField?.getAttribute('id'))));
  setValue('[data-testid="cgm-passkey-reset-identifier"]', resetIndex);
  await page.wait(150);
  const sendButton = page.window.document.querySelector('[data-testid="cgm-passkey-reset-send"]');
  sendButton && sendButton.click();
  const progress = await page.waitForElement(
    () => page.window.document.querySelector('[data-testid="cgm-passkey-reset-progress"]'), 20_000);
  const shownCode = page.window.document.querySelector('[data-testid="cgm-passkey-reset-code"]')?.textContent?.trim() || '';
  check('sending the request shows a one-time reset code and a waiting state',
    Boolean(progress) && /^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/.test(shownCode)
    && Boolean(page.window.document.querySelector('[data-testid="cgm-passkey-reset-status-pending"]')),
    `code=${shownCode || 'none'} ${page.body().slice(0, 160)}`);

  const pendingQueue = (await api('GET', `/api/cgm/classes/${wsClass.classId}/passkey-requests`, undefined, phantomToken)).json?.data || [];
  const resetRow = pendingQueue.find((row) => row.status === 'pending'
    && (row.requestedIdentifier === resetIndex || row.indexNumber === resetIndex));
  check('the request reached the organizer marked as coming from the sign-in page',
    Boolean(resetRow) && resetRow.source === 'login' && resetRow.requestedIdentifier === resetIndex,
    JSON.stringify(resetRow || {}).slice(0, 160));

  // Pressing Generate before approval must not hand out anything.
  const earlyGenerate = page.window.document.querySelector('[data-testid="cgm-passkey-reset-generate"]');
  earlyGenerate && earlyGenerate.click();
  await page.wait(600);
  check('pressing Generate before approval hands out no passkey',
    !page.window.document.querySelector('[data-testid="cgm-passkey-reset-issued"]')
    && Boolean(page.window.document.querySelector('[data-testid="cgm-passkey-reset-error"]')),
    page.body().slice(0, 200));

  const approved = await api('POST', `/api/cgm/classes/${wsClass.classId}/passkey-requests/${Number(resetRow?.id)}/approve`, {}, phantomToken);
  check('the organizer approves the reset', approved.status === 200, `status ${approved.status}`);
  await page.wait(300);
  const generateAgain = page.window.document.querySelector('[data-testid="cgm-passkey-reset-generate"]');
  generateAgain && generateAgain.click();
  const issued = await page.waitForElement(
    () => page.window.document.querySelector('[data-testid="cgm-passkey-reset-issued"]'), 20_000);
  const newPasskey = issued
    ? String(page.window.document.querySelector('[data-testid="cgm-passkey-reset-issued"] p.select-all')?.textContent || '').trim()
    : '';
  check('after approval the SAME sign-in page generates and shows the new passkey once',
    Boolean(issued) && Boolean(newPasskey) && newPasskey !== resetOriginalPasskey,
    `passkey=${newPasskey ? 'shown' : 'missing'} ${page.body().slice(0, 160)}`);

  const signInAgain = page.window.document.querySelector('[data-testid="cgm-passkey-reset-signin"]');
  signInAgain && signInAgain.click();
  await page.wait(300);
  const passkeyField = page.window.document.querySelector('#cgm-passkey');
  check('it returns to the sign-in form so the student can use the new passkey',
    Boolean(passkeyField) && String(page.window.document.querySelector('#cgm-identifier')?.value || '') === resetIndex,
    page.body().slice(0, 160));

  const newLogin = await api('POST', '/api/cgm/student/login', {
    identifierType: 'index_number', identifier: resetIndex, passkey: newPasskey,
  });
  const oldLogin = await api('POST', '/api/cgm/student/login', {
    identifierType: 'index_number', identifier: resetIndex, passkey: resetOriginalPasskey,
  });
  check('the new passkey signs in and the old one does not',
    newLogin.status === 200 && Boolean(newLogin.json?.data?.session?.token) && oldLogin.status === 400,
    `new=${newLogin.status} old=${oldLogin.status}`);
}

// ---------------------------------------------------------------------------
// 8b. Election records open a full page, and the phone ballot names everybody
// ---------------------------------------------------------------------------
let ballotElectionId = null;
let ballotStudent = null;
// Hoisted so the printed-record journey (8e) reuses this exact fixture rather
// than inventing a second, weaker one.
let ballotClassId = null;
let ballotActivityId = null;
let ballotTokens = [];
let ballotGroupSize = 0;
{
  const ballotClass = await makeClass(`Browser Check Zballot ${stamp}`);
  await api('POST', `/api/cgm/classes/${ballotClass.classId}/entry-password`, { entryPassword: 'ballot-entry' }, phantomToken);
  const ballotNames = ['Ama Ballot', 'Kofi Ballot', 'Yaa Ballot'];
  const ballotIndexes = ballotNames.map((_, position) => `BRW-${stamp}-V${position + 1}`);
  for (let i = 0; i < ballotNames.length; i += 1) {
    await api('POST', `/api/cgm/classes/${ballotClass.classId}/roster/entries`,
      { fullName: ballotNames[i], indexNumber: ballotIndexes[i] }, phantomToken);
  }
  const ballotActivity = await api('POST', `/api/cgm/classes/${ballotClass.classId}/activities`, {
    name: `Browser Check Ballot Pods ${stamp}`, type: 'tutorial',
    config: { method: 'random', groupCount: 1, capacity: 200, genderRule: 'none', repeatRule: 'random', leaderMethod: 'appointment', overflow: 'waitlist', announcementMode: 'direct', whatsappEnabled: true, attendanceEnabled: true, electionAnonymity: 'anonymous', allowVoteChange: false, tieBreak: 'random', eligibility: 'all' },
  }, phantomToken);
  ballotActivityId = ballotActivity.json?.data?.activityId ?? ballotActivity.json?.data?.id;
  ballotClassId = Number(ballotClass.classId);
  await api('POST', `/api/cgm/activities/${ballotActivityId}/lifecycle`, { action: 'publish' }, phantomToken);
  await api('POST', `/api/cgm/activities/${ballotActivityId}/groups`, { count: 1, capacity: 200 }, phantomToken);

  // Register the three roster students, then seat them in the single group.
  const ballotStudentTokens = [];
  for (let i = 0; i < ballotNames.length; i += 1) {
    const registered = await fetch(`${BASE}/api/cgm/student/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': `203.0.113.${150 + i}` },
      body: JSON.stringify({ classCode: ballotClass.code, indexNumber: ballotIndexes[i], entryPassword: 'ballot-entry' }),
    });
    const payload = await registered.json().catch(() => ({}));
    if (payload?.data?.session?.token) ballotStudentTokens.push(payload.data.session.token);
    if (payload?.data?.session?.token) ballotTokens.push(payload.data.session.token);
  }
  const ballotActivityData = (await api('GET', `/api/cgm/activities/${ballotActivityId}`, undefined, phantomToken)).json?.data || {};
  const ballotGroupId = Number((ballotActivityData.groups || [])[0]?.id || 0);
  for (const row of (ballotActivityData.unassigned || [])) {
    await api('POST', `/api/cgm/activities/${ballotActivityId}/assign-student`, { studentId: Number(row.id), groupId: ballotGroupId }, phantomToken);
  }
  ballotGroupSize = Number((ballotActivityData.groups || [])[0]?.size || 0) || (ballotActivityData.unassigned || []).length;
  const electionCreated = await api('POST', `/api/cgm/groups/${ballotGroupId}/elections`, {
    title: `Ballot page ${stamp}`, role: 'leader', anonymity: 'anonymous', visibility: 'group',
    allowVoteChange: false, tieBreak: 'random', eligibleMode: 'all',
  }, phantomToken);
  ballotElectionId = Number(electionCreated.json?.data?.electionId || 0);
  const opened = await api('POST', `/api/cgm/elections/${ballotElectionId}/open-voting`, {}, phantomToken);
  const ballotDetail = (await api('GET', `/api/cgm/elections/${ballotElectionId}`, undefined, phantomToken)).json?.data || {};
  check('the ballot fixture has a group election with every member on it',
    Boolean(ballotElectionId) && opened.status === 200 && (ballotDetail.candidates || []).length >= 3,
    `election=${ballotElectionId} open=${opened.status} candidates=${(ballotDetail.candidates || []).length}`);
  ballotStudent = { indexNumber: ballotIndexes[0] };

  // --- Organizer: the records list is rows, the record itself is a page ----
  const organizer = { memberToken: phantomToken, memberUser: { name: 'PHANTOM', email: EMAIL } };
  const page = await boot('#class-groups', organizer);
  await page.waitForFor('Class & Group Management', 20_000);
  const classSwitcher = await page.waitForElement(() => page.window.document.querySelector('select[aria-label="Switch class"]'));
  if (classSwitcher) {
    const setter = Object.getOwnPropertyDescriptor(page.window.HTMLSelectElement.prototype, 'value').set;
    setter.call(classSwitcher, String(ballotClass.classId));
    classSwitcher.dispatchEvent(new page.window.Event('change', { bubbles: true }));
  }
  await page.waitForFor('Organizer workspace', 5_000);
  const electionsNav = await page.waitForElement(() => page.buttonByText('Elections'));
  electionsNav && electionsNav.click();
  const chooser = await page.waitForElement(() => page.window.document.querySelector('select[aria-label="Choose activity"]'));
  check('the Elections page offers the activity picker', Boolean(chooser), page.body().slice(0, 160));
  if (chooser) {
    const setter = Object.getOwnPropertyDescriptor(page.window.HTMLSelectElement.prototype, 'value').set;
    setter.call(chooser, String(ballotActivityId));
    chooser.dispatchEvent(new page.window.Event('change', { bubbles: true }));
  }
  const recordRow = await page.waitForElement(() => page.window.document.querySelector(`[data-testid="cgm-election-record-${ballotElectionId}"]`), 20_000);
  check('an election record is one compact tappable row', Boolean(recordRow),
    page.body().slice(page.body().indexOf('Election records'), page.body().indexOf('Election records') + 220));
  check('the row does NOT dump the candidates inline (a name wall is not a record)',
    Boolean(recordRow) && !/Ama Ballot/.test(recordRow.textContent) && !/Kofi Ballot/.test(recordRow.textContent),
    String(recordRow?.textContent || '').slice(0, 160));
  recordRow && recordRow.click();
  const dossier = await page.waitForElement(() => page.window.document.querySelector(`[data-testid="cgm-election-dossier-${ballotElectionId}"]`), 20_000);
  check('clicking the row opens the record as a full page', Boolean(dossier) && Boolean(page.window.document.querySelector('[data-testid="cgm-election-page-back"]')),
    page.body().slice(0, 200));
  check('the full page shows the ballot with real names, turnout and the lifecycle',
    Boolean(dossier) && /Ama Ballot/.test(dossier.textContent) && /Turnout/.test(dossier.textContent)
    && Boolean(page.window.document.querySelector(`[data-testid="cgm-election-delete-${ballotElectionId}"]`)),
    String(dossier?.textContent || '').slice(0, 240));
  const backToRecords = page.window.document.querySelector('[data-testid="cgm-election-page-back"]');
  backToRecords && backToRecords.click();
  check('the record page has a way back to the records list',
    await page.waitForElement(() => page.window.document.querySelector(`[data-testid="cgm-election-record-${ballotElectionId}"]`), 10_000)
    && !page.window.document.querySelector('[data-testid="cgm-election-dossier-' + ballotElectionId + '"]'));

  // --- Student: the ballot names every candidate and votes in two taps -----
  // Registration returns its own session, so the ballot opens signed in.
  const studentToken = ballotStudentTokens[0] || null;
  check('the ballot fixture registered a signed-in student', Boolean(studentToken), `tokens=${ballotStudentTokens.length}`);
  const votePage = await boot(`#student-vote/${ballotElectionId}`, {
    studentSession: studentToken ? { token: studentToken, expiresAt: new Date(Date.now() + 86_400_000).toISOString() } : null,
  });
  const ballotIsUp = await votePage.waitForFor('Your ballot', 30_000);
  check('the voting link opens the ballot itself', ballotIsUp, votePage.body().slice(0, 200));
  const cards = [...votePage.window.document.querySelectorAll('[data-testid^="cgm-ballot-candidate-"]')];
  check('every candidate on the ballot carries a readable name (no blank rows)',
    cards.length >= 3 && cards.every((card) => {
      const label = String(card.textContent || '').replace(/\s+/g, ' ').trim();
      return /(Ama|Kofi|Yaa) Ballot/.test(label) && !/^Candidate \d/i.test(label);
    }),
    cards.map((card) => String(card.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40)).join(' | ').slice(0, 300));
  const confirmBar = votePage.window.document.querySelector('.cgm-ballot-bar');
  const castButton = confirmBar ? [...confirmBar.querySelectorAll('button')].find((el) => /Cast my vote/.test(el.textContent)) : null;
  check('the ballot confirms on a sticky bar that starts disabled until a choice is made',
    Boolean(confirmBar) && Boolean(castButton) && castButton.disabled
    && /No candidate picked yet/.test(confirmBar.textContent), String(confirmBar?.textContent || 'no bar').slice(0, 160));
  const pickCard = cards.find((card) => /Kofi Ballot/.test(card.textContent));
  pickCard && pickCard.click();
  await votePage.wait(300);
  const pickedBar = votePage.window.document.querySelector('.cgm-ballot-bar');
  const pickedButton = pickedBar ? [...pickedBar.querySelectorAll('button')].find((el) => /Cast my vote/.test(el.textContent)) : null;
  check('picking a candidate names them on the bar and arms the confirm button',
    Boolean(pickedButton) && pickedButton.disabled === false && /Kofi Ballot/.test(pickedBar.textContent),
    String(pickedBar?.textContent || 'no bar').slice(0, 160));
  check('the picked card shows its own selected state',
    Boolean(pickCard) && (pickCard.getAttribute('aria-checked') === 'true' || pickCard.className.includes('is-selected')),
    String(pickCard?.className || 'no card'));
  pickedButton && pickedButton.click();
  check('casting the vote confirms the choice and locks the ballot',
    await votePage.waitForFor(/Vote recorded for Kofi Ballot/, 30_000)
    && Boolean(votePage.window.document.querySelector('[data-testid="cgm-ballot-voted"]')),
    votePage.body().slice(0, 240));
}

// ---------------------------------------------------------------------------
// 8c. Passkey desk: the organizer tracks a passkey, issues one, and hands out a
//     one-time link that the student redeems — no approval, exactly once
// ---------------------------------------------------------------------------
{
  const deskClass = await makeClass(`Browser Check Pickey ${stamp}`);
  await api('POST', `/api/cgm/classes/${deskClass.classId}/entry-password`, { entryPassword: 'pickey-entry' }, phantomToken);
  const deskIndex = `BRW-${stamp}-PK`;
  await api('POST', `/api/cgm/classes/${deskClass.classId}/roster/entries`, { fullName: 'Pickey Peta', indexNumber: deskIndex }, phantomToken);
  const deskRegister = await fetch(`${BASE}/api/cgm/student/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.196' },
    body: JSON.stringify({ classCode: deskClass.code, indexNumber: deskIndex, entryPassword: 'pickey-entry' }),
  });
  const deskPayload = await deskRegister.json().catch(() => ({}));
  const deskPasskey = String(deskPayload?.data?.passkey || '');
  check('the passkey fixture registered a member with a real passkey', Boolean(deskPasskey), `status ${deskRegister.status}`);

  // --- The organizer opens the desk from the hamburger ----------------------
  const page = await boot('#class-groups', { memberToken: phantomToken, memberUser: { name: 'PHANTOM', email: EMAIL } });
  await page.waitForFor('Class & Group Management', 20_000);
  const switcher = await page.waitForElement(() => page.window.document.querySelector('select[aria-label="Switch class"]'));
  if (switcher) {
    const setter = Object.getOwnPropertyDescriptor(page.window.HTMLSelectElement.prototype, 'value').set;
    setter.call(switcher, String(deskClass.classId));
    switcher.dispatchEvent(new page.window.Event('change', { bubbles: true }));
  }
  const passkeysNav = await page.waitForElement(() => page.buttonByText('Passkeys'));
  check('the organizer hamburger carries a Passkeys page', Boolean(passkeysNav), page.body().slice(0, 200));
  passkeysNav && passkeysNav.click();
  const desk = await page.waitForElement(() => page.window.document.querySelector('[data-testid="cgm-passkey-desk"]'), 20_000);
  check('it opens the passkey desk with the class counts', Boolean(desk) && /Members/.test(page.body()) && /Live links/.test(page.body()),
    page.body().slice(0, 240));
  const memberRow = await page.waitForElement(() => [...page.window.document.querySelectorAll('[data-testid^="cgm-passkey-member-"]')]
    .find((el) => /Pickey Peta/.test(el.textContent)), 20_000);
  check('every member is one tappable row, with their passkey state and last sign-in',
    Boolean(memberRow) && /rx30/.test(memberRow.textContent) && /signed in/.test(memberRow.textContent),
    String(memberRow?.textContent || '').slice(0, 160));
  // --- The desk has its own search (76 members is not a browse list) -------
  const setField = (element, value) => {
    const setter = Object.getOwnPropertyDescriptor(page.window.HTMLInputElement.prototype, 'value').set;
    setter.call(element, value);
    element.dispatchEvent(new page.window.Event('input', { bubbles: true }));
  };
  const memberRows = () => [...page.window.document.querySelectorAll('[data-testid^="cgm-passkey-member-"]')]
    .filter((el) => /^\d+$/.test(String(el.getAttribute('data-testid')).replace('cgm-passkey-member-', '')));
  const searchInput = await page.waitForElement(() => page.window.document.querySelector('[data-testid="cgm-passkey-search-input"]'), 20_000);
  check('the passkey desk carries a search bar above the member list',
    Boolean(searchInput) && Boolean(page.window.document.querySelector('[data-testid="cgm-passkey-search-count"]')),
    page.body().slice(0, 200));

  setField(searchInput, 'Pickey');
  const searched = await page.waitForElement(() => (memberRows().length === 1 ? memberRows() : null), 10_000);
  check('typing a name narrows the desk to that one member',
    Boolean(searched) && /Pickey Peta/.test(String(searched[0].textContent || ''))
    && /1 of \d+ member/.test(page.body()),
    (searched || []).map((el) => String(el.textContent).slice(0, 50)).join(' | ').slice(0, 200));

  setField(searchInput, deskIndex);
  check('the index number finds the same member',
    await page.waitForElement(() => (memberRows().length === 1 ? memberRows() : null), 10_000) !== null,
    page.body().slice(0, 160));

  setField(searchInput, 'no-such-member-zzz');
  check('a search with no match says so plainly and offers the way out',
    await page.waitForFor('No member matches', 10_000)
    && Boolean(page.window.document.querySelector('[data-testid="cgm-passkey-search-empty"]'))
    && memberRows().length === 0,
    page.body().slice(0, 200));

  const clearSearch = await page.waitForElement(() => page.window.document.querySelector('[data-testid="cgm-passkey-search-clear"]'), 10_000);
  clearSearch && clearSearch.click();
  const restored = await page.waitForElement(() => {
    const input = page.window.document.querySelector('[data-testid="cgm-passkey-search-input"]');
    return input && input.value === '' && memberRows().length > 0 ? input : null;
  }, 10_000);
  check('clearing the search puts every member back', Boolean(restored),
    page.body().slice(0, 200));

  const memberRowNow = await page.waitForElement(() => memberRows().find((el) => /Pickey Peta/.test(el.textContent)), 10_000);
  memberRowNow && memberRowNow.click();
  const memberPage = await page.waitForElement(() => page.window.document.querySelector('[data-testid^="cgm-passkey-member-page-"]'), 20_000);
  check('tapping a member opens their own page with the full passkey state',
    Boolean(memberPage) && /Passkey state/.test(page.body()) && /Devices signed in/.test(page.body())
    && Boolean(page.window.document.querySelector('[data-testid="cgm-passkey-member-back"]')),
    page.body().slice(0, 240));

  // --- Issue a passkey on the spot -----------------------------------------
  const issueButton = page.window.document.querySelector('[data-testid="cgm-passkey-issue-now"]');
  issueButton && issueButton.click();
  const reasonBox = await page.waitForElement(() => page.window.document.querySelector('[id^="app-dialog-input-"]'), 10_000);
  check('issuing asks why first (the reason is recorded)', Boolean(reasonBox), page.body().slice(0, 200));
  if (reasonBox) {
    const setter = Object.getOwnPropertyDescriptor(page.window.HTMLTextAreaElement.prototype, 'value')?.set
      || Object.getOwnPropertyDescriptor(page.window.HTMLInputElement.prototype, 'value').set;
    setter.call(reasonBox, 'Card lost in the lab');
    reasonBox.dispatchEvent(new page.window.Event('input', { bubbles: true }));
    const confirm = [...page.window.document.querySelectorAll('button')].find((el) => /Issue new passkey/.test(el.textContent));
    confirm && confirm.click();
  }
  const issuedBox = await page.waitForElement(() => page.window.document.querySelector('[data-testid="cgm-passkey-issued-now"]'), 20_000);
  const issuedText = String(issuedBox?.textContent || '');
  check('the new passkey is shown once, with a copy control and the one-time warning',
    Boolean(issuedBox) && /rx30/.test(issuedText) && /Copy passkey/.test(issuedText) && /shown only now/.test(issuedText),
    issuedText.slice(0, 160));

  // --- A one-time link, used exactly once ----------------------------------
  const makeLink = page.window.document.querySelector('[data-testid="cgm-passkey-make-link"]');
  makeLink && makeLink.click();
  const linkBox = await page.waitForElement(() => page.window.document.querySelector('[data-testid="cgm-passkey-link-created"]'), 20_000);
  const linkText = String(linkBox?.textContent || '');
  const linkCode = (/code:\s*([A-Z0-9]{4}(?:-[A-Z0-9]{4}){3})/.exec(linkText) || [])[1] || '';
  check('the organizer gets a one-time link for that ONE member, with its code',
    Boolean(linkBox) && Boolean(linkCode) && /works once/.test(linkText)
    && /Copy link/.test(linkText),
    linkText.slice(0, 200));

  const linkPage = await boot(`#passkey-link/${linkCode}`);
  const ready = await linkPage.waitForFor('Generate my new passkey', 30_000);
  check('the student opens the link with no sign-in and sees it is theirs',
    ready && /Pickey Peta/.test(linkPage.body()) && /works once/.test(linkPage.body()),
    linkPage.body().slice(0, 240));
  const generate = await linkPage.waitForElement(() => linkPage.window.document.querySelector('[data-testid="cgm-passkey-link-generate"]'), 10_000);
  generate && generate.click();
  const issuedOnLink = await linkPage.waitForElement(() => linkPage.window.document.querySelector('[data-testid="cgm-passkey-link-issued"]'), 30_000);
  const newPasskey = String(issuedOnLink?.querySelector('[data-testid="cgm-passkey-link-passkey"]')?.textContent || '').trim();
  check('pressing the button generates a new passkey straight away — no approval step',
    Boolean(issuedOnLink) && /^rx30/.test(newPasskey) && /shown only now/.test(String(issuedOnLink.textContent || '')),
    `passkey=${newPasskey} body=${linkPage.body().slice(0, 160)}`);

  // The same link, opened again (a forwarded link, a second device): refused.
  const reuse = await boot(`#passkey-link/${linkCode}`);
  check('the link cannot be used a second time — reopening it says so',
    await reuse.waitForFor('This link was already used', 30_000) && !await reuse.waitForFor('Generate my new passkey', 2_000),
    reuse.body().slice(0, 200));
  const reuseApi = await api('POST', `/api/cgm/passkey-links/${linkCode}/redeem`, {});
  check('and the server refuses the second redemption too (409, nothing minted)',
    reuseApi.status === 409, `status ${reuseApi.status}`);

  // The new passkey really is the live one.
  const deskLogin = await api('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: deskIndex, passkey: newPasskey });
  check('the passkey from the one-time link signs the student in',
    deskLogin.status === 200 && Boolean(deskLogin.json?.data?.session?.token), `status ${deskLogin.status}`);

  // --- The organizer regulates the links ------------------------------------
  // A fresh organizer page: the student's journey above happened in other
  // tabs, so this is what an organizer reopening the desk actually sees.
  const deskAgain = await boot('#class-groups', { memberToken: phantomToken, memberUser: { name: 'PHANTOM', email: EMAIL } });
  await deskAgain.waitForFor('Class & Group Management', 20_000);
  const switcherAgain = await deskAgain.waitForElement(() => deskAgain.window.document.querySelector('select[aria-label="Switch class"]'));
  if (switcherAgain) {
    const setterAgain = Object.getOwnPropertyDescriptor(deskAgain.window.HTMLSelectElement.prototype, 'value').set;
    setterAgain.call(switcherAgain, String(deskClass.classId));
    switcherAgain.dispatchEvent(new deskAgain.window.Event('change', { bubbles: true }));
  }
  const passkeysAgain = await deskAgain.waitForElement(() => deskAgain.buttonByText('Passkeys'));
  passkeysAgain && passkeysAgain.click();
  await deskAgain.waitForElement(() => deskAgain.window.document.querySelector('[data-testid="cgm-passkey-desk"]'), 20_000);
  const linkRowsHere = () => [...deskAgain.window.document.querySelectorAll('[data-testid="cgm-passkey-links"] li')];
  const usedRow = await deskAgain.waitForElement(() => linkRowsHere().find((el) => /used/.test(el.textContent)) || null, 25_000);
  check('the links list shows each link with its real state (used, not "live")',
    Boolean(usedRow) && !/\blive\b/.test(String(usedRow.textContent))
    && !usedRow.querySelector('[data-testid^="cgm-passkey-link-revoke-"]'),
    String(usedRow?.textContent || deskAgain.body()).replace(/\s+/g, ' ').slice(0, 200));
  const historyPresent = await deskAgain.waitForFor('Passkey changes in this class', 10_000)
    && /One-time link created/.test(deskAgain.body()) && /Passkey issued by the organizer/.test(deskAgain.body());
  check('the class history names the real changes ("Passkey issued by the organizer", "One-time link created")',
    historyPresent, deskAgain.body().slice(0, 240));

  // A second link can be revoked before anyone uses it.
  const memberAgain = await deskAgain.waitForElement(() => [...deskAgain.window.document.querySelectorAll('[data-testid^="cgm-passkey-member-"]')]
    .find((el) => /Pickey Peta/.test(el.textContent)), 20_000);
  memberAgain && memberAgain.click();
  const makeLinkAgain = await deskAgain.waitForElement(() => deskAgain.window.document.querySelector('[data-testid="cgm-passkey-make-link"]'), 20_000);
  makeLinkAgain && makeLinkAgain.click();
  const secondBox = await deskAgain.waitForElement(() => deskAgain.window.document.querySelector('[data-testid="cgm-passkey-link-created"]'), 20_000);
  const secondCode = (/code:\s*([A-Z0-9]{4}(?:-[A-Z0-9]{4}){3})/.exec(String(secondBox?.textContent || '')) || [])[1] || '';
  const backAgain = await deskAgain.waitForElement(() => deskAgain.window.document.querySelector('[data-testid="cgm-passkey-member-back"]'), 10_000);
  backAgain && backAgain.click();
  const revokeButton = await deskAgain.waitForElement(() => deskAgain.window.document.querySelector('[data-testid^="cgm-passkey-link-revoke-"]'), 20_000);
  check('a link nobody has used yet offers a Revoke control', Boolean(secondCode) && Boolean(revokeButton),
    deskAgain.body().slice(0, 240));
  revokeButton && revokeButton.click();
  const reasonInput = await deskAgain.waitForElement(() => deskAgain.window.document.querySelector('[id^="app-dialog-input-"]'), 15_000);
  if (reasonInput) {
    const areaSetter = Object.getOwnPropertyDescriptor(deskAgain.window.HTMLTextAreaElement.prototype, 'value')?.set
      || Object.getOwnPropertyDescriptor(deskAgain.window.HTMLInputElement.prototype, 'value').set;
    areaSetter.call(reasonInput, 'Handed to the wrong person');
    reasonInput.dispatchEvent(new deskAgain.window.Event('input', { bubbles: true }));
  }
  const revokeConfirm = await deskAgain.waitForElement(() => [...deskAgain.window.document.querySelectorAll('button')]
    .find((el) => /Revoke link/.test(el.textContent)), 15_000);
  revokeConfirm && revokeConfirm.click();
  const revokedRow = await deskAgain.waitForElement(() => linkRowsHere().find((el) => /revoked/.test(el.textContent)) || null, 25_000);
  check('the revoked link reads revoked in the desk, with the reason recorded',
    Boolean(revokedRow) && /Handed to the wrong person/.test(String(revokedRow.textContent)),
    String(revokedRow?.textContent || deskAgain.body()).replace(/\s+/g, ' ').slice(0, 220));
  const revokedRedeem = await api('POST', `/api/cgm/passkey-links/${secondCode}/redeem`, {});
  check('a revoked link cannot mint a passkey (410, nothing issued)',
    revokedRedeem.status === 410, `status ${revokedRedeem.status}`);
}

// ---------------------------------------------------------------------------
// 8d. The Random Group Selection reveal owns the whole screen: portalled to
//     <body>, a FIXED backdrop that cannot scroll away, the page behind frozen
//     — and the result panel brought into view when the draw lands
// ---------------------------------------------------------------------------
{
  const revealClass = await makeClass(`Browser Check Reveal ${stamp}`);
  await api('POST', `/api/cgm/classes/${revealClass.classId}/entry-password`, { entryPassword: 'reveal-entry' }, phantomToken);
  const revealIndex = `BRW-${stamp}-RVL`;
  await api('POST', `/api/cgm/classes/${revealClass.classId}/roster/entries`, { fullName: 'Reveal Rita', indexNumber: revealIndex }, phantomToken);
  const revealRegister = await fetch(`${BASE}/api/cgm/student/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.197' },
    body: JSON.stringify({ classCode: revealClass.code, indexNumber: revealIndex, entryPassword: 'reveal-entry' }),
  }).then((response) => response.json()).catch(() => ({}));
  const revealPasskey = String(revealRegister?.data?.passkey || '');
  const revealLogin = await api('POST', '/api/cgm/student/login', { identifierType: 'index_number', identifier: revealIndex, passkey: revealPasskey });
  const revealToken = String(revealLogin.json?.data?.session?.token || '');
  const revealActivity = await api('POST', `/api/cgm/classes/${revealClass.classId}/activities`, {
    name: `Browser Check Reveal Activity ${stamp}`, type: 'tutorial',
    config: { method: 'random', groupCount: 2, capacity: 3, genderRule: 'none', repeatRule: 'random', leaderMethod: 'appointment', overflow: 'waitlist', announcementMode: 'direct', whatsappEnabled: false, attendanceEnabled: false, electionAnonymity: 'anonymous', allowVoteChange: false, tieBreak: 'random', eligibility: 'all' },
  }, phantomToken);
  const revealActivityId = revealActivity.json?.data?.activityId ?? revealActivity.json?.data?.id;
  await api('POST', `/api/cgm/activities/${revealActivityId}/lifecycle`, { action: 'publish' }, phantomToken);
  check('the reveal fixture is a published random-selection activity with a signed-in student',
    Boolean(revealToken) && Boolean(revealActivityId), `student=${Boolean(revealToken)} activity=${revealActivityId}`);

  const portal = await boot(`#class-invite/${revealClass.code}`, {
    studentSession: revealToken ? { token: revealToken, expiresAt: new Date(Date.now() + 86_400_000).toISOString() } : null,
  });
  await portal.waitForFor('CODE Rx Student Portal', 30_000);
  // The student's own journey: My Classes → the class → the activity card.
  // Every tap re-queries its node first: the portal polls, so a node captured a
  // moment earlier can already be detached by the time it is clicked.
  const clickUntil = async (pick, marker, timeoutMs = 25_000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const landed = marker();
      if (landed) return landed;
      const target = pick();
      if (target) target.click();
      await portal.wait(500);
    }
    return marker();
  };
  const classesNav = await portal.waitForElement(() => portal.buttonByText('My Classes'));
  classesNav && classesNav.click();
  const classCards = [...portal.window.document.querySelectorAll('[data-testid="cgm-class-nav-card"]')];
  check('the student sees their own class in My Classes',
    classCards.some((el) => new RegExp(`Reveal ${stamp}`).test(String(el.textContent || ''))),
    portal.body().slice(0, 200));
  const classOpened = await clickUntil(
    () => [...portal.window.document.querySelectorAll('[data-testid="cgm-class-nav-card"]')]
      .find((el) => new RegExp(`Reveal ${stamp}`).test(String(el.textContent || ''))),
    () => portal.window.document.querySelector('[data-testid="cgm-student-activity-card"]'),
  );
  check('opening the class lists its grouping activities', Boolean(classOpened), portal.body().slice(0, 240));
  const drawButton = await clickUntil(
    () => [...portal.window.document.querySelectorAll('[data-testid="cgm-student-activity-card"]')]
      .find((el) => /Random selection/.test(String(el.textContent || ''))),
    () => portal.window.document.querySelector('[data-testid="cgm-random-open"]'),
  );
  check('the draw control is offered on the activity page', Boolean(drawButton), portal.body().slice(0, 240));

  const overlay = await clickUntil(
    () => portal.window.document.querySelector('[data-testid="cgm-random-open"]'),
    () => portal.window.document.querySelector('[data-testid="cgm-random-reveal"]'),
  );
  check('the reveal overlay opens as a direct child of <body> — no ancestor can clip it',
    Boolean(overlay) && overlay.parentElement === portal.window.document.body,
    `parent=${overlay?.parentElement?.tagName || 'none'}`);
  check('the overlay is a full-screen fixed surface above every bar',
    Boolean(overlay) && /fixed/.test(overlay.className) && /inset-0/.test(overlay.className) && /z-\[120\]/.test(overlay.className),
    String(overlay?.className || '').slice(0, 140));
  const backdrop = overlay ? [...overlay.children].find((el) => /bg-gradient-to-b/.test(el.className)) : null;
  check('its backdrop is FIXED, so scrolling the overlay can never reveal the page behind',
    Boolean(backdrop) && /fixed/.test(backdrop.className) && /inset-0/.test(backdrop.className) && !/\babsolute\b/.test(backdrop.className),
    String(backdrop?.className || 'none').slice(0, 140));
  check('the page behind is frozen while the overlay is open (body scroll locked)',
    portal.window.document.body.style.overflow === 'hidden',
    `overflow=${portal.window.document.body.style.overflow || 'empty'}`);
  check('the app own chrome is not printed inside the overlay',
    Boolean(overlay) && !/JOIN VARIOUS WHATSAPP GROUP/.test(String(overlay.textContent || '')),
    String(overlay?.textContent || '').replace(/\s+/g, ' ').slice(0, 160));

  const resultPanel = await clickUntil(
    () => portal.window.document.querySelector('[data-testid="cgm-random-skip"]'),
    () => portal.window.document.querySelector('[data-testid="cgm-random-result"]'),
  );
  const winner = String(resultPanel?.querySelector('[data-testid="cgm-random-winner"]')?.textContent || '').trim();
  check('the result panel announces the real group with a Continue control',
    Boolean(resultPanel) && /Congratulations!/.test(String(resultPanel.textContent || '')) && /Group \d/.test(winner)
    && Boolean([...resultPanel.querySelectorAll('button')].find((el) => /Continue/.test(el.textContent))),
    `winner=${winner || 'none'}`);
  const stillFixed = overlay ? [...overlay.children].find((el) => /bg-gradient-to-b/.test(el.className)) : null;
  check('the backdrop is still the fixed full-screen layer once the result is showing',
    Boolean(stillFixed) && /fixed/.test(stillFixed.className),
    String(stillFixed?.className || 'none').slice(0, 120));

  const closed = await clickUntil(
    () => {
      const panel = portal.window.document.querySelector('[data-testid="cgm-random-result"]');
      return panel ? [...panel.querySelectorAll('button')].find((el) => /Continue/.test(el.textContent)) : null;
    },
    () => (portal.window.document.querySelector('[data-testid="cgm-random-reveal"]') ? null : portal.window.document.body),
  );
  check('Continue closes the overlay and hands the page back with scrolling restored',
    Boolean(closed) && portal.window.document.body.style.overflow !== 'hidden',
    `overflow=${portal.window.document.body.style.overflow || 'empty'}`);
}

// ---------------------------------------------------------------------------
// 8e. Printed records: Print, PDF and PNG of the real ballot election —
//     letterhead, the organizer, PHANTOM, the group link, the date, voted and
//     not voted
// ---------------------------------------------------------------------------
{
  const detail = (await api('GET', `/api/cgm/elections/${ballotElectionId}`, undefined, phantomToken)).json?.data || {};
  const candidateIds = (detail.candidates || []).map((row) => Number(row.id)).filter(Boolean);
  for (let index = 0; index < 2 && index < candidateIds.length && ballotTokens[index]; index += 1) {
    await fetch(`${BASE}/api/cgm/student/elections/${ballotElectionId}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Code-Rx-Student-Session': ballotTokens[index] },
      body: JSON.stringify({ candidateId: candidateIds[index] }),
    });
  }
  const printed = (await api('GET', `/api/cgm/elections/${ballotElectionId}`, undefined, phantomToken)).json?.data || {};
  const voted = Number(printed?.participation?.voted || 0);
  const groupSize = Number(printed?.participation?.groupSize || ballotGroupSize || 0);
  check('the printed-record fixture is a real election with votes cast and members who did not vote',
    ballotElectionId > 0 && voted >= 1 && groupSize > voted,
    `voted=${voted} size=${groupSize}`);

  const page = await boot('#class-groups', { memberToken: phantomToken, memberUser: { name: 'PHANTOM', email: EMAIL } });
  await page.waitForFor('Class & Group Management', 20_000);
  // jsdom has no canvas engine: give the page a measuring 2D context so the PNG
  // path runs exactly the code a real browser runs.
  // The app bundle is imported into NODE, so its globals are the shared ones:
  // patch URL/Image/print on globalThis (and the page mirror) or the download
  // never happens at all.
  const blobs = [];
  for (const host of [globalThis, page.window]) {
    // Never delegate to the host's own createObjectURL: the browser build hands
    // it a page-realm Blob and a strict host rejects the cross-realm object.
    host.URL.createObjectURL = (blob) => { blobs.push(blob); return `blob:captured/${blobs.length}`; };
    host.URL.revokeObjectURL = () => {};
  }
  page.window.print = () => {};
  globalThis.print = () => {};
  const fakeContext = () => ({
    font: '', fillStyle: '', strokeStyle: '', textAlign: 'left', textBaseline: 'alphabetic',
    measureText: (text) => ({ width: String(text ?? '').length * 7 }),
    fillRect() {}, strokeRect() {}, fillText() {}, beginPath() {}, moveTo() {}, lineTo() {},
    arcTo() {}, closePath() {}, fill() {}, stroke() {}, save() {}, restore() {}, clip() {}, drawImage() {},
  });
  page.window.HTMLCanvasElement.prototype.getContext = function getContext() { return fakeContext(); };
  page.window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ==';
  page.window.HTMLCanvasElement.prototype.toBlob = function toBlob(callback) {
    callback(new page.window.Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: 'image/png' }));
  };
  // A stand-in mark that loads instantly: the letterhead must reach the PDF as a
  // real embedded image, and jsdom never fetches image resources.
  class FakeImage {
    constructor() {
      this.naturalWidth = 64; this.naturalHeight = 64; this.width = 64; this.height = 64; this.complete = true;
    }
    set src(value) {
      this._src = value;
      setTimeout(() => { if (this.onload) this.onload(); }, 0);
    }
    get src() { return this._src; }
  }
  globalThis.Image = FakeImage;
  page.window.Image = FakeImage;

  await switchClass(page, ballotClassId);
  const electionsNav = await page.waitForElement(() => page.buttonByText('Elections'));
  electionsNav && electionsNav.click();
  await chooseActivity(page, ballotActivityId);
  const recordRow = await page.waitForElement(
    () => page.window.document.querySelector(`[data-testid="cgm-election-record-${ballotElectionId}"]`), 25_000);
  recordRow && recordRow.click();
  const exportCard = await page.waitForElement(
    () => page.window.document.querySelector(`[data-testid="cgm-election-export-${ballotElectionId}"]`), 20_000);
  check('the election record offers Print, PDF and PNG',
    Boolean(exportCard)
    && Boolean(page.window.document.querySelector(`[data-testid="cgm-election-print-${ballotElectionId}"]`))
    && Boolean(page.window.document.querySelector(`[data-testid="cgm-election-pdf-${ballotElectionId}"]`))
    && Boolean(page.window.document.querySelector(`[data-testid="cgm-election-png-${ballotElectionId}"]`)),
    page.body().slice(0, 200));

  const click = async (testid) => {
    const button = await page.waitForElement(() => page.window.document.querySelector(`[data-testid="${testid}"]`), 15_000);
    button && button.click();
    return Boolean(button);
  };

  // --- Print ---------------------------------------------------------------
  await click(`cgm-election-print-${ballotElectionId}`);
  const frame = await page.waitForElement(() => page.window.document.querySelector('[data-testid="cgm-print-frame"]'), 20_000);
  const sheet = String(frame?.srcdoc || '');
  check('Print opens a real A4 sheet for this record',
    Boolean(frame) && /@page \{ size: A4/.test(sheet) && new RegExp(`Ballot page ${stamp}`).test(sheet),
    sheet.slice(0, 160));
  check('the sheet carries the CODE Rx mark on the left and the class & grouping mark on the right',
    /class="left"/.test(sheet) && /class="right"/.test(sheet)
    && sheet.indexOf('CODE%20RX11.png') > 0 && sheet.indexOf('CGP.jpg') > 0
    && sheet.indexOf('CODE%20RX11.png') < sheet.indexOf('CGP.jpg'));
  check('the sheet names the class, the organizer and PHANTOM in the footer',
    new RegExp(`Browser Check Zballot ${stamp}`).test(sheet)
    && /Prepared by PHANTOM · Code Rx Society oversight/.test(sheet)
    && /Document ref/.test(sheet));
  check('the sheet prints VOTED and NOT VOTED with the real numbers',
    /Not voted/.test(sheet) && /Turnout/.test(sheet)
    && new RegExp(`<span class="v">${voted}</span>`).test(sheet)
    && new RegExp(`<span class="v">${groupSize - voted}</span>`).test(sheet),
    `voted=${voted} notVoted=${groupSize - voted}`);
  check('the sheet carries the group voting link and the issue date',
    new RegExp(`#student-vote/${ballotElectionId}`).test(sheet)
    && /Issued \d+ [A-Z][a-z]{2} \d{4}/.test(sheet));

  // --- PDF -----------------------------------------------------------------
  await click(`cgm-election-pdf-${ballotElectionId}`);
  const pdfBlob = await page.waitForElement(
    () => blobs.find((blob) => blob.type === 'application/pdf') || null, 25_000);
  const pdfText = pdfBlob ? Buffer.from(await pdfBlob.arrayBuffer()).toString('latin1') : '';
  const pdfParts = {
    header: pdfText.startsWith('%PDF-1.4'),
    wordmark: pdfText.includes('CODE Rx SOCIETY'),
    organizer: pdfText.includes('Prepared by PHANTOM'),
    phantom: pdfText.includes('Code Rx Society oversight'),
    images: pdfText.includes('/Subtype /Image'),
  };
  const canvasProbe = (() => {
    try {
      const probe = page.window.document.createElement('canvas');
      return `ctx=${Boolean(probe.getContext('2d'))} dataUrl=${String(probe.toDataURL('image/jpeg')).slice(0, 30)} img=${globalThis.Image === FakeImage}`;
    } catch (error) { return `probe-failed ${String(error?.message || error)}`; }
  })();
  check('PDF saves a genuine document with the letterhead, the organizer and PHANTOM',
    Boolean(pdfBlob) && Object.values(pdfParts).every(Boolean),
    `bytes=${pdfBlob?.size || 0} ${JSON.stringify(pdfParts)} dct=${pdfText.includes('DCTDecode')} ${canvasProbe}`);
  check('the PDF carries voted and not voted, and the group voting link',
    pdfText.includes('Not voted') && pdfText.includes('Turnout')
    && pdfText.includes(`#student-vote/${ballotElectionId}`)
    && new RegExp(`\\(${voted}\\)`).test(pdfText),
    `voted=${voted}`);

  // --- PNG -----------------------------------------------------------------
  await click(`cgm-election-png-${ballotElectionId}`);
  const pngBlob = await page.waitForElement(
    () => blobs.find((blob) => blob.type === 'image/png') || null, 25_000);
  check('PNG saves a drawable sheet in one tap', Boolean(pngBlob) && pngBlob.size > 0, `bytes=${pngBlob?.size || 0}`);
  const exportStatus = () => {
    const card = page.window.document.querySelector(`[data-testid="cgm-election-export-${ballotElectionId}"]`);
    return (card?.querySelector('[role="status"]')?.textContent || 'none').trim();
  };
  const noted = await page.waitForFor('Saved election-', 15_000);
  check('the record reports each export instead of failing silently', noted,
    `status=${exportStatus()} jsdom=${page.jsdomErrors.join(' | ').slice(0, 200)}`);
}

// Restore the spec-default policies so the local database stays clean.
await api('PUT', '/api/cgm/phantom/policies', { policies: [
  { key: 'student_registration_mode', value: 'approval' },
  { key: 'membership_request_mode', value: 'approval' },
] }, phantomToken);

console.log(`\nCGM BROWSER CHECKS: ${passed} passed, ${failures.length} failed`);
if (failures.length) { for (const f of failures) console.log(`  - ${f}`); }
// Leave explicitly: the booted jsdom pages hold timers that would keep node alive.
process.exit(failures.length ? 1 : 0);
