# 🔑 CODE Rx SOCIETY - API Keys Setup Guide

## 📁 Environment Variables (.env file)

Your API keys are now stored securely in the `.env` file (not committed to Git).

### Location:
```
/
├── .env              ← Your actual keys (DO NOT COMMIT TO GIT)
├── .env.example      ← Template file (safe to commit)
└── src/
    └── config.ts     ← Loads keys from .env
```

---

## ️ Step 1: Get Your Supabase Keys

1. **Go to Supabase Dashboard**
   - URL: https://app.supabase.com/
   - Login with coderxsociety@gmail.com

2. **Select Your Project**
   - Click on your CODE Rx project

3. **Get API Keys**
   - Go to **Settings** → **API**
   - Copy these two values:
     - **Project URL** (e.g., `https://xxxxx.supabase.co`)
     - **anon/public key** (long string starting with `eyJ...`)

4. **Update .env file**
   ```env
   VITE_SUPABASE_URL=https://xxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```

---

## ⚙️ Step 2: Get Your EmailJS Keys

1. **Go to EmailJS Dashboard**
   - URL: https://dashboard.emailjs.com/
   - Login or create account

2. **Get Public Key**
   - Click your name (top right) → **Account**
   - Copy **Public Key** (e.g., `user_abc123`)

3. **Get Service ID**
   - Go to **Email Services**
   - Click on your Gmail service
   - Copy **Service ID** (e.g., `service_xyz123`)

4. **Get Template IDs**
   - Go to **Email Templates**
   - Copy each template ID:
     - Join Application Template
     - Contact Message Template
     - Subscription Template

5. **Update .env file**
   ```env
   VITE_EMAILJS_PUBLIC_KEY=user_abc123
   VITE_EMAILJS_SERVICE_ID=service_xyz123
   VITE_EMAILJS_TEMPLATE_ID_JOIN=template_join123
   VITE_EMAILJS_TEMPLATE_ID_CONTACT=template_contact456
   VITE_EMAILJS_TEMPLATE_ID_SUBSCRIBE=template_subscribe789
   ```

---

## ⚙️ Step 3: Verify Other Settings

Check these are correct in `.env`:
```env
VITE_ADMIN_EMAIL=coderxsociety@gmail.com
VITE_TELEGRAM_LINK=https://t.me/+EdRpfR1GTGNjM2Q0
```

---

## 🧪 Step 4: Test Your Configuration

1. **Restart Development Server**
   ```bash
   # Stop current server (Ctrl+C)
   npm run dev
   ```

2. **Check Console**
   - Open browser DevTools (F12)
   - Look for any warnings about missing keys
   - If configured correctly, no warnings should appear

3. **Test Forms**
   - Try joining (should save to Supabase)
   - Try contact form (should send email)
   - Check admin panel (should load from database)

---

## 🔒 Security Best Practices

### ✅ DO:
- Keep `.env` file in `.gitignore`
- Use `.env.example` as template for team members
- Rotate keys periodically
- Use different keys for development and production

###  DON'T:
- Commit `.env` to Git
- Share keys publicly
- Use same keys across multiple projects
- Store keys in code files

---

## 📋 .env File Template

Here's what your final `.env` should look like:

```env
# Supabase
VITE_SUPABASE_URL=https://yourproject.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# EmailJS
VITE_EMAILJS_PUBLIC_KEY=user_abc123
VITE_EMAILJS_SERVICE_ID=service_xyz123
VITE_EMAILJS_TEMPLATE_ID_JOIN=template_join123
VITE_EMAILJS_TEMPLATE_ID_CONTACT=template_contact456
VITE_EMAILJS_TEMPLATE_ID_SUBSCRIBE=template_subscribe789

# Admin
VITE_ADMIN_EMAIL=coderxsociety@gmail.com
VITE_TELEGRAM_LINK=https://t.me/+EdRpfR1GTGNjM2Q0
```

---

## 🚨 Troubleshooting

### "Missing environment variables" warning?
- Make sure `.env` file exists in project root
- Restart dev server after editing `.env`
- Check for typos in variable names

### Keys not working?
- Verify keys are copied correctly (no extra spaces)
- Check Supabase project is active
- Ensure EmailJS service is connected

### Forms not saving?
- Check browser console for errors
- Verify Supabase tables exist (run SQL schema)
- Check Row Level Security policies

---

##  Need Help?

1. Check `PRODUCTION_SETUP.md` for detailed setup
2. Check `EMAILJS_SETUP.md` for email templates
3. Review Supabase logs in dashboard
4. Check EmailJS delivery logs

---

**Your keys are now secure and loaded from `.env`!** 🔐
