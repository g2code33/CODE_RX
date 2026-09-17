# CODE Rx SOCIETY — CLIENT PROJECT PORTAL
## PHASE 1: FINAL REPOSITORY, DATABASE & SECURITY SWEEP

**Phase type:** inspection-only. No production code was modified, deleted, refactored, or created.
**Repository state inspected:** branch `arena/01a0b09c-code-rx`, base commit `7a57edd` ("Fit Contact PHANTOM form in viewport").
**Method:** direct source reading of every backend route, schema statement, helper module, and frontend workspace component. Nothing below is assumed from documentation files; documentation was only cross-checked against code.

> **Note on this file:** the only file added in this phase is this report. It is documentation, not production code. No route, table, component, migration, dependency, or configuration was changed.

---

## A. CURRENT ARCHITECTURE

### Stack (verified from `package.json`, `vite.config.ts`, `wrangler.toml`, `functions/**`, `src/**`)

| Layer | Implementation | Evidence |
|---|---|---|
| Public website | React 19 + Vite 7 + Tailwind 4, built to a **single HTML file** (`vite-plugin-singlefile`) | `vite.config.ts`, `package.json` |
| Client-side routing | **Hash routing** + in-page section anchors (`#vault-share`, `#member-vault`, `#activate`, `#reset`, `#codename-ballot`, `#community`, `#phantom-applications`, `#<section>`) | `src/App.tsx` (460 lines), `src/data/mockData.ts` `SECTION_MAP` |
| API | **Cloudflare Pages Functions**, one catch-all `functions/[[path]].ts` (5,781 lines) mounting a **Hono v4.12** app | `functions/[[path]].ts` |
| Database | **D1**, binding `DB`, database `code-rx-db` | `wrangler.toml` |
| Object storage | **R2**, binding `BUCKET`, bucket `code-rx-storage` | `wrangler.toml` |
| Schema management | Code-defined schema + additive migrations in `functions/lib/schema.ts` (1,362 lines): **63 tables, 38 indexes, 43 add-column migrations** | verified by counting statements |
| Auth | PBKDF2-SHA256 passwords + hand-rolled HS256 JWT, 7-day TTL, Bearer tokens | `functions/lib/auth.ts` |
| Deployment | GitHub Actions → `wrangler pages deploy dist --project-name coderxsociety --branch main` on push to `main` | `.github/workflows/deploy.yml` |

### Route surface

`168` `app.<method>()` registrations, **all under `/api/*`**. Non-`/api` requests fall through to static assets with an SPA fallback to `index.html` (`onRequest` at the bottom of `functions/[[path]].ts`). `public/_redirects` deliberately contains **no catch-all rewrite** so `/api/*` is never swallowed.

### Schema application mechanism (critical for Phase 2)

`ensureSchema(env)` (schema.ts) runs once per isolate:

1. **All** `CREATE TABLE IF NOT EXISTS` statements and non-index statements are executed **on every cold start**, unconditionally.
2. Then it compares `system_settings.vault_schema_version` against `VAULT_SCHEMA_VERSION = '2026-08-15-code-rx11-brand-21'`. **Only when they differ** it runs: `runSafeMigrations()` (43 idempotent `ALTER TABLE … ADD COLUMN`, guarded by `PRAGMA table_info`), archive normalization, `CRX-DOC-####` backfill, index creation, role/permission seeding, section seeding, score/CAL seeding, feature-flag seeding, `ensurePhantom()`, codename normalization, then writes the new version marker.

Consequences for the Client Portal:
- A **new table** appended to `SCHEMA` is created automatically on the next cold start.
- A **new index** or **new ALTER on an existing table** requires bumping `VAULT_SCHEMA_VERSION`.
- A **new permission key/section seed** requires the version bump so `seedRolesAndPermissions()` runs.
- Seeding is `INSERT OR IGNORE`, so re-running is safe and PHANTOM customisations are preserved.

### Frontend workspaces (top-level views in `src/App.tsx`)

Public site (`SiteFlow` + section components) · `AuthModal` · member `Dashboard` (Member Portal) · `Vault` (full-page workspace) · `CodenameBallot` · `ActivateAccount` · `ResetPassword` · `VaultSharedDocument` (public share page) · `CommunityHub` (public guest + private member) · `AdminPanel` (Admin Core; workspaces `controller | builder | vault | phantom`) · `PhantomControlCenter` (15 tabs: Overview, Applications, Members, Responsibilities, Permissions, Website Admins, Codenames, Document Sharing, Community Control, Media Management, Calcitonins, Notifications, Audit Logs, Recycle Bin, Settings).

API access from the browser is centralised in `src/lib/cloudflare.ts` (481 lines): a single `apiCall()` that injects `Authorization: Bearer <localStorage codeRx_token>` and typed namespaces `db.*`, `auth`, `uploadFile`, `healthCheck`. **There is no client-side router library and no global state library** — every workspace is local component state.

---

## B. EXISTING AUTHENTICATION SYSTEM

### Member accounts (the only account type that exists today)

| Element | Implementation |
|---|---|
| Account store | `users` (email `UNIQUE`, `password_hash`, `role CHECK ('member','admin','phantom')`) |
| Password hashing | PBKDF2-SHA256, 100,000 iterations, 16-byte random salt, stored as `pbkdf2$100000$<b64url salt>$<b64url hash>`; constant-time compare (`timingSafeEqual`) |
| Session | Stateless **HS256 JWT**, payload `{ sub, email, role, iat, exp }`, TTL `TOKEN_TTL_SECONDS = 7 days`, signed with `env.JWT_SECRET` |
| Transport | `Authorization: Bearer …`; token kept in `localStorage` under `codeRx_token`; **no cookies, no CSRF token surface** |
| Middleware | `requireAuth` (any valid token), `requireAdmin` (role admin/phantom), `requirePhantom` (actor-based, DB-verified), `requireWebsitePermission(key)`, `requireVaultPermission(section, action)` |
| Login | `POST /api/auth/login`, rate-limited **10/min per IP+path**; identifier accepts email **or** normalised phone (`phone_login_key`) **or** claimed codename; requires exactly one matching user → generic 401 (no account enumeration); rejects `locked`, `archived`, `pending_activation`; returns 503 when `JWT_SECRET` is unset |
| Activation | `POST /api/auth/activate`, one-time token: D1 stores **SHA-256 hash only** (`member_activations.token_hash UNIQUE`), 7-day TTL, `used_at`, `revoked_at`; issuing a new invitation revokes all earlier unused ones |
| Password reset | `password_resets` (`token UNIQUE`, `expires_at`, `used`) — **note: this table stores the token itself, not a hash.** This is the weakest existing credential pattern and must not be copied. |
| Other | `/api/auth/me` (re-reads the profile and rejects locked/archived), `/api/auth/change-password` (verifies current password) |

### Session revocation model (important)

There is **no session/token table and no token revocation list**. A JWT cannot be individually invalidated. Instead, **authority is re-derived from the database on every request**:

`requireAuth` → `actorFromContext` → `getActor(db, userId)` → `Actor { profileId, memberStatus, primaryRoleCode, isPhantom, isWebsiteAdmin, … }`.

Every meaningful route then requires `memberStatus === 'active'` (`requireActiveActor`) or re-checks the actor. Therefore PHANTOM locking or archiving a member takes effect **immediately**, even though the JWT stays cryptographically valid. This is the correct precedent for client access: **client credentials must be DB-backed and revocable, not stateless.**

### Non-member credential precedent (closest existing analog to a client passkey)

`community_guest_sessions`: `email`, `email_hash`, `public_handle`, **`token_hash UNIQUE`**, `status CHECK ('active','restricted','banned')`, `expires_at`, `last_seen_at`.
Issued by `POST /api/community/public/enter` (rate-limited 8/min) which returns the **raw token once** and stores only `sha256Hex(token)`. Presented on later requests via the `X-Code-Rx-Community-Guest` header and resolved by `communityPublicIdentity()`:

```sql
SELECT id, public_handle, status FROM community_guest_sessions
WHERE token_hash = ? AND expires_at > CURRENT_TIMESTAMP
```

This is exactly the shape the Client Portal needs (hashed credential, expiry, status, last-seen), and it proves the platform already supports **non-member identities that are completely separate from `users`/`member_profiles`.**

Also relevant: `community_telegram_link_tokens` (hashed, expiring, single-use).

### CORS / transport

`app.use('/api/*', cors(...))` allows origins whose hostname is `localhost`, `127.0.0.1`, or ends in `.pages.dev`; anything else gets an empty origin (browser-blocked). Same-origin is the norm in production.
**Sandbox/preview note:** a `*.e2b.app` preview host is **not** in this allowlist, so live cross-origin API testing from a sandbox preview URL will be blocked unless an allowed origin is used. This is a testing detail for Phase 2, not a defect.

---

## C. EXISTING PERMISSION SYSTEM

Four independent, layered mechanisms already exist. All are enforced **server-side**; the frontend only renders what the server allows.

### 1. Role + section permissions (Vault/RBAC)

| Table | Shape |
|---|---|
| `roles` | `code UNIQUE` — seeded: `phantom`, `nexus`, `ghost`, `falcon`, `quantum`, `matrix`, `member`, `custom`; `is_system`, editable `name`/`description` |
| `role_permissions` | PK `(role_id, section_slug)`; booleans `can_view`, `can_create`, `can_edit`, `can_delete`, `can_manage` |
| `member_permission_overrides` | PK `(member_profile_id, section_slug)`; **nullable** booleans that override the role when set |

Evaluation: `hasVaultPermission(db, actor, section, action)` → PHANTOM always `true`; otherwise requires `profileId` + `memberStatus === 'active'`; override wins if non-null, else role row; default deny.

`section_slug` values are the 15 `vault_sections` slugs. **The permission vocabulary is open-ended text**, so a new capability area can be expressed as a new section slug or a new table — no schema change to the mechanism is needed.

### 2. Website administration permission keys

| Table | Shape |
|---|---|
| `website_admins` | `member_profile_id UNIQUE`, `status CHECK ('active','suspended','removed')`, `assigned_by_user_id` |
| `website_admin_permissions` | PK `(website_admin_id, permission_key)`, `allowed` |

Keys (`WEBSITE_PERMISSION_KEYS`): `pages.edit`, `announcements.manage`, `events.manage`, `projects.manage`, `media.upload`, `resources.manage`, `content.manage`.
Evaluation: `hasWebsitePermission(db, actor, key)` → PHANTOM `true`; legacy `role==='admin'` without a `website_admins` row is grandfathered `true`; otherwise the `allowed` flag decides. Enforced by `requireWebsitePermission(key)`.

**This is the natural delegation mechanism for Client Access Center permissions** — it already supports granting selected capabilities to specific members and revoking them individually.

### 3. Sharing capability (global × per-member)

`member_share_permissions(member_profile_id PK, can_share, can_download)` combined with global switches `system_settings.vault_sharing_enabled` and `vault_downloads_enabled` inside `sharingCapability(db, actor)`, which returns `{ globalEnabled, memberEnabled, canShare, downloadsGloballyEnabled, memberDownloadEnabled, canDownload, canManageGlobalDownloads }`. PHANTOM bypasses per-member flags but is still subject to the global switches for public links.

### 4. Delegation of notification sending

`notification_delegates(member_profile_id PK, can_send)` + `canSendNotifications(db, actor)` (PHANTOM always allowed).

### 5. How founding codenames relate to authority

**Founding names confer no permissions by themselves.** `primary_role_code`/`codename` are identity only. Authority comes from the four mechanisms above. Therefore the requirement "*do not assume every founding member automatically receives client-management access*" is **already satisfied by design** — you simply do not grant the new client permission key/section to anyone except PHANTOM until PHANTOM decides.

---

## D. EXISTING PHANTOM / FOUNDING-MEMBER SYSTEM

- PHANTOM identity: `users.role ∈ {'admin','phantom'}` **and/or** `member_profiles.primary_role_id → roles.code = 'phantom'`; surfaced as `actor.isPhantom`. `requirePhantom` re-reads the actor from D1 on every `/api/phantom/*` request.
- Bootstrap: `ensurePhantom(env)` seeds/repairs the founder account from `PHANTOM_EMAIL || ADMIN_EMAIL`; on a fresh database it needs `ADMIN_PASSWORD` (encrypted Cloudflare secret) and creates the `users`, `members`, `member_profiles` rows and claims the `PHANTOM` codename. It never overwrites an existing founder's password.
- Founding identities are rows in `codenames` with `pool='founding'`: `PHANTOM`, `NEXUS`, `GHOST`, `FALCON`, `QUANTUM`, `MATRIX`. PHANTOM can directly assign one (`assignment_source='phantom_direct'`, `member_profiles.codename_path='direct_founding'`) or a `custom` responsibility member can win one through the Founding ballot. Legacy role codes `kernel/signal/pulse/vault` were migrated to `ghost/falcon/quantum/matrix` in place.
- ~60 `/api/phantom/*` routes are PHANTOM-only today: applications, members, activation links, codenames, roles, role permissions, member permission overrides, website admins, vault sections, score rules, CAL levels, notification delegates, community media settings and reports, audit logs, recycle bin, system settings, sharing switches.
- `system_settings` is a generic key/value store (`setting_key PK`, `setting_value`, `updated_by_user_id`, `updated_at`) seeded with `vault_sharing_enabled` and `vault_downloads_enabled`, writable by PHANTOM through `PUT /api/phantom/settings/:key` — which **deliberately refuses** any key matching `/(secret|password|token|api[_-]?key|credential)/i`. Any new client-portal feature flag belongs here and must respect that rule.
- `recycle_bin_items` + `moveToRecycleBin()` already provide PHANTOM-facing soft deletion with restore/purge for several resource types — a reusable pattern if clients/projects are ever deleted.

**Conclusion for §7 of the brief:** PHANTOM full control is native (`isPhantom` short-circuits every check). Delegation to NEXUS/GHOST/FALCON/QUANTUM/MATRIX should reuse `website_admin_permissions` keys or `role_permissions`/`member_permission_overrides`, **not** a new permission engine.

---

## E. EXISTING VAULT SYSTEM

### Structure

- `vault_sections` — 15 seeded slugs (`society, members, meetings, projects, technology, coding, pharmacy-healthcare, media, resources, sops, research, ideas, roadmap, archive, finance`), `is_sensitive` (finance = 1), `sort_order`, `is_archived`. PHANTOM can create/edit sections (`/api/phantom/vault-sections`).
- `vault_documents` — the core internal document:
  - `document_code UNIQUE` = `CRX-DOC-####` (permanent, allocated by `vault_document_sequences`)
  - `section_id → vault_sections`
  - `title`, `content` (derived plain text), `content_json` (block JSON), `content_format`
  - **`status CHECK ('draft','in_review','approved','active','archived')`**
  - `tags_json`, `related_project_id → vault_projects`
  - `word_count`, `last_saved_at`
  - **`visibility CHECK ('section','members','restricted')`**
  - `file_key`, `created_by_member_profile_id`, `updated_by_member_profile_id`
  - `is_archived`, `archived_from_status`, `archived_at`, `created_at`, `updated_at`
- `document_versions` — full immutable snapshots, `UNIQUE(document_id, version_number)`; every create/edit/restore writes a version with a `change_note`.
- `vault_tags`, `vault_document_tags`, `vault_attachments` (R2 `file_key UNIQUE`), `vault_comments`, `vault_activity`.
- Projects: `vault_projects` (title, free-text `status` default `'planning'`, description, lead, github/documentation URLs, timeline, `is_archived`), `vault_project_members`, `vault_project_files`, `vault_tasks`, `meetings` (with `visibility CHECK ('members','restricted')`).

### Content pipeline

Blocks (`paragraph, heading, bulletList, numberedList, checklist, quote, callout, code, divider, table, image, file, formula, embed`) are validated and sanitised **server-side** by `sanitizeRichText()`/`normalizeDocumentContent()` in `functions/lib/vault-document.ts` (allow-list tags, safe hrefs, single permitted span style). Plain text is derived for search and word count. The frontend re-sanitises for rendering in `src/data/vaultEditor.ts`.

### Lifecycle rules already implemented

- "Delete" = **archive**: `is_archived=1`, `status='archived'`, prior status preserved in `archived_from_status`; `POST /api/vault/documents/:id/unarchive` restores it (requires `manage`).
- Changing a status **to** `approved` or `active` requires `manage` permission; setting `archived` via PATCH is explicitly rejected (must use the archive action).
- Editing requires `edit`; viewing requires `view`; attachments require `edit`/`create` on the target section.

### Internal-only enforcement

Every Vault route begins with `requireAuth` then `vaultAccess(c, section, action)` → `hasVaultPermission`. Document reads re-derive the section from the document row (never from the request). Identifiers in URLs are always re-authorised through a join to the owning section. **This is exactly the discipline the Client Portal must copy** (with client ownership replacing section permission).

---

## F. EXISTING DOCUMENT / FILE SYSTEM

### 1. Structured documents (D1, not R2)

The document body is the `content_json` block tree. The **download representation is generated server-side**:

- `printableDocumentHtml(document, sectionTitle)` builds a complete standalone styled HTML document from the blocks (headings, lists, tables, code, callouts, formulas), with a Code Rx green theme, a `kicker` line (`Code Rx Vault · <section>`), the title, a meta line (`CRX-DOC-#### · Created … · Updated …`) and `@media print` rules. **Attachments/image/file blocks are deliberately excluded.**
- `documentDownloadResponse()` returns `text/html; charset=utf-8`, `Content-Disposition: attachment; filename="<code|title>.html"`, `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`.

This existing generator is the single most important reuse point for the mandatory watermarking requirement (see §T).

### 2. Binary uploads (R2, private)

`POST /api/vault/upload` (multipart):
- requires `requireAuth` + section `edit` (when `documentId` present) or `create`;
- `documentId` must belong to the stated section;
- `MAX_UPLOAD_BYTES = 10 MB`;
- MIME allow-list: `image/jpeg, image/png, image/gif, image/webp, image/avif, application/pdf, application/zip, application/json, text/plain, text/csv, text/markdown` — **DOCX/XLSX/PPTX are rejected**;
- magic-byte signature check for images and PDF;
- R2 key: `vault/<section>/<profileId>/<timestamp>-<safeName>`;
- inserts `vault_attachments(document_id, section_id, name, file_key, mime_type, size_bytes, uploaded_by_member_profile_id)`;
- writes `vault_activity('attachment.uploaded')`.

### 3. Protected file reads (R2, private)

`GET /api/vault-files/*` — `requireAuth`; key parsed from the URL; section extracted from the `vault/<section>/…` prefix; `hasVaultPermission(section,'view')` required; streams the R2 object with the stored content type, `private, no-store`, `nosniff`. **There are no signed URLs and the bucket is never publicly exposed.**

### 4. Public media (separate path, must never carry client documents)

`POST /api/upload` (permission `media.upload`) into safe folders (`vault/…` explicitly refused by `publicUploadFolder()`), and `GET /api/files/*` which is **public** with `Cache-Control: public, max-age=3600` but **hard-refuses any key starting with `vault/`**.

### 5. Community attachments

`community_message_attachments` in R2; served by `GET /api/community/attachments/:id` after a conversation-membership check, `inline` disposition, `private, no-store`; deletion is audited.

---

## G. EXISTING TOKEN / SHARING SYSTEM

### `vault_shares` (the existing controlled-publication mechanism)

| Column | Meaning |
|---|---|
| `document_id` | FK `vault_documents` |
| `token_hash UNIQUE` | `sha256Hex(randomToken())`; `randomToken()` = 32 CSPRNG bytes → 64 hex chars |
| `token_ciphertext` | AES-GCM (`functions/lib/share-token.ts`), key derived from `JWT_SECRET` with domain label `code-rx:vault-share-link:v1:` — lets an authorised owner re-copy a link without storing plaintext |
| `created_by_member_profile_id` | owner of the link |
| `status CHECK ('active','revoked')` | revocation |
| `allow_download` | per-link view/download split (precedent for the requirement) |
| `expires_at`, `last_accessed_at`, `created_at` | expiry + usage telemetry |

### Lifecycle

| Action | Route | Authorisation and rules |
|---|---|---|
| List | `GET /api/vault/documents/:id/shares` | document `edit`; owner sees own links, PHANTOM sees all; link URLs are only returned when `token_ciphertext` decrypts **and** `sha256(recovered) === token_hash` |
| Create | `POST /api/vault/documents/:id/shares` | document `edit` + `canShare`; refuses `is_sensitive` and `visibility='restricted'`; expiry ∈ {none, 1, 7, 30, 90 days}; rate limit 20/min |
| Replace | `POST …/shares/:shareId/replace` | rotates `token_hash` + ciphertext → old URL dies immediately (used for legacy hash-only links) |
| Revoke | `POST …/shares/:shareId/revoke` | `status='revoked'` |
| Consume | `GET /api/vault/shares/:token` | rate limit 60/min; global switch on; hash lookup; active; not archived; section not archived; not sensitive; not restricted; not expired; **creator still active and still permitted**; strips image/file blocks and `/api/vault-files/` URLs; updates `last_accessed_at` |
| Download | `GET /api/vault/shares/:token/download` | rate limit 30/min; additionally `allow_download`, global downloads switch, creator `can_download`; returns the generated HTML export |

### What the existing token system already gives us

High-entropy tokens · SHA-256 hashing at rest · optional encrypted recovery · expiry · revocation · server-side re-validation of the creator's current permission on every use · per-link download split · no raw originals exposed (HTML export only, attachments excluded).

### What it does **not** have (gaps the Client Portal must fill itself)

- No **maximum uses / use counter**.
- No **destination scoping** (a share is the whole document; it cannot target a project room, overview, section, letter, report or a specific file).
- No **client binding** — any holder of the URL is authorised.
- No **passkey-gated mode** and no **direct-access mode** as a distinct, explicitly scoped credential.
- No **watermark** on the delivered artifact (the export is branded but not document-specific-stamped).
- No **client identity**, so no per-client isolation, no client activity, no per-client revocation.

---

## H. EXISTING AUDIT / ACTIVITY SYSTEM

### Tables

| Table | Columns | Notes |
|---|---|---|
| `audit_logs` | `actor_user_id`, `actor_member_profile_id`, `action`, `subject_type`, `subject_id TEXT`, `details_json`, `created_at` | indexes on `created_at DESC` and `(subject_type, subject_id)`; **not FK-constrained**, so a client actor cannot be a member profile and still be logged |
| `vault_activity` | `actor_member_profile_id`, `action`, `section_id`, `document_id`, `details_json`, `created_at` | index on `created_at DESC` |

### Writer

`audit(db, actor, action, subjectType, subjectId, details)` truncates every field defensively, stringifies and caps `details_json` at 20,000 chars, **and never throws** — a logging failure is written to `console.error` so a successful operation is never reported as an error. `recordVaultActivity()` writes **both** `vault_activity` and `audit_logs` (with the `vault.` prefix).

### Reader

- `GET /api/vault/activity?limit=` — filtered per visible section.
- `GET /api/phantom/audit-logs?limit=` — PHANTOM only (this is the surface that will display client activity).

### Conventions to follow

Actions are dot-namespaced and event-shaped: `vault.document.shared`, `vault.document.share_revoked`, `vault.document.share_replaced`, `vault.project.created`, `member.activation_issued`, `member.score.automatic_award`, `system.setting.changed`, `community.attachment.deleted`. `subject_type`/`subject_id` are free text, so `subject_type='client_document'`, `subject_id='CRX-DOC-2026-014'` already fits without schema change.

**Verdict: reuse `audit_logs` as the authoritative CLIENT_* event log.** A parallel `client_activity` table is only justified if client traffic volume (e.g. every PROJECT_OPENED/SECTION_OPENED view) would pollute the PHANTOM audit view; in that case the recommendation is a `client_activity` table for high-volume view events **plus** `audit_logs` for security-relevant events (login, key revoked/regenerated, link created/revoked/expired, download, suspend).

### Notifications limitation

`notifications` + `notification_recipients` are keyed to `member_profile_id`. **Clients are not members, so the existing in-app notification system cannot deliver to clients** without either (a) a new recipient identity column, or (b) keeping client-facing notifications out of D1 (email/manual). This is a decision point for Phase 2, not an implementation detail to guess at.

---

## I. EXISTING DATABASE TABLES RELEVANT TO THIS FEATURE

63 tables exist. Those relevant here, with a reuse verdict:

| Table | Relevance | Verdict |
|---|---|---|
| `users`, `members`, `member_profiles` | member identity, status, member codes | **Reuse for staff only. Never store clients here.** |
| `member_activations`, `password_resets` | hashed/single-use credential precedents | Pattern reference. `member_activations` = good pattern; `password_resets` = anti-pattern. |
| `roles`, `role_permissions`, `member_permission_overrides` | permission engine | **Reuse verbatim** for delegated client-management rights. |
| `website_admins`, `website_admin_permissions` | per-key delegation | **Reuse verbatim**; add new client keys. |
| `member_share_permissions` | per-member capability flags | Pattern reference for client-side view/download flags (but clients are not members → new table). |
| `notification_delegates` | delegation flag pattern | Pattern reference. |
| `vault_sections` | section registry + permission slugs | **Reuse**; a client-facing "sections" list is derived from publication records, not from this table. |
| `vault_documents` | internal document source of truth | **Reuse as the source**, never as the client-visible row. |
| `document_versions` | immutable snapshots | **Reuse** — the published client version must pin a specific `version_number`. |
| `vault_document_sequences` | `CRX-DOC-####` allocation | **Reuse the mechanism** (atomic `RETURNING` allocation) for new client project/document sequences. |
| `vault_attachments` | file metadata + `file_key` | **Reuse for storage**; must never leak `file_key` to clients. |
| `vault_tags`, `vault_document_tags`, `vault_comments` | internal-only metadata | **Never expose to clients.** |
| `vault_projects`, `vault_project_members`, `vault_project_files`, `vault_tasks`, `meetings` | internal project workspace | **Never expose directly.** A client project is a separate publication record. |
| `vault_shares` | existing public share links | **Must remain separate** (different trust model). |
| `audit_logs` | audit | **Reuse.** |
| `vault_activity` | Vault activity feed | Reuse only for internal-actor actions; client events belong in `audit_logs` (+ optional `client_activity`). |
| `system_settings` | feature flags | **Reuse** for client-portal master switches. |
| `recycle_bin_items` | PHANTOM soft delete/restore | **Reuse pattern** for archived clients/projects. |
| `community_guest_sessions` | non-member hashed credential + expiry + status | **Pattern to copy exactly** for client access keys/sessions. |
| `notifications`, `notification_recipients` | member inbox | Cannot target clients as-is. |
| `contacts`, `applications`, `subscribers`, `site_content`, `codename*`, `public_forum*`, `public_chat*`, `community_*` | unrelated | Untouched. |

---

## J. EXISTING STORAGE / R2 ARCHITECTURE

- **One bucket**: `code-rx-storage` via binding `BUCKET`.
- **Key namespaces in use:**
  - `vault/<section>/<profileId>/<timestamp>-<name>` — private, section-permission-gated (`/api/vault-files/*`).
  - `community/<…>` — private, conversation-membership-gated (`/api/community/attachments/:id`).
  - `<folder>/<timestamp>-<name>` (default `uploads/`) — **public** via `/api/files/*`; `vault/` prefix refused by the folder validator.
- **No signed URLs, no presigned upload, no public bucket domain, no R2 custom domain, no range-request handling, no lifecycle rules** anywhere in the repository.
- `src/config.ts` exposes `VITE_R2_BUCKET_URL` defaulting to `https://code-rx-storage.r2.cloudflarestorage.com`, but it is **unused for delivery** (no code reads it). A direct storage endpoint has no per-object authorisation — **it must never be introduced for client documents.**
- Serving pattern used everywhere: `await env.BUCKET.get(key)` → `new Response(object.body, headers)` with `private, no-store` for protected objects.
- Uploads are buffered with `await file.arrayBuffer()` (a deliberate choice: the local miniflare R2 emulator cannot persist raw streams) — capped at 10 MB.

**Implication for watermarked client delivery:** the derived client artifact should live under a **new, separate prefix** (e.g. `client-exports/…`) with its own access route, so that no existing rule, prefix check, or future code path can accidentally serve a stamped file as an internal one, or an internal original as a client one.

---

## K. EXISTING ROUTES/API ENDPOINTS RELEVANT TO THIS FEATURE

168 routes exist. The relevant subset, with its actual authorisation:

### Existing member authentication
| Route | Guard |
|---|---|
| `POST /api/auth/login` | rate limit 10/min |
| `POST /api/auth/register` | disabled by design (403) |
| `GET /api/auth/me` | `requireAuth` + profile re-read |
| `POST /api/auth/activate` | one-time hashed token |
| `POST /api/auth/forgot-password`, `POST /api/auth/reset-password` | rate-limited, token + expiry |
| `POST /api/auth/change-password` | `requireAuth` + current password |

### Vault
`GET /api/vault/sections`, `/home`, `/activity`, `/search`, `/tags`, `/documents`, `/documents/:id`, `/documents/:id/download`, `/documents/:id/versions`, `/documents/:id/versions/:version`, `/projects`, `/projects/:id`, `/meetings` — all `requireAuth` + section `view` (or `manage` for archives).
`POST/PATCH/DELETE /api/vault/documents…`, `POST /api/vault/projects…`, `POST /api/vault/projects/:id/tasks`, `POST /api/vault/meetings` — `requireAuth` + `create`/`edit`/`delete`/`manage` (status change to approved/active requires `manage`).

### Sharing
`GET /api/vault/sharing/status` · `GET/POST/PATCH/PUT /api/phantom/sharing`, `/phantom/downloads/global`, `/phantom/members/:id/sharing`, `/phantom/members/:id/downloads` · `GET/POST /api/vault/documents/:id/shares` · `POST …/shares/:shareId/replace`, `…/revoke` · **public** `GET /api/vault/shares/:token`, `GET /api/vault/shares/:token/download`.

### Files
`POST /api/vault/upload` · `GET /api/vault-files/*` (auth + section view) · `POST /api/upload` (permission `media.upload`) · `GET /api/files/*` (**public**, refuses `vault/`) · `GET/DELETE /api/community/attachments/:id` (membership-gated).

### PHANTOM control surfaces that the Client Access Center must sit beside
`GET /api/phantom/overview`, `/applications`, `/members`, `/members/:id/history`, `/members/:id/score-history`, `/roles`, `/roles/:id/permissions`, `/members/:id/permissions`, `/website-admins`, `/vault-sections`, `/codenames`, `/sharing`, `/downloads/global`, `/community/media-settings`, `/community/public/reports`, `/notification-delegates`, `/score-rules`, `/cal-levels`, `/settings`, `/audit-logs`, `/recycle-bin` — all `requireAuth` + `requirePhantom`.

### Notifications
`GET /api/notifications`, `/notifications/audience`, `/notifications/sent`, `POST /api/notifications/send`, `PATCH/DELETE` variants — `requireAuth` + active actor + `canSendNotifications`.

---

## L. EXISTING UI COMPONENTS THAT CAN BE REUSED

| Component | Size | Reuse for the Client Portal |
|---|---|---|
| `src/components/VaultSharedDocument.tsx` | 83 lines | **The strongest reuse candidate.** It is already a complete, branded, public, non-member document reader: hash-token extraction (`#vault-share?token=`), branded header with the Code Rx logo, `SharedBlock` block renderer, download/print gating driven by server flags, print stylesheet, friendly error states. The client document viewer should be this component's structure, hardened. |
| `src/data/vaultEditor.ts` | 256 lines | `parseDocumentContent`, `sanitizeVaultRichText`, `safeVaultResourceUrl`, `VaultBlock` types — client-side rendering helpers. |
| `src/components/VaultShareDialog.tsx` | 285 lines | Expiry selector UX, copy-to-clipboard with feedback, "existing links" list, revoke/replace, capability-driven messaging — directly adaptable to client passkeys and temporary links. |
| `src/components/Vault.tsx` | 117 lines | Full-page workspace shell + CSS class vocabulary (`vault-page`, `vault-navigation`, `vault-table-wrap`, `vault-status-pill`, …) in `src/index.css`. |
| `src/components/PhantomControlCenter.tsx` | 668 lines | The 15-tab founder workspace with sidebar, lazy per-tab loading (`loadedTabs`), background refresh, and the shared `load()` pattern. A **"Client Access Center" tab is a single `TABS` entry + one branch** in this component's render tree — no architectural change. |
| `src/components/RecentItems.tsx` | 22 lines | "Show 3, then Show more" convention already used for activity/history lists. |
| `src/components/Dashboard.tsx` | 93 lines | Member portal shell (sticky header, sidebar, mobile drawer) as a layout reference for the client portal chrome. |
| `src/components/NotificationCenter.tsx`, `ActivateAccount.tsx`, `ResetPassword.tsx` | — | Patterns for handling a one-time credential in the URL hash and for inbox/announcement display. |
| `src/lib/cloudflare.ts` | 481 lines | Add namespaces only; `apiCall()` itself needs no change. |

**Important architectural note:** `VaultSharedDocument` renders **outside** the public Navbar/Footer flow (App.tsx swaps the whole view). The Client Portal must follow the same pattern — it must not be a public site section.

---

## M. WHAT CAN BE EXTENDED

Everything below is proven reusable **without changing existing behaviour**:

1. **Permission engine** — add new `website_admin_permissions` keys (e.g. `clients.manage`, `clients.publish`, `clients.links`, `clients.preview`) and/or a new `vault_sections`-style capability slug with `role_permissions` rows. PHANTOM remains full-control by default because `isPhantom` short-circuits.
2. **Audit** — `audit()` accepts any `subject_type`/`subject_id`; `subject_id` is `TEXT` so `CRX-PROJ-2026-001` fits. `subject_type='client'`, `'client_project'`, `'client_document'`, `'client_key'`, `'client_link'`.
3. **Credential primitives** — `randomToken()` (32 CSPRNG bytes), `sha256Hex()`, and the AES-GCM helpers in `functions/lib/share-token.ts` (reuse the code, **with a new domain label**, e.g. `code-rx:client-link:v1:` / `code-rx:client-key:v1:`).
4. **Guest-identity pattern** — `community_guest_sessions` (hash + expiry + status + last-seen) is a working precedent for non-member identities.
5. **Identifier allocation** — `allocateDocumentCode()`'s atomic `UPDATE … RETURNING` sequence pattern is reusable for `CRX-PROJ-…`, `CRX-LTR-…`, `CRX-RPT-…` sequences (new sequence rows, same mechanism).
6. **Download representation** — `printableDocumentHtml()` + `documentDownloadResponse()` are the correct hook for the mandatory watermark (see §T).
7. **File delivery** — the `/api/vault-files/*` pattern (parse key → authorise → stream from R2 with `no-store`) is the model for a client-files route with client-scoped authorisation.
8. **Feature flags** — `system_settings` (with the secret-name refusal already enforced).
9. **Rate limiting** — `checkRateLimit(c, limit, window)` for public client endpoints, **with the caveat that it is per-isolate and in-memory** (see §S).
10. **Soft delete / restore** — `recycle_bin_items` + `moveToRecycleBin()` for archived clients/projects if PHANTOM deletion UX is wanted later.
11. **UI** — the components in §L.

---

## N. WHAT MUST REMAIN SEPARATE

These are hard architectural boundaries, each justified by an existing mechanism that would otherwise leak:

| Must remain separate | Why (concrete consequence of reusing) |
|---|---|
| **Clients must NOT be rows in `users`, `members`, or `member_profiles`** | Client rows would appear in `GET /api/members`, `/api/phantom/members`, the CAL leaderboard (`/api/members/leaderboard` queries active `member_profiles`), notification audiences (`activeNotificationRecipients` selects active profiles), community member lists, codename ballots, and Website Admin delegation. They would also inherit Vault permission evaluation. |
| **Client-visible documents must NOT be the `vault_documents` row itself** | A publication must pin a specific `document_versions` snapshot. Otherwise an internal edit (including a draft or internal-only note) silently changes what a client sees. |
| **Client sessions must NOT use the member JWT** | `JwtPayload.role` is `member|admin|phantom` and the JWT has no revocation. A client token would be indistinguishable from a member token to `requireAuth`, and suspension could not take effect immediately. |
| **Client documents must NEVER be served from `/api/files/*` or via the R2 public endpoint** | That path is public with `Cache-Control: public, max-age=3600` and no per-object authorisation. |
| **Reuse of `vault_shares` for clients is not acceptable** | A `vault_shares` row is bound only to a document and is authorised by possession. It cannot express "this client, this project, view but not download, max 5 uses". Bolting client semantics onto it would weaken the existing share model and risk regressions in a working production feature. |
| **`vault_activity`** | It is keyed to `member_profile_id` and is rendered in the Vault home feed filtered by *section* permission; mixing client traffic into it would create a cross-client visibility risk in the internal feed. |
| **`vault_attachments.file_key` and `/api/vault-files/<section>/…` URLs must never reach a client** | The key prefix encodes the internal section and authorises via section permission. |
| **Internal `vault_documents.status` semantics** | `draft/in_review/approved/active/archived` is an internal workflow. `PUBLISHED`/`UNPUBLISHED` must not be crammed into it (see §14 verdict below). |
| **`vault_sharing_enabled` / `vault_downloads_enabled` switches** | The Client Portal needs its **own** master switches. Reusing these would mean pausing internal sharing also pauses (or fails to pause) the client portal. |

### Verdict on §14 of the brief (document lifecycle DRAFT → IN REVIEW → APPROVED → PUBLISHED → UNPUBLISHED → ARCHIVED)

The existing Vault status system **can be safely extended in spirit but not by mutating `vault_documents.status`**. The `CHECK` constraint allows only `draft, in_review, approved, active, archived`; adding values requires a table rebuild on D1 (not a simple `ALTER`), which violates the "do not change working database structures unnecessarily" rule. The secure mapping is:

- Internal lifecycle stays exactly as-is (`draft → in_review → approved → active`, archive via the archive action).
- Client visibility gets a **separate publication state** on the new client-document table: `DRAFT | PUBLISHED | UNPUBLISHED | ARCHIVED`, where a client-visible document must additionally reference an internal document **and** an internal snapshot version that was `approved` at publication time.

This satisfies "only PUBLISHED documents are client-visible" without touching a production state machine.

---

## O. WHAT MUST ACTUALLY BE CREATED

Proposed additive set (each item justified by §N — nothing here duplicates an existing mechanism):

### Database (new tables only; no ALTER on existing tables)

1. `client_sequences` — single-row sequence table (same mechanism as `member_sequences` / `vault_document_sequences`) for `CRX-PROJ-…`, `CRX-DOC-…`, `CRX-LTR-…`, `CRX-RPT-…`. *(existing sequences cannot carry new prefixes)*
2. `clients` — the client entity: `public_id` (opaque, UNIQUE), `name`, `company`, `contact_email`, `status CHECK ('active','suspended','archived')`, `notes` (internal-only), `created_by_user_id`, `created_at`, `updated_at`, `suspended_at`, `archived_at`.
3. `client_projects` — `client_id`, `public_id`, `code` (`CRX-PROJ-YYYY-NNN`), `title`, `summary` (client-facing), `status`, `is_archived`, `sort_order`, timestamps.
4. `client_documents` — the **publication record**: `client_id`, `client_project_id`, `internal_document_id → vault_documents`, `internal_version_number → document_versions`, `public_id`, `code`, `kind CHECK ('document','letter','agreement','report','deliverable','update')`, `title`, `summary`, `publication_state CHECK ('DRAFT','PUBLISHED','UNPUBLISHED','ARCHIVED')`, `snapshot_json` (frozen client-facing content), `snapshot_version`, `allow_view`, `allow_download`, `published_at`, `published_by_user_id`, timestamps.
5. `client_access_keys` — the passkey: `client_id`, `key_hash UNIQUE` (SHA-256), `key_ciphertext` (AES-GCM, separate domain label, only for PHANTOM re-copy), `label`, `status CHECK ('active','revoked')`, `expires_at`, `last_used_at`, `created_by_user_id`, `revoked_at`.
6. `client_sessions` — `client_id`, `access_key_id`, `session_hash UNIQUE`, `expires_at`, `revoked_at`, `last_seen_at`, `ip_hash`, `user_agent_hash`. **DB-backed and revocable** — the single most important table for §12 (suspend/revoke).
7. `client_links` — temporary links: `client_id`, `client_project_id`, `client_document_id`, `destination_type CHECK ('project','overview','documents','letters','agreements','reports','deliverables','updates','document','file')`, `destination_id`, `mode CHECK ('passkey','direct')`, `token_hash UNIQUE`, `token_ciphertext`, `allow_view`, `allow_download`, `max_uses`, `use_count`, `expires_at`, `status CHECK ('active','revoked','expired')`, `created_by_user_id`, `last_used_at`.
8. `client_link_sessions` — short-lived, link-scoped read sessions for **Mode 2** (direct access): `client_link_id`, `client_id`, `token_hash UNIQUE`, `expires_at`, `revoked_at`.
9. `client_exports` — the stamped-artifact registry: `client_document_id`, `client_id`, `format`, `r2_key`, `watermark_version`, `generated_at`, `generated_by_user_id`, `size_bytes`. *(Proves every delivered file is a stamped derivative, and makes regeneration/invalidation explicit.)*
10. `client_activity` — **only if** high-volume client view telemetry would pollute `audit_logs`; otherwise omit and use `audit_logs` alone. Recommended: create it, keep `audit_logs` for security events.

### Seeds / configuration (via the existing seeding path)

- `system_settings`: `client_portal_enabled` (`0` default), `client_downloads_enabled` (`0` default). **Do not reuse the vault switches.**
- `website_admin_permissions` keys: `clients.manage`, `clients.publish`, `clients.links`, `clients.preview` (granted to nobody by default; PHANTOM is implicitly allowed).
- Optional `role_permissions` rows for clients-area capability if section-style delegation is preferred over key-style.

### Backend

- `functions/lib/client-portal.ts` (new) — client-scoped authorisation helpers, publication helpers, watermark generation.
- `functions/lib/client-auth.ts` (new) — passkey/session/link credential issue, hash, verify, revoke, cascade.
- An additive route block inside `functions/[[path]].ts` (or a mounted sub-app) for `/api/client/*` (public) and `/api/phantom/clients*` (PHANTOM/delegated).

### Frontend

- `src/components/ClientAccess.tsx` — the `CRX-____-____-____` entry screen.
- `src/components/ClientPortal.tsx` — project list + project room shell.
- `src/components/ClientProjectRoom.tsx` — Overview/Documents/Letters/Agreements/Reports/Deliverables/Updates sections.
- `src/components/ClientDocumentView.tsx` — watermarked reader (built from `VaultSharedDocument`'s structure).
- `src/components/ClientAccessCenter.tsx` — the PHANTOM tab (clients, projects, publication, keys, links, activity, preview).
- `src/components/ClientPublishDialog.tsx` — publish-from-Vault UX (mirrors `VaultShareDialog`).
- `db.client.*` and `db.phantom.clients*` namespaces in `src/lib/cloudflare.ts`.
- Hash routes `#client-access`, `#client-portal`, `#client/...` in `src/App.tsx`.

---

## P. PROPOSED MINIMAL DATABASE CHANGES

### Mechanism (no new tooling)

1. Append the `CREATE TABLE IF NOT EXISTS` statements to the `SCHEMA` template literal in `functions/lib/schema.ts` (they run on the next cold start).
2. Append the new `CREATE INDEX IF NOT EXISTS` statements **inside `SCHEMA`** and — because index creation is version-gated — bump `VAULT_SCHEMA_VERSION` so the index block actually executes.
3. Add the new `system_settings` seeds to the existing `seedFeatureSettings()` (`INSERT OR IGNORE`).
4. Add the new permission keys to `WEBSITE_PERMISSION_KEYS` in `functions/[[path]].ts` and seed them through the existing `website_admin_permissions` write path.
5. **No `ALTER TABLE` on any existing table.**

### Verbatim reuse rules inside the new DDL

- Copy the `community_guest_sessions` credential shape: `token_hash TEXT NOT NULL UNIQUE`, `status` CHECK, `expires_at`, `last_seen_at`.
- Copy the `vault_shares` recovery shape: `token_ciphertext TEXT` (nullable) with an integrity check on recovery.
- Copy FK style (`FOREIGN KEY(x) REFERENCES y(id)`) and CHECK-constrained enums.
- Client-facing URLs use `public_id TEXT NOT NULL UNIQUE` (random, opaque) — **never** the autoincrement `id`.

### Why each table cannot be replaced by an existing one

| New table | Existing equivalent considered | Why rejected |
|---|---|---|
| `clients` | `members`/`member_profiles` | §N — would leak into member listings, leaderboards, notifications, Vault permissions. Also `member_profiles.status` CHECK lacks a client suspend semantic and the row is FK-anchored to `users`. |
| `client_projects` | `vault_projects` | `vault_projects` is internal, gated by the `projects` section permission, listed in the Vault workspace and searchable by all members with that section view. Client projects need client-scoped isolation and client-facing fields. |
| `client_documents` | `vault_documents` + `vault_shares` | §N/§14 — a publication must pin an internal version and carry view/download split, kind, and its own state machine. |
| `client_access_keys` | `member_activations` / `password_resets` | `member_activations` is FK-bound to `member_profiles`; neither supports re-usable, non-expiring-by-default client passkeys with revoke/regenerate. Pattern is reused, table is not. |
| `client_sessions` | JWT | §N — the JWT cannot be revoked and its `role` enum has no client value. |
| `client_links` | `vault_shares` | §N — no max-uses, no destination scoping, no mode, no client binding. |
| `client_link_sessions` | `community_telegram_link_tokens` | Single-use and Telegram-scoped; unrelated semantics. |
| `client_exports` | none | Proves provenance of every stamped file; nothing equivalent exists. |
| `client_activity` | `audit_logs`, `vault_activity` | Optional. `audit_logs` is the fallback if volume is acceptable; `vault_activity` is excluded by §N. |

### Index plan (matching the existing style)

`clients(public_id)`, `clients(status)`, `client_projects(client_id, is_archived)`, `client_projects(code)`, `client_documents(client_id, client_project_id, publication_state)`, `client_documents(public_id)`, `client_access_keys(key_hash)`, `client_access_keys(client_id, status)`, `client_sessions(session_hash)`, `client_sessions(client_id, revoked_at, expires_at)`, `client_links(token_hash)`, `client_links(client_id, status, expires_at)`, `client_link_sessions(token_hash)`, `client_exports(client_document_id, format)`, `client_activity(client_id, created_at DESC)`.

---

## Q. PROPOSED MINIMAL BACKEND CHANGES

1. **New modules only for logic that doesn't exist** (`client-portal.ts`, `client-auth.ts`). Reuse, without modification: `randomToken()`, `sha256Hex()`, `audit()`, `cleanStr/cleanEmail/cleanOptionalStr`, `checkRateLimit`, `actorFromContext`/`requirePhantom`, `hasWebsitePermission`, `encryptVaultShareToken`/`decryptVaultShareToken`'s **implementation** (copy the file's helpers into a client-labelled key derivation — do not edit `share-token.ts`).
2. **Route block appended** to `functions/[[path]].ts` before the R2 section, containing:
   - **Public client endpoints** (`/api/client/*`) guarded by a new `requireClientSession` / link-resolution middleware that **never** trusts URL ids: the client id comes from the resolved session only.
   - **Management endpoints** (`/api/phantom/clients*`) guarded by `requireAuth` + `requirePhantom` OR a new `requireClientPermission(key)` built on `hasWebsitePermission`.
3. **Publication service**: creating/updating a client document snapshots the referenced internal `document_versions` row into `client_documents.snapshot_json` + `snapshot_version`. Unpublishing flips state and **invalidates `client_exports` rows**. No automatic publication from any internal action — publication is always explicit (§4 and §14 of the brief).
4. **Suspension cascade** (one helper, one transaction-ish batch): `UPDATE client_access_keys SET status='revoked'`, `UPDATE client_sessions SET revoked_at=CURRENT_TIMESTAMP`, `UPDATE client_links SET status='revoked'`, `UPDATE client_link_sessions SET revoked_at=CURRENT_TIMESTAMP` — all scoped to the client. Client status is **also** re-checked on every client request, so a link cannot survive on its own state alone.
5. **Rate limiting**: reuse `checkRateLimit` for cheap protection, but add a **D1-backed attempt counter** for `/api/client/auth` because the in-memory limiter is per-isolate (see §S-3).
6. **Audit**: call `audit()` for `client.login`, `client.login_failed`, `client.logout`, `client.access_key.revoked`, `client.access_key.regenerated`, `client.link.created`, `client.link.used`, `client.link.revoked`, `client.link.expired`, `client.document.viewed`, `client.document.downloaded`, `client.project.opened`, `client.section.opened`, `client.suspended`, `client.access.revoked_all`, `client.preview.started`.
7. **Do not modify a single existing route handler, guard, or helper.** The only edits to existing non-schema code should be: importing the new routes, and extending `WEBSITE_PERMISSION_KEYS`.

---

## R. PROPOSED MINIMAL FRONTEND CHANGES

1. `src/App.tsx` — add three flags mirroring the existing `isSharedVaultView` pattern (`isClientAccessView`, `isClientPortalView`, `isClientPreviewView`), hash handlers for `#client-access` / `#client-portal`, and the same "clear the other workspace flags" discipline already used at lines 137–199. **No change to the public site, dashboard, admin, or Vault flows.**
2. `src/lib/cloudflare.ts` — add `db.client.*` (public endpoints, using a client-session token key that is **separate** from `codeRx_token`) and `db.phantom.clients*`. `apiCall()` stays untouched; add a small `clientApiCall()` beside it that reads a distinct storage key so a member session and a client session can never be confused.
3. New components (§O). `ClientDocumentView` should be a hardened derivative of `VaultSharedDocument`'s structure rather than a modification of it — the public share page must not be able to regress.
4. `src/components/PhantomControlCenter.tsx` — one `TABS` entry (`['clients','Client Access Center', KeyRound]`) and one render branch. Its lazy `loadedTabs` loader already handles the new tab.
5. `src/components/VaultDocumentEditor.tsx` or the Vault document actions — an additive **"Publish to client"** action that opens `ClientPublishDialog`. No change to the editor's save path.
6. `src/index.css` — additive `client-*` classes; the watermark and print rules for the client reader.
7. **No dependency changes** unless PDF stamping is approved (then `pdf-lib` only). No routing library. No state library.

---

## S. SECURITY RISKS / THINGS TO WATCH

1. **Client isolation / IDOR (brief §15).** Every client-scoped query must reach the client id **only** from the resolved session/link, and must join through ownership: `… WHERE cd.public_id = ? AND cp.client_id = ?` with `client_id` from the session. Changing an id in a URL must produce a 404, never another client's data. Opaque `public_id` values (not sequential ids) prevent enumeration by guessing.
2. **Uniform failure responses.** `authenticate` and resource fetches must return the same status/body for "not found", "wrong client", "unpublished", and "revoked" — otherwise the error message becomes an enumeration oracle.
3. **Passkey brute force.** The example format `CRX-8K4P-X92M-7LQF` is 12 characters from a ~32-symbol alphabet ≈ 60 bits. That is **not enough** on its own for a credential that is the only factor in front of a project room. Mitigation: generate the key from at least 128 bits of entropy (`randomToken()` is already 256 bits; a 16-character base32 form ≈ 80 bits, so prefer ≥ 20 characters), **plus** per-key and per-IP attempt limits backed by **D1, not just the in-memory limiter** — `checkRateLimit` is per-isolate (`functions/lib/rate-limit.ts` documents this) and therefore unreliable against a distributed guesser. Add a temporary lockout after N failures per key and per IP window.
4. **In-memory rate limiting everywhere.** `store` is a module-level `Map` per isolate. Acceptable for casual spam (its stated purpose); **not** acceptable as the only protection on client login. Use it as a first layer and add a D1 counter for the second.
5. **Never store raw credentials.** `key_hash` = SHA-256; the optional `key_ciphertext` (AES-GCM, **separate domain label** from `code-rx:vault-share-link:v1:`) exists only so an authorised user can re-copy a key. Recovery must verify `sha256(recovered) === key_hash` before returning it, exactly as `recoverVaultShareUrl()` does today. Never copy the `password_resets` pattern (raw token in the table).
6. **Session revocation must be real.** Client sessions are D1 rows with `revoked_at` and `expires_at`; every request re-reads status. Suspend/revoke-all must cascade to keys, sessions, links and link sessions (§Q-4). A previously issued direct link **must stop working** the moment the client is suspended — this is achieved by the mandatory parent-status check, not by hoping the link row was updated.
7. **Never authorise from a URL fragment, query parameter, or body id alone.** The only authority is the server-side row resolved from the presented credential.
8. **Watermarking must be server-side and non-bypassable.** No client response may contain a URL, key, or id that resolves to the internal R2 object or to a `content_json` payload the client could render themselves without the stamp. If the payload is the data, the stamp must be part of the payload the server builds on the way out (§T).
9. **Caching and CDN.** Every client response: `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`. `public/sw.js` caches only `/`, `index.html` and the logos and states that API requests are never cached — **keep client portal routes out of any service-worker cache** and re-verify this when client components are added.
10. **Referrer leakage.** `#vault-share` uses hash routing precisely so tokens don't reach servers via `Referer`. Client access and temporary links must do the same: put credentials in the **hash**, not the query string.
11. **Preview-as-client must not create durable authority.** "Preview as client" must run through the same server-side authorisation with an explicit `preview` flag on the actor, render only `PUBLISHED` items, and never mint a real access key or a session that outlives the preview. It must be impossible for a preview to see `DRAFT`, `UNPUBLISHED`, internal notes, other clients, or Vault records — the safest implementation is a read-only projection endpoint (`/api/phantom/clients/:id/preview/...`) rather than reusing the client session endpoint with a flag.
12. **Sensitive/restricted inheritance.** The existing rule "sensitive or restricted documents cannot be shared publicly" (`is_sensitive`, `visibility='restricted'`) must apply to client publication too, and the check must be re-evaluated **at delivery time**, not only at publish time.
13. **Attachment exclusion default.** The existing share endpoint deliberately strips `image`/`file` blocks and `/api/vault-files/` URLs. The client reader must do the same unless a specific file has been individually published, stamped, and granted download.
14. **Side channels.** `sendEmail()`/EmailJS is shared with activation and reset mail. Do not silently route client passkeys through the general template; follow the activation-link precedent (return the key once to the authorised creator, log the delivery status) until delivery is deliberately designed.
15. **CORS allowlist.** `*.pages.dev` origins are permitted for `/api/*`. Authorisation is server-side so this is not a direct vulnerability, but it means cross-site requests from any pages.dev app are accepted — every client endpoint must therefore be **stateless-authority** (credential in header/hash, verified server-side), never origin-trusting.
16. **Audit must record failures too**, especially failed key attempts and rejected link uses, and must never log the raw key/token — log the credential's row id and a short hash prefix at most.
17. **Existing feature-flag breadth.** `system_settings` is PHANTOM-readable in full (secrets masked) and PHANTOM-writable except secret-like keys. Client portal flags are non-secret and fine; client *credentials* must never be stored there.
18. **Sequence leakage.** `CRX-PROJ-2026-001` reveals volume/order. That is acceptable for internal references shown to the owning client, but the **URL identifier** must be the opaque `public_id`, with the human code displayed only inside the authorised page.
19. **`/api/vault-files/*` prefix parsing.** It authorises on the section parsed from the key prefix. Any new client file route must authorise on a **client-scoped table row**, never on a key prefix.
20. **Regression risk in shared helpers.** `audit()`, `sharingCapability()`, `hasVaultPermission()` and `documentDownloadResponse()` are used by working production features. Phase 2 must treat them as frozen; the watermark must be applied by a **client-specific** generator, not by adding parameters to the internal export path.

---

## T. WATERMARKING / FILE-DELIVERY STRATEGY

**Mandatory rule (from the brief):** every client-facing document carries Code Rx branding, always; the client must not be able to obtain the untouched internal original; and if a format cannot be reliably stamped, the untouched original is **not exposed**.

### The single most important finding

The platform **already generates the client-facing representation server-side** — `printableDocumentHtml(document, sectionTitle)` in `functions/[[path]].ts` converts the stored block tree into a standalone HTML document, and attachments are already excluded from it. **Watermarking native Code Rx documents is therefore natively enforceable**: there is no "original file" to leak for a structured document, because the client never receives a file that exists inside the Vault. The stamp is added by the server at delivery time, inside the generator, and the client cannot remove it without re-authoring the document.

### Strategy per file type

| Type | Verdict | Implementation |
|---|---|---|
| **Native structured document** (the dominant case: documents, letters, reports, agreements written in the Vault) | **Fully enforceable, recommended default** | Extend the **client** generator (a client-labelled derivative of `printableDocumentHtml`, not a modification of the internal one) to always emit: (a) a branded header block with the logo, "CODE Rx SOCIETY", the `CLIENT PROJECT DOCUMENT` designation; (b) a metadata block — project name, document name, reference code, version, publication date, and generating client; (c) a repeated footer line `CODE Rx SOCIETY • CLIENT DOCUMENT • <code> • v<version>`; (d) an optional low-contrast diagonal logo/section watermark layer; (e) a print stylesheet (`@page` margin + fixed footer) so the watermark survives "Print to PDF". Embed the logo as an **inline data URI** (the current export references no external asset, and a downloaded standalone HTML cannot load `/CODE%20RX11.png` offline). |
| **PDF uploaded as an attachment** | **Conditional** | Stamping requires a PDF library; none is installed. Recommended: add `pdf-lib` (pure JS, Web Crypto friendly) and stamp **once at publication time** (header/footer text + logo `PNG` + optional per-page diagonal watermark + the client-specific fingerprint), store the stamped derivative in R2 under `client-exports/<client>/<document>/<hash>.pdf`, register it in `client_exports`, and serve **only** the derivative. If adding the dependency is not approved, the fallback is: **do not expose the PDF original** — expose a generated watermarked HTML/printable representation (cover page + reference + metadata + "the downloadable stamped copy is not available for this file type") until stamping is implemented. |
| **Image attachments** (jpg/png/gif/webp/avif) | **Not stampable in this environment** | No image manipulation library exists in the runtime. Rule: **do not expose image files as client downloads.** Either render them inside the watermarked generated document (with the watermark overlaid by the HTML/CSS layer, which is acceptable for *display* because no original bytes are sent), or exclude them. Never serve the original bytes with only a CSS overlay. |
| **Office formats (DOCX/XLSX/PPTX)** | **Already blocked** | `/api/vault/upload` rejects them today (`SAFE_UPLOAD_MIME_TYPES`). Keep this. There is no converter in the environment; exposing an unstamped Office original is prohibited by the brief. |
| **ZIP** | **Must never be exposed to clients** | Archives cannot be stamped and would trivially bypass every control. Currently accepted for internal Vault uploads only. |
| **Plain text / CSV / Markdown / JSON** | **Not stampable as-is** | Deliver as a **generated** watermarked HTML/printable document (the block pipeline already does this) rather than as a downloadable raw file. If a CSV must be delivered as data, prepend stamped header rows carrying the Code Rx/project/document/version/client lines — but the default should be the HTML representation. |
| **Any other/future type** | **Deny by default** | Unknown MIME → not client-exposable until a stamping strategy is proven for it. |

### Rules that make the strategy non-bypassable

1. The client **never** receives a `vault/…` R2 key, a `/api/vault-files/…` URL, a `/api/files/…` URL, or any presigned storage URL.
2. Stamping happens **server-side on the way out** for generated documents, and **once at publication** for binary derivatives. Frontend CSS is never the watermark.
3. Every stamped artifact carries the **document reference code + version + client designation + generation timestamp**, so a leaked copy is attributable and version-identifiable.
4. Recommended enhancement: embed a **per-client fingerprint** (client code + first 8 chars of the credential's hash) in the footer. This makes it possible to attribute a leak to the specific client/key rather than merely proving Code Rx ownership.
5. A stamped derivative is **invalidated** (and regenerated) whenever the publication is updated, unpublished, or the watermark version changes; `client_exports.watermark_version` makes this explicit and auditable.
6. The internal `/api/vault/documents/:id/download` path **must not change** — it serves internal users and must not gain the client watermark or lose any existing behaviour.
7. Generated client documents must strip internal-only metadata: internal author names, Vault section titles, internal tags, internal comments, internal project/task data, `vault_activity`.
8. If the runtime cost of stamping is a concern, generation happens at **publication** time (PHANTOM action), never in the client's request path — this also makes the artifact auditable and cacheable under `private, no-store`.

---

## U. TEMPORARY DIRECT-LINK SECURITY MODEL

### Two modes

```
MODE 1 — PASSKEY REQUIRED                 MODE 2 — DIRECT ACCESS
Temporary link                            Temporary link
      |                                          |
      v                                          v
Client access authentication              Secure token validation (server-side)
      |                                          |
      v                                          v
Specific authorized destination            Scoped, short-lived link session
                                                   |
                                                   v
                                          Specific authorized destination
```

### Credential design (both modes)

- Token = `randomToken()` (32 CSPRNG bytes, 64 hex) or an equivalent ≥128-bit URL-safe encoding. Never a sequential/predictable value.
- D1 stores **`token_hash` = SHA-256(token)**, `UNIQUE`.
- Optional `token_ciphertext` = AES-GCM, **separate domain label** (e.g. `code-rx:client-link:v1:`), with an integrity check on recovery.
- Scope is a **row**, not a URL: `client_id`, `client_project_id`, `client_document_id`, `destination_type`, `destination_id`, `mode`, `allow_view`, `allow_download`, `max_uses`, `expires_at`, `status`.

### Mandatory server-side validation order (every link use)

1. Rate limit (in-memory first layer + D1-backed counter for repeated failures against the same token prefix/IP).
2. Format check → `sha256Hex(token)` lookup → **miss = uniform 404**.
3. Link row: `status = 'active'` **and** (`expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP`) **and** (`max_uses IS NULL OR use_count < max_uses`).
4. **Parent client**: `clients.status = 'active'` (not `suspended`, not `archived`) — this alone fulfils "a previously issued direct link must not keep working after access is revoked".
5. **Parent project**: not archived.
6. **Destination**: if the destination is a document, `publication_state = 'PUBLISHED'` **and** `allow_view = 1`; if the destination is a project/room/section, the project is `PUBLISHED` and the section is among the client-visible sections.
7. **Action-specific permission**: download requires `link.allow_download = 1` **and** `client_documents.allow_download = 1` **and** the client-portal download master switch on.
8. **Scope match**: the requested resource must equal (or be contained by) the link's `destination_type` + `destination_id`. A link scoped to "Overview" must not open "Reports"; a link scoped to one document must not enumerate the project's other documents.
9. **Atomic use increment** (concurrency-safe):
   ```sql
   UPDATE client_links SET use_count = use_count + 1, last_used_at = CURRENT_TIMESTAMP
   WHERE id = ? AND status = 'active'
     AND (max_uses IS NULL OR use_count < max_uses)
     AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
   ```
   then require `meta.changes === 1` (this is the same "check changes" discipline the existing `/replace` and `/revoke` handlers use). If `0`, deny — this closes the concurrent-use race that a read-then-write would allow.
10. `audit()` the outcome, including refusals (`client.link.used` / `client.link.denied` / `client.link.expired`).

### Mode-specific rules

**Mode 1 (passkey required).** The link resolves to a *destination hint* only. Access requires a valid `client_sessions` row for the **same** `client_id` as the link. A link belonging to Client A presented by a session for Client B must fail with the uniform 404 (never a 403 that reveals the mismatch).

**Mode 2 (direct access).** The token itself is the credential for a **read-only, scoped, short-lived** session:
- On first valid use, create a `client_link_sessions` row (`client_link_id`, `client_id`, `token_hash`, `expires_at` ≈ 30–60 minutes, `revoked_at` nullable) and return a link-session token.
- Every subsequent request re-validates the link-session row **and re-runs steps 3–8 above**, so `use_count`, expiry, revocation, client suspension, unpublishing and permission changes all take effect mid-session.
- The link session can never elevate to full portal access: it is bound to one destination scope, is read-only, cannot create a client session, and cannot be refreshed into a passkey session.
- Suggested hardening: bind the link session to a coarse client fingerprint (hashed IP, hashed user agent) recorded at first use, and require a match on later requests. If the platform is used behind mobile networks where IP changes, use a short TTL instead.

### Explicit prohibitions

- Never authorise because a `client_id`, `project_id`, `document_id`, `link_id`, or `token` appears in a URL/body.
- Never return a link's destination list, sibling documents, sibling projects, or any other client's identifiers to a link-scoped caller.
- Never allow a link to be "upgraded" into a passkey session or vice versa.
- Never let a link bypass the `clients.status` check.

---

## V. EXACT FILES THAT WOULD NEED TO CHANGE (Phase 2)

| File | Change type | What changes |
|---|---|---|
| `functions/lib/schema.ts` | **Edit (additive)** | Append new `CREATE TABLE`/`CREATE INDEX` statements; bump `VAULT_SCHEMA_VERSION`; add `client_portal_enabled` / `client_downloads_enabled` seeds in `seedFeatureSettings()`. No existing statement touched. |
| `functions/lib/client-portal.ts` | **New** | Client authorisation, publication/snapshot, watermark generation, suspension cascade helpers. |
| `functions/lib/client-auth.ts` | **New** | Passkey/session/temporary-link issue → hash → verify → revoke; D1-backed attempt throttling. |
| `functions/lib/client-watermark.ts` | **New (optional split)** | Watermark layout + PDF stamping (only if `pdf-lib` is approved). |
| `functions/[[path]].ts` | **Edit (additive)** | Import new modules; append `/api/client/*` and `/api/phantom/clients*` route block; extend `WEBSITE_PERMISSION_KEYS`. No existing handler modified. |
| `functions/env.d.ts` | **Edit only if needed** | Only if a new secret/binding is genuinely required (none is currently proposed). |
| `src/lib/cloudflare.ts` | **Edit (additive)** | `clientApiCall()` + storage key `codeRx_client_session`; `db.client.*`, `db.phantom.clients*`. |
| `src/App.tsx` | **Edit (additive)** | Three view flags + hash handlers, mirroring `#vault-share` exactly. |
| `src/components/ClientAccess.tsx` | **New** | `CRX-____-____-____` access screen, "Need assistance?" contact block. |
| `src/components/ClientPortal.tsx` | **New** | Client workspace shell + project list. |
| `src/components/ClientProjectRoom.tsx` | **New** | Project room sections (Overview, Documents, Letters, Agreements, Reports, Deliverables, Updates). |
| `src/components/ClientDocumentView.tsx` | **New** | Watermarked reader + gated download/print. |
| `src/components/ClientAccessCenter.tsx` | **New** | PHANTOM tab: clients, projects, publication, keys, links, activity, preview. |
| `src/components/ClientPublishDialog.tsx` | **New** | Publish/unpublish + view/download permission UX (modelled on `VaultShareDialog`). |
| `src/components/PhantomControlCenter.tsx` | **Edit (minimal)** | One `TABS` entry + one render branch + per-tab loader entry. |
| `src/components/VaultDocumentEditor.tsx` | **Edit (minimal, optional)** | A "Publish to client" action that opens the dialog. Existing save/autosave untouched. |
| `src/index.css` | **Edit (additive)** | `client-*` styles + watermark/print rules. |
| `package.json` | **Edit only if approved** | `pdf-lib` (PDF stamping only). |
| `CLIENT_PORTAL_SETUP.md` | **New** | Operator documentation (buckets, flags, permission keys, verification checklist). |

---

## W. FILES THAT SHOULD NOT BE TOUCHED

**Backend — treat as frozen:**
`functions/lib/auth.ts` (PBKDF2/JWT primitives), `functions/lib/vault.ts` (Actor, permission engine, audit, token utilities, code allocators), `functions/lib/share-token.ts` (copy the pattern; do not edit), `functions/lib/vault-document.ts` (sanitisation), `functions/lib/notifications.ts`, `functions/lib/email.ts`, `functions/lib/score.ts`, `functions/lib/validate.ts`, `functions/lib/rate-limit.ts` (add a D1-backed limiter elsewhere rather than changing its semantics), `.github/workflows/deploy.yml`, `public/_redirects`, `public/sw.js`, `index.html`, `APPLY_V2.sh`.

**Backend routes that must not be modified** (only new routes added): `/api/auth/*`, every `/api/vault/*` and `/api/vault-share*` handler, `/api/vault/upload`, `/api/vault-files/*`, every `/api/phantom/*` handler (a new one may be added), `/api/notifications/*`, `/api/community/*`, `/api/files/*`, `/api/upload`.

**Frontend — treat as frozen:** `src/components/VaultSharedDocument.tsx` (create a client sibling instead), `Vault.tsx` internals, `VaultShareDialog.tsx` internals, `Dashboard.tsx`, `AuthModal.tsx`, `ActivateAccount.tsx`, `ResetPassword.tsx`, `CodenameBallot.tsx`, `CommunityHub.tsx`, `Navbar.tsx`, `Footer.tsx`, every public section component (`Hero`, `About`, `WhatWeDo`, `Academy`, `Projects`, `Competitions`, `Leadership`, `Extras`, `Terms`, `ContactForm`, `PharmacyBackground`), `VisualEditor*`, `data/siteState.ts`, `data/editorSchema.ts`, `data/mockData.ts`, `App.tsx`'s existing routing branches, `AdminPanel.tsx` except where it mounts `PhantomControlCenter`, `vite.config.ts`, `tsconfig.json`.

**Database:** no `ALTER`, no rename, no drop, no `CHECK`-constraint change on any existing table. No change to seeded roles, existing permission keys, existing `system_settings` keys, or the existing share/flag defaults.

**Dependencies:** no upgrades. Only a single additive optional dependency, and only if PDF stamping is approved.

---

## X. IMPLEMENTATION ORDER

Each step is independently shippable and independently testable. Nothing later in the list is required for earlier steps to be safe.

1. **Schema foundation.** Add the new tables + indexes + seeds; bump `VAULT_SCHEMA_VERSION`; verify on a scratch D1 copy that every existing table, row count, index, and seed is unchanged and that `ensureSchema` still converges.
2. **Client entity + management API (PHANTOM only).** Create/edit/suspend/archive clients; create/archive projects; list views. No client-facing surface yet.
3. **Client Access Center UI.** New PHANTOM tab bound to step 2, with activity and audit rows already wired through `audit()`.
4. **Access keys + client sessions + the access screen.** Issue/regenerate/revoke passkeys; hashed at rest; optional encrypted re-copy with integrity check; D1-backed attempt limits; `#client-access` screen.
5. **Project room read-only.** Client portal shell, project list, project room sections; every query scoped by session client id; uniform 404s; opaque public ids.
6. **Publication pipeline + state machine.** Publish an internal approved version into a client document; snapshot freeze; `DRAFT/PUBLISHED/UNPUBLISHED/ARCHIVED`; unpublish invalidates exports.
7. **View/download split.** Per-document `allow_view`/`allow_download` + `client_downloads_enabled` master switch; separate UI states.
8. **Watermarking for native documents.** Client-specific generator with mandatory header/footer/designation/version/fingerprint; inline logo; print stylesheet; verify no client response contains any internal key or URL.
9. **Temporary links — Mode 1** (passkey required) with expiry, view/download flags, and revocation; reuse `VaultShareDialog`'s expiry UX.
10. **Temporary links — Mode 2** (direct access) with the full 10-step validation order, atomic use increments, and scoped short-lived link sessions.
11. **Activity + audit completion.** All `CLIENT_*` events, including refusals; PHANTOM view of client activity; retention decision.
12. **Preview as client.** Read-only projection endpoint + UI; explicitly excludes DRAFT/UNPUBLISHED/internal notes/other clients/Vault records.
13. **Emergency controls.** `SUSPEND CLIENT ACCESS` and `REVOKE ALL CLIENT ACCESS` with the full cascade (keys, sessions, links, link sessions), plus a per-link and global link kill switch.
14. **Binary/PDF stamping (optional, gated).** Only after a deliberate decision on `pdf-lib` and the 10 MB/CPU envelope; until then, PDFs/images/ZIP are **not** client-downloadable.
15. **Hard security pass.** Execute §Y in full against a staging deployment; fix findings; only then enable `client_portal_enabled`.

---

## Y. REGRESSION / SECURITY TEST PLAN

### 0. Baseline regression (must pass before and after every phase step)

| # | Check | Expected |
|---|---|---|
| 0.1 | `GET /api/health` | `{status:'ok'}` |
| 0.2 | Member login (email, phone, codename) then `GET /api/auth/me` | unchanged behaviour |
| 0.3 | `GET /api/vault/sections`, `/home`, `/documents?section=…`, `/documents/:id`, `/activity`, `/search`, `/tags` as a normal member | same documents, same counts, same permission filtering as pre-change |
| 0.4 | Create/edit/autosave/version-restore/archive/unarchive a Vault document | version numbering, `CRX-DOC-####` allocation, `archived_from_status`, activity feed all unchanged |
| 0.5 | Upload an attachment, open it via `/api/vault-files/…`; open it via `/api/files/…` | allowed with permission; **refused** on the public path |
| 0.6 | Create/revoke/replace a `vault_shares` link; open and download it in a clean browser profile | identical to pre-change; existing links keep working |
| 0.7 | PHANTOM: applications, members, roles, permissions, website admins, codenames, notification delegates, sharing switches, media settings, audit logs, recycle bin, settings | identical |
| 0.8 | Member portal dashboard, notifications, leaderboard, community (public guest + member) | identical |
| 0.9 | `ensureSchema` idempotency: run it twice on the same D1 copy | no duplicate rows, no errors, version marker stable |
| 0.10 | Row counts of every pre-existing table before/after | **identical** except for tables that the new features intentionally write (audit_logs) |

### 1. Client isolation (brief §15) — the highest-priority suite

| # | Test | Expected |
|---|---|---|
| 1.1 | Client A session requests Client B's project `public_id` | uniform 404; no name leak; audit records a denial |
| 1.2 | Client A substitutes a document `public_id` belonging to B | uniform 404 |
| 1.3 | Client A iterates sequential integers in place of opaque ids | no data, no differential response, rate-limited |
| 1.4 | Client A calls every client endpoint with no credential / expired credential / revoked credential | 401/404 as designed, never data |
| 1.5 | Client A's search/list endpoints | return only A's own projects and documents; no counts that reveal other clients |
| 1.6 | Error-message and status-code comparison across "not found", "not yours", "unpublished", "revoked" | indistinguishable |
| 1.7 | Client A's document list vs PHANTOM's view of B | no overlap; no cross-client `client_id` ever appears in a response body |

### 2. Passkey / session

| # | Test | Expected |
|---|---|---|
| 2.1 | Correct key → session; wrong key → generic failure | no oracle |
| 2.2 | Raw key never present in D1 (`SELECT key_hash, key_ciphertext`) | hash + ciphertext only |
| 2.3 | Regenerate → old key fails immediately, new key works | pass |
| 2.4 | Revoke key → session invalidated | pass |
| 2.5 | Excessive attempts (spread across simulated isolates) | D1-backed limit blocks; `client.login_failed` audited |
| 2.6 | Client session token replay after logout/revoke-all | rejected |

### 3. Publication state machine

| # | Test | Expected |
|---|---|---|
| 3.1 | DRAFT / UNPUBLISHED / ARCHIVED document requested by its own client | 404 |
| 3.2 | PUBLISHED document → client sees the **frozen snapshot**, not later internal edits | pass |
| 3.3 | Unpublish a published document | immediately inaccessible; existing exports invalidated |
| 3.4 | Republish after internal edit | new snapshot + new version number; old cached/exported artifact not served |
| 3.5 | Publish an internal document whose `visibility='restricted'` or section `is_sensitive=1` | refused at publish time **and** at delivery time |
| 3.6 | Archive the internal source document | client publication stops serving; no orphan original exposed |

### 4. Temporary links

| # | Test | Expected |
|---|---|---|
| 4.1 | Mode 1 link without a client session | redirects to access authentication; destination not served |
| 4.2 | Mode 1 link used with a **different** client's session | uniform 404 |
| 4.3 | Mode 2 link opens the exact destination without a passkey | pass |
| 4.4 | Mode 2 link requested for a sibling document/project not in scope | 404 |
| 4.5 | Expired link | 410/404 as designed; audited as `LINK_EXPIRED` |
| 4.6 | Revoked link | dead immediately |
| 4.7 | `max_uses` reached (including 5 concurrent requests at limit−1) | at most the permitted number succeed, enforced by the atomic UPDATE |
| 4.8 | Link with `allow_download=0` → download endpoint | refused |
| 4.9 | **Suspend the client while a Mode 2 link session is live → retry** | refused on the very next request |
| 4.10 | **Revoke all access → previously issued direct link** | dead |
| 4.11 | Link hash integrity check on recovery (`sha256(recovered) === token_hash`) | enforced; tampered ciphertext → no link returned |

### 5. Watermarking / delivery

| # | Test | Expected |
|---|---|---|
| 5.1 | Download every client-visible document type | watermark present in header **and** footer of every generated artifact |
| 5.2 | Print to PDF from the client reader | watermark appears on the printed output |
| 5.3 | Search every client response (JSON, HTML, headers) for `vault/`, `/api/vault-files/`, `/api/files/`, `.r2.cloudflarestorage.com`, `file_key` | **zero matches** |
| 5.4 | Attempt to fetch the internal document through `/api/vault/documents/:id`, `/api/vault-files/…`, `/api/files/…` using a client credential | all refused |
| 5.5 | Watermark content audit | project name, document name, reference code, version, `CLIENT PROJECT DOCUMENT`, Code Rx logo, generation timestamp all present |
| 5.6 | Internal download path (`/api/vault/documents/:id/download`) | **unchanged** — no client watermark, no behaviour change |
| 5.7 | Non-stampable formats (PDF/image/ZIP/Office) before step 14 | **not downloadable at all** |
| 5.8 | Caching headers on every client response | `private, no-store` + `nosniff` |
| 5.9 | Service worker | cannot serve a cached client document; no client route registered in `public/sw.js` |

### 6. Delegated permissions

| # | Test | Expected |
|---|---|---|
| 6.1 | NEXUS/GHOST/FALCON/QUANTUM/MATRIX member with **no** client permission key | no access to any client-management route (403) |
| 6.2 | Grant `clients.publish` only | can publish; cannot create clients, cannot create links, cannot preview |
| 6.3 | Revoke the key → next request | immediately denied (permission read per request) |
| 6.4 | Legally locked/archived member holding a client key | denied by `requireActiveActor` semantics |
| 6.5 | PHANTOM | full control everywhere |

### 7. Preview as client

| # | Test | Expected |
|---|---|---|
| 7.1 | Preview a client with DRAFT items present | only PUBLISHED items visible |
| 7.2 | Preview cannot see internal notes, internal tags, Vault section names, other clients | pass |
| 7.3 | Preview does not mint a real access key or a surviving session | verified in D1 after the preview |
| 7.4 | Preview respects the same view/download split as the real client experience | pass |
| 7.5 | Preview by a delegate without `clients.preview` | denied |

### 8. Audit / activity

| # | Test | Expected |
|---|---|---|
| 8.1 | All required events exist and are queryable by PHANTOM | LOGIN, PROJECT_OPENED, SECTION_OPENED, DOCUMENT_VIEWED, DOCUMENT_DOWNLOADED, LINK_USED, LINK_EXPIRED, LINK_REVOKED, ACCESS_KEY_REVOKED, ACCESS_KEY_REGENERATED (+ refusals) |
| 8.2 | Raw credentials in `audit_logs.details_json` | none |
| 8.3 | Audit failure injection (DB error) | operation still succeeds; error logged |
| 8.4 | Client events do not appear in the member-facing Vault activity feed | pass |

### 9. Abuse / platform-level

| # | Test | Expected |
|---|---|---|
| 9.1 | Flood the client auth endpoint | in-memory limiter + D1 counter respond; no lockout of legitimate clients beyond a short window |
| 9.2 | Oversized uploads / disallowed MIME to any client upload path | refused (same limits as `MAX_UPLOAD_BYTES` / `SAFE_UPLOAD_MIME_TYPES`) |
| 9.3 | SQL-injection-shaped ids (`' OR 1=1`) and XSS payloads in client-supplied strings | parameterised queries + server-side sanitisation; no reflection into HTML |
| 9.4 | CORS: request from a non-allowlisted origin | blocked as today; authorisation never origin-dependent |
| 9.5 | `system_settings` cannot be used to store a client credential | secret-name refusal still enforced |

### 10. Note on tooling

The repository has **no test framework and no test script** (`package.json` scripts are `dev`, `build`, `preview`). Recommendation for Phase 2: execute the checklist above as a written **curl/browser matrix** against a staging Pages deployment, and — if the user approves — add a minimal local D1 harness (`wrangler d1 execute` against a scratch copy) for the isolation and publication-state suites, which are the ones that cannot be verified by inspection. Do **not** introduce a test runner and a refactor in the same phase.

---

## SUMMARY OF KEY ANSWERS TO THE BRIEF

| Brief question | Answer |
|---|---|
| Can `vault_documents.status` express DRAFT→…→PUBLISHED→UNPUBLISHED? | **No.** Its CHECK allows only `draft,in_review,approved,active,archived`. Client visibility needs a separate publication record pinned to an internal `document_versions` snapshot. |
| Existing identifier system? | **Partly.** `CRX-####` (member) and `CRX-DOC-####` (document) already exist with an atomic sequence allocator. **No** project/letter/report codes exist. The allocator pattern is reusable; new sequence rows are needed. |
| Can an existing table hold clients? | **No.** Every candidate (`users`, `members`, `member_profiles`) leaks into member listings, leaderboards, notification audiences, community membership, and Vault permission evaluation. |
| Can `vault_shares` be reused for temporary links? | **No.** It has no max-uses, no destination scoping, no client binding, and no mode. Reusing it would also put a working production feature at risk. |
| Existing delegation mechanism for client management? | **Yes** — `website_admin_permissions` (per-key) and `role_permissions`/`member_permission_overrides` (per-section), both enforced server-side. |
| Existing audit infrastructure? | **Yes** — `audit_logs` (free-text subject type/id, 20 KB detail cap, never throws) plus `vault_activity` for internal Vault actions. |
| Existing watermarking? | **None.** Zero occurrences of "watermark" in the repository. |
| Existing client portal? | **None.** Zero client tables, components, routes, or flags. |
| Strongest reuse opportunity? | `printableDocumentHtml()` / `documentDownloadResponse()` — the server-generated document representation that already excludes attachments. |
| Biggest security lesson to carry forward? | "Never authorise from an identifier in the URL" is already the platform's discipline everywhere (`vaultAccess` re-derives the section from the document row; shares re-validate the creator's live permission on every use). The Client Portal must extend the same discipline to a client-owned object graph. |
| Biggest architectural trap to avoid? | Making the Client Portal a variant of Vault sharing. The brief is explicit, and the code confirms it: shares have no notion of "who", only "what". |

---

**SWEEP COMPLETE — NO CODE MODIFIED.**

No production file was created, edited, renamed, or deleted in this phase. The only artifact produced is this report, and the only reason it is committed is so that it can be pulled into the main branch alongside the rest of the session's work.

### Phase 2 implementation plan (in order)

1. Schema foundation — new client tables, indexes, flags, permission keys; version bump; verify existing tables untouched.
2. Client + project management API (PHANTOM only), audited.
3. Client Access Center UI (one new PHANTOM tab).
4. Access keys, client sessions, and the `CRX-____-____-____` access screen — hashed at rest, DB-revocable, D1-throttled.
5. Client project room, read-only, fully client-scoped, uniform 404s, opaque public ids.
6. Publication pipeline: internal approved version → frozen client snapshot, with the `DRAFT/PUBLISHED/UNPUBLISHED/ARCHIVED` state machine.
7. View/download permission split (per document + master switch).
8. Mandatory server-side watermarking of the generated client representation (inline logo, header/footer, reference code, version, designation, timestamp, per-client fingerprint).
9. Temporary links, Mode 1 (passkey required).
10. Temporary links, Mode 2 (direct access) with the atomic use counter and scoped short-lived link sessions.
11. Full `CLIENT_*` audit/activity, including refusals.
12. Preview as client — read-only projection, no durable authority.
13. Emergency controls: `SUSPEND CLIENT ACCESS` and `REVOKE ALL CLIENT ACCESS` with the full cascade.
14. Optional binary/PDF stamping (only with an approved dependency); until then those formats are not client-downloadable.
15. Hard security pass against §Y, then enable `client_portal_enabled`.
