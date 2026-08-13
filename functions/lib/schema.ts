// Cloudflare D1 schema, safe migrations, and foundational Code Rx Vault seeds.
// Existing website tables are retained. New organization data lives in additive
// tables so a production deployment never deletes site content or members.

import type { Env } from '../env';
import { hashPassword } from './auth';
import { allocateMemberCode, FOUNDING_CODENAMES, VAULT_SECTION_SEEDS } from './vault';
import { SCORE_RULE_SEEDS } from './score';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
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
  status TEXT NOT NULL DEFAULT 'unread' CHECK (status IN ('unread','read','archived')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS site_content (
  id INTEGER PRIMARY KEY DEFAULT 1,
  data TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT single_row CHECK (id = 1)
);

-- Legacy members remain the website-facing member list. member_profiles below
-- adds the secure identity, member ID, status, roles, and Vault relationship.
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
  name TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member','admin','phantom')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS password_resets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS member_sequences (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  next_value INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  is_system INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS member_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER UNIQUE,
  member_record_id INTEGER UNIQUE,
  member_code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending_activation' CHECK (status IN ('pending_activation','active','locked','archived')),
  primary_role_id INTEGER,
  codename_path TEXT NOT NULL DEFAULT 'member' CHECK (codename_path IN ('member','custom_founding','direct_founding')),
  locked_reason TEXT,
  locked_at DATETIME,
  archived_at DATETIME,
  created_by_user_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(member_record_id) REFERENCES members(id),
  FOREIGN KEY(primary_role_id) REFERENCES roles(id)
);

CREATE TABLE IF NOT EXISTS member_activations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_profile_id INTEGER NOT NULL,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at DATETIME,
  revoked_at DATETIME,
  sent_at DATETIME,
  delivery_status TEXT NOT NULL DEFAULT 'not_sent',
  created_by_user_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(member_profile_id) REFERENCES member_profiles(id)
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id INTEGER NOT NULL,
  section_slug TEXT NOT NULL,
  can_view INTEGER NOT NULL DEFAULT 0,
  can_create INTEGER NOT NULL DEFAULT 0,
  can_edit INTEGER NOT NULL DEFAULT 0,
  can_delete INTEGER NOT NULL DEFAULT 0,
  can_manage INTEGER NOT NULL DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(role_id, section_slug),
  FOREIGN KEY(role_id) REFERENCES roles(id)
);

CREATE TABLE IF NOT EXISTS member_permission_overrides (
  member_profile_id INTEGER NOT NULL,
  section_slug TEXT NOT NULL,
  can_view INTEGER,
  can_create INTEGER,
  can_edit INTEGER,
  can_delete INTEGER,
  can_manage INTEGER,
  updated_by_user_id INTEGER,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(member_profile_id, section_slug),
  FOREIGN KEY(member_profile_id) REFERENCES member_profiles(id)
);

CREATE TABLE IF NOT EXISTS member_role_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_profile_id INTEGER NOT NULL,
  previous_role_id INTEGER,
  new_role_id INTEGER NOT NULL,
  changed_by_user_id INTEGER,
  reason TEXT,
  changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(member_profile_id) REFERENCES member_profiles(id)
);

CREATE TABLE IF NOT EXISTS codenames (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  normalized_name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  pool TEXT NOT NULL DEFAULT 'member' CHECK (pool IN ('member','founding')),
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','reserved','claimed','retired')),
  reserved_note TEXT,
  reserved_by_user_id INTEGER,
  claimed_by_member_profile_id INTEGER UNIQUE,
  claimed_at DATETIME,
  created_by_user_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(claimed_by_member_profile_id) REFERENCES member_profiles(id)
);

CREATE TABLE IF NOT EXISTS codename_selection_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_profile_id INTEGER NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','completed','expired')),
  pool TEXT NOT NULL DEFAULT 'member' CHECK (pool IN ('member','founding')),
  assignment_source TEXT NOT NULL DEFAULT 'ballot' CHECK (assignment_source IN ('ballot','phantom_direct')),
  passes_used INTEGER NOT NULL DEFAULT 0 CHECK (passes_used BETWEEN 0 AND 2),
  claimed_codename_id INTEGER,
  current_codename_id INTEGER,
  -- The slot order and revealed IDs remain server-side until a card is opened.
  -- They support a three-choice comparison ballot without exposing covered names.
  ballot_slots_json TEXT NOT NULL DEFAULT '[]',
  revealed_codenames_json TEXT NOT NULL DEFAULT '[]',
  review_target_count INTEGER NOT NULL DEFAULT 3,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  FOREIGN KEY(member_profile_id) REFERENCES member_profiles(id),
  FOREIGN KEY(claimed_codename_id) REFERENCES codenames(id),
  FOREIGN KEY(current_codename_id) REFERENCES codenames(id)
);

CREATE TABLE IF NOT EXISTS codename_selection_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  codename_id INTEGER,
  action TEXT NOT NULL CHECK (action IN ('unavailable_check','available_check','passed','claimed')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(session_id) REFERENCES codename_selection_sessions(id),
  FOREIGN KEY(codename_id) REFERENCES codenames(id)
);

CREATE TABLE IF NOT EXISTS codename_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codename_id INTEGER NOT NULL,
  member_profile_id INTEGER,
  event_type TEXT NOT NULL CHECK (event_type IN ('added','reserved','unreserved','claimed','released','retired')),
  acted_by_user_id INTEGER,
  note TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(codename_id) REFERENCES codenames(id),
  FOREIGN KEY(member_profile_id) REFERENCES member_profiles(id)
);

CREATE TABLE IF NOT EXISTS website_admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_profile_id INTEGER NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','removed')),
  assigned_by_user_id INTEGER,
  assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  suspended_at DATETIME,
  FOREIGN KEY(member_profile_id) REFERENCES member_profiles(id)
);

CREATE TABLE IF NOT EXISTS website_admin_permissions (
  website_admin_id INTEGER NOT NULL,
  permission_key TEXT NOT NULL,
  allowed INTEGER NOT NULL DEFAULT 1,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(website_admin_id, permission_key),
  FOREIGN KEY(website_admin_id) REFERENCES website_admins(id)
);

CREATE TABLE IF NOT EXISTS vault_sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  is_sensitive INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vault_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_code TEXT UNIQUE,
  section_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  content_json TEXT,
  content_format TEXT NOT NULL DEFAULT 'plain',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_review','approved','active','archived')),
  tags_json TEXT NOT NULL DEFAULT '[]',
  related_project_id INTEGER,
  word_count INTEGER NOT NULL DEFAULT 0,
  last_saved_at DATETIME,
  visibility TEXT NOT NULL DEFAULT 'section' CHECK (visibility IN ('section','members','restricted')),
  file_key TEXT,
  created_by_member_profile_id INTEGER,
  updated_by_member_profile_id INTEGER,
  is_archived INTEGER NOT NULL DEFAULT 0,
  archived_from_status TEXT,
  archived_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(section_id) REFERENCES vault_sections(id)
);

CREATE TABLE IF NOT EXISTS vault_document_sequences (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  next_value INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS member_share_permissions (
  member_profile_id INTEGER PRIMARY KEY,
  can_share INTEGER NOT NULL DEFAULT 0,
  can_download INTEGER NOT NULL DEFAULT 0,
  updated_by_user_id INTEGER,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(member_profile_id) REFERENCES member_profiles(id)
);

CREATE TABLE IF NOT EXISTS vault_shares (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  -- Encrypted with the deployment secret. This lets an authorized creator
  -- recopy a previously-created link without storing the bearer token in
  -- plaintext or exposing it from the public endpoint.
  token_ciphertext TEXT,
  created_by_member_profile_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  allow_download INTEGER NOT NULL DEFAULT 0,
  expires_at DATETIME,
  last_accessed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(document_id) REFERENCES vault_documents(id),
  FOREIGN KEY(created_by_member_profile_id) REFERENCES member_profiles(id)
);

CREATE TABLE IF NOT EXISTS document_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL,
  version_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  content_json TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  tags_json TEXT NOT NULL DEFAULT '[]',
  related_project_id INTEGER,
  word_count INTEGER NOT NULL DEFAULT 0,
  file_key TEXT,
  changed_by_member_profile_id INTEGER,
  change_note TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(document_id, version_number),
  FOREIGN KEY(document_id) REFERENCES vault_documents(id)
);

CREATE TABLE IF NOT EXISTS vault_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  normalized_name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vault_document_tags (
  document_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  PRIMARY KEY(document_id, tag_id),
  FOREIGN KEY(document_id) REFERENCES vault_documents(id),
  FOREIGN KEY(tag_id) REFERENCES vault_tags(id)
);

CREATE TABLE IF NOT EXISTS vault_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER,
  section_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  file_key TEXT NOT NULL UNIQUE,
  mime_type TEXT,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  uploaded_by_member_profile_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(document_id) REFERENCES vault_documents(id),
  FOREIGN KEY(section_id) REFERENCES vault_sections(id)
);

CREATE TABLE IF NOT EXISTS vault_activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_member_profile_id INTEGER,
  action TEXT NOT NULL,
  section_id INTEGER,
  document_id INTEGER,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(actor_member_profile_id) REFERENCES member_profiles(id),
  FOREIGN KEY(section_id) REFERENCES vault_sections(id),
  FOREIGN KEY(document_id) REFERENCES vault_documents(id)
);

CREATE TABLE IF NOT EXISTS vault_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL,
  block_id TEXT,
  author_member_profile_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  is_resolved INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(document_id) REFERENCES vault_documents(id),
  FOREIGN KEY(author_member_profile_id) REFERENCES member_profiles(id)
);

CREATE TABLE IF NOT EXISTS vault_projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planning',
  description TEXT NOT NULL DEFAULT '',
  lead_member_profile_id INTEGER,
  github_url TEXT,
  documentation_url TEXT,
  timeline TEXT,
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_by_member_profile_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(lead_member_profile_id) REFERENCES member_profiles(id)
);

CREATE TABLE IF NOT EXISTS vault_project_members (
  project_id INTEGER NOT NULL,
  member_profile_id INTEGER NOT NULL,
  responsibility TEXT,
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(project_id, member_profile_id),
  FOREIGN KEY(project_id) REFERENCES vault_projects(id),
  FOREIGN KEY(member_profile_id) REFERENCES member_profiles(id)
);

CREATE TABLE IF NOT EXISTS vault_project_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  file_key TEXT NOT NULL,
  uploaded_by_member_profile_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(project_id) REFERENCES vault_projects(id)
);

CREATE TABLE IF NOT EXISTS vault_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'todo',
  assigned_member_profile_id INTEGER,
  due_at TEXT,
  created_by_member_profile_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(project_id) REFERENCES vault_projects(id),
  FOREIGN KEY(assigned_member_profile_id) REFERENCES member_profiles(id)
);

CREATE TABLE IF NOT EXISTS meetings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section_id INTEGER,
  project_id INTEGER,
  title TEXT NOT NULL,
  held_at TEXT NOT NULL,
  agenda TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL DEFAULT 'members' CHECK (visibility IN ('members','restricted')),
  created_by_member_profile_id INTEGER,
  updated_by_member_profile_id INTEGER,
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(section_id) REFERENCES vault_sections(id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id INTEGER,
  actor_member_profile_id INTEGER,
  action TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS score_rules (
  rule_key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  points INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_by_user_id INTEGER,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS member_score_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_profile_id INTEGER NOT NULL,
  member_record_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  rule_key TEXT,
  reference_type TEXT,
  reference_id TEXT,
  points_delta INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_by_user_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(member_profile_id, rule_key, reference_type, reference_id),
  FOREIGN KEY(member_profile_id) REFERENCES member_profiles(id),
  FOREIGN KEY(member_record_id) REFERENCES members(id)
);

CREATE TABLE IF NOT EXISTS notification_delegates (
  member_profile_id INTEGER PRIMARY KEY,
  can_send INTEGER NOT NULL DEFAULT 0,
  assigned_by_user_id INTEGER,
  assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(member_profile_id) REFERENCES member_profiles(id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  audience_type TEXT NOT NULL CHECK (audience_type IN ('all','selected','role','system')),
  audience_label TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','deleted')),
  created_by_member_profile_id INTEGER,
  created_by_user_id INTEGER,
  sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(created_by_member_profile_id) REFERENCES member_profiles(id)
);

CREATE TABLE IF NOT EXISTS notification_recipients (
  notification_id INTEGER NOT NULL,
  member_profile_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'unread' CHECK (status IN ('unread','read')),
  delivered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  read_at DATETIME,
  PRIMARY KEY(notification_id, member_profile_id),
  FOREIGN KEY(notification_id) REFERENCES notifications(id),
  FOREIGN KEY(member_profile_id) REFERENCES member_profiles(id)
);

-- Community + messaging system. Public visitors are explicitly separate from
-- authenticated Code Rx members, and all private conversations reference the
-- existing member_profiles table and never use public guest identities.
CREATE TABLE IF NOT EXISTS community_guest_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  email_hash TEXT NOT NULL,
  public_handle TEXT NOT NULL UNIQUE,
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','restricted','banned')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS public_forum_threads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_by_guest_id INTEGER,
  created_by_member_profile_id INTEGER,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','locked','archived','deleted')),
  is_pinned INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(created_by_guest_id) REFERENCES community_guest_sessions(id),
  FOREIGN KEY(created_by_member_profile_id) REFERENCES member_profiles(id)
);

CREATE TABLE IF NOT EXISTS public_forum_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id INTEGER NOT NULL,
  body TEXT NOT NULL,
  parent_post_id INTEGER,
  created_by_guest_id INTEGER,
  created_by_member_profile_id INTEGER,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','deleted','hidden')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(thread_id) REFERENCES public_forum_threads(id),
  FOREIGN KEY(parent_post_id) REFERENCES public_forum_posts(id),
  FOREIGN KEY(created_by_guest_id) REFERENCES community_guest_sessions(id),
  FOREIGN KEY(created_by_member_profile_id) REFERENCES member_profiles(id)
);

CREATE TABLE IF NOT EXISTS public_forum_reactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  actor_key TEXT NOT NULL,
  emoji TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(post_id, actor_key, emoji),
  FOREIGN KEY(post_id) REFERENCES public_forum_posts(id)
);

CREATE TABLE IF NOT EXISTS public_forum_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id INTEGER,
  post_id INTEGER,
  reporter_key TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed','resolved','dismissed')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  reviewed_by_user_id INTEGER,
  reviewed_at DATETIME
);

CREATE TABLE IF NOT EXISTS public_chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  body TEXT NOT NULL,
  created_by_guest_id INTEGER,
  created_by_member_profile_id INTEGER,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','deleted','hidden')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(created_by_guest_id) REFERENCES community_guest_sessions(id),
  FOREIGN KEY(created_by_member_profile_id) REFERENCES member_profiles(id)
);

CREATE TABLE IF NOT EXISTS community_conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('dm','group')),
  direct_key TEXT UNIQUE,
  title TEXT,
  description TEXT NOT NULL DEFAULT '',
  image_key TEXT,
  join_mode TEXT NOT NULL DEFAULT 'invite' CHECK (join_mode IN ('invite','open','approval','assigned')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','locked','archived','deleted')),
  owner_member_profile_id INTEGER,
  pinned_message_id INTEGER,
  telegram_sync_enabled INTEGER NOT NULL DEFAULT 0,
  telegram_chat_id TEXT UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(owner_member_profile_id) REFERENCES member_profiles(id)
);

CREATE TABLE IF NOT EXISTS community_conversation_members (
  conversation_id INTEGER NOT NULL,
  member_profile_id INTEGER NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','moderator','member')),
  membership_status TEXT NOT NULL DEFAULT 'active' CHECK (membership_status IN ('active','left','removed')),
  muted_until DATETIME,
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_read_message_id INTEGER,
  last_read_at DATETIME,
  PRIMARY KEY(conversation_id, member_profile_id),
  FOREIGN KEY(conversation_id) REFERENCES community_conversations(id),
  FOREIGN KEY(member_profile_id) REFERENCES member_profiles(id)
);

CREATE TABLE IF NOT EXISTS community_group_join_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL,
  member_profile_id INTEGER NOT NULL,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  reviewed_by_member_profile_id INTEGER,
  reviewed_at DATETIME,
  UNIQUE(conversation_id, member_profile_id),
  FOREIGN KEY(conversation_id) REFERENCES community_conversations(id),
  FOREIGN KEY(member_profile_id) REFERENCES member_profiles(id)
);

CREATE TABLE IF NOT EXISTS community_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL,
  sender_member_profile_id INTEGER,
  message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text','image','file','voice','video','system','announcement')),
  body TEXT NOT NULL DEFAULT '',
  reply_to_message_id INTEGER,
  source TEXT NOT NULL DEFAULT 'website' CHECK (source IN ('website','telegram','system')),
  telegram_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','deleted','hidden')),
  edited_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(conversation_id) REFERENCES community_conversations(id),
  FOREIGN KEY(sender_member_profile_id) REFERENCES member_profiles(id),
  FOREIGN KEY(reply_to_message_id) REFERENCES community_messages(id),
  UNIQUE(conversation_id, source, telegram_message_id)
);

CREATE TABLE IF NOT EXISTS community_message_reactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL,
  member_profile_id INTEGER NOT NULL,
  emoji TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(message_id, member_profile_id, emoji),
  FOREIGN KEY(message_id) REFERENCES community_messages(id),
  FOREIGN KEY(member_profile_id) REFERENCES member_profiles(id)
);

CREATE TABLE IF NOT EXISTS community_message_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL,
  reporter_member_profile_id INTEGER NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed','resolved','dismissed')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  reviewed_by_member_profile_id INTEGER,
  reviewed_at DATETIME,
  FOREIGN KEY(message_id) REFERENCES community_messages(id),
  FOREIGN KEY(reporter_member_profile_id) REFERENCES member_profiles(id)
);

CREATE TABLE IF NOT EXISTS community_message_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('image','video','document','pdf','audio','other')),
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','deleted','moderated')),
  telegram_sync_status TEXT NOT NULL DEFAULT 'not_requested',
  telegram_synced_at DATETIME,
  telegram_sync_error TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(message_id) REFERENCES community_messages(id)
);

CREATE TABLE IF NOT EXISTS community_media_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('global','area','group')),
  scope_key TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('all','image','video','document','pdf','audio','other')),
  enabled INTEGER NOT NULL DEFAULT 0,
  max_bytes INTEGER NOT NULL DEFAULT 0,
  allowed_mimes_json TEXT NOT NULL DEFAULT '[]',
  storage_limit_bytes INTEGER NOT NULL DEFAULT 0,
  telegram_auto_delete_after_sync INTEGER NOT NULL DEFAULT 0,
  updated_by_user_id INTEGER,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(scope_type, scope_key, media_type)
);

CREATE TABLE IF NOT EXISTS community_telegram_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_profile_id INTEGER NOT NULL UNIQUE,
  telegram_chat_id TEXT NOT NULL UNIQUE,
  telegram_user_id TEXT,
  linked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  disconnected_at DATETIME,
  FOREIGN KEY(member_profile_id) REFERENCES member_profiles(id)
);

CREATE TABLE IF NOT EXISTS community_telegram_link_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_profile_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  used_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(member_profile_id) REFERENCES member_profiles(id)
);

CREATE TABLE IF NOT EXISTS community_telegram_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_update_id TEXT NOT NULL UNIQUE,
  processed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  payload_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS community_telegram_message_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL,
  telegram_chat_id TEXT NOT NULL,
  telegram_message_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('website_to_telegram','telegram_to_website')),
  synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(telegram_chat_id, telegram_message_id),
  FOREIGN KEY(message_id) REFERENCES community_messages(id)
);

CREATE TABLE IF NOT EXISTS recycle_bin_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  title TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  deleted_by_user_id INTEGER,
  deleted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(deleted_by_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS system_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_by_user_id INTEGER,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(status);
CREATE INDEX IF NOT EXISTS idx_subscribers_email ON subscribers(email);
CREATE INDEX IF NOT EXISTS idx_member_profiles_status ON member_profiles(status);
CREATE INDEX IF NOT EXISTS idx_member_profiles_role ON member_profiles(primary_role_id);
CREATE INDEX IF NOT EXISTS idx_member_activations_profile ON member_activations(member_profile_id, used_at, revoked_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_codenames_status ON codenames(status);
CREATE INDEX IF NOT EXISTS idx_codenames_pool_status ON codenames(pool, status);
CREATE INDEX IF NOT EXISTS idx_codename_events_session ON codename_selection_events(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_vault_documents_section ON vault_documents(section_id, is_archived, updated_at);
CREATE INDEX IF NOT EXISTS idx_vault_documents_status ON vault_documents(status, is_archived, updated_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_vault_documents_code ON vault_documents(document_code);
CREATE INDEX IF NOT EXISTS idx_vault_shares_document ON vault_shares(document_id, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_score_events_member ON member_score_events(member_profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_recipients_member ON notification_recipients(member_profile_id, status, delivered_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_sent ON notifications(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_status_sent ON notifications(status, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_recycle_bin_deleted_at ON recycle_bin_items(deleted_at DESC);
CREATE INDEX IF NOT EXISTS idx_public_threads_activity ON public_forum_threads(status, is_pinned DESC, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_public_posts_thread ON public_forum_posts(thread_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_public_chat_created ON public_chat_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_conversations_activity ON community_conversations(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_members_profile ON community_conversation_members(member_profile_id, membership_status, joined_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_messages_conversation ON community_messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_message_reactions ON community_message_reactions(message_id, emoji);
CREATE INDEX IF NOT EXISTS idx_community_join_requests ON community_group_join_requests(conversation_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_attachments_message ON community_message_attachments(message_id, status);
CREATE INDEX IF NOT EXISTS idx_community_attachments_telegram_sync ON community_message_attachments(status, telegram_sync_status, created_at);
CREATE INDEX IF NOT EXISTS idx_community_telegram_links_message ON community_telegram_message_links(message_id, synced_at DESC);
CREATE INDEX IF NOT EXISTS idx_vault_attachments_document ON vault_attachments(document_id, created_at);
CREATE INDEX IF NOT EXISTS idx_vault_activity_created ON vault_activity(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vault_projects_status ON vault_projects(status, is_archived);
CREATE INDEX IF NOT EXISTS idx_vault_tasks_project ON vault_tasks(project_id, status);
CREATE INDEX IF NOT EXISTS idx_meetings_project ON meetings(project_id, held_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_subject ON audit_logs(subject_type, subject_id);
`;

// These are intentionally separate from CREATE TABLE so live D1 databases
// created by older versions receive non-destructive columns. Duplicate-column
// errors are safely ignored by runSafeMigrations below.
const SAFE_MIGRATIONS = [
  { table: 'community_conversations', column: 'telegram_chat_id', sql: 'ALTER TABLE community_conversations ADD COLUMN telegram_chat_id TEXT' },
  { table: 'community_media_settings', column: 'telegram_auto_delete_after_sync', sql: 'ALTER TABLE community_media_settings ADD COLUMN telegram_auto_delete_after_sync INTEGER NOT NULL DEFAULT 0' },
  { table: 'community_message_attachments', column: 'telegram_sync_status', sql: "ALTER TABLE community_message_attachments ADD COLUMN telegram_sync_status TEXT NOT NULL DEFAULT 'not_requested'" },
  { table: 'community_message_attachments', column: 'telegram_synced_at', sql: 'ALTER TABLE community_message_attachments ADD COLUMN telegram_synced_at DATETIME' },
  { table: 'community_message_attachments', column: 'telegram_sync_error', sql: 'ALTER TABLE community_message_attachments ADD COLUMN telegram_sync_error TEXT' },

  { table: 'member_activations', column: 'revoked_at', sql: 'ALTER TABLE member_activations ADD COLUMN revoked_at DATETIME' },
  { table: 'member_activations', column: 'sent_at', sql: 'ALTER TABLE member_activations ADD COLUMN sent_at DATETIME' },
  { table: 'member_activations', column: 'delivery_status', sql: "ALTER TABLE member_activations ADD COLUMN delivery_status TEXT NOT NULL DEFAULT 'not_sent'" },
  { table: 'applications', column: 'reviewed_by_user_id', sql: 'ALTER TABLE applications ADD COLUMN reviewed_by_user_id INTEGER' },
  { table: 'applications', column: 'reviewed_at', sql: 'ALTER TABLE applications ADD COLUMN reviewed_at TEXT' },
  { table: 'applications', column: 'review_note', sql: 'ALTER TABLE applications ADD COLUMN review_note TEXT' },
  { table: 'applications', column: 'member_profile_id', sql: 'ALTER TABLE applications ADD COLUMN member_profile_id INTEGER' },
  { table: 'applications', column: 'updated_at', sql: 'ALTER TABLE applications ADD COLUMN updated_at TEXT' },
  { table: 'meetings', column: 'project_id', sql: 'ALTER TABLE meetings ADD COLUMN project_id INTEGER' },
  { table: 'vault_documents', column: 'document_code', sql: 'ALTER TABLE vault_documents ADD COLUMN document_code TEXT' },
  { table: 'member_share_permissions', column: 'can_download', sql: 'ALTER TABLE member_share_permissions ADD COLUMN can_download INTEGER NOT NULL DEFAULT 0' },
  { table: 'vault_shares', column: 'allow_download', sql: 'ALTER TABLE vault_shares ADD COLUMN allow_download INTEGER NOT NULL DEFAULT 0' },
  { table: 'vault_shares', column: 'token_ciphertext', sql: 'ALTER TABLE vault_shares ADD COLUMN token_ciphertext TEXT' },
  { table: 'notifications', column: 'status', sql: "ALTER TABLE notifications ADD COLUMN status TEXT NOT NULL DEFAULT 'active'" },
  { table: 'vault_documents', column: 'content_json', sql: 'ALTER TABLE vault_documents ADD COLUMN content_json TEXT' },
  { table: 'vault_documents', column: 'content_format', sql: "ALTER TABLE vault_documents ADD COLUMN content_format TEXT NOT NULL DEFAULT 'plain'" },
  { table: 'vault_documents', column: 'status', sql: "ALTER TABLE vault_documents ADD COLUMN status TEXT NOT NULL DEFAULT 'draft'" },
  { table: 'vault_documents', column: 'tags_json', sql: "ALTER TABLE vault_documents ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]'" },
  { table: 'vault_documents', column: 'related_project_id', sql: 'ALTER TABLE vault_documents ADD COLUMN related_project_id INTEGER' },
  { table: 'vault_documents', column: 'word_count', sql: 'ALTER TABLE vault_documents ADD COLUMN word_count INTEGER NOT NULL DEFAULT 0' },
  { table: 'vault_documents', column: 'last_saved_at', sql: 'ALTER TABLE vault_documents ADD COLUMN last_saved_at TEXT' },
  { table: 'vault_documents', column: 'archived_from_status', sql: 'ALTER TABLE vault_documents ADD COLUMN archived_from_status TEXT' },
  { table: 'vault_documents', column: 'archived_at', sql: 'ALTER TABLE vault_documents ADD COLUMN archived_at TEXT' },
  { table: 'document_versions', column: 'content_json', sql: 'ALTER TABLE document_versions ADD COLUMN content_json TEXT' },
  { table: 'document_versions', column: 'status', sql: "ALTER TABLE document_versions ADD COLUMN status TEXT NOT NULL DEFAULT 'draft'" },
  { table: 'document_versions', column: 'tags_json', sql: "ALTER TABLE document_versions ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]'" },
  { table: 'document_versions', column: 'related_project_id', sql: 'ALTER TABLE document_versions ADD COLUMN related_project_id INTEGER' },
  { table: 'document_versions', column: 'word_count', sql: 'ALTER TABLE document_versions ADD COLUMN word_count INTEGER NOT NULL DEFAULT 0' },
  { table: 'member_profiles', column: 'codename_path', sql: "ALTER TABLE member_profiles ADD COLUMN codename_path TEXT NOT NULL DEFAULT 'member'" },
  { table: 'codenames', column: 'pool', sql: "ALTER TABLE codenames ADD COLUMN pool TEXT NOT NULL DEFAULT 'member'" },
  { table: 'codename_selection_sessions', column: 'pool', sql: "ALTER TABLE codename_selection_sessions ADD COLUMN pool TEXT NOT NULL DEFAULT 'member'" },
  { table: 'codename_selection_sessions', column: 'assignment_source', sql: "ALTER TABLE codename_selection_sessions ADD COLUMN assignment_source TEXT NOT NULL DEFAULT 'ballot'" },
  { table: 'codename_selection_sessions', column: 'current_codename_id', sql: 'ALTER TABLE codename_selection_sessions ADD COLUMN current_codename_id INTEGER' },
  { table: 'codename_selection_sessions', column: 'ballot_slots_json', sql: "ALTER TABLE codename_selection_sessions ADD COLUMN ballot_slots_json TEXT NOT NULL DEFAULT '[]'" },
  { table: 'codename_selection_sessions', column: 'revealed_codenames_json', sql: "ALTER TABLE codename_selection_sessions ADD COLUMN revealed_codenames_json TEXT NOT NULL DEFAULT '[]'" },
  { table: 'codename_selection_sessions', column: 'review_target_count', sql: 'ALTER TABLE codename_selection_sessions ADD COLUMN review_target_count INTEGER NOT NULL DEFAULT 3' },
] as const;

const VAULT_SCHEMA_VERSION = '2026-08-13-member-invitation-flow-15';


const ROLE_SEEDS = [
  ['phantom', 'PHANTOM', 'Founder identity / full system coordination', 1],
  ['nexus', 'NEXUS', 'Founding Code Rx identity; responsibilities configured by PHANTOM', 1],
  ['ghost', 'GHOST', 'Founding Code Rx identity; responsibilities configured by PHANTOM', 1],
  ['falcon', 'FALCON', 'Founding Code Rx identity; responsibilities configured by PHANTOM', 1],
  ['quantum', 'QUANTUM', 'Founding Code Rx identity; responsibilities configured by PHANTOM', 1],
  ['matrix', 'MATRIX', 'Founding Code Rx identity; responsibilities configured by PHANTOM', 1],
  ['member', 'Member', 'Standard Code Rx member', 1],
  ['custom', 'Custom', 'Custom responsibility profile', 0],
] as const;

const ROLE_DEFAULT_SECTIONS: Record<string, string[]> = {};

const MEMBER_VIEW_SECTIONS = new Set(['society', 'meetings', 'projects', 'technology', 'coding', 'pharmacy-healthcare', 'resources', 'sops', 'research', 'ideas', 'achievements', 'roadmap']);

const g = globalThis as Record<string, unknown>;

const asRows = async <T>(statement: D1PreparedStatement): Promise<T[]> => {
  const result = await statement.all<T>();
  return result.results || [];
};

const runBatchInChunks = async (db: D1Database, statements: D1PreparedStatement[], size = 50) => {
  for (let index = 0; index < statements.length; index += size) {
    await db.batch(statements.slice(index, index + size));
  }
};

const runSafeMigrations = async (db: D1Database) => {
  const tables = [...new Set(SAFE_MIGRATIONS.map((migration) => migration.table))];
  const infos = await db.batch(tables.map((table) => db.prepare(`PRAGMA table_info(${table})`)));
  const existing = new Map<string, Set<string>>();
  tables.forEach((table, index) => {
    const rows = (infos[index].results || []) as Array<{ name?: string }>;
    existing.set(table, new Set(rows.map((row) => row.name).filter((name): name is string => Boolean(name))));
  });
  const missing = SAFE_MIGRATIONS.filter((migration) => !existing.get(migration.table)?.has(migration.column));
  if (missing.length) await runBatchInChunks(db, missing.map((migration) => db.prepare(migration.sql)), 25);
};


/**
 * Older Vault builds could set a document's status to `archived` without
 * moving it into the actual archive. Normalize those rows once so archive
 * navigation, restoration, and status counts stay in agreement.
 */
const normalizeDocumentArchiveState = async (db: D1Database) => {
  await db.prepare(
    `UPDATE vault_documents
     SET is_archived = 1,
         archived_from_status = CASE
           WHEN archived_from_status IN ('draft', 'in_review', 'approved', 'active') THEN archived_from_status
           ELSE 'draft'
         END,
         archived_at = COALESCE(archived_at, updated_at, created_at, CURRENT_TIMESTAMP)
     WHERE status = 'archived' AND is_archived = 0`
  ).run();
};

const documentCode = (sequence: number) => `CRX-DOC-${String(sequence).padStart(4, '0')}`;

/** Assign permanent, readable codes to legacy Vault documents without changing their IDs. */
const backfillDocumentCodes = async (db: D1Database) => {
  await db.prepare('INSERT OR IGNORE INTO vault_document_sequences (id, next_value) VALUES (1, 1)').run();
  const existingRows = await asRows<{ document_code: string | null }>(db.prepare('SELECT document_code FROM vault_documents WHERE document_code IS NOT NULL'));
  const used = new Set(existingRows.map((row) => row.document_code).filter((code): code is string => Boolean(code)));
  let highest = 0;
  for (const code of used) {
    const match = /^CRX-DOC-(\d+)$/i.exec(code);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  const missing = await asRows<{ id: number }>(db.prepare("SELECT id FROM vault_documents WHERE document_code IS NULL OR document_code = '' ORDER BY id"));
  const statements: D1PreparedStatement[] = [];
  for (const document of missing) {
    do { highest += 1; } while (used.has(documentCode(highest)));
    const code = documentCode(highest);
    used.add(code);
    statements.push(db.prepare('UPDATE vault_documents SET document_code = ? WHERE id = ?').bind(code, document.id));
  }
  if (statements.length) await runBatchInChunks(db, statements, 25);
  const currentRows = await asRows<{ next_value: number }>(db.prepare('SELECT next_value FROM vault_document_sequences WHERE id = 1'));
  const nextValue = Math.max(Number(currentRows[0]?.next_value || 1), highest + 1);
  await db.prepare('UPDATE vault_document_sequences SET next_value = ? WHERE id = 1').bind(nextValue).run();
};

const seedScoreRules = async (db: D1Database) => {
  const statements = SCORE_RULE_SEEDS.flatMap((rule) => [
    db.prepare(
      `INSERT OR IGNORE INTO score_rules (rule_key, label, description, points, enabled)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(rule.key, rule.label, rule.description, rule.points, rule.enabled),
    // Preserve PHANTOM's configured points/enabled choice while keeping the
    // human-facing labels and eligibility descriptions accurate on upgrades.
    db.prepare('UPDATE score_rules SET label = ?, description = ? WHERE rule_key = ?')
      .bind(rule.label, rule.description, rule.key),
  ]);
  await runBatchInChunks(db, statements);
};

const seedFeatureSettings = async (db: D1Database) => {
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO system_settings (setting_key, setting_value, updated_at) VALUES ('vault_sharing_enabled', '0', CURRENT_TIMESTAMP)"),
    db.prepare("INSERT OR IGNORE INTO system_settings (setting_key, setting_value, updated_at) VALUES ('vault_downloads_enabled', '0', CURRENT_TIMESTAMP)"),
  ]);
};

const seedCommunityMediaSettings = async (db: D1Database) => {
  const defaults = [
    ['global', 'global', 'all', 0, 0, '[]', 0],
    ['area', 'private', 'all', 0, 0, '[]', 0],
    ['area', 'public_forum', 'all', 0, 0, '[]', 0],
    ['area', 'public_chat', 'all', 0, 0, '[]', 0],
  ] as const;
  await runBatchInChunks(db, defaults.map(([scopeType, scopeKey, mediaType, enabled, maxBytes, mimes, storageLimit]) => db.prepare(
    `INSERT OR IGNORE INTO community_media_settings
     (scope_type, scope_key, media_type, enabled, max_bytes, allowed_mimes_json, storage_limit_bytes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(scopeType, scopeKey, mediaType, enabled, maxBytes, mimes, storageLimit)));
};

const migrateFoundingRoleCodes = async (db: D1Database) => {
  // Earlier development builds used operational labels as founding role codes.
  // Rename only where the new identity has not yet been created, preserving the
  // same role ID, memberships, permissions, and role history.
  const replacements = [
    ['kernel', 'ghost', 'GHOST'],
    ['signal', 'falcon', 'FALCON'],
    ['pulse', 'quantum', 'QUANTUM'],
    ['vault', 'matrix', 'MATRIX'],
  ] as const;
  for (const [oldCode, newCode, newName] of replacements) {
    const oldRows = await asRows<{ id: number }>(db.prepare('SELECT id FROM roles WHERE code = ?').bind(oldCode));
    const newRows = await asRows<{ id: number }>(db.prepare('SELECT id FROM roles WHERE code = ?').bind(newCode));
    if (oldRows[0] && !newRows[0]) {
      await db.prepare('UPDATE roles SET code = ?, name = ?, description = ? WHERE id = ?')
        .bind(newCode, newName, 'Founding Code Rx identity; responsibilities configured by PHANTOM', oldRows[0].id).run();
    }
  }
};

const seedRolesAndPermissions = async (db: D1Database) => {
  const roleInserts = ROLE_SEEDS.map(([code, name, description, isSystem]) =>
    db.prepare('INSERT OR IGNORE INTO roles (code, name, description, is_system) VALUES (?, ?, ?, ?)').bind(code, name, description, isSystem)
  );
  await runBatchInChunks(db, roleInserts);
  const founderUpdates = ROLE_SEEDS.filter(([code]) => ['phantom', 'nexus', 'ghost', 'falcon', 'quantum', 'matrix'].includes(code)).map(([code, name, description, isSystem]) =>
    db.prepare('UPDATE roles SET name = ?, description = ?, is_system = ? WHERE code = ?').bind(name, description, isSystem, code)
  );
  await runBatchInChunks(db, founderUpdates);

  const roles = await asRows<{ id: number; code: string }>(db.prepare('SELECT id, code FROM roles'));
  const sections = VAULT_SECTION_SEEDS.map(([slug]) => slug);
  const permissions: D1PreparedStatement[] = [];
  for (const role of roles) {
    for (const section of sections) {
      let values = [0, 0, 0, 0, 0];
      if (role.code === 'phantom') values = [1, 1, 1, 1, 1];
      else if (role.code === 'member' && MEMBER_VIEW_SECTIONS.has(section)) values = [1, 0, 0, 0, 0];
      else if ((ROLE_DEFAULT_SECTIONS[role.code] || []).includes(section)) values = [1, 1, 1, 1, 1];
      else if (section === 'society' || section === 'roadmap') values = [1, 0, 0, 0, 0];
      permissions.push(db.prepare(
        `INSERT OR IGNORE INTO role_permissions
         (role_id, section_slug, can_view, can_create, can_edit, can_delete, can_manage)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(role.id, section, ...values));
    }
  }
  await runBatchInChunks(db, permissions);
};

const seedVaultSections = async (db: D1Database) => {
  await runBatchInChunks(db, VAULT_SECTION_SEEDS.map(([slug, title, description, order]) =>
    db.prepare('INSERT OR IGNORE INTO vault_sections (slug, title, description, is_sensitive, sort_order) VALUES (?, ?, ?, ?, ?)')
      .bind(slug, title, description, slug === 'finance' ? 1 : 0, order)
  ));
};

const ensureFoundingCodenames = async (db: D1Database, phantomProfileId: number) => {
  for (const identity of FOUNDING_CODENAMES) {
    const normalized = identity.toLowerCase();
    const existing = await asRows<any>(db.prepare('SELECT * FROM codenames WHERE normalized_name = ?').bind(normalized));
    if (!existing[0]) {
      const isPhantom = identity === 'PHANTOM';
      const result = await db.prepare(
        `INSERT INTO codenames (normalized_name, display_name, pool, status, reserved_note, claimed_by_member_profile_id, claimed_at)
         VALUES (?, ?, 'founding', ?, ?, ?, CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE NULL END)`
      ).bind(normalized, identity, isPhantom ? 'claimed' : 'available', isPhantom ? null : 'Founding identity available for PHANTOM assignment or Custom ballot', isPhantom ? phantomProfileId : null, isPhantom ? 1 : 0).run();
      const codenameId = Number(result.meta.last_row_id);
      await db.prepare('INSERT INTO codename_history (codename_id, member_profile_id, event_type, note) VALUES (?, ?, ?, ?)')
        .bind(codenameId, isPhantom ? phantomProfileId : null, isPhantom ? 'claimed' : 'reserved', isPhantom ? 'PHANTOM founding identity' : 'Founding identity reserved').run();
      continue;
    }
    if (identity === 'PHANTOM' && !existing[0].claimed_by_member_profile_id && ['available', 'reserved'].includes(existing[0].status)) {
      await db.prepare("UPDATE codenames SET pool = 'founding', status = 'claimed', claimed_by_member_profile_id = ?, claimed_at = CURRENT_TIMESTAMP, reserved_note = NULL WHERE id = ?")
        .bind(phantomProfileId, existing[0].id).run();
      await db.prepare('INSERT INTO codename_history (codename_id, member_profile_id, event_type, note) VALUES (?, ?, ?, ?)')
        .bind(existing[0].id, phantomProfileId, 'claimed', 'PHANTOM founding identity').run();
    } else if (identity !== 'PHANTOM' && !existing[0].claimed_by_member_profile_id && existing[0].reserved_note === 'Founding identity reserved') {
      // Earlier builds reserved these names. The corrected flow keeps them in
      // the founding pool but makes them available to PHANTOM/custom users.
      await db.prepare("UPDATE codenames SET pool = 'founding', status = 'available', reserved_note = 'Founding identity available for PHANTOM assignment or Custom ballot' WHERE id = ?")
        .bind(existing[0].id).run();
    } else if (FOUNDING_CODENAMES.includes(identity as typeof FOUNDING_CODENAMES[number])) {
      await db.prepare("UPDATE codenames SET pool = 'founding' WHERE id = ?").bind(existing[0].id).run();
    }
  }
};

/**
 * NEXUS, GHOST, FALCON, QUANTUM and MATRIX are the shared founding ballot
 * choices for Custom members. Older live databases may still mark them as
 * reserved from an earlier model; an unclaimed default founding identity must
 * be selectable by a Custom ballot.
 */
const normalizeCustomFoundingAvailability = async (db: D1Database) => {
  const names = FOUNDING_CODENAMES.filter((name) => name !== 'PHANTOM').map((name) => name.toLowerCase());
  await db.prepare(
    `UPDATE codenames
     SET pool = 'founding', status = 'available', reserved_note = 'Founding identity available for Custom ballot', updated_at = CURRENT_TIMESTAMP
     WHERE normalized_name IN (${names.map(() => '?').join(',')})
       AND claimed_by_member_profile_id IS NULL
       AND status IN ('available', 'reserved')`
  ).bind(...names).run();
};

const ensurePhantom = async (env: Env) => {
  const db = env.DB;
  const email = String(env.PHANTOM_EMAIL || env.ADMIN_EMAIL || '').trim().toLowerCase();
  if (!email) return;
  let userRows = await asRows<any>(db.prepare('SELECT id, email, name FROM users WHERE email = ?').bind(email));
  if (!userRows[0]) {
    const password = String(env.ADMIN_PASSWORD || '').trim();
    if (!password) {
      console.warn('[code-rx] PHANTOM account was not seeded: set ADMIN_PASSWORD as a Cloudflare secret for a fresh database.');
      return;
    }
    const hash = await hashPassword(password);
    const created = await db.prepare('INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)')
      .bind(email, 'PHANTOM', hash, 'admin').run();
    userRows = [{ id: Number(created.meta.last_row_id), email, name: 'PHANTOM' }];
  }

  const user = userRows[0];
  await db.prepare("UPDATE users SET role = 'admin', name = COALESCE(NULLIF(name, ''), 'PHANTOM') WHERE id = ?").bind(user.id).run();

  const phantomRoleRows = await asRows<{ id: number }>(db.prepare("SELECT id FROM roles WHERE code = 'phantom'"));
  const phantomRoleId = phantomRoleRows[0]?.id;
  let memberRows = await asRows<{ id: number }>(db.prepare('SELECT id FROM members WHERE email = ?').bind(email));
  if (!memberRows[0]) {
    const created = await db.prepare(
      'INSERT INTO members (name, email, phone, role, joined_date, points, level, is_active) VALUES (?, ?, NULL, ?, ?, 0, ?, 1)'
    ).bind('PHANTOM', email, 'phantom', new Date().toISOString().slice(0, 10), 'Founder / Super Admin').run();
    memberRows = [{ id: Number(created.meta.last_row_id) }];
  }

  const profileRows = await asRows<{ id: number }>(db.prepare('SELECT id FROM member_profiles WHERE user_id = ?').bind(user.id));
  if (!profileRows[0]) {
    const code = await allocateMemberCode(db);
    await db.prepare(
      `INSERT INTO member_profiles (user_id, member_record_id, member_code, status, primary_role_id, codename_path, created_by_user_id)
       VALUES (?, ?, ?, 'active', ?, 'direct_founding', ?)`
    ).bind(user.id, memberRows[0].id, code, phantomRoleId ?? null, user.id).run();
  } else {
    await db.prepare("UPDATE member_profiles SET status = 'active', primary_role_id = ?, codename_path = 'direct_founding' WHERE id = ?")
      .bind(phantomRoleId ?? null, profileRows[0].id).run();
  }
  const currentProfile = await asRows<{ id: number }>(db.prepare('SELECT id FROM member_profiles WHERE user_id = ?').bind(user.id));
  if (currentProfile[0]) await ensureFoundingCodenames(db, currentProfile[0].id);
};

/**
 * Runs once per isolate. All changes are additive: no existing website table,
 * account, membership record, or site-content row is dropped or replaced.
 */
export async function ensureSchema(env: Env): Promise<void> {
  if (g.__codeRxSchemaReady) return;
  const inFlight = g.__codeRxSchemaReadyPromise as Promise<void> | undefined;
  if (inFlight) return inFlight;

  const initialize = (async () => {
    const db = env.DB;
    const statements = SCHEMA.split(';').map((statement) => statement.trim()).filter(Boolean);
    // One D1 batch avoids dozens of sequential network round trips on a cold
    // login. Both normal and UNIQUE indexes must wait until ALTER migrations
    // add any referenced columns to an older live D1 database.
    const isIndexStatement = (statement: string) => /^CREATE\s+(?:UNIQUE\s+)?INDEX/i.test(statement);
    const indexStatements = statements.filter(isIndexStatement);
    const schemaStatements = statements.filter((statement) => !isIndexStatement(statement));
    await runBatchInChunks(db, schemaStatements.map((statement) => db.prepare(statement)));
    await db.prepare('INSERT OR IGNORE INTO site_content (id, data, updated_at) VALUES (1, ?, CURRENT_TIMESTAMP)').bind('{}').run();
    await db.prepare('INSERT OR IGNORE INTO member_sequences (id, next_value) VALUES (1, 1)').run();
    await db.prepare('INSERT OR IGNORE INTO vault_document_sequences (id, next_value) VALUES (1, 1)').run();

    const versionRows = await asRows<{ setting_value: string }>(db.prepare("SELECT setting_value FROM system_settings WHERE setting_key = 'vault_schema_version'"));
    if (versionRows[0]?.setting_value !== VAULT_SCHEMA_VERSION) {
      await runSafeMigrations(db);
      await normalizeDocumentArchiveState(db);
      await backfillDocumentCodes(db);
      await runBatchInChunks(db, indexStatements.map((statement) => db.prepare(statement)));
      await migrateFoundingRoleCodes(db);
      await seedRolesAndPermissions(db);
      await seedVaultSections(db);
      await seedScoreRules(db);
      await seedFeatureSettings(db);
      await seedCommunityMediaSettings(db);
      await ensurePhantom(env);
      await normalizeCustomFoundingAvailability(db);
      await db.prepare(
        `INSERT INTO system_settings (setting_key, setting_value, updated_at)
         VALUES ('vault_schema_version', ?, CURRENT_TIMESTAMP)
         ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = CURRENT_TIMESTAMP`
      ).bind(VAULT_SCHEMA_VERSION).run();
    }
    g.__codeRxSchemaReady = true;
  })();

  g.__codeRxSchemaReadyPromise = initialize;
  try {
    await initialize;
  } finally {
    delete g.__codeRxSchemaReadyPromise;
  }
}
