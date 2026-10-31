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
| Student identities | Separate from Society members; identified by **index number only** (university ID was removed entirely — roster, members, sign-in, register, profile fields, reports); register = index number + shared class entry password → pending → organizer approval → **permanent passkey shown once** (tiers run `a–z → aa–az → ba–bz → …` but the order **inside each tier is scattered** — a fixed permutation, `(17·p + 11) mod tier` — so keys are never guessable alphabetically; bijective per tier, no omissions, never reset or reused, `UNIQUE(passkey_sequence)`, and a suffix already held by a legacy sequential key is skipped, never reissued); the organizer may set a **per-class passkey mark** (the letters in front, e.g. `bio1`) in Settings — default stays `rx30`, issued passkeys are `<mark><suffix>` while the ONE global suffix sequence continues, and **existing passkeys are never rewritten** |
| Student portal UX | grouping activities in the class page render as **state-aware continue cards** (emerald→gold gradient, icon tile, a green **Continue** pill on live activities, a gold **Random** badge in forced-random mode, and a hint that says exactly where the student stands — "choose your group", "tap to draw your group", or "you are in {group}"); **My Profile shows every identity field with its real value** — the fixed index number included, read-only — instead of blanks, with "Not set yet"/"Not provided" where a value is genuinely missing (the projection is camelCase and the card previously read snake_case, showing "—" for fields the student obviously had) |
| Task-12 student surface | **Index numbers accept every format** — register and login normalise case and separators (`PH/PHA/24/0292` ≡ `ph-pha-24-0292` ≡ `ph pha 24 0292` ≡ `ph.pha.24.0292`), with the expected pattern shown as a hint under the inputs; the **passkey reveal is its own page** (the registration form disappears) showing the one-time key plus **every detail on file** (name, index, phone, email, gender, class); **gender self-service** — a student with no recorded gender sets it in the class page before choosing a group in a gender-balanced activity (server returns 428 until set; organizer-set values are locked); a phone-first student who claims a roster-bound personal invitation gets the **roster identity backfilled** (name + index) |
| Student sign-in | **Passkey is the lookup key** (login resolves the student by its sequence); the organizer-controlled identifier (index number — in any case/separator format — or phone) is the confirming half. University ID is NOT a sign-in or identity field anywhere. 8 identifier failures → 20-minute lockout. Wrong passkey is an *anonymous* failure and can never count per account (anti-enumeration) |
| Organizer lifecycle | Member applies → EmailJS verification link → PHANTOM approve / reject / correction / **suspend / reinstate / revoke** (with reason). No self-approval anywhere. Suspension revokes every team seat; reinstatement restores exactly what it revoked |
| Classes | draft → configure → submit → PHANTOM approve/reject/correct/suspend/reinstate; **Settings can run registrations and membership requests AUTOMATIC** (passkey on the spot / straight-in join; PHANTOM's module-wide policy still caps it); `CRX-CLS-####` permanent ids; approval history table; sensitive post-approval edits route back to PHANTOM; entry password rotatable (stored only as a `cgm-entry:`-namespaced PBKDF2 verifier) |
| Team | primary organizer + co-organizers + assistants with granular per-class permissions; **ownership transfer propose → accept** swaps roles atomically; revocation is immediate; no self-grant; PHANTOM overrides everything |
| Roster | ONE pipeline for xlsx / csv / json: validation, column mapping with suggestions, preview, duplicate policies (skip/update/flag/reject), per-row errors, summary, downloadable **sample templates in all three formats**; **file-first import** — the file is inspected on choose (format, headers, first 4 rows shown for reference) and the mapping options are labelled with values read straight from that file, so a link always relates exactly to the upload; **rows stay editable after the upload** (name, index, phone, gender inline; a registered student's index is locked to protect their sign-in) and **select-all mass actions** remove unregistered rows or suspend/remove members in bulk |
| Invitations | general (link + code, expiry, max uses, disable / revoke / regenerate, click tracking); **the token is stored, so the link, QR and PNG download stay available any time** — the QR is rendered by the module's own dependency-free encoder (ISO 18004 byte mode, level M, verified against an independent reference across versions 1–40) and downloads as a PNG stamped with the class name on top and the shared class entry password underneath; signing-in halves are index number / phone and individual (identity-bound, single-use); tokens stored only as `cgm-invite:`-hashed verifiers |
| Activities | many per class, each with own config / eligibility / groups / history / leadership / elections / WhatsApp / attendance / announcements / deadlines / status; **editable after creation** — drafts and open activities open the same form prefilled (name, type, description and every config field); once published the structure is frozen server-side (deadline extensions and everyday edits stay open; duplicating restructures); **automatic group sizing from the TOTAL ROSTER** — the organizer types only the number of groups (nothing ever rewrites it): the form shows the roster total, the even base share, the surplus split (e.g. 56 students · 6 groups → 2 groups of 10 + 4 of 9), the maximum per group, and auto-fills the hard capacity with that maximum (warns if a manual capacity would leave students out); timezone default Africa/Accra |
| Random selection | **Random Group Selection** — a per-student "let the system pick" button in My Groups, available in self/hybrid activities and FORCED everywhere when the organizer sets the assignment method to **Random selection (system picks for every student)**: in forced mode students cannot pick a group or auto-place (server refuses both with a pointed explanation) — the fair draw is the only way in, and the organizer's **Assign remaining (random mode)** sweeps any student who never drew onto balanced groups afterwards; the SERVER draws the winner with `secureUniformIndex` (cryptographic rejection sampling over 32-bit words — zero modulo bias, exactly uniform across every open group), and **the assignment is persisted BEFORE any animation plays** — the reveal only replays what the database already decided, so skipping it, closing it, or reloading lands on the identical group; recorded with event reason "random draw" + audit `cgm.assignment.random_draw` (stored as `via='self'` — the schema's CHECK makes a dedicated value a destructive rebuild); the reveal is a premium full-screen overlay in the module's emerald + gold + ivory language (blurred blue-white atmosphere with gold/green sparkles, white title panel with green border, golden orbital carousel of group cards easing to a stop dead-centre with glow + rays + confetti, dark-emerald "Selecting your group…" status pill, white "Congratulations! You are assigned to …" panel, 3-stage progress Processing… / Random Selection… / Complete!); group names are fully DYNAMIC from the database (2 to 20+ groups via a recycled strip, the winner's full name never truncated); Skip animation, `prefers-reduced-motion`, sound **off by default**, Escape closes, navigation never blocked; equal-probability draw is deliberately SEPARATE from the balanced class-assignment engine |
| Assignment | methods A (organizer-auto) / B (self-service) / C (hybrid with deadline) / **D (forced random)**; balanced sizes, hard capacity, randomized tie-breaks, idempotent regenerate, **capacity races closed by an atomic guarded INSERT**; gender balanced/separate/none with never-infer semantics; overflow waitlist/block/organizer; moves with approval + capacity re-check + seat restoration; late students placed without reshuffle; **direct organizer swaps** — exchange any two assigned members between their groups in one action (sizes unchanged so capacities hold by construction, gender-separate activities refuse mixed swaps, a swapped leader's vacancy resolves through the activity's succession rule, both students notified, history events + audit `cgm.assignment.swapped`, guarded by the same `move_students` permission as every membership change with **PHANTOM able to swap in any class**) |
| Elections | group-level, members only; **the organizer generates a voting link (copy + downloadable stamped QR) that signs the student in and lands straight on the ballot**; students get a real My Elections list and persistent sign-in; anonymous (salted pseudonym ballots) or public; one vote per voter **enforced by a unique index and an atomic participation+ballot batch**; optional vote change (default off); configurable nomination/voting windows; tie-break chosen upfront (runoff / appointment / secure random / manual); results hidden until close; official announcement; cancel/restart with reason |
| Leadership | automatic / appointment / student contest (statement, windows, withdrawal before deadline, fallback); **leader sign-up links** — while nominations are open the organizer shares a copyable + QR-stamped `#leader-apply/<election>` link that signs the volunteer in and records their candidacy in one step (idempotent, feeds the ballot); per-activity leader/assistant permissions; succession = automatic (senior assistant) / appointment (membership-validated) / fresh anonymous election |
| Announcements | per activity/class; direct or approval modes; **R2 attachments** (≤5 MB, download gated to class members + team); pin, edit history, report → PHANTOM dispute queue, **read tracking with per-reader list**; no chat, no threads |
| WhatsApp | manual organizer-pasted link per group; **one live link per group** (unique index), replace / disable / enable / revoke, QR preview, member-only click tracking that never counts as join proof |
| Attendance | sessions per activity/group; present/absent/late/excused; corrections keep the original value + reason; students read only their own history; no biometrics, no location |
| Lifecycle | open → published → active → completed → archived (+pause/resume/reopen/cancel-with-reason/restore); snapshots at publication / completion / archive / cancellation; **structural config frozen once published** (deadline extensions and cosmetics stay open); completion locks assignment + election operations |
| Notifications | in-app via the platform's notification system + optional EmailJS email; §31 catalogue; read/unread, mark-all; **per-category student preferences** (security + registration categories pinned server-side); deadline reminders with day-scoped dedupe keys backed by a unique partial index |
| Calendar | central student calendar: Monday-first month grid + per-day details + agenda, filterable by type, tz-aware |
| Reports | roster / activities overview / assignments / movements / leadership / elections / turnout / attendance / pending / organizer-actions in **CSV, Excel (xlsx) and PDF** (dependency-free PDF 1.4 writer); sensitive columns stripped without `view_sensitive_profiles`; **students download their own records** (attendance, group history with removals, leadership history) as CSV |
| Privacy (§35) | per-class `studentVisibleFields` **enforced server-side** (privacy-first default: names only); per-activity `contactVisibility` scopes phone/email to group or class; identity fields (index number, gender) are a hard floor — never visible to classmates at any setting (university ID no longer exists in the identity system); roster/report stripping for the sensitive permission; nothing private leaks through invitation pages or logs |
| Offline (§38) | connection banner in all three shells (online/offline/reconnecting, `role="status"`); duplicate-submission guard on every mutating call (in-flight lock → 409); failed fetches raise real offline errors — offline approvals/votes are never faked; **every request carries a 20 s abort deadline** (60 s for uploads/downloads) — a wedged network or tab surfaces as "The server took too long to answer", releases the guard and lets the user retry, instead of an eternal spinner |
| PHANTOM oversight (§30) | applications, class approvals (**including drafts: PHANTOM can submit-&-approve or reject an unsubmitted draft, and approve a previously rejected class**), sensitive changes, registration-approval delegations (capped, usage-counted, revocable, surfaced in the organizer's status), organizer activity, audit browser, disputes, module flag, **module-wide policy console** — all server-enforced |
| Module policies (§30) | **Module settings console**: PHANTOM decides per process — organizer applications, class creation, student registration, membership requests, profile changes — between **approval required / automatic / closed** (profile changes: approval/automatic). Enforced server-side on every entry route; missing/invalid rows fall back to the spec default (approval); automatic decisions reuse the exact approval-path writes, are labelled "Policy (automatic)" and audited (`cgm.module.policy`, `cgm.*.auto_approved`, `cgm.profile_change.auto_applied`); closed modes refuse **before** any row is written; flipping a mode never touches already-queued requests |
| Invitation continuation | an open invitation survives sign-in and registration: class banner on the auth screen, class code prefilled (entry password still required), automatic claim after authentication, machine-readable states (`joined`/`requested`/`member`), dismissal + sign-out + expiry clear the context; general codes ride a 10-minute sessionStorage continuation, individual tokens never touch storage |

**Code size:** ~14,200 lines across the backend (`functions/class-group-routes.ts`,
`functions/lib/cgm/{core,service,schema,assignment,parse,pdf,invite-crypto,routes-activities,routes-organizer,routes-student}.ts`),
the client (`src/lib/cgm.ts`, `src/components/ClassGroups/{ClassGroupsWorkspace,StudentPortal,RandomGroupReveal,PhantomClasses,ConnectionBanner}.tsx`),
the three test harnesses. **150 API routes** (76 activities/groups/elections/announcements,
45 organizer/class/PHANTOM/policies, 28 student). **41 `cgm_` tables, 52 indexes
(35 + 17 unique).**

---

## 2. SECURITY MODEL (verified by §20 + §23 of the test suite)

- **Hashed everywhere:** passkeys, class entry passwords and organizer-verify
  tokens are stored only as PBKDF2 / SHA-256 verifiers with the prefixes
  `cgm-entry:`, `cgm-organizer-verify:`, `cgm-invite:`. Raw values are shown
  exactly once (§31 + §20 verify).
- **Individual invitation secrets are sealed, not stored (§31):** the database
  keeps the SHA-256 lookup hash (validation) plus an AES-256-GCM sealed copy
  (`v1.<iv>.<ciphertext+tag>`, authenticated encryption, random IV per seal,
  key version recorded) so an authorized `manage_invitations` organizer can
  still copy or re-QR a live personal link. A database export alone can never
  re-issue an invitation. General invitations carry **no bearer secret at
  all** — their public code is the shareable half, and any legacy raw value
  was cleared by the migration. Sealing requires the `CGM_INVITATION_KEYS`
  Cloudflare secret: a JSON object of version → base64 32-byte keys, e.g.
  `{"v1":"<openssl rand -base64 32>"}`. Without it, creating or regenerating
  an individual invitation returns a 503 with the exact setup step — never a
  plaintext fallback. Tampered ciphertext fails authentication and the row is
  flagged `undecryptable` for regeneration.
- **Invitation usage is consumed atomically (§31):** one conditional UPDATE
  (`use_count = use_count + 1 WHERE … not revoked/disabled/expired, under
  max_uses, individuals unconsumed`) is the final concurrency guard — four
  racing claims of a single-use invitation win exactly once, concurrent
  general claims can never exceed `max_uses`, duplicates and already-member
  responses never inflate the count, and an individual is consumed exactly
  once (never before AND again after membership handling — a pre-existing
  double-increment bug was found and fixed here).
- **Idempotent seal migration (§31):** on the first CGM request per isolate,
  legacy plaintext individual secrets are sealed and the plaintext removed;
  expiry, limits, usage counts and every existing link keep working (legacy
  tokens validate through their hashes). Without a configured key nothing is
  written and the pending count is logged loudly (no secret values, ever).
  Re-running is a no-op.
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
  / guarded ALTERs); **no destructive migration exists**. **Production D1
  verified 2026-10-31 by the maintainer** via `npx wrangler d1 execute
  code-rx-db --remote --command "SELECT name FROM sqlite_master WHERE name LIKE
  'cgm_%'"`: all 41 `cgm_` tables present, including `cgm_module_policies` —
  the cold-start migration completed against the live database with no
  destructive step.

---

## 5. TEST SUITES (all green at this commit)

| Suite | Command | Result |
|---|---|---|
| Module API (34 sections) | `npm run test:cgm` | **656/656** |
| Module UI (markup-level, 21 sections) | `npm run test:cgm-ui` | **242/242** |
| Browser journeys (jsdom + wrangler pages dev, 25 checks) | `npm run test:cgm-browser` | **25/25** |
| Legacy portal API | `npm run test:client-portal` | 1620/1620 |
| Legacy portal UI | `npm run test:client-portal-ui` | 695/695 |
| Raw delivery pipeline | `npm run test:raw-delivery` | 27/27 |

§22 covers the five module policies in every mode; §23 the security
corrections (verification-token gating + resend + expiry + single-use, passkey
notification hygiene, lockout on both failure halves, concurrent-failure
convergence, archived-identity refusal, anti-enumeration, email health);
§31 the invitation-security battery (sealing at rest, hash validation,
authorized-only retrieval, tamper detection, missing-key fail-safe, migration
survival + idempotence, regeneration invalidation, identity binding,
exactly-once and concurrent-claim races, no-inflation guarantees, and the
expired/disabled/revoked matrix);
§32 the random-draw battery (sampler degeneracy + rejection-path + a
4,000-draw crypto uniformity window, unauthenticated 401, a real draw persisting
exactly one active assignment with event reason + audit row, duplicate-draw 409,
eleven draws all landing inside real pods with no student doubled, the one-seat
activity that crowns a winner and waitlists the loser, plus source pins that the
reveal is composed from the reference and free of any gambling vocabulary);
§33 the forced-random and direct-swap battery (the 'random' method surviving
the sanitizer, manual pick and auto-place both refused while the draw works,
the organizer finish sweeping undrawn students, same-student and missing-group
swap refusals, a real swap exchanging both members with history events + audit
and a successful swap-back, students unable to swap each other, PHANTOM
swapping across any class team, gender-separate mixed swaps refused, plus
source pins for the method option, the random-mode finish button, the Swap…
control and the forced-random student card);
§24 the invitation continuation journey (all twelve acceptance scenarios);
§25 policy transitions with pending rows + data retention; §30 the Task-12
batch (scattered passkey tiers with the legacy-suffix skip rule, tolerant
index-number formats at register and login, gender self-service before
gender-balanced self-assignment, roster-backed identity backfill on claims,
activity editing after creation with the published-structure freeze, and the
leader sign-up link). The browser check
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
   `rx22` version bump (`2026-10-31-code-rx22-invitation-sealing`) runs the
   guarded ALTERs (including `cgm_invitations.token_enc` +
   `token_key_version`) and the new indexes. The invitation-seal backfill then
   runs automatically (idempotent, once per isolate) — **no manual migration
   and no secret values are ever printed**.
3. **Cloudflare secret (REQUIRED before individual invitations work):** set
   `CGM_INVITATION_KEYS` = `{"v1":"<openssl rand -base64 32>"}` (wrangler
   pages secret put CGM_INVITATION_KEYS / dashboard). Rotation = add a higher
   version; old sealed rows keep their version and decrypt until those keys
   are removed. Until the secret exists, creating or regenerating an
   individual invitation answers 503 with these instructions; every other
   flow (general invitations, claims, migration survival) is unaffected.
4. **R2:** the existing `BUCKET` binding is reused; no new bucket.
5. **EmailJS:** set `EMAILJS_TEMPLATE_ID_GENERAL` (plus the existing
   `EMAILJS_*` service keys) for organizer-verification and notification
   emails. Without them the application is saved and PHANTOM sees the missing
   variable names in the oversight header; the applicant uses
   **Resend verification email** once credentials are configured. Raw
   verification tokens are never returned outside explicitly gated dev
   environments (`CGM_DEV_PREVIEW_TOKENS='1'`); links expire after
   `CGM_VERIFY_TTL_HOURS` (default 24), are single-use, and resends
   invalidate the previous link.
6. **Module flag:** enable via PHANTOM → Class & Groups (`class_groups_enabled = '1'`);
   routes 404 while disabled, so the site can ship dark.
7. **PWA:** `public/sw.js` cache is `code-rx-v7` (bump on the next shell change);
   the SW caches the shell only and never `/api/*`; `manifest.webmanifest`
   unchanged.
8. **CI/CD:** `.github/workflows/deploy.yml` runs `npm ci`, all six test
   suites, the browser journey gate and the production build on every push/PR;
   the deploy job runs only on `main`, only with `CLOUDFLARE_API_TOKEN` +
   `CLOUDFLARE_ACCOUNT_ID` present (checked via the secrets context), and the
   summary step reports **completed / skipped (credentials unavailable) /
   failed** honestly. Never a deploy on a red suite.
9. **Deferred by spec §40:** chat, announcement threads, the WhatsApp Cloud API,
   an Android app, external calendar sync. The HTTP API is reusable for a
   future Android client without change.
10. **Verified where (honest separation):** implemented + verified by the
   automated suites in this branch = everything in §5 **including invitation
   sealing, the seal migration, the atomic-claim races and the §32/§33
   random-draw + forced-random + swap batteries** (uniformity window,
   persistence-before-reveal pins, duplicate-draw 409, waitlist overflow,
   forced-mode refusals, organizer finish, PHANTOM swaps, gender-separate
   protection); implemented +
   manually verified in the LOCAL preview stack (wrangler pages dev + local
   D1 + jsdom) = the browser journeys and the wrangler dev flows, with the
   dev `CGM_INVITATION_KEYS` value from `.dev.vars`; the random-draw reveal
   ANIMATION itself was reviewed at the markup/CSS level and exercised only
   through the local preview — no production student has drawn a group yet; **NOT verified in
   production from this branch** = the Cloudflare Pages deploy of this work,
   the production `CGM_INVITATION_KEYS` secret, and live email delivery.
   **Deploy order matters:** set the production `CGM_INVITATION_KEYS` secret
   BEFORE pulling/deploying this branch, otherwise individual-invitation
   creation and regeneration answer 503 until it exists (everything else,
   including all existing invitation links, keeps working). Live production
   email has never been verifiable from the sandbox. CI note: the test-gate's
   first run on `main` (run 41135881444) passed all six suites and the build
   and correctly blocked the deploy; the only red step was the browser gate's
   own passkey sanity check rejecting `rx30a` — the legitimate FIRST passkey
   of a fresh CI database — fixed in `143da18` and verified twice locally
   against a fresh D1.

---

## 7. FILE MAP

```
functions/class-group-routes.ts        # Hono sub-app mount (flag-gated)
functions/lib/cgm/core.ts              # config/permission sanitizers, passkey math
functions/lib/cgm/service.ts           # sessions, throttles, audit, notify, atomic guard
functions/lib/cgm/schema.ts            # 41 tables + 52 indexes (35 + 17 unique)
functions/lib/cgm/assignment.ts        # balancing engine + gender rules
functions/lib/cgm/invite-crypto.ts     # invitation secret sealing (AES-256-GCM) + seal migration
functions/lib/cgm/parse.ts             # xlsx/csv/json roster parsing + mapping
src/lib/qr.ts                          # dependency-free QR encoder (byte mode, EC level M, v1-40)
functions/lib/cgm/pdf.ts               # dependency-free PDF writer
functions/lib/cgm/routes-student.ts    # 27 student routes
functions/lib/cgm/routes-organizer.ts  # 45 organizer/class/PHANTOM/policy routes
functions/lib/cgm/routes-activities.ts # 76 activity/group/election/announcement/PHANTOM routes
src/lib/cgm.ts                         # typed client, duplicate guard, offline errors
src/components/ClassGroups/            # ClassGroupsWorkspace (18 areas), StudentPortal,
                                       # RandomGroupReveal (premium random-selection overlay),
                                       # PhantomClasses (oversight), ConnectionBanner
scripts/cgm-tests.mjs                  # 656 API-level checks, 34 sections
scripts/cgm-ui-tests.mjs               # 242 markup-level checks, 21 sections
scripts/cgm-browser-check.mjs          # 25 jsdom browser journeys vs wrangler dev
```
