# Code Rx Society — Production Operations Guide

## Current architecture

| Layer | Production implementation |
|---|---|
| Public site | React + Vite on Cloudflare Pages |
| API | Cloudflare Pages Functions in `functions/[[path]].ts` |
| Database | D1 `code-rx-db` through binding `DB` |
| Files | R2 `code-rx-storage` through binding `BUCKET` |
| Authentication | PBKDF2-SHA256 password hashes and signed seven-day JWT sessions |
| Admin authority | Server-enforced PHANTOM, Website Admin, role, and Vault permissions |

The existing public pages, Admin Core, authentication flow, Member Portal, and storage resources are retained. Do not rebuild them or add a second account system.

## Membership and account lifecycle

1. A visitor uses **JOIN CODE Rx** with full name, phone, and email.
2. The request is stored as a **pending application**; public account creation and public password setup are disabled.
3. In **PHANTOM Control → Applications**, PHANTOM uses the single **Approve & invite** action to choose the member responsibility and Code Name path.
4. That one action approves the application, creates the pending member profile and permanent member ID such as `CRX-0001`, and issues a one-time seven-day password-setup link.
5. The activation email is sent when EmailJS is configured; PHANTOM can copy the one-time link for secure manual delivery when email delivery is unavailable. The raw link is never stored in D1.
6. The member chooses a private password of at least **8 characters**. PHANTOM never receives that password. A replacement invitation invalidates the earlier unused link.
7. Depending on the selected path, the member either receives a direct founding codename or completes the appropriate member/founding codename ballot.

Existing accounts remain available and are safely migrated into a member profile when they next authenticate.

## Vault and archive behavior

- PHANTOM enters the full Vault workspace from **PHANTOM Control Center → Open Vault**.
- Members enter the same full-page workspace from **Member Portal → Code Rx Vault**.
- The Vault has one primary navigation sidebar, a Back button to the originating workspace, focus mode, mobile navigation, structured documents, version history, protected attachments, and local draft protection.
- Every new Vault document receives a permanent automatic `CRX-DOC-####` reference. Its author, created date, last editor, and update time are preserved automatically.
- Document archive uses the archive action, not a document status selector. PHANTOM/section managers can open **Archived Documents** and unarchive a document to its prior active status.
- PHANTOM can also restore archived members, Vault sections, and projects from their dedicated archive controls.
- Deleted applications, subscribers, contact messages, sent notifications, and inbox notices first move to **PHANTOM → Recycle Bin**, where they can be restored or permanently deleted.
- Archiving keeps historical rows and version history; it never deletes records.
- Public document sharing and downloads are disabled by default. PHANTOM enables separate global master switches and then turns member-specific Share and Download buttons on only for trusted active members. When PHANTOM creates a link with **Allow download and print**, Download and Print are turned on for that link immediately; PHANTOM can pause them later. A shared page shows **Download** and **Print** only when the link allows them and its creator has permission. Share links are read-only and can be set to **No expiry**, **1 day**, **7 days**, **30 days**, or **90 days**. They exclude attachments and sensitive/restricted documents. Authorized owners can copy active links again from the Existing links list.
- **Calcitonins (CAL)** are live: configurable automatic CAL rules, PHANTOM direct balance edits and add/deduct/set controls with reasons/history, dashboard balances, and a real member leaderboard are all backed by D1.
- Notifications are durable in-app broadcasts. PHANTOM can target all active members, a responsibility profile, or selected members, enable designated active members as notification senders, edit an active sent notice, or withdraw it from recipient inboxes.

## Community + messaging configuration

The Community system reuses the existing `DB` D1 binding and `BUCKET` R2 binding. See `COMMUNITY_SETUP.md` for the full public/private separation, media policy, Telegram setup, rate limiting, and verification checklist.

Telegram is optional. If enabled, set these only as encrypted Cloudflare secrets:

```text
TELEGRAM_BOT_TOKEN
TELEGRAM_BOT_USERNAME
TELEGRAM_WEBHOOK_SECRET
```

Do not place those values in frontend variables, D1, Git, screenshots, or chat.

## Required Cloudflare configuration

Use the existing production resources:

```text
Pages project: coderxsociety
D1 database:  code-rx-db       binding: DB
R2 bucket:    code-rx-storage  binding: BUCKET
Site URL:     https://coderxsociety.pages.dev
```

Production variables/secrets:

```text
ADMIN_EMAIL       variable
PHANTOM_EMAIL     optional variable; falls back to ADMIN_EMAIL
SITE_URL          variable
JWT_SECRET        encrypted secret
ADMIN_PASSWORD    encrypted seed-only secret for a fresh database
```

Do not create another D1 database or attach a different binding. Do not put `JWT_SECRET` or `ADMIN_PASSWORD` in `wrangler.toml`, a frontend `VITE_*` variable, Git, screenshots, or chat.

## Optional EmailJS notifications

When configured, the Functions API sends email through EmailJS for:

1. New Join applications
2. Contact messages
3. Application review notifications
4. Password reset links
5. Member activation links

See `SETUP_KEYS.md` and `EMAILJS_SETUP.md` for the optional variable names. The application remains functional without EmailJS, but reset and activation links must be delivered securely before production use.

## Pre-deployment validation

Run these commands from the repository root:

```bash
npm ci
npx tsc --noEmit
npx wrangler pages functions build functions --outfile /tmp/code-rx-functions.js
npm run build
npm audit
```

## Deployment

The preferred route is the existing GitHub workflow: merge reviewed work into `main`, then let Cloudflare Pages deploy the root project.

For a manual deployment from the repository root:

```bash
npm run build
npx wrangler pages deploy dist --project-name coderxsociety --branch main
```

Wrangler bundles the root `functions/` directory during the Pages deployment. Never substitute an unrelated Worker configuration or a different database deployment command.

## Post-deploy checklist

1. `https://coderxsociety.pages.dev/api/health` returns JSON with `status: "ok"`.
2. A PHANTOM login succeeds quickly after the initial warm-up request.
3. Password fields expose an accessible Show/Hide control in login, activation, reset, and Admin Security.
4. A Join application stays pending until PHANTOM uses **Approve & invite**; confirm the action creates one `pending_activation` member, emits/copies a one-time password-setup link, and no password is visible to PHANTOM.
5. Confirm a replacement invitation invalidates the earlier unused link, an unactivated member cannot sign in, and only successful password setup makes the member active.
6. Test all codename paths:
   - Member Ballot uses only the Member Pool and requires three covered-card reveals before a comparison choice can be claimed.
   - Custom Founding Ballot exposes only the canonical six founding identities that remain unclaimed; PHANTOM and already claimed identities never appear as choices.
   - An unfinished ballot returns the member to the full-page ballot after sign-in or navigation.
   - Direct Founding Assignment, including GHOST/NEXUS/FALCON/QUANTUM/MATRIX, claims exactly one PHANTOM-selected founding codename and opens no ballot.
   - Import a comma/newline batch and a JSON codename batch; confirm duplicates are rejected before anything is added.
7. Confirm a member cannot see a Vault section, tag, document, attachment, or project without the matching server-side permission.
8. Confirm a new document receives a `CRX-DOC-####` code and shows automatic author/date metadata and autosave state.
9. Enable global sharing, create links with **No expiry** and a time-limited option, copy one again from **Existing links**, test the optional shared-page **Download**/**Print** controls, revoke one, then verify that a sensitive/restricted document cannot be shared.
10. Verify one automatic Calcitonins award, one PHANTOM direct CAL adjustment, the member Calcitonin history, and the live leaderboard.
11. Send a notification to a selected test member, confirm the unread badge/inbox, edit the sent notice, withdraw it from inboxes, then enable a delegated sender and test their broadcaster access.
12. Archive and then restore a member, document, section, and project as an authorized PHANTOM/manager.
13. Confirm PHANTOM and member Vault entry points both use the full workspace with the appropriate Back button.

> Do not change `public/_redirects` to a catch-all SPA rewrite. The API is routed by Pages Functions, and the Function provides the safe HTML navigation fallback.
