-- CODE Rx SOCIETY - Supabase Database Schema
-- Run this SQL in your Supabase SQL Editor to create all necessary tables

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Applications Table (Membership Requests)
CREATE TABLE IF NOT EXISTS applications (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  date DATE NOT NULL,
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

CREATE INDEX idx_applications_status ON applications(status);
CREATE INDEX idx_applications_date ON applications(date DESC);

-- 2. Subscribers Table (Newsletter Subscribers)
CREATE TABLE IF NOT EXISTS subscribers (
  id BIGSERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255),
  phone VARCHAR(50),
  date DATE NOT NULL,
  source VARCHAR(100) DEFAULT 'website',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

CREATE INDEX idx_subscribers_email ON subscribers(email);
CREATE INDEX idx_subscribers_date ON subscribers(date DESC);

-- 3. Contacts Table (Contact Form Messages)
CREATE TABLE IF NOT EXISTS contacts (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  subject VARCHAR(500) NOT NULL,
  message TEXT NOT NULL,
  date TIMESTAMP WITH TIME ZONE NOT NULL,
  status VARCHAR(50) DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'archived')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

CREATE INDEX idx_contacts_status ON contacts(status);
CREATE INDEX idx_contacts_date ON contacts(date DESC);

-- 4. Site Content Table (Website Content Management)
CREATE TABLE IF NOT EXISTS site_content (
  id INTEGER PRIMARY KEY DEFAULT 1,
  data JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  CONSTRAINT single_row CHECK (id = 1)
);

CREATE INDEX idx_site_content_updated ON site_content(updated_at DESC);

-- Insert default site content
INSERT INTO site_content (id, data, updated_at) 
VALUES (1, '{}'::jsonb, NOW())
ON CONFLICT (id) DO NOTHING;

-- 5. Members Table (Approved Members)
CREATE TABLE IF NOT EXISTS members (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  phone VARCHAR(50),
  role VARCHAR(100) DEFAULT 'member',
  joined_date DATE NOT NULL,
  points INTEGER DEFAULT 0,
  level VARCHAR(100) DEFAULT 'Pharmacy Technologist',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

CREATE INDEX idx_members_email ON members(email);
CREATE INDEX idx_members_active ON members(is_active);

-- 6. Projects Table
CREATE TABLE IF NOT EXISTS projects (
  id BIGSERIAL PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  status VARCHAR(50) DEFAULT 'active',
  progress INTEGER DEFAULT 0,
  team JSONB,
  technology JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

CREATE INDEX idx_projects_category ON projects(category);
CREATE INDEX idx_projects_status ON projects(status);

-- Enable Row Level Security (RLS)
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (adjust based on your security needs)
-- For production, you should create more restrictive policies

-- Applications: Anyone can insert, only admins can view/update
CREATE POLICY "Public can insert applications" ON applications
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Admins can view applications" ON applications
  FOR SELECT USING (true); -- Restrict this in production

-- Subscribers: Anyone can insert, only admins can view
CREATE POLICY "Public can subscribe" ON subscribers
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Admins can view subscribers" ON subscribers
  FOR SELECT USING (true); -- Restrict this in production

-- Contacts: Anyone can insert, only admins can view
CREATE POLICY "Public can send contacts" ON contacts
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Admins can view contacts" ON contacts
  FOR SELECT USING (true); -- Restrict this in production

-- Site Content: Only admins can view/update
CREATE POLICY "Admins can view site content" ON site_content
  FOR SELECT USING (true);

CREATE POLICY "Admins can update site content" ON site_content
  FOR UPDATE USING (true);

-- Members: Only admins can manage
CREATE POLICY "Admins can manage members" ON members
  FOR ALL USING (true);

-- Projects: Public can view, admins can manage
CREATE POLICY "Public can view projects" ON projects
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage projects" ON projects
  FOR ALL USING (true);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = TIMEZONE('utc', NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for site_content
CREATE TRIGGER update_site_content_updated_at
  BEFORE UPDATE ON site_content
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for projects
CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Grant necessary permissions
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Comments
COMMENT ON TABLE applications IS 'Membership applications from users wanting to join Code Rx Society';
COMMENT ON TABLE subscribers IS 'Newsletter and update subscribers';
COMMENT ON TABLE contacts IS 'Contact form messages sent to admin';
COMMENT ON TABLE site_content IS 'Dynamic website content managed through admin panel';
COMMENT ON TABLE members IS 'Approved members of Code Rx Society';
COMMENT ON TABLE projects IS 'Code Rx Society projects and initiatives';
