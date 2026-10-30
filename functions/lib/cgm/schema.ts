/**
 * CODE Rx SOCIETY — Class & Group Management (CGM) database schema.
 *
 * Every statement here is additive and idempotent. The SQL is appended to the
 * platform schema in `functions/lib/schema.ts`, so the same cold-start boot
 * that has always created the Society's tables also creates these — an
 * existing production database is never dropped, altered destructively, or
 * reset. Relationships use permanent integer ids, never names.
 *
 * Design rule (from the module specification): a permanent student identity is
 * separate from class membership. One identity can hold many memberships, and
 * leaving one class never deletes the identity or its history.
 */

export const CGM_SCHEMA = `
CREATE TABLE IF NOT EXISTS cgm_sequences (
  id TEXT PRIMARY KEY,
  next_value INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS cgm_students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  index_number TEXT NOT NULL,
  index_number_key TEXT NOT NULL,
  institution TEXT NOT NULL DEFAULT '',
  institution_key TEXT NOT NULL DEFAULT '',
  university_id TEXT,
  university_id_key TEXT,
  phone TEXT,
  phone_key TEXT,
  email TEXT,
  gender TEXT NOT NULL DEFAULT 'unknown' CHECK (gender IN ('male','female','unknown')),
  photo_r2_key TEXT,
  custom_fields_json TEXT NOT NULL DEFAULT '{}',
  passkey_suffix TEXT,
  passkey_sequence INTEGER UNIQUE,
  passkey_verifier TEXT,
  passkey_issued_at DATETIME,
  passkey_reset_at DATETIME,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','locked','archived')),
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cgm_student_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME,
  ip_hash TEXT,
  user_agent_hash TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(student_id) REFERENCES cgm_students(id)
);

CREATE TABLE IF NOT EXISTS cgm_profile_change_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  field TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  reviewed_by_profile_id INTEGER,
  reviewer_label TEXT,
  review_reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  reviewed_at DATETIME,
  FOREIGN KEY(student_id) REFERENCES cgm_students(id)
);

CREATE TABLE IF NOT EXISTS cgm_organizer_applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  member_profile_id INTEGER,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  institution TEXT,
  motivation TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','email_verified','approved','rejected','correction','suspended','revoked')),
  verification_token_hash TEXT,
  email_verified_at DATETIME,
  reviewed_by_profile_id INTEGER,
  reviewer_label TEXT,
  review_reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS cgm_classes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  institution TEXT NOT NULL DEFAULT '',
  institution_key TEXT NOT NULL DEFAULT '',
  department TEXT,
  academic_year TEXT,
  level TEXT,
  description TEXT,
  logo_r2_key TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending','active','rejected','suspended','archived')),
  settings_json TEXT NOT NULL DEFAULT '{}',
  entry_password_verifier TEXT,
  entry_password_set_at DATETIME,
  created_by_profile_id INTEGER,
  created_by_label TEXT,
  submitted_at DATETIME,
  reviewed_by_profile_id INTEGER,
  reviewer_label TEXT,
  reviewed_at DATETIME,
  review_reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cgm_class_approvals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id INTEGER NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('submitted','approved','rejected','correction_requested','suspended','reinstated','archived','resubmitted')),
  actor_type TEXT NOT NULL DEFAULT 'phantom',
  actor_label TEXT NOT NULL DEFAULT '',
  reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(class_id) REFERENCES cgm_classes(id)
);

CREATE TABLE IF NOT EXISTS cgm_class_organizers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id INTEGER NOT NULL,
  member_profile_id INTEGER NOT NULL,
  user_id INTEGER,
  role TEXT NOT NULL CHECK (role IN ('primary','co_organizer','assistant')),
  permissions_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  granted_by_profile_id INTEGER,
  granted_by_label TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  revoked_at DATETIME,
  revoked_by_label TEXT,
  FOREIGN KEY(class_id) REFERENCES cgm_classes(id)
);

CREATE TABLE IF NOT EXISTS cgm_class_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','removed','suspended')),
  added_via TEXT NOT NULL DEFAULT 'organizer',
  added_by_label TEXT,
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  removed_at DATETIME,
  removal_reason TEXT,
  FOREIGN KEY(class_id) REFERENCES cgm_classes(id),
  FOREIGN KEY(student_id) REFERENCES cgm_students(id)
);

CREATE TABLE IF NOT EXISTS cgm_roster_imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id INTEGER NOT NULL,
  created_by_profile_id INTEGER,
  created_by_label TEXT,
  file_name TEXT,
  format TEXT NOT NULL DEFAULT 'csv' CHECK (format IN ('csv','xlsx','json','manual')),
  total_rows INTEGER NOT NULL DEFAULT 0,
  valid_rows INTEGER NOT NULL DEFAULT 0,
  invalid_rows INTEGER NOT NULL DEFAULT 0,
  duplicate_rows INTEGER NOT NULL DEFAULT 0,
  created_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  errors_json TEXT NOT NULL DEFAULT '[]',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(class_id) REFERENCES cgm_classes(id)
);

CREATE TABLE IF NOT EXISTS cgm_roster_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id INTEGER NOT NULL,
  index_number TEXT NOT NULL,
  index_number_key TEXT NOT NULL,
  full_name TEXT NOT NULL,
  university_id TEXT,
  university_id_key TEXT,
  phone TEXT,
  phone_key TEXT,
  gender TEXT NOT NULL DEFAULT 'unknown' CHECK (gender IN ('male','female','unknown')),
  email TEXT,
  custom_fields_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'unregistered' CHECK (status IN ('unregistered','registered')),
  student_id INTEGER,
  import_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(class_id) REFERENCES cgm_classes(id),
  FOREIGN KEY(student_id) REFERENCES cgm_students(id)
);

CREATE TABLE IF NOT EXISTS cgm_registration_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id INTEGER NOT NULL,
  roster_entry_id INTEGER NOT NULL,
  student_id INTEGER,
  identifier_hint TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by_profile_id INTEGER,
  reviewer_label TEXT,
  review_reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  reviewed_at DATETIME,
  FOREIGN KEY(class_id) REFERENCES cgm_classes(id),
  FOREIGN KEY(roster_entry_id) REFERENCES cgm_roster_entries(id),
  FOREIGN KEY(student_id) REFERENCES cgm_students(id)
);

CREATE TABLE IF NOT EXISTS cgm_membership_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  invitation_id INTEGER,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  reviewed_by_profile_id INTEGER,
  reviewer_label TEXT,
  review_reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  reviewed_at DATETIME,
  FOREIGN KEY(class_id) REFERENCES cgm_classes(id),
  FOREIGN KEY(student_id) REFERENCES cgm_students(id)
);

CREATE TABLE IF NOT EXISTS cgm_invitations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('general','individual')),
  code TEXT,
  token_hash TEXT NOT NULL UNIQUE,
  created_by_profile_id INTEGER,
  creator_label TEXT,
  bound_student_id INTEGER,
  bound_roster_entry_id INTEGER,
  bound_identifier_key TEXT,
  expires_at DATETIME,
  max_uses INTEGER,
  use_count INTEGER NOT NULL DEFAULT 0,
  revoked_at DATETIME,
  disabled_at DATETIME,
  last_used_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(class_id) REFERENCES cgm_classes(id),
  FOREIGN KEY(bound_student_id) REFERENCES cgm_students(id),
  FOREIGN KEY(bound_roster_entry_id) REFERENCES cgm_roster_entries(id)
);

CREATE TABLE IF NOT EXISTS cgm_activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'custom',
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','open','published','active','completed','archived','paused','cancelled')),
  config_json TEXT NOT NULL DEFAULT '{}',
  created_by_profile_id INTEGER,
  created_by_label TEXT,
  opened_at DATETIME,
  published_at DATETIME,
  completed_at DATETIME,
  archived_at DATETIME,
  cancelled_reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(class_id) REFERENCES cgm_classes(id)
);

CREATE TABLE IF NOT EXISTS cgm_activity_eligible (
  activity_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(activity_id, student_id),
  FOREIGN KEY(activity_id) REFERENCES cgm_activities(id),
  FOREIGN KEY(student_id) REFERENCES cgm_students(id)
);

CREATE TABLE IF NOT EXISTS cgm_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_id INTEGER NOT NULL,
  position INTEGER NOT NULL,
  name TEXT,
  capacity INTEGER,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(activity_id) REFERENCES cgm_activities(id)
);

CREATE TABLE IF NOT EXISTS cgm_group_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_id INTEGER NOT NULL,
  group_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','removed')),
  assigned_via TEXT NOT NULL DEFAULT 'organizer' CHECK (assigned_via IN ('automatic','self','organizer','late','waitlist')),
  assigned_by_label TEXT,
  assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  removed_at DATETIME,
  removal_reason TEXT,
  FOREIGN KEY(activity_id) REFERENCES cgm_activities(id),
  FOREIGN KEY(group_id) REFERENCES cgm_groups(id),
  FOREIGN KEY(student_id) REFERENCES cgm_students(id)
);

CREATE TABLE IF NOT EXISTS cgm_assignment_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  from_group_id INTEGER,
  to_group_id INTEGER,
  action TEXT NOT NULL CHECK (action IN ('assigned','moved','removed','restored')),
  actor_label TEXT,
  reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(activity_id) REFERENCES cgm_activities(id),
  FOREIGN KEY(student_id) REFERENCES cgm_students(id)
);

CREATE TABLE IF NOT EXISTS cgm_group_change_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  from_group_id INTEGER,
  to_group_id INTEGER NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  reviewed_by_profile_id INTEGER,
  reviewer_label TEXT,
  review_reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  reviewed_at DATETIME,
  FOREIGN KEY(activity_id) REFERENCES cgm_activities(id),
  FOREIGN KEY(student_id) REFERENCES cgm_students(id)
);

CREATE TABLE IF NOT EXISTS cgm_activity_waitlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','promoted','removed')),
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  promoted_at DATETIME,
  FOREIGN KEY(activity_id) REFERENCES cgm_activities(id),
  FOREIGN KEY(student_id) REFERENCES cgm_students(id)
);

CREATE TABLE IF NOT EXISTS cgm_leadership_appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_id INTEGER NOT NULL,
  group_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('leader','assistant')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended')),
  method TEXT NOT NULL DEFAULT 'appointment' CHECK (method IN ('automatic','election','appointment','succession','nomination')),
  permissions_json TEXT NOT NULL DEFAULT '[]',
  appointed_by_label TEXT,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ended_at DATETIME,
  end_reason TEXT,
  FOREIGN KEY(activity_id) REFERENCES cgm_activities(id),
  FOREIGN KEY(group_id) REFERENCES cgm_groups(id),
  FOREIGN KEY(student_id) REFERENCES cgm_students(id)
);

CREATE TABLE IF NOT EXISTS cgm_elections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_id INTEGER NOT NULL,
  group_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'leader' CHECK (role IN ('leader','assistant')),
  status TEXT NOT NULL DEFAULT 'nominating' CHECK (status IN ('nominating','voting','closed','cancelled')),
  anonymity TEXT NOT NULL DEFAULT 'anonymous' CHECK (anonymity IN ('anonymous','public')),
  visibility TEXT NOT NULL DEFAULT 'group' CHECK (visibility IN ('private','group','class')),
  allow_vote_change INTEGER NOT NULL DEFAULT 0,
  tie_break_method TEXT NOT NULL DEFAULT 'random' CHECK (tie_break_method IN ('runoff','appointment','random','manual')),
  nomination_open_at DATETIME,
  nomination_close_at DATETIME,
  voting_open_at DATETIME,
  voting_close_at DATETIME,
  salt TEXT NOT NULL DEFAULT '',
  results_json TEXT,
  cancelled_reason TEXT,
  decided_by_label TEXT,
  created_by_profile_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(activity_id) REFERENCES cgm_activities(id),
  FOREIGN KEY(group_id) REFERENCES cgm_groups(id)
);

CREATE TABLE IF NOT EXISTS cgm_candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  election_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  statement TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','withdrawn')),
  nominated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  withdrawn_at DATETIME,
  FOREIGN KEY(election_id) REFERENCES cgm_elections(id),
  FOREIGN KEY(student_id) REFERENCES cgm_students(id)
);

CREATE TABLE IF NOT EXISTS cgm_election_participation (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  election_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  first_vote_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_vote_at DATETIME,
  change_count INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(election_id) REFERENCES cgm_elections(id),
  FOREIGN KEY(student_id) REFERENCES cgm_students(id)
);

CREATE TABLE IF NOT EXISTS cgm_election_ballots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  election_id INTEGER NOT NULL,
  candidate_id INTEGER NOT NULL,
  voter_pseudonym TEXT,
  voter_student_id INTEGER,
  cast_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME,
  FOREIGN KEY(election_id) REFERENCES cgm_elections(id),
  FOREIGN KEY(candidate_id) REFERENCES cgm_candidates(id)
);

CREATE TABLE IF NOT EXISTS cgm_tie_breaks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  election_id INTEGER NOT NULL,
  method TEXT NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}',
  decided_by_label TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(election_id) REFERENCES cgm_elections(id)
);

CREATE TABLE IF NOT EXISTS cgm_announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id INTEGER NOT NULL,
  activity_id INTEGER,
  group_id INTEGER,
  author_type TEXT NOT NULL DEFAULT 'organizer' CHECK (author_type IN ('organizer','leader','assistant')),
  author_profile_id INTEGER,
  author_student_id INTEGER,
  author_label TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  attachment_r2_key TEXT,
  attachment_name TEXT,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published','pending','removed')),
  pinned INTEGER NOT NULL DEFAULT 0,
  review_note TEXT,
  edit_history_json TEXT NOT NULL DEFAULT '[]',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(class_id) REFERENCES cgm_classes(id)
);

CREATE TABLE IF NOT EXISTS cgm_announcement_reads (
  announcement_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(announcement_id, student_id),
  FOREIGN KEY(announcement_id) REFERENCES cgm_announcements(id),
  FOREIGN KEY(student_id) REFERENCES cgm_students(id)
);

CREATE TABLE IF NOT EXISTS cgm_announcement_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  announcement_id INTEGER NOT NULL,
  reporter_student_id INTEGER,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(announcement_id) REFERENCES cgm_announcements(id)
);

CREATE TABLE IF NOT EXISTS cgm_whatsapp_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_id INTEGER NOT NULL,
  group_id INTEGER NOT NULL,
  url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled','revoked')),
  created_by_label TEXT,
  click_count INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  replaced_at DATETIME,
  FOREIGN KEY(activity_id) REFERENCES cgm_activities(id),
  FOREIGN KEY(group_id) REFERENCES cgm_groups(id)
);

CREATE TABLE IF NOT EXISTS cgm_whatsapp_clicks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  link_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  clicked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(link_id) REFERENCES cgm_whatsapp_links(id),
  FOREIGN KEY(student_id) REFERENCES cgm_students(id)
);

CREATE TABLE IF NOT EXISTS cgm_attendance_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_id INTEGER NOT NULL,
  group_id INTEGER,
  title TEXT NOT NULL,
  session_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_by_label TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  closed_at DATETIME,
  FOREIGN KEY(activity_id) REFERENCES cgm_activities(id)
);

CREATE TABLE IF NOT EXISTS cgm_attendance_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('present','absent','late','excused')),
  note TEXT,
  original_status TEXT,
  recorded_by_label TEXT,
  recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  corrected_by_label TEXT,
  corrected_at DATETIME,
  correction_reason TEXT,
  FOREIGN KEY(session_id) REFERENCES cgm_attendance_sessions(id),
  FOREIGN KEY(student_id) REFERENCES cgm_students(id)
);

CREATE TABLE IF NOT EXISTS cgm_activity_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_id INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('publication','completion','archive','cancellation')),
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_by_label TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(activity_id) REFERENCES cgm_activities(id)
);

CREATE TABLE IF NOT EXISTS cgm_activity_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id INTEGER,
  name TEXT NOT NULL,
  config_json TEXT NOT NULL DEFAULT '{}',
  created_by_profile_id INTEGER,
  created_by_label TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cgm_student_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  link TEXT,
  read_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(student_id) REFERENCES cgm_students(id)
);

CREATE TABLE IF NOT EXISTS cgm_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_type TEXT NOT NULL DEFAULT 'system' CHECK (actor_type IN ('phantom','organizer','student','system')),
  actor_label TEXT NOT NULL DEFAULT '',
  actor_profile_id INTEGER,
  actor_student_id INTEGER,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT '',
  entity_id TEXT,
  class_id INTEGER,
  activity_id INTEGER,
  context_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;

/**
 * Index-only statements. They run inside the version-gated migration block
 * (after every table exists), and every one is IF NOT EXISTS, so a repeated
 * boot never fails.
 */
export const CGM_INDEXES = `
CREATE UNIQUE INDEX IF NOT EXISTS idx_cgm_students_identity ON cgm_students(institution_key, index_number_key);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cgm_students_sequence ON cgm_students(passkey_sequence);
CREATE INDEX IF NOT EXISTS idx_cgm_students_status ON cgm_students(status);
CREATE INDEX IF NOT EXISTS idx_cgm_sessions_student ON cgm_student_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_cgm_sessions_hash ON cgm_student_sessions(token_hash);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cgm_sessions_live_token ON cgm_student_sessions(token_hash) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cgm_class_organizers_member ON cgm_class_organizers(member_profile_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cgm_class_organizers_unique ON cgm_class_organizers(class_id, member_profile_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_cgm_class_organizers_class ON cgm_class_organizers(class_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cgm_class_members_unique ON cgm_class_members(class_id, student_id);
CREATE INDEX IF NOT EXISTS idx_cgm_class_members_student ON cgm_class_members(student_id);
CREATE INDEX IF NOT EXISTS idx_cgm_roster_class ON cgm_roster_entries(class_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cgm_roster_unique ON cgm_roster_entries(class_id, index_number_key);
CREATE INDEX IF NOT EXISTS idx_cgm_roster_student ON cgm_roster_entries(student_id);
CREATE INDEX IF NOT EXISTS idx_cgm_regreq_class ON cgm_registration_requests(class_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cgm_regreq_pending ON cgm_registration_requests(roster_entry_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_cgm_memreq_class ON cgm_membership_requests(class_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cgm_memreq_pending ON cgm_membership_requests(class_id, student_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_cgm_invitations_class ON cgm_invitations(class_id);
CREATE INDEX IF NOT EXISTS idx_cgm_activities_class ON cgm_activities(class_id);
CREATE INDEX IF NOT EXISTS idx_cgm_eligible_student ON cgm_activity_eligible(student_id);
CREATE INDEX IF NOT EXISTS idx_cgm_groups_activity ON cgm_groups(activity_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cgm_groups_position ON cgm_groups(activity_id, position);
CREATE INDEX IF NOT EXISTS idx_cgm_assignments_group ON cgm_group_assignments(group_id);
CREATE INDEX IF NOT EXISTS idx_cgm_assignments_student ON cgm_group_assignments(student_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cgm_assignments_one_active ON cgm_group_assignments(activity_id, student_id) WHERE status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS idx_cgm_leadership_one_leader ON cgm_leadership_appointments(group_id, role) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_cgm_leadership_student ON cgm_leadership_appointments(student_id);
CREATE INDEX IF NOT EXISTS idx_cgm_elections_group ON cgm_elections(group_id);
CREATE INDEX IF NOT EXISTS idx_cgm_candidates_election ON cgm_candidates(election_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cgm_participation_unique ON cgm_election_participation(election_id, student_id);
CREATE INDEX IF NOT EXISTS idx_cgm_ballots_election ON cgm_election_ballots(election_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cgm_ballots_pseudonym ON cgm_election_ballots(election_id, voter_pseudonym) WHERE voter_pseudonym IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_cgm_ballots_public ON cgm_election_ballots(election_id, voter_student_id) WHERE voter_student_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cgm_announcements_class ON cgm_announcements(class_id);
CREATE INDEX IF NOT EXISTS idx_cgm_announcements_group ON cgm_announcements(group_id);
CREATE INDEX IF NOT EXISTS idx_cgm_whatsapp_group ON cgm_whatsapp_links(group_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cgm_whatsapp_active ON cgm_whatsapp_links(group_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_cgm_attendance_sessions_activity ON cgm_attendance_sessions(activity_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cgm_attendance_record ON cgm_attendance_records(session_id, student_id);
CREATE INDEX IF NOT EXISTS idx_cgm_notifications_student ON cgm_student_notifications(student_id);
CREATE INDEX IF NOT EXISTS idx_cgm_audit_class ON cgm_audit(class_id);
CREATE INDEX IF NOT EXISTS idx_cgm_audit_action ON cgm_audit(action);
CREATE INDEX IF NOT EXISTS idx_cgm_snapshots_activity ON cgm_activity_snapshots(activity_id);
CREATE INDEX IF NOT EXISTS idx_cgm_templates_class ON cgm_activity_templates(class_id);
CREATE INDEX IF NOT EXISTS idx_cgm_change_requests_student ON cgm_profile_change_requests(student_id);
CREATE INDEX IF NOT EXISTS idx_cgm_change_requests_status ON cgm_profile_change_requests(status);
CREATE INDEX IF NOT EXISTS idx_cgm_organizer_apps_status ON cgm_organizer_applications(status);
CREATE INDEX IF NOT EXISTS idx_cgm_organizer_apps_user ON cgm_organizer_applications(user_id);
`;
