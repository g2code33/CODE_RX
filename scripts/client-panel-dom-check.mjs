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

const api = async (method, endpoint, body, token) => {
  const response = await fetch(`${BASE}${endpoint}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
const project = (await api('POST', `/api/phantom/clients/${client.id}/projects`, { name: `Panel DOM Project ${stamp}` }, token)).json?.data;
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
console.log('\n--- the client room: work on a document, save it, send it back ---');
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
const clientMe = (await api('GET', '/api/client/me', null, null)).json?.data
  || (await api('GET', '/api/client/me', null, null)).json?.data;
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
room.fetch = (input, init) => nodeFetch(new URL(typeof input === 'string' ? input : input.url, pageUrl), init);
room.eval(roomCode);

const roomText = () => room.document.getElementById('room-root').textContent.replace(/\s+/g, ' ').trim();
const roomButtons = () => [...room.document.getElementById('room-root').querySelectorAll('button')];
const clickRoomByText = (label, exact = true) => {
  const labelOf = (button) => String(button.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const target = (exact ? roomButtons().find((button) => labelOf(button) === label.toLowerCase()) : null)
    || roomButtons().find((button) => labelOf(button).includes(label.toLowerCase()));
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

await waitForRoom(() => roomText().includes(project.name), 60);
if (!roomText()) console.log('  room errors:', roomErrors.slice(0, 3).join(' | ') || '(none reported)');
check('the client room opens on the project it was given',
  roomText().includes(project.reference) && roomText().includes(clientName), roomText().slice(0, 200));
clickRoomByText('Documents');
await waitForRoom(() => roomText().includes(workLetter ? `Panel DOM work letter ${stamp}` : 'not-here'), 40);
check('the sent document is listed in the client\'s own room', roomText().includes(`Panel DOM work letter ${stamp}`), roomText().slice(0, 220));

// The row is opened by its own View action, exactly as a client would.
clickRoomByText('View');
const editorAppeared = await waitForRoom(() => roomText().includes('Work on this document'), 60);
if (!editorAppeared) console.log('  room buttons:', roomButtons().map((button) => String(button.textContent || '').replace(/\s+/g, ' ').trim()).slice(0, 10).join(' | '));
if (!editorAppeared) console.log('  room errors:', roomErrors.slice(0, 3).join(' | ') || '(none reported)');
check('opening the document offers the client somewhere to work', editorAppeared, roomText().slice(0, 260));

const textarea = room.document.querySelector('#room-root textarea');
check('the client gets a real writing area they can type in', Boolean(textarea));
const revisionText = `The client wrote this on ${stamp}. It is their revision of the letter.`;
if (textarea) {
  const setValue = Object.getOwnPropertyDescriptor(room.HTMLTextAreaElement.prototype, 'value').set;
  // React tracks the last value it saw; without resetting that tracker the
  // programmatic change is treated as no change and never reaches the state.
  if (textarea._valueTracker) textarea._valueTracker.setValue('previous value');
  setValue.call(textarea, revisionText);
  textarea.dispatchEvent(new room.Event('input', { bubbles: true }));
  textarea.dispatchEvent(new room.Event('change', { bubbles: true }));
}
await wait(300);
const saveButton = roomButtons().find((button) => String(button.textContent || '').replace(/\s+/g, ' ').trim() === 'Save');
const sendButton = roomButtons().find((button) => String(button.textContent || '').replace(/\s+/g, ' ').trim().includes('Save & send to Code Rx'));
check('the room offers both a Save and a send action', Boolean(saveButton && sendButton),
  roomButtons().map((button) => String(button.textContent || '').trim()).slice(0, 8).join(' | '));

if (saveButton) saveButton.dispatchEvent(new room.MouseEvent('click', { bubbles: true, cancelable: true }));
const savedOnServer = await (async () => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const vaultNow = (await api('GET', `/api/vault/documents/${vaultDoc.id}`, null, token)).json?.data;
    const text = (vaultNow?.contentJson?.blocks || []).map((block) => String(block?.content || '')).join('\n');
    if (text.includes(`The client wrote this on ${stamp}`)) return true;
    await wait(250);
  }
  return false;
})();
if (!savedOnServer) {
  const panelState = room.document.getElementById('room-root').textContent.replace(/\s+/g, ' ');
  console.log('  debug: textarea value =', JSON.stringify(String(textarea && textarea.value || '').slice(0, 80)));
  console.log('  debug: room tail =', JSON.stringify(panelState.slice(-320)));
  const copy = ((await api('GET', `/api/phantom/clients/${client.id}/documents`, null, token)).json?.data || [])
    .find((row) => row.id === (workLetter && workLetter.id));
  console.log('  debug: server copy =', JSON.stringify(copy).slice(0, 220));
  const debugVault = (await api('GET', `/api/vault/documents/${vaultDoc.id}`, null, token)).json?.data;
  console.log('  debug: vault content =', JSON.stringify(debugVault?.contentJson).slice(0, 260));
  console.log('  debug: vault content text =', JSON.stringify(String(debugVault?.content || '').slice(0, 160)));
}
check('pressing Save really saves: the Code Rx Vault copy now carries the client\'s words', savedOnServer);
check('the client is told their revision was kept', /Saved/i.test(roomText()), roomText().slice(-200));

// Re-found at click time: the room re-renders after a save, so the element
// captured before the save may already have been replaced.
const sendNow = roomButtons().find((button) => String(button.textContent || '').replace(/\s+/g, ' ').trim().includes('Save & send to Code Rx'));
if (sendNow) sendNow.dispatchEvent(new room.MouseEvent('click', { bubbles: true, cancelable: true }));
else console.log('  debug: the send action was not on screen after saving');
const toldPhantom = await (async () => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const inbox = (await api('GET', '/api/notifications', null, token)).json?.data;
    const items = Array.isArray(inbox) ? inbox : (inbox?.items || []);
    if (items.some((row) => String(row.message || '').includes(`Panel DOM work letter ${stamp}`))) return true;
    await wait(250);
  }
  return false;
})();
check('pressing Save & send tells PHANTOM the document came back', toldPhantom);

const roomBin = (await api('GET', '/api/phantom/recycle-bin', null, token)).json?.data || [];
check('nothing in this flow deleted anything by accident',
  !roomBin.some((row) => String(row.title || '').includes(`Panel DOM work letter ${stamp}`)),
  JSON.stringify(roomBin.slice(0, 2)).slice(0, 160));

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
const sendReviewButton = roomButtons().find((button) => String(button.textContent || '').replace(/\s+/g, ' ').trim().includes('Send to PHANTOM'));
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

console.log(`\nPANEL DOM TOTAL: ${ok.length + bad.length}   PASSED: ${ok.length}   FAILED: ${bad.length}`);
for (const failure of bad) console.log(`  - ${failure}`);
process.exit(bad.length ? 1 : 0);
