# ☁️ CODE Rx SOCIETY - Cloudflare Setup Guide

## 🎯 Architecture Overview

```
CODE Rx SOCIETY
       │
       ├── Cloudflare Pages (Website Hosting)
       ├── Cloudflare Workers (Backend API)
       ├── Cloudflare D1 (Database)
       ├── Cloudflare R2 (File Storage)
       └── Cloudflare Turnstile (Bot Protection)
```

**Cost:** ₵0/month (Free tier)

---

##  Step 1: Create Cloudflare Account

1. Go to https://www.cloudflare.com/
2. Click "Sign Up"
3. Use email: `coderxsociety@gmail.com`
4. Verify email address

---

##  Step 2: Create Cloudflare D1 Database

### In Cloudflare Dashboard:

1. Go to **Workers & Pages** → **D1**
2. Click **Create Database**
3. Name: `code-rx-db`
4. Region: Choose closest to Ghana (Europe/Africa)
5. Click **Create**

### Copy Database ID:
- After creation, copy the **Database ID** (UUID format)
- You'll need this for `wrangler.toml`

### Run SQL Schema:

1. Click on your database `code-rx-db`
2. Go to **Console** tab
3. Copy and paste this SQL:

```sql
-- Applications Table
CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  date TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Subscribers Table
CREATE TABLE IF NOT EXISTS subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  phone TEXT,
  date TEXT NOT NULL,
  source TEXT DEFAULT 'website',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Contacts Table
CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  date TEXT NOT NULL,
  status TEXT DEFAULT 'unread',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Site Content Table (CMS)
CREATE TABLE IF NOT EXISTS site_content (
  id INTEGER PRIMARY KEY DEFAULT 1,
  data TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT single_row CHECK (id = 1)
);

-- Members Table
CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  role TEXT DEFAULT 'member',
  joined_date TEXT NOT NULL,
  points INTEGER DEFAULT 0,
  level TEXT DEFAULT 'Pharmacy Technologist',
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Users Table (Authentication)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'member',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert default site content
INSERT OR IGNORE INTO site_content (id, data, updated_at) 
VALUES (1, '{}', CURRENT_TIMESTAMP);
```

4. Click **Run** to execute

---

##  Step 3: Create Cloudflare R2 Storage

### In Cloudflare Dashboard:

1. Go to **Workers & Pages** → **R2**
2. Click **Create Bucket**
3. Name: `code-rx-storage`
4. Click **Create Bucket**

### Configure Public Access (Optional):

1. Click on your bucket
2. Go to **Settings** → **Public Access**
3. Enable public access for specific folders if needed

### Folder Structure:
```
/code-rx-storage
  /profiles       - Member profile pictures
  /projects       - Project images
  /documents      - PDFs, certificates
  /uploads        - General uploads
```

---

##  Step 4: Deploy to Cloudflare Workers

### Install Wrangler CLI:

```bash
npm install -g wrangler
```

### Login to Cloudflare:

```bash
wrangler login
```

### Update wrangler.toml:

Open `wrangler.toml` and replace:
```toml
database_id = "YOUR_D1_DATABASE_ID"
```

With your actual D1 database ID from Step 2.

### Deploy:

```bash
# Deploy Workers API
wrangler deploy

# Deploy to production
wrangler deploy --env production
```

### Get API URL:

After deployment, you'll see:
```
https://code-rx-api.your-subdomain.workers.dev
```

Copy this URL - it's your API endpoint!

---

##  Step 5: Update Frontend Configuration

### Update `.env` file:

```env
# Replace with your actual Workers URL
VITE_API_URL=https://code-rx-api.your-subdomain.workers.dev

# R2 Storage URL
VITE_R2_BUCKET_URL=https://code-rx-storage.r2.cloudflarestorage.com

# Admin Email
VITE_ADMIN_EMAIL=coderxsociety@gmail.com

# Telegram Link
VITE_TELEGRAM_LINK=https://t.me/+EdRpfR1GTGNjM2Q0

# Feature Flags
VITE_ENABLE_EMAIL=false
VITE_ENABLE_UPLOADS=true
VITE_ENABLE_AUTH=false
```

### Build Frontend:

```bash
npm run build
```

---

##  Step 6: Deploy Frontend to Cloudflare Pages

### In Cloudflare Dashboard:

1. Go to **Workers & Pages** → **Pages**
2. Click **Create Pages**
3. Choose **Direct Upload**
4. Upload your `dist` folder
5. Name: `code-rx-society`
6. Click **Deploy**

### Or Connect to GitHub:

1. Choose **Connect to Git**
2. Select your repository
3. Build command: `npm run build`
4. Build output directory: `dist`
5. Click **Deploy**

### Connect to D1 & R2:

1. Go to your Pages project settings
2. **Functions** → **D1 Database Bindings**
3. Add binding: `DB` → `code-rx-db`
4. **Functions** → **R2 Bucket Bindings**
5. Add binding: `BUCKET` → `code-rx-storage`

---

##  Testing Your Setup

### 1. Test API Health:

```bash
curl https://code-rx-api.your-subdomain.workers.dev/api/health
```

Should return:
```json
{ "status": "ok", "timestamp": "2026-..." }
```

### 2. Test Frontend:

Visit: `https://code-rx-society.pages.dev`

### 3. Test Admin Panel:

1. Login with admin credentials
2. Try editing homepage content
3. Click "Save Changes"
4. Refresh frontend - changes should appear!

### 4. Test Forms:

- Join application → Check D1 database
- Contact form → Check D1 database
- Subscriber → Check D1 database

---

## 🔧 Local Development

### Run Workers Locally:

```bash
wrangler dev
```

This starts local API at: `http://localhost:8787`

### Run Frontend Locally:

```bash
npm run dev
```

Make sure `.env` has:
```env
VITE_API_URL=http://localhost:8787
```

---

## 📊 Monitoring & Logs

### View Logs:

```bash
wrangler tail
```

### View D1 Data:

1. Go to D1 dashboard
2. Click `code-rx-db`
3. **Console** tab
4. Run queries:

```sql
SELECT * FROM applications ORDER BY date DESC;
SELECT * FROM members WHERE is_active = 1;
SELECT COUNT(*) FROM subscribers;
```

### View R2 Files:

1. Go to R2 dashboard
2. Click `code-rx-storage`
3. Browse uploaded files

---

## 🔐 Security Best Practices

### 1. Enable Turnstile (Bot Protection):

```toml
# wrangler.toml
[vars]
TURNSTILE_SITE_KEY = "your_site_key"
TURNSTILE_SECRET_KEY = "your_secret_key"
```

### 2. Add Authentication Middleware:

```typescript
// functions/middleware.ts
import { jwt } from 'hono/jwt';

app.use('/api/admin/*', jwt({ secret: c.env.JWT_SECRET }));
```

### 3. Rate Limiting:

```typescript
// Add to Workers API
import { rateLimit } from 'hono-rate-limiter';

app.use('*', rateLimit({
  windowMs: 60000,
  limit: 100,
}));
```

---

## 💰 Cost Management

### Free Tier Limits:

| Service | Free Limit | Your Usage |
|---------|-----------|------------|
| Pages | 100GB bandwidth | ~1-5GB/month |
| Workers | 100K requests/day | ~1-5K/day |
| D1 | 5GB storage, 10M reads | ~100MB |
| R2 | 10GB storage, 10M reads | ~500MB |

### Monitor Usage:

1. Go to **Analytics** in dashboard
2. Check each service usage
3. Set up billing alerts

---

## 🚀 Deployment Workflow

### Daily Development:

```bash
# Make changes
git add .
git commit -m "feature: added new feature"
git push origin main

# Cloudflare auto-deploys from GitHub
```

### Manual Deployment:

```bash
npm run build
wrangler deploy --env production
```

---

## ️ Troubleshooting

### API Not Responding?
- Check Workers logs: `wrangler tail`
- Verify D1 binding in wrangler.toml
- Check CORS settings in API

### Database Errors?
- Verify D1 database ID
- Check SQL schema was created
- Test queries in D1 console

### File Upload Fails?
- Check R2 bucket permissions
- Verify bucket binding
- Check file size limits (max 100MB)

### Frontend Not Loading?
- Check Pages deployment status
- Verify build completed successfully
- Clear browser cache

---

## 📞 Support Resources

- **Cloudflare Docs:** https://developers.cloudflare.com/
- **D1 Docs:** https://developers.cloudflare.com/d1/
- **Workers Docs:** https://developers.cloudflare.com/workers/
- **R2 Docs:** https://developers.cloudflare.com/r2/
- **Hono Framework:** https://hono.dev/

---

## 🎉 You're All Set!

Your CODE Rx SOCIETY now runs on:
- ✅ Cloudflare Pages (Frontend)
- ✅ Cloudflare Workers (Backend API)
- ✅ Cloudflare D1 (Database)
- ✅ Cloudflare R2 (File Storage)

**Total Cost:** ₵0/month (Free tier)

**Next Steps:**
1. Configure custom domain (optional)
2. Set up email notifications
3. Add authentication system
4. Build out admin features

**Your website is now production-ready!** 🚀💻
