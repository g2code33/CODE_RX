#!/usr/bin/env node
/**
 * CODE Rx — the PHANTOM client workspace, driven in a real DOM.
 *
 * The API harnesses prove the routes; this one proves the *buttons*. It mounts
 * the real `ClientAccessCenter` (plus the real dialog host) in jsdom, signs in
 * against the running preview with a real PHANTOM token, and clicks through the
 * panel the way an operator does: pick a client, open Documents, press Delete,
 * confirm, and assert the row is gone and the item is in the Recycle Bin.
 *
 * Dev-only and opt-in: it needs jsdom and the app's own dependencies, which are
 * not installed for the sandbox by default.
 *
 *   mkdir -p /tmp/browser && cd /tmp/browser && npm i jsdom
 *   cd /home/user/CODE_RX && NODE_PATH=/tmp/browser/node_modules \
 *     node scripts/client-panel-dom-check.mjs
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const BASE = process.env.CODE_RX_PREVIEW || 'http://127.0.0.1:8788';
const EMAIL = process.env.PHANTOM_EMAIL || 'coderxsociety@gmail.com';
const PASSWORD = process.env.ADMIN_PASSWORD || 'DevPreviewPassword1';

const require = createRequire(import.meta.url);
const { JSDOM, VirtualConsole } = require('jsdom');

const api = async (method, endpoint, body, token, extraHeaders = {}) => {
  const response = await fetch(`${BASE}${endpoint}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extraHeaders,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, json: await response.json().catch(() => null) };
};

const ok = [];
const bad = [];
const check = (name, condition, detail = '') => {
  (condition ? ok : bad).push(name + (condition ? '' : ` — ${detail}`));
  console.log(`  ${condition ? 'PASS' : 'FAIL'}  ${name}${condition || !detail ? '' : ` — ${detail}`}`);
};

// --- 1. a real sign-in, and a client with a letter to delete -----------------
const login = await api('POST', '/api/auth/login', { email: EMAIL, password: PASSWORD });
const token = login.json?.token || login.json?.data?.token;
if (!token) { console.log('FAIL — PHANTOM could not sign in'); process.exit(1); }
await api('PUT', '/api/phantom/client-portal-settings', {
  settings: [{ key: 'client_portal_enabled', value: true }, { key: 'client_downloads_enabled', value: true }],
}, token);

const stamp = Date.now().toString().slice(-6);
const client = (await api('POST', '/api/phantom/clients', { name: `Panel DOM Client ${stamp}` }, token)).json?.data;
const projectCreated = (await api('POST', `/api/phantom/clients/${client.id}/projects`, { name: `Panel DOM Project ${stamp}` }, token)).json?.data;
const clientDetail = (await api('GET', `/api/phantom/clients/${client.id}`, null, token)).json?.data;
const projectFromList = (clientDetail?.projects || []).find((entry) => entry.id === projectCreated?.id);
const projectName = projectFromList?.name || `Panel DOM Project ${stamp}`;
const project = { ...projectCreated, ...(projectFromList || {}), name: projectName };
// The list is the source of truth for the name the panel will render.
const clientName = (await api('GET', '/api/phantom/clients', null, token)).json?.data
  ?.map?.((entry) => entry).find((entry) => entry.id === client.id)?.name
  || (await api('GET', '/api/phantom/clients', null, token)).json?.data
    ?.find?.((entry) => entry.id === client.id)?.name
  || client.name || `Panel DOM Client ${stamp}`;
const letterTitle = `Panel DOM Letter ${stamp}`;
const letter = (await api('POST', `/api/phantom/clients/${client.id}/documents`, {
  projectId: project.id, category: 'letter', title: letterTitle, contentText: 'A letter to delete.',
}, token)).json?.data;
await api('POST', `/api/phantom/client-documents/${letter.id}/lifecycle`, { state: 'published' }, token);
console.log(`  fixture: client ${client.id} · project ${project.id} · letter ${letter.id}`);

// --- 2. the real panel, in a real DOM ---------------------------------------
const pageUrl = `${BASE}/`;
const html = await (await fetch(pageUrl)).text();
const servedMark = await fetch(`${BASE}/CODE%20RX11.png`);
check('the official mark is really served, as an image',
  servedMark.status === 200 && String(servedMark.headers.get('content-type')).includes('image/png'),
  `${servedMark.status} ${servedMark.headers.get('content-type')}`);
const bundle = await build({
  stdin: {
    contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { ClientAccessCenter } from './src/components/ClientAccessCenter';
      import { AppDialogHost } from './src/components/AppDialog';
      const messages = [];
      const root = createRoot(document.getElementById('panel-root'));
      root.render(React.createElement(React.Fragment, null,
        React.createElement(ClientAccessCenter, { onMessage: (message) => messages.push(String(message)) }),
        React.createElement(AppDialogHost, null),
      ));
      window.__panel = { messages };
    `,
    resolveDir: ROOT,
    loader: 'tsx',
  },
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  define: {
    'process.env.NODE_ENV': '"development"',
    // The bundle reads Vite's env object; in this harness it is simply empty,
    // which is also what production does (relative API URLs on the same host).
    'import.meta.env.VITE_API_URL': 'undefined',
    'import.meta.env.VITE_R2_BUCKET_URL': 'undefined',
  },
  write: false,
  logLevel: 'error',
});
const code = bundle.outputFiles[0].text;

const virtualConsole = new VirtualConsole();
const pageErrors = [];
virtualConsole.on('jsdomError', (error) => pageErrors.push(String(error && error.message || error)));
virtualConsole.on('error', (...args) => pageErrors.push(args.map(String).join(' ')));
const dom = new JSDOM(html.replace('<div id="root"></div>', '<div id="root"></div><div id="panel-root"></div>'), {
  url: pageUrl,
  runScripts: 'outside-only',
  pretendToBeVisual: true,
  virtualConsole,
});
const { window } = dom;
window.localStorage.setItem('codeRx_token', token);
window.matchMedia = window.matchMedia || (() => ({ matches: false, media: '', onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } }));
window.ResizeObserver = window.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} };
window.IntersectionObserver = window.IntersectionObserver || class { observe() {} unobserve() {} disconnect() {} };
window.scrollTo = () => {};
window.alert = () => {};

// The panel talks to the preview through relative URLs; in jsdom those resolve
// against the page it was created with, so fetch needs no help — but keep the
// Node fetch as the transport so nothing depends on a browser network stack.
const nodeFetch = globalThis.fetch;
window.fetch = (input, init) => nodeFetch(new URL(typeof input === 'string' ? input : input.url, pageUrl), init);

window.eval(code);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const text = () => window.document.getElementById('panel-root').textContent.replace(/\s+/g, ' ').trim();
const buttons = () => [...window.document.getElementById('panel-root').querySelectorAll('button')];
const clickByText = (label, scope = 'panel', exact = false) => {
  const root = scope === 'panel' ? window.document.getElementById('panel-root') : window.document.body;
  const labelOf = (button) => String(button.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const target = (exact ? [...root.querySelectorAll('button')].find((button) => labelOf(button) === label.toLowerCase()) : null)
    || [...root.querySelectorAll('button')].find((button) => labelOf(button).includes(label.toLowerCase()));
  if (!target) return false;
  target.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  return true;
};
const waitFor = async (test, attempts = 40) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (test()) return true;
    await wait(200);
  }
  return false;
};

await waitFor(() => text().includes(clientName), 60);
check('the panel lists the client it was given', text().includes(clientName), text().slice(0, 400));
if (pageErrors.length) console.log('  page errors:', pageErrors.slice(0, 4).join(' | '));

// Select the client, then open the Documents section.
clickByText(clientName);
await waitFor(() => text().includes('Documents') && text().includes(project.name), 40);
clickByText('Documents', 'panel', true);
if (!await waitFor(() => text().includes(letterTitle), 30)) {
  // The tab is chosen once more if the first press landed while the client was
  // still loading: the assertion below still fails loudly if it never appears.
  clickByText('Documents', 'panel', true);
  await waitFor(() => text().includes(letterTitle), 40);
}
const listedInDocuments = await waitFor(() => text().includes(letterTitle), 60);
check('the letter is listed in the Documents section', listedInDocuments, text().slice(0, 200));

// The button under test. It is found by its own label, so a hidden or missing
// button fails loudly instead of being silently skipped.
const deleteButtons = buttons().filter((button) => button.textContent.trim() === 'Delete');
check('the letter row offers a Delete button', deleteButtons.length > 0, `${buttons().length} buttons on screen`);
deleteButtons[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
const sawConfirm = await waitFor(() => /Delete “/.test(window.document.body.textContent), 20);
check('pressing Delete asks for confirmation first', sawConfirm,
  window.document.body.textContent.replace(/\s+/g, ' ').slice(-120));

const confirmed = clickByText('Delete document', 'body');
check('the confirmation offers the destructive action', confirmed);
await wait(400);

const gone = await waitFor(async () => !(await api('GET', `/api/phantom/clients/${client.id}/documents`, null, token))
  .json?.data?.toString().includes(letter.id), 40);
const remaining = (await api('GET', `/api/phantom/clients/${client.id}/documents`, null, token)).json?.data || [];
const stillThere = JSON.stringify(remaining).includes(letter.id);

const bin = (await api('GET', '/api/phantom/recycle-bin', null, token)).json?.data || [];
const binned = bin.find((row) => String(row.title || '').includes(`Panel DOM Letter ${stamp}`));

check('the letter is really deleted', !stillThere, `still on the server: ${stillThere}`);
check('the row leaves the panel without a manual reload', !text().includes(letterTitle), text().slice(0, 160));
check('the deleted letter is in the Recycle Bin', Boolean(binned), JSON.stringify(bin.slice(0, 2)).slice(0, 160));

// ---------------------------------------------------------------------------
// PHASE 19 — the client's own room, driven the same way.
//
// The panel above proves the operator's Delete. This proves the other half of
// the round: a client opens a sent document in their room, writes in it, presses
// Save, presses Save & send, and the Code Rx copy changes with it.
// ---------------------------------------------------------------------------
console.log('\n--- the client room: sign the document, text PHANTOM, send it back ---');
const vaultSection = ((await api('GET', '/api/vault/sections', null, token)).json?.data || [])
  .find((entry) => entry.permissions?.create && Number(entry.is_sensitive) !== 1);
const vaultDoc = (await api('POST', '/api/vault/documents', {
  section: vaultSection.slug, title: `Panel DOM Vault doc ${stamp}`, content: 'Original wording from Code Rx.',
}, token)).json?.data;
const workLetter = (await api('POST', `/api/phantom/clients/${client.id}/documents`, {
  projectId: project.id, category: 'letter', title: `Panel DOM work letter ${stamp}`,
  contentText: 'Original wording from Code Rx.', vaultDocumentId: vaultDoc.id,
}, token)).json?.data;
await api('POST', `/api/phantom/client-documents/${workLetter.id}/lifecycle`, { state: 'published' }, token);
const workKey = (await api('POST', `/api/phantom/clients/${client.id}/keys`, { label: `Panel DOM key ${stamp}` }, token)).json?.data;
const clientLogin = await api('POST', '/api/client/auth/login', { passkey: workKey.passkey });
const clientToken = clientLogin.json?.data?.session?.token;
check('the client signs in and the room has a project to open', Boolean(clientToken), `login ${clientLogin.status}`);

const roomContext = {
  client: { id: client.id, name: clientName },
  project: { id: project.id, reference: project.reference, name: project.name, status: 'active' },
  permissions: { view: true, download: true },
  destination: null,
  target: null,
};
const roomBundle = await build({
  stdin: {
    contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { ClientProjectRoom } from './src/components/ClientProjectRoom';
      import { AppDialogHost } from './src/components/AppDialog';
      import { clientPortal, clientPortalSession } from './src/lib/cloudflare';
      // The room reads its session from the same place the app puts it, so the
      // harness signs in exactly the way the browser does.
      clientPortalSession.write({ token: ${JSON.stringify(clientToken)}, expiresAt: new Date(Date.now() + 3600000).toISOString() });
      const messages = [];
      const context = ${JSON.stringify(roomContext)};
      createRoot(document.getElementById('room-root')).render(
        React.createElement(React.Fragment, null,
          React.createElement(ClientProjectRoom, {
            context, transport: clientPortal, exitLabel: 'Log out',
            onSignedOut: () => {}, onSessionEnded: () => {}, notice: null, onNotice: (message) => messages.push(String(message)),
          }),
          React.createElement(AppDialogHost, null),
        ),
      );
      window.__room = { messages };
    `,
    resolveDir: ROOT,
    loader: 'tsx',
  },
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  define: {
    'process.env.NODE_ENV': '"development"',
    'import.meta.env.VITE_API_URL': 'undefined',
    'import.meta.env.VITE_R2_BUCKET_URL': 'undefined',
  },
  write: false,
  logLevel: 'error',
});
const roomCode = roomBundle.outputFiles[0].text;

const roomConsole = new VirtualConsole();
const roomErrors = [];
roomConsole.on('jsdomError', (error) => roomErrors.push(String(error && error.message || error)));
const roomDom = new JSDOM(html.replace('<div id="root"></div>', '<div id="root"></div><div id="room-root"></div>'), {
  url: pageUrl, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: roomConsole,
});
const room = roomDom.window;
room.localStorage.setItem('codeRx_token', token);
room.matchMedia = room.matchMedia || (() => ({ matches: false, media: '', onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } }));
room.ResizeObserver = room.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} };
room.IntersectionObserver = room.IntersectionObserver || class { observe() {} unobserve() {} disconnect() {} };
room.scrollTo = () => {};
room.alert = () => {};
room.Element.prototype.scrollIntoView = room.Element.prototype.scrollIntoView || function scrollIntoView() {};
const roomFailures = [];
room.fetch = async (input, init) => {
  const target = new URL(typeof input === 'string' ? input : input.url, pageUrl);
  const response = await nodeFetch(target, init);
  roomFailures.push(`${String((init && init.method) || 'GET')} ${target.pathname} ${response.status}`);
  if (response.status >= 400) roomErrors.push(`HTTP ${response.status} ${target.pathname}`);
  return response;
};
room.eval(roomCode);

const roomRoot = () => room.document.getElementById('room-root');
const roomText = () => roomRoot().textContent.replace(/\s+/g, ' ').trim();
const roomButtons = () => [...roomRoot().querySelectorAll('button')];
const buttonLabel = (button) => String(button.textContent || '').replace(/\s+/g, ' ').trim();
const clickRoomByText = (label, exact = true) => {
  const target = (exact ? roomButtons().find((button) => buttonLabel(button).toLowerCase() === label.toLowerCase()) : null)
    || roomButtons().find((button) => buttonLabel(button).toLowerCase().includes(label.toLowerCase()));
  if (!target) return false;
  target.dispatchEvent(new room.MouseEvent('click', { bubbles: true, cancelable: true }));
  return true;
};
const waitForRoom = async (test, attempts = 40) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (test()) return true;
    await wait(250);
  }
  return false;
};
// React tracks the last value it saw on a controlled field; without resetting
// that tracker a programmatic change is treated as no change at all.
const typeInto = async (field, value) => {
  if (!field) return false;
  const prototype = field.tagName === 'TEXTAREA' ? room.HTMLTextAreaElement.prototype : room.HTMLInputElement.prototype;
  const setValue = Object.getOwnPropertyDescriptor(prototype, 'value').set;
  if (field._valueTracker) field._valueTracker.setValue('previous value');
  setValue.call(field, value);
  field.dispatchEvent(new room.Event('input', { bubbles: true }));
  field.dispatchEvent(new room.Event('change', { bubbles: true }));
  await wait(250);
  return true;
};

await waitForRoom(() => roomText().includes(project.name), 60);
if (!roomText()) console.log('  room errors:', roomErrors.slice(0, 3).join(' | ') || '(none reported)');
check('the client room opens on the project it was given',
  roomText().includes(project.reference) && roomText().includes(clientName), roomText().slice(0, 200));

// --- the pinned header, the titles and the hamburger ----------------------
const roomHeader = roomRoot().querySelector('header');
if (process.env.DOM_DEBUG) {
  console.log('  debug: room header =', JSON.stringify(String(roomHeader && roomHeader.outerHTML || '').slice(0, 500)));
  console.log('  debug: sections with the review =',
    [...roomRoot().querySelectorAll('section')].filter((element) => /Review this document/.test(element.textContent || '')).length);
  console.log('  debug: header buttons =', [...(roomHeader ? roomHeader.querySelectorAll('button') : [])].map((b) => JSON.stringify(String(b.textContent || ''))).join(' | '));
  console.log('  debug: project name =', JSON.stringify(project.name), 'room text =', JSON.stringify(roomText().slice(0, 300)));
}
check('the room header is pinned while the client scrolls',
  Boolean(roomHeader) && /sticky/.test(String(roomHeader.className)), String(roomHeader && roomHeader.className).slice(0, 120));
check('the header carries the project title', Boolean(roomHeader) && roomHeader.textContent.includes(project.name));
const hamburger = roomRoot().querySelector('button[aria-controls="room-sections"]');
check('the header carries a hamburger that controls the sections',
  Boolean(hamburger) && hamburger.getAttribute('aria-expanded') === 'false');
check('the sections the hamburger controls are in the room', Boolean(roomRoot().querySelector('#room-sections')));
if (hamburger) hamburger.dispatchEvent(new room.MouseEvent('click', { bubbles: true, cancelable: true }));
const navOpened = await waitForRoom(() => hamburger && hamburger.getAttribute('aria-expanded') === 'true', 20);
check('pressing the hamburger opens the sections, and says so', navOpened,
  String(hamburger && hamburger.getAttribute('aria-expanded')));
if (hamburger) hamburger.dispatchEvent(new room.MouseEvent('click', { bubbles: true, cancelable: true }));
await waitForRoom(() => hamburger && hamburger.getAttribute('aria-expanded') === 'false', 20);

// --- open the document ----------------------------------------------------
clickRoomByText('Documents');
await waitForRoom(() => roomText().includes(`Panel DOM work letter ${stamp}`), 40);
// The sidebar is folded on small screens; open it the way a client would.
if (!roomText().includes(`Panel DOM work letter ${stamp}`) && hamburger) {
  hamburger.dispatchEvent(new room.MouseEvent('click', { bubbles: true, cancelable: true }));
  await waitForRoom(() => roomText().includes('Documents'), 20);
  clickRoomByText('Documents');
  await waitForRoom(() => roomText().includes(`Panel DOM work letter ${stamp}`), 40);
}
check('the sent document is listed in the client\'s own room', roomText().includes(`Panel DOM work letter ${stamp}`), roomText().slice(0, 220));

clickRoomByText('View');
const documentOpened = await waitForRoom(() => roomText().includes('Sign this document'), 60);
if (!documentOpened) console.log('  room buttons:', roomButtons().map(buttonLabel).slice(0, 12).join(' | '));
if (!documentOpened) console.log('  room errors:', roomErrors.slice(0, 3).join(' | ') || '(none reported)');
check('opening the document offers the client a signature', documentOpened, roomText().slice(-260));
check('the free-text workspace is gone from the client room', !roomText().includes('Work on this document'));
check('the document the client opened is the title in the pinned header',
  Boolean(roomHeader) && roomHeader.textContent.includes(`Panel DOM work letter ${stamp}`));

// --- signing --------------------------------------------------------------
const signatureCard = roomRoot().querySelector('#sign-this-document');
check('the signature card is a real section of the document view', Boolean(signatureCard));
check('the document starts out unsigned', roomText().includes('Not signed yet'));
const nameField = roomRoot().querySelector('input[aria-label^="Your full name"]');
const roleField = roomRoot().querySelector('input[aria-label^="Your role"]');
check('the client gets a name box and a role box to sign with', Boolean(nameField && roleField));
const signerNameValue = `Ama Mensah ${stamp}`;
await typeInto(nameField, signerNameValue);
await typeInto(roleField, 'Managing Director');
const signButton = roomButtons().find((button) => buttonLabel(button) === 'Save signature');
check('the client gets a Save action for the signature, and a send action beside it',
  Boolean(signButton) && roomButtons().some((button) => buttonLabel(button) === 'Send to PHANTOM'),
  roomButtons().map(buttonLabel).slice(0, 12).join(' | '));
if (signButton) signButton.dispatchEvent(new room.MouseEvent('click', { bubbles: true, cancelable: true }));

const signedOnServer = await (async () => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const read = (await api('GET', `/api/client/project/${project.id}/documents/${workLetter.id}/signature`,
      null, null, { 'X-Code-Rx-Client-Session': clientToken })).json?.data;
    if (read?.current?.signerName === signerNameValue) return true;
    await wait(250);
  }
  return false;
})();
if (!signedOnServer) {
  console.log('  debug: room tail =', JSON.stringify(roomText().slice(-280)));
  const copy = ((await api('GET', `/api/phantom/clients/${client.id}/documents`, null, token)).json?.data || [])
    .find((row) => row.id === (workLetter && workLetter.id));
  console.log('  debug: server copy =', JSON.stringify(copy?.signature || null));
}
check('pressing Save signature really signs: the signature is stored on the document', signedOnServer);
check('the client is told their signature is saved', /Signed/i.test(roomText()), roomText().slice(-200));
const signedVault = await (async () => {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const vaultNow = (await api('GET', `/api/vault/documents/${vaultDoc.id}`, null, token)).json?.data;
    const text = (vaultNow?.contentJson?.blocks || []).map((block) => String(block?.content || '')).join('\n');
    if (text.includes(`Signed: ${signerNameValue}`)) return text;
    await wait(250);
  }
  return '';
})();
check('the signed copy reaches the Code Rx Vault copy of the document', signedVault.includes(`Signed: ${signerNameValue}`),
  signedVault.slice(0, 160));
check('the signed copy still carries the wording Code Rx sent', signedVault.includes('Original wording from Code Rx.'));

const sendNow = roomButtons().find((button) => buttonLabel(button) === 'Send to PHANTOM');
if (sendNow) sendNow.dispatchEvent(new room.MouseEvent('click', { bubbles: true, cancelable: true }));
else console.log('  debug: the send-to-PHANTOM action was not on screen after signing');
const toldPhantom = await (async () => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const inbox = (await api('GET', '/api/notifications', null, token)).json?.data;
    const items = Array.isArray(inbox) ? inbox : (inbox?.items || []);
    if (items.some((row) => String(row.message || '').includes(`Panel DOM work letter ${stamp}`))) return true;
    await wait(250);
  }
  return false;
})();
check('pressing Send to PHANTOM tells PHANTOM the document came back', toldPhantom);

// --- Text PHANTOM ---------------------------------------------------------
const textPhantomButton = roomButtons().find((button) => button.getAttribute('aria-label') === 'Text PHANTOM')
  || roomButtons().find((button) => buttonLabel(button) === 'Text PHANTOM');
check('the pinned header carries the Text PHANTOM button', Boolean(textPhantomButton),
  roomButtons().map(buttonLabel).slice(0, 10).join(' | '));
if (textPhantomButton) textPhantomButton.dispatchEvent(new room.MouseEvent('click', { bubbles: true, cancelable: true }));
const dialogAppeared = await waitForRoom(() => Boolean(roomRoot().querySelector('[role="dialog"][aria-label="Text PHANTOM"]')), 30);
if (!dialogAppeared) console.log('  room errors:', roomErrors.slice(0, 3).join(' | ') || '(none reported)');
check('pressing it opens a dialog to write to PHANTOM', dialogAppeared, roomText().slice(-220));
check('the dialog explains who PHANTOM is', /PHANTOM is the Code Rx desk for/.test(roomText()));
const messageField = roomRoot().querySelector('textarea[aria-label="Your message to PHANTOM"]');
check('the dialog has a labelled message box', Boolean(messageField));
const messageBody = `Please confirm the delivery date for ${stamp}.`;
await typeInto(messageField, messageBody);
const dialogSend = [...roomRoot().querySelectorAll('[role="dialog"] button')]
  .find((button) => buttonLabel(button) === 'Send to PHANTOM');
if (dialogSend) dialogSend.dispatchEvent(new room.MouseEvent('click', { bubbles: true, cancelable: true }));
else console.log('  debug: the message send action was not on screen');
const messageReachedPhantom = await (async () => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const inbox = (await api('GET', '/api/notifications', null, token)).json?.data;
    const items = Array.isArray(inbox) ? inbox : (inbox?.items || []);
    if (items.some((row) => String(row.message || '').includes(`delivery date for ${stamp}`))) return true;
    await wait(250);
  }
  return false;
})();
check('the message reaches PHANTOM through the notification inbox', messageReachedPhantom);
const storedMessages = (await api('GET', `/api/client/project/${project.id}/messages`,
  null, null, { 'X-Code-Rx-Client-Session': clientToken })).json?.data?.messages || [];
check('the client\'s message is stored on the project, not only announced',
  storedMessages.some((message) => message.body === messageBody), JSON.stringify(storedMessages).slice(0, 200));
check('a message sent from the header is about the project, and says so by carrying no document',
  storedMessages.some((message) => message.body === messageBody && !message.document));
check('the room shows the client what they sent', roomText().includes('Please confirm the delivery date'));

// The same conversation, opened from an open document, names that document.
clickRoomByText('Close');
await waitForRoom(() => !roomRoot().querySelector('[role="dialog"][aria-label="Text PHANTOM"]'), 20);
clickRoomByText('Text PHANTOM about this');
const aboutDialog = await waitForRoom(() => Boolean(roomRoot().querySelector('[role="dialog"][aria-label="Text PHANTOM"]')), 30);
check('an open document can start a conversation about that document', aboutDialog);
const documentMessage = `About this letter, ${stamp}: please confirm.`;
await typeInto(roomRoot().querySelector('textarea[aria-label="Your message to PHANTOM"]'), documentMessage);
const aboutSend = [...roomRoot().querySelectorAll('[role="dialog"] button')].find((button) => buttonLabel(button) === 'Send to PHANTOM');
if (aboutSend) aboutSend.dispatchEvent(new room.MouseEvent('click', { bubbles: true, cancelable: true }));
else console.log('  debug: the document message send action was not on screen');
const aboutStored = await (async () => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const rows = (await api('GET', `/api/client/project/${project.id}/messages`,
      null, null, { 'X-Code-Rx-Client-Session': clientToken })).json?.data?.messages || [];
    if (rows.some((message) => message.body === documentMessage)) return rows;
    await wait(250);
  }
  return [];
})();
check('a message about a document names that document to PHANTOM',
  aboutStored.some((message) => message.body === documentMessage && message.document?.id === workLetter.id),
  JSON.stringify(aboutStored.slice(0, 2)).slice(0, 200));

const roomBin = (await api('GET', '/api/phantom/recycle-bin', null, token)).json?.data || [];
check('nothing in this flow deleted anything by accident',
  !roomBin.some((row) => String(row.title || '').includes(`Panel DOM work letter ${stamp}`)),
  JSON.stringify(roomBin.slice(0, 2)).slice(0, 160));

// --- the same document, deleted and restored, keeps its signature ----------
const binnedSigned = await api('DELETE', `/api/phantom/client-documents/${workLetter.id}`, null, token);
const binAfterSigned = (await api('GET', '/api/phantom/recycle-bin', null, token)).json?.data || [];
const signedBinRow = binAfterSigned.find((row) => String(row.title || '').includes(`Panel DOM work letter ${stamp}`));
check('a signed document deletes from the panel', binnedSigned.status === 200, JSON.stringify(binnedSigned.json).slice(0, 140));
check('the signed document waits in the Recycle Bin, visible to the operator', Boolean(signedBinRow));
if (signedBinRow) await api('POST', `/api/phantom/recycle-bin/${signedBinRow.id}/restore`, null, token);
await api('POST', `/api/phantom/client-documents/${workLetter.id}/lifecycle`, { state: 'published' }, token);
const signatureAfterRestore = (await api('GET', `/api/client/project/${project.id}/documents/${workLetter.id}/signature`,
  null, null, { 'X-Code-Rx-Client-Session': clientToken })).json?.data?.current;
check('the signature comes back with the document, so nothing is asked twice',
  signatureAfterRestore?.signerName === signerNameValue, JSON.stringify(signatureAfterRestore));

// ---------------------------------------------------------------------------
// PHASE 20 — one logo, the PHANTOM sign, and the review section, in the DOM the
// client actually gets.
// ---------------------------------------------------------------------------
console.log('\n--- one logo, PHANTOM in the room, and the review section ---');
const roomMarkup = room.document.getElementById('room-root').innerHTML;
check('the room carries the society\'s one official logo',
  roomMarkup.includes('/CODE%20RX11.png') && !/logo(-small)?\.png|icon-192\.png|apple-touch-icon\.png/.test(roomMarkup));
check('the room says PHANTOM, in the client\'s own view', roomText().includes('PHANTOM'));
check('PHANTOM is explained as the desk handling the project', roomText().includes('your Code Rx desk'));

const reviewShown = await waitForRoom(() => roomText().includes('Review this document'), 40);
check('every document the client opens carries the review section', reviewShown, roomText().slice(-260));
check('all four answers are on screen',
  ['Approved', 'Declined', 'Pending', 'Custom answer'].every((label) =>
    roomButtons().some((button) => String(button.textContent || '').replace(/\s+/g, ' ').trim() === label)),
  roomButtons().map((button) => String(button.textContent || '').trim()).slice(0, 14).join(' | '));

const approvedClicked = clickRoomByText('Approved');
const noteField = await (async () => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const field = room.document.querySelector('#room-root textarea[aria-label="Your feedback to PHANTOM"]');
    if (field) return field;
    await wait(150);
  }
  return null;
})();
check('choosing an answer opens the note and the send', approvedClicked && Boolean(noteField));
const reviewNote = `Approved from the DOM at ${stamp}.`;
if (noteField) {
  const setNote = Object.getOwnPropertyDescriptor(room.HTMLTextAreaElement.prototype, 'value').set;
  if (noteField._valueTracker) noteField._valueTracker.setValue('previous value');
  setNote.call(noteField, reviewNote);
  noteField.dispatchEvent(new room.Event('input', { bubbles: true }));
  noteField.dispatchEvent(new room.Event('change', { bubbles: true }));
  await wait(250);
}
// The innermost match: an ancestor section contains the review's text too, and
// its first button belongs to the signature card above.
const reviewSection = [...roomRoot().querySelectorAll('section')]
  .filter((section) => /Review this document/.test(section.textContent || '')).pop();
const sendReviewButton = (reviewSection || roomRoot()).querySelector ? [...(reviewSection || roomRoot()).querySelectorAll('button')]
  .find((button) => /Send to PHANTOM/.test(String(button.textContent || ''))) : null;
if (process.env.DOM_DEBUG) {
  console.log('  debug: review section found =', Boolean(reviewSection), 'send =', String(sendReviewButton && String(sendReviewButton.textContent || '')));
  console.log('  debug: room buttons =', roomButtons().map(buttonLabel).slice(0, 16).join(' | '));
  console.log('  debug: room tail =', JSON.stringify(roomText().slice(-260)));
}
if (sendReviewButton) sendReviewButton.dispatchEvent(new room.MouseEvent('click', { bubbles: true, cancelable: true }));
else console.log('  debug: the review send action was not on screen');

const answerReachedPhantom = await (async () => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const inbox = (await api('GET', '/api/notifications', null, token)).json?.data;
    const items = Array.isArray(inbox) ? inbox : (inbox?.items || []);
    if (items.some((row) => String(row.message || '').includes(clientName) && /Approved/i.test(String(row.message || '')))) return true;
    await wait(250);
  }
  return false;
})();
if (process.env.DOM_DEBUG && !answerReachedPhantom) {
  const alert = roomRoot().querySelector('[role="alert"]');
  console.log('  debug: room alert =', JSON.stringify(String(alert && alert.textContent || '(none)')));
  console.log('  debug: room requests =', roomFailures.slice(-8).join(' | ') || '(none)');
  console.log('  debug: review send disabled =', String(sendReviewButton && sendReviewButton.disabled));
  console.log('  debug: review tail =', JSON.stringify(roomText().slice(-320)));
}
check('pressing Send tells PHANTOM, by notification, what the client answered', answerReachedPhantom);
check('the client is told their answer went to PHANTOM', /sent to PHANTOM|Thank you/i.test(roomText()), roomText().slice(-200));
check('the answer the client gave is shown back to them', /You answered: Approved/.test(roomText()));
check('the client\'s own words travel with it', roomText().includes(reviewNote));

const reviewed = ((await api('GET', `/api/phantom/clients/${client.id}/documents`, null, token)).json?.data || [])
  .find((row) => row.id === (workLetter && workLetter.id));
check('the operator\'s own panel receives the answer with the document',
  reviewed?.review?.decision === 'approve' && String(reviewed?.review?.comment || '').includes(String(stamp)),
  JSON.stringify(reviewed?.review || null));
check('answering changed nothing about access: the document is still published and viewable',
  reviewed?.clientVisible === true && reviewed?.allowView === true && String(reviewed?.lifecycle) === 'published');
check('nothing in the review flow deleted anything', !roomBin.some((row) => String(row.title || '').includes(`Panel DOM work letter ${stamp}`)));

// ---------------------------------------------------------------------------
// PHASE 20 follow-up — a logo must never render as a broken image.
//
// Two layers are proved here in a real DOM: the header resolves a retired
// address to the official mark before the browser ever sees it, and if the mark
// itself cannot be fetched the element falls back to the official mark instead
// of showing the browser's broken-image icon.
// ---------------------------------------------------------------------------
console.log('\n--- the logo a browser is actually handed ---');
const logoBundle = await build({
  stdin: {
    contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { Navbar } from './src/components/Navbar';
      import { EditableImage } from './src/components/VisualEditorContext';
      // A payload exactly like one saved before the retired files were removed.
      const media = {
        'brand.logoSmall': { src: '/logo-small.png', alt: 'Code Rx Society' },
        'hero.logo': { src: 'https://coderxsociety.pages.dev/logo.png?v=3', alt: 'Hero' },
      };
      createRoot(document.getElementById('logo-root')).render(React.createElement(React.Fragment, null,
        React.createElement('div', { id: 'navbar-probe' },
          React.createElement(Navbar, {
            onDashboardToggle: () => {}, isDashboard: false, activeTab: 'home', setActiveTab: () => {}, copy: {}, media,
          }),
        ),
        // The last line of defence, on its own: a logo slot handed a retired
        // address by anything at all, plus an ordinary image that must be left
        // to the browser's own behaviour.
        React.createElement('div', { id: 'fallback-probe' },
          React.createElement(EditableImage, {
            elementKey: 'nav.logo', mediaKey: 'brand.logoSmall', label: 'Navigation logo',
            src: '/logo-small.png', alt: 'Code Rx Society',
          }),
          React.createElement(EditableImage, {
            elementKey: 'projects.1.image', mediaKey: 'projects.1.image', label: 'A project photo',
            src: '/logo.png', alt: 'A project photo',
          }),
        ),
      ));
    `,
    resolveDir: ROOT,
    loader: 'tsx',
  },
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  define: {
    'process.env.NODE_ENV': '"development"',
    'import.meta.env.VITE_API_URL': 'undefined',
    'import.meta.env.VITE_R2_BUCKET_URL': 'undefined',
  },
  write: false,
  logLevel: 'error',
});
const logoDom = new JSDOM(html.replace('<div id="root"></div>', '<div id="root"></div><div id="logo-root"></div>'), {
  url: pageUrl, runScripts: 'outside-only', pretendToBeVisual: true,
});
const logoWindow = logoDom.window;
logoWindow.matchMedia = logoWindow.matchMedia || (() => ({ matches: false, media: '', onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } }));
logoWindow.fetch = (input, init) => nodeFetch(new URL(typeof input === 'string' ? input : input.url, pageUrl), init);
logoWindow.eval(logoBundle.outputFiles[0].text);
await wait(400);
const navbarRoot = logoWindow.document.getElementById('navbar-probe');
const headerImages = [...navbarRoot.querySelectorAll('img')];
const headerSrcs = headerImages.map((image) => image.getAttribute('src'));
check('the header never asks the browser for a retired logo file',
  headerSrcs.length > 0 && headerSrcs.every((src) => !/logo(-small)?\.png|icon-192\.png|apple-touch-icon\.png/.test(String(src))),
  headerSrcs.join(', '));
check('the header asks for the society\'s one official mark',
  headerSrcs.every((src) => String(src).includes('CODE%20RX11.png')), headerSrcs.join(', '));

// Even if that file could not be fetched, the element must not show the
// browser's broken-image icon: the fallback is the official mark.
const probeRoot = logoWindow.document.getElementById('fallback-probe');
const [staleLogo, ordinaryImage] = [...probeRoot.querySelectorAll('img')];
check('a logo slot handed a retired address starts on that address', 
  String(staleLogo && staleLogo.getAttribute('src')) === '/logo-small.png',
  String(staleLogo && staleLogo.getAttribute('src')));
staleLogo.dispatchEvent(new logoWindow.Event('error'));
await wait(250);
check('a logo that cannot be fetched falls back to the official mark, not a broken icon',
  String(staleLogo.getAttribute('src')).includes('CODE%20RX11.png'), String(staleLogo.getAttribute('src')));
check('the fallback keeps the alt text, so the mark is still described',
  String(staleLogo.getAttribute('alt') || '').length > 0);
ordinaryImage.dispatchEvent(new logoWindow.Event('error'));
await wait(250);
check('an ordinary image is left to the browser\'s own behaviour, never replaced by a logo',
  String(ordinaryImage.getAttribute('src')) === '/logo.png', String(ordinaryImage.getAttribute('src')));

console.log(`\nPANEL DOM TOTAL: ${ok.length + bad.length}   PASSED: ${ok.length}   FAILED: ${bad.length}`);
for (const failure of bad) console.log(`  - ${failure}`);
process.exit(bad.length ? 1 : 0);
