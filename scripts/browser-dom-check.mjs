#!/usr/bin/env node
/**
 * CODE Rx — the direct-link check, run in a real DOM.
 *
 * The other harnesses drive the API and inspect the source; this one opens the
 * SHIPPED bundle in jsdom (the same single-file build the browser downloads)
 * against a running preview and follows a direct link exactly as a browser
 * does: the server generates the address, the address is fetched, the app boots
 * at that address, the token is exchanged and removed from the address bar, and
 * the destination renders.
 *
 * Dev-only and opt-in: it needs jsdom, which is deliberately NOT a dependency of
 * the application. Install it in a scratch directory and point NODE_PATH at it:
 *
 *   mkdir -p /tmp/browser && cd /tmp/browser && npm i jsdom
 *   cd /home/user/CODE_RX && NODE_PATH=/tmp/browser/node_modules \
 *     node scripts/browser-dom-check.mjs
 *
 * The preview must already be running (npx wrangler pages dev dist --port 8788)
 * with the PHANTOM account from .dev.vars.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const BASE = process.env.CODE_RX_PREVIEW || 'http://127.0.0.1:8788';
const HOST = process.env.E2B_SANDBOX_ID ? `https://8788-${process.env.E2B_SANDBOX_ID}.e2b.app` : BASE;
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
      'cf-connecting-ip': `203.0.113.${Math.floor(Math.random() * 200) + 1}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, json: await response.json().catch(() => null) };
};

// --- 1. the server generates the address -----------------------------------
const login = await api('POST', '/api/auth/login', { email: EMAIL, password: PASSWORD });
const token = login.json?.token || login.json?.data?.token;
if (!token) { console.log('FAIL — PHANTOM could not sign in'); process.exit(1); }

const clients = await api('GET', '/api/phantom/clients', null, token);
const list = clients.json?.data?.clients || clients.json?.data || [];
const client = list.filter((entry) => String(entry.name || '').startsWith('Live Upload Client')).pop();
if (!client) { console.log('FAIL — no published live-check client found; run the live check first'); process.exit(1); }
const projects = await api('GET', `/api/phantom/clients/${client.id}/projects`, null, token);
const project = (projects.json?.data?.projects || projects.json?.data || [])[0];

const created = await api('POST', `/api/phantom/clients/${client.id}/links`, {
  projectId: project.id, destination: 'project', mode: 'DIRECT_ACCESS', maxUses: null, expiresInMinutes: 120,
}, token, {});
const link = await fetch(`${BASE}/api/phantom/clients/${client.id}/links`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, Origin: HOST },
  body: JSON.stringify({ projectId: project.id, destination: 'project', mode: 'DIRECT_ACCESS', maxUses: null, expiresInMinutes: 120 }),
}).then((response) => response.json());

console.log('server-generated address :', link.data.url);
void created;

// --- 2. open that address in a real DOM -------------------------------------
const pageUrl = `${BASE}/l/${link.data.token}`;
const html = await (await fetch(pageUrl)).text();
const bundle = /<script type="module"[^>]*>([\s\S]*?)<\/script>/.exec(html);
if (!bundle) { console.log('FAIL — the shipped page carries no application bundle'); process.exit(1); }
const appFile = path.join(os.tmpdir(), `code-rx-app-${Date.now()}.mjs`);
fs.writeFileSync(appFile, bundle[1]);

const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', () => {});
const dom = new JSDOM(html, { url: pageUrl, pretendToBeVisual: true, virtualConsole });
const { window } = dom;

// The bundle expects browser globals. Everything is taken from jsdom except the
// primitives Node already provides (whose jsdom wrappers recurse in Node).
const keep = new Set(['window', 'document', 'self', 'globalThis', 'fetch', 'crypto', 'location', 'navigator',
  'console', 'queueMicrotask', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance',
  'structuredClone', 'MessageChannel', 'MessagePort', 'Blob', 'File', 'FormData', 'Headers', 'Request',
  'Response', 'URL', 'URLSearchParams', 'TextEncoder', 'TextDecoder', 'AbortController', 'AbortSignal']);
for (const key of Object.getOwnPropertyNames(window)) {
  if (keep.has(key)) continue;
  try { Object.defineProperty(globalThis, key, { value: window[key], configurable: true, writable: true }); } catch { /* frozen global */ }
}
const nodeFetch = globalThis.fetch;
const localFetch = (input, init) => nodeFetch(new URL(typeof input === 'string' ? input : input.url, pageUrl), init);
window.fetch = localFetch;
globalThis.fetch = localFetch;
window.matchMedia = window.matchMedia || (() => ({ matches: false, media: '', onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } }));
window.ResizeObserver = window.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} };
window.IntersectionObserver = window.IntersectionObserver || class { observe() {} unobserve() {} disconnect() {} };
window.scrollTo = () => {};
window.alert = () => {};
globalThis.window = window;
globalThis.document = window.document;

await import(appFile);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const text = () => window.document.body.textContent.replace(/\s+/g, ' ').trim();
for (let attempt = 0; attempt < 60 && text().length < 40; attempt += 1) await wait(250);

const body = text();
const addressBar = window.location.href;
const landed = body.includes(project.name);
const cleared = !addressBar.includes(link.data.token);

console.log('address bar after open  :', addressBar);
console.log('window rendered         :', body.slice(0, 300));
console.log('landed in the room      :', landed);
console.log('token cleared from URL  :', cleared);
console.log(landed && cleared ? 'RESULT: the address leads directly there' : 'RESULT: FAILED');
process.exit(landed && cleared ? 0 : 1);
