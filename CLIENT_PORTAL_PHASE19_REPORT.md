# Phase 19 — Delete that lands in the Recycle Bin, the client's own revision, and a Vault that knows whose papers these are

**Delivered on branch `arena/01a0b09c-code-rx`.** Nothing here changes a database
shape, adds a dependency, or introduces a second system: the Recycle Bin, the
Vault's own version history, the notification inbox, the audit trail and the
client activity log are all reused exactly as they were.

---

## What was asked, and what was found

| # | The ask | What was actually wrong | What was done |
|---|---------|------------------------|---------------|
| 1 | "the delete button in phantom client page is not working, fix it and note all deleted items go to recycle bin" | A **client document** delete already worked and already reached the Recycle Bin. The delete that did **not** was the **Vault document** delete: `DELETE /api/vault/documents/:id` only set `is_archived = 1` and never wrote a Recycle Bin entry, so an operator who pressed Delete found nothing to restore. | The Vault editor now has a real **Delete to Recycle Bin** action beside Archive (`POST /api/vault/documents/:id/delete`), and the Recycle Bin knows how to restore a `vault_document` — with its version history. |
| 2 | "client side should work on sent documents/letters, save and send to PHANTOM" | There was no way for a client to write anything back: the room only displayed a stamped copy. | The client's document page now carries a **Work on this document** panel — a writing area, **Save**, and **Save & send to Code Rx**. Sending raises a notice in the existing notification inbox, an entry in the client's activity history and an audit row. |
| 3 | "client-side edits should also change the Vault copy" | — | Saving at the client's side writes the **same** `vault_documents` row the document was published from: the previous state stays recoverable in `document_versions`, the client's revision becomes the next version, and it is attributed to **the client portal — never to a member**. |
| 4 | "Vault must group documents by client (and that client's projects) to prevent mixed ups" | The shelf was one flat list of every document in a section, with no indication of whose papers they were. | The Vault list now carries each document's client and that client's project (from the link that already exists — `client_documents.vault_document_id`), and the shelf renders one headed group per client and project, with anything never published to a client under a single honest *Internal* heading. |

---

## The four rules this phase respects

1. **One Recycle Bin.** `functions/lib/recycle.ts` `moveToRecycleBin()` is still
   the only implementation. A Vault document is now written into the *same*
   `recycle_bin_items` table as applications, subscribers, contact messages,
   client documents and withdrawn notices, with `resource_type = 'vault_document'`.
2. **Delete and archive stay different things.** Archive keeps a document on the
   shelf (recoverable from the archived view); Delete takes it off the shelf and
   into the Recycle Bin. Both are offered, both are reversible, and neither can
   be mistaken for the other.
3. **A client is never a member.** The client's revision is stored with
   `changed_by_member_profile_id = NULL` and a change note that names the client
   portal. No member is credited with writing something a client wrote.
4. **Nothing new is stored to make grouping work.** Client and project names come
   from the existing `client_documents → clients → client_projects` joins, and a
   client is identified to the browser by its public id (`cli_…`), never by a
   database id.

---

## Where the changes are

| File | Change |
|------|--------|
| `functions/[[path]].ts` | New `POST /api/vault/documents/:id/delete` (snapshot → Recycle Bin → archive off the shelf → audit + Vault activity). The Vault document list now joins the client document, client and client project. `restoreRecycleBinItem()` learnt the `vault_document` type, restoring the document, its status and its version history. |
| `functions/client-routes.ts` | The client workspace API: `GET/POST …/documents/:documentId/workspace` and `POST …/workspace/send`, with the helpers that read the client's working copy, save the revision (client copy **and** Vault copy, plus history) and tell PHANTOM it came back. |
| `functions/lib/client-portal.ts`, `functions/lib/client-activity.ts` | Two new events in the one existing registry: `DOCUMENT_SAVED`, `DOCUMENT_SENT` ("Saved a revision", "Sent a document to Code Rx"). |
| `src/components/VaultDocumentEditor.tsx` | The Delete to Recycle Bin action, with the confirm that says where the document goes. |
| `src/components/Vault.tsx` | `groupDocumentsByClient()` (exported so the rule itself is testable) and the group heading rows on the shelf. |
| `src/components/ClientProjectRoom.tsx` | The **Work on this document** panel, its Save / Save & send actions, and the plain-text view of the document the client edits. |
| `src/lib/cloudflare.ts` | `vault.deleteDocument()`; `clientPortal.workspace / saveWorkspace / sendWorkspace` on the client session's own header. |
| `src/index.css` | Group heading styling, and a heading row that is never styled as a clickable document. |
| `scripts/phase19-live-check.mjs` | **New** — the four asks against a running API. |
| `scripts/client-panel-dom-check.mjs` | Extended — the operator's Delete *and* the client's Save / Save & send, clicked in a real DOM. |

---

## Results

| Harness | Result |
|---------|--------|
| `npm run test:client-portal` (real Hono app + real SQLite) | **1430 / 1430** (was 1384) |
| `npm run test:client-portal-ui` (real components, rendered) | **611 / 611** (was 585) |
| `node scripts/phase19-live-check.mjs` (the four asks, live) | **39 / 39** |
| `node scripts/phase18-live-check.mjs` (the portal, live) | **34 / 34** |
| `NODE_PATH=/tmp/browser/node_modules node scripts/client-panel-dom-check.mjs` (buttons, in a DOM) | **18 / 18** |
| **Total** | **2132 / 2132 — 100%** (2003 before this phase, +129 checks) |

### Two real bugs the checks caught, both now fixed

* **The working copy could not be read at all.** The session middleware never
  loads a document's stored content (deliberately, so browsing a project cannot
  pull document bodies), so the first version of the workspace helper always saw
  an empty document and answered "read-only" — with one honest 500 on the read
  path. The helper now reads its own single row, on a route the client is already
  authorized for.
* **Save silently sent a JSON string instead of an object.** `clientCall`
  serialises its own body, and the new call serialised it first — the route saw a
  string, found no text in it, and refused. The client's Save button saved
  nothing until this was fixed; the DOM harness is what proved it, end to end.

Both were found because the DOM harness clicks the real buttons against the real
preview, not because a mock agreed with the code.

---

## What an operator sees

* **PHANTOM → Vault → a document → the trash action** now says *"Delete this
  document? It leaves the Vault and goes to PHANTOM → Recycle Bin, where it can
  be restored with its version history."* After it, the shelf no longer shows the
  document and PHANTOM → Recycle Bin has a `Vault document · …` entry with a
  Restore button.
* **PHANTOM → Vault → a section** lists documents under headings such as
  `ACME GHANA / Website` and `BETA LTD / Rebrand`, with a count per group, and
  everything that never went to a client under `INTERNAL — NOT PUBLISHED TO A CLIENT`.
* **The client's room** shows a document with a writing area, **Save**, and
  **Save & send to Code Rx**, the last-saved time, and — after saving — *"Saved.
  Your revision is version 1.1 and the Code Rx Vault copy now carries it too."*
* Restoring a deleted client document brings it back **unpublished**, so a
  restore never quietly re-opens a client's access; the operator publishes it
  again when they are ready.

---

## To see this in production

These are code changes, not switches, so nothing needs enabling — but they only
reach `coderxsociety.pages.dev` when `main` is deployed by
`.github/workflows/deploy.yml`. Pull `arena/01a0b09c-code-rx` into `main` and let
the workflow run. The portal switch state in production is unchanged and still
lives at PHANTOM → Client Access → Permissions → *Client portal settings*.

## Deliberate limits, kept

* A document delivered as a **file** (a stamped PDF, an image, a Word document) is
  not editable in the room, and the panel says so in the client's own words
  instead of offering a box that cannot be used.
* Sending a document back **tells** Code Rx; it never unlocks anything, never
  publishes anything, and never changes who may read the document.
* *Delete forever* inside the Recycle Bin remains permanent — that is the point
  of it. Every deletion on the client and Vault surfaces goes to the bin first.
* No credential is ever placed in a URL, and no client sees another client's
  document, project, name or identifier: the isolation checks are part of the
  same suite (group 30).
