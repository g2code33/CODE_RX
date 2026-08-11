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
- Mobile navigation uses the Vault drawer rather than squeezing desktop columns onto a phone.

## Membership and codename rules

- Public self-registration is disabled. New accounts come from a reviewed Join application or PHANTOM’s direct member creation flow.
- Each member receives a permanent `CRX-####` member ID and creates their own password through a one-time activation link.
- Passwords are never exposed to PHANTOM and new/changed passwords require at least 8 characters.
- The founding identities are `PHANTOM`, `NEXUS`, `GHOST`, `FALCON`, `QUANTUM`, and `MATRIX`.
- `PHANTOM` is permanently claimed by the founder.
- `NEXUS`, `GHOST`, `FALCON`, `QUANTUM`, and `MATRIX` are available only in the **Founding Codename Pool** for PHANTOM direct assignment or a Custom Founding Ballot.
- Standard members ballot only from the separate **Member Codename Pool**.
- A Custom responsibility always uses the Founding Codename Pool.
- Direct founding assignment atomically claims one available founding codename and prevents any later ballot.
- Releasing a non-founder member codename safely reopens the correct ballot when appropriate; the PHANTOM identity cannot be released.

## Vault capabilities

- Structured document blocks, templates, rich text, code, lists, tables, callouts, formulas, files, images, and linked resources.
- Slash commands, command palette, outline, focus mode, code preview, tags, related projects, and version history.
- Server-side structured-content sanitization before rendering.
- Protected R2 attachments served only after Vault permission checks.
- Autosave with local-draft recovery and serialized saves to avoid overwriting rapid edits.
- Section-level `view`, `create`, `edit`, `delete`, and `manage` permissions, plus member-specific overrides.
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
