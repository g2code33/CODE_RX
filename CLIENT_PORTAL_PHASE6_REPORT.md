# Code Rx — Client Portal, Phase 6 Report

**Phase:** 6 of the Client Portal programme — **Granular founding-member client permissions**
**Branch:** `arena/01a0b09c-code-rx` **Base:** `b5a5ff2` (Phase 5, pushed)
**Date:** 17 September 2026

---

## 1. Result

| Suite | Checks | Passed | Failed | Rate |
| --- | --- | --- | --- | --- |
| Backend / authorization (`scripts/client-portal-tests.mjs`, groups 0–17) | 1053 | 1053 | 0 | **100.0 %** |
| Frontend workspace (`scripts/client-portal-ui-tests.mjs`, groups 0–11) | 195 | 195 | 0 | **100.0 %** |
| Live browser + HTTP verification against `wrangler pages dev` | 60 | 60 | 0 | **100.0 %** |
| TypeScript (`tsc --noEmit -p tsconfig.json`) | — | clean | — | **clean** |
| Production build (`npm run build`) | — | success | — | **success** |
| Mutation checks (does the suite actually detect a broken guard?) | 6 | 6 detected | 0 missed | **100 %** |

**Phase 6 success rate: 100 % (1308/1308 automated checks, 0 failures, 6/6 mutations detected).**

---

## 2. What the brief asked for, and where it lives

| Brief requirement | Implementation |
| --- | --- |
| Add only permissions that do not already exist | `functions/lib/client-permissions.ts` — one 25-capability registry; the four Phase 5 umbrella keys are **not** re-created, they are expanded (see §4) |
| PHANTOM keeps full Client Portal management | `effectiveClientCapabilities()` returns the whole set when the actor is PHANTOM; `permissionChangeRefusal()` returns `null` for PHANTOM |
| NEXUS, GHOST, FALCON, QUANTUM, MATRIX receive **no** client permissions automatically | Founding codenames are never read by the permission layer; a founding identity without an explicit grant holds an empty set and every probe returns 403 (tested for all five identities) |
| PHANTOM can grant / remove / modify | `POST /api/phantom/client-permissions` writes the **full set** for one member and reports `previous`, `next`, `added`, `removed` |
| All checks are server-side | 25 `requireClientCapability` middleware mounts + 3 dynamic `assertClientCapability` checks; one capability per route, enforced **before** the resource is read |
| Audit WHO / WHAT / WHEN / TARGET / OLD / NEW | `auditPermissionChange()` writes `client.permissions.updated` rows into the existing `audit_log`; the workspace reads them back from `GET /api/phantom/client-permissions` |
| Test every permission independently; call the API directly | Test group 16 grants each of the 25 capabilities on its own and fires **all 25 probes** against that single grant (625 directed attempts), group 17 re-tests the umbrella keys and the refusal paths, and every probe is a direct HTTP call with a member token — never a UI assertion |

Standing interpretation preserved: the client-facing watermark/stamping pipeline is still **unbuilt**, so client downloads of real files remain server-denied; Preview deliberately serves no bytes and none of this changed in Phase 6.

---

## 3. The 25 capabilities

| # | Brief name | Stored key | Group | Goes through |
| --- | --- | --- | --- | --- |
| 1 | `CLIENT_VIEW` | `clients.view` | Clients | client list, client detail, access-key list, activity |
| 2 | `CLIENT_CREATE` | `clients.create` | Clients | create client |
| 3 | `CLIENT_EDIT` | `clients.edit` | Clients | edit client |
| 4 | `CLIENT_SUSPEND` | `clients.suspend` | Clients | suspend / resume / revoke-all |
| 5 | `CLIENT_ARCHIVE` | `clients.archive` | Clients | archive / restore |
| 6 | `CLIENT_PROJECT_VIEW` | `clients.projects.view` | Projects | project list |
| 7 | `CLIENT_PROJECT_CREATE` | `clients.projects.create` | Projects | create project |
| 8 | `CLIENT_PROJECT_EDIT` | `clients.projects.edit` | Projects | edit project |
| 9 | `CLIENT_PROJECT_ARCHIVE` | `clients.projects.archive` | Projects | archive / restore project |
| 10 | `CLIENT_DOCUMENT_VIEW` | `clients.documents.view` | Documents | document list, Vault sources picker |
| 11 | `CLIENT_DOCUMENT_CREATE` | `clients.documents.create` | Documents | file document |
| 12 | `CLIENT_DOCUMENT_EDIT` | `clients.documents.edit` | Documents | edit document, per-document allow view/download |
| 13 | `CLIENT_DOCUMENT_PUBLISH` | `clients.documents.publish` | Documents | publish, upload-and-deliver |
| 14 | `CLIENT_DOCUMENT_UNPUBLISH` | `clients.documents.unpublish` | Documents | unpublish |
| 15 | `CLIENT_DOCUMENT_DELETE` | `clients.documents.delete` | Documents | delete → Recycle Bin |
| 16 | `CLIENT_ACCESS_KEY_CREATE` | `clients.keys.create` | Access keys | issue key / passkey |
| 17 | `CLIENT_ACCESS_KEY_REGENERATE` | `clients.keys.regenerate` | Access keys | regenerate passkey |
| 18 | `CLIENT_ACCESS_KEY_REVOKE` | `clients.keys.revoke` | Access keys | revoke key |
| 19 | `CLIENT_LINK_CREATE` | `clients.links.create` | Temporary links | create link |
| 20 | `CLIENT_LINK_REVOKE` | `clients.links.revoke` | Temporary links | revoke link |
| 21 | `CLIENT_LINK_MANAGE` | `clients.links.manage` | Temporary links | link list |
| 22 | `CLIENT_ACTIVITY_VIEW` | `clients.activity.view` | Activity | client activity feed |
| 23 | `CLIENT_SETTINGS_MANAGE` | `clients.settings.manage` | Settings | the three portal switches |
| 24 | `CLIENT_PERMISSIONS_MANAGE` | `clients.permissions.manage` | Permissions | the permission matrix itself |
| 25 | `CLIENT_PREVIEW` | `clients.preview` | Preview | PREVIEW AS CLIENT (kept **separate** from `CLIENT_VIEW`) |

The registry row also carries `label`, `description` and `group`, so the workspace renders the operator-facing text from the server instead of duplicating it in the frontend.

`clients.preview` is the one capability that maps to an *existing* Phase 5 key: in Phase 5 it was PHANTOM-only, so it was promoted to a capability that is **explicit-only** — it is never implied by any other capability and never bundled into `clients.manage`.

---

## 4. The four Phase 5 umbrella keys are preserved, not re-created

No destructive migration, no rewriting of existing grants. `expandClientPermissionKeys()` resolves each stored Phase 5 key into the granular set it always meant:

| Stored key (unchanged) | Resolves to | Deliberately **not** resolved to |
| --- | --- | --- |
| `clients.manage` | 16 capabilities: view, create, edit, suspend, archive, all four project and all six document capabilities, all three key capabilities, activity | `clients.permissions.manage`, `clients.settings.manage`, `clients.preview` — all three were PHANTOM-only in Phase 5, so expanding them would silently widen an existing grant |
| `clients.publish` | `clients.documents.publish`, `clients.documents.unpublish` | everything else |
| `clients.links` | `clients.links.create`, `clients.links.revoke`, `clients.links.manage` | everything else |
| `clients.preview` | `clients.preview` | everything else |

Verified live: a member holding only `clients.manage` can still file a document, and is refused (403 `client_permission_required`) on permission management and on portal settings.

---

## 5. Refusals and non-escalation

Every guarded route answers a missing capability with the same machine-readable shape, produced by one helper:

```json
{ "success": false, "error": "Client portal permission required.",
  "code": "client_permission_required", "permission": "clients.documents.delete" }
```

Dynamic decisions (client status changes, document lifecycle, project archive) call `assertClientCapability()` **before** the row is read, so an unauthorized caller cannot use 404/409 timing as an oracle.

Delegation rules enforced server-side (`permissionChangeRefusal`):

* PHANTOM — unrestricted.
* Any other operator — may only touch **client-portal** keys (a non-client key such as `pages.edit` is refused with 400), may never edit **their own** profile, and may never grant or remove a capability they do not hold themselves. Refusal code: `permission_escalation_refused`.
* Unknown capability — 400 (`Unknown client permission: …`).
* Non-active member — 409; only active members can hold permissions.
* Rewriting a member's client capabilities never touches their non-client website powers.

---

## 6. Audit

Every grant, removal, modification and website-admin (re)assignment writes a `client.permissions.updated` row into the existing `audit_log` through the existing audit helper:

| Field | Content |
| --- | --- |
| WHO | actor name + member code (`CRX-0001`), stored as `actor_user_id` on the actor's own row |
| WHAT | `client.permissions.updated`, `source: client_access_center.permissions` or `website_admin.assign` |
| WHEN | server timestamp |
| TARGET | target member profile id, member code and display name (joined through `users`, never a raw id alone) |
| OLD VALUE | `previousValue` — the full set before the change |
| NEW VALUE | `newValue`, plus `added` / `removed` |

The workspace reads this back in the panel's **Recent permission changes** feed. No passkey, key hash or client access key is ever written to the audit (asserted in both suites).

---

## 7. Files changed

| File | Change |
| --- | --- |
| `functions/lib/client-permissions.ts` | **new**, 407 lines — capability registry, expansion, effective-set resolution, middleware/assertion helpers, status/lifecycle/update mapping, diff, refusal rules, audit writer |
| `functions/lib/recycle.ts` | **new**, 29 lines — `moveToRecycleBin()` extracted from `[[path]].ts` so both the website-admin and the client-portal delete paths use the same Recycle Bin implementation (no second system) |
| `functions/client-routes.ts` | +411/−… — 25 capability middleware mounts + 3 dynamic capability checks (one capability per route), document `DELETE`, portal-settings `GET`/`PUT`, capabilities `GET`, permissions `GET`/`POST` |
| `functions/[[path]].ts` | website-admin POST/PATCH now audit permission changes; Recycle Bin restore branch for `client_document` (comes back as `draft`, `client_visible = 0`); member-name lookups joined through `users` |
| `src/components/ClientAccessCenter.tsx` | capability-driven workspace: `can()` gating on every action, lifecycle options filtered by capability, rail hidden with an explanation instead of failing, rebuilt **Client permissions** panel (matrix, per-capability disable when not held, portal switches, change feed), document delete |
| `src/lib/cloudflare.ts` | `clientAccessCenter` gained `capabilities`, `permissionMatrix`, `setMemberPermissions`, `portalSettings`, `savePortalSettings`, `deleteDocument` |
| `scripts/client-portal-tests.mjs` | +429 lines — groups 16 and 17 |
| `scripts/client-portal-ui-tests.mjs` | +71 lines — group 11 |

No new table, no new role, no second authentication system, no new routing system, no dependency change, no change to the client-facing room's authorization model.

---

## 8. How each requirement was tested

**Independence (group 16, backend).** For each of the 25 capabilities: assign it **alone** to a fresh member, then fire all 25 capability probes with that member's own token, and require exactly one non-403 — its own. That is 625 directed attempts; a capability that leaks into another action, or an action that is reachable without its capability, fails the run.

**Direct unauthorized calls (group 17 + live).** Every probe is an HTTP request with a member token, not a UI assertion — 403 with `code: client_permission_required` and the expected `permission` key. This is the "frontend hiding is NOT authorization" requirement: the same requests were repeated live against the built Worker.

**Founding identities.** All five identities (`founding-nexus`, `founding-ghost`, `founding-falcon`, `founding-quantum`, `founding-matrix`) are created and logged in, and each is refused on every probe family until an explicit grant is made.

**Non-escalation.** A delegated manager (holding `clients.permissions.manage` and `clients.view`) is refused on their own profile, refused when granting a capability they do not hold, refused when smuggling a non-client key, and allowed to grant a capability they *do* hold to another member. Asserted in the backend suite and repeated live.

**Audit.** The backend suite inspects the audit rows for target, old value, new value and history; the live pass reads them back through the API and confirms the workspace fields (`actor`, `at`, `target`, `previousValue`, `newValue`).

**Lifecycle + Recycle Bin.** Delete → `recycle_bin_items` row with `resource_type = 'client_document'` → restore → document returns as `draft` with `clientVisible = false`; publishing and unpublishing are separately refused for a member that only holds view.

**Mutations (6/6 detected).** Widening the document-delete guard → 2 failures; disabling the non-escalation refusal → 2 failures; dropping the permission audit write → 4 failures; dropping the `clients.manage` expansion → 1 failure; removing the delete gate in the workspace → 1 UI failure; making not-held capabilities grantable in the workspace → 1 UI failure.

---

## 9. Live verification (browser build, real Worker)

`npm run build` → `wrangler pages dev dist --port 8788` (0.0.0.0, live preview for the operator), then 60 HTTP checks plus a bundle inspection:

* PHANTOM signs in and receives the full 25-capability set; the catalog contains no client data, no client keys, no hashes.
* Two member identities are created **through the app's own PHANTOM endpoints** (create → activation link → activate), then sign in and receive an empty capability set.
* Six protected surfaces are refused for the un-granted member (list, create, permissions, settings, document delete, preview).
* One grant of `clients.view` unlocks exactly the client list and nothing else — documents, preview, delete and permission management all remain 403; the member's own catalog shows only that one capability.
* A delegated manager cannot escalate; `clients.manage` keeps its Phase 5 meaning without widening.
* Portal settings round-trip (`client_downloads_enabled` false → observed false → restored true).
* Delete → Recycle Bin → restore → draft; publish → client-visible; unpublish refused without the capability.
* The served bundle contains the capability-driven panel, the "Not held by you" rule, the founding-identity note and the "no permission to view client records" panel.

Demo credentials (local only): Client Access Center `#client-portal`, client access key `CRX-6PD5-PNBU-CK2F-F88F`; PHANTOM `coderxsociety@gmail.com`.

---

## 10. What Phase 6 deliberately did **not** do

* No new role, no new table, no new permission store — the existing `website_admins` / `website_admin_permissions` / `audit_log` structure carries everything.
* No migration of existing grants; Phase 5 keys keep working with exactly their old meaning.
* No widening of `clients.manage` into permission management, portal settings or preview.
* No client-facing watermarking: the stamping pipeline is still unbuilt, client downloads of real files remain server-denied, and Preview still serves no file bytes.
* No redesign of unrelated Code Rx pages.

## 11. Known limits

* A founding identity gains nothing until PHANTOM grants it — that is the requested behaviour, and the workspace says so in plain language rather than leaving the operator to guess.
* Client downloading is still gated by the unbuilt watermark pipeline; the capability layer only decides *who* may act, never *what a client receives*.
* The permission panel paginates by member; with a large member list the recent-changes feed shows the latest 25 entries by design.
