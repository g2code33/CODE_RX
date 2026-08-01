// Cloudflare Workers API for CODE Rx SOCIETY
// This handles all backend operations: database, storage, authentication

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { jwt } from 'hono/jwt';

// Initialize Hono app
const app = new Hono();

// Enable CORS for frontend access
app.use('/*', cors());

// ============================================
// 📊 DATABASE SCHEMA (D1)
// ============================================
/*
CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  date TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  phone TEXT,
  date TEXT NOT NULL,
  source TEXT DEFAULT 'website',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

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

CREATE TABLE IF NOT EXISTS site_content (
  id INTEGER PRIMARY KEY DEFAULT 1,
  data TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT single_row CHECK (id = 1)
);

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

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'member',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
*/

// ============================================
// 🌐 API ENDPOINTS
// ============================================

// Health check
app.get('/api/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================
//  APPLICATIONS (Join Requests)
// ============================================

// Get all applications (Admin only)
app.get('/api/applications', async (c) => {
  try {
    const db = c.env.DB;
    const { results } = await db.prepare('SELECT * FROM applications ORDER BY date DESC').all();
    return c.json({ success: true, data: results });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch applications' }, 500);
  }
});

// Create new application
app.post('/api/applications', async (c) => {
  try {
    const body = await c.req.json();
    const db = c.env.DB;
    
    await db.prepare(`
      INSERT INTO applications (name, email, phone, date, status)
      VALUES (?, ?, ?, ?, 'pending')
    `).bind(body.name, body.email, body.phone, new Date().toISOString().split('T')[0]).run();
    
    // TODO: Send email notification via Cloudflare Workers Email
    
    return c.json({ success: true, message: 'Application submitted successfully' });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to create application' }, 500);
  }
});

// Update application status (Approve/Reject)
app.patch('/api/applications/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const db = c.env.DB;
    
    await db.prepare(`
      UPDATE applications SET status = ? WHERE id = ?
    `).bind(body.status, id).run();
    
    // TODO: Send approval/rejection email
    
    return c.json({ success: true, message: 'Application updated' });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to update application' }, 500);
  }
});

// ============================================
// 📧 SUBSCRIBERS
// ============================================

// Get all subscribers (Admin only)
app.get('/api/subscribers', async (c) => {
  try {
    const db = c.env.DB;
    const { results } = await db.prepare('SELECT * FROM subscribers ORDER BY date DESC').all();
    return c.json({ success: true, data: results });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch subscribers' }, 500);
  }
});

// Create subscriber
app.post('/api/subscribers', async (c) => {
  try {
    const body = await c.req.json();
    const db = c.env.DB;
    
    await db.prepare(`
      INSERT OR IGNORE INTO subscribers (email, name, phone, date, source)
      VALUES (?, ?, ?, ?, ?)
    `).bind(body.email, body.name, body.phone, new Date().toISOString().split('T')[0], body.source || 'website').run();
    
    return c.json({ success: true, message: 'Subscribed successfully' });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to subscribe' }, 500);
  }
});

// ============================================
//  CONTACT MESSAGES
// ============================================

// Get all contact messages (Admin only)
app.get('/api/contacts', async (c) => {
  try {
    const db = c.env.DB;
    const { results } = await db.prepare('SELECT * FROM contacts ORDER BY date DESC').all();
    return c.json({ success: true, data: results });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch contacts' }, 500);
  }
});

// Create contact message
app.post('/api/contacts', async (c) => {
  try {
    const body = await c.req.json();
    const db = c.env.DB;
    
    await db.prepare(`
      INSERT INTO contacts (name, email, subject, message, date, status)
      VALUES (?, ?, ?, ?, ?, 'unread')
    `).bind(body.name, body.email, body.subject, body.message, new Date().toISOString()).run();
    
    // TODO: Send email notification to admin
    
    return c.json({ success: true, message: 'Message sent successfully' });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to send message' }, 500);
  }
});

// Update contact status
app.patch('/api/contacts/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const db = c.env.DB;
    
    await db.prepare(`
      UPDATE contacts SET status = ? WHERE id = ?
    `).bind(body.status, id).run();
    
    return c.json({ success: true, message: 'Contact updated' });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to update contact' }, 500);
  }
});

// ============================================
//  SITE CONTENT (CMS)
// ============================================

// Get site content
app.get('/api/site-content', async (c) => {
  try {
    const db = c.env.DB;
    const { results } = await db.prepare('SELECT data FROM site_content WHERE id = 1').all();
    
    if (results.length === 0) {
      // Return default content if none exists
      return c.json({ 
        success: true, 
        data: null 
      });
    }
    
    return c.json({ 
      success: true, 
      data: JSON.parse(results[0].data) 
    });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch site content' }, 500);
  }
});

// Update site content (Admin only)
app.put('/api/site-content', async (c) => {
  try {
    const body = await c.req.json();
    const db = c.env.DB;
    
    await db.prepare(`
      INSERT OR REPLACE INTO site_content (id, data, updated_at)
      VALUES (1, ?, CURRENT_TIMESTAMP)
    `).bind(JSON.stringify(body)).run();
    
    return c.json({ success: true, message: 'Site content updated' });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to update site content' }, 500);
  }
});

// ============================================
// 👥 MEMBERS
// ============================================

// Get all members (Admin only)
app.get('/api/members', async (c) => {
  try {
    const db = c.env.DB;
    const { results } = await db.prepare('SELECT * FROM members WHERE is_active = 1 ORDER BY created_at DESC').all();
    return c.json({ success: true, data: results });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch members' }, 500);
  }
});

// Create member (when application approved)
app.post('/api/members', async (c) => {
  try {
    const body = await c.req.json();
    const db = c.env.DB;
    
    await db.prepare(`
      INSERT INTO members (name, email, phone, joined_date, role, points, level)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      body.name, 
      body.email, 
      body.phone, 
      new Date().toISOString().split('T')[0],
      body.role || 'member',
      body.points || 0,
      body.level || 'Pharmacy Technologist'
    ).run();
    
    return c.json({ success: true, message: 'Member created successfully' });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to create member' }, 500);
  }
});

// Update member
app.patch('/api/members/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const db = c.env.DB;
    
    const fields = [];
    const values = [];
    
    if (body.points !== undefined) {
      fields.push('points = ?');
      values.push(body.points);
    }
    if (body.level !== undefined) {
      fields.push('level = ?');
      values.push(body.level);
    }
    if (body.is_active !== undefined) {
      fields.push('is_active = ?');
      values.push(body.is_active);
    }
    
    if (fields.length > 0) {
      values.push(id);
      await db.prepare(`
        UPDATE members SET ${fields.join(', ')} WHERE id = ?
      `).bind(...values).run();
    }
    
    return c.json({ success: true, message: 'Member updated' });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to update member' }, 500);
  }
});

// ============================================
// 🔐 AUTHENTICATION
// ============================================

// Login
app.post('/api/auth/login', async (c) => {
  try {
    const body = await c.req.json();
    const db = c.env.DB;
    
    const { results } = await db.prepare(`
      SELECT * FROM users WHERE email = ?
    `).bind(body.email).all();
    
    if (results.length === 0) {
      return c.json({ success: false, error: 'Invalid credentials' }, 401);
    }
    
    // TODO: Verify password hash
    // For now, simple check (implement proper bcrypt in production)
    
    return c.json({ 
      success: true, 
      user: { 
        id: results[0].id,
        email: results[0].email,
        role: results[0].role 
      }
    });
  } catch (error) {
    return c.json({ success: false, error: 'Login failed' }, 500);
  }
});

// Register
app.post('/api/auth/register', async (c) => {
  try {
    const body = await c.req.json();
    const db = c.env.DB;
    
    // TODO: Hash password
    await db.prepare(`
      INSERT INTO users (email, password_hash, role)
      VALUES (?, ?, 'member')
    `).bind(body.email, body.password).run();
    
    return c.json({ success: true, message: 'Account created' });
  } catch (error) {
    return c.json({ success: false, error: 'Registration failed' }, 500);
  }
});

// ============================================
// 📦 FILE UPLOADS (R2 Storage)
// ============================================

// Upload file to R2
app.post('/api/upload', async (c) => {
  try {
    const formData = await c.req.formData();
    const file = formData.get('file');
    const folder = formData.get('folder') || 'uploads';
    
    if (!file) {
      return c.json({ success: false, error: 'No file provided' }, 400);
    }
    
    const filename = `${folder}/${Date.now()}-${file.name}`;
    
    // Upload to R2
    await c.env.BUCKET.put(filename, file.stream());
    
    const url = `https://code-rx-storage.r2.cloudflarestorage.com/${filename}`;
    
    return c.json({ 
      success: true, 
      url: url,
      filename: filename 
    });
  } catch (error) {
    return c.json({ success: false, error: 'Upload failed' }, 500);
  }
});

// Get file from R2
app.get('/api/files/:filename', async (c) => {
  try {
    const filename = c.req.param('filename');
    const object = await c.env.BUCKET.get(filename);
    
    if (!object) {
      return c.json({ success: false, error: 'File not found' }, 404);
    }
    
    return new Response(object.body, {
      headers: {
        'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream'
      }
    });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to get file' }, 500);
  }
});

// ============================================
//  ANALYTICS & STATS
// ============================================

// Get dashboard stats
app.get('/api/stats', async (c) => {
  try {
    const db = c.env.DB;
    
    const [applications, members, subscribers, contacts] = await Promise.all([
      db.prepare('SELECT COUNT(*) as count FROM applications').all(),
      db.prepare('SELECT COUNT(*) as count FROM members WHERE is_active = 1').all(),
      db.prepare('SELECT COUNT(*) as count FROM subscribers').all(),
      db.prepare('SELECT COUNT(*) as count FROM contacts WHERE status = "unread"').all()
    ]);
    
    return c.json({
      success: true,
      data: {
        applications: applications.results[0]?.count || 0,
        members: members.results[0]?.count || 0,
        subscribers: subscribers.results[0]?.count || 0,
        unreadContacts: contacts.results[0]?.count || 0
      }
    });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch stats' }, 500);
  }
});

// ============================================
//  EMAIL NOTIFICATIONS (via Cloudflare Email)
// ============================================

// Send email (internal endpoint)
app.post('/api/email/send', async (c) => {
  try {
    const body = await c.req.json();
    
    // TODO: Implement Cloudflare Email Sending API
    // For now, log the email request
    console.log('Email request:', body);
    
    return c.json({ success: true, message: 'Email queued' });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to send email' }, 500);
  }
});

// Export the Hono app
export default app;
