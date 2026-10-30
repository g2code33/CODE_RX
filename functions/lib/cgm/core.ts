/**
 * CODE Rx SOCIETY — Class & Group Management (CGM) core helpers.
 *
 * This module owns the pure, testable rules of the class & group system:
 * the permanent student passkey sequence, the human class codes, the
 * permission catalogues, and the normalizers every route trusts. Nothing in
 * here touches the network: the routes in `functions/class-group-routes.ts`
 * compose these helpers with the existing CODE Rx authorization layers.
 */

// ---------------------------------------------------------------------------
// The permanent student passkey sequence
// ---------------------------------------------------------------------------
//
// Every approved student receives exactly one permanent passkey from one
// platform-wide sequence:
//
//   rx30a, rx30b, … rx30z, rx30aa, rx30ab, … rx30az, rx30ba, …
//
// The suffix is the standard bijective base-26 spelling (spreadsheet-column
// order): 1→a, 26→z, 27→aa, 52→az, 53→ba, 702→zz, 703→aaa. The sequence only
// ever moves forward, so a retired or revoked passkey is never handed out a
// second time.

export const STUDENT_PASSKEY_PREFIX = 'rx30';
export const STUDENT_PASSKEY_SEQUENCE_ID = 'student_passkey';

/** The passkey suffix for a 1-based sequence position (bijective base-26). */
export const passkeySuffixForSequence = (sequence: number): string => {
  let remaining = Math.floor(Number(sequence));
  if (!Number.isFinite(remaining) || remaining < 1) return 'a';
  let suffix = '';
  while (remaining > 0) {
    const remainder = (remaining - 1) % 26;
    suffix = String.fromCharCode(97 + remainder) + suffix;
    remaining = Math.floor((remaining - 1) / 26);
  }
  return suffix;
};

/** The full passkey (for example `rx30aa`) for a 1-based sequence position. */
export const passkeyForSequence = (sequence: number): string =>
  `${STUDENT_PASSKEY_PREFIX}${passkeySuffixForSequence(sequence)}`;

/** Parses a presented passkey back to its sequence position, or null. */
export const sequenceForPasskey = (passkey: string): number | null => {
  const normalized = String(passkey || '').trim().toLowerCase();
  if (!normalized.startsWith(STUDENT_PASSKEY_PREFIX)) return null;
  const suffix = normalized.slice(STUDENT_PASSKEY_PREFIX.length);
  if (!/^[a-z]+$/.test(suffix)) return null;
  let sequence = 0;
  for (const character of suffix) sequence = sequence * 26 + (character.charCodeAt(0) - 96);
  return sequence > 0 ? sequence : null;
};

/** A display form that leaks only a hint: `rx30a…` never the whole key. */
export const passkeyMasked = (passkey: string): string => {
  const normalized = String(passkey || '').trim();
  return normalized ? `${normalized.slice(0, 4)}…` : '';
};

const asRows = async <T>(statement: D1PreparedStatement): Promise<T[]> => {
  const result = await statement.all<T>();
  return result.results || [];
};

/**
 * Reserves the next sequence position atomically.
 *
 * D1 executes `UPDATE … RETURNING` as one atomic statement, exactly like the
 * platform's existing member-code allocator, so two simultaneous approvals can
 * never observe the same position. The `cgm_students.passkey_sequence` UNIQUE
 * constraint is the second guard: even a degraded emulator that fell back to
 * the read-then-write path cannot persist a duplicate.
 */
export const nextPasskeySequence = async (db: D1Database): Promise<number> => {
  await db.prepare(
    `INSERT OR IGNORE INTO cgm_sequences (id, next_value) VALUES ('${STUDENT_PASSKEY_SEQUENCE_ID}', 1)`
  ).run();
  try {
    const rows = await asRows<{ sequence: number }>(db.prepare(
      `UPDATE cgm_sequences SET next_value = next_value + 1
       WHERE id = '${STUDENT_PASSKEY_SEQUENCE_ID}' RETURNING next_value - 1 AS sequence`
    ));
    const sequence = Number(rows[0]?.sequence);
    if (Number.isInteger(sequence) && sequence > 0) return sequence;
  } catch (error) {
    console.warn('[code-rx] student passkey sequence RETURNING fallback:', error);
  }
  // Dev-only fallback for emulators without RETURNING. The student-table
  // UNIQUE constraint still makes a duplicate allocation fail loudly.
  const rows = await asRows<{ next_value: number }>(db.prepare(
    `SELECT next_value FROM cgm_sequences WHERE id = '${STUDENT_PASSKEY_SEQUENCE_ID}'`
  ));
  const sequence = Math.max(1, Number(rows[0]?.next_value || 1));
  await db.prepare(
    `UPDATE cgm_sequences SET next_value = ? WHERE id = '${STUDENT_PASSKEY_SEQUENCE_ID}'`
  ).bind(sequence + 1).run();
  return sequence;
};

export const allocateStudentPasskey = async (
  db: D1Database,
): Promise<{ passkey: string; sequence: number; suffix: string }> => {
  const sequence = await nextPasskeySequence(db);
  return { passkey: passkeyForSequence(sequence), sequence, suffix: passkeySuffixForSequence(sequence) };
};

// ---------------------------------------------------------------------------
// Human class codes
// ---------------------------------------------------------------------------

const CLASS_CODE_SEQUENCE_ID = 'class_code';

const classCodeFor = (sequence: number) => `CRX-CLS-${String(sequence).padStart(4, '0')}`;

/** Reserves the next permanent, human-readable class code atomically. */
export const allocateClassCode = async (db: D1Database): Promise<string> => {
  await db.prepare(
    `INSERT OR IGNORE INTO cgm_sequences (id, next_value) VALUES ('${CLASS_CODE_SEQUENCE_ID}', 1)`
  ).run();
  try {
    const rows = await asRows<{ sequence: number }>(db.prepare(
      `UPDATE cgm_sequences SET next_value = next_value + 1
       WHERE id = '${CLASS_CODE_SEQUENCE_ID}' RETURNING next_value - 1 AS sequence`
    ));
    const sequence = Number(rows[0]?.sequence);
    if (Number.isInteger(sequence) && sequence > 0) return classCodeFor(sequence);
  } catch (error) {
    console.warn('[code-rx] class code sequence RETURNING fallback:', error);
  }
  const rows = await asRows<{ next_value: number }>(db.prepare(
    `SELECT next_value FROM cgm_sequences WHERE id = '${CLASS_CODE_SEQUENCE_ID}'`
  ));
  const sequence = Math.max(1, Number(rows[0]?.next_value || 1));
  await db.prepare(
    `UPDATE cgm_sequences SET next_value = ? WHERE id = '${CLASS_CODE_SEQUENCE_ID}'`
  ).bind(sequence + 1).run();
  return classCodeFor(sequence);
};

// ---------------------------------------------------------------------------
// Normalization and small shared helpers
// ---------------------------------------------------------------------------

/** Lowercase lookup key: trims, collapses spaces, lowercases. */
export const lookupKey = (value: unknown): string =>
  String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

/** Phone lookup key: digits only, Ghana local/00 forms raised to 233. */
export const phoneKey = (value: unknown): string | null => {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (/^0\d{9}$/.test(digits)) digits = `233${digits.slice(1)}`;
  return digits.length >= 7 && digits.length <= 15 ? digits : null;
};

/** Human display form of a phone number as typed (trimmed). */
export const phoneDisplay = (value: unknown): string | null => {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed.slice(0, 32) : null;
};

/** The module default timezone (the Society's home), with class overrides. */
export const CGM_DEFAULT_TIMEZONE = 'Africa/Accra';

// ---------------------------------------------------------------------------
// Permission catalogues
// ---------------------------------------------------------------------------

/** Organizer-side class permissions. PHANTOM powers override all of these. */
export const CLASS_PERMISSIONS = [
  'view_roster',
  'import_roster',
  'edit_roster',
  'approve_registrations',
  'approve_memberships',
  'review_profile_changes',
  'manage_activities',
  'generate_groups',
  'move_students',
  'remove_students',
  'manage_elections',
  'appoint_leaders',
  'manage_announcements',
  'manage_attendance',
  'manage_whatsapp',
  'generate_reports',
  'archive_activities',
  'manage_invitations',
  'view_sensitive_profiles',
  'manage_class_settings',
] as const;

export type ClassPermission = (typeof CLASS_PERMISSIONS)[number];

/** The permissions a primary organizer always holds inside their class. */
export const PRIMARY_ORGANIZER_PERMISSIONS: ClassPermission[] = [...CLASS_PERMISSIONS];

/** Sensible co-organizer defaults: everything but identity-sensitive and
 * ownership-level powers, which only PHANTOM-style trust should hand out. */
export const CO_ORGANIZER_DEFAULT_PERMISSIONS: ClassPermission[] = CLASS_PERMISSIONS.filter(
  (permission) => permission !== 'manage_class_settings',
);

/** Assistant leaders are task-scoped; this is the full catalogue they may be granted. */
export const ASSISTANT_ORGANIZER_PERMISSIONS: ClassPermission[] = [
  'view_roster',
  'approve_memberships',
  'review_profile_changes',
  'manage_activities',
  'generate_groups',
  'move_students',
  'manage_attendance',
  'manage_announcements',
  'manage_whatsapp',
  'generate_reports',
];

export const CLASS_PERMISSION_LABELS: Record<ClassPermission, string> = {
  view_roster: 'View roster',
  import_roster: 'Import roster',
  edit_roster: 'Edit roster',
  approve_registrations: 'Approve student registrations',
  approve_memberships: 'Approve membership requests',
  review_profile_changes: 'Review profile changes',
  manage_activities: 'Create grouping activities',
  generate_groups: 'Generate groups',
  move_students: 'Move students',
  remove_students: 'Remove students',
  manage_elections: 'Manage elections',
  appoint_leaders: 'Appoint leaders',
  manage_announcements: 'Manage announcements',
  manage_attendance: 'Manage attendance',
  manage_whatsapp: 'Manage WhatsApp links',
  generate_reports: 'Generate reports',
  archive_activities: 'Archive activities',
  manage_invitations: 'Manage invitations',
  view_sensitive_profiles: 'View sensitive student data',
  manage_class_settings: 'Manage class settings',
};

/** Group-leader permissions, independently configurable per activity. */
export const LEADER_PERMISSIONS = [
  'view_members',
  'send_announcements',
  'assist_attendance',
  'request_member_additions',
  'add_members',
  'request_member_removals',
  'remove_members',
  'coordinate',
  'report_issues',
  'manage_whatsapp',
] as const;

export type LeaderPermission = (typeof LEADER_PERMISSIONS)[number];

export const LEADER_PERMISSION_LABELS: Record<LeaderPermission, string> = {
  view_members: 'View group members',
  send_announcements: 'Send announcements',
  assist_attendance: 'Assist with attendance',
  request_member_additions: 'Request member additions',
  add_members: 'Add members directly',
  request_member_removals: 'Request member removal',
  remove_members: 'Remove members directly',
  coordinate: 'Coordinate group activities',
  report_issues: 'Report issues',
  manage_whatsapp: 'Manage the group WhatsApp link',
};

/** The leader permissions assistants may receive — never a copy by default. */
export const ASSISTANT_LEADER_PERMISSIONS: LeaderPermission[] = [
  'view_members',
  'assist_attendance',
  'coordinate',
  'report_issues',
];

export const sanitizeClassPermissions = (value: unknown): ClassPermission[] => {
  const allowed = new Set<string>(CLASS_PERMISSIONS);
  const list = Array.isArray(value) ? value : [];
  return [...new Set(list.map((entry) => String(entry)))].filter((entry) => allowed.has(entry)) as ClassPermission[];
};

export const sanitizeLeaderPermissions = (value: unknown): LeaderPermission[] => {
  const allowed = new Set<string>(LEADER_PERMISSIONS);
  const list = Array.isArray(value) ? value : [];
  return [...new Set(list.map((entry) => String(entry)))].filter((entry) => allowed.has(entry)) as LeaderPermission[];
};

// ---------------------------------------------------------------------------
// Student login formats
// ---------------------------------------------------------------------------

/** The identifiers that may accompany the passkey at login. The passkey is
 * always required; these only choose the second half of the credential. */
export const LOGIN_IDENTIFIER_KEYS = ['index_number', 'university_id', 'phone'] as const;
export type LoginIdentifierKey = (typeof LOGIN_IDENTIFIER_KEYS)[number];

export const LOGIN_IDENTIFIER_LABELS: Record<LoginIdentifierKey, string> = {
  index_number: 'Index number',
  university_id: 'University student ID',
  phone: 'Telephone number',
};

export interface LoginFormat {
  /** Accepted second identifiers, most commonly exactly one. */
  identifiers: LoginIdentifierKey[];
  /** Students may change their own passkey. Default off. */
  allowStudentPasskeyChange: boolean;
}

export const DEFAULT_LOGIN_FORMAT: LoginFormat = {
  identifiers: ['index_number'],
  allowStudentPasskeyChange: false,
};

export const sanitizeLoginFormat = (value: unknown): LoginFormat => {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const identifiers = (Array.isArray(raw.identifiers) ? raw.identifiers : DEFAULT_LOGIN_FORMAT.identifiers)
    .map((entry) => String(entry))
    .filter((entry): entry is LoginIdentifierKey => (LOGIN_IDENTIFIER_KEYS as readonly string[]).includes(entry));
  return {
    identifiers: identifiers.length ? [...new Set(identifiers)] : [...DEFAULT_LOGIN_FORMAT.identifiers],
    allowStudentPasskeyChange: raw.allowStudentPasskeyChange === true,
  };
};

// ---------------------------------------------------------------------------
// Class settings (privacy-first defaults)
// ---------------------------------------------------------------------------

export interface ClassSettings {
  /** Which profile fields other students may see, per class. */
  studentVisibleFields: string[];
  /** Sensitive fields only organizers with view_sensitive_profiles see. */
  sensitiveFields: string[];
  /** Whether joining through an invitation needs organizer approval. */
  membershipApprovalRequired: boolean;
  /** Registration approval delegation: who approves new student identities. */
  registrationApprovals: 'organizers' | 'phantom';
  /** Currently active login format for the class. */
  loginFormat: LoginFormat;
  /** A proposed, not-yet-activated login format (three-step change flow). */
  pendingLoginFormat: (LoginFormat & { proposedByLabel: string; proposedAt: string }) | null;
  /** Optional extra profile fields configured by the organizer. */
  customFields: Array<{ key: string; label: string }>;
}

export const STUDENT_PROFILE_FIELDS = [
  'full_name',
  'index_number',
  'university_id',
  'phone',
  'gender',
  'email',
] as const;

export type StudentProfileField = (typeof STUDENT_PROFILE_FIELDS)[number];

export const STUDENT_PROFILE_FIELD_LABELS: Record<StudentProfileField, string> = {
  full_name: 'Full name',
  index_number: 'Index number',
  university_id: 'University student ID',
  phone: 'Telephone number',
  gender: 'Gender',
  email: 'Email address',
};

/** Privacy-first default: classmates see names only. Everything else needs a
 * deliberate organizer decision (or a sensitive-data permission). */
export const defaultClassSettings = (): ClassSettings => ({
  studentVisibleFields: ['full_name'],
  sensitiveFields: ['index_number', 'university_id', 'phone', 'email'],
  membershipApprovalRequired: true,
  registrationApprovals: 'organizers',
  loginFormat: { ...DEFAULT_LOGIN_FORMAT },
  pendingLoginFormat: null,
  customFields: [],
});

export const sanitizeClassSettings = (value: unknown): ClassSettings => {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const fields = new Set<string>(STUDENT_PROFILE_FIELDS);
  const visible = (Array.isArray(raw.studentVisibleFields) ? raw.studentVisibleFields : [])
    .map((entry) => String(entry)).filter((entry) => fields.has(entry));
  const defaults = defaultClassSettings();
  return {
    studentVisibleFields: visible.length ? [...new Set(visible)] : defaults.studentVisibleFields,
    sensitiveFields: defaults.sensitiveFields,
    membershipApprovalRequired: raw.membershipApprovalRequired !== false,
    registrationApprovals: raw.registrationApprovals === 'phantom' ? 'phantom' : 'organizers',
    loginFormat: sanitizeLoginFormat(raw.loginFormat),
    pendingLoginFormat: raw.pendingLoginFormat && typeof raw.pendingLoginFormat === 'object'
      ? (() => {
          const pending = raw.pendingLoginFormat as Record<string, unknown>;
          return {
            ...sanitizeLoginFormat(pending),
            proposedByLabel: String(pending.proposedByLabel || ''),
            proposedAt: String(pending.proposedAt || ''),
          };
        })()
      : null,
    customFields: (Array.isArray(raw.customFields) ? raw.customFields : []).slice(0, 12).map((entry: any) => ({
      key: lookupKey(entry?.key || entry?.label).replace(/[^a-z0-9_]+/g, '_').slice(0, 40),
      label: String(entry?.label || '').slice(0, 60),
    })).filter((entry) => entry.key && entry.label),
  };
};

// ---------------------------------------------------------------------------
// Grouping activity configuration
// ---------------------------------------------------------------------------

export const ACTIVITY_TYPES = [
  'tutorial', 'practical', 'presentation', 'research', 'seminar', 'project', 'custom',
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const ACTIVITY_STATUSES = [
  'draft', 'open', 'published', 'active', 'completed', 'archived', 'paused', 'cancelled',
] as const;

export const ASSIGNMENT_METHODS = ['automatic', 'self', 'hybrid'] as const;
export type AssignmentMethod = (typeof ASSIGNMENT_METHODS)[number];

export const GENDER_RULES = ['balanced', 'separate', 'none'] as const;
export type GenderRule = (typeof GENDER_RULES)[number];

export const REPEAT_RULES = ['avoid', 'random'] as const;
export type RepeatRule = (typeof REPEAT_RULES)[number];

export const LEADER_METHODS = ['automatic', 'election', 'appointment'] as const;
export type LeaderMethod = (typeof LEADER_METHODS)[number];

export const OVERFLOW_RULES = ['waitlist', 'block', 'overflow_group', 'organizer'] as const;
export type OverflowRule = (typeof OVERFLOW_RULES)[number];

export const TIE_BREAK_METHODS = ['runoff', 'appointment', 'random', 'manual'] as const;
export type TieBreakMethod = (typeof TIE_BREAK_METHODS)[number];

export const ANNOUNCEMENT_MODES = ['direct', 'approval', 'organizers_only'] as const;
export type AnnouncementMode = (typeof ANNOUNCEMENT_MODES)[number];

export interface ActivityConfig {
  method: AssignmentMethod;
  groupCount: number | null;
  targetGroupSize: number | null;
  capacity: number | null;
  genderRule: GenderRule;
  repeatRule: RepeatRule;
  leaderMethod: LeaderMethod;
  leaderPermissions: LeaderPermission[];
  assistantsAllowed: boolean;
  maxAssistants: number;
  assistantMethod: 'leader_nomination' | 'appointment' | 'election';
  assistantPermissions: LeaderPermission[];
  overflow: OverflowRule;
  selfDeadline: string | null;
  announcementMode: AnnouncementMode;
  whatsappEnabled: boolean;
  attendanceEnabled: boolean;
  contactVisibility: 'none' | 'group' | 'class';
  timezone: string;
  opensAt: string | null;
  closesAt: string | null;
  assignmentDeadline: string | null;
  resultsPublic: boolean;
  electionAnonymity: 'anonymous' | 'public';
  electionVisibility: 'private' | 'group' | 'class';
  allowVoteChange: boolean;
  tieBreak: TieBreakMethod;
  eligibility: 'all' | 'selected';
}

export const defaultActivityConfig = (): ActivityConfig => ({
  method: 'automatic',
  groupCount: null,
  targetGroupSize: null,
  capacity: null,
  genderRule: 'none',
  repeatRule: 'random',
  leaderMethod: 'appointment',
  leaderPermissions: ['view_members', 'send_announcements', 'coordinate', 'report_issues'],
  assistantsAllowed: true,
  maxAssistants: 2,
  assistantMethod: 'appointment',
  assistantPermissions: [...ASSISTANT_LEADER_PERMISSIONS],
  overflow: 'block',
  selfDeadline: null,
  announcementMode: 'direct',
  whatsappEnabled: true,
  attendanceEnabled: true,
  contactVisibility: 'group',
  timezone: CGM_DEFAULT_TIMEZONE,
  opensAt: null,
  closesAt: null,
  assignmentDeadline: null,
  resultsPublic: true,
  electionAnonymity: 'anonymous',
  electionVisibility: 'group',
  allowVoteChange: false,
  tieBreak: 'random',
  eligibility: 'all',
});

const dateOrNull = (value: unknown): string | null => {
  const text = String(value ?? '').trim();
  if (!text) return null;
  return Number.isNaN(new Date(text).getTime()) ? null : text;
};

const countIn = (value: unknown, min: number, max: number): number | null => {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
};

export const sanitizeActivityConfig = (value: unknown): ActivityConfig => {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const defaults = defaultActivityConfig();
  const pick = <T extends string>(candidate: unknown, allowed: readonly T[], fallback: T): T =>
    allowed.includes(candidate as T) ? (candidate as T) : fallback;
  return {
    method: pick(raw.method, ASSIGNMENT_METHODS, defaults.method),
    groupCount: countIn(raw.groupCount, 2, 99),
    targetGroupSize: countIn(raw.targetGroupSize, 2, 200),
    capacity: countIn(raw.capacity, 1, 200),
    genderRule: pick(raw.genderRule, GENDER_RULES, defaults.genderRule),
    repeatRule: pick(raw.repeatRule, REPEAT_RULES, defaults.repeatRule),
    leaderMethod: pick(raw.leaderMethod, LEADER_METHODS, defaults.leaderMethod),
    leaderPermissions: sanitizeLeaderPermissions(raw.leaderPermissions),
    assistantsAllowed: raw.assistantsAllowed !== false,
    maxAssistants: countIn(raw.maxAssistants, 1, 10) ?? defaults.maxAssistants,
    assistantMethod: pick(raw.assistantMethod, ['leader_nomination', 'appointment', 'election'] as const, defaults.assistantMethod),
    assistantPermissions: sanitizeLeaderPermissions(raw.assistantPermissions),
    overflow: pick(raw.overflow, OVERFLOW_RULES, defaults.overflow),
    selfDeadline: dateOrNull(raw.selfDeadline),
    announcementMode: pick(raw.announcementMode, ANNOUNCEMENT_MODES, defaults.announcementMode),
    whatsappEnabled: raw.whatsappEnabled !== false,
    attendanceEnabled: raw.attendanceEnabled !== false,
    contactVisibility: pick(raw.contactVisibility, ['none', 'group', 'class'] as const, defaults.contactVisibility),
    timezone: typeof raw.timezone === 'string' && raw.timezone.trim() ? raw.timezone.trim().slice(0, 60) : CGM_DEFAULT_TIMEZONE,
    opensAt: dateOrNull(raw.opensAt),
    closesAt: dateOrNull(raw.closesAt),
    assignmentDeadline: dateOrNull(raw.assignmentDeadline),
    resultsPublic: raw.resultsPublic !== false,
    electionAnonymity: pick(raw.electionAnonymity, ['anonymous', 'public'] as const, defaults.electionAnonymity),
    electionVisibility: pick(raw.electionVisibility, ['private', 'group', 'class'] as const, defaults.electionVisibility),
    allowVoteChange: raw.allowVoteChange === true,
    tieBreak: pick(raw.tieBreak, TIE_BREAK_METHODS, defaults.tieBreak),
    eligibility: pick(raw.eligibility, ['all', 'selected'] as const, defaults.eligibility),
  };
};

// ---------------------------------------------------------------------------
// Attendance and other small vocabularies
// ---------------------------------------------------------------------------

export const ATTENDANCE_STATUSES = ['present', 'absent', 'late', 'excused'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const ACTIVITY_LIFECYCLE_LABELS: Record<string, string> = {
  draft: 'Draft',
  open: 'Registration open',
  published: 'Published',
  active: 'Active',
  completed: 'Completed',
  archived: 'Archived',
  paused: 'Paused',
  cancelled: 'Cancelled',
};
