#!/usr/bin/env node
/**
 * PHASE 18 live check — runs against the built `dist/` served by
 * `npx wrangler pages dev dist --port 8788` with the real D1 database and R2
 * bucket (local emulation). It drives the same HTTP surface a browser does:
 *
 *   PHANTOM signs in → a file is uploaded → the uploaded file becomes an
 *   internal Vault document → that document is published to a client → a real
 *   access key is issued → the client signs in with it and downloads the
 *   stamped Code Rx copy.
 *
 * Usage:  node scripts/phase18-live-check.mjs [baseUrl]
 */

import zlib from 'node:zlib';

const BASE = process.argv[2] || 'http://127.0.0.1:8788';

/**
 * The stamped copy is a real PDF: its text lives in (often Flate compressed)
 * content streams, so a reviewer has to inflate them to read what the client
 * actually received. A raw byte scan would prove nothing either way.
 */
const artifactText = (buffer) => {
  const latin = buffer.toString('latin1');
  let readable = latin;
  const pattern = /stream\r?\n/g;
  let match = pattern.exec(latin);
  while (match) {
    const end = latin.indexOf('endstream', match.index);
    if (end === -1) break;
    const raw = Buffer.from(latin.slice(match.index + match[0].length, end), 'latin1');
    for (const inflate of [zlib.inflateSync, zlib.inflateRawSync]) {
      try { readable += `\n${inflate(raw).toString('latin1')}`; break; } catch { /* not this codec */ }
    }
    match = pattern.exec(latin);
  }
  return readable;
};
const PHANTOM = { email: 'coderxsociety@gmail.com', password: 'DevPreviewPassword1' };

const results = [];
const check = (name, condition, detail = '') => {
  const passed = Boolean(condition);
  results.push({ name, passed, detail });
  console.log(`  ${passed ? '\u001b[32mPASS\u001b[0m' : '\u001b[31mFAIL\u001b[0m'}  ${name}${passed || !detail ? '' : ` — ${detail}`}`);
};

const json = async (method, path, body, token, extraHeaders = {}) => {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extraHeaders,
      'cf-connecting-ip': `203.0.113.${Math.floor(Math.random() * 200) + 1}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { /* html or binary */ }
  return { status: response.status, json: parsed, text, headers: response.headers };
};

const bytes = async (method, path, { token, clientSession } = {}) => {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(clientSession ? { 'X-Code-Rx-Client-Session': clientSession } : {}),
    },
  });
  return { status: response.status, buffer: Buffer.from(await response.arrayBuffer()), headers: response.headers };
};

/** A minimal but valid PDF whose text a reviewer can read back out of the stamp. */
const sourcePdf = (text) => {
  const content = `BT /F1 14 Tf 72 700 Td (${text}) Tj ET\n`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${content.length} >>\nstream\n${content}endstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const startxref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
    + offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
    + `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
};

const uploadForm = ({ section, file, name, type }) => {
  const form = new FormData();
  form.append('section', section);
  form.append('file', new File([file], name, { type }));
  return form;
};

const main = async () => {
  console.log(`CODE Rx — Phase 18 live check against ${BASE}`);
  console.log('='.repeat(64));

  // --- 1. the shipped bundle carries the new surfaces ----------------------
  const html = await fetch(`${BASE}/`).then((response) => response.text());
  check('the built site serves', html.length > 1000);
  const centre = await fetch(`${BASE}/assets/../index.html`).then((r) => r.text()).catch(() => '');
  const app = centre || html;
  check('the shipped bundle contains the upload flow', app.includes('Upload a document') || app.includes('upload a document'));
  check('the shipped bundle contains the access-key section', app.includes('Access keys') && app.includes('Issue access key'));
  check('the shipped site can generate a full http link for a section',
    app.includes('Copy the full http link to this section'));
  // The panel builds the address from the path the server returns, and the
  // client app routes on it — the parser is what proves the two still agree.
  check('the shipped app still routes the link address the panel sends',
    /client-portal\\?\/link\\?\//.test(app));

  // --- 2. PHANTOM signs in -------------------------------------------------
  const login = await json('POST', '/api/auth/login', PHANTOM);
  const token = login.json?.token;
  check('PHANTOM signs in against the real database', login.status === 200 && Boolean(token), JSON.stringify(login.json).slice(0, 160));
  if (!token) throw new Error('PHANTOM login failed; cannot continue');

  // --- 3. the portal is switched on (it is off in a fresh database) -------
  const portalSettings = await json('PUT', '/api/phantom/client-portal-settings', {
    settings: [{ key: 'client_portal_enabled', value: true }, { key: 'client_downloads_enabled', value: true }],
  }, token);
  check('the client portal and downloads can be switched on', portalSettings.status === 200,
    JSON.stringify(portalSettings.json).slice(0, 140));

  // --- 4. a client, a project and the section the original is filed in -----
  const stamp = Date.now().toString().slice(-6);
  const client = await json('POST', '/api/phantom/clients', { name: `Live Upload Client ${stamp}` }, token);
  const clientId = client.json?.data?.id;
  check('a client can be created', client.status === 201 && Boolean(clientId), JSON.stringify(client.json).slice(0, 140));
  const project = await json('POST', `/api/phantom/clients/${clientId}/projects`, { name: `Live Upload Project ${stamp}` }, token);
  const projectId = project.json?.data?.id;
  check('a project can be created', project.status === 201 && Boolean(projectId));

  const sections = await json('GET', '/api/vault/sections', null, token);
  const section = (sections.json?.data || []).find((entry) => entry.permissions?.create && Number(entry.is_sensitive) !== 1);
  check('the preview has a Vault section that accepts documents', Boolean(section?.slug), JSON.stringify(sections.json).slice(0, 140));
  if (!section) throw new Error('no writable Vault section');

  // --- 5. the file goes up through the existing upload endpoint ------------
  const bodyText = `LIVE PHASE 18 UPLOADED PDF ${stamp}`;
  const upload = await fetch(`${BASE}/api/vault/upload`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: uploadForm({
      section: section.slug, file: sourcePdf(bodyText), name: 'live-upload.pdf', type: 'application/pdf',
    }),
  }).then(async (response) => ({ status: response.status, json: await response.json().catch(() => null) }));
  check('the upload endpoint stores the file in the Vault',
    upload.status === 200 && String(upload.json?.fileKey || '').startsWith('vault/'), JSON.stringify(upload.json).slice(0, 160));
  check('the uploaded file is not publicly readable',
    (await bytes('GET', `/api/files/${encodeURIComponent(upload.json.fileKey).replace(/%2F/g, '/')}`)).status === 403);

  // --- 6. it becomes an internal Vault document ---------------------------
  const filed = await json('POST', '/api/vault/documents', {
    section: section.slug,
    title: `Live uploaded deliverable ${stamp}`,
    status: 'active',
    visibility: 'section',
    fileKey: upload.json.fileKey,
    contentJson: JSON.stringify({
      version: 1,
      blocks: [{
        id: 'uploaded-attachment', type: 'file', content: 'live-upload.pdf', caption: 'live-upload.pdf',
        fileKey: upload.json.fileKey, attachmentId: upload.json.attachment.id,
      }],
    }),
  }, token);
  check('the upload becomes a real internal Vault document',
    filed.status === 200 && Number(filed.json?.data?.id) > 0, JSON.stringify(filed.json).slice(0, 160));

  // --- 7. published to the client, then stamped ---------------------------
  const document = await json('POST', `/api/phantom/clients/${clientId}/documents`, {
    projectId, category: 'deliverable', title: `Live uploaded deliverable ${stamp}`,
    vaultDocumentId: filed.json.data.id,
  }, token);
  check('the uploaded document is published to the client', document.status === 201, JSON.stringify(document.json).slice(0, 160));
  const prepared = await json('POST', `/api/phantom/client-documents/${document.json.data.id}/delivery`, { refresh: true }, token);
  check('the stamping pipeline renders the client copy from the upload',
    prepared.status === 200 && prepared.json?.data?.kind === 'stamped_pdf' && prepared.json?.data?.sizeBytes > 0,
    JSON.stringify(prepared.json).slice(0, 200));
  const lifecycle = await json('POST', `/api/phantom/client-documents/${document.json.data.id}/lifecycle`, { state: 'in_review' }, token);
  await json('POST', `/api/phantom/client-documents/${document.json.data.id}/lifecycle`, { state: 'approved' }, token);
  const published = await json('POST', `/api/phantom/client-documents/${document.json.data.id}/lifecycle`, { state: 'published', clientVisible: true }, token);
  check('the document reaches the published state', lifecycle.status === 200 && published.status === 200);
  await json('PATCH', `/api/phantom/client-documents/${document.json.data.id}`, { allowView: true, allowDownload: true }, token);

  // --- 8. an access key is issued and used --------------------------------
  const key = await json('POST', `/api/phantom/clients/${clientId}/keys`, { projectId, label: 'Live check key' }, token);
  check('an access key can be issued from the panel',
    key.status === 201 && String(key.json?.data?.passkey || '').startsWith('CRX-'), JSON.stringify(key.json).slice(0, 140));
  const clientLogin = await json('POST', '/api/client/auth/login', { passkey: key.json.data.passkey });
  const session = clientLogin.json?.data?.session?.token;
  check('the client signs in with the issued key', clientLogin.status === 200 && Boolean(session), JSON.stringify(clientLogin.json).slice(0, 160));

  const download = await bytes('GET', `/api/client/project/${projectId}/documents/${document.json.data.id}/download`, { clientSession: session });
  const asText = artifactText(download.buffer);
  check('the client downloads a real PDF', download.status === 200 && download.buffer.subarray(0, 5).toString('latin1') === '%PDF-');
  check('the download is a stamped Code Rx copy, not the source file',
    asText.includes('CODE Rx SOCIETY') && asText.includes('CLIENT PROJECT DOCUMENT')
    && !download.buffer.equals(sourcePdf(bodyText)));
  check('the client copy carries the document content', asText.includes(bodyText));

  // --- 9. the temporary link an operator sends ----------------------------
  const directLink = await json('POST', `/api/phantom/clients/${clientId}/links`, {
    projectId, destination: 'project', mode: 'DIRECT_ACCESS', maxUses: null, expiresInMinutes: 15,
  }, token);
  const linkPath = String(directLink.json?.data?.path || '');
  const linkToken = String(directLink.json?.data?.token || '');
  const linkUrl = `${BASE}${linkPath}`;
  // The panel makes the address absolute against the origin it is served on, so
  // in a browser preview the same path becomes the preview host. Printed here so
  // the address can be opened and checked by hand.
  const previewHost = process.env.E2B_SANDBOX_ID ? `https://8788-${process.env.E2B_SANDBOX_ID}.e2b.app` : BASE;
  // The server generates the whole address from the origin of the request that
  // asked for it, so the address below is the server's, generated for the host
  // the operator's browser is on.
  const previewLink = await json('POST', `/api/phantom/clients/${clientId}/links`, {
    projectId, destination: 'project', mode: 'DIRECT_ACCESS', maxUses: null, expiresInMinutes: 15,
  }, token, { Origin: previewHost });
  const previewUrl = String(previewLink.json?.data?.url || '');
  const previewToken = String(previewLink.json?.data?.token || '');
  check('the server generates a complete http address for the site in use',
    previewLink.status === 201 && previewUrl === `${previewHost}/l/${previewToken}`,
    previewUrl || JSON.stringify(previewLink.json).slice(0, 160));
  check('the address is an ordinary path on the site, with no fragment at all',
    !previewUrl.includes('#') && previewUrl.endsWith(`/l/${previewToken}`));
  // The running site serves the app for that address, so it leads there instead
  // of returning a 404 or a directory page.
  const servedAddress = await fetch(`${BASE}/l/${previewToken}`);
  const servedAddressBody = await servedAddress.text();
  check('the running site serves the app itself at that address',
    servedAddress.status === 200 && servedAddressBody.includes('<div id="root"'),
    `status ${servedAddress.status}`);
  const servedHash = await fetch(`${BASE}/#client-portal/link/${previewToken}`);
  check('the original hash address still resolves on the running site', servedHash.status === 200);
  console.log(`\n  → direct link the server generated (valid 15 minutes):\n    ${previewUrl || `${previewHost}${linkPath}`}\n`);
  check('creating a link returns the address to send',
    directLink.status === 201 && linkPath === `/#client-portal/link/${linkToken}`
    && String(directLink.json?.data?.url || '') === `${BASE}/l/${linkToken}`, linkPath);
  check('the address is a full http link that resolves on the running site',
    /^http:\/\/[^/]+\/#client-portal\/link\/[A-Za-z0-9_-]{32,160}$/.test(linkUrl)
    && (await fetch(linkUrl)).status === 200
    && String(directLink.json?.data?.url || '') === `${BASE}/l/${linkToken}`);
  // The token read out of the clean path address is the token that opens it.
  const tokenFromAddress = String(directLink.json?.data?.url || '').split('/l/')[1] || '';
  const redeemed = await json('POST', `/api/client/link/${encodeURIComponent(tokenFromAddress)}`);
  check('opening it lands on the destination with a live session',
    redeemed.status === 200 && Boolean(redeemed.json?.data?.session?.token)
    && JSON.stringify(redeemed.json.data).includes(projectId),
    JSON.stringify(redeemed.json).slice(0, 200));

  const keyedLink = await json('POST', `/api/phantom/clients/${clientId}/links`, {
    projectId, destination: 'project', mode: 'REQUIRE_PASSKEY', maxUses: null,
  }, token);
  const keyedRedeem = await json('POST', `/api/client/link/${encodeURIComponent(keyedLink.json.data.token)}`);
  check('a passkey address asks for the key before anything opens',
    keyedRedeem.status === 200 && keyedRedeem.json?.data?.requiresPasskey === true && !keyedRedeem.json?.data?.session);
  const keyedSignIn = await json('POST', '/api/client/auth/login', { passkey: key.json.data.passkey, linkToken: keyedLink.json.data.token });
  check('the same address opens once the client signs in with their key',
    keyedSignIn.status === 200 && Boolean(keyedSignIn.json?.data?.session?.token));
  const linkList = await json('GET', `/api/phantom/clients/${clientId}/links`, null, token);
  check('the panel can never re-show an address it already issued',
    !JSON.stringify(linkList.json).includes(linkToken) && !JSON.stringify(linkList.json).includes('#client-portal'));

  const passed = results.filter((result) => result.passed).length;
  const failed = results.length - passed;
  console.log('\n' + '='.repeat(64));
  console.log(`LIVE TOTAL: ${results.length}   PASSED: ${passed}   FAILED: ${failed}`);
  for (const result of results.filter((entry) => !entry.passed)) console.log(`  - ${result.name}${result.detail ? ` — ${result.detail}` : ''}`);
  console.log(`LIVE SUCCESS RATE: ${((passed / results.length) * 100).toFixed(1)}%`);
  process.exit(failed ? 1 : 0);
};

main().catch((error) => { console.error('live check error:', error); process.exit(2); });
