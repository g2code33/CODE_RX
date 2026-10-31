// Class & Group Management — frontend API client.
//
// Two credential namespaces, exactly like the rest of the platform:
//   - organizers and PHANTOM act as Society members through the existing
//     bearer-token client;
//   - students carry a D1-backed session in their own header, stored in
//     sessionStorage, never mixed with the member token.

import { API_BASE } from './cloudflare';

export const STUDENT_SESSION_HEADER = 'X-Code-Rx-Student-Session';
const STUDENT_SESSION_KEY = 'codeRx_cgmStudentSession';

export interface CgmStudentSession {
  token: string;
  expiresAt: string;
}

export const studentSession = {
  /** The student stays signed in across visits: the session lives in
   * localStorage (its own expiry is still honoured) and any older
   * sessionStorage copy is migrated so nobody is logged out by the upgrade. */
  read(): CgmStudentSession | null {
    const parse = (raw: string | null): CgmStudentSession | null => {
      try {
        if (!raw) return null;
        const parsed = JSON.parse(raw) as CgmStudentSession;
        if (!parsed?.token) return null;
        if (parsed.expiresAt && new Date(parsed.expiresAt.replace(' UTC', 'Z')).getTime() <= Date.now()) return null;
        return parsed;
      } catch { return null; }
    };
    try {
      const stored = parse(localStorage.getItem(STUDENT_SESSION_KEY))
        || parse(sessionStorage.getItem(STUDENT_SESSION_KEY));
      // Migrate an old sessionStorage session so a module upgrade never
      // signs the student out mid-term.
      if (stored) {
        try { localStorage.setItem(STUDENT_SESSION_KEY, JSON.stringify(stored)); } catch { /* private mode */ }
        try { sessionStorage.removeItem(STUDENT_SESSION_KEY); } catch { /* nothing to clear */ }
      }
      return stored;
    } catch { return null; }
  },
  write(session: CgmStudentSession) {
    try {
      localStorage.setItem(STUDENT_SESSION_KEY, JSON.stringify(session));
    } catch {
      /* private mode: the session still works until reload */
    }
  },
  clear() {
    try {
      localStorage.removeItem(STUDENT_SESSION_KEY);
    } catch {
      /* nothing to clear */
    }
    try {
      sessionStorage.removeItem(STUDENT_SESSION_KEY);
    } catch {
      /* nothing to clear */
    }
  },
};

export class CgmError extends Error {
  status: number;
  code: string | null;
  data: any;
  constructor(message: string, status: number, code: string | null = null, data: any = null) {
    super(message);
    this.name = 'CgmError';
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

// §38 duplicate-submission guard: while one mutating request to an endpoint is
// in flight, a second identical call is refused instead of silently firing twice.
const inFlight = new Set<string>();

// A request that never answers must never wedge the UI: every call carries
// an abort deadline so a dead socket (or a wedged browser tab) surfaces as a
// readable error and releases the duplicate guard instead of spinning.
const CGM_TIMEOUT_MS = 20_000;
const CGM_DOWNLOAD_TIMEOUT_MS = 60_000;

async function cgmFetch(url: string, init: RequestInit, timeoutMs: number = CGM_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (failure: any) {
    if (failure?.name === 'AbortError') {
      throw new CgmError('The server took too long to answer. Check your connection and try again.', 0, 'timeout');
    }
    throw failure;
  } finally {
    clearTimeout(timer);
  }
}

function guardDuplicate(method: string, endpoint: string): () => void {
  if (method === 'GET') return () => undefined;
  const key = `${method} ${endpoint}`;
  if (inFlight.has(key)) throw new CgmError('One moment — that action is already being sent.', 409, 'duplicate');
  inFlight.add(key);
  return () => inFlight.delete(key);
}

async function memberCall<T = any>(endpoint: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = options.method || 'GET';
  const release = guardDuplicate(method, endpoint);
  try {
    const { getToken } = await import('./cloudflare');
    const headers = new Headers({ Accept: 'application/json' });
    const token = getToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (options.body !== undefined) headers.set('Content-Type', 'application/json');
    let response: Response;
    try {
      response = await cgmFetch(`${API_BASE}${endpoint}`, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        credentials: 'omit',
        cache: 'no-store',
      });
    } catch (failure: any) {
      if (failure instanceof CgmError) throw failure;
      throw new CgmError('We could not reach Code Rx Society. Check your connection and try again.', 0, 'offline');
    }
    let json: any = null;
    try { json = await response.json(); } catch { /* non-JSON (CSV) */ }
    if (!response.ok) {
      throw new CgmError(json?.error || 'The request could not be completed.', response.status, json?.code || null, json?.data || null);
    }
    return (json?.data !== undefined ? json.data : json) as T;
  } finally {
    release();
  }
}

async function studentCall<T = any>(endpoint: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const release = guardDuplicate(options.method || 'GET', endpoint);
  try {
  const headers = new Headers({ Accept: 'application/json' });
  const session = studentSession.read();
  if (session?.token) headers.set(STUDENT_SESSION_HEADER, session.token);
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  let response: Response;
  try {
    response = await cgmFetch(`${API_BASE}${endpoint}`, {
      method: options.method || 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: 'omit',
      cache: 'no-store',
    });
  } catch (failure: any) {
    if (failure instanceof CgmError) throw failure;
    throw new CgmError('We could not reach Code Rx Society. Check your connection and try again.', 0, 'offline');
  }
  let json: any = null;
  try { json = await response.json(); } catch { /* ignore */ }
  if (!response.ok) {
    if (response.status === 401) studentSession.clear();
    throw new CgmError(json?.error || 'The request could not be completed.', response.status, json?.code || null, json?.data || null);
  }
  return (json?.data !== undefined ? json.data : json) as T;
  } finally {
    release();
  }
}

/** Multipart member call (attachments). */
async function memberFormCall<T = any>(endpoint: string, form: FormData): Promise<T> {
  const release = guardDuplicate('POST', endpoint);
  try {
    const { getToken } = await import('./cloudflare');
    const headers = new Headers({ Accept: 'application/json' });
    const token = getToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    let response: Response;
    try {
      response = await cgmFetch(`${API_BASE}${endpoint}`, { method: 'POST', headers, body: form, credentials: 'omit', cache: 'no-store' }, CGM_DOWNLOAD_TIMEOUT_MS);
    } catch (failure: any) {
      if (failure instanceof CgmError) throw failure;
      throw new CgmError('We could not reach Code Rx Society. Check your connection and try again.', 0, 'offline');
    }
    let json: any = null;
    try { json = await response.json(); } catch { /* non-JSON */ }
    if (!response.ok) throw new CgmError(json?.error || 'The request could not be completed.', response.status, json?.code || null, json?.data || null);
    return (json?.data !== undefined ? json.data : json) as T;
  } finally {
    release();
  }
}

/** Report download (CSV, Excel or PDF) for organizers (Bearer-authenticated). */
export async function downloadReport(classId: number, kind: string, format: 'csv' | 'xlsx' | 'pdf' = 'csv') {
  const { getToken } = await import('./cloudflare');
  const headers = new Headers({ Accept: 'text/csv' });
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await cgmFetch(`${API_BASE}/api/cgm/classes/${classId}/reports/${kind}?format=${format}`, { headers, credentials: 'omit' }, CGM_DOWNLOAD_TIMEOUT_MS)
    .catch((failure: any) => { throw failure instanceof CgmError ? failure : new CgmError('The report could not be generated.', 0); });
  if (!response.ok) throw new CgmError('The report could not be generated.', response.status);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `code-rx-${kind}-${classId}.${format}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** Roster file upload with mapping/policy (multipart). */
/** Read-only inspection of a roster file: columns, first 4 rows, suggestions. */
export async function previewRosterFile(classId: number, file: File) {
  const { getToken } = await import('./cloudflare');
  const form = new FormData();
  form.append('file', file);
  const headers = new Headers();
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await cgmFetch(`${API_BASE}/api/cgm/classes/${classId}/roster/preview`, {
    method: 'POST', headers, body: form, credentials: 'omit',
  }, CGM_DOWNLOAD_TIMEOUT_MS);
  const json = await response.json().catch(() => null);
  if (!response.ok) throw new CgmError(json?.error || 'The file could not be read.', response.status);
  return json?.data ?? json;
}

export async function importRosterFile(
  classId: number,
  file: File,
  mapping: Record<string, string>,
  policy: string,
  preview: boolean,
) {
  const { getToken } = await import('./cloudflare');
  const form = new FormData();
  form.append('file', file);
  form.append('mapping', JSON.stringify(mapping));
  form.append('policy', policy);
  const headers = new Headers();
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await cgmFetch(
    `${API_BASE}/api/cgm/classes/${classId}/roster/import${preview ? '?preview=1' : ''}`,
    { method: 'POST', headers, body: form, credentials: 'omit' },
    CGM_DOWNLOAD_TIMEOUT_MS,
  );
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    throw new CgmError(json?.error || 'The import could not be processed.', response.status, null, json?.data || null);
  }
  return json?.data ?? json;
}

// ---------------------------------------------------------------------------
// Organizer / PHANTOM surface
// ---------------------------------------------------------------------------

export const cgm = {
  // organizer applications
  applyOrganizer: (body: { institution: string; motivation?: string }) =>
    memberCall('/api/cgm/organizer/apply', { method: 'POST', body }),
  resendOrganizerVerification: () =>
    memberCall('/api/cgm/organizer/resend-verification', { method: 'POST', body: {} }),
  // Shape note: data.application plus delegatedClassIds (PHANTOM registration-
  // approval delegations that unlock the Approvals area for this member).
  organizerStatus: () =>
    memberCall('/api/cgm/organizer/status') as Promise<{ data?: { delegatedClassIds?: number[]; [key: string]: unknown } }>,

  // classes
  createClass: (body: Record<string, unknown>) => memberCall('/api/cgm/classes', { method: 'POST', body }),
  myClasses: () => memberCall('/api/cgm/organizer/classes'),
  classDetail: (classId: number) => memberCall(`/api/cgm/classes/${classId}`),
  updateClass: (classId: number, body: Record<string, unknown>) =>
    memberCall(`/api/cgm/classes/${classId}`, { method: 'PATCH', body }),
  submitClass: (classId: number) => memberCall(`/api/cgm/classes/${classId}/submit`, { method: 'POST', body: {} }),
  setPasskeyPrefix: (classId: number, prefix: string) =>
    memberCall(`/api/cgm/classes/${classId}/passkey-prefix`, { method: 'POST', body: { prefix } }),
  rotateEntryPassword: (classId: number, entryPassword: string) =>
    memberCall(`/api/cgm/classes/${classId}/entry-password`, { method: 'POST', body: { entryPassword } }),
  updateSettings: (classId: number, body: Record<string, unknown>) =>
    memberCall(`/api/cgm/classes/${classId}/settings`, { method: 'POST', body }),

  // team + ownership
  addTeamMember: (classId: number, body: Record<string, unknown>) =>
    memberCall(`/api/cgm/classes/${classId}/team`, { method: 'POST', body }),
  updateTeamMember: (classId: number, organizerId: number, body: Record<string, unknown>) =>
    memberCall(`/api/cgm/classes/${classId}/team/${organizerId}`, { method: 'PATCH', body }),
  proposeTransfer: (classId: number, toProfileId: number) =>
    memberCall(`/api/cgm/classes/${classId}/transfer`, { method: 'POST', body: { toProfileId } }),
  acceptTransfer: (classId: number) =>
    memberCall(`/api/cgm/classes/${classId}/transfer/accept`, { method: 'POST', body: {} }),

  // login format workflow
  proposeLoginFormat: (classId: number, format: Record<string, unknown>) =>
    memberCall(`/api/cgm/classes/${classId}/login-format/propose`, { method: 'POST', body: { format } }),
  activateLoginFormat: (classId: number) =>
    memberCall(`/api/cgm/classes/${classId}/login-format/activate`, { method: 'POST', body: {} }),
  cancelLoginFormat: (classId: number) =>
    memberCall(`/api/cgm/classes/${classId}/login-format/cancel`, { method: 'POST', body: {} }),

  // roster
  roster: (classId: number, search = '') =>
    memberCall(`/api/cgm/classes/${classId}/roster${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  rosterImports: (classId: number) => memberCall(`/api/cgm/classes/${classId}/roster/imports`),
  addRosterEntry: (classId: number, body: Record<string, unknown>) =>
    memberCall(`/api/cgm/classes/${classId}/roster/entries`, { method: 'POST', body }),
  updateRosterEntry: (classId: number, entryId: number, body: Record<string, unknown>) =>
    memberCall(`/api/cgm/classes/${classId}/roster/entries/${entryId}`, { method: 'PATCH', body }),
  deleteRosterEntry: (classId: number, entryId: number) =>
    memberCall(`/api/cgm/classes/${classId}/roster/entries/${entryId}`, { method: 'DELETE' }),
  bulkDeleteRosterEntries: (classId: number, ids: number[]) =>
    memberCall(`/api/cgm/classes/${classId}/roster/entries/bulk-delete`, { method: 'POST', body: { ids } }),

  // approvals
  registrations: (classId: number, status = 'pending') =>
    memberCall(`/api/cgm/classes/${classId}/registrations?status=${status}`),
  approveRegistration: (classId: number, requestId: number, reason?: string) =>
    memberCall(`/api/cgm/classes/${classId}/registrations/${requestId}/approve`, { method: 'POST', body: { reason } }),
  rejectRegistration: (classId: number, requestId: number, reason?: string) =>
    memberCall(`/api/cgm/classes/${classId}/registrations/${requestId}/reject`, { method: 'POST', body: { reason } }),
  members: (classId: number, status = 'active') =>
    memberCall(`/api/cgm/classes/${classId}/members?status=${status}`),
  addMember: (classId: number, rosterEntryId: number) =>
    memberCall(`/api/cgm/classes/${classId}/members/add`, { method: 'POST', body: { rosterEntryId } }),
  memberAction: (classId: number, memberId: number, action: 'remove' | 'suspend' | 'restore', reason?: string) =>
    memberCall(`/api/cgm/classes/${classId}/members/${memberId}/${action}`, { method: 'POST', body: { reason } }),
  bulkMemberAction: (classId: number, action: 'suspend' | 'remove', ids: number[], reason?: string) =>
    memberCall(`/api/cgm/classes/${classId}/members/bulk`, { method: 'POST', body: { action, ids, reason } }),
  membershipRequests: (classId: number) => memberCall(`/api/cgm/classes/${classId}/membership-requests`),
  reviewMembership: (classId: number, requestId: number, approve: boolean, reason?: string) =>
    memberCall(`/api/cgm/classes/${classId}/membership-requests/${requestId}/${approve ? 'approve' : 'reject'}`, { method: 'POST', body: { reason } }),
  profileChanges: (classId: number) => memberCall(`/api/cgm/classes/${classId}/profile-changes`),
  reviewProfileChange: (classId: number, requestId: number, approve: boolean, reviewReason?: string) =>
    memberCall(`/api/cgm/classes/${classId}/profile-changes/${requestId}/${approve ? 'approve' : 'reject'}`, { method: 'POST', body: { reviewReason } }),

  // invitations
  invitations: (classId: number) => memberCall(`/api/cgm/classes/${classId}/invitations`),
  createInvitation: (classId: number, body: Record<string, unknown>) =>
    memberCall(`/api/cgm/classes/${classId}/invitations`, { method: 'POST', body }),
  invitationAction: (invitationId: number, action: 'revoke' | 'disable' | 'enable' | 'regenerate') =>
    memberCall(`/api/cgm/invitations/${invitationId}/${action}`, { method: 'POST', body: {} }),

  // activities
  activities: (classId: number) => memberCall(`/api/cgm/classes/${classId}/activities`),
  createActivity: (classId: number, body: Record<string, unknown>) =>
    memberCall(`/api/cgm/classes/${classId}/activities`, { method: 'POST', body }),
  activityDetail: (activityId: number) => memberCall(`/api/cgm/activities/${activityId}`),
  updateActivity: (activityId: number, body: Record<string, unknown>) =>
    memberCall(`/api/cgm/activities/${activityId}`, { method: 'PATCH', body }),
  activityLifecycle: (activityId: number, action: string, reason?: string) =>
    memberCall(`/api/cgm/activities/${activityId}/lifecycle`, { method: 'POST', body: { action, reason } }),
  duplicateActivity: (activityId: number) =>
    memberCall(`/api/cgm/activities/${activityId}/duplicate`, { method: 'POST', body: {} }),
  saveTemplate: (activityId: number, name: string) =>
    memberCall(`/api/cgm/activities/${activityId}/save-template`, { method: 'POST', body: { name } }),
  templates: (classId: number) => memberCall(`/api/cgm/classes/${classId}/templates`),
  deleteTemplate: (templateId: number) => memberCall(`/api/cgm/templates/${templateId}`, { method: 'DELETE' }),

  // groups
  addGroups: (activityId: number, body: Record<string, unknown>) =>
    memberCall(`/api/cgm/activities/${activityId}/groups`, { method: 'POST', body }),
  generateGroups: (activityId: number, body: Record<string, unknown>) =>
    memberCall(`/api/cgm/activities/${activityId}/generate`, { method: 'POST', body }),
  assignRemaining: (activityId: number) =>
    memberCall(`/api/cgm/activities/${activityId}/assign-remaining`, { method: 'POST', body: {} }),
  assignStudent: (activityId: number, studentId: number, groupId: number) =>
    memberCall(`/api/cgm/activities/${activityId}/assign-student`, { method: 'POST', body: { studentId, groupId } }),
  swapStudents: (activityId: number, studentIdA: number, studentIdB: number) =>
    memberCall(`/api/cgm/activities/${activityId}/swap-students`, { method: 'POST', body: { studentIdA, studentIdB } }),
  removeAssignment: (assignmentId: number, reason?: string) =>
    memberCall(`/api/cgm/assignments/${assignmentId}/remove`, { method: 'POST', body: { reason } }),
  reviewChangeRequest: (activityId: number, requestId: number, decision: 'approve' | 'reject', reviewReason?: string) =>
    memberCall(`/api/cgm/activities/${activityId}/change-requests/${requestId}/${decision}`, { method: 'POST', body: { reviewReason } }),

  // leadership
  leadership: (activityId: number) => memberCall(`/api/cgm/activities/${activityId}/leadership`),
  appointLeader: (groupId: number, body: Record<string, unknown>) =>
    memberCall(`/api/cgm/groups/${groupId}/leaders`, { method: 'POST', body }),
  endLeadership: (appointmentId: number, reason?: string) =>
    memberCall(`/api/cgm/leadership/${appointmentId}/end`, { method: 'POST', body: { reason } }),
  updateLeaderPermissions: (appointmentId: number, permissions: string[]) =>
    memberCall(`/api/cgm/leadership/${appointmentId}/permissions`, { method: 'POST', body: { permissions } }),
  succession: (groupId: number) => memberCall(`/api/cgm/groups/${groupId}/succession`, { method: 'POST', body: {} }),

  // elections
  createElection: (groupId: number, body: Record<string, unknown>) =>
    memberCall(`/api/cgm/groups/${groupId}/elections`, { method: 'POST', body }),
  electionDetail: (electionId: number) => memberCall(`/api/cgm/elections/${electionId}`),
  electionAction: (electionId: number, action: 'open-voting' | 'close' | 'cancel' | 'restart', reason?: string) =>
    memberCall(`/api/cgm/elections/${electionId}/${action}`, { method: 'POST', body: { reason } }),
  resolveTie: (electionId: number, winnerCandidateId: number, reason?: string) =>
    memberCall(`/api/cgm/elections/${electionId}/tiebreak`, { method: 'POST', body: { winnerCandidateId, reason } }),
  announceWinner: (electionId: number) =>
    memberCall(`/api/cgm/elections/${electionId}/announce`, { method: 'POST', body: {} }),

  // announcements
  announcements: (classId: number) => memberCall(`/api/cgm/classes/${classId}/announcements`),
  createAnnouncement: async (classId: number, body: Record<string, unknown>, attachment?: File | null) => {
    if (!attachment) return memberCall(`/api/cgm/classes/${classId}/announcements`, { method: 'POST', body });
    const form = new FormData();
    form.append('title', String(body.title ?? ''));
    form.append('body', String(body.body ?? ''));
    if (body.pinned !== undefined) form.append('pinned', body.pinned ? 'true' : 'false');
    form.append('attachment', attachment);
    return memberFormCall(`/api/cgm/classes/${classId}/announcements`, form);
  },
  announcementReads: (announcementId: number) => memberCall(`/api/cgm/announcements/${announcementId}/reads`),
  remindActivity: (activityId: number) =>
    memberCall(`/api/cgm/activities/${activityId}/reminders`, { method: 'POST', body: {} }),
  planSuccession: (groupId: number, body: { method: 'automatic' | 'appointment' | 'election'; studentId?: number; tieBreak?: string }) =>
    memberCall(`/api/cgm/groups/${groupId}/succession`, { method: 'POST', body }),
  updateAnnouncement: (announcementId: number, body: Record<string, unknown>) =>
    memberCall(`/api/cgm/announcements/${announcementId}`, { method: 'PATCH', body }),
  pinAnnouncement: (announcementId: number) =>
    memberCall(`/api/cgm/announcements/${announcementId}/pin`, { method: 'POST', body: {} }),
  deleteAnnouncement: (announcementId: number) =>
    memberCall(`/api/cgm/announcements/${announcementId}`, { method: 'DELETE' }),
  moderateAnnouncement: (announcementId: number, decision: 'approve' | 'reject' | 'resolve-report', note?: string) =>
    memberCall(`/api/cgm/announcements/${announcementId}/moderate`, { method: 'POST', body: { decision, note } }),

  // whatsapp
  setWhatsApp: (groupId: number, url: string) =>
    memberCall(`/api/cgm/groups/${groupId}/whatsapp`, { method: 'POST', body: { url } }),
  groupDetail: (groupId: number) =>
    memberCall(`/api/cgm/groups/${groupId}`),
  updateGroup: (groupId: number, body: Record<string, unknown>) =>
    memberCall(`/api/cgm/groups/${groupId}`, { method: 'PATCH', body }),
  notifyGroup: (groupId: number, body: Record<string, unknown>) =>
    memberCall(`/api/cgm/groups/${groupId}/notify`, { method: 'POST', body }),
  whatsappAction: (groupId: number, action: 'disable' | 'enable' | 'revoke') =>
    memberCall(`/api/cgm/groups/${groupId}/whatsapp/${action}`, { method: 'POST', body: {} }),

  // attendance
  createAttendanceSession: (activityId: number, body: Record<string, unknown>) =>
    memberCall(`/api/cgm/activities/${activityId}/attendance-sessions`, { method: 'POST', body }),
  attendanceSession: (sessionId: number) => memberCall(`/api/cgm/attendance-sessions/${sessionId}`),
  saveAttendance: (sessionId: number, records: Array<{ studentId: number; status: string; note?: string }>) =>
    memberCall(`/api/cgm/attendance-sessions/${sessionId}/records`, { method: 'POST', body: { records } }),
  closeAttendanceSession: (sessionId: number) =>
    memberCall(`/api/cgm/attendance-sessions/${sessionId}/close`, { method: 'POST', body: {} }),
  correctAttendance: (recordId: number, status: string, reason: string) =>
    memberCall(`/api/cgm/attendance/records/${recordId}/correct`, { method: 'POST', body: { status, reason } }),
  attendanceSummary: (activityId: number) => memberCall(`/api/cgm/activities/${activityId}/attendance-summary`),

  // archives
  archives: (classId: number) => memberCall(`/api/cgm/classes/${classId}/archives`),

  // PHANTOM
  phantomOverview: () => memberCall('/api/cgm/phantom/overview'),
  phantomOrganizerApplications: (status = '') =>
    memberCall(`/api/cgm/phantom/organizer-applications${status ? `?status=${status}` : ''}`),
  phantomOrganizerAction: (id: number, action: 'approve' | 'reject' | 'correction' | 'suspend' | 'reinstate' | 'revoke', reason?: string) =>
    memberCall(`/api/cgm/phantom/organizer-applications/${id}/${action}`, { method: 'POST', body: { reason } }),
  phantomClasses: (status = '') => memberCall(`/api/cgm/phantom/classes${status ? `?status=${status}` : ''}`),
  phantomClassDetail: (classId: number) => memberCall(`/api/cgm/phantom/classes/${classId}`),
  phantomClassAction: (classId: number, action: 'approve' | 'reject' | 'correction' | 'suspend' | 'reinstate' | 'archive', reason?: string) =>
    memberCall(`/api/cgm/phantom/classes/${classId}/${action}`, { method: 'POST', body: { reason } }),
  phantomAudit: (classId?: number, action?: string) => {
    const params = new URLSearchParams();
    if (classId) params.set('classId', String(classId));
    if (action) params.set('action', action);
    const query = params.toString();
    return memberCall(`/api/cgm/phantom/audit${query ? `?${query}` : ''}`);
  },
  phantomPolicies: () => memberCall('/api/cgm/phantom/policies'),
  phantomSavePolicies: (policies: Array<{ key: string; value: string }>) =>
    memberCall('/api/cgm/phantom/policies', { method: 'PUT', body: { policies } }),
  phantomModule: (enabled: boolean) => memberCall('/api/cgm/phantom/module', { method: 'POST', body: { enabled } }),
  phantomTransfer: (classId: number, toProfileId: number) =>
    memberCall(`/api/cgm/phantom/classes/${classId}/transfer`, { method: 'POST', body: { toProfileId } }),
  phantomSensitiveChanges: (status = 'pending') =>
    memberCall(`/api/cgm/phantom/sensitive-changes${status ? `?status=${status}` : ''}`),
  phantomDecideSensitiveChange: (id: number, decision: 'approve' | 'reject', reason?: string) =>
    memberCall(`/api/cgm/phantom/sensitive-changes/${id}/${decision}`, { method: 'POST', body: { reason } }),
  phantomDelegations: () => memberCall('/api/cgm/phantom/delegations'),
  phantomGrantDelegation: (body: { memberId: number; classId: number; maxBatch?: number }) =>
    memberCall('/api/cgm/phantom/delegations', { method: 'POST', body }),
  phantomRevokeDelegation: (id: number) =>
    memberCall(`/api/cgm/phantom/delegations/${id}/revoke`, { method: 'POST', body: {} }),
  phantomOrganizerActivity: () => memberCall('/api/cgm/phantom/organizer-activity'),
  phantomDisputes: () => memberCall('/api/cgm/phantom/disputes'),
  phantomResolveDispute: (id: number, action: 'dismiss' | 'remove', reason?: string) =>
    memberCall(`/api/cgm/phantom/disputes/${id}/resolve`, { method: 'POST', body: { action, reason } }),
};

// ---------------------------------------------------------------------------
// Student surface
// ---------------------------------------------------------------------------

export const cgmStudent = {
  register: async (body: { classCode: string; indexNumber: string; entryPassword: string }) => {
    const data = await studentCall<{ session?: CgmStudentSession }>('/api/cgm/student/register', { method: 'POST', body });
    // Automatic approval returns a live session — persist it exactly like the
    // login session so the dashboard and page reloads stay authenticated.
    if (data?.session) studentSession.write(data.session);
    return data;
  },
  login: async (body: { identifierType: string; identifier: string; passkey: string }) => {
    const data = await studentCall<{ session: CgmStudentSession; student: any }>('/api/cgm/student/login', { method: 'POST', body });
    studentSession.write(data.session);
    return data;
  },
  logout: async () => {
    try { await studentCall('/api/cgm/student/logout', { method: 'POST', body: {} }); } finally { studentSession.clear(); }
  },
  me: () => studentCall('/api/cgm/student/me'),
  myClasses: () => studentCall('/api/cgm/student/classes'),
  classDashboard: (classId: number) => studentCall(`/api/cgm/student/classes/${classId}`),
  activity: (activityId: number) => studentCall(`/api/cgm/student/activities/${activityId}`),
  selfAssign: (activityId: number, groupId?: number) =>
    studentCall(`/api/cgm/student/activities/${activityId}/assign`, { method: 'POST', body: groupId ? { groupId } : {} }),
  randomDraw: (activityId: number) =>
    studentCall(`/api/cgm/student/activities/${activityId}/random-draw`, { method: 'POST', body: {} }),
  contest: (activityId: number, statement?: string) =>
    studentCall(`/api/cgm/student/activities/${activityId}/contest`, { method: 'POST', body: { statement } }),
  withdrawCandidate: (candidateId: number) =>
    studentCall(`/api/cgm/student/candidates/${candidateId}/withdraw`, { method: 'POST', body: {} }),
  setGender: (gender: string) =>
    studentCall('/api/cgm/student/profile/gender', { method: 'POST', body: { gender } }),
  electionsList: () => studentCall('/api/cgm/student/elections'),
  election: (electionId: number) => studentCall(`/api/cgm/student/elections/${electionId}`),
  vote: (electionId: number, candidateId: number) =>
    studentCall(`/api/cgm/student/elections/${electionId}/vote`, { method: 'POST', body: { candidateId } }),
  requestMove: (groupId: number, toGroupId: number, reason?: string) =>
    studentCall(`/api/cgm/student/groups/${groupId}/request-move`, { method: 'POST', body: { toGroupId, reason } }),
  attendance: () => studentCall('/api/cgm/student/attendance'),
  calendar: () => studentCall('/api/cgm/student/calendar'),
  notifications: () => studentCall('/api/cgm/student/notifications'),
  markRead: (body: { ids?: number[]; all?: boolean }) =>
    studentCall('/api/cgm/student/notifications/read', { method: 'POST', body }),
  requestProfileChange: (body: { field: string; newValue: string; reason?: string }) =>
    studentCall('/api/cgm/student/profile/change', { method: 'POST', body }),
  changePasskey: (currentPasskey: string, newPasskey: string) =>
    studentCall('/api/cgm/student/passkey/change', { method: 'POST', body: { currentPasskey, newPasskey } }),
  invitationInfo: (code: string) => studentCall(`/api/cgm/invitations/${encodeURIComponent(code)}`),
  joinClass: (code: string) => studentCall('/api/cgm/student/join', { method: 'POST', body: { code } }),
  claimInvitation: (code: string) => studentCall(`/api/cgm/student/invitations/${encodeURIComponent(code)}/claim`, { method: 'POST', body: {} }),
  whatsappClick: (linkId: number) =>
    studentCall(`/api/cgm/whatsapp/${linkId}/click`, { method: 'POST', body: {} }),
  // §31 — per-category notification preferences (security categories pinned server-side)
  notificationPrefs: () => studentCall('/api/cgm/student/notification-prefs'),
  saveNotificationPrefs: (prefs: Array<{ category: string; muted: boolean }>) =>
    studentCall('/api/cgm/student/notification-prefs', { method: 'PUT', body: { prefs } }),
};

/** §16 — a student downloads their own attendance, group and leadership records (CSV). */
export async function downloadMyRecords() {
  const headers = new Headers({ Accept: 'text/csv' });
  const session = studentSession.read();
  if (session?.token) headers.set(STUDENT_SESSION_HEADER, session.token);
  const response = await cgmFetch(`${API_BASE}/api/cgm/student/records/export`, { headers, credentials: 'omit' }, CGM_DOWNLOAD_TIMEOUT_MS);
  if (!response.ok) throw new CgmError('Your records could not be exported.', response.status);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'code-rx-my-records.csv';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** §7 — organizer downloads a sample roster template (csv / xlsx / json). */
export async function downloadRosterTemplate(format: 'csv' | 'xlsx' | 'json' = 'csv') {
  const { getToken } = await import('./cloudflare');
  const headers = new Headers({ Accept: '*/*' });
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await cgmFetch(`${API_BASE}/api/cgm/roster/template?format=${format}`, { headers, credentials: 'omit' }, CGM_DOWNLOAD_TIMEOUT_MS);
  if (!response.ok) throw new CgmError('The sample template could not be generated.', response.status);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `code-rx-roster-template.${format}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
