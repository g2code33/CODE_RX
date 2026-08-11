# EmailJS Setup — Code Rx Society

Email notifications are sent by the **Cloudflare Pages Functions API**, not by browser code. Configure EmailJS values in the Cloudflare Pages environment (and only in an ignored local environment file when testing locally). Do not put them in `src/config.ts`, a `VITE_*` variable, Git, screenshots, or chat.

## 1. Create the EmailJS service

1. Create or sign in to an EmailJS account.
2. Add an email service (for example, the Code Rx Society Gmail mailbox).
3. Copy the **Service ID** and **Public Key**.

## 2. Create the five API templates

The Function sends these template parameters.

| Purpose | Pages variable | Required template parameters |
|---|---|---|
| New Join application | `EMAILJS_TEMPLATE_ID_JOIN` | `to_email`, `applicant_name`, `applicant_email`, `applicant_phone`, `date` |
| New contact message | `EMAILJS_TEMPLATE_ID_CONTACT` | `to_email`, `sender_name`, `sender_email`, `subject`, `message`, `date` |
| Application review notice | `EMAILJS_TEMPLATE_ID_APPROVAL` | `to_email`, `member_name`, `status`, `date` |
| Password reset | `EMAILJS_TEMPLATE_ID_RESET` | `to_email`, `name`, `reset_link` |
| Member activation | `EMAILJS_TEMPLATE_ID_ACTIVATION` | `to_email`, `member_name`, `member_code`, `activation_link`, `role_name` |

The activation and reset templates should use the supplied secure link exactly as received. Do not manually replace it with a fixed URL.

## 3. Set the Pages variables

In **Workers & Pages → coderxsociety → Settings → Variables and Secrets**, add:

```text
EMAILJS_PUBLIC_KEY
EMAILJS_SERVICE_ID
EMAILJS_TEMPLATE_ID_JOIN
EMAILJS_TEMPLATE_ID_CONTACT
EMAILJS_TEMPLATE_ID_APPROVAL
EMAILJS_TEMPLATE_ID_RESET
EMAILJS_TEMPLATE_ID_ACTIVATION
```

`JWT_SECRET` and `ADMIN_PASSWORD` remain encrypted Cloudflare secrets; they are unrelated to EmailJS and must never be placed in an EmailJS template or client-side setting.

## 4. Test safely

After deployment:

1. Submit a test Join application and confirm the admin notification.
2. Submit a test contact message and confirm the admin notification.
3. Create a test member as PHANTOM and confirm the activation email contains the one-time link.
4. Request a password reset for a test account and confirm the reset email contains the one-time link.

When EmailJS is not configured, public forms still save to D1. Reset and activation links are deliberately not returned to public browsers, so configure email before relying on those flows in production.

## Troubleshooting

- Confirm every variable is configured in the **production** Pages environment, not only preview.
- Confirm the EmailJS template variable names match the table above exactly.
- Check EmailJS activity and the destination mailbox spam folder.
- The Functions log `Email skipped — EmailJS not configured` when a template ID or required EmailJS setting is absent.
