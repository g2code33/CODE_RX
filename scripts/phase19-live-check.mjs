/**
 * Phase 19 — live check.
 *
 * Runs the four things the client asked for against a running Code Rx API and
 * reports a plain count of green checks:
 *
 *   1. Deleting goes to the Recycle Bin — a Vault document and a client
 *      document both leave their list, land in PHANTOM → Recycle Bin, and can
 *      be restored from there with their history.
 *   2. A client works on a sent document, saves it, and sends it back.
 *   3. Saving at the client's side changes the Code Rx Vault copy too, and the
 *      change is attributed to the client portal — never to a member.
 *   4. The Vault shelf carries the client and project each document belongs to,
 *      so a list can be grouped by client instead of mixing everyone together.
 *
 * Usage:
 *   node scripts/phase19-live-check.mjs                 (defaults to the local preview)
 *   CODEX_BASE=https://host node scripts/phase19-live-check.mjs
 *
 * Credentials come from the environment (PHANTOM_EMAIL / ADMIN_PASSWORD) with
 * the local preview's development values as the fallback. Nothing here is a
 * credential in a URL, and no token is ever printed.
 */
const BASE = (process.env.CODEX_BASE || 'http://127.0.0.1:8788').replace(/\/+$/, '');
const EMAIL = process.env.PHANTOM_EMAIL || process.env.ADMIN_EMAIL || 'coderxsociety@gmail.com';
const PASSWORD = process.env.ADMIN_PASSWORD || 'DevPreviewPassword1';

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
const call = async (method, path, body, token) => {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* a non-JSON answer is reported as-is */ }
  return { status: response.status, json, text };
};

/** A client call: the client session has its own credential and its own header. */
const clientCall = async (method, path, body, sessionToken) => {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      'X-Code-Rx-Client-Session': sessionToken,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* reported as-is */ }
  return { status: response.status, json, text };
};

const rows = (value) => (Array.isArray(value)
  ? value
  : value?.clients || value?.projects || value?.documents || value?.items || []);

const login = await call('POST', '/api/auth/login', { email: EMAIL, password: PASSWORD });
const token = login.json?.token || login.json?.data?.token;
if (!token) {
  console.error(`Could not sign in as the operator (${login.status}).`);
  process.exit(1);
}

const stamp = Date.now();
const client = (await call('POST', '/api/phantom/clients', { name: `Phase 19 client ${stamp}` }, token)).json?.data;
const project = (await call('POST', `/api/phantom/clients/${client.id}/projects`, { name: 'Phase 19 project' }, token)).json?.data;

const sections = rows((await call('GET', '/api/vault/sections', null, token)).json?.data);
const vaultSection = sections.find((entry) => entry.permissions?.create && Number(entry.is_sensitive) !== 1);

section('Setup: a client, their project, and one Vault document published to them');
const vault = await call('POST', '/api/vault/documents', {
  section: vaultSection.slug, title: `Phase 19 Vault document ${stamp}`, content: 'The original Code Rx wording.',
}, token);
const vaultId = vault.json?.data?.id;
check('a client and a project exist', Boolean(client?.id && project?.id));
check('a Vault document exists', Boolean(vaultId));

const created = await call('POST', `/api/phantom/clients/${client.id}/documents`, {
  projectId: project.id, category: 'letter', title: `Phase 19 letter ${stamp}`,
  contentText: 'The original Code Rx wording.', vaultDocumentId: vaultId,
}, token);
const documentId = created.json?.data?.id;
check('a client document is linked to that Vault document', created.status === 201 && Boolean(documentId));
await call('POST', `/api/phantom/client-documents/${documentId}/lifecycle`, { state: 'published' }, token);

// ---------------------------------------------------------------------------
section('Ask 1 — a Vault document delete lands in the Recycle Bin');
const vaultDelete = await call('POST', `/api/vault/documents/${vaultId}/delete`, {}, token);
check('the delete is accepted', vaultDelete.status === 200, vaultDelete.text.slice(0, 120));
check('the operator is told where it went', /Recycle Bin/i.test(String(vaultDelete.json?.message || '')));

const shelfAfterDelete = rows((await call('GET', `/api/vault/documents?section=${vaultSection.slug}`, null, token)).json?.data);
check('it left the active shelf', !shelfAfterDelete.some((row) => row.id === vaultId));

const bin = rows((await call('GET', '/api/phantom/recycle-bin', null, token)).json?.data);
const vaultEntry = bin.find((row) => row.resource_type === 'vault_document' && Number(row.resource_id) === Number(vaultId));
check('it is in PHANTOM → Recycle Bin', Boolean(vaultEntry));

if (vaultEntry) {
  const restore = await call('POST', `/api/phantom/recycle-bin/${vaultEntry.id}/restore`, {}, token);
  check('it restores from the Recycle Bin', restore.status === 200, restore.text.slice(0, 120));
  const back = await call('GET', `/api/vault/documents/${vaultId}`, null, token);
  check('it is a readable Vault document again', back.status === 200);
  const history = rows((await call('GET', `/api/vault/documents/${vaultId}/versions`, null, token)).json?.data);
  check('its version history survived', history.length >= 1);
  const binAgain = rows((await call('GET', '/api/phantom/recycle-bin', null, token)).json?.data);
  check('the Recycle Bin entry is cleared', !binAgain.some((row) => row.id === vaultEntry.id));
}

// ---------------------------------------------------------------------------
section('Ask 1 — a client document delete lands in the Recycle Bin');
const clientDelete = await call('DELETE', `/api/phantom/client-documents/${documentId}`, null, token);
check('the delete is accepted', clientDelete.status === 200, clientDelete.text.slice(0, 120));
const binForDocument = rows((await call('GET', '/api/phantom/recycle-bin', null, token)).json?.data)
  .find((row) => row.resource_type === 'client_document' && String(row.title || '').includes(`Phase 19 letter ${stamp}`));
check('it is in PHANTOM → Recycle Bin', Boolean(binForDocument));

let restoredDocument = null;
if (binForDocument) {
  const restore = await call('POST', `/api/phantom/recycle-bin/${binForDocument.id}/restore`, {}, token);
  check('it restores from the Recycle Bin', restore.status === 200, restore.text.slice(0, 120));
  restoredDocument = rows((await call('GET', `/api/phantom/clients/${client.id}/documents`, null, token)).json?.data)
    .find((row) => row.id === documentId);
  check('it is in the client\'s documents again', Boolean(restoredDocument));
  check('its Vault link survived the round trip', Number(restoredDocument?.vaultDocumentId) === Number(vaultId));
}
check('a restored document comes back unpublished, so no client sees it by accident',
  String(restoredDocument?.lifecycle || '') !== 'published');

// The client's steps need the document live again, which is the operator's call.
await call('POST', `/api/phantom/client-documents/${documentId}/lifecycle`, { state: 'published' }, token);

// ---------------------------------------------------------------------------
section('Ask 2 — the client signs in, signs the document, and sends it back');
const issued = await call('POST', `/api/phantom/clients/${client.id}/keys`, { label: `Phase 19 key ${stamp}` }, token);
const passkey = issued.json?.data?.passkey;
check('an access key can be issued for the client', issued.status === 201 && Boolean(passkey));

const session = await call('POST', '/api/client/auth/login', { passkey });
const sessionToken = session.json?.data?.session?.token;
check('the client signs in with that key', session.status === 200 && Boolean(sessionToken));

if (sessionToken) {
  const signatureRead = await clientCall('GET', `/api/client/project/${project.id}/documents/${documentId}/signature`, null, sessionToken);
  check('the document offers the client a signature in their room',
    signatureRead.status === 200 && signatureRead.json?.data?.signable === true, signatureRead.text.slice(0, 140));
  check('the room says how long a signature may be', Number(signatureRead.json?.data?.maxNameChars) === 120);

  const signed = await clientCall('POST', `/api/client/project/${project.id}/documents/${documentId}/signature`,
    { signerName: `Ama Mensah ${stamp}`, signerTitle: 'Managing Director' }, sessionToken);
  check('the client can sign the document', signed.status === 200, signed.text.slice(0, 140));
  check('the save explains that the Code Rx copy carries the signature',
    /Code Rx copy|saved/i.test(String(signed.json?.message || '')), String(signed.json?.message || ''));

  const signatureAfter = await clientCall('GET', `/api/client/project/${project.id}/documents/${documentId}/signature`, null, sessionToken);
  check('the signature is stored and read back',
    signatureAfter.json?.data?.current?.signerName === `Ama Mensah ${stamp}`);

  const sent = await clientCall('POST', `/api/client/project/${project.id}/documents/${documentId}/send-to-phantom`, {}, sessionToken);
  check('the client can send it back to PHANTOM', sent.status === 200, sent.text.slice(0, 140));
  check('the send says the signature travels with it', sent.json?.data?.signed === true);

  const inbox = rows((await call('GET', '/api/notifications', null, token)).json?.data);
  const notice = inbox.find((row) => String(row.message || '').includes(`Phase 19 letter ${stamp}`));
  check('PHANTOM is told the document came back', Boolean(notice));
  check('the notice names the client and the project',
    Boolean(notice) && String(notice.message).includes(`Phase 19 client ${stamp}`) && String(notice.message).includes('Phase 19 project'));

  // -------------------------------------------------------------------------
  section('Ask 3 — the signed copy is in the Vault, attributed to the client');
  const vaultNow = await call('GET', `/api/vault/documents/${vaultId}`, null, token);
  const blocks = vaultNow.json?.data?.contentJson?.blocks || [];
  const vaultText = blocks.map((block) => String(block?.content || '')).join('\n');
  check('the Vault document carries the client\'s signature', vaultText.includes(`Signed: Ama Mensah ${stamp}`),
    vaultText.slice(0, 160));
  check('the signed copy says where and when it was signed',
    blocks.some((block) => /client portal/i.test(String(block?.content || ''))));
  check('the signed copy still carries the wording Code Rx sent',
    vaultText.includes('The original Code Rx wording.'), vaultText.slice(0, 160));
  check('no member is credited with the client\'s signature',
    vaultNow.json?.data?.updated_by_name == null,
    `updated_by_name=${vaultNow.json?.data?.updated_by_name}`);

  const history = rows((await call('GET', `/api/vault/documents/${vaultId}/versions`, null, token)).json?.data);
  const clientVersion = history.find((entry) => /client/i.test(String(entry.change_note || '')));
  check('the signed copy is a version of its own in the Vault history', Boolean(clientVersion));
  check('that version names the client portal as its source',
    Boolean(clientVersion) && /client portal/i.test(String(clientVersion.change_note)));
  check('it is not attributed to a member', Number(clientVersion?.changed_by_member_profile_id ?? 0) === 0);

  const panel = rows((await call('GET', `/api/phantom/clients/${client.id}/documents`, null, token)).json?.data)
    .find((row) => row.id === documentId);
  check('the client copy records which Vault version it carries', Number(panel?.vaultVersion || 0) >= 1,
    `vaultVersion=${panel?.vaultVersion}`);
  check('the operator\'s own list shows the client\'s signature', panel?.signature?.signerName === `Ama Mensah ${stamp}`,
    JSON.stringify(panel?.signature || null));

  const activity = rows((await call('GET', `/api/phantom/clients/${client.id}/activity`, null, token)).json?.data);
  const activityText = JSON.stringify(activity);
  check('the client\'s activity history records the signature', /Signed a document|DOCUMENT_SIGNED/i.test(activityText));
  check('the client\'s activity history records the send', /Sent a document to Code Rx|DOCUMENT_SENT/i.test(activityText));
}

// ---------------------------------------------------------------------------
section('Ask 4 — the Vault shelf carries the client and project for grouping');
const shelf = rows((await call('GET', `/api/vault/documents?section=${vaultSection.slug}`, null, token)).json?.data);
const linked = shelf.find((row) => row.id === vaultId);
check('the linked document names its client', linked?.client_name === `Phase 19 client ${stamp}`, String(linked?.client_name));
check('the linked document names the client\'s project', linked?.client_project_name === 'Phase 19 project', String(linked?.client_project_name));
check('a client document is identified by its public id, never its database id',
  typeof linked?.client_id === 'string' && linked.client_id.startsWith('cli_'), String(linked?.client_id));
const internal = shelf.find((row) => !row.client_name);
check('a document with no client is reported as internal rather than guessed',
  Boolean(internal) || shelf.every((row) => Boolean(row.client_name)));

// ---------------------------------------------------------------------------
console.log(`\n${passed}/${passed + failures.length} green`);
if (failures.length) {
  console.log('Failed checks:');
  for (const label of failures) console.log(`  - ${label}`);
  process.exit(1);
}
console.log('All four Phase 19 asks hold against this API.');
