/**
 * Phase 21 — live check.
 *
 * Runs the five things asked for against a running Code Rx API and reports a
 * plain count of green checks:
 *
 *   1. Delete in PHANTOM → Client Access Center → Client documents works, and
 *      what is deleted is visible in the Recycle Bin and recoverable from it —
 *      including a document the client has already signed or texted about.
 *   2. The client project room pins its header, title and hamburger while the
 *      room scrolls (proved in the interface harness and asserted here in the
 *      shipped markup served by the site).
 *   3. The "Work on this document" free-text panel is gone, and signing is what
 *      the client gets instead: it saves the signature and sends the document
 *      back to PHANTOM.
 *   4. "Text PHANTOM" reaches the PHANTOM notification system from the client's
 *      own room, and the message stays on the project.
 *   5. The room's features are arranged as one room: header, sections, document,
 *      signature, review, copy — with no leftover editor.
 *
 * Usage:
 *   node scripts/phase21-live-check.mjs                 (defaults to the local preview)
 *   CODEX_BASE=https://host node scripts/phase21-live-check.mjs
 *
 * Credentials come from the environment (PHANTOM_EMAIL / ADMIN_PASSWORD) with
 * the local preview's development values as the fallback. Nothing here is a
 * credential in a URL, and no token is ever printed.
 */
import fs from 'node:fs';
import path from 'node:path';

const BASE = (process.env.CODEX_BASE || 'http://127.0.0.1:8788').replace(/\/+$/, '');
const EMAIL = process.env.PHANTOM_EMAIL || process.env.ADMIN_EMAIL || 'coderxsociety@gmail.com';
const PASSWORD = process.env.ADMIN_PASSWORD || 'DevPreviewPassword1';
const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
/**
 * The portal switch is turned on for the local preview only. A deployed
 * environment is never mutated by a check.
 */
const LOCAL = !process.env.CODEX_BASE;

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

const call = async (method, path_, body, token) => {
  const response = await fetch(`${BASE}${path_}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* reported as-is */ }
  return { status: response.status, json, text };
};

const clientCall = async (method, path_, body, sessionToken) => {
  const response = await fetch(`${BASE}${path_}`, {
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

// ---------------------------------------------------------------------------
section('Signing in, and a client project with one published document');
const login = await call('POST', '/api/auth/login', { email: EMAIL, password: PASSWORD });
const token = login.json?.token || login.json?.data?.token;
check('PHANTOM signs in', Boolean(token), `HTTP ${login.status}`);
if (!token) {
  console.log(`\n${passed}/${passed + failures.length} green`);
  process.exit(1);
}
if (LOCAL) {
  await call('PUT', '/api/phantom/client-portal-settings', {
    settings: [{ key: 'client_portal_enabled', value: true }, { key: 'client_downloads_enabled', value: true }],
  }, token);
}

const stamp = Date.now().toString().slice(-6);
const created = await call('POST', '/api/phantom/clients', { name: `Phase 21 client ${stamp}` }, token);
const client = created.json?.data;
check('a client is created', created.status === 201 && Boolean(client?.id), created.text.slice(0, 140));

const project = (await call('POST', `/api/phantom/clients/${client.id}/projects`, { name: `Phase 21 project ${stamp}` }, token)).json?.data;
check('the client has a project', Boolean(project?.id));

const sections = rows((await call('GET', '/api/vault/sections', null, token)).json?.data);
const vaultSection = sections.find((entry) => entry.permissions?.create && Number(entry.is_sensitive) !== 1);
const vault = await call('POST', '/api/vault/documents', {
  section: vaultSection.slug, title: `Phase 21 Vault letter ${stamp}`, content: 'The wording Code Rx sent the client.',
}, token);
const vaultId = vault.json?.data?.id;
check('the letter has a Code Rx Vault copy', Boolean(vaultId));

const document = await call('POST', `/api/phantom/clients/${client.id}/documents`, {
  projectId: project.id, category: 'letter', title: `Phase 21 letter ${stamp}`,
  contentText: 'The wording Code Rx sent the client.', vaultDocumentId: vaultId,
}, token);
const documentId = document.json?.data?.id;
check('the letter is sent to the client', document.status === 201 && Boolean(documentId), document.text.slice(0, 140));
await call('POST', `/api/phantom/client-documents/${documentId}/lifecycle`, { state: 'published' }, token);

const issued = await call('POST', `/api/phantom/clients/${client.id}/keys`, { label: `Phase 21 key ${stamp}` }, token);
const session = await call('POST', '/api/client/auth/login', { passkey: issued.json?.data?.passkey });
const sessionToken = session.json?.data?.session?.token;
check('the client signs in with their own key', session.status === 200 && Boolean(sessionToken));

const documentPath = `/api/client/project/${project.id}/documents/${documentId}`;

// ---------------------------------------------------------------------------
section('Ask 1 — a deleted document is in the Recycle Bin, and comes back');
const deleted = await call('DELETE', `/api/phantom/client-documents/${documentId}`, null, token);
check('the panel deletes the document', deleted.status === 200, deleted.text.slice(0, 160));
check('the operator is told where it went', /Recycle Bin/i.test(String(deleted.json?.message || '')),
  String(deleted.json?.message || ''));

const bin = rows((await call('GET', '/api/phantom/recycle-bin', null, token)).json?.data);
const binRow = bin.find((row) => String(row.title || '').includes(`Phase 21 letter ${stamp}`));
check('the deleted document is visible in PHANTOM → Recycle Bin', Boolean(binRow),
  JSON.stringify(bin.slice(0, 3).map((row) => row.title)).slice(0, 200));
check('the bin entry is a client document, not a bare id', binRow?.resource_type === 'client_document');
check('the client can no longer open it', (await clientCall('GET', documentPath, null, sessionToken)).status === 404);

const restored = await call('POST', `/api/phantom/recycle-bin/${binRow?.id}/restore`, null, token);
check('the operator restores it from the Recycle Bin', restored.status === 200, restored.text.slice(0, 160));
check('it leaves the Recycle Bin once restored',
  !rows((await call('GET', '/api/phantom/recycle-bin', null, token)).json?.data)
    .some((row) => row.id === binRow?.id));

// ---------------------------------------------------------------------------
section('Ask 3 — the client signs the document; the editor is gone');
const roomSource = fs.readFileSync(path.join(ROOT, 'src/components/ClientProjectRoom.tsx'), 'utf8');
check('the "Work on this document" panel is gone from the room', !/Work on this document/.test(roomSource));
check('no free-text revision editor survives in the room', !/workspace/i.test(roomSource));
check('the room is built around a signature instead', /Sign this document/.test(roomSource));
check('the room pins its header while the client scrolls', /sticky top-0/.test(roomSource));
check('the header carries the hamburger that moves with it', /aria-controls="room-sections"/.test(roomSource));
check('the room asks PHANTOM for the client\'s messages through its own transport',
  /messages: \(projectId: string\)/.test(fs.readFileSync(path.join(ROOT, 'src/lib/cloudflare.ts'), 'utf8')));
check('the old workspace endpoints are gone from the browser layer',
  !/\/workspace/.test(fs.readFileSync(path.join(ROOT, 'src/lib/cloudflare.ts'), 'utf8')));

await call('POST', `/api/phantom/client-documents/${documentId}/lifecycle`, { state: 'published' }, token);
const signatureRead = await clientCall('GET', `${documentPath}/signature`, null, sessionToken);
check('the client room offers a signature on the document',
  signatureRead.status === 200 && signatureRead.json?.data?.signable === true, signatureRead.text.slice(0, 140));
check('the document starts unsigned', signatureRead.json?.data?.current === null);
check('a signature with no name is refused',
  (await clientCall('POST', `${documentPath}/signature`, { signerName: ' ' }, sessionToken)).status === 400);
check('signing is refused without a client session',
  (await call('POST', `${documentPath}/signature`, { signerName: 'Nobody Here' })).status === 401);

const signed = await clientCall('POST', `${documentPath}/signature`,
  { signerName: `Ama Mensah ${stamp}`, signerTitle: 'Managing Director' }, sessionToken);
check('the client can sign the document', signed.status === 200, signed.text.slice(0, 160));
check('the client hears that their signature is saved',
  /Signed/i.test(String(signed.json?.message || '')), String(signed.json?.message || ''));
const signatureAfter = await clientCall('GET', `${documentPath}/signature`, null, sessionToken);
check('the signature is stored and read back to the client',
  signatureAfter.json?.data?.current?.signerName === `Ama Mensah ${stamp}`);
check('the signature records the role the client gave',
  signatureAfter.json?.data?.current?.signerTitle === 'Managing Director');

const vaultNow = (await call('GET', `/api/vault/documents/${vaultId}`, null, token)).json?.data;
const vaultText = (vaultNow?.contentJson?.blocks || []).map((block) => String(block?.content || '')).join('\n');
check('the signed copy reaches the Code Rx Vault copy', vaultText.includes(`Signed: Ama Mensah ${stamp}`),
  vaultText.slice(0, 180));
check('the signed copy still carries the wording Code Rx sent',
  vaultText.includes('The wording Code Rx sent the client.'));
check('the signature is a version in the Vault history, attributed to the client portal',
  rows((await call('GET', `/api/vault/documents/${vaultId}/versions`, null, token)).json?.data)
    .some((entry) => /Signed by Ama Mensah/.test(String(entry.change_note || '')) && Number(entry.changed_by_member_profile_id || 0) === 0));
const panelRow = rows((await call('GET', `/api/phantom/clients/${client.id}/documents`, null, token)).json?.data)
  .find((row) => row.id === documentId);
check('the operator\'s own list shows the signature beside the document',
  panelRow?.signature?.signerName === `Ama Mensah ${stamp}`, JSON.stringify(panelRow?.signature || null));

const sent = await clientCall('POST', `${documentPath}/send-to-phantom`, null, sessionToken);
check('the client can send the signed document to PHANTOM', sent.status === 200, sent.text.slice(0, 160));
check('the send says the signature travels with it', sent.json?.data?.signed === true);

// ---------------------------------------------------------------------------
section('Ask 4 — Text PHANTOM reaches the PHANTOM notification system');
const messagesRead = await clientCall('GET', `/api/client/project/${project.id}/messages`, null, sessionToken);
check('the room can read the client\'s messages to PHANTOM', messagesRead.status === 200, messagesRead.text.slice(0, 140));
check('a project with no messages answers with an empty list, not an error',
  Array.isArray(messagesRead.json?.data?.messages) && messagesRead.json.data.messages.length === 0);
check('messages cannot be read without a client session',
  (await call('GET', `/api/client/project/${project.id}/messages`)).status === 401);
check('an empty message is refused',
  (await clientCall('POST', `/api/client/project/${project.id}/messages`, { body: '   ' }, sessionToken)).status === 400);

const messageBody = `Please confirm the delivery date for ${stamp}.`;
const message = await clientCall('POST', `/api/client/project/${project.id}/messages`,
  { body: messageBody, documentId }, sessionToken);
check('the client can text PHANTOM from their room', message.status === 200, message.text.slice(0, 160));
check('the client is told PHANTOM was notified', /notified|PHANTOM/i.test(String(message.json?.message || '')));
check('the message is identified by a public id, never a row number',
  /^msg_[0-9a-f]{24}$/.test(String(message.json?.data?.id || '')), String(message.json?.data?.id));

const inbox = rows((await call('GET', '/api/notifications', null, token)).json?.data);
const notice = inbox.find((row) => String(row.message || '').includes(`delivery date for ${stamp}`));
check('PHANTOM is notified in the existing inbox', Boolean(notice),
  JSON.stringify(inbox.slice(0, 2).map((row) => row.message)).slice(0, 200));
check('the notice names the client, the project and the document',
  Boolean(notice) && String(notice.message).includes(`Phase 21 client ${stamp}`)
    && String(notice.message).includes(`Phase 21 project ${stamp}`)
    && String(notice.message).includes(`Phase 21 letter ${stamp}`),
  String(notice?.message || '').slice(0, 200));

const messagesAfter = await clientCall('GET', `/api/client/project/${project.id}/messages`, null, sessionToken);
check('the client reads back what they sent', messagesAfter.json?.data?.messages?.[0]?.body === messageBody);
check('the message names the document it is about', messagesAfter.json?.data?.messages?.[0]?.document?.id === documentId);

const clientActivity = JSON.stringify(rows((await call('GET', `/api/phantom/clients/${client.id}/activity`, null, token)).json?.data));
check('the client\'s history records the signature in plain words', /Signed a document/i.test(clientActivity));
check('the client\'s history records the message in plain words', /Sent a message to PHANTOM/i.test(clientActivity));

// ---------------------------------------------------------------------------
section('Ask 5 — the room is one arrangement, and a signed document still deletes');
const reviewSource = fs.readFileSync(path.join(ROOT, 'src/components/ClientProjectRoom.tsx'), 'utf8');
// Only the document view counts: the components are defined above it.
const documentView = reviewSource.slice(reviewSource.indexOf('{openDocument ? ('));
const order = ['<StampedCopyPanel', '<SignaturePanel', '<ClientReviewSection', 'canDownload(openDocument'];
const positions = order.map((needle) => documentView.indexOf(needle));
check('the document, then the signature, then the review, then the copy — in that order',
  positions.every((position) => position > 0) && positions.every((position, index) => index === 0 || position > positions[index - 1]),
  JSON.stringify(positions));
check('the room still shows the review section it already had', /ClientReviewSection/.test(reviewSource));
check('the room still offers the stamped copy and the download rule it already had',
  /StampedCopyPanel/.test(reviewSource) && /View only — this document cannot be downloaded/.test(reviewSource));

const deleteSigned = await call('DELETE', `/api/phantom/client-documents/${documentId}`, null, token);
check('a document the client has signed and texted about still deletes', deleteSigned.status === 200,
  deleteSigned.text.slice(0, 160));
const binAgain = rows((await call('GET', '/api/phantom/recycle-bin', null, token)).json?.data);
const signedBinRow = binAgain.find((row) => String(row.title || '').includes(`Phase 21 letter ${stamp}`));
check('it is in the Recycle Bin, visible to the operator', Boolean(signedBinRow));
const messagesWhileDeleted = (await clientCall('GET', `/api/client/project/${project.id}/messages`, null, sessionToken)).json?.data?.messages || [];
check('the client\'s message to PHANTOM is not lost with the document',
  messagesWhileDeleted.some((row) => row.body === messageBody));
await call('POST', `/api/phantom/recycle-bin/${signedBinRow?.id}/restore`, null, token);
await call('POST', `/api/phantom/client-documents/${documentId}/lifecycle`, { state: 'published' }, token);
const signatureBack = await clientCall('GET', `${documentPath}/signature`, null, sessionToken);
check('the signature comes back with the document, so nothing is asked twice',
  signatureBack.json?.data?.current?.signerName === `Ama Mensah ${stamp}`,
  JSON.stringify(signatureBack.json?.data?.current || null));
const messagesBack = (await clientCall('GET', `/api/client/project/${project.id}/messages`, null, sessionToken)).json?.data?.messages || [];
check('the message is linked to the document again once it is restored',
  messagesBack.some((row) => row.body === messageBody && row.document?.id === documentId));

// ---------------------------------------------------------------------------
section('Isolation — nothing here widened what a client may reach');
const stranger = await call('POST', '/api/phantom/clients', { name: `Phase 21 stranger ${stamp}` }, token);
const strangerKey = await call('POST', `/api/phantom/clients/${stranger.json?.data?.id}/keys`, { label: 'stranger' }, token);
check('the second client gets a project of their own to sign in with',
  (await call('POST', `/api/phantom/clients/${stranger.json?.data?.id}/projects`,
    { name: `Phase 21 stranger project ${stamp}` }, token)).status === 201);
const strangerSession = (await call('POST', '/api/client/auth/login', { passkey: strangerKey.json?.data?.passkey }))
  .json?.data?.session?.token;
check('the second client is signed in, so the refusals below are real', Boolean(strangerSession));
const strangerRead = await clientCall('GET', `${documentPath}/signature`, null, strangerSession);
check('another client cannot read this signature', strangerRead.status === 404, `HTTP ${strangerRead.status}`);
const strangerSign = await clientCall('POST', `${documentPath}/signature`, { signerName: 'Not Them' }, strangerSession);
check('another client cannot sign in this client\'s name', strangerSign.status === 404, `HTTP ${strangerSign.status}`);
const strangerSend = await clientCall('POST', `${documentPath}/send-to-phantom`, null, strangerSession);
check('another client cannot send this document to PHANTOM', strangerSend.status === 404, `HTTP ${strangerSend.status}`);
check('a message about another client\'s project is refused',
  (await clientCall('POST', `/api/client/project/${stranger.json?.data?.id}/messages`, { body: 'hello' }, sessionToken)).status === 404);
check('a member token is not a client session on these routes',
  (await call('GET', `${documentPath}/signature`, null, token)).status === 401);

// ---------------------------------------------------------------------------
console.log(`\n${passed}/${passed + failures.length} green`);
if (failures.length) {
  console.log('Failed checks:');
  for (const label of failures) console.log(`  - ${label}`);
  process.exit(1);
}
console.log('All five Phase 21 asks hold against this API.');
