# CLIENT PORTAL — PHASE 7 REPORT

**Phase:** 7 — *TEMPORARY PROJECT LINKS*
**Brief:** "Implement secure temporary client links."
**Branch:** `arena/01a0b09c-code-rx` · **Base:** `2541a48` (Phase 6) · **Date:** 2026-09-18

---

## 1. Headline result

| Verification | Checks | Passed | Failed | Success rate |
| --- | ---: | ---: | ---: | ---: |
| Backend suite — real Hono app on SQLite/D1 through the real routes | 1221 | 1221 | 0 | **100.0 %** |
| UI suite — real React components + the client-facing link rules | 268 | 268 | 0 | **100.0 %** |
| Live HTTP verification against the built Worker (`wrangler pages dev`) | 86 | 86 | 0 | **100.0 %** |
| **Total** | **1575** | **1575** | **0** | **100.0 %** |
| Mutation testing (one Phase 7 rule broken at a time) | 24 | 18 detected | 6 equivalent | **no rule went unguarded** (see §11) |
| TypeScript (`tsc --noEmit -p tsconfig.json`) | — | clean | — | — |
| Production build (`npm run build`) | — | clean | — | — |

Phase 7 added **168 backend checks** (groups 18–20) and **73 UI checks** (group 12), and repeated the link lifecycle against the built Worker.

---

## 2. The brief, requirement by requirement

| # | Requirement | Where it lives | Proof |
| --- | --- | --- | --- |
| 1 | **Destinations** — Project Room, Overview, Documents, Letters, Agreements, Reports, Deliverables, Updates, specific document, specific file | `CLIENT_LINK_DESTINATIONS` (`functions/lib/client-portal.ts`), `LINK_DESTINATIONS` (`src/lib/linkAccess.ts`), dialog destination grid | group 18 (10 destinations), UI group 12, live §1/§4 |
| 2 | **Access mode** — every link exactly one of `REQUIRE_PASSKEY` or `DIRECT_ACCESS` | `mode` column (existing `passkey`/`direct` CHECK), exposed in the brief's vocabulary via `linkAccessMode()` | group 18 (modes), live §2/§5 |
| 3 | **Token security** — CSPRNG token, hashed server-side, expiry, revocation, optional max uses, usage count, server-side destination validation, no raw tokens stored, never authorize on URL ids | `generateClientLinkToken` (32 CSPRNG bytes), `clientLinkHash` (SHA-256, domain-separated), `token_hash UNIQUE`, `consumeClientLinkUse`, `clientLinkScope` + the scope predicates | group 20 (token units), group 19 (lifecycle), live §7 |
| 4 | **Link settings** — 15 min, 1 h, 6 h, 24 h, 3 d, 7 d, custom; VIEW and DOWNLOAD; optional maximum uses | `CLIENT_LINK_TTL_PRESETS`, `CLIENT_LINK_MIN/MAX_TTL_MINUTES`, `resolveLinkMaxUses`, `allow_view`/`allow_download`, `destination_intent` | group 18/19/20, UI group 12, live §1/§6 |
| 5 | **Revocation** — immediate, revoked/expired links stop working, suspension invalidates links | `POST /api/phantom/client-links/:id/revoke` (link + its sessions), `expireClientLinks` + `sweepExpiredLinks`, suspend cascade `revokeClientLinks` | group 19, live §6 |
| 6 | **Direct access** — the token is the credential, no silent unrestricted session, minimum temporary authorization | redeem mints a link-bound session; every request re-validates the link row and the destination scope | group 18/19, group 20 (scope units), live §2/§3/§4 |
| 7 | **Expired / revoked UI** — "THIS LINK HAS EXPIRED" / "ACCESS REVOKED" + Contact Code Rx Society | `src/lib/linkAccess.ts` (`LINK_STATE_SCREENS`), `src/components/ClientLinkState.tsx` | UI group 12 (rendered), live §8 (served bundle) |
| 8 | **Activity** — LINK_CREATED, LINK_USED, LINK_EXPIRED, LINK_REVOKED through the existing activity infrastructure | `recordClientActivity` on create / redeem / passkey sign-in / sweep / revoke — same `audit_logs` table, no second log | groups 18/19, live §6/§7 |
| 9 | **Test** — valid, expired, revoked, max-use exceeded, wrong project, wrong document, cross-client tampering, direct access, passkey-required, view-only, download permission | groups 18–20 + UI group 12 + live run | §9 below |

---

## 3. The ten destinations

A destination is stored on the link row and validated server-side; the client can never widen it by editing the URL.

| Destination | Stored shape | What the session may reach |
| --- | --- | --- |
| `project` (Project Room) | `destination_type='project'` | The whole room: every section, every document the client may see |
| `overview` | `destination_type='overview'` | The Overview section only |
| `documents` … `updates` (6 sections) | `destination_type=<section>` | That section only (documents of that category) |
| `document` (specific document) | `destination_type='document'` + `destination_id=<public id>` | The room shell, but only that one document is listed and readable |
| `file` (specific file) | `destination_type='document'` + `destination_intent='file'` | The stamped client file only — the reader, the sections and the room root are all refused |

Adding `destination_intent` is the **only** schema change in Phase 7: one additive column with a `'view'` default, applied through the existing `SAFE_MIGRATIONS` path, so every link that already exists keeps exactly the meaning it had.

The room's own payload adapts to the destination: the section list and the "recently published" slice are computed from the destination, so a Letters link receives a room whose only section is Letters (`sections: ['letters']`, group 19 + live §4).

---

## 4. Access modes

* **DIRECT_ACCESS** — `POST /api/client/link/:token` validates the token by its verifier hash, re-checks status, window, client, project, uses, consumes one use atomically (`use_count < max_uses` inside the `UPDATE`), then mints a **link-bound** session (45-minute ceiling) whose scope comes from the stored row. The response carries the destination and the link's target summary — never another client's data.
* **REQUIRE_PASSKEY** — the same endpoint does **not** mint a session and does **not** consume a use; it answers `200 { requiresPasskey: true }` with no client, project or destination in the body. The passkey is still the credential: `POST /api/client/auth/login { passkey, linkToken }` validates the passkey, resolves the link server-side, requires `mode='passkey'`, requires the key's client to own the link, requires the link to be active and inside its window, consumes the use **after** the passkey was accepted, and then mints the scoped session. Any bad link is answered with its own state (`link_invalid`, `link_expired`, `link_revoked`, `link_exhausted`, `client_suspended`, `project_unavailable`) and **no session**.

A spent REQUIRE_PASSKEY link still shows the sign-in screen (so the client sees an explanation rather than a dead end) but the next sign-in is refused with `link_exhausted` — asserted in group 20 and live §5.

---

## 5. Token security, concretely

* **Generation** — 32 CSPRNG bytes, base64url, ≥ 43 characters.
* **Storage** — only `sha256("code-rx:client-link:" || token)` is stored. The check in group 20 asserts that no column of the stored row contains the raw token; the raw value exists only in the 201 response, once.
* **URL shape** — the client-facing path is `/#client-portal/link/<token>`. The fragment is never sent to the server as part of a page request, and `ClientPortal` strips it from the address bar as soon as it has been exchanged, so it does not linger in history or a bookmark.
* **Server-side destination validation** — the destination, permissions, window and uses are read from the `client_links` row on every request; the project/document ids in the URL are only ever used *after* the scope has authorised them.
* **Never URL ids alone** — mutating `clientLinkScope` so a link is treated as unrestricted fails **34 checks** (mutation M4); naming another document in the URL is refused in group 19 and live §4.

---

## 6. Link settings

| Setting | Values | Enforced |
| --- | --- | --- |
| Lifetime | 15 min, 1 h, 6 h, 24 h, 3 d, 7 d, or custom 5 min – 7 d | server (`CLIENT_LINK_TTL_PRESETS`, clamped + explicit 400 outside the window) |
| Permissions | VIEW, DOWNLOAD (independent; a file link is download-only by definition) | server (`allow_view`, `allow_download`, `destination_intent`) |
| Maximum uses | absent = unlimited (stored `NULL`), or 1–50 | server (`resolveLinkMaxUses`, SQL guard) + usage count on the row |

Existing values keep their meaning: `max_uses NULL` was already "no limit", and the Phase 5 API's `allowView`/`allowDownload` fields are unchanged.

---

## 7. Expiry, revocation and suspension

* **Revocation is immediate.** Revoking a link sets `status='revoked'`, revokes the sessions that link minted, records `client.link.revoked` in the member audit log and `LINK_REVOKED` in the client activity feed. Every session is re-validated on every request against the *live* link row, so even a session row that survived would stop working.
* **Expiry stops working.** `sweepExpiredLinks()` closes any window that has elapsed and records `LINK_EXPIRED` once per link; it runs when a link is redeemed and when the operator opens the links list, and the redeem path re-checks the window inline so a link is never usable between sweeps. The link list never shows a stale `active`.
* **Suspension invalidates links.** Suspending (or revoking all access for) a client runs the existing cascade, which now revokes the client's links and their sessions alongside keys and sessions.

---

## 8. The client-facing end states

`ClientLinkState` renders four professional dead ends, each with **Contact Code Rx Society** (the existing `coderxsociety@gmail.com` address):

| State | Headline | Wording |
| --- | --- | --- |
| expired | **THIS LINK HAS EXPIRED** | "expired links stop working immediately", plus the access-key route forward |
| revoked | **ACCESS REVOKED** | "withdrawn … can no longer be opened by anyone" |
| exhausted | THIS LINK HAS ALREADY BEEN USED | the limit is explained, not the error |
| invalid | THIS LINK IS NOT VALID | never confirms what the link was |

The screens contain no destination, no project name and no identifiers — the same rule the access screen follows. A `REQUIRE_PASSKEY` link shows a distinct sign-in heading ("SIGN IN TO CONTINUE") so the client knows why a link sent them to a key prompt.

---

## 9. The scenarios the brief names

| Scenario | Backend | UI | Live |
| --- | --- | --- | --- |
| Valid link | group 18/19 | group 12 | §2 |
| Expired link | group 19 (time-travelled window) + group 20 (sweep units) | group 12 (rendered screen) | §6 (D1-updated window) |
| Revoked link | group 19 | group 12 | §6 |
| Maximum-use exceeded | group 19 + group 20 | group 12 (uses label) | §6 |
| Wrong project | group 19 (another project of the same client, another client) | — | §4/§6 |
| Wrong document | group 19 | — | §4 |
| Cross-client tampering | group 19 (link session ↔ other client's project/document/download; foreign passkey) | — | §6 |
| Direct access | group 18 | group 12 | §2 |
| Passkey-required access | group 18/19/20 | group 12 | §5 |
| View-only | group 18/19 | group 12 | §2 |
| Download permission | group 18/19 | group 12 | §3 |

---

## 10. Reuse (no duplicate systems)

| Need | Reused | Not created |
| --- | --- | --- |
| Link storage | `client_links` (Phase 5) + one additive column | no `project_links` table |
| Token primitives | `generateClientLinkToken`, `clientLinkHash`, `resolveClientLink`, `consumeClientLinkUse`, `expireClientLinks`, `revokeClientLinks` | no second token system |
| Routing | the existing `POST /api/client/link/:token`, `/api/phantom/clients/:id/links`, the client session header | no second router |
| Sessions | `createClientSession` with the existing `client_link_id` column | no parallel session table |
| Client store | `client_documents` `storage_reference` (`client-exports/…`) | no new file table; the stamping pipeline is still unbuilt and untouched |
| Activity | `audit_logs` through `recordClientActivity` | no second activity log |
| Permissions | Phase 6 capabilities `clients.links.create` / `.revoke` / `.manage` | no new permission store |

---

## 11. Mutation testing — 24 mutants, no unguarded rule

Each mutation breaks exactly one Phase 7 rule in the product source; the backend suite then runs and must notice. **18/24 were detected directly.** The six that were not are single-layer removals inside a deliberately redundant pair — and each pair, attacked together, **is** detected, which is the meaningful claim.

| Mutation | Result |
| --- | --- |
| Document link stops being pinned to its own document | **DETECTED** (4 failures) |
| Document/file link may open room sections | **DETECTED** (5) |
| Reading is no longer separated from reaching the file | **DETECTED** (2) |
| A link is never treated as restricted (URL ids would decide) | **DETECTED** (34) |
| Passkey link's window no longer judged at sign-in | **DETECTED** (1) |
| Expiry sweep is a no-op | **DETECTED** (4) |
| Link may exceed its maximum uses (SQL guard) | **DETECTED** (4) |
| Spent passkey link refused at the link screen instead of at sign-in | **DETECTED** (1) |
| LINK_CREATED no longer recorded | **DETECTED** (2) |
| LINK_REVOKED no longer recorded | **DETECTED** (2) |
| File link issued without a stamped client copy | **DETECTED** (1) |
| Link created for an unpublished or archived document | **DETECTED** (3) |
| Lifetime window not validated on creation | **DETECTED** (2) |
| Maximum uses not validated on creation | **DETECTED** (1) |
| All three expiry layers removed together | **DETECTED** (8) |
| SQL use guard **and** route pre-check removed together | **DETECTED** (8) |
| Both session-invalidation layers removed together | **DETECTED** (8) |
| Reachability relaxed **and** the read guard removed together | **DETECTED** (2) |
| Reachability precondition relaxed (reachability widens) | equivalent — the read guard and the download check re-derive the answer |
| Inline expiry re-check on redemption removed | equivalent — the sweep closes the window first |
| Route pre-check for exhausted links removed | equivalent — the SQL guard refuses the same redemption |
| Revoking a client leaves link sessions alive (cascade) | equivalent — every request re-validates the live link row |
| A revoked link session keeps working until its expiry (validation) | equivalent — the cascade already revoked the session rows |
| Revoking a link no longer kills the sessions it minted (route) | equivalent — the same live-row validation refuses it |

Every file is restored from a snapshot after each mutant, and the driver refuses to finish without a clean tree.

---

## 12. Live verification (built Worker, real HTTP)

`npm run build` → `wrangler pages dev dist --port 8788` (0.0.0.0, the live preview), then 86 HTTP checks:

* PHANTOM signs in; the switches (`client_portal_enabled`, `client_downloads_enabled`, `client_all_links_enabled`) are turned on through the app's own settings route; two published documents are created — one with a stamped `client-exports/` copy.
* A direct link redeems into a restricted session; the room, the sections and `/api/client/me` all report the restriction; a view-only link reads but is refused a download, and the refusal is recorded as `download_not_permitted`.
* A download-permitted link **delivers the stamped bytes** (`STAMPED-LIVE-LETTER-BYTES`) — proving downloads only ever serve `client-exports/` artifacts — while a file link delivers the same file and is refused the document text, the room and every section.
* A section link sees a room containing only its own section and cannot read a report; a document link sees a room with no sections, only its own document, and cannot be widened by naming another document in the URL.
* REQUIRE_PASSKEY: redemption mints nothing and reveals nothing; the passkey signs in to the link's section; another section is refused; the spent link is refused at sign-in with `link_exhausted`.
* Time travel through the local D1 marks a link expired → `404 link_expired`, the row is `expired`, and `LINK_EXPIRED` appears exactly once. Max uses, revocation (link + its session), cross-client tampering and suspension all stop working.
* The operator list reports destination, mode, permissions and remaining uses and never returns a token or a hash; the activity feed carries `LINK_CREATED`/`LINK_USED`/`LINK_REVOKED` with no credential material.
* The served bundle contains the expired/revoked screens, the contact line and the link vocabulary.

---

## 13. Files changed

| File | Change |
| --- | --- |
| `functions/lib/schema.ts` | +`client_links.destination_intent` (additive, default `'view'`), +`idx_client_links_expiry`, schema version `2026-09-18-code-rx13-client-portal-3` |
| `functions/lib/client-portal.ts` | destination catalog, access modes, TTL presets/bounds, `destination_intent`, `clientLinkScope` + the four scope predicates, `describeLinkDestination`, `resolveLinkMaxUses`, the four LINK_* activity events |
| `functions/lib/client-auth.ts` | link destination fields on the session/link reads |
| `functions/client-routes.ts` | redeem (both modes), passkey sign-in bound to a link, scoped room/section/document/download access, link creation validation, links list with the sweep, LINK_* activity |
| `src/lib/linkAccess.ts` *(new)* | the client+operator link vocabulary: destinations, modes, presets, permission summary, uses label, `landingFor`, `LINK_STATE_SCREENS`, token shape |
| `src/lib/projectRoom.ts` | `CATEGORY_SECTIONS` + `sectionForCategory` |
| `src/lib/cloudflare.ts` | `ClientPortalDestination`/`ClientPortalSessionPayload`, `exchangeAccessKey(key, linkToken?)`, richer link payloads |
| `src/components/ClientLinkState.tsx` *(new)* | the expired/revoked/exhausted/invalid screens |
| `src/components/ClientPortal.tsx` | link redemption, passkey-required sign-in, URL token stripping, end-state routing |
| `src/components/ClientProjectRoom.tsx` | destination landing, restricted banner, file landing panel |
| `src/components/ClientAccessCenter.tsx` | links panel and create dialog (destination grid, mode, lifetime, permissions, uses), link credential wording |
| `src/components/ClientAccessScreen.tsx` | eyebrow/heading/helper/notice-icon/abandon props so a passkey link can explain itself |
| `scripts/client-portal-tests.mjs` | groups 18–20 (168 checks) + failure-summary fix |
| `scripts/client-portal-ui-tests.mjs` | group 12 (73 checks) |

---

## 14. What Phase 7 deliberately did not do

* **No second link system, no second router, no new session store, no new activity log.** One additive column is the entire schema change.
* **No watermarking.** The stamping pipeline is still unbuilt: a file link can only be created for a document that already has a `client-exports/` copy (409 otherwise), downloads serve only that artifact, and an unstamped original is never exposed.
* **No weakening of preview.** Preview still serves no file bytes; a file link's landing panel says so.
* **No unrelated UI or schema changes; no dependency upgrades; no changes to the public site, member portal, Vault or Phantom Control beyond the existing Client Access Center panel.**
* **No client-side authorization.** Every rule is enforced server-side; the UI merely stops offering what the server would refuse.

## 15. Known limits

* A custom lifetime is bounded to 7 days (the brief's longest preset); the API says so in the 400 body rather than silently shortening it.
* Direct-access link sessions are capped at 45 minutes; a client who needs longer signs in with their access key.
* The links list shows the latest links for a client (no paging), consistent with the rest of the workspace.
