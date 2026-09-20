/**
 * Phase 20 — live check.
 *
 * Runs the three things asked for against a running Code Rx API and reports a
 * plain count of green checks:
 *
 *   1. ONE logo everywhere. `public/CODE RX11.png` is the society's only mark:
 *      it is what the site serves, what the letter's header band and watermark
 *      are drawn with, and it is the same artwork the delivery pipeline carries.
 *      Nothing in `public/` is a second logo any more.
 *   2. The client project room carries the text PHANTOM.
 *   3. A review section on everything sent to a client — approve, decline,
 *      pending, or the client's own words — whose answer reaches PHANTOM and
 *      raises a PHANTOM notification.
 *
 * Usage:
 *   node scripts/phase20-live-check.mjs                 (defaults to the local preview)
 *   CODEX_BASE=https://host node scripts/phase20-live-check.mjs
 *
 * Credentials come from the environment (PHANTOM_EMAIL / ADMIN_PASSWORD) with
 * the local preview's development values as the fallback. Nothing here is a
 * credential in a URL, and no token is ever printed.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const BASE = (process.env.CODEX_BASE || 'http://127.0.0.1:8788').replace(/\/+$/, '');
const EMAIL = process.env.PHANTOM_EMAIL || process.env.ADMIN_EMAIL || 'coderxsociety@gmail.com';
const PASSWORD = process.env.ADMIN_PASSWORD || 'DevPreviewPassword1';
const ROOT = path.resolve(new URL('..', import.meta.url).pathname);

let passed = 0;
const failures = [];
const check = (label, condition, detail = '') => {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failures.push(label);
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
};
const section = (title) => console.log(`\n${title}`);

/** A member call: the operator's own token. */
const call = async (method, path_, body, token) => {
  const response = await fetch(`${BASE}${path_}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const type = response.headers.get('content-type') || '';
  if (!type.includes('json')) {
    const bytes = Buffer.from(await response.arrayBuffer());
    return { status: response.status, bytes, headers: response.headers, json: null, text: '' };
  }
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* reported as-is */ }
  return { status: response.status, json, text, headers: response.headers, bytes: null };
};

/** A client call: the client session has its own credential and its own header. */
const clientCall = async (method, path_, body, sessionToken) => {
  const response = await fetch(`${BASE}${path_}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      'X-Code-Rx-Client-Session': sessionToken,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const type = response.headers.get('content-type') || '';
  if (!type.includes('json')) {
    const bytes = Buffer.from(await response.arrayBuffer());
    return { status: response.status, bytes, headers: response.headers, json: null, text: '' };
  }
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* reported as-is */ }
  return { status: response.status, json, text, headers: response.headers, bytes: null };
};

const rows = (value) => (Array.isArray(value)
  ? value
  : value?.clients || value?.projects || value?.documents || value?.items || []);

// ---------------------------------------------------------------------------
// Reading a PNG well enough to compare two renders of the same artwork.
// ---------------------------------------------------------------------------

/** Decodes an 8-bit PNG (greyscale / RGB / RGBA / palette) into RGBA pixels. */
const decodePng = (bytes) => {
  const buffer = Buffer.from(bytes);
  let at = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let colour = 0;
  let palette = null;
  const idat = [];
  while (at < buffer.length) {
    const length = buffer.readUInt32BE(at);
    const type = buffer.slice(at + 4, at + 8).toString('latin1');
    const data = buffer.slice(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      depth = data[8]; colour = data[9];
    } else if (type === 'PLTE') palette = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    at += 12 + length;
  }
  if (depth !== 8) throw new Error(`unsupported PNG bit depth ${depth}`);
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colour];
  if (!channels) throw new Error(`unsupported PNG colour type ${colour}`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(width * height * 4, 255);
  const prior = Buffer.alloc(stride);
  const row = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.slice(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    for (let i = 0; i < stride; i += 1) {
      const a = i >= channels ? row[i - channels] : 0;
      const b = prior[i];
      const c = i >= channels ? prior[i - channels] : 0;
      let value = line[i];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        value += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      row[i] = value & 0xff;
    }
    row.copy(prior);
    for (let x = 0; x < width; x += 1) {
      const src = x * channels;
      const dst = (y * width + x) * 4;
      if (colour === 6) { pixels[dst] = row[src]; pixels[dst + 1] = row[src + 1]; pixels[dst + 2] = row[src + 2]; pixels[dst + 3] = row[src + 3]; }
      else if (colour === 2) { pixels[dst] = row[src]; pixels[dst + 1] = row[src + 1]; pixels[dst + 2] = row[src + 2]; }
      else if (colour === 0) { pixels[dst] = pixels[dst + 1] = pixels[dst + 2] = row[src]; }
      else if (colour === 4) { pixels[dst] = pixels[dst + 1] = pixels[dst + 2] = row[src]; pixels[dst + 3] = row[src + 1]; }
      else if (colour === 3 && palette) { const p = row[src] * 3; pixels[dst] = palette[p]; pixels[dst + 1] = palette[p + 1]; pixels[dst + 2] = palette[p + 2]; }
    }
  }
  return { width, height, pixels };
};

/** Mean absolute per-channel difference between two same-sized images. */
const pixelDistance = (a, b) => {
  if (a.width !== b.width || a.height !== b.height) return Infinity;
  let total = 0;
  for (let i = 0; i < a.pixels.length; i += 1) {
    if (i % 4 === 3) continue;
    total += Math.abs(a.pixels[i] - b.pixels[i]);
  }
  return total / (a.pixels.length * 0.75);
};

/** Box-average downscale — enough to compare two renders of one artwork. */
const downscale = (image, width, height) => {
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const x0 = Math.floor((x * image.width) / width);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * image.width) / width));
      const y0 = Math.floor((y * image.height) / height);
      const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * image.height) / height));
      let r = 0; let g = 0; let b = 0; let a = 0; let n = 0;
      for (let sy = y0; sy < y1; sy += 1) {
        for (let sx = x0; sx < x1; sx += 1) {
          const at = (sy * image.width + sx) * 4;
          r += image.pixels[at]; g += image.pixels[at + 1]; b += image.pixels[at + 2]; a += image.pixels[at + 3];
          n += 1;
        }
      }
      const dst = (y * width + x) * 4;
      pixels[dst] = Math.round(r / n); pixels[dst + 1] = Math.round(g / n);
      pixels[dst + 2] = Math.round(b / n); pixels[dst + 3] = Math.round(a / n);
    }
  }
  return { width, height, pixels };
};

/** The mark's artwork laid over a flat background colour, as a PDF stores it. */
const overBackground = (image, colour) => {
  const pixels = Buffer.alloc(image.width * image.height * 4, 255);
  for (let i = 0; i < image.width * image.height; i += 1) {
    const alpha = image.pixels[i * 4 + 3] / 255;
    for (let channel = 0; channel < 3; channel += 1) {
      pixels[i * 4 + channel] = Math.round(image.pixels[i * 4 + channel] * alpha + colour[channel] * (1 - alpha));
    }
  }
  return { width: image.width, height: image.height, pixels };
};

/** Every 96×96 image the delivered letter embeds, as raw RGB pixels. */
const embeddedMarks = (bytes) => {
  const latin = Buffer.from(bytes).toString('latin1');
  const found = [];
  const pattern = /\/Subtype \/Image[\s\S]{0,400}?stream\r?\n/g;
  let match;
  while ((match = pattern.exec(latin)) !== null) {
    const width = Number(/\/Width (\d+)/.exec(match[0])?.[1] || 0);
    const height = Number(/\/Height (\d+)/.exec(match[0])?.[1] || 0);
    const colours = Number(/\/Colors (\d+)/.exec(match[0])?.[1] || 3);
    const start = match.index + match[0].length;
    const end = latin.indexOf('endstream', start);
    let raw = null;
    try { raw = zlib.inflateSync(Buffer.from(latin.slice(start, end), 'latin1')); } catch { raw = null; }
    if (!raw || !width || !height || colours !== 3) continue;
    const stride = width * colours;
    if (raw.length < stride * height) continue;
    const pixels = Buffer.alloc(width * height * 4, 255);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const src = y * stride + x * 3;
        const dst = (y * width + x) * 4;
        pixels[dst] = raw[src]; pixels[dst + 1] = raw[src + 1]; pixels[dst + 2] = raw[src + 2];
      }
    }
    found.push({ width, height, pixels });
  }
  return found;
};

// ---------------------------------------------------------------------------

const login = await call('POST', '/api/auth/login', { email: EMAIL, password: PASSWORD });
const token = login.json?.token || login.json?.data?.token;
if (!token) {
  console.error(`Could not sign in as the operator (${login.status}).`);
  process.exit(1);
}

// Client access is a switch PHANTOM owns. Against the local preview the check
// turns it on (a fresh preview database starts with it off); against any other
// host it is never touched — the check reports what it found instead.
const portalSettings = await call('GET', '/api/phantom/client-portal-settings', null, token);
const portalEnabled = rows(portalSettings.json?.data).find((row) => row.key === 'client_portal_enabled')?.value === true
  || portalSettings.json?.data?.client_portal_enabled === true;
if (!portalEnabled && !process.env.CODEX_BASE) {
  await call('PUT', '/api/phantom/client-portal-settings', {
    settings: [{ key: 'client_portal_enabled', value: true }, { key: 'client_downloads_enabled', value: true }],
  }, token);
}
const portalNowOn = !process.env.CODEX_BASE
  || rows((await call('GET', '/api/phantom/client-portal-settings', null, token)).json?.data)
    .find((row) => row.key === 'client_portal_enabled')?.value === true;
if (!portalNowOn) {
  console.log('\nClient access is switched off on this host, so the client-side checks cannot run.');
  console.log('Turn it on in PHANTOM → Client Access → Permissions, then run this check again.');
  process.exit(1);
}

const stamp = Date.now();
const client = (await call('POST', '/api/phantom/clients', { name: `Phase 20 client ${stamp}` }, token)).json?.data;
const project = (await call('POST', `/api/phantom/clients/${client.id}/projects`, { name: 'Phase 20 project' }, token)).json?.data;
const sections = rows((await call('GET', '/api/vault/sections', null, token)).json?.data);
const vaultSection = sections.find((entry) => entry.permissions?.create && Number(entry.is_sensitive) !== 1);

section('Setup: a client, their project, and one document sent to them');
const vault = await call('POST', '/api/vault/documents', {
  section: vaultSection.slug, title: `Phase 20 Vault document ${stamp}`, content: 'The original Code Rx wording.',
}, token);
const vaultId = vault.json?.data?.id;
const created = await call('POST', `/api/phantom/clients/${client.id}/documents`, {
  projectId: project.id, category: 'letter', title: `Phase 20 letter ${stamp}`,
  contentText: 'The original Code Rx wording for the Phase 20 letter.', vaultDocumentId: vaultId,
}, token);
const documentId = created.json?.data?.id;
check('a client, a project and a document exist', Boolean(client?.id && project?.id && documentId), created.text.slice(0, 140));
await call('POST', `/api/phantom/client-documents/${documentId}/lifecycle`, { state: 'published' }, token);

const draft = await call('POST', `/api/phantom/clients/${client.id}/documents`, {
  projectId: project.id, category: 'report', title: `Phase 20 draft ${stamp}`, contentText: 'Not published yet.',
}, token);
const draftId = draft.json?.data?.id;

const issued = await call('POST', `/api/phantom/clients/${client.id}/keys`, { label: `Phase 20 key ${stamp}` }, token);
const session = (await call('POST', '/api/client/auth/login', { passkey: issued.json?.data?.passkey })).json?.data?.session?.token;
check('the client signs in with their own credential', Boolean(session));

// ---------------------------------------------------------------------------
section('Ask 1 — the letter carries the official mark, in the header and the watermark');
const officialBytes = fs.readFileSync(path.join(ROOT, 'public/CODE RX11.png'));
const official = decodePng(officialBytes);

const served = await call('GET', '/CODE%20RX11.png');
check('the official mark is served as an image', served.status === 200 && String(served.headers.get('content-type')).includes('image/png'),
  String(served.headers.get('content-type')));
check('the bytes served are the society\'s official file, unchanged',
  Boolean(served.bytes) && served.bytes.equals(officialBytes), `${served.bytes?.length} bytes`);

const spaced = await call('GET', '/CODE RX11.png');
check('the address with a plain space serves the same mark',
  spaced.status === 200 && Boolean(spaced.bytes) && spaced.bytes.equals(officialBytes));

const retired = await Promise.all(['/logo.png', '/logo-small.png', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png']
  .map((address) => call('GET', address)));
check('no retired logo is served as an image any more',
  retired.every((response) => !String(response.headers.get('content-type') || '').includes('image')),
  retired.map((response) => String(response.headers.get('content-type'))).join(' | '));
check('and the addresses those files used to live at are not left to 404 silently in an <img>',
  retired.every((response) => response.status === 200 || response.status === 404));

// The layers that stop a retired address from ever reaching a browser.
const savedLegacy = await call('PUT', '/api/site-content', {
  version: 2,
  media: {
    'brand.logoSmall': { src: '/logo-small.png', alt: 'Navigation logo' },
    'hero.logo': { src: 'https://coderxsociety.pages.dev/logo.png?v=3', alt: 'Hero logo' },
    'projects.1.image': { src: '/logo.png', alt: 'A project photo that happens to be named logo' },
  },
}, token);
check('a payload naming a retired logo can still be saved', savedLegacy.status === 200, savedLegacy.text.slice(0, 140));
check('the save says the logos were corrected',
  /official Code Rx mark/i.test(String(savedLegacy.json?.message || '')), String(savedLegacy.json?.message || ''));
const healed = await call('GET', '/api/site-content');
check('the public read hands the browser the official mark, however the retired one was written',
  healed.json?.data?.media?.['brand.logoSmall']?.src === '/CODE%20RX11.png'
  && healed.json?.data?.media?.['hero.logo']?.src === '/CODE%20RX11.png',
  JSON.stringify(healed.json?.data?.media || {}).slice(0, 200));
check('an image that is not a logo slot is left alone',
  healed.json?.data?.media?.['projects.1.image']?.src === '/logo.png');
check('the operator\'s alt text is kept',
  healed.json?.data?.media?.['brand.logoSmall']?.alt === 'Navigation logo');

const shell = await call('GET', '/');
const shellText = String(shell.bytes || shell.text || '');
check('the page the browser receives names only the official mark',
  shellText.includes('CODE%20RX11.png') && !/logo(-small)?\.png|icon-192\.png|apple-touch-icon\.png/.test(shellText));

const manifest = await call('GET', '/manifest.webmanifest');
const manifestText = String(manifest.text || manifest.bytes || '');
check('the install manifest uses the official mark and nothing else',
  manifestText.includes('/CODE%20RX11.png') && !/logo(-small)?\.png|icon-192\.png/.test(manifestText));

const worker = await call('GET', '/sw.js');
const workerText = String(worker.text || worker.bytes || '');
check('the offline cache list holds the official mark and no retired logo',
  workerText.includes('/CODE%20RX11.png') && !/logo(-small)?\.png|icon-192\.png|apple-touch-icon\.png/.test(workerText));

// The mark the delivery pipeline carries, read straight from the shipping code.
const logoSource = fs.readFileSync(path.join(ROOT, 'functions/lib/client-delivery-logo.ts'), 'utf8');
const embeddedBase64 = /const BRAND_MARK_PNG_BASE64 =([\s\S]*?);\n/.exec(logoSource)?.[1]
  ?.replace(/'/g, '').replace(/\+\s*\n/g, '').replace(/\s/g, '') || '';
const pipelineMark = decodePng(Buffer.from(embeddedBase64, 'base64'));
check('the mark the letters are stamped with is 96×96', pipelineMark.width === 96 && pipelineMark.height === 96,
  `${pipelineMark.width}×${pipelineMark.height}`);
const markDistance = pixelDistance(pipelineMark, downscale(official, 96, 96));
check('that mark is the official artwork', markDistance < 25, `mean channel difference ${markDistance.toFixed(2)}`);
check('the retired mark is gone from the pipeline', !/logo-small|logo\.png/.test(logoSource));

const letter = await clientCall('GET', `/api/client/project/${project.id}/documents/${documentId}/preview`, null, session);
check('the client can open the stamped letter', letter.status === 200 && Boolean(letter.bytes?.length), `${letter.status}`);
const marks = letter.bytes ? embeddedMarks(letter.bytes) : [];
check('the letter embeds the mark more than once — the header band and the watermark',
  marks.length >= 2, `${marks.length} images`);
const matching = marks.filter((mark) => {
  const corners = [[0, 0], [mark.width - 1, 0], [0, mark.height - 1], [mark.width - 1, mark.height - 1]]
    .map(([x, y]) => { const at = (y * mark.width + x) * 4; return [mark.pixels[at], mark.pixels[at + 1], mark.pixels[at + 2]]; });
  const background = [0, 1, 2].map((channel) => Math.round(corners.reduce((total, corner) => total + corner[channel], 0) / corners.length));
  return Math.min(
    pixelDistance(mark, overBackground(pipelineMark, [255, 255, 255])),
    pixelDistance(mark, overBackground(pipelineMark, background)),
  ) < 8;
});
check('every mark in the letter is the official logo, not the retired one',
  marks.length >= 2 && matching.length === marks.length, `${matching.length}/${marks.length} match`);

// ---------------------------------------------------------------------------
section('Ask 2 — the client project room carries the text PHANTOM');
check('the room the browser loads carries the PHANTOM desk sign',
  shellText.includes('your Code Rx desk') && /PHANTOM/.test(shellText));
const room = await clientCall('GET', `/api/client/project/${project.id}`, null, session);
check('the room itself opens for the client', room.status === 200, room.text.slice(0, 120));

// ---------------------------------------------------------------------------
section('Ask 3 — the review section: four answers on a document sent to the client');
const reviewPath = `/api/client/project/${project.id}/documents/${documentId}/review`;
check('the review cannot be read without a client session', (await call('GET', reviewPath)).status === 401);
check('the review cannot be answered without a client session', (await call('POST', reviewPath, { decision: 'approve' })).status === 401);

const read = await clientCall('GET', reviewPath, null, session);
check('the client can read the review section', read.status === 200, read.text.slice(0, 140));
const choices = (read.json?.data?.choices || []).map((choice) => choice.decision);
check('the four answers are exactly approve, decline, pending and the client\'s own words',
  choices.join(',') === 'approve,decline,pending,custom', choices.join(','));
check('the answers are worded for the client',
  (read.json?.data?.choices || []).map((choice) => choice.label).join(',') === 'Approved,Declined,Pending,Custom answer');
check('only the client\'s own answer takes free text',
  (read.json?.data?.choices || []).filter((choice) => choice.freeText).map((choice) => choice.decision).join(',') === 'custom');
check('the review section says how much the client may write', Number(read.json?.data?.maxChars) === 2000);
check('a document the client has not answered yet shows no answer', read.json?.data?.current === null);

const approved = await clientCall('POST', reviewPath, { decision: 'approve', comment: 'This is exactly right. Go ahead.' }, session);
check('the client can approve a document', approved.status === 200, approved.text.slice(0, 140));
check('the client is told their answer went to PHANTOM', /PHANTOM/.test(String(approved.json?.message || '')), String(approved.json?.message || ''));

const reread = await clientCall('GET', reviewPath, null, session);
check('the answer is kept and read back', reread.json?.data?.current?.decision === 'approve');
check('the client\'s note is kept with the answer', reread.json?.data?.current?.comment === 'This is exactly right. Go ahead.');
check('the answer carries the time it was given', Boolean(reread.json?.data?.current?.at));

const inbox = rows((await call('GET', '/api/notifications', null, token)).json?.data);
const notice = inbox.find((row) => String(row.message || '').includes(`Phase 20 letter ${stamp}`));
check('PHANTOM is notified in the existing inbox', Boolean(notice), JSON.stringify(inbox[0] || {}).slice(0, 140));
check('the notification names the client and what they answered',
  Boolean(notice) && String(notice.message).includes(`Phase 20 client ${stamp}`) && /Approved/i.test(String(notice.message)));
check('the notification carries the client\'s words', Boolean(notice) && String(notice.message).includes('This is exactly right'));

const activity = rows((await call('GET', `/api/phantom/clients/${client.id}/activity`, null, token)).json?.data);
check('the client\'s activity history records the answer in plain words',
  JSON.stringify(activity).includes('Answered the review'), JSON.stringify(activity).slice(0, 200));
const auditLogs = rows((await call('GET', '/api/phantom/audit-logs?limit=200', null, token)).json?.data);
const auditEntry = auditLogs.find((row) => row.action === 'client.document.reviewed' && String(row.entity_ref || row.target || '').length >= 0
  && JSON.stringify(row).includes(String(documentId)));
check('the answer is in the audit trail with its decision',
  Boolean(auditEntry) && /approve/.test(JSON.stringify(auditEntry)), JSON.stringify(auditLogs[0] || {}).slice(0, 140));

const panel = rows((await call('GET', `/api/phantom/clients/${client.id}/documents`, null, token)).json?.data)
  .find((row) => row.id === documentId);
check('the operator\'s document list shows the client\'s answer',
  panel?.review?.decision === 'approve' && panel?.review?.comment === 'This is exactly right. Go ahead.',
  JSON.stringify(panel?.review || null));

section('Ask 3 — changing your mind, and what is refused');
const changed = await clientCall('POST', reviewPath, { decision: 'decline', comment: 'Second thoughts — please rework the pricing.' }, session);
check('the client can change their answer', changed.status === 200);
const afterChange = await clientCall('GET', reviewPath, null, session);
check('the newest answer is the one in force', afterChange.json?.data?.current?.decision === 'decline');
check('the earlier answer is kept as history rather than overwritten',
  (afterChange.json?.data?.history || []).length === 2
  && afterChange.json.data.history[0].decision === 'decline'
  && afterChange.json.data.history[1].decision === 'approve',
  JSON.stringify((afterChange.json?.data?.history || []).map((row) => row.decision)));

check('an invented answer is refused',
  (await clientCall('POST', reviewPath, { decision: 'approved' }, session)).status === 400);
check('an answer the client typed nothing into is refused',
  (await clientCall('POST', reviewPath, { decision: 'custom', comment: '   ' }, session)).status === 400);
const tooLong = await clientCall('POST', reviewPath, { decision: 'custom', comment: 'x'.repeat(2401) }, session);
check('an answer that is too long is refused, not quietly cut',
  tooLong.status === 400 && /2000/.test(String(tooLong.json?.error || '')), String(tooLong.json?.error || ''));
const ownWords = await clientCall('POST', reviewPath, { decision: 'custom', comment: 'Can we add the delivery date?' }, session);
check('the client\'s own words are accepted', ownWords.status === 200, ownWords.text.slice(0, 140));
const customRead = await clientCall('GET', reviewPath, null, session);
check('the client\'s own words are kept as their answer',
  customRead.json?.data?.current?.decision === 'custom'
  && customRead.json?.data?.current?.comment === 'Can we add the delivery date?');

section('Ask 3 — an answer never changes access, and never reaches another client');
check('an unpublished document cannot be reached through the review',
  (await clientCall('GET', `/api/client/project/${project.id}/documents/${draftId}/review`, null, session)).status === 404);
check('a document that does not exist answers 404, not a stack trace',
  (await clientCall('GET', `/api/client/project/${project.id}/documents/doc_000000000000000000000000/review`, null, session)).status === 404);

const otherClient = (await call('POST', '/api/phantom/clients', { name: `Phase 20 other ${stamp}` }, token)).json?.data;
const otherProject = (await call('POST', `/api/phantom/clients/${otherClient.id}/projects`, { name: 'Phase 20 other project' }, token)).json?.data;
const otherKey = (await call('POST', `/api/phantom/clients/${otherClient.id}/keys`, { label: `Phase 20 other key ${stamp}` }, token)).json?.data;
const otherSession = (await call('POST', '/api/client/auth/login', { passkey: otherKey?.passkey })).json?.data?.session?.token;
check('another client cannot read someone else\'s review',
  (await clientCall('GET', `/api/client/project/${project.id}/documents/${documentId}/review`, null, otherSession)).status === 404);
check('another client cannot answer someone else\'s review',
  (await clientCall('POST', `/api/client/project/${project.id}/documents/${documentId}/review`, { decision: 'approve' }, otherSession)).status === 404);

const afterReviews = rows((await call('GET', `/api/phantom/clients/${client.id}/documents`, null, token)).json?.data)
  .find((row) => row.id === documentId);
check('answering changes nothing about whether the client may see the document',
  afterReviews?.clientVisible === true && afterReviews?.allowView === true);
check('answering does not republish or archive the document', String(afterReviews?.lifecycle) === 'published');
check('answering does not move the document\'s version', String(afterReviews?.version) === String(panel?.version));

section('Ask 3 — the feedback survives the Recycle Bin');
const removed = await call('DELETE', `/api/phantom/client-documents/${documentId}`, null, token);
check('the document can still be deleted to the Recycle Bin', removed.status === 200, removed.text.slice(0, 120));
const binEntry = rows((await call('GET', '/api/phantom/recycle-bin', null, token)).json?.data)
  .find((row) => row.resource_type === 'client_document' && String(row.title || '').includes(`Phase 20 letter ${stamp}`));
check('it is in the Recycle Bin', Boolean(binEntry));
if (binEntry) {
  const restored = await call('POST', `/api/phantom/recycle-bin/${binEntry.id}/restore`, {}, token);
  check('it restores from the Recycle Bin', restored.status === 200, restored.text.slice(0, 120));
  const restoredRow = rows((await call('GET', `/api/phantom/clients/${client.id}/documents`, null, token)).json?.data)
    .find((row) => row.id === documentId);
  check('the client\'s answer came back with the document',
    restoredRow?.review?.decision === 'custom' && restoredRow?.review?.comment === 'Can we add the delivery date?',
    JSON.stringify(restoredRow?.review || null));
  check('a restored document still waits to be published again',
    String(restoredRow?.lifecycle || '') !== 'published');
}

// ---------------------------------------------------------------------------
console.log(`\n${passed}/${passed + failures.length} green`);
if (failures.length) {
  console.log('Failed checks:');
  for (const label of failures) console.log(`  - ${label}`);
  process.exit(1);
}
console.log('All three Phase 20 asks hold against this API.');
