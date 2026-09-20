# Code Rx Society — Client Portal, Phase 21

**Scope:** the five things asked for after Phase 20 was deployed.
**Result: 2513 / 2513 checks green (100.0%)** — details in *Measurements* below.

| # | What was asked | What was done | Where |
|---|---|---|---|
| 1 | The delete button in PHANTOM → Client Access Center → Client documents is still not working; deleted things must land in the Recycle Bin | The delete endpoint was already correct, so the real break was found instead: **the Recycle Bin only rendered its three newest items** and said nothing about client documents. It now lists **every** deleted item, states the count, and names client documents and letters in its own words. A second, real bug was found and fixed on the way: deleting a document the client had **already texted PHANTOM about** failed with `FOREIGN KEY constraint failed` (500). Those messages now stay on the project, the bin remembers the link, and a restore re-links them. Signatures travel into the bin and come back with the document. | `functions/client-routes.ts` (DELETE `/api/phantom/client-documents/:id`), `functions/[[path]].ts` (restore), `src/components/PhantomControlCenter.tsx` (Recycle Bin) |
| 2 | The client project page needs a static header, titles and hamburger that move while scrolling | The header is pinned (`sticky top-0`): the Code Rx sign, the project/document title, the “PHANTOM · your Code Rx desk” badge and the hamburger stay in front of the client while the room scrolls underneath. The hamburger folds the sections on a narrow screen and folds the sidebar on a wide one — the same button at every width. | `src/components/ClientProjectRoom.tsx` |
| 3 | Remove the “Work on this document” panel; clients must be able to **sign** what PHANTOM sends, with **Save** after signing and a **Send to PHANTOM** button | The free-text editor is gone — component, transport, backend routes and helpers. In its place every opened document carries **“Sign this document”**: the client types their full name (and an optional role), presses **Save signature**, and presses **Send to PHANTOM** when they are done. The signature is stored per document, appended into the Code Rx Vault copy as a real signature block (heading + signature line + where and when), versioned in the Vault history, attributed to the client portal rather than to a member, written into the client’s activity history, and it raises a PHANTOM notification. | `functions/client-routes.ts` (`/signature`, `/send-to-phantom`), `functions/lib/schema.ts` (`client_document_signatures`), `src/components/ClientProjectRoom.tsx` |
| 4 | A **“Text PHANTOM”** button at the header/title that must trigger the PHANTOM notification system | **Text PHANTOM** sits in the pinned header (and as “Text PHANTOM about this” on an open document, so the message names that document). It opens a real dialog: who PHANTOM is, a labelled message box, **Send to PHANTOM**, and the client’s earlier messages read back. Every message is stored on the project (`client_messages`) *and* raises a notification in the existing PHANTOM inbox that names the client, the project and the document. | `functions/client-routes.ts` (`/messages`), `src/components/ClientProjectRoom.tsx` |
| 5 | The client project page must look better — features arranged well | The room is one arrangement: pinned header (sign, titles, PHANTOM desk, Text PHANTOM, log out) → sections beside the content → document → the stamped copy of the document itself → **signature** → **review this document** → download/print rule. The client’s own list now badges documents they have already signed, the document view offers “Sign this document” / “Text PHANTOM about this” before they start reading, the signature card says plainly whether the document is signed and by whom, and the whole page sits on a softer gradient with the same card language throughout. | `src/components/ClientProjectRoom.tsx`, `src/lib/projectRoom.ts`, `functions/lib/client-portal.ts` |

## What the client does now, end to end

1. They open their room with a key or a link. The header keeps their place while they read.
2. They open a letter, agreement or report PHANTOM sent them — the stamped Code Rx copy.
3. They press **Sign this document** (or the button in the document header scrolls them there), type their name, and press **Save signature**.
4. They press **Send to PHANTOM**. PHANTOM is notified immediately in the notification inbox.
5. If they have something to say, **Text PHANTOM** in the header — or “about this” on the document — and the message reaches PHANTOM the same way, and stays on the project so they can read it back.
6. They answer the four-answer review section on the document (Phase 20), which also reaches PHANTOM.

Nothing here widens what a client may reach: a signature is read and written through the same client session, project and document checks as everything else in the room, and the operator’s preview still serves no file and signs nothing.

## Data, reuse and security

* **New tables (additive, migrations preserve data):** `client_document_signatures` and `client_messages`, plus `idx_client_document_signatures_document` and `idx_client_messages_project`. Both hang off the client, the project and the document with foreign keys; messages are addressed by their own public id (`msg_…`), never a row number.
* **Reused, not duplicated:** the existing Recycle Bin, the existing Vault versioning (`document_versions`), the existing notification inbox (`createNotification` + `clientNotificationRecipients`), the existing client activity registry and the existing audit trail. No second router, no second session, no new storage.
* **Removed entirely:** the “Work on this document” panel, its `workspace` / `saveWorkspace` / `sendWorkspace` transport, and the `GET|POST /workspace` + `POST /workspace/send` routes. `normalizeDocumentContent` now receives the `{version, blocks}` shape it actually reads — the old array form silently produced an empty document, which is why the removed editor could save a revision that carried no text.
* **Signing is not access.** A signature never publishes, unpublishes, unlocks or downloads anything. The client copy and the linked Vault copy both carry it; the Vault keeps what was there before as a version.
* **Audit:** `client.document.signed`, `client.document.sent_to_phantom`, `client.message.sent`, `client.document.deleted` (now with the messages it released). Activities: `DOCUMENT_SIGNED`, `MESSAGE_SENT`, `DOCUMENT_SENT`.
* **No credentials in a URL** anywhere in this phase; the client’s session header is unchanged.

## Measurements

| Gate | Result |
|---|---|
| `npm run test:client-portal` (backend, incl. the new signing, messaging, delete/restore groups) | **1558 / 1558** |
| `npm run test:client-portal-ui` (interface, incl. signing, Text PHANTOM, pinned header) | **692 / 692** |
| `scripts/phase21-live-check.mjs` (the five asks, against a running API) | **62 / 62** |
| `scripts/phase20-live-check.mjs` (one logo, PHANTOM, the review section) | **62 / 62** |
| `scripts/phase19-live-check.mjs` (bin round trip, Vault copy, grouping — updated for signing) | **43 / 43** |
| `scripts/phase18-live-check.mjs` (direct links, stamped delivery) | **34 / 34** |
| `scripts/client-panel-dom-check.mjs` (jsdom: the panel and the real room, driven) | **62 / 62** |
| `scripts/browser-dom-check.mjs` (a link address landing in the real door) | green |
| `tsc` (app) and `tsc -p /tmp/tsconfig.functions.json` (functions) | clean (pre-existing baseline warnings only) |
| **Total** | **2513 / 2513 — 100.0%** |

The DOM run proves the round in the client’s own browser layer: the pinned header and hamburger, a signature typed and saved (found in the Vault copy afterwards), **Send to PHANTOM** raising the notification, **Text PHANTOM** storing a project message and one that names the document, the four-answer review still working, and a signed document deleting into the Recycle Bin and coming back with its signature.

## Notes for the operator

* Deploy is required for the room changes (interface) and the functions (signing, messages, delete fix).
* Client access must stay **on** in PHANTOM → Client Access → Permissions for client routes to serve.
* The delete complaint, checked against the current build: deleting from Client Access Center works and the document is in **PHANTOM → Recycle Bin**. What made it look broken was the bin showing only its three newest items — it now shows all of them, with a count.
