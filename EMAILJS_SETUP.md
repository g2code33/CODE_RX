# EmailJS Setup Guide for CODE Rx SOCIETY

## Step 1: Create EmailJS Account
1. Go to https://www.emailjs.com/
2. Sign up for a free account
3. Verify your email

## Step 2: Add Email Service
1. Go to **Email Services** in the dashboard
2. Click **Add New Service**
3. Choose your email provider (Gmail recommended)
4. Connect your Gmail account (coderxsociety@gmail.com)
5. Copy the **Service ID** (e.g., `service_xyz123`)

## Step 3: Create Email Templates

### Template 1: Join Application Notification
**Template ID:** `template_join`

**Subject:** New Membership Application - {{applicant_name}}

**Content (HTML):**
```html
<h2>New Membership Application</h2>
<p><strong>Applicant:</strong> {{applicant_name}}</p>
<p><strong>Email:</strong> {{applicant_email}}</p>
<p><strong>Phone:</strong> {{applicant_phone}}</p>
<p><strong>Date:</strong> {{date}}</p>
<hr>
<p>Login to the admin panel to review and approve this application.</p>
<p><a href="https://coderx.org/admin" style="background: #10b981; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Review Application</a></p>
```

**Variables:**
- `{{applicant_name}}`
- `{{applicant_email}}`
- `{{applicant_phone}}`
- `{{date}}`
- `{{to_email}}` (auto-filled with admin email)

---

### Template 2: Contact Message Notification
**Template ID:** `template_contact`

**Subject:** New Contact Message - {{subject}}

**Content (HTML):**
```html
<h2>New Contact Message</h2>
<p><strong>From:</strong> {{sender_name}} ({{sender_email}})</p>
<p><strong>Subject:</strong> {{subject}}</p>
<p><strong>Date:</strong> {{date}}</p>
<hr>
<h3>Message:</h3>
<p>{{message}}</p>
<hr>
<p><a href="https://coderx.org/admin" style="background: #10b981; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View in Admin Panel</a></p>
```

**Variables:**
- `{{sender_name}}`
- `{{sender_email}}`
- `{{subject}}`
- `{{message}}`
- `{{date}}`
- `{{to_email}}` (auto-filled with admin email)

---

### Template 3: Subscription Confirmation (Optional)
**Template ID:** `template_subscribe`

**Subject:** Welcome to CODE Rx Society! 🎉

**Content (HTML):**
```html
<h2>Welcome to CODE Rx Society! 💊💻</h2>
<p>Hi {{subscriber_name}},</p>
<p>Thank you for subscribing to CODE Rx Society updates!</p>
<p>You'll now receive:</p>
<ul>
  <li>Latest pharmacy technology news</li>
  <li>Event announcements</li>
  <li>Learning opportunities</li>
  <li>Competition updates</li>
</ul>
<p>Stay tuned for exciting updates!</p>
<hr>
<p style="font-size: 12px; color: #666;">
  CODE Rx Society - Coding the Future of Pharmacy<br>
  Email: coderxsociety@gmail.com<br>
  Telegram: <a href="https://t.me/+EdRpfR1GTGNjM2Q0">Join Channel</a>
</p>
```

**Variables:**
- `{{subscriber_name}}`
- `{{date}}`
- `{{to_email}}` (auto-filled with subscriber email)

---

### Template 4: Application Approval (Optional)
**Template ID:** `template_approval`

**Subject:** Welcome to CODE Rx Society - Application Approved! 🎉

**Content (HTML):**
```html
<h2>Welcome to CODE Rx Society! 🎉</h2>
<p>Dear {{member_name}},</p>
<p>Congratulations! Your membership application has been <strong>approved</strong>.</p>
<p>You are now part of our community of pharmacy innovators!</p>
<h3>Next Steps:</h3>
<ol>
  <li>Join our Telegram channel: <a href="https://t.me/+EdRpfR1GTGNjM2Q0">Click Here</a></li>
  <li>Check out our learning platform</li>
  <li>Explore ongoing projects</li>
  <li>Participate in upcoming events</li>
</ol>
<p>We're excited to have you on board!</p>
<hr>
<p style="font-size: 12px; color: #666;">
  CODE Rx Society - Coding the Future of Pharmacy<br>
  Email: coderxsociety@gmail.com
</p>
```

**Variables:**
- `{{member_name}}`
- `{{date}}`
- `{{to_email}}` (auto-filled with member email)

---

## Step 4: Get Your Public Key
1. Go to **Account** (click your name in top right)
2. Copy your **Public Key** (e.g., `user_abc123`)

## Step 5: Update config.ts
Open `src/config.ts` and replace the placeholder values:

```typescript
export const CONFIG = {
  EMAILJS: {
    PUBLIC_KEY: 'user_abc123', // Your public key
    SERVICE_ID: 'service_xyz123', // Your service ID
    TEMPLATE_ID_JOIN: 'template_join',
    TEMPLATE_ID_CONTACT: 'template_contact',
    TEMPLATE_ID_SUBSCRIBE: 'template_subscribe'
  },
  // ... rest of config
};
```

## Step 6: Test Email Sending
1. Deploy your website
2. Fill out the join application form
3. Check your admin email (coderxsociety@gmail.com)
4. You should receive a notification!

## Free Tier Limits
- 200 emails/month (free tier)
- Upgrade to paid plan for more emails

## Troubleshooting
- **Emails not sending?** Check browser console for errors
- **Wrong template?** Verify template IDs match in config.ts
- **Not receiving?** Check spam folder
