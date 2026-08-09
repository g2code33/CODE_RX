# CODE Rx SOCIETY - Production Setup Guide

## 🎉 Your Website is Ready for Production!

All API integration code is now in place. Follow these steps to make your website fully functional with real backend storage and email notifications.

---

## 🚀 CURRENT ARCHITECTURE (Cloudflare-native)

The site runs 100% on Cloudflare (free tier):

| Piece | Where |
|---|---|
| Website (React SPA) | Cloudflare Pages → `coderxsociety.pages.dev` |
| Backend API ("workers") | Pages Functions — `functions/[[path]].ts` (Hono) |
| Database | Cloudflare D1 (`code-rx-db`, binding `DB`) |
| File storage | Cloudflare R2 (`code-rx-storage`, binding `BUCKET`) |
| Auth | PBKDF2-hashed passwords + signed JWT tokens (7-day sessions) |
| Anti-spam | Per-IP rate limiting on all public POST endpoints |

### ✅ What works now
- **Real login** — email + password verified against the database (no more "any password")
- **Admin panel protected** — all `/api/applications`, `/api/members`, `/api/contacts`, `/api/subscribers`, `/api/stats`, CMS saves require an admin JWT
- **Members** — anyone can register an account (name/email/password) and sign in to the member portal
- **Join flow** — application form saves to D1 + auto-adds the applicant as a subscriber
- **Approve application → member created automatically**
- **CMS** — site content edits save to D1 and are served to all visitors (no more per-browser localStorage)
- **Change password** — Admin panel → Security → change your password (current password verified; session re-login required after)
- **Forgot password / reset** — "Forgot Password?" on the sign-in form emails a one-time reset link (`/#reset?token=...&email=...`); tokens expire after 1 hour and can't be reused
- **Members manager** — Admin panel → Members: add members, edit level/points inline, activate/deactivate, remove
- **Email notifications** — new applications, contact messages, application approvals/rejections, and password-reset links can be emailed (via EmailJS — see below)
- **Uploads** — admin-only file uploads to R2, served back via `/api/files/...` (10 MB max, type-checked)
- **Rate limiting** — 5/min on forms, 10/min on login, 429 responses when exceeded
- **Deep links** — every section has its own URL: `/#home`, `/#about`, `/#learn`, `/#projects`, `/#challenges`, `/#community`, `/#resources`, `/#terms`
- **PWA** — installable app: manifest, app icons (CODE Rx logo), service worker for offline launch

---

## 📧 Email notifications (EmailJS)

The API sends emails via the EmailJS REST API when configured. Until then it logs
and skips (never breaks the API).

1. Create a free account at https://www.emailjs.com (connect your Gmail — see `EMAILJS_SETUP.md`)
2. Create 5 templates with these variables:
   - **Join notification** (to admin): `{{to_email}}`, `{{applicant_name}}`, `{{applicant_email}}`, `{{applicant_phone}}`, `{{date}}`
   - **Contact notification** (to admin): `{{to_email}}`, `{{sender_name}}`, `{{sender_email}}`, `{{subject}}`, `{{message}}`, `{{date}}`
   - **Approval/rejection** (to applicant): `{{to_email}}`, `{{member_name}}`, `{{status}}`, `{{date}}`
   - **Password reset** (to user): `{{to_email}}`, `{{name}}`, `{{reset_link}}`
   - **Member activation** (to new member): `{{to_email}}`, `{{member_name}}`, `{{member_code}}`, `{{activation_link}}`, `{{role_name}}`
3. Copy the **Public Key**, **Service ID**, and the 4 **Template IDs** into `wrangler.toml` (and the Pages project environment variables):
   ```toml
   EMAILJS_PUBLIC_KEY = "..."
   EMAILJS_SERVICE_ID = "..."
   EMAILJS_TEMPLATE_ID_JOIN = "..."
   EMAILJS_TEMPLATE_ID_CONTACT = "..."
   EMAILJS_TEMPLATE_ID_APPROVAL = "..."
   EMAILJS_TEMPLATE_ID_RESET = "..."
   ```
4. Redeploy. New applications, contact messages, approvals, and password-reset links now email automatically.
   > No EmailJS keys? Public requests still work, but reset and activation links are not exposed in browsers. Configure mail before production use.

### 🔑 PHANTOM founder account (created on first request)
- **Email:** `PHANTOM_EMAIL` (falls back to `ADMIN_EMAIL`)
- **Password:** supplied only through the encrypted `ADMIN_PASSWORD` Cloudflare secret on a fresh database.

Never commit a founder password or `JWT_SECRET` into `wrangler.toml`, `.env`, Git, screenshots, or chat. Configure those values as Cloudflare Pages/Worker secrets and rotate any previously exposed values. Existing databases retain their existing founder account.

### 🧪 Run everything locally and test (before deploying!)
```bash
npm ci
npm run build
npx wrangler pages dev dist --d1 DB=code-rx-db --r2 BUCKET=code-rx-storage
```
Open **http://localhost:8788** — the site AND the API run together (fresh local D1/R2 are created automatically).

Test checklist:
1. Visit `/` — homepage loads; `http://localhost:8788/api/health` returns `{"status":"ok",...}`
2. "Member Portal" → Sign In with the configured PHANTOM credentials → **Admin Core** panel opens
3. PHANTOM Control Center → Applications → review a test application → Create Member → verify the activation link and member ID
4. Join form → submit → appears in Admin → Applications (pending)
5. Contact form → submit → appears in Admin → Applications → Contact Messages
6. Home editor → change hero title → Save → hard-refresh homepage → change is live
7. Wrong password → clean error, no access; logged-out visitors get 401/403 on admin data
8. Admin → Security → change your password → sign in again with the new one
9. PHANTOM Control Center → Members → lock/unlock/archive, reassign a role, and inspect member history
10. Sign in → "Forgot Password?" → enter the founder email → confirm the generic response; configure EmailJS to deliver the secure reset link
11. Visit `/#learn` directly → Academy section opens (same for every section)
12. Chrome/phone → the site is installable (Add to Home Screen shows the CODE Rx logo); open it from the home screen — it launches fullscreen

### 🌐 Deploy to production
Option A — **Git-connected Pages** (you set this up): push to `main`, Cloudflare builds (`npm run build`, output `dist`) and deploys the site + functions. Make sure the Pages project has the D1 binding `DB → code-rx-db` and R2 binding `BUCKET → code-rx-storage` attached (Settings → Functions → bindings), plus the environment variables from `wrangler.toml`.

Option B — CLI:
```bash
npm run build
npx wrangler pages deploy dist --project-name coderxsociety --branch main
```

> ⚠️ Never change `public/_redirects` back to a catch-all (`/* /index.html 200`) — it intercepts `/api/*` before the Functions run and kills the whole backend. SPA fallback is handled inside the Function.

---
