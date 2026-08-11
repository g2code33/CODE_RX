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

1. Create a free account at https://www.emailjs.com with coderxsociety@gmail.com
2. **Email Services → Add New Service** → connect Gmail → copy the **Service ID**
3. **Email Templates** → create 5 templates:

| Template | Purpose | Variables |
|---|---|---|
| `template_join` | New application → admin | `to_email`, `applicant_name`, `applicant_email`, `applicant_phone`, `date` |
| `template_contact` | Contact form → admin | `to_email`, `sender_name`, `sender_email`, `subject`, `message`, `date` |
| `template_approval` | Approval/rejection → applicant | `to_email`, `member_name`, `status`, `date` |
| `template_reset` | Password reset → user | `to_email`, `reset_link`, `name` |
| `template_activation` | New member activation → member | `to_email`, `member_name`, `member_code`, `activation_link`, `role_name` |

4. Copy the **Public Key** (Account → General) and the template IDs.
5. Set these variables on the Pages project (and only in an ignored local environment file for local development):
   ```
   EMAILJS_PUBLIC_KEY, EMAILJS_SERVICE_ID,
   EMAILJS_TEMPLATE_ID_JOIN, EMAILJS_TEMPLATE_ID_CONTACT,
   EMAILJS_TEMPLATE_ID_APPROVAL, EMAILJS_TEMPLATE_ID_RESET,
   EMAILJS_TEMPLATE_ID_ACTIVATION
   ```

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
- **Emails not sending?** Verify all 5 EmailJS template IDs and the service ID;
  the API logs "Email skipped — EmailJS not configured" when keys are missing.
- **Admin routes return 401?** You're not signed in as admin — use the admin
  email + password, or re-login after a password change.
