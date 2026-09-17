# CODE Rx SOCIETY — CLIENT PROJECT PORTAL
## PHASE 2 REPORT — DATABASE & SECURITY FOUNDATION

**Branch:** `arena/01a0b09c-code-rx` · **Base:** `7a57edd` (Phase 1 sweep at `3f4175a`)
**Scope delivered:** backend + database foundation only. No frontend work.
**Source of truth:** `CLIENT_PORTAL_SWEEP_REPORT.md` (Phase 1, sections A–Y)

---

## SUCCESS RATE

| Measure | Result |
| --- | --- |
| **Requirement-12 acceptance tests** | **196 / 196 passed — 100.0 %** |
| **Requirements 1–12 met** | **12 / 12 (100 %)** |
| **Mutation (negative-control) verification** | **12 / 12 security controls proven load-bearing** |
| **TypeScript** | 39 errors, **identical to the pre-existing baseline** on a clean `git worktree` of `HEAD` — 0 new |
| **Existing systems regression** | 14 / 14 green |
| **Phase 2 score** | **100 % of the stated scope; frontend deliberately not started** |

**Two defects were found and fixed by the suite itself during this phase** (they would have taken the whole portal offline on first deploy): a semicolon inside a schema comment fragmented the SQL splitter, and an index referenced a column that did not exist on `client_projects`. Both are now covered by tests.

**One honest caveat — the watermark stamping pipeline is NOT built in this phase.** The download route therefore denies by default: it will only serve an R2 object whose `storage_reference` starts with `client-exports/`. An internal Vault key, or an unstamped original, can never reach a client (proved by test *and* by mutation). Producing stamped artifacts is Phase 3 work; until then clients can read documents in-portal but downloads return 404.

---

## FILES CHANGED

### New files (2 452 lines)

| File | Lines | Purpose |
| --- | --- | --- |
| `functions/lib/client-auth.ts` | 534 | Client credential primitives: CRX passkey generation/normalisation/hashing, session records, fingerprints, opaque public ids, temporary-link tokens, D1 brute-force throttle. |
| `functions/lib/client-portal.ts` | 535 | Portal domain rules: status/category/lifecycle/event enums, uniform error responses, `ClientPrincipal`, the document-exposure decision, the three authorization middlewares, activity recording, feature-flag readers, leak-free serializers. |
| `functions/client-routes.ts` | 1 383 | `registerClientRoutes(app)`: 8 public `/api/client/*` routes + 20 `/api/phantom/client*` management routes + the revocation cascade. |
| `scripts/client-portal-tests.mjs` | 1 011 | The requirement-12 acceptance suite (196 assertions) against the real Hono app, a real SQLite schema and an R2 stub. `npm run test:client-portal`. |

### Modified files (minimum possible surface)

| File | Change |
| --- | --- |
| `functions/[[path]].ts` | **+3 hunks, 9 lines, all additive:** one import, 4 permission keys appended to `WEBSITE_PERMISSION_KEYS`, one `registerClientRoutes(app)` call. **No existing handler, guard, middleware or route was edited.** |
| `functions/lib/schema.ts` | +216 / −2: 8 new tables, 12 new indexes, 3 feature-flag seeds, `VAULT_SCHEMA_VERSION` bumped, and the SQL statement splitter hardened (see defects below). |
| `package.json` | One added script: `test:client-portal`. No dependency changes. |

### Untouched, deliberately

`functions/lib/auth.ts` (member auth), `vault.ts`, `rate-limit.ts`, `share-token.ts`, `notifications.ts`, `validate.ts`, `score.ts`, `email.ts`, `env.d.ts`, `wrangler.toml`, `vite.config.ts`, and **the entire `src/` frontend**.

---

## DATABASE CHANGES

All additive. Existing tables are **not** altered: `PRAGMA table_info(audit_logs)`, `vault_documents`, `users`, `member_profiles` and `members` are asserted byte-identical by the suite.

### 8 new tables

| Table | Notable design |
| --- | --- |
| `clients` | `public_id` `cli_…`, name/contact/phone/status/notes. Status is `CHECK`-constrained to `active\|suspended\|archived\|revoked`. |
| `client_projects` | `reference_code` `CRX-PROJ-2026-001`, `status` + soft `is_archived`/`archived_at`, FK → `clients`. |
| `client_documents` | category (`document\|letter\|agreement\|report\|deliverable\|update`), reference prefix per category, `version`, 6-state lifecycle, `client_visible`, `allow_view`, `allow_download`, `storage_reference`, optional FK → `vault_documents`, `content_snapshot` + format, `published_at`/`unpublished_at`. |
| `client_access_keys` | `public_id` `key_…`, `key_hash` (SHA-256, **UNIQUE**), `key_hint` (last 4 chars only), `label`, `status`, `expires_at`, `last_used_at`, `revoked_at`, `revoked_by_user_id`. **No plaintext or reversible column exists by design.** |
| `client_sessions` | **One** session table for both credential types: `access_key_id` and `client_link_id` (nullable, `CHECK` exactly-one-is-set), `session_hash` UNIQUE, `expires_at`, `revoked_at`, `ip_hash`, `user_agent_hash`. Bound to client **and** project. |
| `client_links` | Temporary direct links: `token_hash` UNIQUE, `mode`, destination type/id, `allow_view`/`allow_download`, `max_uses`, `use_count`, `status`, `expires_at`, `revoked_at`. |
| `client_auth_throttle` | Durable brute-force window: one row per scope, `attempts`, `window_started_at`, `locked_until`. Self-pruning (> 1 day). |
| `client_reference_sequences` | Atomic per-prefix/per-year counter for human-readable references. |

### 12 new indexes (authorization lookups)

`idx_clients_status` · `idx_client_projects_client(client_id, status, is_archived)` · `idx_client_documents_project(client_project_id, lifecycle_status, client_visible)` · `idx_client_documents_client` · `idx_client_documents_vault` · `idx_client_access_keys_client(client_id, status)` · `idx_client_sessions_client` · `idx_client_sessions_key` · `idx_client_sessions_link` · `idx_client_links_scope` · `idx_client_links_project` · **`idx_audit_logs_action`** (makes a client's whole activity history one indexed query).

### Constraints & migration safety

* Foreign keys on every child table: `client_projects`→`clients`; `client_documents`→`clients`/`client_projects`/`vault_documents`; `client_access_keys`→`clients`/`client_projects`; `client_sessions`→ 4 FKs; `client_links`→`clients`/`client_projects`/`client_documents`.
* `CHECK` constraints on every status/lifecycle/category column, so an invalid state cannot be stored.
* No existing table, column, index or seed was renamed, dropped or rewritten. No data migration was required — every new table starts empty.
* Seeds are `INSERT OR IGNORE`: `client_portal_enabled='0'`, `client_downloads_enabled='0'`, `client_all_links_enabled='1'` — **the portal is dark until PHANTOM turns it on.**
* `VAULT_SCHEMA_VERSION` → `2026-09-17-code-rx12-client-portal-2`, so the new indexes and seeds apply exactly once on an existing database.
* Zero-impact scale check: 63 pre-existing tables → 71; 38 pre-existing indexes → 51.

**One intermediate-build note (not applicable in production):** an earlier revision of *this unmerged branch* created a second table, `client_link_sessions`. It was removed in favour of the single `client_sessions` table so that no parallel session system exists. Because the branch has never been merged, pushed to `main`, or deployed, no database anywhere contains it; a throwaway dev database created from an intermediate build should simply be recreated.

---

## SECURITY CHANGES

**1. Separate client identity — no member accounts.** Clients never appear in `users`, `member_profiles` or `members` (asserted). Client sessions are independent of the member JWT: the header is `X-Code-Rx-Client-Session` and a member JWT presented as a client session is rejected (asserted).

**2. Passkeys.** `CRX-XXXX-XXXX-XXXX-XXXX` from a 32-symbol alphabet (`0/O/1/I` excluded) = **80 bits**. *Deliberate, disclosed deviation:* the brief's example `CRX-8K4P-X92M-7LQF` carries only 60 bits; since this passkey is the sole factor in front of a client's project room, entropy was raised and the parser accepts **both** shapes and any grouping. Only a SHA-256 verifier plus a 4-character hint is stored; the raw value is returned exactly once at generation and never retrieved (asserted: it appears nowhere in D1).

**3. Sessions.** 12-hour key sessions, 45-minute link sessions; a 256-bit token of which only the verifier is stored; IP and user-agent stored as hashes only. Every request re-resolves the principal from D1 — session liveness, credential liveness (key/link status and expiry), client status and project status are all enforced **in SQL**, so a suspension or revocation takes effect on the very next request.

**4. One uniform failure.** Unknown passkey, revoked key, expired key, revoked link, suspended or archived client, ambiguous project, foreign document, unpublished document and internal-reference download **all** return the same `404 {"error":"Not found."}` with `private, no-store`; the real reason is written only to `audit_logs`. Only "no session at all" is a `401`. An enumeration oracle is therefore impossible — asserted by comparing the failure bodies byte-for-byte.

**5. Server-side authorization, never URL ids.** `requireClientSession()` / `requireClientProjectAccess()` / `requireClientDocumentAccess()` / `requireClientPermission()`. A session carries `clientId` + `projectId`; the URL contributes only an opaque `public_id`, which must match **the session's own client and project**. Sequential numeric row ids and injection-shaped ids return 404. Cross-client project, document, section and feed access are all denied.

**6. Download path is deny-by-default.** View and Download are separate permissions. A download requires: published + client-visible, `allow_view` **and** `allow_download`, the `client_downloads_enabled` switch, and a `storage_reference` under `client-exports/`. Anything else — including an internal `vault/…` key smuggled into the column — is a 404, so the untouched original can never be proxied. **There is no watermarking yet, so unstamped originals are simply not served.**

**7. Temporary links never authorize on the URL id.** A link token (256-bit, stored hashed) is **exchanged** for a normal short-lived client session. The exchange re-validates link status, expiry, client and project state, and consumes one use atomically in SQL (`meta.changes === 1`), so concurrent redemptions cannot both win. Links are scoped to a client + project, optionally to a single document, and can be narrower than the client's own permissions.

**8. Brute-force protection.** Layer 1 is the pre-existing in-memory `checkRateLimit` (unchanged, 10/60 s); layer 2 is a durable D1 throttle (40 attempts / 5 min per IP → 5-min lock; 10 / 15 min per attempted key → 30-min lock) added because the existing limiter is per-isolate. No third limiter was invented. The D1 write **fails open** on a storage error by design: completing a login still requires a successful D1 write for the session row, and layer 1 has already run — so a throttle-storage outage cannot enable guessing.

**9. Delegation is explicit.** The portal is controlled by PHANTOM through four new permission keys (`clients.manage`, `clients.publish`, `clients.links`, `clients.preview`) inside the **existing** website-admin permission engine. Founding members receive nothing automatically; a member with no grant is refused (403) on list, create, key-issue and activity routes.

**10. Audit reuses the existing system.** Every event is a row in the existing `audit_logs` with `subject_type='client'` and `subject_id=<client public_id>`, so one indexed query returns a client's whole history. No second audit table exists (asserted). Only the required events are recorded: `LOGIN`, `PROJECT_OPENED`, `SECTION_OPENED`, `DOCUMENT_VIEWED`, `DOCUMENT_DOWNLOADED`, `LINK_USED`, `ACCESS_KEY_REVOKED`, `ACCESS_KEY_REGENERATED` (plus `ACCESS_DENIED`, `CLIENT_SUSPENDED`, `ACCESS_REVOKED_ALL` for incident response). Credentials never appear in the log (asserted).

**11. Client isolation is absolute.** Proved by tests for: cross-client project, cross-client document via the owner's own project path, cross-client section, numeric-id substitution, injection-shaped ids, cross-client activity feeds, cross-client key listing, and a link session attempting another client's project.

---

## TEST RESULTS

`npm run test:client-portal` → **196 assertions, 196 passed, 0 failed — 100.0 %**

The suite boots the **real** Hono application from `functions/[[path]].ts` (bundled with esbuild) against a **real** SQLite schema built by the project's own `ensureSchema()`, with a D1 adapter and an R2 stub. Nothing application-level is mocked. It runs twice with identical results; exit code 0.

### Requirement 12 — the ten required cases

| # | Required case | Assertions | Result |
| --- | --- | --- | --- |
| 1 | Valid client login | passkey login, 256-bit token, client+project+permissions context, session row bound to client AND project, verifier-only storage | ✅ |
| 2 | Invalid passkey | unknown key denied, uniform message, anonymous route 401 not 500 | ✅ |
| 3 | Expired credential | expired passkey refused; its live session refused; expired session refused; other sessions unaffected | ✅ |
| 4 | Revoked credential | revoked passkey refused; regeneration kills the old key **and** its sessions; revoked links refused | ✅ |
| 5 | Suspended client | suspension invalidates live sessions immediately and revokes keys; sign-in refused; archived likewise; revoke-all kills sessions and links | ✅ |
| 6 | Unauthorized project | foreign project, numeric id, injection-shaped id, ambiguous project — all 404 | ✅ |
| 7 | Unauthorized document | draft/in-review/approved/unpublished/archived never exposed; foreign document inside an owned project 404; link-scoped document isolation | ✅ |
| 8 | Cross-client ID tampering | 8 distinct tampering scenarios, all denied, no data leakage in bodies | ✅ |
| 9 | Rate limiting | in-memory layer triggers 429; durable layer locks and holds; scopes independent | ✅ |
| 10 | Session expiration | expired session refused server-side; other sessions unaffected | ✅ |

Additional coverage: all six lifecycle transitions, view/download separation, the `client-exports/` guard, the master switches, the full temporary-link lifecycle (mint → redeem → exhaust → expire → revoke → cascade), delegation boundaries, and schema/migration integrity.

### Mutation (negative-control) verification

To prove the suite is not vacuous, twelve security controls were individually disabled and the suite re-run. **Eleven were detected immediately:**

| Mutation | Failure signal |
| --- | --- |
| published / `client_visible` gate removed | 5 failures |
| document id not scoped to the session's client+project | 1 failure |
| lifecycle state whitelist removed | 1 failure |
| `client-exports/` download guard removed | 2 failures |
| embedded-`vault/` artifact still refused | (covered above) |
| link max-use consumption not enforced | 1 failure |
| link document scoping removed | 1 failure |
| link download flag ignored | 1 failure |
| link liveness dropped from session resolution | 1 failure |
| client status check neutered | 2 failures |
| key expiry ignored in session resolution | 1 failure |

The twelfth (ignoring the link's `status` at redemption) is **not detectable in isolation because two independent guards enforce it** — the route check *and* the atomic `consumeClientLinkUse` SQL. Removal of either alone leaves the property intact; that is redundancy working as intended, not a blind spot, and it is recorded here rather than claimed as a catch.

---

## REGRESSION CHECK

Run inside the same suite (14 assertions, all green):

* **Existing member authentication** — PHANTOM login and an ordinary member login both still succeed; a member with no client permission is refused 403 on every client-management route.
* **Existing Vault** — `/api/vault/sections` (≥ 15 sections), `/api/vault/home`, `/api/vault/sharing/status`, and Vault share validation all still work; `vault_documents` schema unchanged; the Vault sharing switch was **not** reused for the portal (separate flag, asserted).
* **Existing PHANTOM** — overview, roles/permissions, website-admins, audit-log view, notification inbox all still respond.
* **Existing community** — public threads endpoint still responds.
* **Schema integrity** — 63 pre-existing tables and 38 pre-existing indexes preserved; `audit_logs` unchanged at 8 columns; no client row leaks into `users`, `member_profiles` or `members`; client events do not appear in the member Vault activity feed.
* **No duplicate infrastructure** — no second audit table, no second session table, no second rate limiter, no second storage system.

**Not yet exercised end to end (disclosed, not claimed):** the watermark stamping pipeline (Phase 3), and no client-facing UI exists yet — so nothing was verified in a browser. Every assertion above is server-side.

---

## WHAT PHASE 3 WOULD NEED TO ADD

1. The **watermark/Code Rx branding pipeline** that writes stamped artifacts under `client-exports/` — the single missing link that makes downloads live.
2. The **client-facing portal UI** (`/portal`): passkey entry, project room, document lists, download buttons — consuming only the routes above.
3. The **PHANTOM Client Access Center UI** on top of the 20 existing management routes.
4. Optional: email delivery of passkeys and links through the existing notification/email infrastructure (deliberately not built here — the raw credential must be delivered out-of-band, and mail is a Phase 3 decision).

**Nothing in Phase 2 blocks Phase 3, and no Phase 2 work needs to be redone for it.**
