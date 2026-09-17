#!/usr/bin/env node
/**
 * CODE Rx SOCIETY — Phase 3 (Client Access Experience) verification harness.
 *
 * Covers the three things the Phase 3 brief asks to be tested:
 *   1. the access-key rules (formatting, validation, failure messages),
 *   2. the rendered access screen and project room for every state,
 *   3. the browser-side security rules (where a session may live, and that a
 *      raw access key is never stored anywhere).
 *
 * The React components are rendered with react-dom/server, so no DOM shim or
 * extra dependency is needed. Nothing here is imported by the application.
 *
 * Usage:  node scripts/client-portal-ui-tests.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
// The bundle is emitted inside the repo so that the externalized React imports
// resolve against the application's own node_modules. node_modules is ignored
// by git, and the directory is removed again at the end of the run.
const BUNDLE_ROOT = path.join(ROOT, 'node_modules', '.cache');
fs.mkdirSync(BUNDLE_ROOT, { recursive: true });
const OUT_DIR = fs.mkdtempSync(path.join(BUNDLE_ROOT, 'code-rx-ui-tests-'));

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
// Bundle the real components and helpers
// ---------------------------------------------------------------------------

const bundle = async () => {
  const outfile = path.join(OUT_DIR, 'phase3.mjs');
  await build({
    stdin: {
      contents: `
        export * from './src/lib/accessKey';
        export * from './src/lib/projectRoom';
        export { clientPortalSession } from './src/lib/cloudflare';
        export { ClientAccessScreen } from './src/components/ClientAccessScreen';
        export { ClientProjectRoom } from './src/components/ClientProjectRoom';
        export { ClientAccessCenter, buildPreviewTransport, buildPreviewRoomContext } from './src/components/ClientAccessCenter';
      `,
      resolveDir: ROOT,
      loader: 'tsx',
      sourcefile: 'phase3-entry.tsx',
    },
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    jsx: 'automatic',
    // React must stay external so the components and the server renderer share
    // one React instance (two copies breaks every hook).
    external: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/server', 'lucide-react'],
    logLevel: 'error',
    define: { 'import.meta.env': JSON.stringify({ PROD: false, DEV: true, VITE_API_URL: '' }) },
  });
  return import(pathToFileURL(outfile).href);
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const main = async () => {
  const module = await bundle();
  const {
    formatAccessKey, validateAccessKey, accessKeyHint, messageForFailure, failureMessage,
    FAILURE_MESSAGES, ACCESS_KEY_PLACEHOLDER, clientPortalSession,
    ClientAccessScreen, ClientProjectRoom, ClientAccessCenter, buildPreviewTransport, buildPreviewRoomContext,
    visibleSections, emptyMessageFor, hasAnyPublishedContent, canDownload, canView,
    permissionLabel, publicationInfo, formatDate, overviewFacts, downloadFileName,
    documentFlags, ROOM_SECTIONS, CATEGORY_LABELS, PROJECT_STATUS_LABELS,
  } = module;

  const { renderToStaticMarkup } = await import('react-dom/server');
  const React = await import('react');
  const render = (element) => renderToStaticMarkup(element);

  console.log('CODE Rx — Client Access Experience (Phase 3) verification');
  console.log('='.repeat(64));

  // =========================================================================
  group('1. Access key formatting and validation');
  // =========================================================================

  const canonical = 'CRX-8K4P-X92M-7LQF-B3TD';
  const canonicalBody = '8K4PX92M7LQFB3TD';

  check('a canonical key is preserved exactly',
    formatAccessKey(canonical).display === canonical && formatAccessKey(canonical).body === canonicalBody);
  check('lowercase input is accepted and upper-cased',
    formatAccessKey('crx-8k4p-x92m-7lqf-b3td').display === canonical);
  check('a key pasted without dashes is grouped',
    formatAccessKey(canonicalBody).display === canonical);
  check('a key pasted with spaces is grouped',
    formatAccessKey('8K4P X92M 7LQF B3TD').display === canonical);
  check('a key pasted with the prefix only',
    formatAccessKey('CRX8K4PX92M7LQFB3TD').display === canonical);
  check('groups are four characters each',
    canonicalBody.length === 16 && formatAccessKey(canonical).display.split('-').slice(1).every((group_) => group_.length === 4));
  check('an incomplete key is grouped but not reported as complete',
    formatAccessKey('8K4PX9').display === 'CRX-8K4P-X9' && formatAccessKey('8K4PX9').complete === false);

  const ambiguous = formatAccessKey('CRX-0O1I-8K4P-X92M-7LQF');
  check('the ambiguous glyphs 0, O, 1 and I are dropped',
    !/[01OI]/.test(ambiguous.body), ambiguous.body);
  check('dropped characters are reported so the screen can explain them',
    ambiguous.ignored.join(',') === '0,1,I,O', ambiguous.ignored.join(','));
  check('a long paste cannot exceed the server limit',
    formatAccessKey('A'.repeat(120)).body.length === 32);
  check('a canonical key is exactly four groups',
    formatAccessKey(canonical).display.split('-').length === 5
    && formatAccessKey(canonical).display.length === 23);
  check('an over-long paste is still grouped in fours, never truncated mid-group',
    formatAccessKey('A'.repeat(120)).display.split('-').length === 9, formatAccessKey('A'.repeat(120)).display);

  check('validation accepts a complete canonical key',
    validateAccessKey(canonical).ok === true && validateAccessKey(canonical).body === canonicalBody);
  check('validation rejects an empty key with a plain-language prompt',
    validateAccessKey('').ok === false && /enter the project access key/i.test(validateAccessKey('').problem));
  check('validation rejects a short key without calling it invalid',
    validateAccessKey('8K4PX92M').ok === false && /too short/i.test(validateAccessKey('8K4PX92M').problem));
  check('validation explains the ambiguous characters',
    validateAccessKey('CRX-0O1I-8K4P-X92M-7LQF').ok === false
    && /never contain/i.test(validateAccessKey('CRX-0O1I-8K4P-X92M-7LQF').problem));

  check('the hint stays quiet for a complete key', accessKeyHint(formatAccessKey(canonical)) === null);
  check('the hint explains the ambiguous characters', /never contain/i.test(String(accessKeyHint(ambiguous))));
  check('the hint guides an incomplete key', /four groups/i.test(String(accessKeyHint(formatAccessKey('8K4P')))));
  check('there is no hint before anything is typed', accessKeyHint(formatAccessKey('')) === null);
  check('the placeholder matches the brief', ACCESS_KEY_PLACEHOLDER === 'CRX-____-____-____');

  // =========================================================================
  group('2. Failure messages — the seven required states');
  // =========================================================================

  const requiredStates = {
    invalid_key: /not recognised/i,
    key_expired: /expired/i,
    key_revoked: /revoked/i,
    client_suspended: /suspended/i,
    project_unavailable: /not available/i,
    session_expired: /session has ended/i,
    server_error: /went wrong/i,
  };
  for (const [code, pattern] of Object.entries(requiredStates)) {
    check(`the ${code} state has its own client-facing message`, pattern.test(String(FAILURE_MESSAGES[code])), String(FAILURE_MESSAGES[code]));
  }
  check('every state message is distinct', new Set(Object.values(FAILURE_MESSAGES)).size === Object.keys(FAILURE_MESSAGES).length);

  check('a transport failure becomes the offline message', messageForFailure(0, null) === FAILURE_MESSAGES.offline);
  check('a 429 becomes the rate-limit message', messageForFailure(429, 'rate_limited') === FAILURE_MESSAGES.rate_limited);
  check('a 500 becomes the generic server message', messageForFailure(500, null) === FAILURE_MESSAGES.server_error);
  check('a 404 with a code shows the state message', messageForFailure(404, 'link_expired') === FAILURE_MESSAGES.link_expired);
  check('an unexpected response falls back to a safe message', messageForFailure(418, null) === FAILURE_MESSAGES.unavailable);
  check('an empty fallback never renders an empty box', failureMessage(undefined) === FAILURE_MESSAGES.unavailable);

  const allMessages = Object.values(FAILURE_MESSAGES).join(' ');
  check('no message leaks a status code, an endpoint or an internal name',
    !/\b[1-5]\d\d\b|\/api\/|sql|d1|table|undefined|null|\[object/i.test(allMessages), allMessages.slice(0, 120));
  check('no message contains markup', !/<[a-z]/i.test(allMessages));

  // =========================================================================
  group('3. Access screen — the rendered concept');
  // =========================================================================

  const screenHtml = render(React.createElement(ClientAccessScreen, { onSubmit: async () => {} }));

  check('the brand line is rendered', screenHtml.includes('CODE Rx SOCIETY'));
  check('the screen title is CLIENT ACCESS', screenHtml.includes('CLIENT ACCESS'));
  check('the instruction is rendered', screenHtml.includes('Enter your project access key'));
  check('the input carries the CRX placeholder', screenHtml.includes('CRX-____-____-____'));
  check('the primary action is rendered', /Enter Project/i.test(screenHtml));
  check('the assistance line is rendered', screenHtml.includes('Need assistance?'));
  check('the contact line is rendered', screenHtml.includes('Contact Code Rx Society'));
  check('the contact line is a mail link',
    /href="mailto:coderxsociety@gmail\.com[^"]*"/.test(screenHtml));
  check('the access key input is never pre-filled', /value=""/.test(screenHtml) || !/value="CRX/.test(screenHtml));
  const inputTag = /<input[^>]*>/.exec(screenHtml)?.[0] || '';
  check('the input opts out of browser autofill and autocorrect',
    /\bautocomplete="off"/i.test(inputTag) && /\bautocorrect="off"/i.test(inputTag), inputTag.slice(0, 120));
  check('the input asks for capitalised characters on mobile keyboards',
    /\bautocapitalize="characters"/i.test(inputTag));
  check('the input disables spellcheck', /\bspellcheck="false"/i.test(inputTag));
  check('the input is labelled for screen readers', /id="client-access-key"/.test(screenHtml) && screenHtml.includes('for="client-access-key"'));
  const submitTag = [...screenHtml.matchAll(/<button[^>]*>/g)].map((match) => match[0]).find((tag) => /type="submit"/.test(tag)) || '';
  check('the submit button is enabled in the idle state',
    Boolean(submitTag) && !/\sdisabled(\s|>|=)/.test(submitTag), submitTag.slice(0, 120));
  check('the screen promises the key is not stored', /never stored in this browser/i.test(screenHtml));
  check('the rendered screen contains no internal identifiers',
    !/prj_|cli_|vault_|storage_reference|sessionId|key_hash/i.test(screenHtml));

  // Every required failure state must be able to drive the screen.
  const escapeForMarkup = (value) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/'/g, '&#x27;');
  for (const code of Object.keys(requiredStates)) {
    const message = FAILURE_MESSAGES[code];
    const html = render(React.createElement(ClientAccessScreen, { onSubmit: async () => {}, notice: message }));
    check(`the ${code} state renders on the screen`,
      html.includes(message) || html.includes(escapeForMarkup(message)));
  }

  const errorHtml = render(React.createElement(ClientAccessScreen, {
    onSubmit: async () => {},
    notice: FAILURE_MESSAGES.key_expired,
  }));
  check('a failure is announced to assistive technology', /role="alert"/.test(errorHtml));
  check('a failure marks the input as invalid', /aria-invalid="true"/.test(errorHtml));
  check('a failure does not reveal why beyond the client-facing state', !/401|404|expired_at|status/i.test(errorHtml));

  // =========================================================================
  group('4. Project room — the authorized destination');
  // =========================================================================

  const context = {
    client: { id: 'cli_0123456789abcdef01234567', name: 'Ashanti Pharmacy Ltd', contactName: 'Ama' },
    project: { id: 'prj_89abcdef0123456789abcdef', reference: 'CRX-PROJ-2026-001', name: 'Pharmacy Digital Platform', description: 'Rollout' },
    permissions: { view: true, download: false },
  };
  const roomHtml = render(React.createElement(ClientProjectRoom, {
    context, notice: null, onNotice: () => {}, onSignedOut: () => {}, onSessionEnded: () => {},
  }));

  check('the room shows the client organisation', roomHtml.includes('Ashanti Pharmacy Ltd'));
  check('the room shows the human project reference', roomHtml.includes('CRX-PROJ-2026-001'));
  check('the room offers a way out', /Log out/i.test(roomHtml));
  check('the room shows a loading state before data arrives', /Opening your secure project room|Loading your project/i.test(roomHtml));
  check('the room never renders the opaque client id', !roomHtml.includes(context.client.id));
  check('the room never renders the opaque project id', !roomHtml.includes(context.project.id));
  check('the room never renders storage or vault identifiers',
    !/storage_reference|vault_document_id|key_hash|access_key_id/i.test(roomHtml));
  check('the room footer scopes visibility to this client', /only shows documents published to Ashanti Pharmacy Ltd/i.test(roomHtml));

  const noticeRoom = render(React.createElement(ClientProjectRoom, {
    context, notice: 'This document is not available to download yet.', onNotice: () => {}, onSignedOut: () => {}, onSessionEnded: () => {},
  }));
  check('a download that is not ready is explained in plain language',
    noticeRoom.includes('not available to download yet') && /Dismiss/.test(noticeRoom));

  // =========================================================================
  group('5. Browser-side session handling');
  // =========================================================================

  // A minimal sessionStorage stand-in, so the store can be exercised directly.
  const store = new Map();
  globalThis.sessionStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };

  check('no session is reported before one is written', clientPortalSession.read() === null);

  const future = new Date(Date.now() + 3600_000).toISOString();
  clientPortalSession.write({ token: 'a'.repeat(64), expiresAt: future });
  const stored = clientPortalSession.read();
  check('a written session is readable', stored?.token === 'a'.repeat(64));
  check('the session is kept in sessionStorage (one tab, not the whole browser)',
    [...store.keys()].some((key) => key.includes('clientSession')));

  clientPortalSession.clear();
  check('clearing really clears', clientPortalSession.read() === null);

  clientPortalSession.write({ token: 'b'.repeat(64), expiresAt: new Date(Date.now() - 1000).toISOString() });
  check('an expired session is never handed back', clientPortalSession.read() === null);
  check('an expired session is removed from storage', store.size === 0);

  // Static guarantee: the portal never reaches for localStorage, and the raw
  // access key is never written to any browser store.
  const portalFiles = [
    'src/lib/accessKey.ts',
    'src/lib/cloudflare.ts',
    'src/components/ClientAccessScreen.tsx',
    'src/components/ClientProjectRoom.tsx',
    'src/components/ClientPortal.tsx',
  ];
  const sources = portalFiles.map((file) => ({ file, text: fs.readFileSync(path.join(ROOT, file), 'utf8') }));
  // cloudflare.ts is the shared API client: the member token has always used
  // localStorage, so only its client-portal section is checked here.
  const portalSection = (file, text) => (file.endsWith('cloudflare.ts')
    ? text.slice(text.indexOf('CLIENT PROJECT PORTAL (Phase 3)'))
    : text);

  // Only real usage counts: a comment that names the API is not a call.
  const withoutComments = (text) => text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  check('no portal file reads or writes localStorage',
    sources.every(({ file, text }) => !/\blocalStorage\s*[.[]/.test(withoutComments(portalSection(file, text)))),
    sources.map(({ file, text }) => `${file}:${/\blocalStorage\s*[.[]/.test(withoutComments(portalSection(file, text)))}`).join(' '));
  check('the access key is never written to sessionStorage',
    !sources.some(({ text }) => /sessionStorage\.setItem\([^)]*[Pp]asskey/.test(text)));
  check('only the session token is persisted',
    sources.some(({ text }) => text.includes("'codeRx_clientSession'")));
  check('the access screen clears the key from state after a successful exchange',
    /setValue\(''\)/.test(sources.find(({ file }) => file.endsWith('ClientAccessScreen.tsx')).text));
  check('key material is never put in the URL',
    !sources.some(({ text }) => /location\.(hash|href)\s*=[^;]*[Pp]asskey/.test(text)));
  check('the link token is stripped from the URL after exchange',
    /replaceState/.test(sources.find(({ file }) => file.endsWith('ClientPortal.tsx')).text));

  // =========================================================================
  group('6. Project Room — sections, visibility and empty states');
  // =========================================================================

  const sectionList = [
    { id: 'overview', label: 'Overview', count: 3 },
    { id: 'documents', label: 'Documents', count: 0 },
    { id: 'letters', label: 'Letters', count: 1 },
    { id: 'agreements', label: 'Agreements', count: 0 },
    { id: 'reports', label: 'Reports', count: 2 },
    { id: 'deliverables', label: 'Deliverables', count: 0 },
    { id: 'updates', label: 'Updates', count: 1 },
  ];

  const shown = visibleSections(sectionList, 3).map((section) => section.id);
  check('only sections with authorized content are shown', shown.join(',') === 'overview,letters,reports,updates', shown.join(','));
  check('Project Overview is always shown, even when empty',
    visibleSections([{ id: 'overview', label: 'Overview', count: 0 }], 0).map((section) => section.id).join(',') === 'overview');
  check('an empty project shows no category sections',
    visibleSections(sectionList.map((section) => ({ ...section, count: 0 })), 0).length === 1);
  check('a section with content is kept even when the overview is empty',
    visibleSections([{ id: 'updates', label: 'Updates', count: 1 }], 0).map((section) => section.id).join(',') === 'overview,updates');
  check('the room defines exactly the seven required sections',
    ROOM_SECTIONS.map((section) => section.id).join(',') === 'overview,documents,letters,agreements,reports,deliverables,updates');
  check('the sections render in the required order and wording',
    ROOM_SECTIONS.map((section) => section.label).join('|') === 'Project Overview|Documents|Letters|Agreements|Reports|Deliverables|Updates');

  check('no documents available', emptyMessageFor('documents') === 'No documents available.');
  check('no agreements available', emptyMessageFor('agreements') === 'No agreements available.');
  check('no reports available', emptyMessageFor('reports') === 'No reports available.');
  check('no updates available', emptyMessageFor('updates') === 'No updates available.');
  check('no letters available', emptyMessageFor('letters') === 'No letters available.');
  check('no deliverables available', emptyMessageFor('deliverables') === 'No deliverables available.');
  check('an overview with nothing published explains itself',
    /nothing has been published/i.test(emptyMessageFor('overview')));
  check('an unknown section still returns a safe message', emptyMessageFor('nope') === 'No documents available.');

  check('a project with published content is detected',
    hasAnyPublishedContent(sectionList) === true);
  check('a project with only an empty overview is reported as empty',
    hasAnyPublishedContent([{ id: 'overview', label: 'Overview', count: 5 }]) === false);
  check('an indefinite count is never rendered as a leak',
    !/draft|internal|hidden|unpublished/i.test([...Object.values(CATEGORY_LABELS), ...Object.values(PROJECT_STATUS_LABELS)].join(' ')));

  // =========================================================================
  group('7. View and download are independent permissions');
  // =========================================================================

  const viewOnly = { id: 'doc_1', title: 'View only report', category: 'report', reference: 'CRX-RPT-2026-001', version: '1.0', permissions: { view: true, download: false } };
  const downloadable = { id: 'doc_2', title: 'Downloadable letter', category: 'letter', reference: 'CRX-LTR-2026-001', version: '2.0', permissions: { view: true, download: true } };
  const deniedBoth = { id: 'doc_3', title: 'Hidden', category: 'report', permissions: { view: false, download: false } };
  const noPermissions = { id: 'doc_4', title: 'No permission block', category: 'report' };

  check('view is allowed on a view-only document', canView(viewOnly) === true);
  check('download is denied on a view-only document', canDownload(viewOnly) === false);
  check('view does NOT imply download', canView(viewOnly) && !canDownload(viewOnly));
  check('a document with no permission block is treated as view-only', canDownload(noPermissions) === false);
  check('download is allowed only when the server says so', canDownload(downloadable) === true);
  check('a document denied both permissions is not viewable', canView(deniedBoth) === false);
  check('the permission label is client-facing', permissionLabel(viewOnly) === 'View only' && permissionLabel(downloadable) === 'View and download');
  check('download flags are derived per document',
    documentFlags(viewOnly, 4).viewOnly === true && documentFlags(downloadable, 4).downloadable === true
    && documentFlags(downloadable, 1).soleDocument === true);

  const roomWithMix = render(React.createElement(ClientProjectRoom, {
    context: {
      client: { id: 'cli_1', name: 'Ashanti Pharmacy Ltd' },
      project: { id: 'prj_1', reference: 'CRX-PROJ-2026-001', name: 'Pharmacy Digital Platform', status: 'active' },
      permissions: { view: true, download: false },
    },
    notice: null, onNotice: () => {}, onSignedOut: () => {}, onSessionEnded: () => {},
  }));
  check('the empty room offers Project Overview', roomWithMix.includes('Project Overview'));

  // =========================================================================
  group('8. Publication information and overview facts');
  // =========================================================================

  // Formatting follows the viewer's own locale, so the expectations are built
  // with the same API instead of hard-coding one language or date order.
  const expectedDate = (iso) => new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
  const PUBLISHED = '2026-09-01T09:00:00.000Z';
  const UPDATED = '2026-09-10T09:00:00.000Z';

  check('a document published and never updated shows one date',
    publicationInfo({ ...downloadable, publishedAt: PUBLISHED, updatedAt: PUBLISHED }).primary === `Published ${expectedDate(PUBLISHED)}`);
  const changed = publicationInfo({ ...downloadable, publishedAt: PUBLISHED, updatedAt: UPDATED });
  check('a document changed after publication shows both dates',
    changed.primary === `Published ${expectedDate(PUBLISHED)}` && changed.secondary === `Updated ${expectedDate(UPDATED)}`);
  check('a document with only an update date says so',
    publicationInfo({ ...downloadable, updatedAt: UPDATED }).primary === `Updated ${expectedDate(UPDATED)}`);
  check('a document with no dates never renders an invalid date',
    publicationInfo({ ...downloadable }).primary === 'Date unavailable');
  // SQLite stores `YYYY-MM-DD HH:MM:SS` in UTC; the parser must read it as UTC.
  check('a SQL-style timestamp is understood',
    formatDate('2026-09-01 09:00:00') === expectedDate('2026-09-01T09:00:00.000Z'),
    formatDate('2026-09-01 09:00:00'));
  check('a missing date renders an em dash', formatDate(null) === '—' && formatDate('not a date') === '—');

  const facts = overviewFacts({ reference: 'CRX-PROJ-2026-001', status: 'active', createdAt: '2026-08-01 10:00:00', updatedAt: '2026-09-10 10:00:00', publishedCount: 5 });
  check('the overview shows the project reference', facts.some((fact) => fact.value === 'CRX-PROJ-2026-001'));
  check('the overview shows a client-facing status', facts[0].value === 'Active');
  check('the overview shows when the project opened',
    facts.some((fact) => fact.label === 'Opened' && fact.value === expectedDate('2026-08-01T10:00:00.000Z')));
  check('the overview shows the last update',
    facts.some((fact) => fact.label === 'Last updated' && fact.value === expectedDate('2026-09-10T10:00:00.000Z')));
  check('the overview counts published documents in client language',
    facts.some((fact) => fact.value === '5 documents') && overviewFacts({ reference: 'r', status: 'active', publishedCount: 1 }).some((fact) => fact.value === '1 document'));
  check('a suspended project is described in client language, not internal state',
    overviewFacts({ reference: 'r', status: 'suspended', publishedCount: 0 })[0].value === 'On hold');
  check('an unknown status falls back to Active rather than showing a raw value',
    overviewFacts({ reference: 'r', status: 'weird_internal_state', publishedCount: 0 })[0].value === 'Active');

  check('the download filename prefers the document reference',
    downloadFileName({ id: 'd', title: 'Phase 1 report', category: 'report', reference: 'CRX-RPT-2026-001' }) === 'CRX-RPT-2026-001.pdf');
  check('the download filename is safe when a title is used',
    downloadFileName({ id: 'd', title: 'Phase 1 / report: draft?', category: 'report' }) === 'Phase-1-report-draft.pdf');
  check('the download filename always ends in .pdf', downloadFileName({ id: 'd', title: '', category: 'report' }).endsWith('.pdf'));

  // -------------------------------------------------------------------------

  // =========================================================================
  group('9. Client Access Center — the PHANTOM workspace (Phase 5)');
  // =========================================================================

  const centerHtml = render(React.createElement(ClientAccessCenter, { onMessage: () => {} }));
  check('the workspace renders inside the existing PHANTOM shell', /CLIENT ACCESS CENTER/.test(centerHtml));
  const centerSource = fs.readFileSync(path.join(ROOT, 'src/components/ClientAccessCenter.tsx'), 'utf8');
  const orderedSections = centerSource.match(/const SECTIONS:[\s\S]*?\];/)[0];
  check('the workspace defines exactly the six required sections in order',
    (orderedSections.match(/'([a-z]+)'(?=,)/g) || []).join(',') === "'clients','projects','documents','links','activity','permissions'",
    orderedSections.replace(/\s+/g, ' ').slice(0, 160));
  for (const label of ['Clients', 'Projects', 'Documents', 'Temporary Links', 'Activity', 'Permissions']) {
    check(`the ${label} section is offered in the workspace navigation`, centerHtml.includes(label));
  }
  check('the client list shows name, contact summary, status and activity',
    /client\.name/.test(centerSource) && /publishedCount/.test(centerSource)
    && /client\.status/.test(centerSource) && /lastActivityAt/.test(centerSource));
  check('the client panel shows the last activity the list reported',
    /lastActivityAt=\{clients\.find/.test(centerSource) && /formatWhen\(lastActivityAt\)/.test(centerSource));
  check('archiving, suspending and revoking all access are offered on the client',
    /Suspend client access/.test(centerSource) && /Revoke all client access/.test(centerSource)
    && /Archive client/.test(centerSource));
  check('the publishing dialog walks source, project, section and permissions',
    /1 · Write the client copy/.test(centerSource) && /2 · Project/.test(centerSource)
    && /3 · Section/.test(centerSource) && /4 · Client permissions/.test(centerSource));
  check('the key dialog states that a generated key is shown once',
    /shown once/i.test(centerSource) && /Generate key/.test(centerSource));
  check('the workspace offers client creation once the capability is loaded',
    /Create client/.test(centerSource) && /can\('clients\.create'\)/.test(centerSource));
  check('the client rail can include archived clients on request', /Archived/.test(centerHtml));
  check('the workspace states what it manages before any client is chosen',
    /Select a client to manage their projects, documents, access keys and links\./.test(centerHtml));

  const centerLeaks = [
    ['an API path', /\/api\//],
    ['an internal table name', /client_access_keys|client_documents|client_projects|client_links|client_sessions|audit_logs/],
    ['a stored credential field', /key_hash|session_hash|token_hash/],
    ['an internal storage key', /storage_reference|client-exports|vault_document_id/],
    ['a database row id', /\b(rowid|last_row_id|subject_id)\b/],
  ];
  for (const [what, pattern] of centerLeaks) {
    check(`the workspace markup never renders ${what}`, !pattern.test(centerHtml), String(centerHtml.match(pattern)));
  }
  check('the workspace never renders a stored passkey field', !/passkey_hash|key_value|plain_passkey/i.test(centerHtml));
  check('the internal client note is labelled and never sent to the client',
    /Internal note/.test(centerSource) && /never sent to the client/.test(centerSource));

  const phantomSource = fs.readFileSync(path.join(ROOT, 'src/components/PhantomControlCenter.tsx'), 'utf8');
  check('the workspace is a tab of the existing PHANTOM navigation',
    /'clients', 'Client Access Center'/.test(phantomSource) && /<ClientAccessCenter/.test(phantomSource));
  check('the workspace reuses the existing admin shell rather than a second one',
    !/ClientAccessCenter[\s\S]{0,400}min-h-screen/.test(phantomSource)
    && /import \{ ClientAccessCenter \}/.test(phantomSource));

  // =========================================================================
  group('10. Preview as client — the promise holds');
  // =========================================================================

  const previewCalls = [];
  const previewApi = {
    previewSection: async (clientId, projectId, section) => {
      previewCalls.push(['section', clientId, projectId, section]);
      return { project: { id: projectId }, section, documents: [{ id: 'doc_server' }] };
    },
    previewDocument: async (clientId, projectId, documentId) => {
      previewCalls.push(['document', clientId, projectId, documentId]);
      return { project: { id: projectId }, document: { id: documentId, permissions: { view: true, download: false } } };
    },
  };
  const previewRoomPayload = { project: { id: 'prj_1', name: 'Pharmacy Digital Platform' }, sections: [], recent: [] };
  const previewTransport = buildPreviewTransport(previewApi, previewRoomPayload, 'cli_1', 'prj_1');

  check('the preview transport exposes only read calls',
    Object.keys(previewTransport).sort().join(',') === 'document,project,section', Object.keys(previewTransport).join(','));
  check('the preview transport has no download capability at all',
    previewTransport.download === undefined && !('download' in previewTransport));
  check('the preview room payload is the one the server authorized',
    (await previewTransport.project('prj_1')).data.project.name === 'Pharmacy Digital Platform');
  const previewedSection = await previewTransport.section('prj_1', 'reports');
  check('a previewed section is fetched from the preview endpoint for that client only',
    previewCalls[0].join(',') === 'section,cli_1,prj_1,reports' && previewedSection.data.documents[0].id === 'doc_server');
  const previewedDocument = await previewTransport.document('prj_1', 'doc_server');
  check('a previewed document is fetched from the preview endpoint for that client only',
    previewCalls[1].join(',') === 'document,cli_1,prj_1,doc_server' && previewedDocument.data.document.id === 'doc_server');
  check('the preview transport can only ever address the client it was built for',
    previewCalls.every((call) => call[1] === 'cli_1'));

  const previewContext = buildPreviewRoomContext({ id: 'cli_1', name: 'Ashanti Pharmacy Ltd' }, previewRoomPayload);
  check('the preview room shows the client its own name',
    previewContext.client.name === 'Ashanti Pharmacy Ltd' && previewContext.project.name === 'Pharmacy Digital Platform');
  check('the preview room can view but never download',
    previewContext.permissions.view === true && previewContext.permissions.download === false);
  check('a preview with no room renders no context',
    buildPreviewRoomContext({ id: 'cli_1', name: 'x' }, null) === null
    && buildPreviewRoomContext(null, previewRoomPayload) === null);

  const previewHtml = render(React.createElement(ClientProjectRoom, {
    context: previewContext,
    transport: previewTransport,
    preview: true,
    exitLabel: 'Exit preview',
    notice: null, onNotice: () => {}, onSignedOut: () => {}, onSessionEnded: () => {},
  }));
  check('the previewed room says it is a preview', /Preview only/.test(previewHtml));
  check('the previewed room explains that no session, download or change is possible',
    /No client session was created/.test(previewHtml) && /no document is downloaded/i.test(previewHtml));
  check('the previewed room offers to leave the preview instead of logging a client out',
    /Exit preview/.test(previewHtml) && !/Log out/.test(previewHtml));
  check('the previewed room is the same room component the client uses',
    /Project Overview/.test(previewHtml) && /Project sections/.test(previewHtml));

  // =========================================================================
  group('11. Granular client permissions in the workspace (Phase 6)');
  // =========================================================================

  // The header button is now capability-driven, so the static render (which has
  // no capabilities loaded yet) shows no create button. That is the point.
  check('an operator with no capabilities loaded is offered no mutating action',
    !/Create client/.test(centerHtml) && !/Create project/.test(centerHtml) && !/Publish to client/.test(centerHtml));
  check('the workspace explains which capability is missing instead of failing silently',
    /permission to view client records/.test(centerHtml) && /CLIENT_VIEW/.test(centerHtml));

  const guardedActions = [
    ['creating a client', "can('clients.create')"],
    ['editing a client', "can('clients.edit')"],
    ['suspending a client', "can('clients.suspend')"],
    ['archiving a client', "can('clients.archive')"],
    ['previewing as the client', "can('clients.preview')"],
    ['creating a project', "can('clients.projects.create')"],
    ['editing a project', "can('clients.projects.edit')"],
    ['archiving a project', "can('clients.projects.archive')"],
    ['creating a client document', "can('clients.documents.create')"],
    ['editing a client document', "can('clients.documents.edit')"],
    ['deleting a client document', "can('clients.documents.delete')"],
    ['publishing a client document', "can('clients.documents.publish')"],
    ['unpublishing a client document', "can('clients.documents.unpublish')"],
    ['creating a temporary link', "can('clients.links.create')"],
    ['revoking a temporary link', "can('clients.links.revoke')"],
  ];
  for (const [action, guard] of guardedActions) {
    check(`the UI hides ${action} behind its capability`, centerSource.includes(guard));
  }
  check('the UI never relies on hiding alone: the server refusal is explained in the workspace',
    /refused server-side unless you hold the matching client permission/i.test(centerSource));

  const panelSource = centerSource.slice(centerSource.indexOf('const PermissionsPanel'));
  check('the permission panel renders the brief names from the server catalog',
    /entry\.brief/.test(panelSource) && /capabilities\.filter/.test(panelSource));
  check('the permission panel groups capabilities for the operator',
    /groups = Array\.from\(new Set/.test(panelSource) && /entry\.group/.test(panelSource));
  check('a capability the operator does not hold cannot be granted from the UI',
    /heldByMe/.test(panelSource) && /disabled=\{!heldByMe/.test(panelSource));
  check('the panel states the non-escalation rule to the operator',
    /only manage client capabilities you hold yourself/i.test(panelSource) && /never your own account/i.test(panelSource));
  check('the panel states that founding identities get nothing automatically',
    /NEXUS, GHOST, FALCON, QUANTUM, MATRIX/.test(panelSource) && /grants nothing on its own/i.test(panelSource));
  check('the panel records and displays WHO, WHAT, WHEN, TARGET, OLD and NEW',
    /recentChanges/.test(panelSource) && /entry\.actor/.test(panelSource) && /entry\.target/.test(panelSource)
    && /formatWhen\(entry\.at\)/.test(panelSource) && /previousValue/.test(panelSource) && /newValue/.test(panelSource));
  check('the panel can grant, remove and modify in one place',
    /Save permissions/.test(panelSource) && /Remove all/.test(panelSource) && /setDraft\(\[\]\)/.test(panelSource));
  check('the panel exposes the client portal settings switches',
    /Save portal settings/.test(centerSource) && /settingsDraft/.test(centerSource)
    && /clientAccessCenter\.savePortalSettings/.test(centerSource));
  check('the panel explains that the Phase 5 umbrella keys still work unchanged',
    /umbrella keys/.test(panelSource) && /resolve[sd]? to the granular capabilities it always meant/i.test(panelSource));
  check('the panel asks the server to record the change rather than changing state locally',
    /clientAccessCenter\.setMemberPermissions/.test(panelSource));

  const apiSource = fs.readFileSync(path.join(ROOT, 'src/lib/cloudflare.ts'), 'utf8');
  check('the workspace reads capabilities and the matrix from the server',
    /clientAccessCenter\s*=\s*\{/.test(apiSource) && /permissionMatrix:/.test(apiSource)
    && /capabilities:/.test(apiSource) && /setMemberPermissions:/.test(apiSource)
    && /portalSettings:/.test(apiSource) && /deleteDocument:/.test(apiSource));
  check('the client portal helper is still a separate surface (no duplicated transport)',
    /export const clientPortal = \{/.test(apiSource) && /export const clientAccessCenter = \{/.test(apiSource));
  check('the workspace never renders the audit detail JSON as raw internal ids only',
    !/subject_id|actor_user_id/.test(centerSource));

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
  console.log(`SUCCESS RATE: ${((passed / results.length) * 100).toFixed(1)}%`);
  console.log('='.repeat(64));

  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
};

main().catch((error) => {
  console.error('\nHarness error:', error);
  process.exit(2);
});
