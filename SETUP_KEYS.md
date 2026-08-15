# 🔑 CODE Rx SOCIETY - Keys & Secrets Setup Guide

The site runs on **Cloudflare Pages + Functions + D1 + R2** — no third-party
database. These are the only keys/secrets you need:

---

## 1. Cloudflare (required)

| Where | What |
|---|---|
| **D1 database binding** | Pages project → Settings → Functions → D1 → binding `DB` → `code-rx-db` |
| **R2 bucket binding** | Pages project → Settings → Functions → R2 → binding `BUCKET` → `code-rx-storage` |
| **JWT_SECRET** | **Encrypted secret** in Pages project → Settings → Environment variables → long random string (used to sign login tokens) |
| **ADMIN_EMAIL** | Founder contact email; `PHANTOM_EMAIL` may override it |
| **ADMIN_PASSWORD** | **Encrypted seed-only secret** for a fresh database; never commit or share it |
| **PHANTOM_EMAIL** | Optional founder identity; defaults to `ADMIN_EMAIL` |

> Keep secrets out of `wrangler.toml`. For local development use an ignored local secret file or Wrangler bindings; production secrets belong only in Cloudflare.

---

## 2. EmailJS (optional — enables email notifications)

1. Create or sign in to EmailJS and add the Code Rx Society email service.
2. In **EmailJS → Account → Security**, enable **Allow EmailJS API for non-browser applications**. Code Rx sends from a Cloudflare Pages Function, not from a browser.
3. Keep EmailJS **Use Private Key (recommended)** enabled and store the Private Key only as the encrypted Cloudflare Pages secret `EMAILJS_PRIVATE_KEY`. Never put it in Git, frontend code, a screenshot, or chat.
4. Copy the **Service ID** and **Public Key** privately; do not put either in frontend code, Git, screenshots, or chat.
5. Choose a template layout:

| Layout | Templates | Pages variables |
|---|---|---|
| **Limited/free plan (recommended)** | `template_join` plus one reusable `template_general` | `EMAILJS_TEMPLATE_ID_JOIN`, `EMAILJS_TEMPLATE_ID_GENERAL` |
| Separate event templates | One template per event | `EMAILJS_TEMPLATE_ID_JOIN`, `EMAILJS_TEMPLATE_ID_CONTACT`, `EMAILJS_TEMPLATE_ID_APPROVAL`, `EMAILJS_TEMPLATE_ID_RESET`, `EMAILJS_TEMPLATE_ID_ACTIVATION` |

The reusable general template receives these parameters:

```text
to_email, reply_to, email_title, greeting, notification_body,
action_label, action_link, sent_at
```

It is used automatically for Contact, application review/rejection, password reset, and member activation when the respective event-specific template ID is absent. Keep the secure `{{action_link}}` supplied by the server; never replace reset or activation links with a fixed URL.

6. Set the required Pages values in **Workers & Pages → coderxsociety → Settings → Variables and Secrets**. The limited/free layout needs these Text variables:

   ```text
   EMAILJS_PUBLIC_KEY
   EMAILJS_SERVICE_ID
   EMAILJS_TEMPLATE_ID_JOIN
   EMAILJS_TEMPLATE_ID_GENERAL
   ```

   It also needs this encrypted Secret while EmailJS Private Key mode is enabled:

   ```text
   EMAILJS_PRIVATE_KEY
   ```

See `EMAILJS_SETUP.md` for the exact template content, optional event-specific overrides, and safe test values.

---

## 3. Frontend `.env` (optional — local dev only)

Copy `.env.example` → `.env` if you need to override anything locally:

```env
VITE_API_URL=            # empty = same-origin API (default; recommended)
VITE_ADMIN_EMAIL=coderxsociety@gmail.com
VITE_TELEGRAM_LINK=https://t.me/+EdRpfR1GTGNjM2Q0
VITE_ENABLE_AUTH=true
```

---

## Troubleshooting

- **Login fails?** Confirm the `users` table was seeded (first API request) and
  that `ADMIN_EMAIL`/`ADMIN_PASSWORD` match what you used at seed time.
- **Emails not sending?** Enable **Allow EmailJS API for non-browser applications** in EmailJS Account → Security. Verify the EmailJS service ID, public key, and either the shared `EMAILJS_TEMPLATE_ID_GENERAL` or the relevant event-specific template ID. If EmailJS Private Key mode is enabled, add `EMAILJS_PRIVATE_KEY` only as an encrypted Pages secret. The API logs `Email skipped — missing ...` when a required configuration value is unavailable.
- **Admin routes return 401?** You're not signed in as admin — use the admin
  email + password, or re-login after a password change.
