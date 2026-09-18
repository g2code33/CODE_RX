# CODE Rx SOCIETY — Client Portal, Phase 9 report

**Phase 9 — ACTIVITY, NOTIFICATIONS & POLISH**
Branch `arena/01a0b09c-code-rx` · build `npm run build` clean (`dist/index.html` 1,122.63 kB, gzip 285.24 kB) ·
`tsc -p tsconfig.json` clean

## Headline

| Suite | Checks | Passed | Failed | Rate |
| --- | --- | --- | --- | --- |
| Backend / API (`scripts/client-portal-tests.mjs`) | 1327 | 1327 | 0 | 100.0 % |
| Client UI (`scripts/client-portal-ui-tests.mjs`) | 337 | 337 | 0 | 100.0 % |
| Live (`wrangler pages dev dist`, real D1 + R2) | 49 | 49 | 0 | 100.0 % |
| **Total** | **1713** | **1713** | **0** | **100.0 %** |

The suites grew by **+49** backend and **+38** UI checks for this phase (1278 → 1327, 299 → 337).
Phases 1–8 regressions all still pass; no migration, table or column was added for this phase.

## 1. Client activity timeline

Client activity was already recorded — `recordClientActivity` writes to the existing `audit_logs`
table as `client.<event>`. Phase 9 adds **presentation only** (`functions/lib/client-activity.ts`),
so nothing new is logged and nothing existing is duplicated:

* **Events** — LOGIN, LOGOUT, PROJECT_OPENED, SECTION_OPENED, DOCUMENT_VIEWED, DOCUMENT_DOWNLOADED,
  DOCUMENT_PUBLISHED, LINK_CREATED, LINK_USED, LINK_EXPIRED, LINK_REVOKED, ACCESS_KEY_REVOKED,
  ACCESS_KEY_REGENERATED, ACCESS_DENIED, CLIENT_SUSPENDED, ACCESS_REVOKED_ALL.
* **Display** — date/time (absolute + relative), actor, access method, project, document where
  applicable, a one-line summary, and the display-safe details.
* **Access method** is derived from what the recorder already stored: `access_key` (“Project access
  key”), `link_direct`, `link_passkey`, `staff` (operator actions, e.g. publishing), `system`
  (the automatic link-expiry sweep). The link mode is read from the client link row — never guessed.
* **Attribution** — project and document are resolved from the client’s own project/document rows,
  loaded per client, so one client’s timeline can never name another client’s project.
* **Publication now appears in the right timeline.** It was recorded with `note: 'publication'` and a
  null subject in Phase 8, so it never showed up in a client feed. It is now recorded against the
  client it belongs to (with `projectPublicId` and the version) and presented as
  `DOCUMENT_PUBLISHED`, kind `project`, actor “Code Rx staff”. That is the one place where Phase 9
  changed what is *recorded*, and it only adds the subject the existing row was missing — the event
  type, table and shape are unchanged.

## 2. PHANTOM activity view

`GET /api/phantom/clients/:clientId/activity` (capability `clients.activity.view`) now returns the
enriched entries plus metadata (`counts`, `kinds`, server-side `labels`, `total`, `filters`).
The response is a **superset** of the previous shape (`data` is still the array of entries, each
still carrying `id`, `event`, `at`, `details`), so every existing consumer keeps working.

* Server-side filters: `?kind=project|document|link|auth|navigation|security`, `?project=<public id>`,
  `?document=<public id>`, `?limit=` (1–200). Counts always describe the whole loaded history, not
  the returned page; an unknown `kind` shows everything rather than nothing.
* The workspace renders the timeline in the existing **Clients → Activity** section
  (`ActivityPanel` in `src/components/ClientAccessCenter.tsx`): filter chips with counts, actor,
  access method, project, document, absolute + relative time, a loading skeleton, and a professional
  empty state (with a way back when a filter is what made it empty).
* **Sensitive data cannot leave.** Entries are built from an allow-list, and any value that merely
  looks like a credential is dropped: raw passkeys, session tokens, key hashes, 64-hex tokens,
  `CRX-XXXX-XXXX-XXXX-XXXX` link tokens, `client-exports/…` keys, `vault/…` keys. The UI applies its
  own allow-list on top, so a future recorder cannot leak through the panel either.

## 3. NEW / UPDATED documents

`documentFreshness()` in `functions/lib/client-portal.ts` derives the badge **on the server** from the
columns the portal already keeps — `published_at`, `updated_at`, `version` — with no new column, no
new table and no new writes:

| Situation | Badge |
| --- | --- |
| Published within 14 days, never changed, version 1.0 | **NEW** |
| Changed after publishing (or re-versioned), change within 14 days | **UPDATED** |
| Older than the window | none |

It is exposed as `freshness: 'new' | 'updated' | null` on the client document payloads (room read,
sections, Phantom preview) and on the operator document list. The room shows the badge in the list
and in the open document, with a one-line legend (“NEW recently published · UPDATED changed since”),
and keeps the publication dates it already showed. The frontend renders only the server value
(`freshnessBadge`), so an unexpected value is ignored rather than displayed.

## 4. Optional notifications

Two systems already existed and both are reused — no new notification platform, no new tables:

* the member inbox (`notifications` + `notification_recipients`, through
  `functions/lib/notifications.ts`), so the people who manage client content see it inside the
  platform;
* the transactional EmailJS path (`functions/lib/email.ts`, general template), used only when the
  client has a contact address — clients have no accounts, so email is the only channel they have.

`functions/lib/client-notifications.ts` adds the *policy* only:

* Events: **new document published**, **document updated** (a republish or a version bump),
  **project update published** (`category: 'update'`).
* Switches live in the existing `system_settings` rows and are read/written through the **existing**
  settings route (`GET/PUT /api/phantom/client-portal-settings?group=notifications`,
  capability `clients.settings.manage`). The default `portal` group still returns exactly the three
  portal switches. Everything defaults to **off**.
* Recipients: active members who hold `clients.documents.publish` (or the Phase 5 umbrella
  `clients.publish`), plus PHANTOM. **A client is never a recipient** — clients have no member
  profile and the query only selects member profiles.
* **Failures never break a publish.** The whole path is best-effort and isolated; every outcome is
  audited as `client.notification.sent` or `client.notification.skipped` with a machine-readable
  reason (`notifications_disabled`, `event_disabled`, `sent`, `email_unavailable`, `internal_only`,
  `no_contact_email`, `notification_failed:…`), and the publish response carries the same outcome.
* Operator view: **Clients → Permissions → Client notifications (optional)** — one master switch plus
  one switch per event, each saved through the existing route and recorded in the existing audit log
  (`client.notification_settings.updated`).

## 5. Client-facing polish

Targeted, in the client surfaces only (nothing in the public site, Member Portal or Vault was touched):

* Project room: `aria-live="polite"` + `aria-busy` on the document list, `role="status"` on the
  loading state, an announced and keyboard-dismissible notice, the NEW/UPDATED legend, the badge in
  the list and the open document, and the existing responsive sections strip
  (`overflow-x-auto` → sticky sidebar from `lg`), empty/error/view-only states kept intact.
* Access screen: `aria-busy` on the form, `enterKeyHint="go"`, existing `label`/`aria-invalid`/
  `aria-describedby`/`role="alert"` wiring kept.
* Expired/revoked link screens: the state card is now a polite live region with a decorative-mark
  icon and the existing “no project content was shown” reassurance.
* The activity panel adds skeleton loading, filtered-empty and never-any-empty states.

## 6. No unnecessary redesign

* No new files under `functions/lib/` beyond the two that hold this phase’s policy/presentation;
  no route was replaced, no auth/permission/Vault/token/audit/storage system was rebuilt.
* No migration, no schema change, no dependency change, no unrelated UI edit.
* The UI suite asserts that the member, Vault and public surfaces contain none of the phase’s
  symbols.

## Verification

* `node scripts/client-portal-tests.mjs` → **1327/1327** (new groups: *22. Client activity timeline*,
  *23. Optional client notifications*, *24. NEW and UPDATED from the existing timestamps*).
* `node scripts/client-portal-ui-tests.mjs` → **337/337** (new group: *14. Activity, notifications and
  client polish*).
* `python3 /tmp/p9/live.py` against `wrangler pages dev dist` → **49/49**: real client session
  activity, server-side filters, credential-absence assertions, opt-in notifications landing in the
  real inbox (with the EmailJS transaction stubbed, then broken, to prove a publish never depends on
  it), badge flips after backdating rows in real D1, and a real internal Vault PDF delivered as a
  stamped copy whose bytes still contain no `%RAW-ORIGINAL-SENTINEL-42`.
* `npx tsc --noEmit -p tsconfig.json` clean; `npm run build` clean.
* Live evidence saved in `phase9-samples/`: `live-stamped-copy.pdf` (34,709 B, the exact byte stream
  served to the client session), `live-stamped-copy.png` (rendered page), `activity-timeline.json`
  (the entries the workspace renders, with no credential, storage key or hash present).

## Files changed

| File | Change |
| --- | --- |
| `functions/lib/client-activity.ts` | **new** — event→kind/label/access-method mapping, allow-list details filter, project/document/link resolution, filtering + counts |
| `functions/lib/client-notifications.ts` | **new** — optional notification policy on top of the existing inbox and EmailJS transaction, with audited outcomes |
| `functions/lib/client-portal.ts` | `documentFreshness()` + `documentFreshnessWindow`; `freshness` added to `publicDocument` |
| `functions/client-routes.ts` | enriched activity route (+filters/meta), settings route notification group, notification hook on publish, publication attributed to its client, `freshness` on the operator document list |
| `src/lib/cloudflare.ts` | activity request with server-side filters and metadata; settings route group parameter |
| `src/lib/projectRoom.ts` | `freshness` on `RoomDocument`, `freshnessBadge()` |
| `src/components/ClientProjectRoom.tsx` | badges in list + open document, legend, live regions and a11y polish |
| `src/components/ClientAccessCenter.tsx` | rewritten `ActivityPanel` (filters, counts, loading/empty states, allow-listed details), grouped client/notification switches with per-group saving, exported for the UI suite |
| `scripts/client-portal-tests.mjs` | +49 checks (groups 22–24) |
| `scripts/client-portal-ui-tests.mjs` | +38 checks (group 14) |

## Notes and limits

* Email delivery is opt-in and depends on the EmailJS configuration already used for activation and
  reset emails; without it the internal inbox still receives the notification and the published
  document is unaffected (`email_unavailable` is recorded).
* The NEW/UPDATED window is 14 days (`CLIENT_FRESHNESS_WINDOW_DAYS`) and is computed per request from
  stored timestamps, so it needs no scheduled job and no state.
* The activity timeline presents at most the 400 most recent audit rows for a client before filtering
  (`limit` then slices to 200); older history stays in `audit_logs`, which is the platform’s own
  retention story.
