# CODE Rx SOCIETY — CLIENT PROJECT PORTAL
## PHASE 4 REPORT — PROJECT ROOM

**Branch:** `arena/01a0b09c-code-rx` · **Base:** Phase 3 at `9d66190`
**Scope delivered:** the authenticated Client Project Room. The public website, Member Portal, Vault and PHANTOM Control Center were not redesigned or touched.
**Live dev environment:** running and seeded (see *How to use the live preview* below).

---

## SUCCESS RATE

| Measure | Result |
| --- | --- |
| **Phase 4 acceptance tests** (backend room flow + room presentation rules) | **87 / 87 — 100 %** |
| **Full backend suite** | **265 / 265 — 100 %** |
| **Full UI suite** | **126 / 126 — 100 %** |
| **Combined** | **391 / 391 — 100 %** |
| **Phase 4 brief, requirements 1–8** | **8 / 8** |
| **Live end-to-end verification** (overview → sections → list → view → download → isolation → manipulation) | **22 / 22 checks** |
| **Mutation controls on the new Phase 4 logic** | **4 / 4 detected** |
| **TypeScript** | frontend `tsc -p tsconfig.json` clean; backend unchanged at the 39-error pre-existing baseline |
| **Phase 4 score** | **100 % of the stated scope** |

**Two genuine defects were found and fixed during this phase**, both caught by the new tests: the project payload used by the room was missing its description and dates, and the reader's document payload was missing publication information. Both are described under *Defects found and fixed*.

**Honest caveats, unchanged from Phase 3:**
1. **No browser automation.** The room's rules are verified by rendering the real components with `react-dom/server` and by driving the identical API sequence against the live dev server. A purely visual regression (a colour, a spacing shift) is not covered by a test.
2. **No watermarked artifact pipeline.** Authorized downloads serve an existing `client-exports/` object; nothing stamps documents yet. The UI therefore shows Download only when the server granted it, and explains a refusal in plain language.
3. **One environment note.** Mid-phase, the sandbox was re-cloned from the remote, which removed `node_modules` and `dist` and reset the local branch pointer. No work was lost: the working tree was intact, history was restored from the pushed commits (`9d66190`), and `node_modules`/`dist` were rebuilt. Nothing about the repository's real state changed.

---

## FILES CHANGED

| File | Change |
| --- | --- |
| `src/components/ClientProjectRoom.tsx` | **Rewritten for Phase 4** (+296 / −129). Overview facts, section visibility, explicit View/Download actions, per-section empty states, responsive layout. |
| `src/lib/projectRoom.ts` | **New** (176 lines). The room's presentation rules as pure functions: section visibility, empty-state wording, permission labels, publication info, overview facts, download filenames. |
| `functions/lib/client-portal.ts` | +8 / −4. The document authorization row now carries `summary`, `published_at` and `updated_at`; the project row carries `description`, `created_at` and `updated_at`; `publicProject` exposes `createdAt`. |
| `scripts/client-portal-tests.mjs` | **Group 13 added** (44 assertions): the Phase 4 requirements end-to-end through the real API. |
| `scripts/client-portal-ui-tests.mjs` | **Groups 6–8 added** (43 assertions): section visibility, empty states, view/download separation, publication info and overview facts. |
| `CLIENT_PORTAL_PHASE4_REPORT.md` | This report. |

**Not touched:** the public site, the member dashboard, the Vault, the Admin/PHANTOM panels, `App.tsx`, `wrangler.toml`, `vite.config.ts`, and every Phase 2 table. `ClientAccessScreen.tsx` and `ClientPortal.tsx` were unchanged in this phase.

---

## 1. PROJECT ROOM

After authentication the client lands in the project room, which shows **Project Overview, Documents, Letters, Agreements, Reports, Deliverables, Updates**.

**Only sections that contain authorized, published content are offered.** The visibility rule is enforced in a pure, tested function (`visibleSections`) and driven by counts the server computes from authorized rows only:

```
all counts : overview=5, documents=0, letters=1, agreements=0…  (live check)
rendered   : Project Overview, Letters, Agreements, Reports, Deliverables, Updates
```

Project Overview is always present — it carries the project itself — and an empty category is never rendered. A hidden draft can neither create a section nor inflate a count: adding an unpublished and an archived report left `reports=1` (asserted, and mutation-tested).

## 2. PROJECT OVERVIEW

Shown for the client's own project only:

| Field | Source |
| --- | --- |
| Project name | `project.name` |
| Project reference | `project.reference` (`CRX-PROJ-2026-001`) |
| Description | `project.description` |
| Current status | `project.status`, rendered in client language (`Active` / `On hold` / `Archived`) |
| Relevant project information | Opened date, Last updated, Documents available |

**Internal-only notes are never displayed** — and never sent. The room's project shape is an explicit allow-list (`publicProject`); the payload is asserted to contain no `notes`, `client_id`, `created_by_user_id`, `is_archived`, storage reference or Vault identifier. An unknown/internal status value renders as `Active` rather than leaking the raw state.

## 3. DOCUMENT LIST

Every row shows **title, reference, category, version, publication information, View, and Download when authorized**:

```
Engagement letter | CRX-LTR-2026-001 | letter | v1.0 | published 2026-09-17 | view=True download=True   (live check)
Phase 1 discovery report | CRX-RPT-2026-001 | report | v1.0 | published … | view=True download=False
```

Publication information distinguishes a new document from a changed one: a document updated after publication shows both `Published 01 Sep 2026` and `Updated 10 Sep 2026`; one that has never been updated shows a single date; a document with no usable timestamp shows `Date unavailable` rather than an invalid date. Dates are rendered in the viewer's own locale.

## 4. VIEW / DOWNLOAD SEPARATION

The two permissions are independent at every layer:

* **Server:** `clientDocumentExposure` computes `canView` and `canDownload` separately, and the download route re-checks both the document's own flag and the client-wide switch.
* **Client:** the room reads `permissions.download` per document. A view-only document shows **View** and a "View only" marker; a downloadable one shows **View** and **Download**.
* **Never inferred:** a document with no permission block at all is treated as view-only (asserted).

Live proof: the letter (download allowed) returns `200` with the artifact; the report (view allowed, download denied) renders fine and returns `404` on download.

## 5. CLIENT ISOLATION

The room **requests only what the session is entitled to**; it does not fetch everything and hide the rest in the frontend. Every query is scoped by the session's own `client_id` and `client_project_id`, and the project/document ids in the URL are opaque and must match that session.

Verified live and in the suite:

| Attempt | Result |
| --- | --- |
| Client A opens client B's project room | `404` |
| Client A lists client B's reports | `404` |
| Client A reads a client B document (via B's project path) | `404` |
| Client A reads a client B document **inside A's own project path** | `404` |
| Client A downloads a client B document | `404` |
| Client B's room contents | only `KUMASI DIAGNOSTICS CONFIDENTIAL` |
| Client B's payload mentions client A anywhere | no |

## 6. EMPTY STATES

Professional, per-section wording, with no internal counts anywhere:

| Section | Empty state |
| --- | --- |
| Documents | No documents available. |
| Letters | No letters available. |
| Agreements | No agreements available. |
| Reports | No reports available. |
| Deliverables | No deliverables available. |
| Updates | No updates available. |
| Overview (nothing published) | "Nothing has been published to this project yet." + guidance |

Each empty state is rendered with an icon and a short explanation line. **Internal document counts are never exposed**: counts are computed only from `published + client_visible + allow_view` rows, and the suite asserts that a section's count does not move when unpublished or archived documents are added.

## 7. RESPONSIVE UI

| Breakpoint | Behaviour |
| --- | --- |
| **Mobile** (default) | Full-width header with the client name hidden and a compact Log out; sections as a horizontally scrollable strip; document rows stack (icon + text, then actions on their own line); reader and overview in a single column; 2-column fact grid. |
| **Tablet** (`sm:`) | Client name and reference appear in the header, document rows become a single line with actions on the right, fact grid moves to 4 columns, padding increases. |
| **Desktop** (`lg:`) | Sections become a sticky left sidebar with counts; the room content fills the remaining width. |

The visual system is unchanged: the existing white/slate palette, emerald accents, Inter font stack, `rounded-xl`/`rounded-2xl` radii and the site logo — the same tokens used by the Vault and dashboard.

## 8. TEST

`npm run test:client-portal-all` → **391 assertions, 391 passed, 0 failed — 100 %** (exit 0).

| Suite | Total | Phase 4 groups |
| --- | --- | --- |
| `scripts/client-portal-tests.mjs` | 265 | **Group 13 — Project Room end-to-end (44 assertions)** |
| `scripts/client-portal-ui-tests.mjs` | 126 | **Groups 6–8 — sections/empty states (17), view vs download (9), publication info and overview facts (17)** |

**The six required scenarios, each tested explicitly:**

| Required scenario | Where | Result |
| --- | --- | --- |
| Client A cannot see client B | Group 13: project, section, document, own-project path, download, payload scan; Group 6 | ✅ |
| Unpublished documents remain hidden | Group 13: unreadable, undownloadable, absent from sections, not counted | ✅ |
| Archived documents remain hidden | Group 13: unreadable, undownloadable, absent from its section, not counted | ✅ |
| View-only documents cannot download | Group 13 **including a view-only document that *does* have a stamped artifact**; Group 7 | ✅ |
| Authorized downloads work | Group 13: `200` with the correct bytes, `private, no-store`, filename from the reference | ✅ |
| Direct URL manipulation fails | Group 13: numeric ids, injection-shaped ids, unknown section, no session | ✅ |

**Mutation (negative-control) verification — 4 of 4 detected:**

| Mutation | Failures |
| --- | --- |
| Section counts include unpublished/archived documents | `the report count excludes the unpublished draft and the archived report — reports=2` |
| Download route ignores the per-document flag | `a view-only document with an artifact is still refused for download — got 200` + 1 more |
| Empty sections are shown anyway | 4 failures |
| Download defaults to allowed when the flag is absent | 5 failures |

> The second mutation initially **passed** — which exposed a real blind spot: a view-only document was being refused only because it had no artifact yet. The suite now includes a view-only document *with* a stamped artifact, so the permission check itself is proven load-bearing. This is recorded because it is exactly the kind of false confidence that hides a future regression.

### Defects found and fixed during this phase

1. **The project overview had no description, status dates or "opened" date (high impact).** The room's project payload came from the authorization middleware's row, which did not select `description`, `created_at` or `updated_at`. Caught by the new overview assertions; fixed by widening that SELECT to the project's own client-facing columns (and adding `createdAt` to `publicProject`).
2. **The document reader had no publication information.** The reader's payload came from the same narrow row, which lacked `summary`, `published_at` and `updated_at`, so requirement 3 ("publication/update information") could not be met. Fixed the same way and locked in with a test asserting the reader carries a real `publishedAt`.

**Also confirmed unchanged:** the Phase 2 cross-client tampering tests, the Phase 3 access-screen states, and every regression check on the existing Vault, member, PHANTOM and community endpoints.

---

## MIGRATION & DEPLOYMENT NOTE

No schema change was needed in this phase — the columns the room displays (`description`, `created_at`, `updated_at`, `summary`, `published_at`, `updated_at`) already existed on the Phase 2 tables; only their exposure to the client payload changed. **No new migration, no new table, no new index.**

---

## HOW TO USE THE LIVE PREVIEW

The dev server is running with the Phase 4 room and a seeded demo (the local D1/R2 state survived the sandbox reset).

Open the preview and go to `/#client-portal`, then enter the demo key for **Ashanti Pharmacy Ltd**:

```
CRX-6PD5-PNBU-CK2F-F88F
```

What you should see:

* **Project Overview** — *Pharmacy Digital Platform*, `CRX-PROJ-2026-001`, the description, an **Active** badge, and Opened / Last updated / Documents available facts.
* **Sections** — Project Overview, Letters, Agreements, Reports, Deliverables, Updates. *Documents* is **absent**, because client A has no published document in that category.
* **Engagement letter** — shows **View** *and* **Download**; the download returns a real 647-byte PDF from local R2.
* **Phase 1 discovery report** — shows **View** and a **View only** marker; downloading it returns 404.
* **Empty states** — add a new project with no documents to see "Nothing has been published to this project yet."

Two documents are deliberately hidden and should never appear anywhere: an unpublished draft (*INTERNAL margin analysis*) and an archived note (*Superseded scope note*). A second client, **Kumasi Diagnostics**, exists with its own key `CRX-VD93-FL6W-H5X9-LPXB` — sign in with it to confirm you only ever see *KUMASI DIAGNOSTICS CONFIDENTIAL* and never anything belonging to Ashanti Pharmacy Ltd.

These credentials exist **only** in the local dev database under `.wrangler/state`; nothing was written to any Cloudflare account.
