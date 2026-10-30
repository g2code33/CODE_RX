# CODE Rx SOCIETY — CLASS & GROUP MANAGEMENT MODULE

## COMPLETION REPORT & OPERATIONS REFERENCE

**Module type:** additive Class & Group Management system per the ~41-section
spec ("CODE RX SOCIETY — Complete Class & Group Management Module").
**Branch history:** `arena/01a0d5c0-code-rx`, ten working steps
(`633c214` → `ac25f80`), delivered step by step and merged by the maintainer,
then the follow-ups (`024274b`…`f7e8217`: icon-only doors, module-flag ribbon,
classless-workspace panes, My Classes list fix, §30 module-policy console +
draft overrides) and the post-implementation hardening pass
(`88f11b7` → `37907aa`: verification-token gating, passkey notification
scrub, lockout completion, invitation continuation, browser-level journey
gate, CI deploy gate). **Everything below is verified against the code and the
test suites — nothing is aspirational.**

---

## 1. WHAT SHIPPED

| Surface | Implementation |
|---|---|
| Student identities | Separate from Society members; register = index number + shared class entry password → pending → organizer approval → **permanent passkey shown once** (`rx30a…z → aa…az → ba…`, bijective base-26 over a–z, never reset or reused, `UNIQUE(passkey_sequence)`) |
| Student sign-in | **Passkey is the lookup key** (login resolves the student by its sequence); the organizer-controlled identifier (index number / university ID / phone) is the confirming half. 8 identifier failures → 20-minute lockout. Wrong passkey is an *anonymous* failure and can never count per account (anti-enumeration) |
| Organizer lifecycle | Member applies → EmailJS verification link → PHANTOM approve / reject / correction / **suspend / reinstate / revoke** (with reason). No self-approval anywhere. Suspension revokes every team seat; reinstatement restores exactly what it revoked |
| Classes | draft → configure → submit → PHANTOM approve/reject/correct/suspend/reinstate; `CRX-CLS-####` permanent ids; approval history table; sensitive post-approval edits route back to PHANTOM; entry password rotatable (stored only as a `cgm-entry:`-namespaced PBKDF2 verifier) |
| Team | primary organizer + co-organizers + assistants with granular per-class permissions; **ownership transfer propose → accept** swaps roles atomically; revocation is immediate; no self-grant; PHANTOM overrides everything |
| Roster | ONE pipeline for xlsx / csv / json: validation, column mapping with suggestions, preview, duplicate policies (skip/update/flag/reject), per-row errors, summary, downloadable **sample templates in all three formats** |
| Invitations | general (link + code + QR, expiry, max uses, disable / revoke / regenerate, click tracking) and individual (identity-bound, single-use); tokens stored only as `cgm-invite:`-hashed verifiers |
| Activities | many per class, each with own config / eligibility / groups / history / leadership / elections / WhatsApp / attendance / announcements / deadlines / status; timezone default Africa/Accra |
| Assignment | methods A (organizer-auto) / B (self-service) / C (hybrid with deadline); balanced sizes, hard capacity, randomized tie-breaks, idempotent regenerate, **capacity races closed by an atomic guarded INSERT**; gender balanced/separate/none with never-infer semantics; overflow waitlist/block/organizer; moves with approval + capacity re-check + seat restoration; late students placed without reshuffle |
| Elections | group-level, members only; anonymous (salted pseudonym ballots) or public; one vote per voter **enforced by a unique index and an atomic participation+ballot batch**; optional vote change (default off); configurable nomination/voting windows; tie-break chosen upfront (runoff / appointment / secure random / manual); results hidden until close; official announcement; cancel/restart with reason |
| Leadership | automatic / appointment / student contest (statement, windows, withdrawal before deadline, fallback); per-activity leader/assistant permissions; succession = automatic (senior assistant) / appointment (membership-validated) / fresh anonymous election |
| Announcements | per activity/class; direct or approval modes; **R2 attachments** (≤5 MB, download gated to class members + team); pin, edit history, report → PHANTOM dispute queue, **read tracking with per-reader list**; no chat, no threads |
| WhatsApp | manual organizer-pasted link per group; **one live link per group** (unique index), replace / disable / enable / revoke, QR preview, member-only click tracking that never counts as join proof |
| Attendance | sessions per activity/group; present/absent/late/excused; corrections keep the original value + reason; students read only their own history; no biometrics, no location |
| Lifecycle | open → published → active → completed → archived (+pause/resume/reopen/cancel-with-reason/restore); snapshots at publication / completion / archive / cancellation; **structural config frozen once published** (deadline extensions and cosmetics stay open); completion locks assignment + election operations |
| Notifications | in-app via the platform's notification system + optional EmailJS email; §31 catalogue; read/unread, mark-all; **per-category student preferences** (security + registration categories pinned server-side); deadline reminders with day-scoped dedupe keys backed by a unique partial index |
| Calendar | central student calendar: Monday-first month grid + per-day details + agenda, filterable by type, tz-aware |
| Reports | roster / activities overview / assignments / movements / leadership / elections / turnout / attendance / pending / organizer-actions in **CSV, Excel (xlsx) and PDF** (dependency-free PDF 1.4 writer); sensitive columns stripped without `view_sensitive_profiles`; **students download their own records** (attendance, group history with removals, leadership history) as CSV |
| Privacy (§35) | per-class `studentVisibleFields` **enforced server-side** (privacy-first default: names only); per-activity `contactVisibility` scopes phone/email to group or class; identity fields (index number, university ID, gender) are a hard floor — never visible to classmates at any setting; roster/report stripping for the sensitive permission; nothing private leaks through invitation pages or logs |
| Offline (§38) | connection banner in all three shells (online/offline/reconnecting, `role="status"`); duplicate-submission guard on every mutating call (in-flight lock → 409); failed fetches raise real offline errors — offline approvals/votes are never faked |
| PHANTOM oversight (§30) | applications, class approvals (**including drafts: PHANTOM can submit-&-approve or reject an unsubmitted draft, and approve a previously rejected class**), sensitive changes, registration-approval delegations (capped, usage-counted, revocable, surfaced in the organizer's status), organizer activity, audit browser, disputes, module flag, **module-wide policy console** — all server-enforced |
| Module policies (§30) | **Module settings console**: PHANTOM decides per process — organizer applications, class creation, student registration, membership requests, profile changes — between **approval required / automatic / closed** (profile changes: approval/automatic). Enforced server-side on every entry route; missing/invalid rows fall back to the spec default (approval); automatic decisions reuse the exact approval-path writes, are labelled "Policy (automatic)" and audited (`cgm.module.policy`, `cgm.*.auto_approved`, `cgm.profile_change.auto_applied`); closed modes refuse **before** any row is written; flipping a mode never touches already-queued requests |
| Invitation continuation | an open invitation survives sign-in and registration: class banner on the auth screen, class code prefilled (entry password still required), automatic claim after authentication, machine-readable states (`joined`/`requested`/`member`), dismissal + sign-out + expiry clear the context; general codes ride a 10-minute sessionStorage continuation, individual tokens never touch storage |

**Code size:** ~14,200 lines across the backend (`functions/class-group-routes.ts`,
`functions/lib/cgm/{core,service,schema,assignment,parse,pdf,routes-activities,routes-organizer,routes-student}.ts`),
the client (`src/lib/cgm.ts`, `src/components/ClassGroups/{ClassGroupsWorkspace,StudentPortal,PhantomClasses,ConnectionBanner}.tsx`),
the client (`src/lib/cgm.ts`, `src/components/ClassGroups/{ClassGroupsWorkspace,StudentPortal,PhantomClasses,ConnectionBanner}.tsx`),
the three test harnesses. **147 API routes** (75 activities/groups/elections/announcements,
45 organizer/class/PHANTOM/policies, 27 student). **41 `cgm_` tables, 52 indexes
(35 + 17 unique).**

---

## 2. SECURITY MODEL (verified by §20 + §23 of the test suite)

- **Hashed everywhere:** passkeys, class entry passwords, organizer-verify and
  invitation tokens are stored only as PBKDF2 / SHA-256 verifiers with the
  prefixes `cgm-entry:`, `cgm-organizer-verify:`, `cgm-invite:`. Raw values are
  shown exactly once.
- **Session discipline:** opaque student session tokens (hashed at rest,
  live-token unique index). Passkey change and logout revoke **all** sessions
  (logout-all is deliberate — shared school devices). Student sessions are
  never accepted on member routes and vice versa (tested).
- **Lockouts:** 8 failed attempts on a known identity — identifier wrong OR a
  resolving passkey failing verification — → 20-minute lock, audited; concurrent
  failures converge on the lock; successful sign-in resets the counters;
  unknown passkeys stay anonymous (never counted per account — anti-enumeration
  preserved); register/login failures are byte-identical for unknown index vs
  wrong password; archived/pending identities cannot authenticate.
- **One-time credential disclosure:** the permanent passkey exists in exactly
  one immediate response — the student's own registration response under
  automatic approval, or the approving organizer's approval response (offline
  handover). It is never stored in notifications (suite scans every stored
  notification), never in audit records, logs or profile APIs; the organizer UI
  gates the handoff behind an explicit "I saved my passkey — continue".
- **Verification tokens:** 64-hex random + embedded expiry (`<random>.<epoch>`,
  configurable `CGM_VERIFY_TTL_HOURS`, default 24h) hashed with domain
  separation; raw tokens travel only through the email; production API
  responses never contain one (`CGM_DEV_PREVIEW_TOKENS` runtime gate for
  isolated local tests); secure resend with cooldown invalidates the previous
  token; expiry → 410 with a resend pointer; replay → predictable refusal.
- **Audit trail (`cgm_audit`):** every decision is recorded. The suite scans
  the entire trail: **no raw passkeys, no entry passwords, no 64-hex tokens,
  no vote choices** — vote rows record only that an anonymous vote happened.
- **Rate limits** (`throttle()` per connecting IP): register 10/h, login 15/5min,
  assign 30/5min, vote 20/5min, passkey change 5/h, join/claim 20/10min, apply 5/h.
- **Concurrency:** assignment writes go through `insertAssignmentGuarded()` —
  one atomic statement re-checking uniqueness + capacity inside the INSERT;
  elections commit participation + ballot in one batch; lost moves restore the
  student's original seat.

---

## 3. INTEGRATIONS

| Binding / service | Used for | If missing |
|---|---|---|
| `DB` (D1) | all module data | module 404s |
| `BUCKET` (R2, existing) | announcement attachments under `cgm/announcements/<classId>/…` | JSON announcements still work; attachment upload returns an error |
| EmailJS (`EMAILJS_*`, `EMAILJS_TEMPLATE_ID_GENERAL`) | organizer-apply verification link, email notifications | flow still completes — the verify token is returned so previews/test harnesses finish without mail credentials |
| existing notifications + phantom inbox | organizer/PHANTOM notifications, dispute queue | unchanged |
| module flag | `system_settings.class_groups_enabled` | all `/api/cgm/*` routes answer 404 while disabled |

---

## 4. SCHEMA & MIGRATIONS

- Current marker: `VAULT_SCHEMA_VERSION = '2026-10-30-code-rx19-class-group-management-step6'`.
- All **41 tables** are `CREATE TABLE IF NOT EXISTS` in `functions/lib/cgm/schema.ts`
  (composed into the platform schema) — **new tables appear automatically on the
  next cold start** (the §30 policy table `cgm_module_policies` was added this way:
  key/value/updated_by/updated_at, created idempotently, no version bump, no data
  migration — existing rows in every other table are untouched).
- Column additions to existing tables live in `SAFE_MIGRATIONS`
  (`functions/lib/schema.ts`, guarded `ALTER TABLE … ADD COLUMN`) and only run on
  a version bump — the same rule the Client Portal phases established.
- Legacy suites are kept green by construction: `client-portal-tests.mjs` counts
  tables (`63 + 11 + 3 + 41`) and excludes `idx_cgm%` from its legacy index count.
- Migration safety: every CGM addition is additive (`CREATE TABLE IF NOT EXISTS`
  / guarded ALTERs); **no destructive migration exists**; verify production state
  after deploy with `npx wrangler d1 execute code-rx-db --remote --command
  "SELECT name FROM sqlite_master WHERE name LIKE 'cgm_%'"` (expect the 41 cgm_
  tables) — the agent cannot verify the live D1 from the sandbox, so run this
  once after the deploy.

---

## 5. TEST SUITES (all green at this commit)

| Suite | Command | Result |
|---|---|---|
| Module API (25 sections) | `npm run test:cgm` | **441/441** |
| Module UI (markup-level, 17 sections) | `npm run test:cgm-ui` | **200/200** |
| Browser journeys (jsdom + wrangler pages dev, 19 checks) | `npm run test:cgm-browser` | **19/19** |
| Legacy portal API | `npm run test:client-portal` | 1620/1620 |
| Legacy portal UI | `npm run test:client-portal-ui` | 695/695 |
| Raw delivery pipeline | `npm run test:raw-delivery` | 27/27 |

§22 covers the five module policies in every mode; §23 the security
corrections (verification-token gating + resend + expiry + single-use, passkey
notification hygiene, lockout on both failure halves, concurrent-failure
convergence, archived-identity refusal, anti-enumeration, email health);
§24 the invitation continuation journey (all twelve acceptance scenarios);
§25 policy transitions with pending rows + data retention. The browser check
boots the shipped bundle in jsdom against `wrangler pages dev` + local D1 and
drives the real UI journeys (class creation, PHANTOM approval incl. the draft
override, module settings save, registration with one-time passkey reveal,
invitation continuation, mobile nav).

**Bugs the suites caught (all fixed in-branch):** stray variable in the
succession route; succession method mislabelled; wrong EmailJS payload keys;
`appDialog`/`ConnectionBanner` missing imports (vite does not typecheck);
self-service passkey change could never succeed (verifier absent from the
session projection) and would have bricked accounts (sequence not rotated);
double-vote race returned a raw 500; organizer **reinstate** left team seats
revoked; suspended classes still accepted student actions; **My Classes read a
wrapped shape the client never returns — no organizer ever saw a class list**;
second-class registration 500'd on the identity UNIQUE index (missing
`institution_key` in the register lookup); auto-registered students were
kicked back to the auth screen (register never persisted its session); the
post-claim dashboard refresh compared session objects by identity and never
refreshed; a student-bound individual invitation never consumed its single
use; the verifier half of a login failure never counted toward lockout.

The API suite drives the real esbuild-bundled worker over HTTP against an
in-memory SQLite D1 shim (with an R2 stand-in), covering: registration and the
rx30 passkey progression + global uniqueness + 8-way concurrency, login variants
and lockouts, roster imports in all three formats, invitation expiry/caps/
revocation/binding, assignment methods A/B/C with balance/capacity/overflow/
moves/waitlist, election anonymity/ties/windows/double-vote races, attendance
corrections, announcements/attachments/reads/moderation, notification
preferences, contact & field visibility matrices, own-records export, sample
templates, WhatsApp lifecycle, succession, delegation visibility, deadline
reminders with dedupe, publish-freeze, file reports, seat races, security sweep
and governance.

**Bugs the suites caught (all fixed in-branch):** stray variable in the
succession route; succession method mislabelled; wrong EmailJS payload keys;
`appDialog`/`ConnectionBanner` missing imports (vite does not typecheck);
self-service passkey change could never succeed (verifier absent from the
session projection) and would have bricked accounts (sequence not rotated);
double-vote race returned a raw 500; organizer **reinstate** left team seats
revoked; suspended classes still accepted student actions.

---

## 6. DEPLOYMENT CHECKLIST

1. **Merge order:** land this branch's work on `main` (maintainer pulls
   manually — the branch is never pushed by the agent).
2. **D1:** nothing to run by hand — cold start applies the new tables; the
   `rx19` version bump runs the seven guarded ALTERs and the new indexes.
3. **R2:** the existing `BUCKET` binding is reused; no new bucket.
4. **EmailJS:** set `EMAILJS_TEMPLATE_ID_GENERAL` (plus the existing
   `EMAILJS_*` service keys) for organizer-verification and notification
   emails. Without them the application is saved and PHANTOM sees the missing
   variable names in the oversight header; the applicant uses
   **Resend verification email** once credentials are configured. Raw
   verification tokens are never returned outside explicitly gated dev
   environments (`CGM_DEV_PREVIEW_TOKENS='1'`); links expire after
   `CGM_VERIFY_TTL_HOURS` (default 24), are single-use, and resends
   invalidate the previous link.
5. **Module flag:** enable via PHANTOM → Class & Groups (`class_groups_enabled = '1'`);
   routes 404 while disabled, so the site can ship dark.
6. **PWA:** `public/sw.js` cache is `code-rx-v7` (bump on the next shell change);
   the SW caches the shell only and never `/api/*`; `manifest.webmanifest`
   unchanged.
7. **CI/CD:** `.github/workflows/deploy.yml` runs `npm ci`, all six test
   suites, the browser journey gate and the production build on every push/PR;
   the deploy job runs only on `main`, only with `CLOUDFLARE_API_TOKEN` +
   `CLOUDFLARE_ACCOUNT_ID` present (checked via the secrets context), and the
   summary step reports **completed / skipped (credentials unavailable) /
   failed** honestly. Never a deploy on a red suite.
8. **Deferred by spec §40:** chat, announcement threads, the WhatsApp Cloud API,
   an Android app, external calendar sync. The HTTP API is reusable for a
   future Android client without change.
9. **Verified where:** implemented + verified by automated tests = everything
   in §5; implemented + manually verified in the local preview stack = the
   browser journeys and the wrangler dev flows; **requires production
   verification after deploy** = real EmailJS delivery, remote D1 cold-start
   table creation, the Cloudflare Pages deploy itself (see the D1 check in §4).
   Live production email/deployment was NOT verified from the sandbox.

---

## 7. FILE MAP

```
functions/class-group-routes.ts        # Hono sub-app mount (flag-gated)
functions/lib/cgm/core.ts              # config/permission sanitizers, passkey math
functions/lib/cgm/service.ts           # sessions, throttles, audit, notify, atomic guard
functions/lib/cgm/schema.ts            # 41 tables + 52 indexes (35 + 17 unique)
functions/lib/cgm/assignment.ts        # balancing engine + gender rules
functions/lib/cgm/parse.ts             # xlsx/csv/json roster parsing + mapping
functions/lib/cgm/pdf.ts               # dependency-free PDF writer
functions/lib/cgm/routes-student.ts    # 27 student routes
functions/lib/cgm/routes-organizer.ts  # 45 organizer/class/PHANTOM/policy routes
functions/lib/cgm/routes-activities.ts # 75 activity/group/election/announcement/PHANTOM routes
src/lib/cgm.ts                         # typed client, duplicate guard, offline errors
src/components/ClassGroups/            # ClassGroupsWorkspace (18 areas), StudentPortal,
                                       # PhantomClasses (oversight), ConnectionBanner
scripts/cgm-tests.mjs                  # 441 API-level checks, 25 sections
scripts/cgm-ui-tests.mjs               # 200 markup-level checks, 17 sections
scripts/cgm-browser-check.mjs          # 19 jsdom browser journeys vs wrangler dev
```
