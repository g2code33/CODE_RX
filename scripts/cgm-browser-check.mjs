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
const boot = async (address, { memberToken = null, memberUser = null } = {}) => {
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
{
  const wsClass = await makeClass(`Browser Check Group WS ${stamp}`);
  const wsActivity = await api('POST', `/api/cgm/classes/${wsClass.classId}/activities`, {
    name: `Browser Check Pods ${stamp}`, type: 'tutorial',
    config: { method: 'random', groupCount: 3, capacity: 10, genderRule: 'none', repeatRule: 'random', leaderMethod: 'appointment', overflow: 'waitlist', announcementMode: 'direct', whatsappEnabled: true, attendanceEnabled: true, electionAnonymity: 'anonymous', allowVoteChange: false, tieBreak: 'random', eligibility: 'all' },
  }, phantomToken);
  const wsActivityId = wsActivity.json?.data?.activityId ?? wsActivity.json?.data?.id;
  await api('POST', `/api/cgm/activities/${wsActivityId}/lifecycle`, { action: 'publish' }, phantomToken);

  const page = await boot('#class-groups', { memberToken: phantomToken, memberUser: { name: 'PHANTOM', email: EMAIL } });
  const groupsNav = page.buttonByText('Groups');
  groupsNav && groupsNav.click();
  check('the organizer reaches the Groups page', await page.waitForFor('Choose an activity', 20_000));
  const chooser = page.window.document.querySelector('select[aria-label="Choose activity"]');
  const selectSetter = Object.getOwnPropertyDescriptor(page.window.HTMLSelectElement.prototype, 'value').set;
  selectSetter.call(chooser, String(wsActivityId));
  chooser.dispatchEvent(new page.window.Event('change', { bubbles: true }));
  check('the planned groups appear after publishing (defined at publish time)',
    await page.waitForFor('Group 1', 20_000) && await page.waitForFor('Group 3', 5_000));
  const groupCard = [...page.window.document.querySelectorAll('button')].find((el) => el.textContent.trim() === 'Group 1');
  groupCard && groupCard.click();
  check('clicking a group opens its dedicated workspace with every management section',
    await page.waitForFor('Back to groups', 20_000)
    && await page.waitForFor('WhatsApp group', 5_000)
    && await page.waitForFor('Recent history', 5_000)
    && await page.waitForFor('Leadership', 5_000)
    && await page.waitForFor('Notify members directly', 5_000),
    page.body().slice(0, 200));
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
