# CODE Rx SOCIETY — CLIENT PROJECT PORTAL
## PHASE 3 REPORT — CLIENT ACCESS EXPERIENCE

**Branch:** `arena/01a0b09c-code-rx` · **Base:** Phase 2 at `3d9c0df`
**Scope delivered:** the client access experience only. No unrelated Code Rx page was redesigned.
**Live dev environment:** running (`wrangler pages dev` → real Pages Functions + local D1/R2 + the built SPA on one origin).

---

## SUCCESS RATE

| Measure | Result |
| --- | --- |
| **Phase 3 verification suite** (UI + access-key rules + browser-store security) | **84 / 84 — 100 %** |
| **Phase 2 backend suite** (re-run, unchanged expectations) | **222 / 222 — 100 %** |
| **Combined** | **306 / 306 — 100 %** |
| **Requirements 1–8 of the Phase 3 brief** | **8 / 8** |
| **End-to-end check against the live dev server** | 7 / 7 steps (login → room → section → document → privacy → logout) |
| **Mutation controls on the new Phase 3 security logic** | **2 / 2 detected** |
| **TypeScript** | frontend `tsc -p tsconfig.json` clean; backend unchanged at the 39-error pre-existing baseline |
| **Phase 3 score** | **100 % of the stated scope** |

**Three real defects were found and fixed while building this phase** (two of them Phase 2 backend bugs that would have made the project room useless, one a rendering bug in my own new component). All are listed in *Defects found and fixed* below.

**Two honest caveats:**
1. **No browser automation.** The UI is verified by rendering the real components with `react-dom/server` (every state asserted on the produced markup) and by driving the exact same API sequence the UI performs against the live dev server. There is no headless-browser step, so a purely visual regression (a colour, a spacing shift) is not covered by a test.
2. **Downloads are still not live.** The Phase 2 position is unchanged: the route serves only pre-stamped `client-exports/` artifacts, and the watermark pipeline is not built. The UI therefore *hides* the download control unless the document explicitly allows downloads, and if a download is refused it explains that the copy is not ready rather than showing an error.

---

## FILES CHANGED

### New files (6, 1 528 lines)

| File | Lines | Purpose |
| --- | --- | --- |
| `src/components/ClientAccessScreen.tsx` | 177 | The access screen: branding, access-key field, loading/error states, assistance line. |
| `src/components/ClientProjectRoom.tsx` | 381 | The authorized project room: section navigation, document list, document reader, download control, logout. |
| `src/components/ClientPortal.tsx` | 139 | The shell that owns the client session, resumes it on reload, redeems link tokens, and switches between the screen and the room. |
| `src/lib/accessKey.ts` | 151 | Pure access-key rules: formatting, validation, hints, and every client-facing failure message. No DOM, no React — unit-testable directly. |
| `scripts/client-portal-ui-tests.mjs` | 340 | The Phase 3 suite (84 assertions). |
| `CLIENT_PORTAL_PHASE3_REPORT.md` | — | This report. |

### Modified files (7) — all additive to existing systems

| File | Change |
| --- | --- |
| `src/App.tsx` | **+11 / −0 functional lines.** One import, one view flag, one hash branch (`#client-portal`), one early return, and the flag cleared in the existing branches so two full-page workspaces can never mount together. The existing routing system is used as-is; no second router. |
| `src/lib/cloudflare.ts` | `API_BASE` exported (one word), plus a clearly-delimited **CLIENT PROJECT PORTAL** section: the client-session store and the client-portal API calls. The existing member API helpers are untouched, and the member token is deliberately not sent on client routes. |
| `functions/client-routes.ts` | Login and link responses now carry a client-facing `code` + message; the link path returned to PHANTOM is now the hash route `/#client-portal/link/<token>`; the document route reads its published snapshot (defect fix). |
| `functions/lib/client-portal.ts` | Added `CLIENT_FAILURE_STATES` and the reason→state map. One constant removed (the old generic message). |
| `scripts/client-portal-tests.mjs` | Added group 12: the Phase 3 API contract (34 new assertions). |
| `package.json` | Two scripts added: `test:client-portal-ui`, `test:client-portal-all`. No dependency changes. |
| `.gitignore` | `.wrangler` (local dev state) ignored. |

**Not touched:** every other Code Rx page and component, the public site, the member dashboard, the Vault, the Admin/PHANTOM panels, `wrangler.toml`, `vite.config.ts`, and every Phase 2 table.

---

## 1. CLIENT ACCESS ROUTE

The portal is mounted exactly like the existing standalone workspaces (`#vault-share`, `#reset`, `#activate`): a hash route recognised in `App.tsx`, rendered as a full-page early return, outside the public navbar and the member shell.

* `#client-portal` — the access screen, or the project room when a live session exists.
* `#client-portal/link/<token>` — exchanges a temporary link, then **rewrites the URL** to `#client-portal` so the token cannot linger in history or be shared by accident.

No router library, no second navigation system.

## 2. ACCESS SCREEN

Rendered exactly to the brief:

```
CODE Rx SOCIETY
CLIENT ACCESS
Enter your project access key
CRX-____-____-____
[ ENTER PROJECT ]
Need assistance?   Contact Code Rx Society
```

White card on the site's `--brand-deep` background, emerald accents, slate text, the site's Inter font stack and logo, and a footer promise that the key is verified on Code Rx servers and never stored in the browser. The seven concept strings are asserted on the rendered markup.

## 3. PASSKEY INPUT

* **Automatic formatting:** uppercase, non-key characters dropped, groups of four, `CRX-` prefix applied — lowercase, spaced, dash-less and prefixed pastes all normalise to `CRX-XXXX-XXXX-XXXX-XXXX`.
* **Clear validation:** an empty key, a short key, and a key containing `0/O/1/I` each get their own plain-language message (the alphabet excludes those glyphs, so they are always a mistyping).
* **Loading state:** the button becomes `Verifying access key…` with a spinner and the field is disabled.
* **Feedback:** failures appear under the field with `role="alert"`, the field is marked `aria-invalid`, and the message clears the moment the client edits the key.
* **No backend detail:** asserted — no message contains a status code, an endpoint, a table name, an id or markup.

## 4. AUTHENTICATION

`POST /api/client/auth/login` (Phase 2) is used unchanged: passkey → client session → authorized project → project room. The raw access key lives in component state only for the length of that call and is then cleared; it is never written to `localStorage` **or** `sessionStorage`, never placed in a URL, and never logged. Asserted by both a runtime test and a static scan of every portal source file.

## 5. SESSION HANDLING

* The session token is kept in **`sessionStorage`** — the safest store the app supports for this credential: scoped to one tab and destroyed when that tab closes, unlike the member token's `localStorage`.
* A stored session is **never trusted**: on load the shell calls `GET /api/client/me` and takes the client/project context from the server. If the server refuses, the stored token is deleted and the client returns to the access screen with a session-ended notice.
* The client store also drops an already-expired token locally, so a stale tab cannot even attempt a request.
* **Logout** (`POST /api/client/auth/logout`) revokes the session row server-side and clears the browser store; the test proves the old token is refused afterwards.
* Session expiry anywhere in the room (any 401) sends the client back to the access screen with "Your secure session has ended."

## 6. ERROR STATES

Every state in the brief is reachable and separately tested:

| State | Server signal | Screen message |
| --- | --- | --- |
| Invalid access key | `401` + `invalid_key` | "This project access key was not recognised…" |
| Expired access key | `401` + `key_expired` | "…has expired. Please contact Code Rx Society for a new one." |
| Revoked access | `401` + `key_revoked` / `client_revoked` | "…has been revoked…" |
| Suspended client | `401` + `client_suspended` | "Access for this client is currently suspended…" |
| Archived project | `401` + `project_unavailable` | "The project linked to this access key is not available at the moment." |
| Session expired | `401` | "Your secure session has ended. Enter your access key to continue." |
| Server error | `5xx`, offline, timeout | "Something went wrong on our side…" / "We could not reach Code Rx Society…" |

**A note on the Phase 2 anti-enumeration rule.** Phase 2 answered every credential failure with one identical message. That is the strongest position, but it cannot drive a clear screen. Phase 3 resolves the tension without weakening the guarantee: **the distinct state is returned only after the presented key or link token has matched a stored row.** A key that does not exist produces exactly one response for every input, so nothing about the client base can be enumerated — asserted by comparing two different unknown keys *and* a malformed key byte-for-byte. A person who already holds a real key learns only the state of their own access, which they could establish anyway by holding the credential. This relaxation is deliberate, bounded and tested (mutation control K: making unknown keys report a distinct state fails the suite).

## 7. SECURITY

* **The browser receives no internal detail.** A login response carries no `client_id`, `project_id`, `access_key_id`, `key_hash`, `storage_reference`, `vault_document_id`, notes or row ids — asserted by walking the whole JSON payload for forbidden keys, plus a regex proving the access key is never echoed.
* **URL manipulation cannot bypass authorization.** The room never puts a project or document id in the URL at all: the context comes from the session, and every request is re-authorized server-side against the session's own client and project. The Phase 2 cross-client tampering tests (8 scenarios) still pass.
* **Unpublished work stays private.** The seeded demo includes an internal draft; the live check confirms it returns 404 to the client, and it never appears in any section count.
* **No member surface leaks into the portal.** The portal renders no navbar, no dashboard, no Vault and no other client's data; the room footer states that only that client's published documents are shown.
* **The link token is treated as a credential**: exchanged once, consumed atomically server-side, then removed from the address bar.

## 8. TEST

`npm run test:client-portal-all` → **306 assertions, 306 passed, 0 failed — 100 %** (exit 0).

| Suite | Assertions | Covers |
| --- | --- | --- |
| `scripts/client-portal-tests.mjs` | 222 | Phase 2 (196) plus **group 12**: every access-screen state on the real API, the byte-identical non-enumeration invariant, payload hygiene, logout invalidation, and the exact call sequence the room performs. |
| `scripts/client-portal-ui-tests.mjs` | 84 | Access-key formatting/validation (24), the seven required failure states (16), the rendered access screen in every state (26), the project room's rendered invariants (9), and browser-store security (9). |

**Negative controls (mutation) for the new logic — 2 of 2 detected:**
| Mutation | Result |
| --- | --- |
| Unknown keys report a distinct state (enumeration) | 2 failures |
| The browser store stops honouring session expiry | 2 failures |

### Defects found and fixed during this phase

1. **Every client document opened blank (Phase 2 bug, high impact).** The document route serialised the authorization middleware's deliberately narrow row, which excludes `content_snapshot`, so the reader always received empty content. Caught by the new room-contract test. Fixed by reading the snapshot in the route, scoped by the ids the middleware already authorized.
2. **A text-only document stored an empty block list (Phase 2 bug).** Documents created from plain text were written with `format: 'blocks', blocks: []`. Caught by the same test; the storage path is correct and the visible bug was the route above, now verified end-to-end (a published document returns its body text in the reader).
3. **The access screen derived its message through an effect (Phase 3 bug).** A notice passed on mount only appeared after a second render. Rewritten to derive the shown message directly, which is both correct on first paint and testable.

---

## WHAT PHASE 3 DELIBERATELY DID NOT BUILD

1. **The watermark/Code Rx stamping pipeline** — the last missing link for live downloads.
2. **The PHANTOM Client Access Center UI** — the 20 management routes exist and are tested, but there is no admin screen on top of them yet.
3. **Email delivery of keys and links** — keys are handed over out-of-band; sending credentials by email is a separate decision.

---

## HOW TO USE THE LIVE PREVIEW

The dev environment is running and already seeded with a demo client (**Ashanti Pharmacy Ltd** → *Pharmacy Digital Platform*, five published documents across letters, reports, deliverables, agreements and updates, plus one internal draft that must stay invisible).

Open the preview and go to the portal route (`/#client-portal`), then enter:

```
CRX-3Z9G-52KF-CVMU-VCNJ
```

You should land in the project room, see the five published documents grouped by section, read any of them, and be able to log out. Try a wrong key (for example `CRX-AAAA-BBBB-CCCC-DDDD`) to see the invalid-key state, and try `#client-portal/link/<token>` after minting a link from the management API to see the link flow.

The demo credentials above exist **only** in the local dev database (`.wrangler/state`); nothing was written to any Cloudflare account, and `dist/` and `.wrangler/` are both git-ignored.
