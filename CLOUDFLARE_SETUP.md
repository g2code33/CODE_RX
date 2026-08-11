# Code Rx Society — Cloudflare Setup

This project is already configured as a **Cloudflare Pages application with Pages Functions**. Keep the existing resources and bindings; do not create a second Worker, D1 database, R2 bucket, or login system.

## Production resources

| Resource | Required value |
|---|---|
| Pages project | `coderxsociety` |
| Site URL | `https://coderxsociety.pages.dev` |
| D1 database | `code-rx-db` |
| D1 binding | `DB` |
| R2 bucket | `code-rx-storage` |
| R2 binding | `BUCKET` |
| Function entrypoint | `functions/[[path]].ts` |

The root `wrangler.toml` is the Code Rx configuration. Do **not** use an unrelated `backend/wrangler.toml`, `backend/migrations`, or `rx-store-db` configuration for this application.

## Pages environment variables and secrets

Configure these in **Workers & Pages → coderxsociety → Settings → Variables and Secrets** for the production environment:

| Name | Type | Notes |
|---|---|---|
| `ADMIN_EMAIL` | Variable | `coderxsociety@gmail.com` |
| `PHANTOM_EMAIL` | Variable (optional) | Defaults to `ADMIN_EMAIL` when omitted |
| `SITE_URL` | Variable | `https://coderxsociety.pages.dev` |
| `JWT_SECRET` | **Encrypted secret** | Long, unique random value used to sign sessions |
| `ADMIN_PASSWORD` | **Encrypted secret** | Seed-only PHANTOM password for a fresh database |

Optional EmailJS variables are listed in `SETUP_KEYS.md`. Keep all secrets out of Git, browser environment variables, screenshots, and chat.

## How the database is maintained

The API runs additive schema checks automatically on the first `/api/*` request after deployment. This safely creates missing tables, adds supported columns, and applies Vault migrations without deleting existing members, applications, documents, or site content.

Do not paste an old, partial SQL schema into the D1 console. Before a major production change, take a normal D1 export instead:

```bash
npx wrangler d1 export code-rx-db --remote --output=code-rx-backup.sql
```

## Local full-stack check

From the repository root:

```bash
npm ci
npm run build
npx wrangler pages dev dist --local --d1 DB --r2 BUCKET
```

For a fresh local database, provide safe local-only bindings/secrets through Wrangler flags or an ignored local environment file. Never copy production secrets into the repository.

Open `http://localhost:8788/api/health` after the server starts. The Pages Functions API and the built site are served together.

## Deploying the root project

The normal production route is a merge into `main`, which triggers the existing GitHub Pages workflow. If a manual Pages deployment is needed, run it from this repository root:

```bash
npm ci
npx tsc --noEmit
npx wrangler pages functions build functions --outfile /tmp/code-rx-functions.js
npm run build
npx wrangler pages deploy dist --project-name coderxsociety --branch main
```

Wrangler detects the root `functions/` directory and bundles the Pages Functions alongside the static build. Do not deploy a different Worker as a substitute for the Pages API.

## Post-deploy verification

1. Open `https://coderxsociety.pages.dev/api/health` and confirm a JSON `status: "ok"` response.
2. Sign in as PHANTOM and confirm **PHANTOM Control Center → Open Vault** opens the standalone Vault workspace.
3. Sign in as a member and confirm **Member Portal → Code Rx Vault** opens the same full-page Vault shell with member permissions.
4. Confirm a Join application remains pending until PHANTOM creates the invited member account and the member activates it.
5. Confirm the D1 and R2 bindings remain exactly `DB` and `BUCKET`.
