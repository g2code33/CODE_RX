# Code Rx Vault, Membership & Founder Control System

## What was extended

This implementation extends the existing React/Vite site, existing Cloudflare Pages Function API, existing JWT login, existing `applications`, `members`, `users`, D1 database, R2 bucket, Admin Core, and JOIN CODE Rx form. It does not create a second website or second login system.

### Existing architecture retained

- **Frontend:** React + Vite + Tailwind, routed in `src/App.tsx` by authenticated state.
- **Authentication:** existing PBKDF2 password hashes and HMAC JWTs in `functions/lib/auth.ts`.
- **Join flow:** existing `applications` table and `/api/applications` endpoint.
- **Admin Core:** existing `AdminPanel`, content controller, and Live Website Builder.
- **Storage:** existing D1 binding `DB` and R2 binding `BUCKET`.

### New native extensions

- Additive D1 schema in `functions/lib/schema.ts` for member profiles, permanent IDs, activation links, roles, permissions, codenames, Vault records, website admins, and audit logs.
- `PHANTOM` is seeded from `PHANTOM_EMAIL` (or `ADMIN_EMAIL`) with the founder role and full server-side access.
- Public self-registration is disabled. Existing accounts remain valid and are lazily migrated into a member profile on authentication.
- Approved members receive an account activation link and choose their own password. No administrator needs to know a member password.
- The Code Rx Vault lives inside the existing member dashboard.
- The PHANTOM Control Center lives inside the existing Admin Core.

## Safe migration behavior

The schema is applied automatically on the first API request after deployment.

- Existing tables are **not dropped**.
- Existing `applications`, `members`, `users`, and `site_content` data are retained.
- New columns for review metadata are added only when missing.
- New tables are additive.
- Existing authenticated accounts receive a profile and permanent `CRX-####` ID only when they next authenticate, preserving prior accounts.
- Member IDs are allocated from a monotonic sequence and never reused.

Back up the D1 database before production deployment as a normal operational precaution:

```bash
npx wrangler d1 export code-rx-db --remote --output=code-rx-before-vault.sql
```

## Required Cloudflare secrets

Do **not** commit secrets into `wrangler.toml`, frontend variables, Git, or chat.

For a fresh deployment, configure these encrypted Cloudflare secrets in the Pages project/Worker environment:

```bash
npx wrangler pages secret put JWT_SECRET --project-name coderxsociety
npx wrangler pages secret put ADMIN_PASSWORD --project-name coderxsociety
```

Optional environment variables:

- `PHANTOM_EMAIL` — founder identity; defaults to `ADMIN_EMAIL`.
- `SITE_URL` — production website URL used in activation/reset links.
- `EMAILJS_TEMPLATE_ID_ACTIVATION` — activation email template if EmailJS is configured.

The old repository configuration contained sensitive seed values. Rotate the old JWT secret and admin password in Cloudflare before production deployment.

## Authorization model

Frontend controls only visibility. Every protected operation is checked again by the Cloudflare Worker.

- **PHANTOM:** full organization and website access.
- **Role permissions:** `view`, `create`, `edit`, `delete`, `manage` per Vault section.
- **Member overrides:** PHANTOM can set more specific section-level overrides.
- **Website Admins:** separate from Vault administration; website permissions are stored in `website_admin_permissions`.
- **Vault files:** stored under `vault/` in R2 and served only through `/api/vault-files/*` after a server-side Vault permission check.

## Deployment check

Run these before deploying:

```bash
npm ci
npx tsc --noEmit
npm run build
npx wrangler pages functions build functions --outfile /tmp/code-rx-functions.js
```
