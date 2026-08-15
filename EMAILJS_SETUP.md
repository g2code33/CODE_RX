# EmailJS Setup — Code Rx Society

Email notifications are sent by the **Cloudflare Pages Functions API**, never by browser code. Configure EmailJS only in the Cloudflare Pages environment (and an ignored local environment file when testing locally). Do **not** put EmailJS values in `src/`, a `VITE_*` variable, public assets, Git, screenshots, or chat.

## Choose the template layout

| Layout | EmailJS templates needed | Use when |
|---|---:|---|
| **Two-template layout (recommended for limited/free plans)** | 2 | Your EmailJS account limits the number of saved templates. |
| Separate templates | 5 | Your plan permits five templates and you want a different design for every event. |

The application supports both layouts at the same time. A configured event-specific template always wins; otherwise Contact, review/rejection, reset, and activation notices fall back to the shared general template.

## Two-template layout (recommended)

### Template 1 — New JOIN application

Keep the existing **Code Rx New Application** template. It uses:

```text
to_email
applicant_name
applicant_email
applicant_phone
submitted_at
review_link
```

Use `{{submitted_at}}`, not `{{date}}`, and set the button URL to `{{review_link}}`. The secure route is supplied by the server and still requires a PHANTOM session.

### Template 2 — Code Rx Notification

Edit the existing spare **Welcome** template rather than creating a third template. Rename it:

```text
Code Rx Notification
```

Set its message headers as follows:

```text
Subject:     {{email_title}}
To Email:    {{to_email}}
From Name:   Code Rx Society
From Email:  Use Default Email Address
Reply To:    {{reply_to}}
Cc:          leave blank
Bcc:         leave blank
```

Use these exact template parameters in its content:

```text
to_email
reply_to
email_title
greeting
notification_body
action_label
action_link
sent_at
```

`notification_body` is plain text supplied by the secure server. In the HTML block that displays it, use `white-space:pre-line;` so its line breaks remain readable. The action button must use:

```html
<a href="{{action_link}}">{{action_label}}</a>
```

Do not replace `{{action_link}}` with a fixed URL. Password reset and member activation links are one-time security links supplied by the server.

### Paste-ready Code Rx Notification content

```html
<div style="margin:0;padding:24px 12px;background:#f1f8f4;font-family:Arial,Helvetica,sans-serif;color:#243447;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #dbe9e1;border-radius:14px;overflow:hidden;">
    <tr>
      <td style="padding:26px 30px;background:#063b2a;text-align:center;">
        <img src="https://coderxsociety.pages.dev/CODE%20RX11.png" alt="Code Rx Society" width="72" style="display:block;width:72px;height:72px;margin:0 auto 14px;border:0;" />
        <div style="font-size:21px;font-weight:800;line-height:28px;color:#ffffff;">{{email_title}}</div>
      </td>
    </tr>
    <tr>
      <td style="padding:28px 30px;">
        <div style="font-size:16px;font-weight:700;line-height:24px;color:#243447;">{{greeting}}</div>
        <div style="margin-top:15px;padding:18px;background:#f8fbf9;border-left:4px solid #059669;border-radius:6px;font-size:15px;line-height:24px;color:#334155;white-space:pre-line;">{{notification_body}}</div>
        <div style="margin-top:24px;text-align:center;">
          <a href="{{action_link}}" target="_blank" style="display:inline-block;padding:13px 20px;background:#059669;color:#ffffff;text-decoration:none;font-size:13px;font-weight:800;letter-spacing:0.6px;text-transform:uppercase;border-radius:8px;">{{action_label}}</a>
        </div>
      </td>
    </tr>
    <tr>
      <td style="padding:17px 30px;background:#f7faf8;border-top:1px solid #dce9e2;text-align:center;font-size:12px;line-height:18px;color:#64748b;">
        Code Rx Society notification<br />
        Sent: {{sent_at}}
      </td>
    </tr>
  </table>
</div>
```

## Separate-template layout (optional)

If your EmailJS plan later supports more templates, add an event-specific template ID for any event below. It overrides the shared notification template only for that event.

| Purpose | Pages variable | Template parameters |
|---|---|---|
| New JOIN application | `EMAILJS_TEMPLATE_ID_JOIN` | `to_email`, `applicant_name`, `applicant_email`, `applicant_phone`, `submitted_at`, `review_link` |
| New contact message | `EMAILJS_TEMPLATE_ID_CONTACT` | `to_email`, `sender_name`, `sender_email`, `subject`, `message`, `date` |
| Application review/rejection | `EMAILJS_TEMPLATE_ID_APPROVAL` | `to_email`, `member_name`, `status`, `date` |
| Password reset | `EMAILJS_TEMPLATE_ID_RESET` | `to_email`, `name`, `reset_link` |
| Member activation | `EMAILJS_TEMPLATE_ID_ACTIVATION` | `to_email`, `member_name`, `member_code`, `activation_link`, `role_name` |

## Set the Pages variables

Open **Cloudflare Dashboard → Workers & Pages → coderxsociety → Settings → Variables and Secrets** and add values to the **Production** environment.

### Two-template layout

Only these EmailJS variables are required:

```text
EMAILJS_PUBLIC_KEY
EMAILJS_SERVICE_ID
EMAILJS_TEMPLATE_ID_JOIN
EMAILJS_TEMPLATE_ID_GENERAL
```

Set `EMAILJS_TEMPLATE_ID_GENERAL` to the ID of **Code Rx Notification**. Leave the four event-specific variables empty unless you later create a dedicated template for that event.

### Separate-template layout

Configure the base values plus the template IDs you created:

```text
EMAILJS_PUBLIC_KEY
EMAILJS_SERVICE_ID
EMAILJS_TEMPLATE_ID_JOIN
EMAILJS_TEMPLATE_ID_GENERAL                 (optional fallback)
EMAILJS_TEMPLATE_ID_CONTACT                  (optional override)
EMAILJS_TEMPLATE_ID_APPROVAL                 (optional override)
EMAILJS_TEMPLATE_ID_RESET                    (optional override)
EMAILJS_TEMPLATE_ID_ACTIVATION               (optional override)
```

After changing Pages variables, deploy the current production build so the Functions use the updated environment.

`JWT_SECRET` and `ADMIN_PASSWORD` remain encrypted Cloudflare secrets. They are unrelated to EmailJS and must never be placed in an EmailJS template or client-side setting.

## Test safely

1. Save the EmailJS template before selecting **Test it**.
2. Test the JOIN template with a PHANTOM/admin inbox as `to_email` and `https://coderxsociety.pages.dev/#phantom-applications` as `review_link`.
3. Test **Code Rx Notification** with your own inbox:

   ```text
   to_email: your inbox
   reply_to: your inbox
   email_title: Test Code Rx notification
   greeting: Hello Test Member,
   notification_body: This is a safe test of the shared Code Rx notification template.
   action_label: Open Code Rx Society
   action_link: https://coderxsociety.pages.dev/#home
   sent_at: 2026-08-15T14:30:00.000Z
   ```

4. After deployment, submit a test Contact message, request a reset for a test account, and create a test member invitation as PHANTOM.
5. Check EmailJS activity and the mailbox spam folder if a message does not arrive.

When EmailJS is not configured, public JOIN and Contact forms still save to D1. Reset and activation links are deliberately not returned to public browsers, so configure delivery before relying on those flows in production.

## Troubleshooting

- Confirm the values are configured in the **Production** Pages environment, not only Preview.
- Confirm `EMAILJS_TEMPLATE_ID_GENERAL` is set when using the two-template layout.
- Confirm the generic template uses the eight parameter names above exactly.
- Confirm the EmailJS service and public key are configured. Do not share either in chat.
- Thunderbird and some other mail clients can block the external Code Rx11 image for privacy. Use **Show Remote Content** / **Allow remote content from coderxsociety.pages.dev** in the recipient mailbox; email HTML cannot force remote images to load.
- The Functions log `Email skipped — EmailJS not configured` when no usable EmailJS template ID, service ID, or public key is available.
