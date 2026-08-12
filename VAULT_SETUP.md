# Code Rx Vault, Membership & PHANTOM Control

## What this extension preserves

Code Rx Vault extends the existing Code Rx Society application. It keeps the existing React/Vite site, Pages Functions API, D1 database, R2 bucket, authentication, Join flow, Admin Core, and Member Portal.

It does **not** create a second public website, account store, login system, database, or storage bucket.

## Workspace architecture

```text
PHANTOM CONTROL CENTER                 MEMBER PORTAL
          │                                   │
          └────────── Open Vault ─────────────┘
                              │
                    FULL VAULT WORKSPACE
```

The Vault is a standalone full-page workspace:

- PHANTOM sees **Back to Phantom Control**.
- A member sees **Back to Member Portal**.
- There is one Vault navigation sidebar, not a persistent Admin/PHANTOM sidebar beside the editor.
- Focus mode hides surrounding navigation for writing.
- The Vault hamburger can show or hide the navigation on desktop and opens the drawer on mobile.
- The Member Portal and PHANTOM Control Center also operate as wide internal workspaces with practical hamburger navigation, rather than squeezing major tabs into nested sidebars.

## Membership and codename rules

- Public self-registration is disabled. New accounts come from a reviewed Join application or PHANTOM’s direct member creation flow.
- Each member receives a permanent `CRX-####` member ID and creates their own password through a one-time activation link.
- Passwords are never exposed to PHANTOM and new/changed passwords require at least 8 characters.
- The founding identities are `PHANTOM`, `NEXUS`, `GHOST`, `FALCON`, `QUANTUM`, and `MATRIX`.
- `PHANTOM` is permanently claimed by the founder.
- `NEXUS`, `GHOST`, `FALCON`, `QUANTUM`, and `MATRIX` are available only in the **Founding Codename Pool** for PHANTOM direct assignment or a Custom Founding Ballot.
- Standard members ballot only from the separate **Member Codename Pool**.
- A Custom responsibility always uses the Founding Codename Pool.
- The ballot is a dedicated wide full-page workspace. All available choices appear as Code Rx logo covers; the member opens three covered cards, compares all revealed names, then claims one. Covered names and slot mapping remain server-side until a card is opened.
- An unfinished ballot is enforced on return: a member is sent back to the protected ballot after sign-in or navigation until one revealed codename is claimed.
- PHANTOM can import codenames in batches with comma/newline text or JSON, with full duplicate validation before the batch is saved.
- Direct founding assignment atomically claims one available founding codename and prevents any later ballot.
- Releasing a non-founder member codename safely reopens the correct ballot when appropriate; the PHANTOM identity cannot be released.

## Vault capabilities

- Structured document blocks, templates, rich text, code, lists, tables, callouts, formulas, files, images, and linked resources.
- Every new document receives a permanent automatic reference such as `CRX-DOC-0001`; author, created date, last editor, and update date remain visible in the workspace.
- Slash commands, command palette, outline, focus mode, code preview, tags, related projects, and version history.
- Server-side structured-content sanitization before rendering.
- Protected R2 attachments served only after Vault permission checks.
- Visible autosave with local-draft recovery and serialized saves to avoid overwriting rapid edits.
- PHANTOM-controlled document sharing: separate global and per-member Share-button and Download-button controls. Links are random and read-only, with an access-period choice of **No expiry**, **1 day**, **7 days**, **30 days**, or **90 days**. Shared read-only pages carry the official Code Rx Society logo, and can independently allow or block download/print. Active links have a clear **Copy link** control in the Existing links list; token copies are encrypted at rest and only returned to an authorized owner. Historic links created before this upgrade can be safely replaced with a new copyable URL. They never expose protected attachments or sensitive/restricted documents.
- Section-level `view`, `create`, `edit`, `delete`, and `manage` permissions, plus member-specific overrides.
- A live **Calcitonins (CAL)** system with automatic rule awards, PHANTOM direct add/deduct/set controls, a click-to-edit member CAL balance, protected history, member balance, and a real active-member leaderboard.
- Durable in-app notifications: PHANTOM can broadcast to all active members, a responsibility profile, or selected members, and can delegate trusted members to send notices. Sent notices can be edited for current recipients or withdrawn from inboxes; recipients receive an unread badge, an auto-refreshing inbox, and can remove a notice from their own inbox. Organization broadcast/audit records remain protected.
- Timelines, histories, activity feeds, and useful inbox/listing views show the three newest entries first, with an explicit **Show more** control for older entries. Audit records remain immutable.
- PHANTOM has a centralized **Recycle Bin** for deleted applications, subscribers, contact messages, sent notifications, and inbox notices. Items can be restored or permanently deleted; existing member, document, project, section, and share archive/revoke flows remain protected in their own workspaces.
- Role history, audit logs, Website Admin delegation, and PHANTOM-only organization controls.
- Archive/restore workflows for members, documents, sections, and projects.

## Safe migrations

The schema is applied automatically on the first API request after a deployment.

- Tables and columns are added non-destructively.
- Existing applications, members, users, site content, documents, and attachments are retained.
- Member IDs are monotonic and never reused.
- Historic document rows marked `archived` are normalized into the actual document archive so archive lists and restoration remain consistent.

Before a major production change, take a normal D1 export:

```bash
npx wrangler d1 export code-rx-db --remote --output=code-rx-before-vault.sql
```

## Required production bindings

```text
D1: code-rx-db        binding DB
R2: code-rx-storage   binding BUCKET
```

Set `JWT_SECRET` and `ADMIN_PASSWORD` only as encrypted Cloudflare secrets. `PHANTOM_EMAIL` defaults to `ADMIN_EMAIL` when it is not set.

## Validation

```bash
npm ci
npx tsc --noEmit
npx wrangler pages functions build functions --outfile /tmp/code-rx-functions.js
npm run build
npm audit
```

For deployment and live verification, see `PRODUCTION_SETUP.md` and `CLOUDFLARE_SETUP.md`.
