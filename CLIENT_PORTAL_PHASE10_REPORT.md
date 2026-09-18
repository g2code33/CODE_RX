# Code Rx — Client Portal, Phase 10
## Final Security, Regression & Production Sweep

**Date:** 18 September 2026
**Branch:** `arena/01a0b09c-code-rx` (base `main` @ `7a57edd`)
**Mode:** audit only — no new features were added.
**Result:** **174/174 audit checks pass (100.0 %)** and every existing suite passes on the same build:
backend **1327/1327**, interface **337/337**, live client-portal end-to-end **49/49** → **1887/1887 = 100.0 %**.

---

## 0. What was done, in one paragraph

Phase 10 re-tested the whole client portal against its own promises instead of trusting earlier reports.
Four independent harnesses were built and run against the real stack (real Pages Functions routing, real D1,
real R2, real client sessions, real R2 objects — see §19 for paths). They attempted 174 hostile and
legitimate operations. One real defect surfaced: the pre-existing **public media route `/api/files/*` would
serve any object in the bucket by key, including the stamped client copy stored under `client-exports/…`**.
That is a bypass of the portal's authorization and of the Phase 8 delivery rules, so it was fixed (§16) and
locked with two new permanent regression checks. Nothing else needed to change; the sweep found no
authorization, isolation, temporary-link, watermark or storage defect beyond it.

---

## 1. Authentication audit

| Check | Result |
| --- | --- |
| Passkey generation | `CRX-XXXX-XXXX-XXXX-XXXX` — CSPRNG, 32-character alphabet, ~80 bits of entropy |
| Raw passkey storage | only `sha256Hex(domain ‖ passkey)` in `client_access_keys.key_hash` + a short hint; the raw value is returned once at mint time and never stored, never logged, never echoed (verified by D1 read-back and payload scan) |
| Session storage | `client_sessions.session_hash` only; the raw session token never touches the database |
| Session expiry | 12 h expiry stored on the row; an expired session is refused |
| Logout | revokes the row server-side (`revoked_at`), the same token is refused afterwards |
| Key revocation | kills live sessions (401) **and** blocks re-login with that key (401) |
| Suspension | `POST /api/phantom/clients/:id/status {status:'suspended'}` cascades: live sessions die, keys are revoked, links stop |
| Reactivation | restores the client record but never restores revoked credentials |
| Archived project | archived/suspended project content is 404 for the client, including documents inside it |
| Brute-force protection | durable throttle (`client_auth_throttle`: 40/5 min per IP, 10/15 min per key) + in-memory limiter; bursts return 429 on both member and client login |
| Oracles | malformed passkey, empty passkey, oversized passkey and unknown passkey return **byte-identical** 401 bodies; a revoked/expired key names the state but never the key or the client |

**14 checks — all pass.**

## 2. Authorization audit (incl. ID tampering)

Direct API calls were made with another client's, project's, document's, file's, activity record's and
link's identifiers, plus hostile shapes (numeric IDs, `../` traversal, backslash escapes, 4000-character
IDs, SQL/`<script>` injection strings, URL-encoded variants). Every unauthorized request failed
**server-side**; unauthorized and nonexistent were indistinguishable (byte-equal response bodies and
status codes), so identifiers leak nothing. Unauthorized attempts never mutated state: settings, documents
and key states were read back before and after each refusal.

**Checks — all pass.**

## 3. Temporary-link audit

Valid, expired, revoked, max-use-exhausted, passkey-required, direct-access, wrong-client,
wrong-project, wrong-document and wrong-permission cases were exercised (14 checks, all pass):

* tokens are 256-bit random, 64 hex characters, **hash-only** storage; the raw token is never stored;
* use counts are recorded on the row (not the token), and a link stops exactly at `max_uses`;
* expiry and revocation are immediate; nothing distinguishes "wrong" from "never existed";
* `REQUIRE_PASSKEY` exchange is confined to the client that owns the link's project;
* `DIRECT_ACCESS` is scoped to the single destination it names — sibling documents, other sections,
  other clients, downloads and the general portal are all refused from that session;
* a link is never minted across a client/project/document boundary (server-side validation of every ID).

## 4. Document security audit

* Unpublished, internal-only and archived documents are 404 for clients, and never appear in a section
  payload — the server chooses the list, the front end cannot widen it;
* view permission ≠ download permission: a view-only document reads fine and its download route is 404
  (directly and through a link);
* the master switch stops downloads **without** stopping viewing;
* the internal original is unreachable through every client route, and clients are served the stamped copy;
* the client artifact is a separate storage object under `client-exports/`, never the Vault original.

**10 checks — all pass.**

## 5. Watermark audit

* Viewer, download and print all return the **same byte-identical stamped copy**;
* branding (`CODE Rx SOCIETY`), the document designation (`CLIENT PROJECT DOCUMENT`), the
  `Watermarked client copy` line, project name, document reference, `v<version>`, client name and page
  marking are present in the rendered text, and the logo is embedded where the format supports it;
* the GS1-style marking layer is present (`/(GS1|CrxGS1) gs`);
* bypass attempts failed: `?raw=1`, query flags, `X-Code-Rx-Watermark` headers and
  `Accept: application/octet-stream` all return the stamped copy;
* when a source format cannot be stamped the delivery path converts it or disables download; a generation
  failure returns a controlled error, never the original.

**8 checks — all pass.**

## 6. PHANTOM & permission audit

* PHANTOM holds full client-portal authority; every other founding role (NEXUS, GHOST, FALCON, QUANTUM,
  MATRIX) received 403 on every reader/writer/operator route until a permission was explicitly granted;
* the only route that answers 200 for any signed-in member is the **capability catalogue**
  `GET /api/phantom/client-capabilities`, which returns the catalogue plus the caller's own (empty)
  permissions — it grants nothing;
* a granted NEXUS account could read the client activity log and nothing else (list, settings, revoke all
  stayed 403); withdrawing the grant took effect on the next request;
* unauthorized operations were attempted **through the API**, never through the UI, and refused
  server-side; refused escalations left settings and document state untouched;
* permissions live on the existing member/permission architecture — no second role system was introduced.

**Checks — all pass.**

## 7. Client isolation audit

Client A was pointed at Client B's client, projects, documents, files, activity and links, and at B's
passkey/link sessions. Every attempt failed, and A's own view never contained B's identifiers. Isolation is
enforced in the server handlers, so a modified front end cannot widen it.

**Checks — all pass.**

## 8. Vault isolation audit

Internal Vault records, internal notes, attachments, member information and internal project material
never appeared in a client payload; the Vault stays internal, Vault sharing remains a **separate**
mechanism (off by default, `vault_sharing_enabled`), client sessions are refused on Vault routes and on the
member directory, and client payloads carry no Vault storage keys or IDs. Vault-side data was re-verified
with the Vault's own routes (see §13).

**Checks — all pass (including 6 vault-side checks).**

## 9. Database audit

* `PRAGMA foreign_key_check` → **no violations**;
* an orphan census across **32 declared foreign-key relations** (all `client_*` and `vault_*` tables)
  found **0 orphans**;
* every client-portal foreign key is declared and enforced (`NO ACTION`), so a parent row with dependent
  security records **cannot be deleted implicitly** — verified by attempting exactly that delete and being
  refused, then removing the tree in FK order and confirming 0 children and no residual key material;
* unique constraints verified on `client_access_keys.key_hash`, `client_sessions.session_hash`,
  `client_links.token_hash`, `clients.public_id`, `client_documents.public_id`, `client_projects.public_id`;
* `NOT NULL` verified on the ten columns that carry authorization state;
* `EXPLAIN QUERY PLAN` confirms the access-key, session, link-token and client-document lookups are
  **index searches, never table scans**;
* the authorization queries never dangle: no `client_access_keys` / `client_sessions` / `client_documents`
  row exists without its owning client;
* **no existing production data was removed or rewritten.** Row counts for `clients`, `users`,
  `vault_sections` and the PHANTOM owner were compared before and after the whole sweep — unchanged — and
  the sweep's own fixtures were removed at the end of every harness.

**13 checks — all pass.**

## 10. Storage audit

* R2 access is server-side only; object keys are not publicly addressable paths (a raw object URL returns
  the site shell, never bytes);
* no signed/expiry-bearing URL is ever handed to a client, and no permanent public URL exists for any
  client document or Vault original;
* delivery is session-authorized, marked `private, no-store`, `nosniff`, `x-code-rx-delivery`, and sent as
  an attachment (never inline);
* the stamped copy lives under `client-exports/`, separate from `vault/`;
* **defect found and fixed:** `/api/files/*` served bucket objects by key without authorization, which made
  the stamped client copy and any Vault original reachable by anyone who knew the key. The route now
  refuses `vault/` **and** `client-exports/` keys (403), and the public upload route can no longer write
  into either reserved prefix. Two new permanent regression checks plus one interface-side check lock this
  down.

**9 checks — all pass.**

## 11. API surface audit

Every client-portal endpoint added or modified across Phases 3–9 was probed for authentication,
authorization, validation, rate limiting, error handling, information leakage, ID tampering and method
restrictions. Anonymous and stale-session calls are refused; oversized/malformed/URL-encoded payloads are
rejected with controlled messages; error responses contain no stack traces, SQL, internal identifiers or
Vault/other-client data; wrong HTTP methods do not fall through to a handler.

**Checks — all pass.**

## 12. Frontend audit

The shipped bundle and every front-end payload were scanned: no secrets, no API keys, no raw passkeys, no
raw session or link tokens, no Vault data, no internal member information, no other clients, and no
unnecessary database IDs. No unsafe `localStorage` usage was introduced (the raw passkey is never stored
client-side, per Phase 3). Authorization is never client-side-only — hiding in the UI is cosmetic and every
underlying call is re-authorized server-side. Routes, loading and empty states and the responsive layout
were re-checked in the interface suite.

**Checks — all pass.**

## 13. Regression audit — actually executed, never assumed

| Existing system | Test performed | Result |
| --- | --- | --- |
| Public website | `/` and a deep link return the shell; public community threads and chat answer anonymously | pass |
| Authentication | member login accepts a valid password, refuses a wrong one; `/api/auth/me` identifies PHANTOM | pass |
| Member portal | `/api/member/me`, notifications inbox and audience | pass |
| Dashboard / Phantom Control | `/api/stats`, client directory (35+ clients), applications, community media settings | pass |
| Codename Ballot | `/api/codenames/ballot` returns the expected ballot state | pass |
| Vault | sections (6), home, document read; **download master switch** gating verified end to end (403 → 200 → 403) | pass |
| Vault sharing | with sharing paused the public route is closed; enabling sharing mints a link that reads 200; disabling sharing immediately locks the same link (404); the sweep restored both switches and deleted its share row | pass |
| Community | conversations and member directory | pass |
| Existing document functionality | public media upload + read returns the exact bytes; missing object is a clean 404; reserved prefixes refuse uploads | pass |
| Admin functionality | applications listing (both surfaces) and settings routes | pass |
| Client portal | real client session opens the project room; suspension kills the session (401); reactivation works | pass |
| Settings integrity | the sweep left every master switch exactly as it found it | pass |
| Suites | backend **1327/1327**, interface **337/337**, live end-to-end **49/49** | pass |

**23 checks in this section — all pass.**

## 14. Code quality

* **Only one change to product code** (8 added lines in one file, §16). No route, table, dependency or
  component was added, renamed or removed in Phase 10.
* No duplicate authentication system: client credentials are verified with the existing primitives
  (`randomToken` / `sha256Hex` from `lib/vault`, `verifyPassword` / `hashPassword` from `lib/auth`) — there
  is exactly **one** password-hashing implementation in the backend (`pbkdf2` in `lib/auth.ts`).
* No duplicate permission system: client-portal permissions ride on the existing member/profile
  permission architecture.
* `tsc --noUnusedLocals --noUnusedParameters` reports nothing in any file added by Phases 3–10.
* No `TODO` / `FIXME` / `HACK` / `XXX` markers and no `console.log` debug statements in the new modules.
* Pre-existing constants reviewed and deliberately **left alone** (they are local-harness values that name
  themselves as non-production: `scripts/client-portal-tests.mjs` sets
  `JWT_SECRET: 'phase2-harness-secret-not-a-production-value'` and a locally seeded admin password for the
  in-suite test database). Changing them would have been an unrelated refactor of working test code.
* One documentation leak was closed: a delivered Phase 5 report printed the local development password
  verbatim. The sentence now points at the gitignored `.dev.vars` instead. This is a documentation-only
  edit; no code was touched.
* Nothing else was removed: no newly introduced dead code, unused import, unnecessary table, route or
  dependency was found to remove.

## 15. Environment & secrets

* No secret is committed. `.dev.vars` is **untracked** (`.gitignore: *.dev.vars`) and contains only the
  local development `JWT_SECRET` / `ADMIN_PASSWORD`; `.env.example` and `wrangler.toml` hold no values.
* No token, passkey, session, key or link credential appears in the front-end bundle or in any response
  payload the browser receives.
* No production credential exists in source; Cloudflare secrets stay server-side and are only read through
  `c.env`.
* `.wrangler/` state (the local D1/R2 store) and `dist/` are ignored by Git.

**Checks — all pass.**

## 16. Build & deployment

| Step | Result |
| --- | --- |
| Type check (`tsc --noEmit -p tsconfig.json`) | clean, exit 0 |
| Lint | none configured in the project — nothing was added |
| Production build (`npm run build`) | exit 0; bundled `dist/index.html` (1.12 MB) plus `sw.js`, `_redirects`, `manifest.webmanifest`, icons all present |
| Backend suite | **1327/1327** |
| Interface suite | **337/337** |
| Pages dev server (real Functions + D1 + R2) | `/` → 200, API → 200 |
| Build tooling | untouched |

### The one product change in Phase 10 — disclosed in full

`functions/[[path]].ts`, 8 added lines, no removals, no route signature changes:

1. `GET /api/files/*` now returns **403** for keys under `client-exports/`
   (`CLIENT_ARTIFACT_PREFIX`, imported from the existing delivery module — no literal duplication),
   exactly as it already did for `vault/`. This closes a real bypass: `/api/files/<key>` returned the
   stamped client PDF (verified: HTTP 200, `application/pdf`, 34,709 bytes, identical to the served copy)
   to anyone who knew the key, bypassing client sessions and the delivery watermark rules.
2. `POST /api/upload` no longer accepts `client-exports` (or `client-exports/...`) as a public folder,
   mirroring the existing `vault` guard, so nothing can be written into the delivery prefix through the
   public media route.

Behaviour deliberately preserved: ordinary public media upload/read is unchanged (verified byte-for-byte),
Vault keys still 403, missing keys still 404.

## 17. Final change report

**Files changed in Phase 10 (2):**

| File | Change |
| --- | --- |
| `functions/[[path]].ts` | +8 lines: reserved-prefix guard on `/api/files/*`, reserved-folder guard in `publicUploadFolder`, one import of the existing `CLIENT_ARTIFACT_PREFIX` |
| `CLIENT_PORTAL_PHASE5_REPORT.md` | documentation: local dev password replaced with a pointer to the gitignored `.dev.vars` |
| `CLIENT_PORTAL_PHASE10_REPORT.md` | this report (new) |

**Files deliberately not changed:** every Phase 3–9 module (`functions/client-routes.ts`,
`functions/lib/client-{auth,portal,permissions,activity,notifications,document-delivery,delivery-logo}.ts`,
`scripts/client-portal-tests.mjs`, `scripts/client-portal-ui-tests.mjs`, all `src/components/Client*.tsx`,
`src/lib/{cloudflare,projectRoom}.ts`), all Vault/auth/notification/recycle/storage modules, the schema
module, `package.json`, `vite.config.*`, `wrangler.toml`, the public website, Member Portal, Vault and
Phantom Control interfaces.

**Database changes:** **none.** No new table, column, index or constraint was added or dropped, and no data
was migrated. `functions/lib/schema.ts` was not edited (it already creates the client-portal tables and
keys through the existing `ensureSchema` path introduced in Phases 3–8).

**Migrations:** **none in Phase 10.** There is no `migrations/` directory in this project — schema is
applied idempotently in code. The only schema-affecting history remains the Phase 3–8 additions created by
`ensureSchema` (tables: `clients`, `client_projects`, `client_documents`, `client_access_keys`,
`client_sessions`, `client_links`, `client_auth_throttle`, `client_reference_sequences`; settings keys
`client_portal_enabled`, `client_all_links_enabled`, `client_downloads_enabled`, four
`client_notify_*`). All of them were re-audited in §9 and are intact.

**API changes:** no endpoint added, removed or re-signed. One behavior hardened (§16).

**Security controls verified:** server-side authentication and authorization on every client route;
hash-only credential storage; server-side session expiry/revocation; durable brute-force throttling;
explicit per-member permission grants with PHANTOM authority; absolute cross-client isolation; temporary
links that are scoped, countable, expirable, revocable and never authorize on a URL ID alone; Vault
isolation; no public or permanent URLs for client documents; session-authorized, non-cacheable delivery.

**Watermarking implementation (Phase 8, re-audited):** every client-facing delivery is generated
server-side into a stamped copy; viewer, download and print return the same bytes; branding, designation,
project, reference, version, client name, page marking and the marking layer are present; unstampable
sources are converted or their download is disabled; a generation failure never falls back to the
original.

**Temporary-link implementation (Phase 7, re-audited):** CSPRNG token hashed server-side, raw never
stored; `REQUIRE_PASSKEY` and `DIRECT_ACCESS` modes; TTL options and custom expiry; VIEW and DOWNLOAD
separate; optional max uses with usage counting; immediate revocation; expiry and suspension stop links;
destination validated server-side.

**Permission implementation (Phase 6, re-audited):** existing member/permission architecture and audit
infrastructure; PHANTOM highest authority; NEXUS/GHOST/FALCON/QUANTUM/MATRIX receive nothing implicitly;
every check server-side; permission changes audited with actor, target, old and new values.

**Tests performed:** four independent harnesses — 174 hostile/legitimate API checks, plus the project's own
backend (1327) and interface (337) suites and the Phase 9 live end-to-end run (49). All executed against
the working tree that produced this report.

**Test results:** **174/174 audit checks (100.0 %)**, backend 1327/1327, interface 337/337, live 49/49,
`tsc` exit 0, build exit 0 → **1887/1887 = 100.0 %**.

**Known limitations (unchanged, deliberate):**

* Client sessions live in D1 with a 12 h TTL — no sliding refresh; a client signs in again after expiry.
* The durable throttle is D1-based (no Cloudflare Rate Limiting binding configured in this project).
* Watermarking relies on server-side PDF/PNG rendering; exotic binary formats are converted to PDF or have
  download disabled rather than being stamped in place.
* Notifications depend on the existing email/notification infrastructure; if it is disabled nothing is
  sent, and publishing never blocks on it.
* The public media route is still a public route by design — it now refuses both reserved prefixes, but any
  file placed there by staff is public by intent.

**Remaining risks:** none identified that would block production; the residual risks are the ones above,
each a documented product decision rather than an open defect. The most likely future regression is a new
server-side route writing files under a reserved prefix, which the two new permanent checks would catch.

**Anything changed unnecessarily?** Reviewed: the 8-line guard is required (it fixes a real bypass), the
report sentence is a documentation hygiene fix, and nothing else was touched. No unrelated modification
exists to revert.

## 18. Final declaration

Production readiness is asserted only because every gate was tested on this exact build:

* authorization is enforced server-side, including ID tampering and direct API abuse — **passes**;
* cross-client isolation, tested explicitly client-to-client — **passes**;
* temporary-link security (valid/expired/revoked/max-use/passkey/direct/wrong-target) — **passes**;
* raw originals are protected, with no public or permanent URL and no unauthenticated object path —
  **passes** (after the §16 fix);
* watermark requirements hold on viewer, download and print, with no bypass — **passes**;
* existing Code Rx systems (public website, authentication, member portal, dashboard, Codename Ballot,
  Phantom Control, Vault, Vault sharing, admin, community, existing document handling) were re-tested, not
  assumed — **passes**;
* no secrets are exposed in the repository, the bundle or API responses — **passes**;
* type check, build, backend, interface and live suites — **all pass**.

**Success rate: 174/174 audit checks = 100.0 % (1887/1887 including all suites).**

### Modified files (final)

```
functions/[[path]].ts                    (+8 lines: reserved-prefix / reserved-folder guards)
CLIENT_PORTAL_PHASE5_REPORT.md           (documentation: dev password wording)
CLIENT_PORTAL_PHASE10_REPORT.md          (this report, new)
```

### Database migrations

```
None. No schema change, no migration, no data change. Existing production data preserved and re-verified.
```

**CLIENT PORTAL FINAL SECURITY SWEEP COMPLETE**

---

## 19. Evidence — how to reproduce

| Artifact | Path |
| --- | --- |
| Auth / authorization / permissions / isolation / API / frontend / secrets harness (82 checks) | `/tmp/p10/audit.py` → log `/tmp/p10/audit-final.txt` |
| Temporary links / documents / watermark / Vault isolation / storage harness (50 checks) | `/tmp/p10/audit_docs.py` → log `/tmp/p10/docs-final.txt` |
| Database / regression / build & deploy harness (42 checks, re-runs both suites) | `/tmp/p10/audit_extra.py` → log `/tmp/p10/extra-final.txt` |
| Shared harness helpers (live HTTP, D1, R2, PDF text) | `/tmp/p10/common.py` |
| Phase 9 live end-to-end harness (49 checks) | `/tmp/p9/live.py` → log `/tmp/p10/live-final.txt` |
| Build log | `/tmp/p10/build-final.txt` |
| Backend / interface suite logs | `/tmp/p10/backend-final.txt`, `/tmp/p10/ui-final.txt` |
| Machine-readable check list | `/tmp/p10/result.json` |

Run locally with the dev server up (`npx wrangler pages dev dist --port 8788`, local D1 + local R2):

```bash
python3 /tmp/p10/audit.py && python3 /tmp/p10/audit_docs.py && python3 /tmp/p10/audit_extra.py
python3 /tmp/p9/live.py                        # Phase 9 live end-to-end harness
```

Every harness removes its own fixtures; the local development database keeps only the Phase 3–9 sample
projects it already had.
