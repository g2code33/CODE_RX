# CODE Rx SOCIETY — CLIENT PROJECT PORTAL
## PHASE 5 REPORT — PHANTOM CLIENT ACCESS CENTER

**Branch:** `arena/01a0b09c-code-rx` · **Base:** Phase 4 at `4f07326`
**Scope delivered:** the internal **Client Access Center** inside the existing PHANTOM Control Center — clients, projects, documents, temporary links, activity and permissions, plus **PREVIEW AS CLIENT** and the two emergency controls. The public website, Member Portal, Vault and the rest of PHANTOM were not redesigned; no second authentication system was created.
**Live dev environment:** running and seeded (see *How to use the live preview* below).

---

## SUCCESS RATE

| Measure | Result |
| --- | --- |
| **Phase 5 acceptance tests** (backend groups 14–15 + UI groups 9–10) | **137 / 137 — 100 %** |
| **Full backend suite** | **364 / 364 — 100 %** |
| **Full UI suite** | **164 / 164 — 100 %** |
| **Combined** | **528 / 528 — 100 %** |
| **Phase 5 brief, requirements 1–8** | **8 / 8** |
| **Live end-to-end verification** (workspace list → preview → publish → suspend → revoke) | **28 / 28 checks** |
| **Mutation controls on the new Phase 5 logic** (6 backend + 4 UI) | **10 / 10 detected** |
| **TypeScript** | frontend `tsc -p tsconfig.json` clean; 0 errors in `functions/client-routes.ts`, `functions/lib/client-portal.ts`, `functions/client-auth.ts` (the pre-existing backend baseline is unchanged) |
| **Phase 5 score** | **100 % of the stated scope** |

**Five genuine defects were found and fixed during this phase** — including one where the preview would have shown *empty* sections while the client saw documents. All are listed under *Defects found and fixed*, with the test that now guards each one.

**Honest caveats, unchanged from Phases 3–4:**

1. **No browser automation.** The workspace's markup, navigation and preview promise are verified by rendering the real components with `react-dom/server`, by asserting the wiring in `PhantomControlCenter.tsx`, and by driving the identical API sequence against the live dev server. A purely visual regression (a colour, a spacing shift) is still not covered by a test.
2. **No watermarking pipeline.** No job stamps a document yet. Authorized downloads serve an existing `client-exports/` object; anything else is refused server-side, which is exactly what the preview and the workspace tell the operator. This remains the one unbuilt piece of the brief.
3. **Local dev credentials only.** Every account and document used below lives in the local D1/R2 state under `.wrangler/state`. Nothing was written to any Cloudflare account.
4. **`.dev.vars` is required for the local dev server** (`JWT_SECRET`, `ADMIN_PASSWORD`). It is gitignored and holds a local-only password; see *How to use the live preview*.

---

## FILES CHANGED

| File | Change |
| --- | --- |
| `src/components/ClientAccessCenter.tsx` | **New** (1402 lines). The six-section workspace, client rail, client/project/key/publish/link dialogs, the key-reveal dialog, PREVIEW AS CLIENT, and the exported preview transport/context builders. |
| `src/components/ClientProjectRoom.tsx` | +53 / −11. Becomes transport-driven (`RoomTransport`) so the operator's preview renders the **same** room against the preview endpoints; `preview` banner; `exitLabel`; download short-circuits in preview. |
| `src/components/PhantomControlCenter.tsx` | +7 / −2. Registers `Client Access Center` in the existing PHANTOM `TABS` sidebar and renders the workspace inside the existing shell. |
| `src/lib/cloudflare.ts` | +83. `clientAccessCenter` — the workspace's API surface (clients, projects, keys, documents, links, activity, preview, Vault sources). Phase 3's `clientPortal` untouched. |
| `functions/client-routes.ts` | +286 / −8. Access Center routes: preview (×4), Vault publishing picker, link metadata, client list counters, plus the Vault snapshot and preview-count fixes. |
| `scripts/client-portal-tests.mjs` | **Groups 14–15 added** (99 assertions). |
| `scripts/client-portal-ui-tests.mjs` | **Groups 9–10 added** (38 assertions). |
| `CLIENT_PORTAL_PHASE5_REPORT.md` | This report. |

**Not touched:** the public site, the member dashboard, the Vault UI, `App.tsx`, `client-auth.ts`, `client-portal.ts`, `accessKey.ts`, `projectRoom.ts`, `ClientAccessScreen.tsx`, `ClientPortal.tsx`, `wrangler.toml`, `vite.config.ts`, and every Phase 2 table.

---

## 1. CLIENT ACCESS CENTER

The workspace is a **tab of the existing PHANTOM Control Center**, not a parallel admin area. `PhantomControlCenter.tsx` gains one entry in the same `TABS` array that drives the founder sidebar, and renders `<ClientAccessCenter />` inside the same card the other tabs use. It reuses the member bearer token, the existing `requireAuth`, the existing `website_admin_permissions` delegation table, the existing `audit_logs` feed and the existing Vault tables. **No new authentication system, no new permission table, no second routing layer.**

Six sections, in the order the brief lists them, and the client rail is present on every one because everything is scoped to a client:

```
Clients · Projects · Documents · Temporary Links · Activity · Permissions
```

Verified: `the workspace defines exactly the six required sections in order`, `the workspace is a tab of the existing PHANTOM navigation`, `the workspace reuses the existing admin shell rather than a second one`, `the workspace markup never renders an API path / an internal table name / a stored credential field / an internal storage key / a database row id`.

---

## 2. CLIENT MANAGEMENT

The client list is served by the existing workspace route, widened in this phase with two computed columns:

* `publishedCount` — published **and** client-visible **and** view-allowed, non-archived documents (the only count a client could ever disagree with).
* `lastActivityAt` — `MAX(audit_logs.created_at)` for `subject_type='client'`, i.e. the same indexed feed the Activity section reads. No second logging system.

The Clients panel shows name, contact name / email / phone / created date, status badge, project and published counts, last activity, and the internal note (labelled *Internal note*, never sent to the client). Available actions: **Create client**, **Edit**, **Preview as client**, **Suspend client access**, **Reactivate client**, **Archive client**, **Revoke all client access**.

Archived clients leave the default list and come back with the *Archived* toggle (`?archived=1`), so compliance data is never destroyed by an archive. Verified live: `the client entry carries count + last activity fields`, `the workspace lists the demo clients`, `archiving a client withdraws it from the default workspace list`, `archived clients stay reachable through the archived filter`.

---

## 3. PROJECT MANAGEMENT

Projects are created **against exactly one client** (`POST /api/phantom/clients/:clientId/projects`), listed per client, editable (name, client-facing description, status *active / on hold / archived*) and archivable/restorable. An archived project refuses new documents with **409** rather than silently accepting work the client can no longer see.

The per-project document and key counts shown in the panel are computed from the documents and keys the workspace already loaded — **no extra endpoint and no extra query** was added for them.

Verified: `a new project is associated with exactly one client`, `a project is never listed under another client`, `PHANTOM can edit a project name, description and status`, `a project status outside the allowed set is refused`, `PHANTOM can archive a project`, `an archived project refuses new client documents (409)`, `PHANTOM can restore an archived project`.

---

## 4. ACCESS KEY MANAGEMENT

Key handling is unchanged from Phase 2 in its security properties, and the workspace now exposes it properly:

* **Generate** — the raw key is returned **once**, in the 201 body, with a 4-character hint and an optional expiration; the response says *"Copy this access key now and deliver it securely. It cannot be shown again."*
* **Reveal once** — the key is shown in a dedicated dialog that states it cannot be retrieved, only regenerated, with a copy button.
* **Never stored in readable form** — the list route selects `key_hint`, never `key_hash`; the DB stores a PBKDF2 hash.
* **Regenerate** — a new credential is issued and **every session that used the old one is killed**.
* **Revoke** — the key becomes `revoked` and is refused at sign-in.
* **Suspend access** — the emergency path (section 7) revokes keys, sessions and links together.

Verified: `a generated key is returned once, in the CRX format, with a short hint`, `only a hash of the credential is stored`, `the key list never returns a passkey or a hash`, `regenerating issues a different credential, shown once`, `regenerating kills every session that used the old credential`, `the replaced credential no longer signs in`, `an expiration can be attached to a key`, `PHANTOM can revoke a key, which is then refused at sign-in`.

One client-facing rule about pinning is now stated where the operator chooses it: a key with **no project pin** only signs in while the client has exactly one active project — ambiguous access is refused rather than guessed. The old placeholder text ("Billing-free: no project pin") was wrong and is fixed.

---

## 5. PUBLISHING

The controlled workflow is one dialog, and every step of the brief is a visible stage:

```
1 · source (write the client copy, or use an internal document)
2 · Project          3 · Section          4 · Client permissions
   → In review → Approved → Published
```

* **Internal documents are never auto-exposed.** The picker (`/api/phantom/client-vault-sources`) offers only active, non-archived Vault documents in non-sensitive sections with `visibility <> 'restricted'`; sensitive sections, restricted documents, archived documents and drafts are excluded or marked `publishable: false`. Listing them exposes them to nobody.
* **Publishing pins a snapshot.** A Vault document is copied into the client document as a version snapshot; the Vault row itself is untouched (`status`, `visibility`, `is_archived` re-asserted after publishing).
* **Visibility is explicit.** A document reaches a client only when it is `published` **and** client-visible **and** `allow_view`. Publishing without the flag leaves it hidden.
* **View and download stay separate.** Download is a second, independent checkbox, disabled unless view is allowed, and the UI states that downloads come only from a stamped client copy.

Verified: `a new client document starts as a draft and is invisible to the client`, `a document under review is still invisible to the client`, `an approved but unpublished document is still invisible to the client`, `publishing makes the document visible in the client room`, `unpublishing withdraws the document again`, `a published document without the client-visibility flag stays hidden`, `the publishing picker lists an approved internal document as publishable`, `restricted, sensitive and archived internal documents are never offered`, `publishing a snapshot changes nothing inside the Vault`, `a sensitive internal document can never be published to a client`.

---

## 6. CLIENT PREVIEW

**PREVIEW AS CLIENT** renders the **real** `ClientProjectRoom` component through an injected transport, so there is exactly one room implementation in the codebase. The transport is exported (`buildPreviewTransport`, `buildPreviewRoomContext`) and tested: it exposes only `project`, `section`, `document`, has **no `download` capability at all**, and can only ever address the client and project it was built for.

What the preview guarantees:

* **Same payload, not a re-render.** The backend test asserts `JSON.stringify(preview.room) === JSON.stringify(client.room)` — byte-identical to what the client's own session receives, because both are produced by the same `publicProject` / `publicDocument` / exposure logic.
* **No new authorization.** The preview route is `requireAuth` + `clients.preview`; it never creates a client session (asserted by counting `client_sessions`), never returns a credential, and refuses anything the client cannot see with `404 not_client_visible`.
* **No files.** The preview serves no bytes, no `storage_reference`, no signed URL — and it reports `permissions.download = false` even for a document the client may download. The operator sees *that* the client can download; the file is only ever served inside a client session.
* **Honest labels.** A non-active project produces a notice instead of pretending, the room carries a banner (*"Preview only — this is exactly what … sees. No client session was created, no document is downloaded…"*) and the header action reads **Exit preview**, not *Log out*.

Verified: `the preview payload is identical to what the client actually receives`, `opening a preview creates no client session`, `the preview refuses a document the client cannot see (404 not_client_visible)`, `no preview response body ever carries a hidden document`, `the client can download the letter but the preview cannot`, `the preview transport has no download capability at all`.

---

## 7. EMERGENCY CONTROL

Both controls are server-side status changes with a full credential cascade, and both are proven at the row level, not only by the HTTP response:

* **SUSPEND CLIENT ACCESS** — `POST /api/phantom/clients/:id/status {status:'suspended'}` revokes every access key, revokes every session row, revokes every outstanding temporary link, then records `client.client_suspended` in the audit log and a `CLIENT_SUSPENDED` client activity event.
* **REVOKE ALL CLIENT ACCESS** — `POST /api/phantom/clients/:id/revoke-all` runs the same cascade while leaving the client record itself intact and manageable, so a replacement key can be issued later.
* **Reactivation never restores access** — the old key and the old session stay dead; the panel says so in plain language.

Verified in the suite (with a real client that had a working key, session and link): `suspension revokes the stored access key row, not only the sign-in path`, `suspension revokes the stored session row on the server`, `suspending a client revokes outstanding temporary links`, `the suspension is recorded in the audit log`, `reactivation never restores the old key`, `reactivation never restores the old session`, `REVOKE ALL CLIENT ACCESS runs the full credential cascade server-side`, `no revoked key keeps a live session on the server`.

Verified live against the running dev server, with a freshly created client: `SUSPEND CLIENT ACCESS cascades on the server` (keys ≥ 1, links ≥ 1), `the live client session dies on suspension`, `the live key is refused after suspension`, `the suspended client link is revoked`, `REVOKE ALL CLIENT ACCESS responds server-side`.

---

## 8. TEST

**PHANTOM can perform every authorized action** — the whole workspace is exercised as PHANTOM through the real API: list, create, edit, archive, key generation/regeneration/revocation, document creation, the full lifecycle, publishing, temporary links, previews and both emergency controls. One summarising check asserts list + preview + key + lifecycle + link in a single pass.

**Unauthorized founding members can do nothing until explicitly granted.** The four new capability keys are added to the *existing* delegation list and granted one by one through the existing Website Admin API:

```
clients.manage · clients.publish · clients.links · clients.preview
```

The suite grants **one** key at a time and probes the rest:

* with **no grant** — preview 403, list 403, create 403;
* with **`clients.preview` only** — preview **200**, but list, create, key issuance, publish, link creation and revoke-all all **403**, and the preview leaves the client untouched;
* with **`clients.publish` only** — publishing allowed, management still **403**;
* after **removing** the grant — preview **403** again.

**PHANTOM itself holds no `website_admins` row** and still controls everything — the bypass is the existing PHANTOM rule, not a new one.

### Defects found and fixed during this phase

1. **Preview section counts would have shown empty sections (high impact).** The preview room counted documents by *section id* (`letters`) instead of by *category* (`letter`), so every non-overview section in the preview read `0` while the client's own room read the real number. Caught by the byte-identical payload test; guarded by mutation M3.
2. **A plain-text Vault document published as a blank client document.** When a Vault document had no stored block snapshot, only `content_json` was consulted, so a perfectly good text document was filed as an empty client document that looked published but read as blank. Fixed by snapshotting the text; guarded by mutation M5.
3. **The Temporary Links dialog was rendered whenever the tab was open** (an always-on overlay), and the tab's *Create* button opened the **key** dialog. Fixed with its own dialog state; the UI suite now asserts the link flow is state-gated.
4. **Client Access Center was not reachable at all** — the component existed but was not registered in PHANTOM's `TABS`. Fixed and covered by `the workspace is a tab of the existing PHANTOM navigation` (mutation U4 removes the tab and the suite fails).
5. **Front-end/back-end contract mismatches, all fixed before release:** the detail route returns `{client, projects}` (the helper now unwraps `client`), the documents route filters on `?project=` (the helper sent `?projectId=`), the API speaks `lifecycle` / `project.id` / `vaultVersion` while the new panel read `lifecycleStatus` / `projectId` / `vaultVersionNumber`, and "Last activity" was read from the detail record instead of the list entry that actually carries it.

**Also confirmed unchanged:** the entire Phase 2, 3 and 4 suites (265 assertions) still pass untouched — cross-client isolation, the seven access-screen states, the room's section/visibility/publication rules, the audit and rate-limit behaviour, and the existing Vault, member, PHANTOM and community endpoints.

---

## MIGRATION & DEPLOYMENT NOTE

**No schema change was needed in this phase — no new table, no new column, no new index, no migration.** The counters come from existing tables (`client_documents`, `client_access_keys`, `client_projects`, `audit_logs`), the four capability keys reuse `website_admin_permissions`, and the preview reuses the Phase 2 authorization and serializer code. Every change is additive: one widened `SELECT` on the client list, new `GET` routes, and one mounted UI tab.

Deployment is the normal path: this branch → `main` → `.github/workflows/deploy.yml` (which deploys from `main` only). `dist/` was rebuilt with the Phase 5 UI.

---

## HOW TO USE THE LIVE PREVIEW

The dev server is running on port **8788** with real Pages Functions, the local D1 database and the local R2 bucket (`.wrangler/state`). Locally it needs a gitignored `.dev.vars` containing `JWT_SECRET` and `ADMIN_PASSWORD`; without it the login returns *"Authentication is not configured."*

**1. Open PHANTOM**
Sign in as the local PHANTOM account — `coderxsociety@gmail.com` / `DevPreviewPassword1` (local dev only) — then choose **PHANTOM Control** in the workspace switcher and **CLIENT ACCESS CENTER** in the founder sidebar.

You should see two demo clients in the rail:

* **Ashanti Pharmacy Ltd** — 1 project, 5 published documents, a last-activity timestamp, and status *active*.
* **Kumasi Diagnostics** — its own project and its own single published document.

**2. Preview as a client**
Select *Ashanti Pharmacy Ltd* → **Preview as client**. The real project room opens with the preview banner, showing exactly what the client sees — *Engagement letter*, *Phase 1 discovery report*, *Platform architecture deliverable*, *Master services agreement*, *Week 6 progress update* — and never the unpublished *INTERNAL margin analysis* or the archived *Superseded scope note*, and never anything belonging to Kumasi Diagnostics. Download is reported per document but not served in preview; the header action reads **Exit preview**.

**3. Publish something**
**Documents → Publish to client**: choose *Use an internal document* (the Vault picker) or write the client copy, then project → section → permissions, and **Approve & publish**. The document appears in the room and in the preview; **Save as draft** leaves the client seeing nothing.

**4. Try the emergency controls**
On the client card: **Suspend client access** (or **Revoke all client access**). Then open `/#client-portal` in another tab and try the demo key for Ashanti Pharmacy Ltd — `CRX-6PD5-PNBU-CK2F-F88F` — and the session is refused. **Reactivate client** restores the client record but never the old key: issue a new one from the key dialog and it appears once, with a note that it cannot be shown again.

**5. Check the client's own view (regression)**
`/#client-portal` with `CRX-6PD5-PNBU-CK2F-F88F` (Ashanti Pharmacy Ltd) or `CRX-VD93-FL6W-H5X9-LPXB` (Kumasi Diagnostics) still opens the Phase 4 room unchanged.

**Granting delegated access:** *Client Access Center → **Permissions*** lists every member and the four capability keys as toggles — `clients.manage`, `clients.publish`, `clients.links`, `clients.preview`. Nothing is granted by default; the server refuses every client-portal action without an explicit grant.
