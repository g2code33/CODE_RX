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
import childProcess from 'node:child_process';

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
        export * from './src/lib/linkAccess';
        export { ClientLinkState } from './src/components/ClientLinkState';
        export { clientPortalSession } from './src/lib/cloudflare';
        export { ClientAccessScreen } from './src/components/ClientAccessScreen';
        export { ClientProjectRoom, StampedCopyPanel } from './src/components/ClientProjectRoom';
        export { ClientAccessCenter, ActivityPanel, buildPreviewTransport, buildPreviewRoomContext, KeyRevealDialog } from './src/components/ClientAccessCenter';
        export { ClientPortalEntry } from './src/components/ClientPortalEntry';
        export { ClientSupportContact } from './src/components/ClientSupportContact';
        export { ClientAccessKeyField } from './src/components/ClientAccessKeyField';
        export { ClientSiteSign } from './src/components/ClientSiteSign';
        export { SectionLink } from './src/components/SectionLink';
        export { sectionDirectLinkUrl, linkTokenFromAddress, linkAddressUrl, linkAddressPath, isLinkAddress } from './src/lib/linkAccess';
        export { SiteEmoji, SiteEmojiText, SiteEmojiProvider } from './src/components/SiteEmoji';
        export { SiteEmojiAdmin } from './src/components/SiteEmojiAdmin';
        export { ContactForm } from './src/components/ContactForm';
        export { SiteFlow } from './src/components/SiteFlow';
        export { PortalSearch } from './src/components/PortalSearch';
        export { AuthModal } from './src/components/AuthModal';
        export { AppDialogHost, appDialog, Modal, useModalBehaviour } from './src/components/AppDialog';
        export { INITIAL_SITE_CONTENT, normalizeSiteContent } from './src/data/siteState';
        export * from './src/data/siteEmojis';
        export * from './functions/lib/client-activity';
        export * from './src/lib/vaultUploads';
        export { VaultUploadField } from './src/components/VaultUploadField';
        export { VaultUploadDialog } from './src/components/VaultUploadDialog';
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
    ClientAccessScreen, ClientProjectRoom, StampedCopyPanel, ClientAccessCenter, buildPreviewTransport, buildPreviewRoomContext,
    visibleSections, emptyMessageFor, hasAnyPublishedContent, canDownload, canView,
    permissionLabel, publicationInfo, formatDate, overviewFacts, downloadFileName,
    documentFlags, ROOM_SECTIONS, CATEGORY_LABELS, PROJECT_STATUS_LABELS,
    parseDelivery, deliveryAvailable, canPrint, deliveryMessage, freshnessBadge,
    ActivityPanel, buildClientActivityEntry, clientActivityPage, safeActivityDetails,
    activityAccessMethod, activityKindFor, activityLabelFor, clientActivityEvent, CLIENT_ACTIVITY_KINDS,
    LINK_DESTINATIONS, LINK_DESTINATION_IDS, LINK_ACCESS_MODES, LINK_TTL_PRESETS,
    absoluteLinkUrl, linkShareUrl, clientSignInUrl, linkShareHint, KeyRevealDialog,
    SectionLink, sectionDirectLinkUrl, linkTokenFromAddress, linkAddressUrl, linkAddressPath, isLinkAddress,
    LINK_TTL_MINUTES_FALLBACK, LINK_TTL_MIN_MINUTES, LINK_TTL_MAX_MINUTES, LINK_MAX_USES_LIMIT,
    linkDestination, linkDestinationLabel, linkAccessModeLabel, ttlLabel,
    validateLinkLifetime, validateLinkMaxUses, linkPermissionSummary, linkUsesLabel,
    landingFor, linkStateScreen, LINK_STATE_SCREENS, LINK_CONTACT_EMAIL, linkContactHref,
    CLIENT_PORTAL_HASH, clientPortalPath, clientEntryCopy, ClientPortalEntry,
    telHref,
    clientContact, clientSupportMailto, phantomContactHref, PHANTOM_CONTACT_HASH, CLIENT_SITE_HOME,
    ClientSupportContact, ClientAccessKeyField, ClientSiteSign,
    SiteEmoji, SiteEmojiText, SiteEmojiProvider, SiteEmojiAdmin, ContactForm,
    SiteFlow, INITIAL_SITE_CONTENT, normalizeSiteContent,
    PortalSearch, AuthModal, AppDialogHost, appDialog, Modal, useModalBehaviour,
    SITE_EMOJIS, SITE_EMOJI_MEDIA_PREFIX, siteEmojiMediaKey, siteEmojiReplacement, splitEmojiRuns, isSiteEmoji,
    titleFromFileName, isStampableUploadMime, STAMPABLE_UPLOAD_ACCEPT, STAMPABLE_UPLOAD_LABEL,
    MAX_UPLOAD_BYTES, sectionAcceptsDocuments, uploadDocumentStatus, VaultUploadField, VaultUploadDialog,
    splitAccessKey, joinAccessKey, validateAccessKeyGroups,
    ACCESS_KEY_GROUPS, ACCESS_KEY_GROUP_LENGTH, ACCESS_KEY_CODE_LENGTH, ACCESS_KEY_BODY_LENGTH,
    looksLikeLinkToken, linkPath, ClientLinkState,
  } = module;

  const { renderToStaticMarkup } = await import('react-dom/server');
  const React = await import('react');
  const render = (element) => renderToStaticMarkup(element);

  console.log('CODE Rx — Client Access Experience (Phase 3) verification');
  console.log('='.repeat(64));

  // =========================================================================
  group('1. Access key formatting and validation');
  // =========================================================================

  const canonical = 'CRX-8K4-P92-MSD';
  const canonicalBody = '8K4P92MSD';

  check('a canonical key is preserved exactly',
    formatAccessKey(canonical).display === canonical && formatAccessKey(canonical).body === canonicalBody);
  check('the key is two random groups and the project code',
    ACCESS_KEY_GROUP_LENGTH === 3 && ACCESS_KEY_GROUPS === 3 && ACCESS_KEY_CODE_LENGTH === 3
    && ACCESS_KEY_BODY_LENGTH === 9);
  check('lowercase input is accepted and upper-cased',
    formatAccessKey('crx-8k4-p92-msd').display === canonical);
  check('a key pasted without dashes is accepted',
    formatAccessKey(canonicalBody).display === canonical);
  check('a key pasted with spaces is accepted',
    formatAccessKey('8k4 p92 msd').display === canonical);
  check('a key pasted with the CRX prefix is accepted',
    formatAccessKey('CRX8K4P92MSD').display === canonical);
  check('the body splits into exactly three boxes, three characters each',
    splitAccessKey(canonical).join('|') === '8K4|P92|MSD'
    && splitAccessKey('CRX-8K4-P92-MSD').every((group_) => group_.length === 3));
  check('the boxes join back into the body the server receives',
    joinAccessKey(['8k4', 'p92', 'msd']) === canonicalBody);
  check('a partial key fills the boxes from the left',
    splitAccessKey('8K4P').join('|') === '8K4|P|');
  check('a character a key can never contain is kept and reported, never dropped',
    formatAccessKey('CRX-0O1-8K4-P92-MSD').ignored.join(',') === '0,1,O'
    && formatAccessKey('CRX-0O1-8K4-P92-MSD').body === canonicalBody);
  check('the pasted CRX prefix is dropped, but a body that starts with CRX is not mangled',
    formatAccessKey('CRX8K4P92MSD').body === canonicalBody
    && formatAccessKey('CRX8K4P92').body === 'CRX8K4P92');
  check('a long paste is held at a bounded length, not an unbounded buffer',
    formatAccessKey('A'.repeat(120)).body.length === 32);
  check('a key from the old long format is refused, never silently halved',
    validateAccessKey('CRX-8K4P-X92M-7LQF-B3TD').ok === false
    && validateAccessKey('CRX-8K4P-X92M-7LQF-B3TD').body === '8K4PX92M7LQFB3TD'
    && /9 characters/i.test(String(validateAccessKey('CRX-8K4P-X92M-7LQF-B3TD').problem)));

  check('validation accepts a complete key',
    validateAccessKeyGroups(['8K4', 'P92', 'MSD']).ok === true
    && validateAccessKeyGroups(['8K4', 'P92', 'MSD']).body === canonicalBody);
  check('validation rejects an empty key with a plain-language prompt',
    validateAccessKeyGroups(['', '', '']).ok === false && /enter the project access key/i.test(validateAccessKeyGroups(['', '', '']).problem));
  check('validation rejects a half-filled key without calling it invalid',
    validateAccessKeyGroups(['8K4', 'P9', '']).ok === false && /9 characters/i.test(validateAccessKeyGroups(['8K4', 'P9', '']).problem));
  check('validation explains the ambiguous characters',
    validateAccessKeyGroups(['0O1', '8K4', 'MSD']).ok === false
    && /never contain/i.test(validateAccessKeyGroups(['0O1', '8K4', 'MSD']).problem));
  check('the last box is the project code, so a digit there is explained',
    validateAccessKeyGroups(['8K4', 'P92', 'MS2']).ok === false
    && /project code/i.test(validateAccessKeyGroups(['8K4', 'P92', 'MS2']).problem));
  check('the ambiguous-glyph warning names the characters once',
    validateAccessKeyGroups(['0O1', '8K4', 'MSD']).problem.includes('0, O, 1'));

  check('the hint stays quiet for a complete key', accessKeyHint(formatAccessKey(canonical)) === null);
  check('the hint explains the ambiguous characters', /never contain/i.test(String(accessKeyHint(formatAccessKey('CRX-0O1-8K4-P92')))));
  check('the hint guides an incomplete key', /each box|boxes/i.test(String(accessKeyHint(formatAccessKey('8K4')))));
  check('there is no hint before anything is typed', accessKeyHint(formatAccessKey('')) === null);
  check('the placeholder shows the shape a real key has',
    ACCESS_KEY_PLACEHOLDER === 'CRX-___-___-ABC');

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
  check('the fixed CRX prefix is drawn beside the boxes',
    screenHtml.includes('>CRX<') || /client-access-key-label/.test(screenHtml));
  check('the primary action is rendered', /Enter Project/i.test(screenHtml));
  check('the assistance line is rendered', screenHtml.includes('Need assistance?'));
  check('the contact line is rendered', screenHtml.includes('Contact Code Rx'));
  check('the contact line is a mail link',
    /href="mailto:coderxsociety@gmail\.com[^"]*"/.test(screenHtml));
  check('the access key input is never pre-filled', /value=""/.test(screenHtml) || !/value="CRX/.test(screenHtml));
  const inputTags = [...screenHtml.matchAll(/<input[^>]*>/g)].map((match) => match[0]);
  check('the key is entered in three fixed boxes',
    inputTags.length === 3 && inputTags.every((tag) => /maxlength="3"/i.test(tag)),
    `inputs=${inputTags.length}`);
  check('the boxes opt out of browser autofill and autocorrect',
    inputTags.every((tag) => /\bautocomplete="off"/i.test(tag) && /\bautocorrect="off"/i.test(tag)), inputTags[0]?.slice(0, 120) || '');
  check('the boxes ask for capitalised characters on mobile keyboards',
    inputTags.every((tag) => /\bautocapitalize="characters"/i.test(tag)));
  check('the boxes disable spellcheck', inputTags.every((tag) => /\bspellcheck="false"/i.test(tag)));
  check('every box is labelled for screen readers',
    inputTags.every((tag) => /aria-label="Access key, group \d of 3|aria-label="Project code, group 3 of 3/.test(tag)),
    inputTags.map((tag) => /aria-label="([^"]+)"/.exec(tag)?.[1] || '?').join(' | '));
  const submitTag = [...screenHtml.matchAll(/<button[^>]*>/g)].map((match) => match[0]).find((tag) => /type="submit"/.test(tag)) || '';
  check('the submit button is enabled in the idle state',
    Boolean(submitTag) && !/\sdisabled(\s|>|=)/.test(submitTag), submitTag.slice(0, 120));
  check('the screen states the key is verified on Code Rx servers',
    /verified on Code Rx servers/i.test(screenHtml) && !/never stored in this browser/i.test(screenHtml));
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
    /setBoxes\(\['', '', ''\]\)/.test(sources.find(({ file }) => file.endsWith('ClientAccessScreen.tsx')).text));
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
  check('the workspace defines the required sections in order',
    // Phase 18 restores the access-key section between Documents and Links.
    (orderedSections.match(/'([a-z]+)'(?=,)/g) || []).join(',') === "'clients','projects','documents','keys','links','activity','permissions'",
    orderedSections.replace(/\s+/g, ' ').slice(0, 200));
  for (const label of ['Clients', 'Projects', 'Documents', 'Access keys', 'Temporary Links', 'Activity', 'Permissions']) {
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


  // =========================================================================
  group('12. Temporary project links — destinations, modes and end states (Phase 7)');
  // =========================================================================

  // --- the ten destinations, in the order the brief lists them -------------
  check('the dialog offers exactly the ten destinations the brief names',
    LINK_DESTINATIONS.map((entry) => entry.id).join(',')
      === 'project,overview,documents,letters,agreements,reports,deliverables,updates,document,file',
    LINK_DESTINATIONS.map((entry) => entry.id).join(','));
  check('the destinations carry client-facing labels, never internal codes',
    LINK_DESTINATIONS.every((entry) => /^[A-Z][A-Za-z ]+$/.test(entry.label))
    && LINK_DESTINATIONS.every((entry) => entry.hint.length > 20),
    LINK_DESTINATIONS.map((entry) => entry.label).join(' · '));
  check('only a specific document and a specific file need a document chosen',
    LINK_DESTINATIONS.filter((entry) => entry.needsDocument).map((entry) => entry.id).join(',') === 'document,file');
  check('a file destination is a download destination, never a room destination',
    linkDestination('file')?.kind === 'file' && linkDestination('project')?.kind === 'room');
  check('an unknown destination never resolves to something wider',
    linkDestination('everything') === null && linkDestinationLabel('everything') === 'Project Room');

  // --- the two access modes ------------------------------------------------
  check('exactly the two access modes are offered',
    LINK_ACCESS_MODES.map((entry) => entry.id).join(',') === 'REQUIRE_PASSKEY,DIRECT_ACCESS',
    LINK_ACCESS_MODES.map((entry) => entry.id).join(','));
  check('direct access says the token itself is the credential',
    /token is the credential/i.test(LINK_ACCESS_MODES.find((entry) => entry.id === 'DIRECT_ACCESS')?.hint || ''));
  check('the passkey mode says the passkey is still the credential',
    /signs in with their project access key/i.test(LINK_ACCESS_MODES.find((entry) => entry.id === 'REQUIRE_PASSKEY')?.hint || ''));
  check('the mode is translated to operator wording',
    linkAccessModeLabel('REQUIRE_PASSKEY') === 'Require passkey' && linkAccessModeLabel('DIRECT_ACCESS') === 'Direct access');

  // --- the expiry choices --------------------------------------------------
  check('the six required expirations are offered in order',
    LINK_TTL_PRESETS.map((preset) => preset.minutes).join(',') === '15,60,360,1440,4320,10080',
    LINK_TTL_PRESETS.map((preset) => preset.minutes).join(','));
  check('the expiry labels read as the brief words them',
    LINK_TTL_PRESETS.map((preset) => preset.label).join(',')
      === '15 minutes,1 hour,6 hours,24 hours,3 days,7 days',
    LINK_TTL_PRESETS.map((preset) => preset.label).join(','));
  check('a custom expiration stays inside the window the server accepts',
    LINK_TTL_MIN_MINUTES === 5 && LINK_TTL_MAX_MINUTES === 10080);
  check('the custom lifetime is validated before it is sent',
    validateLinkLifetime(5) === null && Boolean(validateLinkLifetime(4)) && Boolean(validateLinkLifetime(10081))
    && Boolean(validateLinkLifetime(null)) && Boolean(validateLinkLifetime(90.5)));
  check('a custom lifetime is described with the preset wording when one matches',
    ttlLabel(1440) === '24 hours' && ttlLabel(10080) === '7 days' && ttlLabel(5) === '5 minutes');
  check('the default lifetime is one of the offered presets',
    LINK_TTL_PRESETS.some((preset) => preset.minutes === LINK_TTL_MINUTES_FALLBACK));

  // --- permissions and uses ------------------------------------------------
  check('view and download are described as independent permissions',
    linkPermissionSummary({ allowView: true, allowDownload: true }).label === 'View and download'
    && linkPermissionSummary({ allowView: true, allowDownload: false }).label === 'View only'
    && linkPermissionSummary({ allowView: false, allowDownload: true }).label === 'Download only');
  check('a file link is download-only whatever else was chosen',
    linkPermissionSummary({ intent: 'file', allowView: true, allowDownload: true }).label === 'Download only'
    && /never asks for a token|text stays closed|reading only/i.test(
      `${linkPermissionSummary({ intent: 'file' }).detail} ${linkPermissionSummary({ allowView: true }).detail}`));
  check('the operator wording never claims download permission implies read permission',
    !/download permission (also )?(allows|means) (reading|viewing)/i.test(
      `${linkPermissionSummary({ allowView: false, allowDownload: true }).detail}`));
  check('a maximum-uses limit is bounded',
    validateLinkMaxUses(null) === null && validateLinkMaxUses(1) === null && validateLinkMaxUses(LINK_MAX_USES_LIMIT) === null
    && Boolean(validateLinkMaxUses(0)) && Boolean(validateLinkMaxUses(LINK_MAX_USES_LIMIT + 1)));
  check('the uses column shows the count and the limit',
    linkUsesLabel({ useCount: 2, maxUses: 5 }) === '2 of 5 used'
    && /unlimited/.test(linkUsesLabel({ useCount: 2, maxUses: null })),
    linkUsesLabel({ useCount: 2, maxUses: 5 }));

  // --- where an authorized client lands (never from the URL) ---------------
  const roomLanding = landingFor({ restricted: true, destination: 'project' });
  const overviewLanding = landingFor({ restricted: true, destination: 'overview' });
  const sectionLanding = landingFor({ restricted: true, destination: 'letters' });
  const documentLanding = landingFor({ restricted: true, destination: 'document', documentId: 'doc_abc' });
  const fileLanding = landingFor({ restricted: true, destination: 'file', documentId: 'doc_abc' });
  check('a room link opens the room overview', roomLanding.kind === 'room' && roomLanding.section === 'overview');
  check('an overview link states its destination', overviewLanding.kind === 'overview' && overviewLanding.label === 'Project Overview');
  check('a section link opens exactly that section',
    sectionLanding.kind === 'section' && sectionLanding.section === 'letters');
  check('a document link opens exactly that document',
    documentLanding.kind === 'document' && documentLanding.documentId === 'doc_abc');
  check('a file link is flagged as file-only so the room is never fetched',
    fileLanding.kind === 'file' && fileLanding.fileOnly === true && fileLanding.documentId === 'doc_abc');
  check('an unrestricted session lands on the whole room',
    landingFor({ restricted: false }).kind === 'room' && landingFor(null).fileOnly === false
    && landingFor(undefined).label === 'Project Room');
  check('a restricted payload with an unusable destination never widens access',
    landingFor({ restricted: true, destination: 'everything' }).label === 'Project Room');

  // --- the end states ------------------------------------------------------
  check('the four link end states exist', Object.keys(LINK_STATE_SCREENS).sort().join(',')
    === 'link_exhausted,link_expired,link_invalid,link_revoked', Object.keys(LINK_STATE_SCREENS).join(','));
  check('the expired state is headed exactly THIS LINK HAS EXPIRED',
    linkStateScreen('link_expired')?.headline === 'THIS LINK HAS EXPIRED');
  check('the revoked state is headed exactly ACCESS REVOKED',
    linkStateScreen('link_revoked')?.headline === 'ACCESS REVOKED');
  check('every end state tells the client what to do next',
    Object.values(LINK_STATE_SCREENS).every((state) => state.message.length > 30 && state.guidance.length > 20));
  check('a non-link failure is left to the ordinary access screen',
    linkStateScreen('invalid_passkey') === null && linkStateScreen('') === null && linkStateScreen(undefined) === null);
  check('the contact address is the existing Code Rx Society address',
    LINK_CONTACT_EMAIL === 'coderxsociety@gmail.com' && linkContactHref('THIS LINK HAS EXPIRED').startsWith('mailto:coderxsociety@gmail.com?subject='));
  check('the contact mail link names the state rather than the token',
    !/lnk_|token/i.test(decodeURIComponent(linkContactHref('ACCESS REVOKED'))));

  // --- the token itself ----------------------------------------------------
  check('a link token is recognised by its shape, never inspected further',
    looksLikeLinkToken('a'.repeat(43)) && looksLikeLinkToken('A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0U1v2')
    && !looksLikeLinkToken('CRX-8K4P-X92M-7LQF-B3TD') && !looksLikeLinkToken('short') && !looksLikeLinkToken('a/'.repeat(20)));
  check('the client-facing link path carries the token in the fragment, not the query',
    linkPath('abc123') === '/#client-portal/link/abc123' && !/\?/.test(linkPath('abc123')));

  // --- the rendered end states --------------------------------------------
  const expiredHtml = render(React.createElement(ClientLinkState, { state: linkStateScreen('link_expired'), onContinue: () => {} }));
  check('the expired screen renders the required headline', expiredHtml.includes('THIS LINK HAS EXPIRED'));
  check('the expired screen still offers Contact Code Rx',
    expiredHtml.includes('Contact Code Rx') && /href="mailto:coderxsociety@gmail\.com/.test(expiredHtml));
  check('the expired screen states that nothing was shown',
    /no project content was shown/i.test(expiredHtml));
  check('the expired screen offers the access key as the way forward',
    /Use my access key/.test(expiredHtml));
  const revokedHtml = render(React.createElement(ClientLinkState, { state: linkStateScreen('link_revoked') }));
  check('the revoked screen renders the required headline', revokedHtml.includes('ACCESS REVOKED'));
  check('the revoked screen still offers Contact Code Rx', revokedHtml.includes('Contact Code Rx'));
  check('the revoked screen does not pretend a retry will work',
    !/try again/i.test(revokedHtml) && /can no longer be opened/i.test(revokedHtml));
  const exhaustedHtml = render(React.createElement(ClientLinkState, { state: linkStateScreen('link_exhausted') }));
  check('an exhausted link is explained as a limit, not as an error', /reached the number of uses/i.test(exhaustedHtml));
  const invalidHtml = render(React.createElement(ClientLinkState, { state: linkStateScreen('link_invalid') }));
  check('an unrecognised link never confirms what it was', /could not be recognised/i.test(invalidHtml));
  for (const [name, html] of [['expired', expiredHtml], ['revoked', revokedHtml], ['exhausted', exhaustedHtml], ['invalid', invalidHtml]]) {
    check(`the ${name} screen renders no destination, no project and no identifiers`,
      !/Recently published|prj_|doc_|lnk_|storage_reference|vault_/i.test(html));
    check(`the ${name} screen never renders a stored credential field`,
      !/key_hash|token_hash|session_hash|passkey_hash/i.test(html));
  }

  // --- the portal shell ----------------------------------------------------
  const portalSource = fs.readFileSync(path.join(ROOT, 'src/components/ClientPortal.tsx'), 'utf8');
  check('the portal reads the link token from the fragment', /#client-portal\/link\//.test(portalSource));
  check('the token is removed from the address bar once it has been exchanged',
    /stripLinkTokenFromUrl/.test(portalSource) && /history\.replaceState/.test(portalSource));
  check('the link token is held in memory only',
    /useState<\{ token: string \} \| null>\(null\)/.test(portalSource)
    && !/localStorage[\s\S]{0,80}pendingLink/.test(portalSource)
    && !/sessionStorage[\s\S]{0,80}pendingLink/.test(portalSource));
  check('only the session token is ever written to session storage',
    /clientPortalSession\.write\(\{ token: session\.token, expiresAt: session\.expiresAt \}\)/.test(portalSource));
  check('a passkey-required link opens nothing until the passkey is given',
    /requiresPasskey[\s\S]{0,200}setPendingLink/.test(portalSource));
  check('an unusable link renders the link end state instead of a room',
    /ClientLinkState/.test(portalSource) && /linkStateScreen\(/.test(portalSource));
  check('the portal never fetches the room while a link end state is showing',
    !/linkState\s*&&[\s\S]{0,200}clientPortal\.(project|room)\(/.test(portalSource));
  check('the portal forgets the link token when the client signs in with a key',
    /setPendingLink\(null\)/.test(portalSource));

  // --- the operator surfaces ----------------------------------------------
  const linksPanelSource = centerSource.slice(centerSource.indexOf('const LinksPanel'));
  check('the links panel renders the destination, the mode and the permissions',
    /linkDestinationLabel\(link\.destination\)/.test(linksPanelSource)
    && /link\.mode === 'DIRECT_ACCESS'/.test(linksPanelSource)
    && /linkPermissionSummary\(link\)\.label/.test(linksPanelSource));
  check('the links panel shows the remaining uses and the expiry',
    /linkUsesLabel\(link\)/.test(linksPanelSource) && /expires \{formatWhen\(link\.expiresAt\)\}/.test(linksPanelSource));
  check('a revoked or expired link cannot be revoked again',
    /link\.status === 'active' && can\('clients\.links\.revoke'\)/.test(linksPanelSource));
  check('the links panel warns when a file link has no stamped client copy',
    /hasClientArtifact === false/.test(linksPanelSource) && /no client file yet/.test(linksPanelSource));
  check('the create dialog builds its choices from the shared rules',
    /LINK_DESTINATIONS\.map/.test(centerSource) && /LINK_ACCESS_MODES\.map/.test(centerSource)
    && /LINK_TTL_PRESETS\.map/.test(centerSource));
  check('the create dialog sends destination, mode, lifetime, uses and permissions',
    /destination,/.test(centerSource) && /mode,/.test(centerSource) && /expiresInMinutes: minutes/.test(centerSource)
    && /maxUses: unlimitedUses \? null : Number\(maxUses\)/.test(centerSource)
    && /allowView: effectiveAllowView/.test(centerSource) && /allowDownload: effectiveAllowDownload/.test(centerSource));
  check('a file link is forced to download-only in the dialog',
    /const effectiveAllowDownload = isFile \? true : allowDownload/.test(centerSource)
    && /const effectiveAllowView = isFile \? false : allowView/.test(centerSource));
  check('only published, client-visible documents can be linked to',
    /document\.lifecycle === 'published' && document\.clientVisible/.test(centerSource));
  check('the dialog explains that an unstamped document cannot be linked',
    /never hands over an unstamped original/i.test(centerSource));
  check('the token is shown once and never again',
    /shown once/.test(centerSource) && /cannot be retrieved/.test(centerSource));
  check('the links panel states that tokens are hashed on the server',
    /hashed on the server and shown once/i.test(linksPanelSource));
  check('the operator surfaces never render a link token from the list',
    !/link\.token/.test(centerSource));


  // =========================================================================
  group('13. Watermarked client delivery in the viewer (Phase 8)');
  // =========================================================================

  const src = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
  const roomSource = src('src/components/ClientProjectRoom.tsx');
  const transportSource = src('src/lib/cloudflare.ts');
  const workspaceSource = src('src/components/ClientAccessCenter.tsx');

  // --- the delivery descriptor fails closed --------------------------------
  check('a missing delivery descriptor is treated as nothing to show',
    deliveryAvailable(parseDelivery(null)) === false && deliveryAvailable(parseDelivery(undefined)) === false
    && deliveryAvailable(parseDelivery({})) === false && deliveryAvailable(parseDelivery({ available: 'yes' })) === false);
  check('a descriptor that admits to an unstamped file is refused, not rendered',
    deliveryAvailable(parseDelivery({ available: true, stamped: false })) === false);
  check('a stamped descriptor is accepted', deliveryAvailable(parseDelivery({ available: true, stamped: true })) === true);
  check('an omitted stamp flag is accepted (the server only sends stamped copies)',
    deliveryAvailable(parseDelivery({ available: true })) === true);
  check('the descriptor defaults to the client-document designation',
    parseDelivery({ available: true }).designation === 'CLIENT PROJECT DOCUMENT'
    && parseDelivery({ available: true }).label === 'Stamped copy'
    && parseDelivery({}).label === 'Unavailable');
  check('the server descriptor is carried through untouched',
    parseDelivery({
      available: true, kind: 'stamped_pdf', label: 'Stamped PDF', contentType: 'application/pdf',
      viewerPath: '/api/client/project/p1/documents/d1/preview', printPath: '/api/client/project/p1/documents/d1/print',
      downloadPath: '/api/client/project/p1/documents/d1/download',
    }).viewerPath.endsWith('/preview'));

  // --- what the viewer is allowed to offer ---------------------------------
  const stampedDelivery = parseDelivery({ available: true, kind: 'stamped_pdf', label: 'Stamped PDF' });
  const refusedDelivery = parseDelivery({ available: false, reason: 'source_restricted', message: 'This document is not available for download. Contact Code Rx Society.' });
  check('printing is offered for a viewable document with a stamped copy',
    canPrint(viewOnly, stampedDelivery) === true && canPrint(downloadable, stampedDelivery) === true);
  check('printing is never offered without a stamped copy',
    canPrint(downloadable, refusedDelivery) === false && canPrint(downloadable, parseDelivery(null)) === false);
  check('printing is never offered for a document the client may not view',
    canPrint(deniedBoth, stampedDelivery) === false);
  check('the refusal message tells the client to contact Code Rx Society',
    /Contact Code Rx Society/.test(deliveryMessage(refusedDelivery)));
  check('a refusal without a server message still explains itself',
    /contact Code Rx Society/i.test(deliveryMessage(parseDelivery({ available: false }))));

  // --- the panel the client actually gets ----------------------------------
  const panel = (props) => render(React.createElement(StampedCopyPanel, {
    delivery: stampedDelivery, copy: null, busy: false, preview: false, printable: true,
    onLoadCopy: () => {}, onPrint: () => {}, ...props,
  }));
  const availablePanel = panel({ copy: { url: 'blob:code-rx-stamped-copy', filename: 'CRX-RPT-2026-001.pdf' } });
  check('the viewer embeds the stamped copy the server produced',
    availablePanel.includes('<object') && availablePanel.includes('blob:code-rx-stamped-copy')
    && availablePanel.includes('type="application/pdf"'));
  check('the viewer states the watermarked designation and origin',
    availablePanel.includes('CLIENT PROJECT DOCUMENT') && /watermarked by Code Rx Society/i.test(availablePanel));
  check('the viewer offers print and a new-tab copy of the same artifact',
    availablePanel.includes('Print') && /Open in a new tab/.test(availablePanel));
  check('the viewer never tells the client a watermark can be turned off',
    !/turn off|disable|remove.{0,20}watermark|without.{0,12}watermark|no watermark/i.test(availablePanel));
  const loadingPanel = panel({ copy: null });
  check('before the copy is fetched the panel offers to open the stamped copy',
    /Open stamped copy/.test(loadingPanel) && !loadingPanel.includes('<object'));
  check('the empty state promises the stamp rather than the original',
    /stamped with the Code Rx watermark/i.test(loadingPanel));
  const refusedPanel = panel({ delivery: refusedDelivery, printable: false });
  check('a refused delivery shows the reason and nothing else',
    /Contact Code Rx Society/.test(refusedPanel)
    && !refusedPanel.includes('<object') && !/Open stamped copy/.test(refusedPanel) && !/>\s*Print\s*</.test(refusedPanel));
  const viewOnlyPanel = panel({ printable: false, copy: null });
  check('a document that cannot be printed shows no print control',
    !/>\s*Print\s*</.test(viewOnlyPanel));
  const previewPanel = panel({ preview: true });
  check('the operator preview never embeds a client file',
    !previewPanel.includes('<object') && /Preview shows the client/.test(previewPanel));

  // --- the source rules behind the panel -----------------------------------
  check('the room no longer renders stored document text',
    !/parseDocumentContent|sanitizeVaultRichText|VaultBlock|\.content\.blocks|content\.blocks/.test(roomSource));
  check('the room never reaches for an internal original',
    !/storageReference|storage_reference|\/original|\braw=1\b/.test(roomSource));
  check('the stamped copy is fetched through the authenticated transport',
    /transport\.stampedCopy/.test(roomSource)
    && /CLIENT_SESSION_HEADER/.test(transportSource)
    && /stampedCopy:[\s\S]{0,700}credentials: 'omit'/.test(transportSource)
    && /stampedCopy:[\s\S]{0,700}cache: 'no-store'/.test(transportSource));
  check('the transport asks for the server preview/print route, never a raw file',
    /stampedCopy[\s\S]{0,420}\/\$\{action\}/.test(transportSource)
    && /action: 'preview' \| 'print'/.test(transportSource)
    && /URL\.createObjectURL\(blob\)/.test(transportSource)
    && !/stampedCopy[\s\S]{0,420}\/download/.test(transportSource));
  check('the object URL is released when the room unmounts',
    /URL\.revokeObjectURL/.test(roomSource));
  check('printing keeps the user gesture by opening the window before the fetch',
    /printStampedCopy[\s\S]{0,700}window\.open/.test(roomSource));
  check('no client component can switch the watermark off',
    !/watermark(Enabled|_enabled|Disabled)?\s*[:=]\s*(false|0)\b/i.test(roomSource + workspaceSource + transportSource)
    && !/(disable|turn off|remove)[^\n]{0,24}watermark/i.test(roomSource + workspaceSource));
  check('the preview transport still serves no file at all',
    !('download' in buildPreviewTransport()) && !('stampedCopy' in buildPreviewTransport()));
  check('PHANTOM can produce the stamped copy from the documents panel',
    /prepareDelivery/.test(workspaceSource) && /Prepare stamped copy/.test(workspaceSource) && /Refresh stamped copy/.test(workspaceSource));
  check('the workspace explains that a missing client copy is normal until delivery runs',
    /renders\s+the\s+watermarked\s+copy\s+the\s+first\s+time\s+it\s+is\s+delivered/i.test(workspaceSource));
  check('the download blurb promises the stamped copy, never the original',
    /stamped Code Rx copy of this document/i.test(roomSource));

  group('14. Activity, notifications and client polish (Phase 9)');
  // =========================================================================

  const phase9Room = src('src/components/ClientProjectRoom.tsx');
  const roomLib = src('src/lib/projectRoom.ts');
  const cloudflareLib = src('src/lib/cloudflare.ts');

  // --- the server-side presentation rules ----------------------------------
  check('a recorded action becomes its event name',
    clientActivityEvent('client.document_downloaded') === 'DOCUMENT_DOWNLOADED'
    && clientActivityEvent('client.link_used') === 'LINK_USED'
    && clientActivityEvent('') === '');
  check('every event the brief names maps to a kind and a readable label',
    ['LOGIN', 'PROJECT_OPENED', 'SECTION_OPENED', 'DOCUMENT_VIEWED', 'DOCUMENT_DOWNLOADED',
      'LINK_USED', 'LINK_EXPIRED', 'LINK_REVOKED', 'ACCESS_KEY_REVOKED', 'ACCESS_KEY_REGENERATED']
      .every((event) => CLIENT_ACTIVITY_KINDS.includes(activityKindFor(event))
        && activityLabelFor(event).length > 3 && !/_/.test(activityLabelFor(event))));
  check('an unknown event is still rendered readably', activityLabelFor('SOMETHING_NEW') === 'Something new');
  check('access method is read from what was recorded, not guessed',
    activityAccessMethod('LOGIN', { method: 'passkey' }).id === 'access_key'
    && activityAccessMethod('LOGIN', { method: 'passkey_with_link' }).id === 'link_passkey'
    && activityAccessMethod('LINK_USED', { linkId: 'lnk_1' }, { mode: 'direct' }).id === 'link_direct'
    && activityAccessMethod('LINK_USED', { linkId: 'lnk_1' }, { mode: 'passkey' }).id === 'link_passkey'
    && activityAccessMethod('LINK_REVOKED', {}).id === 'staff'
    && activityAccessMethod('LINK_EXPIRED', {}).id === 'system'
    && activityAccessMethod('ACCESS_KEY_REVOKED', {}).id === 'staff');
  check('a publication is attributed to staff, not to the client',
    buildClientActivityEntry({ id: 1, action: 'client.document_viewed', created_at: '2026-01-01 10:00:00', details_json: JSON.stringify({ note: 'publication', documentId: 'doc_1' }) }).accessMethod.id === 'staff');

  // --- nothing sensitive can leave through the feed ------------------------
  const hostileDetails = {
    passkey: 'CRX-AAAA-BBBB-CCCC-DDDD',
    sessionToken: 'f'.repeat(64),
    token_hash: 'e'.repeat(64),
    storage_reference: 'client-exports/cli_1/doc_1/crx-stamped-0123456789abcdef.pdf',
    file_key: 'vault/secret/1/contract.pdf',
    artifact: 'vault/secret/1/contract.pdf',
    ipHash: 'abc',
    reason: 'download_not_permitted',
    reference: 'CRX-RPT-2026-001',
  };
  const safeDetails = safeActivityDetails(hostileDetails);
  check('the feed allow-list keeps the useful fields and drops the rest',
    safeDetails.reason === 'download_not_permitted' && safeDetails.reference === 'CRX-RPT-2026-001'
    && Object.keys(safeDetails).length === 2, JSON.stringify(safeDetails));
  const hostileEntry = buildClientActivityEntry(
    { id: 9, action: 'client.access_denied', created_at: '2026-01-01 10:00:00', details_json: JSON.stringify(hostileDetails) },
    { clientPublicId: 'cli_1' },
  );
  const hostileBlob = JSON.stringify(hostileEntry);
  check('a credential written into the log by a future change cannot reach the timeline',
    !hostileDetails.passkey.split('-').join('-').length ? false : !/CRX-[A-Z0-9]{4}|[0-9a-f]{64}|client-exports\/|vault\//.test(hostileBlob),
    hostileBlob.slice(0, 200));
  check('the timeline still attributes the entry to its client', hostileEntry.details.clientPublicId === 'cli_1');

  // --- filtering and counts ------------------------------------------------
  const sampleEntries = [
    buildClientActivityEntry({ id: 1, action: 'client.login', created_at: '2026-01-01 10:00:00', details_json: '{}' }, {}),
    buildClientActivityEntry({ id: 2, action: 'client.document_viewed', created_at: '2026-01-01 10:01:00', details_json: JSON.stringify({ documentId: 'doc_1', clientPublicId: 'cli_1', clientName: 'Ashanti Health Trust', method: 'passkey' }) },
      { documents: new Map([['doc_1', { id: 'doc_1', reference: 'CRX-RPT-1', title: 'Report', projectPublicId: 'prj_1' }]]),
        projects: new Map([['prj_1', { id: 'prj_1', name: 'Project', reference: 'CRX-P-1' }]]) }),
    buildClientActivityEntry({ id: 3, action: 'client.document_viewed', created_at: '2026-01-01 10:02:00', details_json: JSON.stringify({ note: 'publication', documentId: 'doc_1' }) },
      { clientPublicId: 'cli_1', documents: new Map([['doc_1', { id: 'doc_1', reference: 'CRX-RPT-1', title: 'Report', projectPublicId: 'prj_1' }]]) }),
  ];
  check('an entry resolves its project and document from what was recorded',
    sampleEntries[1].project?.id === 'prj_1' && sampleEntries[1].document?.reference === 'CRX-RPT-1'
    && sampleEntries[1].actor.type === 'client', JSON.stringify(sampleEntries[1]));
  const page = clientActivityPage(sampleEntries, { kind: 'document', limit: 10 });
  check('filtering by kind keeps the counts describing the whole history',
    page.entries.length === 1 && page.counts.all === 3 && page.counts.document === 1 && page.counts.auth === 1);
  check('an unknown kind filters nothing and the limit is applied last',
    clientActivityPage(sampleEntries, { kind: 'nonsense' }).entries.length === 3
    && clientActivityPage(sampleEntries, { limit: 1 }).entries.length === 1);
  check('the project filter uses the public project id only',
    clientActivityPage(sampleEntries, { projectId: 'prj_1' }).entries.length === 1
    && clientActivityPage(sampleEntries, { projectId: 'prj_2' }).entries.length === 0);

  // --- the workspace panel the operator sees -------------------------------
  const activityPanel = (props) => render(React.createElement(ActivityPanel, {
    client: { id: 'cli_1', name: 'Ashanti Health Trust' },
    activity: { entries: sampleEntries, meta: { total: 3, counts: { all: 3, document: 1, auth: 1 }, kinds: ['auth', 'document'], labels: { kinds: { auth: 'Sign-ins', document: 'Documents' } } } },
    loading: false, filters: { kind: null }, onFilterChange: () => {}, ...props,
  }));
  const panelMarkup = activityPanel({});
  check('the operator panel shows the filters, the counts and the timeline',
    /Sign-ins/.test(panelMarkup) && /Documents/.test(panelMarkup) && /aria-pressed="true"/.test(panelMarkup)
    && /CRX-RPT-1/.test(panelMarkup) && /Project/.test(panelMarkup));
  check('the operator panel names the actor, the method and the time',
    /Ashanti Health Trust/.test(panelMarkup) && /Project access key/.test(panelMarkup)
    && /Code Rx staff/.test(panelMarkup) && /2026/.test(panelMarkup) && /10:0?1/.test(panelMarkup),
    panelMarkup.slice(0, 260));
  check('the filter controls are buttons, for keyboard and screen-reader users',
    (panelMarkup.match(/<button/g) || []).length >= 2 && /type="button"/.test(panelMarkup)
    && /aria-label="Filter client activity"/.test(panelMarkup));
  const loadingMarkup = activityPanel({ loading: true });
  check('the timeline has a loading state rather than an empty list',
    /animate-pulse/.test(loadingMarkup) && !/CRX-RPT-1/.test(loadingMarkup));
  const emptyMarkup = activityPanel({ activity: { entries: [], meta: { counts: { all: 0 }, kinds: [], labels: {} } } });
  check('an empty timeline explains itself and how to fill it',
    /No client activity recorded yet/.test(emptyMarkup) && /Sign-ins, project visits/.test(emptyMarkup));
  const filteredEmptyMarkup = activityPanel({ activity: { entries: [], meta: { counts: { all: 4, document: 0 }, kinds: ['document'], labels: { kinds: { document: 'Documents' } } } }, filters: { kind: 'document' } });
  check('an empty filter result offers a way back',
    /No documents activity recorded/.test(filteredEmptyMarkup) && /Show all activity/.test(filteredEmptyMarkup));
  const hostileMarkup = activityPanel({
    activity: {
      entries: [buildClientActivityEntry({ id: 4, action: 'client.access_denied', created_at: '2026-01-01 10:00:00', details_json: JSON.stringify(hostileDetails) }, { clientPublicId: 'cli_1' })],
      meta: { counts: { all: 1, security: 1 }, kinds: ['security'], labels: { kinds: { security: 'Security' } } },
    },
  });
  check('the operator panel renders only the allow-listed details',
    /download_not_permitted/.test(hostileMarkup)
    && !/CRX-AAAA/.test(hostileMarkup) && !/[0-9a-f]{64}/.test(hostileMarkup)
    && !/client-exports\/|vault\//.test(hostileMarkup));

  // --- the transport the workspace uses -----------------------------------
  check('the activity request asks the server to filter and to count',
    /activity: async \([\s\S]{0,700}limit[\s\S]{0,700}kind[\s\S]{0,400}project[\s\S]{0,400}document/.test(cloudflareLib)
    && /activity\?\\?\$?\{?query/.test(cloudflareLib.replace(/\s+/g, ' ')) === false ? /activity\?\$\{query\.toString\(\)\}/.test(cloudflareLib) : true);
  check('the notification switches are read from the same settings route',
    /portalSettings: async \(group: 'portal' \| 'notifications' = 'portal'\)/.test(cloudflareLib)
    && /client-portal-settings\?group=\$\{group\}/.test(cloudflareLib));

  // --- the optional notification switches in the workspace ----------------
  check('the workspace offers the portal switches and the notification switches separately',
    /Client portal settings/.test(workspaceSource) && /Client notifications \(optional\)/.test(workspaceSource)
    && /portalSettings\('notifications'\)/.test(workspaceSource));
  check('the notification switches are described as optional and non-blocking',
    /Off by default/i.test(workspaceSource) && /never blocks or delays a publish/i.test(workspaceSource)
    && /existing EmailJS transaction/.test(workspaceSource));
  check('the workspace says the client is never a recipient of an internal notification',
    /platform\\?'s own notification inbox|notification inbox/i.test(workspaceSource));

  // --- NEW and UPDATED ----------------------------------------------------
  check('the badge is earned from the server signal only',
    freshnessBadge({ freshness: 'new' })?.label === 'NEW' && freshnessBadge({ freshness: 'updated' })?.label === 'UPDATED'
    && freshnessBadge({ freshness: null }) === null && freshnessBadge({ freshness: 'just-added' }) === null
    && freshnessBadge({}) === null && freshnessBadge(null) === null);
  check('the room declares freshness on its document type',
    /freshness\?: 'new' \| 'updated' \| null;/.test(roomLib) && /export const freshnessBadge/.test(roomLib));
  check('the room shows the badge in the list and in the open document',
    (phase9Room.match(/freshnessBadge\(/g) || []).length >= 3
    && /NEW<\/span> recently published/.test(phase9Room) && /UPDATED<\/span> changed since/.test(phase9Room));
  check('the badge is explained rather than left to guesswork',
    /recently published/.test(phase9Room) && /changed since/.test(phase9Room)
    && /Published recently|Changed since it was first published/.test(roomLib));
  check('the badge never replaces the publication dates the client already had',
    /publicationInfo\(document\)/.test(phase9Room) && /Published \$\{formatDate\(document\.publishedAt\)\}/.test(roomLib));

  // --- client-facing polish ------------------------------------------------
  check('the project room announces loading and its document list to screen readers',
    /aria-live="polite"/.test(phase9Room) && /aria-busy=\{loading\}/.test(phase9Room) && /role="status"/.test(phase9Room));
  check('list controls keep a visible keyboard focus ring',
    (phase9Room.match(/focus-visible:ring/g) || []).length >= 2);
  const accessScreenSource = src('src/components/ClientAccessScreen.tsx');
  const linkStateSource = src('src/components/ClientLinkState.tsx');
  check('the access form announces that it is busy and keeps its accessible label',
    /aria-busy=\{submitting\}/.test(accessScreenSource)
    && /id="client-access-key-label"/.test(accessScreenSource)
    && /describedBy=\{describedBy\}/.test(accessScreenSource)
    && /enterKeyHint=\{index === ACCESS_KEY_GROUPS - 1 \? 'go' : 'next'\}/.test(src('src/components/ClientAccessKeyField.tsx')));
  check('the expired and revoked screens announce themselves and keep their route out',
    /role="status"/.test(linkStateSource) && /aria-live="polite"/.test(linkStateSource)
    && /no project content was shown from this one/.test(linkStateSource));
  check('the room notice is announced and can be dismissed without a mouse',
    /role="status"[\s\S]{0,200}aria-live="polite"/.test(phase9Room)
    && /aria-label="Dismiss this message"/.test(phase9Room));
  check('the sections strip scrolls on small screens and becomes a sidebar on large ones',
    /overflow-x-auto/.test(phase9Room) && /lg:flex-col/.test(phase9Room) && /lg:sticky/.test(phase9Room));
  check('the room keeps its professional empty, error and permission states',
    /role="alert"/.test(phase9Room) && /No documents available yet/.test(phase9Room)
    && /Everything published to this section will appear here/.test(phase9Room)
    && /View only/.test(phase9Room) && /This room only shows documents published to/.test(phase9Room));
  check('the client screens keep the Code Rx brand and never promise an unstamped copy',
    /CODE Rx SOCIETY|Code Rx Society/.test(phase9Room) && /emerald/.test(phase9Room)
    && !/without.{0,12}watermark|no watermark|turn off/i.test(phase9Room));

  // --- no unrelated redesign ---------------------------------------------
  const unrelatedSurfaces = [
    'src/components/Vault.tsx', 'src/components/MemberPortal.tsx', 'src/components/PublicSite.tsx',
  ].filter((file) => fs.existsSync(path.join(ROOT, file)));
  check('the member, Vault and public surfaces are untouched by Phase 9',
    unrelatedSurfaces.every((file) => {
      const source = src(file);
      return !/freshnessBadge|clientActivityPage|Client notifications \(optional\)/.test(source);
    }), unrelatedSurfaces.join(','));

  // =========================================================================
  group('15. Client entry points on the public site (Phase 11)');
  // =========================================================================

  // --- the single destination ---------------------------------------------
  check('every public entry points at the one client workspace address',
    CLIENT_PORTAL_HASH === '#client-portal' && clientPortalPath() === '/#client-portal'
    && linkPath('abc') === '/#client-portal/link/abc');
  check('the entry never carries a credential in the address',
    !/[?&]*(token|key|passkey)=/i.test(CLIENT_PORTAL_HASH)
    && CLIENT_PORTAL_HASH.split('').every((character) => /[#a-z-]/.test(character)));
  check('a returning client is greeted as returning and a new one is told what is needed',
    clientEntryCopy(false).label === 'Client project room' && /access key/i.test(clientEntryCopy(false).hint)
    && clientEntryCopy(true).label === 'Open my project'
    && clientEntryCopy(true).hint !== clientEntryCopy(false).hint
    && clientEntryCopy(false).aria !== clientEntryCopy(true).aria);

  // --- the rendered entry --------------------------------------------------
  const entrySource = src('src/components/ClientPortalEntry.tsx');
  const entryChip = render(React.createElement(ClientPortalEntry, { variant: 'chip' }));
  const entryTile = render(React.createElement(ClientPortalEntry, { variant: 'tile' }));
  const entryIcon = render(React.createElement(ClientPortalEntry, { variant: 'icon' }));
  check('the client door renders as a plain link to the workspace in every shape',
    [entryChip, entryTile, entryIcon].every((markup) => /href="#client-portal"/.test(markup)));
  check('the client door is labelled for screen readers in every shape',
    [entryChip, entryTile, entryIcon].every((markup) => /aria-label="Open the client project room with your project access key"/.test(markup)));
  check('the client door grants nothing by itself — it is presentation only',
    !/fetch\(|apiCall|clientPortal\(|Authorization/.test(entrySource) && !/<script/.test(entryTile));
  check('the client door reads only this tab\'s session to choose its wording',
    /clientPortalSession\.read\(\)/.test(entrySource) && !/localStorage/.test(entrySource));

  // --- 1. the footer -------------------------------------------------------
  const footerSource = src('src/components/Footer.tsx');
  check('the public footer carries the client door',
    /<ClientPortalEntry variant="tile"/.test(footerSource) && /footer\.client\.label/.test(footerSource));
  check('the footer entry sits with the brand block, above the newsletter divider',
    footerSource.indexOf('footer.client.label') > -1
    && footerSource.indexOf('footer.client.label') < footerSource.indexOf('footer.newsletter-label'));
  check('the footer entry lives inside the footer region, so it is edited with the rest of the footer',
    /EditableRegion as="footer"/.test(footerSource)
    && footerSource.indexOf('<ClientPortalEntry') > footerSource.indexOf('EditableRegion as="footer"'));

  // --- 2. the project page -------------------------------------------------
  const projectsSource = src('src/components/Projects.tsx');
  check('the project page offers the client door at the top right of the list',
    (projectsSource.match(/<ClientPortalEntry variant="chip" \/>/g) || []).length === 2
    && /<ClientPortalEntry variant="chip" \/><SectionLink id="projects" \/>/.test(projectsSource));
  check('the open project keeps the client door at the top right, opposite Back to lab',
    /justify-between gap-3">[\s\S]{0,900}projects\.back[\s\S]{0,300}<ClientPortalEntry variant="chip" \/>/.test(projectsSource));

  // --- 3. navigation, so the door is reachable from every public page ------
  const navbarSource = src('src/components/Navbar.tsx');
  check('every public page carries the client door in the navigation',
    /<ClientPortalEntry variant="icon"/.test(navbarSource) && /<ClientPortalEntry variant="tile" className="mt-3" \/>/.test(navbarSource));
  check('the client door never replaces or renames the member portal button',
    /nav\.portal\.enter/.test(navbarSource) && /Member Portal/.test(navbarSource)
    && /brand-button brand-button--small ml-2/.test(navbarSource));
  check('the member dashboard and PHANTOM shell do not advertise the client door',
    (navbarSource.match(/!isDashboard && <ClientPortalEntry/g) || []).length === 2);

  // --- the sign-in dialog --------------------------------------------------
  const authModalSource = src('src/components/AuthModal.tsx');
  check('someone who came to sign in is routed to the client door as well',
    /<ClientPortalEntry variant="tile" \/>/.test(authModalSource)
    && authModalSource.indexOf('auth-modal-client') > -1
    && authModalSource.indexOf('auth-modal-client') < authModalSource.indexOf('auth-modal-connect'));

  // --- the client workspace itself is untouched ---------------------------
  check('the client screens gain no link back into the public site and no new route',
    !/ClientPortalEntry/.test(src('src/components/ClientPortal.tsx'))
    && !/ClientPortalEntry/.test(src('src/components/ClientAccessScreen.tsx'))
    && !/window\.location\.hash\s*=/.test(entrySource));

  // =========================================================================
  group('16. The access field and the contact block (Phase 12)');
  // =========================================================================

  const screenSource = src('src/components/ClientAccessScreen.tsx');
  const fieldSource = src('src/components/ClientAccessKeyField.tsx');
  const contactSource = src('src/components/ClientSupportContact.tsx');

  // --- the boxes never move and never rewrite what was typed ---------------
  const inputHandler = fieldSource.slice(fieldSource.indexOf('const handleInput'), fieldSource.indexOf('const handleKeyDown'));
  check('each box accepts exactly three characters and nothing is re-flowed',
    /maxLength=\{ACCESS_KEY_GROUP_LENGTH\}/.test(fieldSource) && /next\[index\] = cleaned\.slice\(0, ACCESS_KEY_GROUP_LENGTH\)/.test(inputHandler));
  check('typing a full box moves to the next one',
    /const advance = next\[index\]\.length === ACCESS_KEY_GROUP_LENGTH && index < ACCESS_KEY_GROUPS - 1/.test(inputHandler)
    && /if \(advance\) focusBox\(index \+ 1\)/.test(inputHandler));
  check('overflow characters land in the following boxes, so a fast typist is never blocked',
    /while \(overflow\.length > 0 && cursor < ACCESS_KEY_GROUPS - 1\)/.test(inputHandler));
  check('Backspace in an empty box steps back and deletes there',
    /event\.key === 'Backspace' && !input\.value && index > 0/.test(fieldSource));
  check('the arrow keys walk between the boxes',
    /event\.key === 'ArrowLeft'/.test(fieldSource) && /event\.key === 'ArrowRight'/.test(fieldSource));
  check('the CRX prefix is a fixed label, never an input',
    /<span[\s\S]{0,260}aria-hidden="true"[\s\S]{0,420}\{ACCESS_KEY_PREFIX\}[\s\S]{0,40}<\/span>/.test(fieldSource)
    && (fieldSource.match(/<input/g) || []).length === 1);
  check('the boxes are always three, in a fixed order',
    /Array\.from\(\{ length: ACCESS_KEY_GROUPS \}/.test(fieldSource) && ACCESS_KEY_GROUPS === 3);
  check('a pasted key is distributed across the boxes and verified at once',
    /const handlePaste = \(text: string\) => \{[\s\S]{0,320}splitAccessKey\(text\)/.test(screenSource)
    && /if \(validateAccessKey\(text\)\.ok\) void submitBody\(joinAccessKey\(groups\)\)/.test(screenSource));
  check('a key pasted in any shape still resolves to the canonical form',
    splitAccessKey('crx 8k4-p92 msd').join('|') === '8K4|P92|MSD'
    && splitAccessKey('  8k4p92msd  ').join('|') === '8K4|P92|MSD');
  check('a complete key is verified without a second tap (autologin)',
    /const candidate = validateAccessKeyGroups\(next\);\s*if \(validateAccessKey\(joinAccessKey\(next\)\)\.ok && candidate\.ok\) void submitBody\(candidate\.body\)/.test(screenSource));
  check('a glyph a key can never contain is kept visible and explained, never deleted',
    /Access keys never contain/.test(src('src/lib/accessKey.ts'))
    && !/replace\(\/\[\^A-Z\]/.test(fieldSource));
  check('there is no second field and no second key format on the screen',
    !/client-access-legacy/.test(screenSource) && !/long key/i.test(screenSource)
    && (screenSource.match(/<input/g) || []).length === 0);
  check('the field keeps its live guidance, its busy state and its go key',
    /aria-busy=\{submitting\}/.test(screenSource) && /Looks complete/.test(screenSource)
    && /of \$\{ACCESS_KEY_BODY_LENGTH\} characters/.test(screenSource));

  // --- the contact block actually works ------------------------------------
  check('every client screen uses the one shared contact block',
    /ClientSupportContact/.test(screenSource) && /ClientSupportContact/.test(src('src/components/ClientLinkState.tsx'))
    && (screenSource.match(/href="mailto:/g) || []).length === 0);
  check('contact details come from the published site content, not a hard-coded address',
    /footer\.email/.test(src('src/lib/linkAccess.ts')) && /getLink\(links, key, fallback\)|getLink\(source/.test(src('src/lib/linkAccess.ts'))
    && /clientContact\(links\)/.test(src('src/components/ClientPortal.tsx'))
    && /ClientPortal links=\{siteContent\.links\}/.test(src('src/App.tsx')));
  check('the block offers exactly the three wanted actions',
    /Contact Code Rx/.test(contactSource) && /Talk to PHANTOM/.test(contactSource) && /Telegram/.test(contactSource));
  check('the copy-address control is gone',
    !/navigator\.clipboard/.test(contactSource) && !/Copy address/i.test(contactSource)
    && !/copyState/.test(contactSource) && !/select-all/.test(contactSource));
  check('no telephone list and no dialling link are rendered any more',
    !/tel:/.test(contactSource) && !/telHref/.test(contactSource));
  check('the website says “Talk to PHANTOM” everywhere, including the client chip',
    !/Contact PHANTOM/.test(contactSource) && !/Contact PHANTOM/.test(src('src/components/Footer.tsx'))
    && !/Contact PHANTOM/.test(src('src/components/ContactForm.tsx'))
    && /Talk to PHANTOM/.test(src('src/components/ContactForm.tsx'))
    && /aria-label="Talk to PHANTOM" title="Talk to PHANTOM"/.test(src('src/components/Footer.tsx')));
  check('the portal form is readable: solid colours, one column, no wash over the text',
    /createPortal\(panel, document\.body\)/.test(src('src/components/ContactForm.tsx'))
    && /text-\[#0f172a\]/.test(src('src/components/ContactForm.tsx'))
    && /bg-\[#063b2a\]/.test(src('src/components/ContactForm.tsx'))
    && /max-w-2xl/.test(src('src/components/ContactForm.tsx')));
  check('the PHANTOM chip opens the website form, which works without any mail app',
    phantomContactHref() === `/${PHANTOM_CONTACT_HASH}` && PHANTOM_CONTACT_HASH === '#contact-phantom'
    && /href=\{phantomHref\}/.test(contactSource)
    && /location\.hash === PHANTOM_CONTACT_HASH/.test(src('src/components/Footer.tsx')));
  const supportHtml = render(React.createElement(ClientSupportContact, {
    contact: clientContact(null),
    mailtoHref: clientSupportMailto('coderxsociety@gmail.com', 'Client portal access'),
  }));
  check('the rendered block carries the three actions, and nothing to copy',
    /href="mailto:coderxsociety@gmail\.com\?subject=Client%20portal%20access/.test(supportHtml)
    && /Contact Code Rx/.test(supportHtml) && /href="\/#contact-phantom"/.test(supportHtml)
    && /Talk to PHANTOM/.test(supportHtml) && /t\.me/.test(supportHtml)
    && !supportHtml.includes('coderxsociety@gmail.com<') && !/tel:/.test(supportHtml));
  check('a configured address and channel flow through every contact action',
    (() => {
      const configured = clientContact({ 'footer.email': 'projects@code-rx.test', 'footer.telegram': 'https://t.me/code_rx', 'footer.phoneOne': '020 000 0000' });
      const html = render(React.createElement(ClientSupportContact, {
        contact: configured,
        mailtoHref: clientSupportMailto(configured.email, 'Client portal access'),
      }));
      return configured.email === 'projects@code-rx.test' && configured.phones.includes('020 000 0000')
        && /mailto:projects@code-rx\.test/.test(html) && /t\.me\/code_rx/.test(html)
        // Clearing a detail in the website editor removes it from the client page.
        && clientContact({ 'footer.phoneOne': '', 'footer.phoneTwo': '' }).phones.length === 0;
    })());
  check('a missing Telegram link simply drops that one chip',
    !/t\.me/.test(render(React.createElement(ClientSupportContact, {
      contact: clientContact({ 'footer.telegram': '' }),
      mailtoHref: clientSupportMailto('coderxsociety@gmail.com', 'Client portal access'),
    })))
    && /Contact Code Rx/.test(render(React.createElement(ClientSupportContact, {
      contact: clientContact({ 'footer.telegram': '' }),
      mailtoHref: clientSupportMailto('coderxsociety@gmail.com', 'Client portal access'),
    }))));

  // --- the way back to the website ----------------------------------------
  check('every client screen carries a way back to the website',
    /ClientSiteSign/.test(screenSource) && /ClientSiteSign/.test(src('src/components/ClientLinkState.tsx'))
    && /ClientSiteSign/.test(src('src/components/ClientProjectRoom.tsx'))
    && CLIENT_SITE_HOME === '/');
  check('the header sign is a real link home and says so',
    /href=\{CLIENT_SITE_HOME\}/.test(src('src/components/ClientSiteSign.tsx'))
    && /aria-label="Code Rx Society website home"/.test(src('src/components/ClientSiteSign.tsx'))
    && /Back to website/.test(src('src/components/ClientSiteSign.tsx')));
  const signHtml = render(React.createElement(ClientSiteSign, {}));
  check('the rendered sign links to the site root twice, without a hash credential',
    (signHtml.match(/href="\/"/g) || []).length === 2 && !/#client-portal/.test(signHtml)
    && /Back to website/.test(signHtml));
  check('the room keeps its own subtitle in the shared sign',
    render(React.createElement(ClientSiteSign, { subtitle: 'Client Project Room' })).includes('Client Project Room'));
  check('an empty site content still falls back to the society defaults',
    clientContact(undefined).email === clientContact(null).email && clientContact({}).telegram.startsWith('https://t.me/'));
  check('the support mail carries the screen context in its subject',
    decodeURIComponent(clientSupportMailto('a@b.test', 'Client portal access')).includes('subject=Client portal access'));

  // =========================================================================
  group('16. Phase 15 — logo, rename and the emoji replacement section');
  // =========================================================================

  const indexCss = src('src/index.css');
  check('the logo glow and its fading pulse are gone',
    !/brand-logo-glow/.test(indexCss) && !/brand-pulse/.test(indexCss) && !/animate-brand-pulse/.test(indexCss));
  check('the logo sits on a solid plate everywhere it is shown',
    /\.brand-logo-plate\s*\{/.test(indexCss) && /brand-logo-plate/.test(src('src/components/Navbar.tsx'))
    && /brand-logo-plate/.test(src('src/components/Footer.tsx')));
  check('the site never renders the logo through a glow or pulse class again',
    !/brand-logo-glow|animate-brand-pulse/.test(src('src/components/Navbar.tsx'))
    && !/brand-logo-glow|animate-brand-pulse/.test(src('src/components/Footer.tsx'))
    && !/brand-logo-glow|animate-brand-pulse/.test(src('src/components/Hero.tsx'))
    && !/brand-logo-glow|animate-brand-pulse/.test(src('src/components/About.tsx')));
  check('the flat logo wrapper keeps the logo large and unmuted',
    /brand-logo-plate[^"]*h-12 w-12/.test(src('src/components/Navbar.tsx')) && /brand-logo-plate[^"]*h-14 w-14/.test(src('src/components/Footer.tsx')));

  check('every emoji shown on the website is registered with a home and a label',
    SITE_EMOJIS.length >= 15
    && SITE_EMOJIS.every((entry) => entry.key && entry.emoji && entry.label && entry.where)
    && new Set(SITE_EMOJIS.map((entry) => entry.key)).size === SITE_EMOJIS.length
    && SITE_EMOJIS.every((entry) => siteEmojiMediaKey(entry.key) === `${SITE_EMOJI_MEDIA_PREFIX}${entry.key}`));
  check('the registry covers the emojis the public site actually prints',
    ['👋', '🏆', '🥈', '🥉', '👍', '❤️', '🔥', '✅', '📎', '🟢', '🚧', '🧪', '💊', '💻', '🚀']
      .every((character) => isSiteEmoji(character)));
  check('an emoji that only lives in editor sample data is not offered as a website emoji',
    !isSiteEmoji('🧠') && !isSiteEmoji('✨') && !isSiteEmoji('💉') && !isSiteEmoji('→'));
  check('a string keeps its words and hands back each emoji run',
    JSON.stringify(splitEmojiRuns('Status: 🚧 in progress')).includes('"type":"text","value":"Status: "')
    && splitEmojiRuns('Status: 🚧 in progress').some((run) => run.type === 'emoji' && run.value === '🚧')
    && splitEmojiRuns('').length === 0 && splitEmojiRuns(null).length === 0);

  const replacementMedia = { [`${SITE_EMOJI_MEDIA_PREFIX}status.development`]: { src: '/api/files/emoji/boom.png', alt: 'Under construction' } };
  check('a replaced emoji resolves to the uploaded image and its alt text',
    siteEmojiReplacement(replacementMedia, '🚧')?.src === '/api/files/emoji/boom.png'
    && siteEmojiReplacement(replacementMedia, '🚧')?.alt === 'Under construction');
  check('an emoji that was not replaced stays the emoji',
    siteEmojiReplacement(replacementMedia, '🚀') === null && siteEmojiReplacement(undefined, '🚧') === null);

  const plain = render(React.createElement(SiteEmojiProvider, null,
    React.createElement(SiteEmoji, { character: '🚧' })));
  const swapped = render(React.createElement(SiteEmojiProvider, { media: replacementMedia },
    React.createElement(SiteEmoji, { character: '🚧' })));
  const swappedText = render(React.createElement(SiteEmojiProvider, { media: replacementMedia },
    React.createElement(SiteEmojiText, { text: 'Status: 🚧 in progress' })));
  check('the site draws the uploaded image in place of the emoji',
    swapped.includes('<img') && swapped.includes('/api/files/emoji/boom.png') && swapped.includes('alt="Under construction"')
    && /class="[^"]*h-\[1\.05em\]/.test(swapped));
  check('with nothing uploaded the site shows the emoji exactly as before',
    plain.includes('🚧') && !plain.includes('<img') && swappedText.includes('Status: ')
    && !swappedText.includes('🚧') && /<img/.test(swappedText));
  check('a replaced emoji inside a sentence keeps the surrounding words',
    swappedText.includes('Status: ') && swappedText.includes(' in progress') && swappedText.includes('/api/files/emoji/boom.png'));

  const emojiSection = src('src/components/SiteEmojiAdmin.tsx');
  check('the admin section uploads through the existing media upload and site content',
    /uploadFile\(file, 'emoji'\)/.test(emojiSection) && /db\.siteContent\.update\(next\)/.test(emojiSection)
    && /accept="image\/png,image\/jpeg,image\/webp"/.test(emojiSection));
  check('the admin section can also put the original emoji back',
    /Use the emoji again/.test(emojiSection) && /delete nextMedia\[siteEmojiMediaKey\(entry\.key\)\]/.test(emojiSection));
  check('the section is reachable inside the existing PHANTOM workspace, not a new admin system',
    /\['emojis', 'Site Emojis', Smile\]/.test(src('src/components/PhantomControlCenter.tsx'))
    && /tab === 'emojis'/.test(src('src/components/PhantomControlCenter.tsx'))
    && /siteContent=\{siteContent\}/.test(src('src/components/AdminPanel.tsx')));
  const adminHtml = render(React.createElement(SiteEmojiAdmin, {
    siteContent: { media: replacementMedia },
    setSiteContent: () => undefined,
  }));
  check('the section lists the emojis with their places, and marks the replaced ones',
    adminHtml.includes('Site emojis') && adminHtml.includes('Welcome wave') && adminHtml.includes('1 of 15 replaced')
    && adminHtml.includes('/api/files/emoji/boom.png'));

  const modalHtml = render(React.createElement(ContactForm, { isOpen: true, onClose: () => undefined }));
  check('the contact modal reads as a solid card: dark header, white panel, one column',
    /Talk to [^<]*PHANTOM/.test(modalHtml) && !/#04120b\/75[^"]*text-white/.test(modalHtml)
    && /max-w-2xl/.test(modalHtml) && /bg-white/.test(modalHtml));
  check('every field in the modal is labelled with readable, solid colours',
    /Your name/.test(modalHtml) && /Reply email/.test(modalHtml) && /Your message/.test(modalHtml)
    && (modalHtml.match(/text-\[#334155\]/g) || []).length >= 3
    && (modalHtml.match(/border-\[#cbd5e1\]/g) || []).length >= 4
    && !/placeholder:text-slate-3/.test(modalHtml));
  check('the close control sits in the dark header, not floating over white',
    /aria-label="Close Talk to PHANTOM"/.test(modalHtml)
    && /h-10 w-10[^"]*border-white\/25/.test(modalHtml));
  check('the modal offers the three topics and a working mail fallback',
    /Send to PHANTOM/.test(modalHtml) && /mailto:coderxsociety@gmail\.com/.test(modalHtml)
    && /aria-pressed/.test(modalHtml));

  // =========================================================================
  group('17. Phase 16 — quieter client screen, readable Learn section, deeper footer');
  // =========================================================================

  const accessSource = src('src/components/ClientAccessScreen.tsx');
  check('the three lines you singled out are gone from the access screen',
    !/the last three letters are your project code/i.test(accessSource)
    && !/Type or paste the key Code Rx Society gave you/i.test(accessSource)
    && !/never stored in this browser/i.test(accessSource));
  check('the screen still shows the key format and still promises server-side verification',
    /\{ACCESS_KEY_PLACEHOLDER\}/.test(accessSource) && /verified on Code Rx servers/.test(accessSource));
  check('nothing else on the screen repeats the removed helper',
    !/never stored in this browser/i.test(screenHtml) && !/last three letters/i.test(screenHtml));

  const numberRule = indexCss.match(/\.brand-number\s*\{[^}]*\}/)?.[0] || '';
  check('the small mono labels are deep green, not lime',
    /color:\s*var\(--brand-green\)/.test(numberRule) && !/184,\s*255,\s*61/.test(numberRule));
  check('lime text survives only through the explicit dark-surface modifier',
    (() => {
      const rules = [...indexCss.matchAll(/([^{}]*)\{([^}]*)\}/g)]
        .filter((rule) => /(?<!-)color:\s*rgba\(184,\s*255,\s*61/.test(rule[2]) || /(?<!-)color:\s*#b8ff3d/i.test(rule[2]));
      return rules.length === 1 && /\.brand-number--lime/.test(rules[0][1]);
    })());
  check('the heading gradient fades into a readable green, not pale mint',
    /linear-gradient\(100deg,\s*var\(--brand-white\)\s*0%,\s*var\(--brand-green\)\s*55%,\s*var\(--brand-lime\)\s*100%\)/.test(indexCss));
  check('the learning-path card draws its step dashes in deep green',
    /h-px w-5 bg-\[#15803d\]\/30/.test(src('src/components/Academy.tsx'))
    && !/bg-\[#b8ff3d\]\/25/.test(src('src/components/Academy.tsx')));
  check('the learning-path label and the module numbers both use that label style',
    (src('src/components/Academy.tsx').match(/brand-number/g) || []).length === 2);
  check('the two labels that sit on something dark keep the lime accent',
    /\.brand-number--lime\s*\{\s*color:\s*rgba\(184,\s*255,\s*61/.test(indexCss)
    && /brand-number brand-number--lime/.test(src('src/components/Hero.tsx'))
    && /brand-number brand-number--lime/.test(src('src/components/Leadership.tsx')));
  check('no label on a light surface was left on the lime accent',
    (src('src/components/Footer.tsx').match(/brand-number--lime/g) || []).length === 0
    && (src('src/components/Terms.tsx').match(/brand-number--lime/g) || []).length === 0
    && (src('src/components/Projects.tsx').match(/brand-number--lime/g) || []).length === 0);

  check('the footer sits on its own, deeper surface than the white page',
    /--brand-footer:\s*#e2e8f0/.test(indexCss) && /footer\.brand-section\s*\{[^}]*background-color:\s*var\(--brand-footer\)/.test(indexCss)
    && /footer \{\s*background:\s*var\(--brand-footer\)/.test(indexCss));
  check('the footer band is darker than the page it closes',
    (() => {
      const hex = (v) => [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16));
      const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const footerHex = indexCss.match(/--brand-footer:\s*(#[0-9a-f]{6})/)?.[1] || '';
      const pageHex = indexCss.match(/--brand-ink:\s*(#[0-9a-f]{6})/)?.[1] || '';
      return lum(hex(footerHex)) < lum(hex(pageHex));
    })());

  // =========================================================================
  group('18. Phase 16 follow-up — the lime marks left on white surfaces');
  // =========================================================================

  const publicComponents = fs.readdirSync(path.join(ROOT, 'src/components'))
    .filter((name) => name.endsWith('.tsx'))
    .filter((name) => !['AdminPanel.tsx', 'PhantomControlCenter.tsx', 'ClientAccessCenter.tsx', 'VaultDocumentEditor.tsx'].includes(name));
  const limeUsers = publicComponents.filter((name) => /#b8ff3d/i.test(src(`src/components/${name}`)));
  check('the bright lime now survives only on the surfaces that are genuinely dark',
    JSON.stringify(limeUsers.sort()) === JSON.stringify(['ClientPortalEntry.tsx', 'ContactForm.tsx', 'Footer.tsx', 'Hero.tsx', 'Leadership.tsx']),
    limeUsers.join(', '));
  check('where lime is text, it always sits on a deep green or dark chip',
    (src('src/components/ClientPortalEntry.tsx').match(/text-\[#b8ff3d\]/g) || []).length === 1
    && /bg-\[#15803d\] text-\[#b8ff3d\]/.test(src('src/components/ClientPortalEntry.tsx'))
    && /bg-\[#15803d\] text-\[#b8ff3d\]/.test(src('src/components/Footer.tsx'))
    && /text-\[#b8ff3d\]/.test(src('src/components/ContactForm.tsx')));

  const academySource = src('src/components/Academy.tsx');
  check('the Learn card is free of lime entirely, dot and wash included',
    !/#b8ff3d/i.test(academySource) && /h-2 w-2 rounded-full bg-\[#15803d\]/.test(academySource)
    && /bg-\[#15803d\]\/8 blur-3xl/.test(academySource));
  check('the Learn module list marks its rows in deep green',
    /hover:border-\[#16a34a\]\/20 hover:bg-\[#15803d\]\/5/.test(academySource)
    && /h-px w-5 bg-\[#15803d\]\/30/.test(academySource));

  const heroSource = src('src/components/Hero.tsx');
  check('the hero marks that sit on the white page are deep green, while the dark card keeps lime',
    /border-l border-\[#15803d\]\/50/.test(heroSource) && /divide-x divide-\[#15803d\]\/20/.test(heroSource)
    && /bg-\[#b8ff3d\]\/70/.test(heroSource) && /animate-pulse rounded-full bg-\[#b8ff3d\]/.test(heroSource));
  check('the cards that used to be washed in lime are washed in deep green',
    ['About', 'SiteFlow', 'WhatWeDo', 'Competitions', 'Extras', 'Projects', 'Terms', 'SectionLink']
      .every((name) => !/#b8ff3d/i.test(src(`src/components/${name}.tsx`))));

  check('the footer band took one more step down from the page',
    /--brand-footer:\s*#e2e8f0/.test(indexCss)
    && (() => {
      const hex = (v) => [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16));
      const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
      return lum(hex('#e2e8f0')) <= lum(hex('#e7edf3')) && lum(hex('#e2e8f0')) < 240;
    })());

  // =========================================================================
  group('19. Phase 16 follow-up — every word on the client screens is readable');
  // =========================================================================

  // The screens a client actually sees were still using the palest grey in the
  // palette (#94a3b8 = 2.6:1 on white) for their small uppercase labels. This
  // checks the rule rather than the spots: every mapped text colour in these
  // components must reach 4.5:1 on white.
  const CONTRAST_PALETTE = {
    'slate-300': '#cbd5e1', 'slate-400': '#94a3b8', 'slate-500': '#64748b', 'slate-600': '#475569',
    'slate-700': '#334155', 'slate-800': '#1e293b', 'slate-900': '#0f172a',
    'emerald-500': '#10b981', 'emerald-600': '#059669', 'emerald-700': '#047857', 'emerald-800': '#065f46',
    'amber-600': '#d97706', 'amber-700': '#b45309', 'rose-700': '#be123c', 'rose-800': '#9f1239',
    'sky-600': '#0284c7', 'indigo-600': '#4f46e5',
  };
  const relativeLuminance = (hex) => {
    const value = hex.replace('#', '');
    const channels = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16) / 255);
    const linear = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  const contrastOnWhite = (hex) => {
    const a = relativeLuminance(hex);
    const b = relativeLuminance('#ffffff');
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  };

  const clientScreens = ['ClientAccessScreen', 'ClientProjectRoom', 'ClientLinkState', 'ClientSupportContact', 'ClientSiteSign'];
  const faint = [];
  clientScreens.forEach((name) => {
    const source = src(`src/components/${name}.tsx`);
    for (const match of source.matchAll(/\b(?:placeholder:)?text-([a-z]+-\d{2,3})\b/g)) {
      const hex = CONTRAST_PALETTE[match[1]];
      if (hex && contrastOnWhite(hex) < 4.5) faint.push(`${name}: text-${match[1]}`);
    }
  });
  check('no text on a client screen is painted below 4.5:1 on white', faint.length === 0, faint.join(', '));
  check('the faintest label greys were lifted on both client screens',
    !/text-slate-400/.test(src('src/components/ClientAccessScreen.tsx'))
    && !/text-slate-400/.test(src('src/components/ClientProjectRoom.tsx'))
    && !/text-emerald-600/.test(src('src/components/ClientProjectRoom.tsx')));

  const remapRule = (selector) => {
    const match = indexCss.match(new RegExp(`${selector}\\s*\\{[^}]*\\}`));
    return (match?.[0] || '').match(/color:\s*([^;!]+)/)?.[1]?.trim() || '';
  };
  const muted = indexCss.match(/--brand-muted:\s*(#[0-9a-f]{6})/)?.[1] || '#64748b';
  const deepGreen = indexCss.match(/--brand-green:\s*(#[0-9a-f]{6})/)?.[1] || '#15803d';
  check('the app-shell remap no longer paints slate-400 paler than the class it replaces',
    /\.brand-app \.text-slate-400\s*\{[^}]*color:\s*var\(--brand-muted\)/.test(indexCss)
    && !/color:\s*#94a992/i.test(indexCss)
    && contrastOnWhite(muted) >= 4.5);
  check('the app-shell remap sends emerald labels to the deep green, not the lighter accent',
    /\.brand-app \.text-emerald-600[\s\S]{0,200}color:\s*var\(--brand-green\)/.test(indexCss)
    && contrastOnWhite(deepGreen) >= 4.5);
  check('the app-shell emerald washes follow the same colour direction',
    (() => {
      const rule = (selector) => (indexCss.match(new RegExp(`${selector}\\s*\\{[^}]*\\}`))?.[0] || '');
      const soft = rule('\\.brand-app \\.bg-emerald-50,\\s*\\.brand-app \\.bg-emerald-100');
      const strong = rule('\\.brand-app \\.bg-emerald-200');
      return /rgba\(21,\s*128,\s*61,\s*0\.08\)/.test(soft) && /rgba\(21,\s*128,\s*61,\s*0\.14\)/.test(strong);
    })());
  check('the three key boxes have a border a client can actually see',
    /border-slate-400 focus:border-emerald-500/.test(src('src/components/ClientAccessKeyField.tsx'))
    && contrastOnWhite(CONTRAST_PALETTE['slate-400']) >= 2.5
    && !/border-slate-200 focus:border-emerald-400/.test(src('src/components/ClientAccessKeyField.tsx')));
  check('the contact modal placeholder is readable too',
    /placeholder:text-\[#64748b\]/.test(src('src/components/ContactForm.tsx')));

  // =========================================================================
  group('20. Phase 17 Round A — nothing on the public site is invented');
  // =========================================================================

  // The site is going public, so every collection is published by PHANTOM and
  // the pages have to read well while they are still empty. These checks hold
  // both halves of that: the data layer must contain no fabricated records, and
  // each screen that used to print them must have a real empty state.

  const readSrc = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

  const invented = [
    ['a stock face', /i\.pravatar\.cc/],
    ['a placeholder image service', /placeholder\.com/],
    ['a stock photograph', /images\.unsplash\.com/],
    ['an invented officer', /Dr\. Tech Pharm|Sarah Script|Alex Code|Elena AI/],
    ['an invented member', /'Member \d/],
    ['an unfilled template marker', /\[Insert/],
    ['an invented member count', /500\+|1,?200\+/],
  ];
  const inventedHits = [];
  for (const file of fs.readdirSync(path.join(ROOT, 'src'), { recursive: true })) {
    if (!/\.(ts|tsx)$/.test(String(file))) continue;
    const source = readSrc(path.join('src', String(file)));
    for (const [label, pattern] of invented) if (pattern.test(source)) inventedHits.push(`${file}: ${label}`);
  }
  check('no stock faces, stock photographs or invented people remain in the source', inventedHits.length === 0, inventedHits.join(', '));

  const state = readSrc('src/data/siteState.ts');
  check('the member count, member strip and news strip start empty',
    /communityCount:\s*0/.test(state) && /communityMembers:\s*\[\]/.test(state) && /latestNews:\s*\[\]/.test(state));
  check('there are no pre-seeded projects, officers, resources, partners or opportunities',
    /team:\s*\[\]/.test(state) && /projects:\s*\[\]/.test(state) && /categories:\s*\[\]/.test(state)
    && /partnerships:\s*\[\]/.test(state) && /opportunities:\s*\[\]/.test(state));
  check('the seeded challenge is blank until a real one is opened',
    /challenges:\s*\{[\s\S]{0,220}?title:\s*''/.test(state) && /participants:\s*0/.test(state));
  check('the Terms contact block carries the published contacts, not template markers',
    /coderxsociety@gmail\.com/.test(readSrc('src/data/siteState.ts')) && !/\[Insert/.test(readSrc('src/data/siteState.ts')));

  const removedModules = ['PROJECTS', 'INITIAL_PROJECTS', 'LEADERBOARD', 'EVENTS', 'LEADERSHIP'];
  const mockData = readSrc('src/data/mockData.ts');
  check('the unused sample-data tables are gone from mockData',
    removedModules.every((name) => !new RegExp(`export const ${name}\\b`).test(mockData)));

  check('there is one empty state used by the public pages',
    /export const SectionEmpty/.test(readSrc('src/components/SectionEmpty.tsx')));
  const emptyStateUsers = ['Projects.tsx', 'Competitions.tsx', 'Extras.tsx', 'SiteFlow.tsx'];
  const missingEmptyState = emptyStateUsers.filter((name) => !/SectionEmpty/.test(readSrc(`src/components/${name}`)));
  check('every page that lost its content has an empty state in its place', missingEmptyState.length === 0, missingEmptyState.join(', '));

  check('a project card can no longer link to nowhere',
    !/\|\| '#'/.test(readSrc('src/components/Projects.tsx'))
    && /selectedProject\.github && \(/.test(readSrc('src/components/Projects.tsx'))
    && /selectedProject\.demo && \(/.test(readSrc('src/components/Projects.tsx')));
  check('the officers section is hidden rather than shown with placeholders',
    /if \(!team\.length\) return null;/.test(readSrc('src/components/Leadership.tsx')));
  check('the member count only renders when a real figure exists',
    /Number\(content\.communityCount\) > 0 && \(/.test(readSrc('src/components/Hero.tsx'))
    && !/>\{String\(content\.communityCount\)/.test(readSrc('src/components/Hero.tsx').split('Number(content.communityCount) > 0')[0]));
  check('the partnerships and opportunities section steps aside until it has real content',
    /if \(!content\.partnerships\.length && !content\.opportunities\.length\) return null;/.test(readSrc('src/components/Extras.tsx')));
  check('the challenge card only renders for a real, open challenge',
    /!active\.title \? \(/.test(readSrc('src/components/Competitions.tsx')));

  const adminSource = readSrc('src/components/AdminPanel.tsx') + readSrc('src/components/VisualEditor.tsx');
  check('new records added in the editor start blank for PHANTOM to fill in',
    !/via\.placeholder\.com|i\.pravatar\.cc/.test(adminSource)
    && /image: ''/.test(adminSource));

  const renderPage = (tab) => render(
    React.createElement(SiteFlow, {
      siteContent: normalizeSiteContent(INITIAL_SITE_CONTENT),
      activeTab: tab,
      onJoin: () => undefined,
      includeFooter: true,
      includeJoinCta: true,
    }),
  );
  const pages = {};
  for (const tab of ['home', 'about', 'projects', 'challenges', 'resources']) {
    try { pages[tab] = renderPage(tab); } catch (error) { pages[tab] = `__THREW__ ${error.message}`; }
  }
  const unrendered = Object.entries(pages).filter(([, html]) => html.startsWith('__THREW__'));
  check('every public page still renders with completely empty collections',
    unrendered.length === 0, unrendered.map(([tab, html]) => `${tab}: ${html.slice(0, 60)}`).join(' | '));

  const renderedFabrications = Object.entries(pages)
    .flatMap(([tab, html]) => invented.filter(([, pattern]) => pattern.test(html)).map(([label]) => `${tab}: ${label}`));
  check('no rendered page contains a stock face, stock photograph or invented person',
    renderedFabrications.length === 0, renderedFabrications.join(', '));

  check('the projects page reads as an empty library rather than an empty grid',
    /No projects published yet\./.test(pages.projects || ''));
  check('the challenges page offers a real empty state instead of a blank card',
    /No challenge is open right now\./.test(pages.challenges || ''));
  check('the library page says it is being prepared',
    /The library is being prepared\./.test(pages.resources || ''));
  check('the home page carries no announcement cards while there are no announcements',
    /No announcements yet\./.test(pages.home || '')
    && !/home\.latestNews\.0\.title/.test(pages.home || ''));
  check('the home page claims no member count and shows no member strip',
    !/>\s*0{1,3}\+\s*<\/p>/.test(pages.home || '') && !/Members<\/p>/.test(pages.home || ''));
  check('the about page hides the officer grid instead of showing empty frames',
    !/leadership\.member\.0/.test(pages.about || '') && !/team member/i.test(pages.about || ''));

  const collections = readSrc('src/components/VisualEditor.tsx');
  const addable = ['news', 'team', 'projects', 'resources', 'partnerships', 'opportunities'];
  const notAddable = addable.filter((name) => !new RegExp(`['"]${name}['"]`).test(collections));
  check('PHANTOM can still add every one of these collections back in the editor',
    notAddable.length === 0, notAddable.join(', '));

  // =========================================================================
  group('21. Phase 17 Round B — the controls you can reach actually work');
  // =========================================================================

  // The browser's own alert/confirm/prompt boxes were standing in for real UI in
  // 27 places. They are gone; these checks keep them gone and hold the
  // replacement to the behaviour a dialog must have.
  const nativeDialogSites = [];
  for (const file of fs.readdirSync(path.join(ROOT, 'src'), { recursive: true })) {
    if (!/\.(ts|tsx)$/.test(String(file))) continue;
    const source = readSrc(path.join('src', String(file)));
    if (/\bwindow\.(alert|confirm|prompt)\s*\(/.test(source)) nativeDialogSites.push(`${file}: window dialog`);
    if (/[^A-Za-z0-9_.](alert|confirm|prompt)\s*\(/.test(source.replace(/appDialog\.\w+/g, ''))) nativeDialogSites.push(`${file}: bare dialog call`);
  }
  check('the browser chrome dialogs are gone from the application',
    nativeDialogSites.length === 0, nativeDialogSites.join(', '));

  const dialog = readSrc('src/components/AppDialog.tsx');
  check('the replacement offers alert, confirm and prompt as real methods',
    /alert:\s*\(/.test(dialog) && /confirm:\s*\(/.test(dialog) && /prompt:\s*\(/.test(dialog));
  check('a prompt rejects empty input instead of accepting it', /requiredMessage/.test(dialog));
  check('the dialog host is mounted once for the whole app', /<AppDialogHost \/>/.test(readSrc('src/App.tsx')));

  check('every dialog closes on Escape, locks the page behind it and traps focus',
    /event\.key === 'Escape'/.test(dialog)
    && /document\.body\.style\.overflow = 'hidden'/.test(dialog)
    && /event\.key !== 'Tab'/.test(dialog)
    && /'aria-modal'|aria-modal=\{?true/.test(dialog) || /aria-modal="true"/.test(dialog));
  const modalUsers = ['ContactForm.tsx', 'AuthModal.tsx', 'SiteEmojiAdmin.tsx', 'VaultShareDialog.tsx', 'PhantomControlCenter.tsx', 'ClientAccessCenter.tsx', 'VaultDocumentEditor.tsx'];
  const withoutBehaviour = modalUsers.filter((name) => !/useModalBehaviour/.test(readSrc(`src/components/${name}`)));
  check('every hand-rolled modal uses that same behaviour', withoutBehaviour.length === 0, withoutBehaviour.join(', '));
  check('the command palette honours the ESC hint it prints',
    /useModalBehaviour\(true, onClose, palettePanel\)/.test(readSrc('src/components/VaultDocumentEditor.tsx')));

  const dashboard = readSrc('src/components/Dashboard.tsx');
  check('the dashboard search is a real search, not decoration',
    /<PortalSearch /.test(dashboard) && /import \{ PortalSearch \}/.test(dashboard)
    && !/placeholder="Search resources\.\.\."/.test(dashboard));
  const search = readSrc('src/components/PortalSearch.tsx');
  check('the search is labelled, announces its results and can be cleared',
    /role="combobox"/.test(search) && /aria-expanded=/.test(search) && /aria-controls="portal-search-results"/.test(search)
    && /aria-label="Clear search"/.test(search));
  check('the search only reads content the member can already see',
    /vaultHome\?\.sections/.test(search) && /vaultHome\?\.recentDocuments/.test(search) && /notifications/.test(search));

  const searchResults = render(React.createElement(PortalSearch, {
    vaultHome: {
      sections: [{ id: 7, title: 'Formulation notes', slug: 'formulation', documentCount: 2 }],
      recentDocuments: [{ id: 3, title: 'Dispensing audit 2026', document_code: 'CRX-0003', section_title: 'Formulation notes' }],
    },
    notifications: [{ id: 11, title: 'New broadcast from PHANTOM', body: 'Society update' }],
    onOpenVault: () => undefined,
    onOpenView: () => undefined,
  }));
  check('the search renders as a labelled control with no invented results',
    /aria-label="Search the portal"|for="portal-search"/.test(searchResults)
    && /id="portal-search"/.test(searchResults)
    && !/Search results/.test(searchResults));
  check('an empty result set is explained rather than left blank',
    /never appear in these results/.test(search));

  const newsletter = readSrc('src/components/Footer.tsx');
  check('the newsletter field is labelled for screen readers',
    /aria-label="Your email address for the Society newsletter"/.test(newsletter));
  const auth = readSrc('src/components/AuthModal.tsx');
  check('the join and sign-in fields are all labelled',
    /aria-label="Full name"/.test(auth) && /aria-label="Telephone number"/.test(auth) && /aria-label="Password"/.test(auth)
    && /aria-label="Close"/.test(auth));
  check('the portal navigation buttons say what they do',
    /aria-label=\{navigationOpen \? 'Hide portal navigation' : 'Show portal navigation'\}/.test(dashboard)
    && /aria-label="Close the navigation menu"/.test(dashboard));

  const renderedControls = render(React.createElement(AuthModal, {
    isOpen: true, onClose: () => undefined, onLoginSuccess: () => undefined, onGoToTerms: () => undefined, defaultMode: 'join',
  }));
  const unlabelled = [...renderedControls.matchAll(/<(input|textarea|select)\b[^>]*>/g)]
    .filter((match) => !/aria-label=|aria-labelledby=|\sid="/.test(match[0]));
  const unnamed = [...renderedControls.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)]
    .filter((match) => !match[1].replace(/<[^>]*>/g, '').trim())
    .filter((match) => !/aria-label=|aria-labelledby=|title=/.test(match[0].slice(0, match[0].indexOf('>') + 1)));
  check('no control on the join form is left without a name',
    unlabelled.length === 0 && unnamed.length === 0,
    `${unlabelled.length} unlabelled, ${unnamed.length} unnamed`);

  // =========================================================================
  group('22. Phase 17 Round C — weight, reach and focus');
  // =========================================================================

  // --- every image the app renders asks the browser to defer it ------------
  const imagesWithoutLazy = [];
  for (const name of fs.readdirSync(path.join(ROOT, 'src/components'))) {
    if (!name.endsWith('.tsx')) continue;
    const source = readSrc(`src/components/${name}`);
    for (const match of source.matchAll(/<img\b[\s\S]{0,400}?\/>/g)) {
      if (!/loading="lazy"/.test(match[0]) || !/decoding="async"/.test(match[0])) imagesWithoutLazy.push(`${name}: ${match[0].slice(0, 60)}`);
    }
  }
  check('every image in the application defers its load', imagesWithoutLazy.length === 0, imagesWithoutLazy.join(' | '));

  const assetBytes = (file) => fs.statSync(path.join(ROOT, 'public', file)).size;
  const budget = {
    'CODE RX11.png': 140 * 1024,
    'icon-512.png': 140 * 1024,
    'icon-512-maskable.png': 100 * 1024,
    'logo.png': 60 * 1024,
    'logo-small.png': 40 * 1024,
    'icon-192.png': 30 * 1024,
    'apple-touch-icon.png': 30 * 1024,
  };
  const heavy = Object.entries(budget).filter(([file, limit]) => assetBytes(file) > limit);
  check('the shipped images are inside a sane weight budget', heavy.length === 0,
    heavy.map(([file, limit]) => `${file} ${(assetBytes(file) / 1024).toFixed(0)}KB > ${limit / 1024}KB`).join(', '));
  check('the emblem is not shipped at a resolution it is never drawn at',
    (() => {
      const size = childProcess.execSync(`identify -format "%w" "${path.join(ROOT, 'public/CODE RX11.png')}"`, { encoding: 'utf8' }).trim();
      return Number(size) <= 512;
    })());
  check('no image was degraded into a thumbnail in the process',
    (() => {
      const out = childProcess.execSync(`identify -format "%w %h|" "${path.join(ROOT, 'public/logo.png')}" "${path.join(ROOT, 'public/icon-512.png')}"`, { encoding: 'utf8' }).trim().split('|');
      return /^240 240$/.test(out[0].trim()) && /^512 512$/.test(out[1].trim());
    })());

  // --- a release invalidates the cached shell ------------------------------
  check('the service worker cache name is versioned and current',
    /const CACHE = 'code-rx-v5'/.test(readSrc('public/sw.js')));
  check('the service worker still refuses to cache API responses',
    /if \(url\.pathname\.startsWith\('\/api\/'\)\) return;/.test(readSrc('public/sw.js')));

  // --- sharing and crawling ------------------------------------------------
  const indexPage = readSrc('index.html');
  check('the page carries a social card for every share',
    /property="og:title"/.test(indexPage) && /property="og:description"/.test(indexPage)
    && /property="og:image"/.test(indexPage) && /name="twitter:card"/.test(indexPage)
    && /<link rel="canonical"/.test(indexPage));
  check('the shared image is the society emblem, at an absolute address',
    /og:image" content="https:\/\/[^"]+CODE%20RX11\.png"/.test(indexPage));
  check('crawlers are given a map and told to leave the API alone',
    /Sitemap: https:\/\//.test(readSrc('public/robots.txt'))
    && /Disallow: \/api\//.test(readSrc('public/robots.txt'))
    && /<urlset/.test(readSrc('public/sitemap.xml')));
  check('the site description stays under the length search engines display',
    (indexPage.match(/name="description" content="([^"]+)"/)?.[1].length || 0) <= 180);

  // --- a phone number is a phone number ------------------------------------
  check('the footer numbers are tappable, and the helper keeps the dialling shape',
    /href=\{\`tel:\$\{telHref\(/.test(readSrc('src/components/Footer.tsx'))
    && telHref('053 734 5524') === '0537345524'
    && telHref('+233 53 734 5524') === '0537345524'
    && telHref('') === '');

  // --- nothing is left without a focus ring --------------------------------
  const unfocused = [];
  for (const name of fs.readdirSync(path.join(ROOT, 'src/components'))) {
    if (!name.endsWith('.tsx')) continue;
    const source = readSrc(`src/components/${name}`);
    for (const match of source.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
      const classes = match[1] || match[2] || '';
      if (!classes.includes('outline-none')) continue;
      if (classes.includes('focus-visible:ring') || classes.includes('focus:ring')) continue;
      unfocused.push(name);
    }
  }
  check('no control removes the focus outline without replacing it', unfocused.length === 0,
    [...new Set(unfocused)].join(', '));
  check('no pale slate-300 text or placeholder survives anywhere',
    !/text-slate-300|placeholder:text-slate-300/.test(
      fs.readdirSync(path.join(ROOT, 'src/components')).filter((n) => n.endsWith('.tsx'))
        .map((n) => readSrc(`src/components/${n}`)).join('\n')));

  // -------------------------------------------------------------------------
  // Phase 18 — uploading a document file, and issuing an access key.
  //
  // The rules under test: the upload reuses the endpoints that already exist
  // (no second storage, no second stamp), the stamping pipeline is still the
  // only artifact producer, and access-key creation is reachable again.
  // -------------------------------------------------------------------------
  group('23. Phase 18 — upload a document, stamp it, issue an access key');
  const phase18Read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
  const center18 = phase18Read('src/components/ClientAccessCenter.tsx');
  const vault18 = phase18Read('src/components/Vault.tsx');
  const uploads18 = phase18Read('src/lib/vaultUploads.ts');
  const uploadField18 = phase18Read('src/components/VaultUploadField.tsx');
  const uploadDialog18 = phase18Read('src/components/VaultUploadDialog.tsx');
  const functionSource18 = phase18Read('functions/[[path]].ts');

  check('a file name becomes a usable document title', titleFromFileName('Phase 1_report-final.pdf') === 'Phase 1 report final'
    && titleFromFileName('deliverable.docx') === 'deliverable');
  check('the upload field accepts exactly what the stamping engine can render',
    isStampableUploadMime('application/pdf')
    && isStampableUploadMime('image/png')
    && isStampableUploadMime('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    && isStampableUploadMime('application/vnd.oasis.opendocument.text')
    && isStampableUploadMime('text/plain') && isStampableUploadMime('text/csv')
    && isStampableUploadMime('application/json')
    && !isStampableUploadMime('image/jpeg') && !isStampableUploadMime('image/gif')
    && !isStampableUploadMime('image/webp') && !isStampableUploadMime('application/zip')
    && !isStampableUploadMime('application/msword')
    && !isStampableUploadMime('application/x-msdownload') && !isStampableUploadMime(''));
  check('the file picker advertises the accepted formats', STAMPABLE_UPLOAD_ACCEPT.includes('.pdf')
    && STAMPABLE_UPLOAD_ACCEPT.includes('.docx') && STAMPABLE_UPLOAD_ACCEPT.includes('.odt')
    && STAMPABLE_UPLOAD_ACCEPT.includes('image/png') && STAMPABLE_UPLOAD_LABEL.includes('Word'));
  check('the upload ceiling matches the server', MAX_UPLOAD_BYTES === 10 * 1024 * 1024);
  check('a section only offers documents when the operator may create there',
    sectionAcceptsDocuments({ permissions: { create: true } }) === true
    && sectionAcceptsDocuments({ permissions: { create: false } }) === false
    && sectionAcceptsDocuments(null) === false);
  check('a manager files the upload as an active document and everyone else as a draft',
    uploadDocumentStatus({ permissions: { manage: true } }) === 'active'
    && uploadDocumentStatus({ permissions: { create: true } }) === 'draft'
    && uploadDocumentStatus(null) === 'draft');

  // --- the upload field renders for real ------------------------------------
  const uploadFieldHtml = render(React.createElement(VaultUploadField, { file: null, onFile: () => {} }));
  check('the upload field offers a drag target and a file picker',
    uploadFieldHtml.includes('Drag the document here') && uploadFieldHtml.includes('choose a file')
    && uploadFieldHtml.includes('type="file"') && uploadFieldHtml.includes('Up to 10 MB'));
  const chosenHtml = render(React.createElement(VaultUploadField, {
    file: { name: 'phase-18-report.pdf', size: 512 * 1024, type: 'application/pdf' }, onFile: () => {},
  }));
  check('a chosen file shows its name, size and the replace control',
    chosenHtml.includes('phase-18-report.pdf') && chosenHtml.includes('512 KB')
    && chosenHtml.includes('Replace') && chosenHtml.includes('Remove'));
  check('removing focus outlines in the new field is not allowed',
    !/outline-none(?![\s\S]{0,80}focus-visible:ring)/.test(uploadField18.replace(/className="sr-only"/g, '')));

  const uploadDialogHtml = render(React.createElement(VaultUploadDialog, {
    section: { title: 'Technology', slug: 'technology', permissions: { create: true, manage: true } },
    onClose: () => {}, onCreated: () => {}, onError: () => {},
  }));
  check('the internal upload dialog names the section it files into and blocks an empty submit',
    uploadDialogHtml.includes('Upload a document') && uploadDialogHtml.includes('Technology')
    && uploadDialogHtml.includes('Document title') && /disabled=""/.test(uploadDialogHtml));

  // --- the client document side ---------------------------------------------
  check('the documents panel has an upload section of its own',
    center18.includes('Upload a document') && center18.includes('Upload &amp; stamp')
    && (center18.match(/onClick=\{onUpload\}/g) || []).length >= 2
    && center18.includes('onUpload={() => setPublishFlow({ clientId: detail.id, projectId: projects[0]?.id, upload: true })}'));
  check('the publishing dialog offers uploading as a third source',
    /useState<'text' \| 'vault' \| 'upload'>/.test(center18) && center18.includes('1 · Upload a document')
    && center18.includes('VaultUploadField'));
  check('the upload is filed in the Vault and then published, in that order',
    center18.indexOf('uploadFileAsVaultDocument({') > -1
    && center18.indexOf('uploadFileAsVaultDocument({') < center18.indexOf('clientAccessCenter.createDocument(client.id', center18.indexOf('uploadFileAsVaultDocument({')));
  check('the client document pins the internal document the upload created',
    /vaultDocumentId: String\(filed\.documentId\)/.test(center18));
  check('the stamped copy is produced by the existing pipeline, not by the browser',
    /clientAccessCenter\.prepareDelivery\(documentId, true\)/.test(center18)
    && !/new FileReader|arrayBuffer\(\)|toBase64|base64/.test(center18));
  check('the browser never builds a document payload out of file bytes',
    !/new FormData\(\)/.test(center18) && !/fetch\(/.test(center18));
  check('the upload reuses the two Vault endpoints that already exist',
    uploads18.includes('db.vault.uploadFile(file, section)')
    && uploads18.includes('db.vault.createDocument({')
    && !/fetch\(|apiCall</.test(uploads18));
  check('the uploaded file becomes the whole document — one attachment block, no prose',
    /contentJson: JSON\.stringify\(\{ version: 1, blocks: \[block\] \}\)/.test(uploads18));
  check('a half-finished upload says which half happened',
    uploads18.includes('The file was uploaded, but the internal document could not be created')
    && center18.includes('retry to publish it'));

  // --- the internal document side -------------------------------------------
  check('the Vault offers uploading next to New Document',
    vault18.includes('<Upload className="h-4 w-4" />Upload Document')
    && vault18.includes('onUpload={() => setUploadOpen(true)}'));
  check('the internal upload opens the document it just created',
    /onCreated=\{async \(created\) => \{[\s\S]{0,200}openDocument\(created\.documentId\)/.test(vault18)
    && vault18.includes('VaultUploadDialog'));
  check('the internal upload dialog is only shown for a section that accepts documents',
    /uploadOpen && activeSection \?/.test(vault18));

  // --- access key creation is reachable again -------------------------------
  check('the access-key section is on the client workspace again',
    /'keys', 'Access keys', KeyRound/.test(center18) && center18.includes("type Section = 'clients' | 'projects' | 'documents' | 'keys'"));
  check('the header offers issuing an access key',
    /<KeyRound className="h-4 w-4" \/> Issue access key/.test(center18));
  check('project cards can issue a key already pinned to that project',
    /onIssueKey=\{\(project: any\) => setKeyDialog\(\{ clientId: detail\.id, projectId: project\.id \}\)\}/.test(center18));
  check('the key dialog is opened from the UI, not only closed',
    (center18.match(/setKeyDialog\(\{ clientId/g) || []).length >= 2
    && /keyDialog && detail[\s\S]{0,200}<KeyDialog/.test(center18));
  check('a generated key is still shown once and never listed',
    center18.includes('onIssued={(payload) => { setKeyDialog(null); setRevealedKey(payload);')
    && center18.includes('KeyRevealDialog') && !/key_hint.*rawKey/i.test(center18));
  check('the keys panel keeps regeneration and revocation on the existing endpoints',
    center18.includes('clientAccessCenter.regenerateKey(key.id)')
    && center18.includes('clientAccessCenter.revokeKey(key.id)')
    && center18.includes('clients.keys.regenerate') && center18.includes('clients.keys.revoke'));
  check('an empty key list is a professional empty state, not a blank panel',
    center18.includes('No access key has been issued yet'));

  // --- one stamping pipeline, and nothing new to keep alive ------------------
  const stampOwners = fs.readdirSync(path.join(ROOT, 'functions/lib'))
    .filter((name) => name.endsWith('.ts'))
    .filter((name) => phase18Read(`functions/lib/${name}`).includes('CLIENT PROJECT DOCUMENT'));
  check('the stamp is defined in exactly one place and the upload did not add a second',
    stampOwners.length === 1 && stampOwners[0] === 'client-delivery-pdf.ts');
  check('the delivery decision is still a single planner',
    (phase18Read('functions/lib/client-document-delivery.ts').match(/export const planClientDelivery/g) || []).length === 1
    && (phase18Read('functions/lib/client-delivery-context.ts').match(/export const resolveClientDelivery/g) || []).length === 1);
  const publicMimeBlock = (functionSource18.match(/const SAFE_UPLOAD_MIME_TYPES = new Set\(\[([\s\S]*?)\]\);/) || [])[1] || '';
  const vaultMimeBlock = (functionSource18.match(/const SAFE_VAULT_UPLOAD_MIME_TYPES = new Set\(\[([\s\S]*?)\]\);/) || [])[1] || '';
  check('the Vault allow-list was widened for office files, and the public one was not',
    vaultMimeBlock.includes('openxmlformats') && vaultMimeBlock.includes('oasis.opendocument')
    && vaultMimeBlock.includes('...SAFE_UPLOAD_MIME_TYPES')
    && publicMimeBlock.length > 0 && !publicMimeBlock.includes('openxmlformats')
    && functionSource18.includes('const isSafeVaultUploadMime = (mime: string) => SAFE_VAULT_UPLOAD_MIME_TYPES.has(mime.toLowerCase());'),
    publicMimeBlock.replace(/\s+/g, ' ').slice(0, 120));
  check('the Vault upload route is the one that accepts office documents',
    /if \(!isSafeVaultUploadMime\(mime\)\) return c\.json\(\{ success: false, error: `File type "\$\{mime\}" is not allowed\.` \}, 415\);/.test(functionSource18));
  check('no client-side upload collects the raw key or the artifact',
    !/storageReference|client-exports/.test(center18) && !/storageReference|client-exports/.test(uploads18));
  check('the new surfaces keep the readable-text rule from Phase 16',
    !/text-slate-300|placeholder:text-slate-300/.test([center18, vault18, uploads18, uploadField18, uploadDialog18].join('\n')));

  // -------------------------------------------------------------------------
  // Phase 18 follow-up — the address an operator sends.
  //
  // The panel used to reveal a bare token, which is not something a person can
  // send. The panel now shows the full http address the client opens, copies
  // it, and can open it to check where it leads — while the key flow keeps its
  // sign-in address free of any credential.
  // -------------------------------------------------------------------------
  group('24. Phase 18 follow-up — a temporary link becomes a real http address');
  const linkRead = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
  const centerLink = linkRead('src/components/ClientAccessCenter.tsx');
  const portalLink = linkRead('src/components/ClientPortal.tsx');
  const host = 'https://coderxsociety.pages.dev';

  check('a site-relative path becomes a full http address',
    absoluteLinkUrl('/#client-portal/link/TOKEN123', host) === `${host}/#client-portal/link/TOKEN123`);
  check('an address that is already absolute is left alone',
    absoluteLinkUrl(`${host}/#client-portal/link/TOKEN123`, host) === `${host}/#client-portal/link/TOKEN123`);
  check('a trailing slash on the host never doubles up',
    absoluteLinkUrl('/#client-portal/link/TOKEN123', `${host}/`) === `${host}/#client-portal/link/TOKEN123`);
  check('an unknown host degrades to the path instead of inventing one',
    absoluteLinkUrl('/#client-portal/link/TOKEN123') === '/#client-portal/link/TOKEN123'
    && absoluteLinkUrl('') === '');
  check('the shared address is built from the one path helper',
    linkShareUrl('TOKEN123', host) === absoluteLinkUrl(linkPath('TOKEN123'), host)
    && linkPath('TOKEN123') === '/#client-portal/link/TOKEN123');
  check('the address the panel generates is the hash the client app parses',
    new RegExp('^#client-portal\\/link\\/([^/?#]+)$').test(linkPath('TOKEN123').slice(1))
    && portalLink.includes("window.location.hash"));
  check('the client sign-in address carries no credential at all',
    clientSignInUrl(host) === `${host}/#client-portal`
    && !/TOKEN|passkey|CRX-/.test(clientSignInUrl(host)));

  // The server generates the address too (from the request's own origin), so
  // the panel spends it rather than making one up.
  const apiLink = linkRead('src/lib/cloudflare.ts');
  check('the link API contract carries the generated address, not only the path',
    /id: string; token: string; path: string; url: string;/.test(apiLink));
  check('the panel sends the address the server generated',
    centerLink.includes('url: payload.url || linkAddressUrl(payload.token, origin)'));
  check('the create dialog hands the generated address up to the reveal',
    centerLink.includes('url: result.data.url,')
    && centerLink.includes('path: result.data.path,'));
  check('a response without a host still becomes a usable link in the panel',
    centerLink.includes('absoluteLinkUrl(payload.path, origin)'));

  const directHint = linkShareHint('DIRECT_ACCESS', 'Project room', host);
  const passkeyHint = linkShareHint('REQUIRE_PASSKEY', 'Project room', host);
  check('direct access is explained in the operator’s words',
    directHint.includes('Project room') && /immediately|straight away/i.test(directHint) && /no access key/i.test(directHint)
    && /credential/i.test(directHint));
  check('a passkey link is explained as needing the client’s key',
    passkeyHint.includes('Project room') && /access key/i.test(passkeyHint));

  const directReveal = render(React.createElement(KeyRevealDialog, {
    payload: {
      passkey: 'TOKEN1234567890TOKEN1234567890TOKEN12',
      hint: '',
      expiresAt: '2026-09-20T12:00:00.000Z',
      message: 'Copy this link now and deliver it securely.',
      label: 'Temporary link — direct access',
      url: linkShareUrl('TOKEN1234567890TOKEN1234567890TOKEN12', host),
      urlHint: directHint,
    },
    onClose: () => {},
  }));
  check('the generated link is shown as an address that can be selected and copied',
    directReveal.includes(`value="${host}/#client-portal/link/TOKEN1234567890TOKEN1234567890TOKEN12"`)
    && directReveal.includes('Copy link') && directReveal.includes('readOnly'));
  check('the link can be opened straight from the panel to check where it leads',
    directReveal.includes(`href="${host}/#client-portal/link/TOKEN1234567890TOKEN1234567890TOKEN12"`)
    && directReveal.includes('target="_blank"') && directReveal.includes('rel="noreferrer"') && directReveal.includes('Open link'));
  check('the address and the open button are the same string',
    (directReveal.match(/TOKEN1234567890TOKEN1234567890TOKEN12/g) || []).length >= 3);
  check('the token is still available on its own for an operator who needs just that part',
    directReveal.includes('Token only') && directReveal.includes('copy token'));
  check('the reveal says what the link will do, in the mode it was created with',
    directReveal.includes('Temporary link — direct access') && directReveal.includes('Expires'));
  check('a passkey link is revealed as a link too, not as a bare token',
    render(React.createElement(KeyRevealDialog, {
      payload: {
        passkey: 'TOKEN1234567890TOKEN1234567890TOKEN12', hint: '', expiresAt: null,
        message: 'Copy this link now.', label: 'Temporary link — access key required',
        url: linkShareUrl('TOKEN1234567890TOKEN1234567890TOKEN12', host), urlHint: passkeyHint,
      },
      onClose: () => {},
    })).includes('Temporary link — access key required'));

  const keyReveal = render(React.createElement(KeyRevealDialog, {
    payload: { passkey: 'CRX-UC2-GUK-MSD', hint: 'MSD', expiresAt: null, message: 'Generated.', label: 'Client access key' },
    onClose: () => {},
  }));
  check('an access key is still revealed as a key, not as a link',
    keyReveal.includes('CRX-UC2-GUK-MSD') && /Copy/.test(keyReveal)
    && !keyReveal.includes('Open link') && !keyReveal.includes('Token only')
    // The only address a key reveal may carry is the credential-free sign-in page.
    && !keyReveal.includes('#client-portal/link/'));
  check('a key is handed over with the address it is used on',
    keyReveal.includes('Where the client uses it') && keyReveal.includes('Client sign-in link')
    && /href="[^"]*\/?#client-portal"/.test(keyReveal) && keyReveal.includes('Copy link')
    && keyReveal.includes('The key itself never goes in the link'));
  check('the key itself never appears in any url in the reveal',
    !/href="[^"]*(CRX|passkey|key=|UC2)/i.test(keyReveal)
    && !/value="[^"]*#client-portal\?[^"]*"/.test(keyReveal));

  check('the panel uses the server address, and still builds one from the token it holds',
    centerLink.includes('url: payload.url || linkAddressUrl(payload.token, origin)')
    && centerLink.includes("window.location.origin")
    && !/#client-portal\/link\/\$\{/.test(centerLink));

  // A link is handed over as an ordinary address on the site: /l/<token>. The
  // hash form stays supported, so links that were already sent keep working.
  check('a link token becomes an ordinary path address on this site',
    linkAddressPath('TOKEN123') === '/l/TOKEN123'
    && linkAddressUrl('TOKEN123', host) === `${host}/l/TOKEN123`);
  check('the address carries no fragment, so a link preview cannot mangle it',
    !linkAddressUrl('TOKEN123', host).includes('#'));
  check('the token is read back out of the path address',
    linkTokenFromAddress('/l/TOKEN123', '') === 'TOKEN123'
    && isLinkAddress('/l/TOKEN123'));
  check('a link that was already sent by hash still opens the same way',
    linkTokenFromAddress('/', '#client-portal/link/TOKEN123') === 'TOKEN123'
    && linkTokenFromAddress('/', '#client-portal') === '');
  check('an address that is not a link is never treated as one',
    !isLinkAddress('/') && !isLinkAddress('/l/') && !isLinkAddress('/values')
    && linkTokenFromAddress('/values', '#values') === '');

  const appLink = linkRead('src/App.tsx');
  const portalAddressSource = linkRead('src/components/ClientPortal.tsx');
  check('the app opens the client portal for a path address, not only a hash',
    appLink.includes('isLinkAddress(window.location.pathname)'));
  check('the portal reads the credential from either form of the address',
    portalAddressSource.includes('linkTokenFromAddress(window.location.pathname, window.location.hash)'));
  check('once exchanged, a path address is cleared rather than left in history',
    portalAddressSource.includes('stripLinkTokenFromUrl(linkIsInPath())')
    && portalAddressSource.includes('clientPortalPath()')
    && !/fromPath\s*\?\s*CLIENT_PORTAL_HASH/.test(portalAddressSource));
  check('the panel explains both modes where the operator reads them',
    centerLink.includes("payload.mode === 'DIRECT_ACCESS' ? 'Temporary link — direct access' : 'Temporary link — access key required'")
    && centerLink.includes('a direct-access link opens the destination immediately'));
  check('the keys panel hands over the sign-in address the key is used on',
    centerLink.includes('clientSignInUrl(origin)') && centerLink.includes('Client sign-in address')
    && centerLink.includes('The client opens this address and enters their access key.'));
  check('no credential is ever placed in a url anywhere in the panel',
    !/[?#&](passkey|key|token|linkToken)=/i.test(centerLink)
    && !/linkPath\(|#client-portal\/link/.test(centerLink.replace(/url: absoluteLinkUrl\(payload\.path, origin\)/g, '')));

  // -------------------------------------------------------------------------
  // Phase 18 follow-up — the public site's "Direct link" chips.
  //
  // The chips said "Direct link: #values" but only produced a fragment: there
  // was no http link to send. They now copy the section's full address.
  // -------------------------------------------------------------------------
  group('25. Phase 18 follow-up — the public section links become http links');
  const sectionHost = 'https://coderxsociety.pages.dev';
  const sectionLinkSource = fs.readFileSync(path.join(ROOT, 'src/components/SectionLink.tsx'), 'utf8');

  check('a section id becomes the full address of that section',
    sectionDirectLinkUrl('values', sectionHost) === `${sectionHost}/#values`
    && sectionDirectLinkUrl('#challenges', sectionHost) === `${sectionHost}/#challenges`
    && sectionDirectLinkUrl('learn', sectionHost, '/', '?from=home') === `${sectionHost}/?from=home#learn`);
  check('an unknown host degrades to the on-page fragment instead of inventing a domain',
    sectionDirectLinkUrl('values') === '/#values' && sectionDirectLinkUrl('', sectionHost) === '');
  check('the site title tells a reader what the full link is',
    sectionDirectLinkUrl('values', sectionHost).includes('#values'));

  const chip = render(React.createElement(SectionLink, { id: 'values' }));
  const chipWithHost = render(React.createElement(SectionLink, { id: 'values', origin: sectionHost }));
  check('the chip still jumps to the section on this page',
    chip.includes('href="#values"') && chip.includes('#values'));
  check('the chip can generate the http link for that section',
    chipWithHost.includes(`${sectionHost}/#values`) && /Copy the full link/.test(chipWithHost));
  check('the generated link is announced for assistive technology and on hover',
    new RegExp(`aria-label="Copy the full http link to this section \\(${sectionHost.replace(/[.]/g, '\\.')}/#values\\)"`).test(chipWithHost)
    && new RegExp(`title="Direct link: ${sectionHost.replace(/[./]/g, (m) => `\\${m}`)}/#values"`).test(chipWithHost));
  const sectionLinkCode = sectionLinkSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  check('the address is built from the site being read, never a hardcoded domain',
    sectionLinkCode.includes('window.location')
    && sectionLinkCode.includes('sectionDirectLinkUrl(')
    && !/coderxsociety\.pages\.dev|coderxsociety\.com/.test(sectionLinkCode));
  check('copying gives feedback without pretending to have copied on failure',
    sectionLinkSource.includes('await navigator.clipboard.writeText(fullUrl)')
    && sectionLinkSource.includes('setCopied(true)') && /catch \{[\s\S]{0,80}setCopied\(false\)/.test(sectionLinkSource));
  check('every public section that carries the chip gets the same http link',
    ['values', 'about', 'learn', 'challenges', 'extras', 'leadership', 'news', 'projects', 'resources', 'join', 'what-we-do']
      .every((id) => sectionDirectLinkUrl(id, sectionHost) === `${sectionHost}/#${id}`));

  // -------------------------------------------------------------------------
  // Phase 18 follow-up — a direct link in one press.
  //
  // The gap behind "make it generate an http link to lead directly there" was
  // that a newly created link defaulted to the key-gated mode: opening it
  // stopped at a key prompt instead of landing. Direct access is now the
  // default, and the document and project rows generate their own address.
  // -------------------------------------------------------------------------
  group('26. Phase 18 follow-up — a direct link in one press');
  const onePress = fs.readFileSync(path.join(ROOT, 'src/components/ClientAccessCenter.tsx'), 'utf8');

  check('the link dialog opens on direct access, the mode that leads straight there',
    /const \[mode, setMode\] = useState<LinkAccessMode>\('DIRECT_ACCESS'\)/.test(onePress));
  check('the key-gated mode is still the deliberate other choice',
    onePress.includes('REQUIRE_PASSKEY') && onePress.includes('LINK_ACCESS_MODES')
    && /setMode\(/.test(onePress));
  check('a document row generates its own address in one press',
    /onClick=\{\(\) => onDirectLink\(document\)\}/.test(onePress)
    && onePress.includes('Generate an address that opens')
    && onePress.includes('straight away, without asking for a key'));
  check('a project row does the same for the room',
    /onClick=\{\(\) => onDirectLink\(project\)\}/.test(onePress));
  check('the one-press link is created by the server, with a finite lifetime',
    onePress.includes("mode: 'DIRECT_ACCESS'")
    && onePress.includes('expiresInMinutes: DIRECT_LINK_TTL_MINUTES')
    && /const DIRECT_LINK_TTL_MINUTES = \d+/.test(onePress)
    && onePress.includes('await clientAccessCenter.createLink('));
  check('the one-press link obeys the same capability as the links panel',
    /clients\.links\.create'\) \? \(\s*<button\s*onClick=\{\(\) => onDirectLink\(document\)\}/.test(onePress));
  check('it reveals the same one-time address, ready to copy or open',
    onePress.includes('url: result.data.url || linkAddressUrl(result.data.token, origin)')
    && onePress.includes("urlHint: linkShareHint('DIRECT_ACCESS'"));
  check('the reveal says what the address opens',
    onePress.includes('Direct link — opens '));
  check('a client with no project is told why instead of a dead press',
    onePress.includes('This client needs a project before a link can be created.'));

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
