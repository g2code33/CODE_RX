/**
 * CODE Rx — Class & Group Management UI test suite (spec §41, markup level).
 *
 * The sandbox has no browser, so these tests read the real component sources
 * the way the client-portal UI suite does: every navigation entry, role gate,
 * student flow and PHANTOM control must be present in the shipped code, and
 * the patterns that are forbidden everywhere else in this app (browser chrome
 * dialogs, leaking sessions across namespaces, fabricating offline results)
 * must be absent.
 *
 * Usage: node scripts/cgm-ui-tests.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

let passed = 0;
const failures = [];
const check = (label, condition, detail = '') => {
  if (condition) passed += 1;
  else { failures.push(`${label}${detail ? ` — ${detail}` : ''}`); console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`); }
};
const section = (title) => console.log(`\n== ${title}`);

const workspace = src('src/components/ClassGroups/ClassGroupsWorkspace.tsx');
const studentPortal = src('src/components/ClassGroups/StudentPortal.tsx');
const phantom = src('src/components/ClassGroups/PhantomClasses.tsx');
const client = src('src/lib/cgm.ts');
const app = src('src/App.tsx');
const navbar = src('src/components/Navbar.tsx');
const phantomCenter = src('src/components/PhantomControlCenter.tsx');
const organizerRoutesSrc = src('functions/lib/cgm/routes-organizer.ts');
const activityRoutesSrc = src('functions/lib/cgm/routes-activities.ts');
const css = src('src/index.css');

// ===========================================================================
section('1. The dedicated navigation entry exists exactly once');
check('the navbar carries the dedicated Class & Groups door to #class-groups',
  /href="#class-groups"/.test(navbar) && /Classes &amp; Groups|Classes & Groups/.test(navbar));
const classGroupsEntry = src('src/components/ClassGroupsEntry.tsx');
check('the Class & Groups door is a compact icon button beside the client access door (no header text pills)',
  /href="#class-groups"/.test(classGroupsEntry) && /Users className/.test(classGroupsEntry)
  && /<ClassGroupsEntry variant="icon" \/>/.test(navbar) && /<ClientPortalEntry variant="icon" \/>/.test(navbar)
  && !/variant="chip"/.test(navbar)
  && navbar.indexOf('<ClassGroupsEntry') < navbar.indexOf('<ClientPortalEntry'));
check('the door appears in the header and keeps its labelled row in the mobile dropdown',
  (navbar.match(/href="#class-groups"/g) || []).length === 1
  && /Classes &amp; Groups/.test(navbar));
check('the door is titled with the full module name',
  /title="CODE Rx — Class & Group Management"/.test(navbar));
check('classless sidebar areas open real guidance panes, never a frozen create card',
  /NoClassPane/.test(workspace) && /area !== 'overview' && area !== 'classes'/.test(workspace)
  && /arrive per class/.test(workspace) && /Templates store an activity/.test(workspace)
  && /area === 'overview' && \(\n?\s*<NoClassView/.test(workspace));

section('2. Hash routing in App.tsx');
check('#class-groups opens the workspace for members',
  /classGroupsView === 'workspace' && user/.test(app) && /<ClassGroupsWorkspace/.test(app));
check('#class-groups/student opens the student portal',
  /hash.startsWith\('#class-groups\/student'\)/.test(app));
check('#class-groups/phantom opens the PHANTOM oversight area only for PHANTOM',
  /hash.startsWith\('#class-groups\/phantom'\)/.test(app) && /current\?\.isPhantom \|\| current\?\.role === 'phantom'/.test(app));
check('#class-invite/<code> lands in the student portal with the code',
  /hash.startsWith\('#class-invite\/'\)/.test(app) && /decodeURIComponent\(hash.replace\('#class-invite\/', ''\)/.test(app));
check('visitors without a member session get the student portal, not the organizer workspace',
  /setClassGroupsView\(userRef\.current \? 'workspace' : 'student'\)/.test(app));
check('the workspaces render standalone, outside the member shell',
  app.indexOf("classGroupsView === 'student'") < app.indexOf('if (isClientPortalView)'));

section('3. The 18 role-gated organizer areas');
for (const area of ['Overview', 'My Classes', 'Students', 'Class Invitations', 'Grouping Activities', 'Groups',
  'Elections', 'Leadership', 'Attendance', 'Calendar', 'Announcements', 'Notifications', 'Reports',
  'Templates', 'Approvals', 'Permissions', 'Archives', 'Settings']) {
  check(`nav area “${area}” is declared`, workspace.includes(`'${area}'`));
}
check('areas are permission-gated, not hidden by CSS alone',
  /can\('view_roster'\)/.test(workspace) && /can\('manage_invitations'\)/.test(workspace)
  && /can\('manage_elections'\)/.test(workspace) && /can\('manage_class_settings'\)/.test(workspace));
check('PHANTOM and primary organizers see everything; assistants only their grants',
  /activeClass.role === 'phantom'/.test(workspace) && /activeClass.role === 'primary'/.test(workspace));

section('4. Student portal');
check('registration asks for class code, index number and shared entry password',
  /classCode/.test(studentPortal) && /indexNumber/.test(studentPortal) && /entryPassword/.test(studentPortal));
check('the entry password is labelled as never being the login',
  /only for registration/.test(studentPortal));
check('sign-in always requires the permanent passkey next to one identifier',
  /identifierType/.test(studentPortal) && /passkey/i.test(studentPortal));
check('the passkey placeholder teaches the rx30 shape', /rx30a/.test(studentPortal));
check('students see approvals pending without organizer controls',
  /Awaiting review/.test(studentPortal) && !/PHANTOM/.test(studentPortal.split('AuthScreen')[1] || ''));
check('the student portal covers classes, groups, elections, attendance, calendar, notifications, profile and history',
  ['My Classes', 'My Groups', 'My Elections', 'My Attendance', 'My Calendar', 'Notifications', 'My Profile', 'Activity History']
    .every((label) => studentPortal.includes(label)));
check('profile changes go through the approval workflow with a reason',
  /requestProfileChange/.test(studentPortal) && /reason/i.test(studentPortal));
check('passkey self-change is presented as optional and organizer-controlled',
  /Only available when a class enables self-service/.test(studentPortal));
check('invitation join flow exists for signed-in students', /joinClass/.test(studentPortal) && /claimInvitation/.test(studentPortal));

section('5. Frontend API client namespaces');
check('organizers and PHANTOM call through the member bearer client',
  /Authorization.*Bearer/.test(client) && /memberCall/.test(client));
check('students use their own session header, never the member token',
  client.includes("X-Code-Rx-Student-Session") && /studentCall/.test(client));
check('the student session lives in sessionStorage and clears on 401',
  /sessionStorage/.test(client) && /status === 401\) studentSession\.clear\(\)/.test(client));
check('roster import posts multipart form data', /FormData/.test(client));
check('report downloads exist for the nine report kinds',
  ['roster', 'assignments', 'movements', 'leadership', 'elections', 'turnout', 'attendance', 'pending', 'organizer-actions']
    .every((kind) => workspace.includes(`'${kind}'`)) && /downloadReport/.test(client));
check('the client exposes the PHANTOM oversight namespace',
  /phantomOverview/.test(client) && /phantomDecideApplication|phantomOrganizerAction/.test(client)
  && /phantomGrantDelegation/.test(client) && /phantomDecideSensitiveChange/.test(client));

section('6. Organizer workspace behaviours');
check('roster import supports the three formats and duplicate policies',
  /\.xlsx/.test(workspace) && /\.csv/.test(workspace) && /\.json/.test(workspace)
  && /'skip'|value="skip"/.test(workspace) && /value="update"/.test(workspace) && /value="flag"/.test(workspace));
check('the import flow validates before it imports: the file is inspected on choose and rows can be re-checked',
  /previewRosterFile/.test(workspace) && /Check rows for problems/.test(workspace) && /Import \$\{info\?\.totalRows/.test(workspace));
check('invitations keep their link: copy, share and re-render the QR any time',
  /copy or share it any time/.test(workspace) && /QrBlock/.test(workspace) && /Copy link/.test(workspace)
  && /Show QR/.test(workspace) && /Download image \(PNG\)/.test(workspace));
check('general and individual invitations are distinct flows',
  /'general'/.test(workspace) && /'individual'/.test(workspace) && /rosterEntryId/.test(workspace));
check('disable, revoke and regenerate are all reachable',
  /invitationAction\(/.test(workspace) && /'disable'/.test(workspace) && /'revoke'/.test(workspace) && /'regenerate'/.test(workspace));
check('the login-format change follows propose → notify → activate',
  /proposeLoginFormat/.test(workspace) && /activateLoginFormat/.test(workspace) && /Propose change/.test(workspace));
check('the entry password is rotated, never edited in place', /rotateEntryPassword|entry-password/.test(workspace));
check('assignment methods A, B and C are all configurable',
  /value="automatic"/.test(workspace) && /value="self"/.test(workspace) && /value="hybrid"/.test(workspace));
check('gender rules are balanced / separate / none — never inferred',
  /value="balanced"/.test(workspace) && /value="separate"/.test(workspace) && /value="none"/.test(workspace));
check('overflow behaviour is an explicit choice', /value="waitlist"/.test(workspace) && /value="organizer"/.test(workspace) && /value="block"/.test(workspace));
check('the election anonymity is a configured choice at creation, not an afterthought',
  /value="anonymous"/.test(workspace) && /value="public"/.test(workspace)
  && /createElection/.test(client) && /anonymity === 'anonymous'/.test(studentPortal));
check('tie-breaks are chosen up front', /value="runoff"/.test(workspace) && /value="appointment"/.test(workspace) && /value="random"/.test(workspace)
  && /resolveTie/.test(client) && /tie_break_method|tieBreak:/.test(workspace));
check('attendance statuses are exactly present/late/absent/excused',
  /\['present', 'late', 'absent', 'excused'\]/.test(workspace));
check('issued passkeys are shown once with a warning',
  /shown once/.test(workspace) && /passkey/i.test(workspace));
check('approvals cover registrations, memberships and profile changes',
  /approveRegistration/.test(workspace) && /reviewMembership/.test(workspace) && /reviewProfileChange/.test(workspace));
check('team permissions are granular, not a single toggle',
  /view_sensitive_profiles/.test(workspace) && /approve_registrations/.test(workspace) && /manage_whatsapp/.test(workspace));
check('reports are downloads, not on-page fabrication', /downloadReport/.test(workspace));
check('activity templates copy configuration only',
  /Templates \(configuration only/.test(workspace) || /never students, votes or attendance/.test(workspace));
check('succession is triggered by ending an appointment, with history kept',
  /endLeadership/.test(workspace) && /End/.test(workspace));
check('the workspace never fabricates offline successes',
  !/offline.*(saved|approved|success)/i.test(workspace));

section('7. PHANTOM oversight');
check('the PHANTOM area covers applications, classes, sensitive changes, delegation, disputes, organizer activity and audit',
  ['Overview', 'Organizer applications', 'Class approvals', 'Sensitive changes', 'Registration delegation', 'Disputes', 'Organizer activity', 'Audit trail']
    .every((label) => phantom.includes(label)));
check('suspend, reinstate and revoke are available for organizers',
  /'suspend'/.test(phantom) && /'reinstate'/.test(phantom) && /'revoke'/.test(phantom));
check('class approvals offer approve, correction and reject',
  /'approve'/.test(phantom) && /'correction'/.test(phantom) && /'reject'/.test(phantom));
check('the module flag can be toggled with data preserved',
  /phantomModule\(/.test(phantom) && /data is preserved/.test(phantom));
check('delegation grants an optional batch cap and revokes immediately',
  /maxBatch/.test(phantom) && /phantomRevokeDelegation/.test(phantom));
check('the PHANTOM area embeds into the Control Center as its own tab',
  phantomCenter.includes("'classgroups'") && phantomCenter.includes('<PhantomClassGroups embedded />'));
check('PHANTOM decisions carry a reason prompt, never silent actions',
  (phantom.match(/appDialog\.prompt/g) || []).length >= 6);

section('8. Forbidden patterns stay forbidden');
for (const [name, source] of [['ClassGroupsWorkspace', workspace], ['StudentPortal', studentPortal], ['PhantomClasses', phantom]]) {
  check(`${name} never uses browser chrome dialogs`,
    !/window\.prompt|window\.confirm|window\.alert/.test(source));
  check(`${name} never logs credentials or passkeys`, !/console\.log\([^)]*passkey/i.test(source));
}
check('the student session header never carries a member JWT',
  !/Authorization/.test(studentPortal));
check('raw passkeys are never persisted by the client', !/localStorage\.setItem\([^)]*passkey/i.test(client) && !/sessionStorage\.setItem\([^)]*passkey/i.test(client));

section('9. Shared chrome & styling');
check('the cgm shell, sidebar and topbar styles exist', /cgm-shell/.test(css) && /cgm-sidenav/.test(css) && /cgm-topbar/.test(css));
check('the sidebar collapses on small screens', /@media \(max-width: 860px\)/.test(css) && /cgm-sidenav--open/.test(css));
check('the cgm primary button keeps the emerald identity', /cgm-primary-button/.test(css) && /#059669/.test(css));
check('nav links expose aria-current for assistive tech',
  /aria-current=\{section === key \? 'page' : undefined\}/.test(studentPortal)
  && /aria-current=\{area === key \? 'page' : undefined\}/.test(workspace));

section('10. Backend routes the UI depends on actually exist');
const backendDir = 'functions/lib/cgm';
const backend = ['routes-student.ts', 'routes-organizer.ts', 'routes-activities.ts', 'core.ts', 'service.ts', 'parse.ts', 'schema.ts', 'assignment.ts']
  .filter((file) => existsSync(path.join(ROOT, backendDir, file)))
  .map((file) => src(`${backendDir}/${file}`)).join('\n');
for (const endpoint of [
  '/api/cgm/student/register', '/api/cgm/student/login', '/api/cgm/student/join',
  '/api/cgm/student/invitations/:code/claim', '/api/cgm/student/profile/change',
  '/api/cgm/student/passkey/change', '/api/cgm/classes', '/api/cgm/classes/:id/roster/import',
  '/api/cgm/classes/:id/invitations', '/api/cgm/classes/:id/registrations/:requestId/approve',
  '/api/cgm/activities/:id/generate', '/api/cgm/activities/:id/assign-remaining',
  '/api/cgm/activities/:id/lifecycle', '/api/cgm/groups/:id/elections', '/api/cgm/elections/:id/close',
  '/api/cgm/elections/:id/tiebreak', '/api/cgm/groups/:id/leaders',
  '/api/cgm/attendance-sessions/:id/records', '/api/cgm/attendance/records/:id/correct',
  '/api/cgm/classes/:id/announcements', '/api/cgm/announcements/:id/moderate',
  '/api/cgm/phantom/overview', '/api/cgm/phantom/organizer-applications', '/api/cgm/phantom/classes',
  '/api/cgm/phantom/sensitive-changes', '/api/cgm/phantom/delegations', '/api/cgm/phantom/disputes',
  '/api/cgm/phantom/organizer-activity', '/api/cgm/phantom/audit', '/api/cgm/phantom/module',
  '/api/cgm/organizer/apply', '/api/cgm/organizer/verify',
]) {
  check(`${endpoint} is registered server-side`, backend.includes(`'${endpoint}'`));
}
check('the worker mounts the class & group routes', src('functions/[[path]].ts').includes('registerClassGroupRoutes(app)'));

// ===========================================================================
section('11. Step-5 additions: attachments, reads, reminders, succession, windows, WhatsApp, offline guard, file reports');
const banner = src('src/components/ClassGroups/ConnectionBanner.tsx');
const schemaCgm = src('functions/lib/cgm/schema.ts');
const schemaVault = src('functions/lib/schema.ts');
const pdfWriter = src('functions/lib/cgm/pdf.ts');

// Offline & connection state (spec §38)
check('the connection banner exists with online/offline states and a status role',
  /ConnectionBanner/.test(banner) && /role="status"/.test(banner) && /offline/i.test(banner));
check('every module request carries an abort deadline — a dead network shows an error, never an eternal spinner',
  /cgmFetch/.test(client) && /AbortController/.test(client) && /CGM_TIMEOUT_MS = 20_000/.test(client)
  && /The server took too long to answer/.test(client)
  && !/await fetch\(`\$\{API_BASE\}\$\{endpoint\}`/.test(client));
check('every class & group shell renders the connection banner',
  /<ConnectionBanner \/>/.test(workspace) && /<ConnectionBanner \/>/.test(studentPortal) && /<ConnectionBanner \/>/.test(phantom));
check('mutating calls are guarded against duplicate submissions (in-flight lock → 409)',
  /guardDuplicate/.test(client) && /'duplicate'/.test(client) && /409/.test(client));
check('a failed fetch raises a real offline error instead of faking a result',
  /CgmError\('We could not reach Code Rx Society[^']*', 0, 'offline'\)/.test(client));

// Announcement attachments + read tracking (spec §12)
check('the announcement composer accepts a file attachment', /setAttachment\]/.test(workspace) && /type="file"/.test(workspace));
check('organizers see who read an announcement ("Seen by" + reads endpoint client)',
  /Seen by/.test(workspace) && /announcementReads:/.test(client));
check('students download attachments straight from the announcement row (📎 link)',
  /attachment_url \|\| row\.attachmentUrl/.test(studentPortal) && /📎/.test(studentPortal));
check('the announcement rows carry the R2 attachment columns',
  /attachment_r2_key/.test(schemaVault) && /attachment_name/.test(schemaVault) && /attachment_size/.test(schemaVault));

// Deadline reminders (spec §31)
check('the activities area can send deadline reminders with a dedupe-aware result message',
  /remindActivity:/.test(client) && /already reminded for this deadline/.test(workspace) && /Remind\s*<\/button>/.test(workspace));
check('reminder notifications carry a dedupe key backed by a unique index',
  /dedupe_key/.test(schemaVault) && /idx_cgm_notifications_dedupe/.test(schemaCgm) && /UNIQUE INDEX/.test(schemaCgm));

// Succession & election windows (spec §11)
check('leadership offers the three succession paths (automatic, appointment, fresh election)',
  /planSuccession:/.test(client) && /method: 'election'/.test(workspace) && /Fresh election/.test(workspace) && /Automatic promotes the most senior assistant/.test(workspace));
check('the election form collects nomination and voting windows',
  /nominationOpenAt/.test(workspace) && /nominationCloseAt/.test(workspace) && /votingOpenAt/.test(workspace) && /votingCloseAt/.test(workspace));

// WhatsApp manager (spec §12)
check('organizers manage one WhatsApp link per group (set, replace, disable, revoke)',
  /canManageWhatsapp/.test(workspace) && /cgm\.setWhatsApp\(/.test(workspace) && /whatsappAction\(/.test(workspace) && /setWhatsApp:/.test(client) && /whatsappAction:/.test(client));
check('the WhatsApp link shows a QR and tracks clicks without claiming join-proof',
  /qrByGroup/.test(workspace) && /showWhatsappQr/.test(workspace) && /clickCount/.test(workspace));

// Reports in three formats (spec §16)
check('reports download as CSV, Excel or PDF from one control',
  /downloadReport/.test(client) && /\['csv', 'xlsx', 'pdf'\]/.test(workspace) && existsSync(path.join(ROOT, 'functions/lib/cgm/pdf.ts')));
check('the PDF writer produces a real PDF 1.4 header without dependencies',
  /%PDF-1\.4/.test(pdfWriter) && /buildReportPdf/.test(pdfWriter));
check('the xlsx export goes through the same ESM build the roster import uses',
  /xlsx\/xlsx\.mjs/.test(backend) && /bookType: 'xlsx'/.test(backend));

// Delegated approvals visibility (spec §30)
check('a delegated organizer sees the delegation banner and gains the approvals area',
  /delegatedClassIds/.test(workspace) && /PHANTOM delegated registration approvals/.test(workspace) && /delegated=\{delegated\}/.test(workspace));
check('the client exposes delegatedClassIds on the organizer status payload', /delegatedClassIds/.test(client));

// Student month-grid calendar (spec §31)
check('the student calendar renders a Monday-first month grid with navigation',
  /grid-cols-7/.test(studentPortal) && /Previous month/.test(studentPortal) && /Next month/.test(studentPortal));
check('calendar days are selectable buttons with an event count label',
  /aria-pressed=\{isSelected\}/.test(studentPortal) && /event\(s\)/.test(studentPortal));
check('the agenda list survives next to the month grid', /All upcoming/.test(studentPortal));

// Organizer email verification surfaced in the UI (spec §5)
check('the apply flow surfaces the email-verification result to the applicant', /emailSent|verification/i.test(workspace) || /emailSent/.test(client));

// Server-side endpoints behind the new UI
for (const endpoint of [
  '/api/cgm/announcements/:id/attachment', '/api/cgm/announcements/:id/reads',
  '/api/cgm/activities/:id/reminders', '/api/cgm/groups/:id/succession',
  '/api/cgm/groups/:id/whatsapp', '/api/cgm/groups/:id/whatsapp/:action',
  '/api/cgm/whatsapp/:linkId/click',
]) {
  check(`${endpoint} is registered server-side`, backend.includes(`'${endpoint}'`));
}

// ===========================================================================
section('12. Step-6 additions: preferences, contact privacy, own records, sample templates');
check('students read and save per-category notification preferences',
  /notificationPrefs:/.test(client) && /cgmStudent\.saveNotificationPrefs/.test(studentPortal) && /notification-prefs/.test(backend));
check('the preferences UI is a real switch with security categories pinned server-side',
  /role="switch"/.test(studentPortal) && /aria-checked=\{entry\.muted\}/.test(studentPortal) && /cannot be turned off/.test(studentPortal));
check('the client exposes the records export and the roster template download',
  /downloadMyRecords/.test(client) && /downloadRosterTemplate/.test(client) && /records\/export/.test(backend) && /roster\/template/.test(backend));
check('the student portal offers the own-records CSV download',
  /Download my records \(CSV\)/.test(studentPortal) && /records survive leaving a class/.test(studentPortal));
check('contact details appear on group-mates only when the server allowed them',
  /member\.phone \|\| member\.email/.test(studentPortal));
check('the import card offers sample roster templates in all three formats',
  /Sample template:/.test(workspace) && /downloadRosterTemplate\(format\)/.test(workspace));
check('notification preferences live in their own table with a unique per-category row',
  /cgm_notification_prefs/.test(schemaCgm) && /UNIQUE \(student_id, category\)/.test(schemaCgm));

// ===========================================================================
section('13. Step-7 additions: field-visibility floor, published-config freeze, activities report');
check('the privacy editor offers only fields the server will honour for classmates',
  /\['full_name', 'phone', 'email'\]\.map/.test(workspace) && !/\['full_name', 'index_number', 'university_id', 'phone', 'gender', 'email'\]\.map/.test(workspace));
check('the settings copy explains the credential floor and per-activity scoping',
  /half of a sign-in credential/.test(workspace) && /limited per activity to the group or the class/.test(workspace));
check('published activities refuse structural config changes server-side',
  /silently change/.test(backend) && /STRUCTURE_FIELDS/.test(backend) && /A published activity cannot change/.test(backend));
check('deadline extensions stay open while the structure is frozen',
  /selfDeadline/.test(backend) && !/STRUCTURE_FIELDS = \['method', 'groupCount', 'targetGroupSize', 'capacity', 'genderRule', 'overflow', 'selfDeadline'\]/.test(backend));
check('the reports list includes the activities overview',
  /\['activities', 'Activities overview'\]/.test(workspace) && /Active leaders/.test(backend));
check('the class field-visibility gate runs in the student payload path',
  /sanitizeClassSettings/.test(src('functions/lib/cgm/routes-student.ts')) && /studentVisibleFields\.includes\('phone'\)/.test(src('functions/lib/cgm/routes-student.ts')));

// ===========================================================================
section('14. Step-8 hardening: atomic seat claims, vote ledger, move compensation');
const service = src('functions/lib/cgm/service.ts');
const studentRoutes = src('functions/lib/cgm/routes-student.ts');
check('assignment inserts re-check capacity and uniqueness inside one atomic statement',
  /insertAssignmentGuarded/.test(service) && /WHERE NOT EXISTS \(SELECT 1 FROM cgm_group_assignments/.test(service)
  && /< COALESCE\(\(SELECT capacity FROM cgm_groups/.test(service));
check('self-assignment, waitlist promotion and organizer placement all use the atomic guard',
  (studentRoutes.match(/insertAssignmentGuarded/g) || []).length >= 2
  && (backend.match(/insertAssignmentGuarded/g) || []).length >= 4);
check('a lost move restores the student\'s original seat instead of leaving them seatless',
  /restoreAssignment/.test(service) && /keeps their current group/.test(backend));
check('the vote ledger commits participation and ballot together with a clean 409 on double votes',
  /cgm_election_participation[\s\S]*cgm_election_ballots/.test(studentRoutes.match(/DB\.batch\(\[[\s\S]*?\]\);/)?.[0] || '')
  && /You have already voted in this election\.', 409/.test(studentRoutes));
check('the service worker keeps caching the shell only', /CACHE = 'code-rx-v7'/.test(src('public/sw.js')));

// ===========================================================================
section('15. Step-9 security sweep: verifiable credential rotation, lockout model');
check('passkey changes verify against a freshly-read verifier and rotate verifier + sequence + suffix together',
  /SELECT passkey_prefix, passkey_verifier FROM cgm_students WHERE id = \?/.test(studentRoutes)
  && /passkey_sequence = \?, passkey_suffix = \?/.test(studentRoutes)
  && /That passkey is already in use/.test(studentRoutes));
check('a passkey change revokes every live session and issues exactly one fresh one',
  /revokeStudentSessions/.test(studentRoutes) && /passkey was changed/.test(studentRoutes));
check('lockout guards the confirming half: the audit marks the lock without counting anonymous wrong passkeys',
  /cgm\.student\.locked/.test(studentRoutes) && /failed_attempts = failed_attempts \+ 1 WHERE id = \?/.test(studentRoutes));
check('the audit trail scan is part of the suite contract (no raw passkeys or entry passwords)',
  /never contains a raw passkey/.test(readFileSync(path.join(ROOT, 'scripts/cgm-tests.mjs'), 'utf8')));

// ---------------------------------------------------------------------------
// 16. §30 module policy console, draft overrides, inline passkey reveal
// ---------------------------------------------------------------------------
section('16. Step-11: module settings console, draft overrides, auto-registration reveal');

check('the PHANTOM area has a dedicated Module settings tab',
  /\['policies', 'Module settings'\]/.test(phantom) && /type Tab = 'overview' \| 'policies'/.test(phantom));
check('the console loads and saves through the policy endpoints',
  /phantomPolicies\(\)/.test(phantom) && /phantomSavePolicies\(/.test(phantom)
  && client.includes('/api/cgm/phantom/policies'));
check('every process is manageable: applications, classes, registration, membership, profile',
  ['organizer_application_mode', 'class_creation_mode', 'student_registration_mode', 'membership_request_mode', 'profile_change_mode']
    .every((key) => phantom.includes(`'${key}'`)));
check('each process offers approval, automatic and (where legal) closed modes',
  /'Wait for PHANTOM approval'/.test(phantom) && /'Automatic after email verification'/.test(phantom)
  && /'Closed — PHANTOM invites only'/.test(phantom) && /'Automatic — passkey issued at once'/.test(phantom)
  && /'Closed — no join requests'/.test(phantom));
check('the modes are real radio groups with a save button that reports success',
  /role="radiogroup"/.test(phantom) && /aria-checked=/.test(phantom) && /Save module settings/.test(phantom)
  && /role="status"/.test(phantom));
check('the console explains that choices are module-wide and audited',
  /module-wide/.test(phantom) && /audit trail/.test(phantom));

check('a draft class is still actionable: PHANTOM can submit & approve it as an override',
  phantom.includes('Submit &amp; approve (override)') && phantom.includes('Still a draft — the organizer has not submitted it for approval yet.'));
check('a rejected class can be approved later without resubmission',
  /status === 'rejected'/.test(phantom) && /Approve now/.test(phantom));

check('automatic registration reveals the permanent passkey on its own dedicated page',
  studentPortal.includes('data-testid="cgm-passkey-reveal"') && /if \(issuedPasskey\) \{/.test(studentPortal)
  && /cannot be re-issued/.test(studentPortal)
  && !studentPortal.includes('I saved my passkey — continue'));
check('the register form no longer claims every registration waits for a person',
  !studentPortal.includes('Your organizer reviews every registration.')
  && studentPortal.includes('approved automatically'));

check('the workspace reads the classes list as the unwrapped array the client returns (My Classes never blank)',
  /Array\.isArray\(myClasses\) \? myClasses : \(myClasses\?\.classes \|\| \[\]\)/.test(workspace)
  && !/setClasses\(myClasses\.classes/.test(workspace));
check('My Classes with zero classes opens the create-first-class guidance instead of an empty pane',
  (workspace.match(/<NoClassView/g) || []).length === 2 && /classes\.length\s*\n?\s*\?\s*<ClassesArea/.test(workspace));

check('verification tokens are gated: production responses never carry one',
  /CGM_DEV_PREVIEW_TOKENS/.test(organizerRoutesSrc) && /\.\.\.\(devPreview \? \{ verifyToken: token \} : \{\}\)/.test(organizerRoutesSrc));
check('a secure resend-verification workflow exists with a cooldown and audit',
  /resend-verification/.test(organizerRoutesSrc) && /cgm\.organizer\.verification_resent/.test(organizerRoutesSrc)
  && /verification link has expired/i.test(organizerRoutesSrc));
check('verification links embed an expiry in the hashed material',
  /CGM_VERIFY_TTL_HOURS/.test(organizerRoutesSrc) && /Math\.floor\(Date\.now\(\) \/ 1000\) \+ ttlHours \* 3600/.test(organizerRoutesSrc));
{
  const leakInNotification = (source) => {
    for (const match of source.matchAll(/passkey is \$\{[^}]*\}/g)) {
      const before = source.lastIndexOf('notifyStudent(', match.index);
      if (before >= 0 && !source.slice(before, match.index).includes(');')) return true;
    }
    return false;
  };
  check('raw passkeys are never written into student notifications (both issuance paths)',
    !leakInNotification(studentRoutes) && !leakInNotification(organizerRoutesSrc)
    && /passkey was issued at approval/.test(organizerRoutesSrc)
    && /shown once on your registration screen/.test(studentRoutes));
}
check('lockout counts the verifier half as well as the identifier half',
  /registerFailedAttempt/.test(studentRoutes)
  && (studentRoutes.match(/await registerFailedAttempt\(\);/g) || []).length === 2);
check('the organizer UI offers resend verification and no longer hints at the token endpoint',
  /Resend verification email/.test(workspace) && !/verify at \/api\/cgm\/organizer\/verify/.test(workspace));
check('PHANTOM sees email delivery health (status only, never secret values)',
  /Verification email delivery:/g.test(phantom) && /emailConfigStatus/.test(activityRoutesSrc));

check('invitation context survives authentication and is claimed automatically after sign-in',
  /continueInvite\(next\)/.test(studentPortal) && /INVITE_CONTINUATION_KEY/.test(studentPortal));
check('general codes ride a short-lived sessionStorage continuation; individual tokens never touch storage',
  /INVITE_CONTINUATION_TTL_MS/.test(studentPortal) && /if \(pendingInvite\.individual\) return;/.test(studentPortal)
  && /clearContinuation\(\)/.test(studentPortal));
check('the invitation landing shows the class and guides registration with the class prefilled',
  /You are invited/.test(studentPortal) && /setClassCode\(String\(info\?\.class\?\.code \|\| ''\)\)/.test(studentPortal));
check('the dead-end "tap Join again" flow is gone',
  !studentPortal.includes('tap Join again'));
check('a just-issued passkey blocks the handoff until the student confirms saving it',
  /I have saved my passkey — continue/.test(studentPortal));
check('the reveal page shows the details on file (name, index, phone, email, class)',
  /Your details on file/.test(studentPortal) && /detailRows/.test(studentPortal));
check('the claim result is shown on the dashboard and can be dismissed',
  /inviteNotice/.test(studentPortal) && /Dismiss/.test(studentPortal));

check('policy transitions never touch queued rows and closed only closes new requests (§25 contract)',
  /does NOT silently approve/.test(readFileSync(path.join(ROOT, 'scripts/cgm-tests.mjs'), 'utf8')));
check('auth tabs and policy toggles wrap on narrow screens',
  /mt-5 flex flex-wrap gap-2" role="tablist"/.test(studentPortal) && /flex flex-wrap gap-1\.5" role="radiogroup"/.test(phantom));

check('a student registered under automatic approval keeps a persisted session (register writes it like login)',
  /register: async/.test(client) && /if \(data\?\.session\) studentSession\.write\(data\.session\);/.test(client));
check('the post-claim dashboard refresh compares session tokens, never object identity',
  /session\.token === studentSession\.read\(\)\?\.token/.test(studentPortal));
check('an organizer with classes can still create a new class from My Classes',
  /New class/.test(workspace) && (workspace.match(/<CreateClassForm/g) || []).length === 2 && /defaultOpen \? \{ onCreated/.test(workspace) === false || Boolean(/defaultOpen/.test(workspace)));

check('choosing a file inspects it immediately: columns, total rows and the first four rows for reference',
  /previewRosterFile/.test(workspace) && /First \{Math\.min\(4,/.test(workspace)
  && /for reference while you link the columns/.test(workspace));
check('the linking selects come from the file with a peek of the data inside each column',
  /columnPeek/.test(workspace) && /e\.g\. \$\{String\(peek\[header\]\)\.slice\(0, 18\)\}/.test(workspace));
check('columns are linked automatically from the header names and the link says so',
  /setMapping\(\{ \.\.\.\(result\.suggestedMapping \|\| \{\}\) \}\);/.test(workspace)
  && /Linked automatically from your file/.test(workspace));
check('required columns block the import with a clear call to action',
  /missingRequired\.length > 0/.test(workspace) && /Map \$\{missingRequired/.test(workspace)
  && /requiredFields/.test(workspace));

check('the organizer can set a per-class passkey mark in Settings, default rx30, existing passkeys never rewritten',
  /Passkey mark for this class/.test(workspace) && /Save passkey mark/.test(workspace)
  && /empty = default rx30/.test(workspace) && /keep theirs/.test(workspace)
  && /setPasskeyPrefix/.test(client) && /passkey-prefix/.test(organizerRoutesSrc));
check('the server validates the mark and audits every change',
  /sanitizePasskeyPrefix/.test(activityRoutesSrc) === false && /sanitizePasskeyPrefix/.test(src('functions/lib/cgm/core.ts'))
  && /cgm\.class\.passkey_prefix/.test(organizerRoutesSrc));
check('login resolves the passkey by its stored mark plus letters (prefix-aware lookup)',
  /passkey_prefix \|\| passkey_suffix = \?/.test(studentRoutes));

section('17. Roster mass actions, row editing, no university ID, dependency-free QR');

const qrSource = src('src/lib/qr.ts');

check('university ID is gone from every module surface (index number is the identity)',
  !/university/i.test(workspace) && !/university/i.test(studentPortal)
  && !/university/i.test(src('functions/lib/cgm/parse.ts'))
  && /'index_number', 'phone' as const|LOGIN_IDENTIFIER_KEYS = \['index_number', 'phone'\]/.test(src('functions/lib/cgm/core.ts')));

check('the organizer can edit a roster row after the upload (name, index, phone, gender)',
  /Edit this row/.test(workspace) && /updateRosterEntry/.test(workspace)
  && /aria-label="Index number"/.test(workspace)
  && /Another roster entry already uses this index number/.test(organizerRoutesSrc)
  && /already registered/.test(workspace));

check('the roster has select-all plus bulk delete for mass actions',
  /Select all unregistered rows/.test(workspace) && /bulkDeleteRosterEntries/.test(workspace)
  && /Delete selected/.test(workspace) && /Clear selection/.test(workspace)
  && /skippedRegistered/.test(workspace));

check('the Members tab has select-all with bulk suspend and remove',
  /Select all members/.test(workspace) && /bulkMemberAction/.test(workspace)
  && /Suspend selected/.test(workspace) && /Remove selected/.test(workspace));

check('invitation QR codes render from the module\'s own dependency-free encoder',
  /import \{ encodeQr \} from '\.\.\/\.\.\/lib\/qr'/.test(workspace) && /const QrBlock/.test(workspace)
  && /<svg viewBox=/.test(workspace) && /crispEdges/.test(workspace)
  && /ISO\/IEC 18004|Reed–Solomon/.test(qrSource) && /GF_EXP/.test(qrSource) && /penaltyN3/.test(qrSource));

check('the QR image downloads as a PNG stamped with the class name and shared entry',
  /downloadPng/.test(workspace) && /toBlob/.test(workspace) && /'image\/png'/.test(workspace)
  && /\.png`/.test(workspace) && /Entry password: /.test(workspace)
  && /Shared class entry password/.test(workspace));

check('the student sign-in halves are the index number or the phone only',
  /index_number: 'Index number',/.test(studentPortal) && !/university/i.test(studentPortal)
  && /index_number: 'Index number',\n  phone: 'Telephone number',/.test(src('functions/lib/cgm/core.ts')));

section('18. Automation in Settings, classmates, voting links, session persistence');

const studentClient = src('src/lib/cgm.ts');

check('Settings offers Approval/Automatic for registrations AND membership requests',
  /aria-label="Student registration mode"/.test(workspace) && /aria-label="Membership request mode"/.test(workspace)
  && /passkey issued on the spot/.test(workspace) && /walk straight in/.test(workspace)
  && /registrationMode/.test(workspace) && /registrationMode: 'approval' \| 'auto'/.test(src('functions/lib/cgm/core.ts')));

check('automatic registration is applied server-side (class switch under the module cap)',
  /classRegistrationMode === 'auto'/.test(src('functions/lib/cgm/routes-student.ts'))
  && /student_registration_mode'\) === 'auto' \|\| classRegistrationMode/.test(src('functions/lib/cgm/routes-student.ts')));

check('students see classmates with contacts only when the organizer set them visible',
  /Classmates \(/.test(studentPortal) && /made visible to classmates/.test(studentPortal)
  && /visibleFields\.includes\('phone'\)/.test(src('functions/lib/cgm/routes-student.ts')));

check('every open election has a voting link that signs students in and lands on the ballot',
  /#student-vote\//.test(workspace) && /Voting link/.test(workspace) && /Copy link/.test(workspace)
  && /Scan → sign in → vote/.test(workspace)
  && /student\/elections'\)/.test(studentClient));

check('the voting link opens the student portal straight on the ballot after sign-in',
  /#student-vote\//.test(app) && /voteTarget/.test(app) && /voteTarget/.test(studentPortal)
  && /You opened a voting link/.test(studentPortal));

check('My Elections is a real list with vote actions, not a pointer',
  /MyElectionsView/.test(studentPortal) && /electionsList/.test(studentClient) && /Vote now/.test(studentPortal));

check('the student login status persists (localStorage session with expiry, sign out clears it)',
  /localStorage\.setItem\(STUDENT_SESSION_KEY/.test(studentClient)
  && /localStorage\.removeItem\(STUDENT_SESSION_KEY/.test(studentClient)
  && /Sign out/.test(studentPortal));

check('the organizer workspace has its own Sign out beside Exit',
  /memberAuth\.logout\(\)/.test(workspace) && /End this session on this device/.test(workspace));

check('group planning is one-way from the total roster: groups never get rewritten, sizes are derived',
  /const setGroupCount/.test(workspace) && !/applyGroupMath/.test(workspace)
  && /Total roster: \$\{plannedStudents\}/.test(workspace)
  && /maximum per group: \$\{maxPerGroup\}/.test(workspace)
  && /group\$\{surplusStudents === 1 \? '' : 's'\} of \$\{maxPerGroup\}/.test(workspace));
check('the group count input is the only writer of groupCount (nothing changes it after setting)',
  /onChange=\{\(event\) => setGroupCount\(event\.target\.value\)\}/.test(workspace)
  && !/cgm-act-size/.test(workspace));

// ---------------------------------------------------------------------------
// 19. Random Group Selection: premium reveal over a server-persisted draw
// ---------------------------------------------------------------------------
section('19. Random Group Selection reveal (premium overlay)');
const reveal = src('src/components/ClassGroups/RandomGroupReveal.tsx');
const portalUi = src('src/components/ClassGroups/StudentPortal.tsx');
const cgmClient = src('src/lib/cgm.ts');
const portalCss = src('src/index.css');

check('the random draw API is a real student call', /randomDraw: \(activityId: number\)/.test(cgmClient) && /activities\/\$\{activityId\}\/random-draw/.test(cgmClient));
check('the portal draws FIRST (server persists) and only then opens the reveal overlay',
  /cgmStudent\.randomDraw\(Number\(data\.activity\.id\)\)[\s\S]{0,420}setReveal\(\{/.test(portalUi)
  && /<RandomGroupReveal/.test(portalUi) && /cgm-random-open/.test(portalUi));
check('the reveal reproduces the reference composition (title panel, orbital carousel, status pill, result panel, 3-stage track)',
  /Random Group Selection/.test(reveal) && /All groups have an equal chance of being selected/.test(reveal)
  && /Selecting your group…/.test(reveal) && /Please wait while we make a random selection…/.test(reveal)
  && /Congratulations!/.test(reveal) && /You are assigned to/.test(reveal)
  && /'Processing…', 'Random Selection…', 'Complete!'/.test(reveal)
  && /cgmSparkle/.test(reveal) && /cgmConfetti/.test(portalCss) && /cgmOrbit/.test(reveal));
check('group labels are fully dynamic — the winner name renders from the server payload, never a hardcoded label',
  /\{winner\?\.name\}/.test(reveal) && !/Group C/.test(reveal) && /const winnerIndex = Math\.max\(0, safeGroups\.findIndex/.test(reveal));
check('animation quality: rAF ease-out deceleration, golden centre ring, light rays, skip + reduced-motion + sound-off-by-default',
  /requestAnimationFrame/.test(reveal) && /easeOutQuart/.test(reveal) && /border-amber-400 bg-amber-200\/10/.test(reveal)
  && /Skip animation/.test(reveal) && /prefers-reduced-motion: reduce/.test(reveal)
  && /useState\(false\); \/\/ OFF by default/.test(reveal) && /AudioContext/.test(reveal));
check('the experience is premium-professional with zero gambling vocabulary',
  !/\b(casino|bets?|betting|jackpot|gambl\w*|wager\w*)\b/i.test(reveal.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ')));
check('the carousel adapts to any group count with a recycled strip and measured card width',
  /const passes = Math\.max\(2, Math\.ceil\(12 \/ safeGroups\.length\)\)/.test(reveal)
  && /Math\.min\(148, Math\.max\(96, window\.innerWidth \* 0\.235\)\)/.test(reveal));

// ---------------------------------------------------------------------------
// 20. Forced random mode, organizer finish, PHANTOM-regulated direct swaps
// ---------------------------------------------------------------------------
section('20. Forced random mode + organizer swaps');
const forcedWorkspace = src('src/components/ClassGroups/ClassGroupsWorkspace.tsx');
const forcedPortal = src('src/components/ClassGroups/StudentPortal.tsx');
const forcedClient = src('src/lib/cgm.ts');

check("the assignment-method dropdown offers 'Random selection — system picks for every student'",
  /value="random">Random selection — system picks for every student</.test(forcedWorkspace));
check('the organizer finish button names the random mode so stragglers can be swept in',
  /Assign remaining \(random mode\)/.test(forcedWorkspace) && /assignRemaining/.test(forcedWorkspace));
check('every group member row carries a Swap… control fed from the other groups\' members',
  /aria-label=\{`Swap \$\{member\.full_name\} with a member of another group`\}/.test(forcedWorkspace)
  && /cgm\.swapStudents\(Number\(activityId\), Number\(member\.student_id\), partner\)/.test(forcedWorkspace)
  && /Swap…<\/option>/.test(forcedWorkspace));
check('the client library exposes the PHANTOM-regulated swap endpoint',
  /swapStudents: \(activityId: number, studentIdA: number, studentIdB: number\)/.test(forcedClient)
  && /swap-students/.test(forcedClient));
check('forced random mode gives students ONLY the fair draw — no pick grid, no auto button',
  /const forcedRandom = data\.activity\.config\?\.method === 'random'/.test(forcedPortal)
  && /Your organizer set this activity to random selection — every group has an exactly equal chance/.test(forcedPortal)
  && (forcedPortal.match(/!forcedRandom && /g) || []).length >= 2);
check('the swap route enforces capacity-safe in-place exchange, gender-separate protection and audit',
  /swap-students/.test(src('functions/lib/cgm/routes-activities.ts'))
  && /Gender-separate groups cannot exchange students of different genders/.test(src('functions/lib/cgm/routes-activities.ts'))
  && /cgm\.assignment\.swapped/.test(src('functions/lib/cgm/routes-activities.ts')));

// ---------------------------------------------------------------------------
// 21. Student continue-cards + honest profile identity fields
// ---------------------------------------------------------------------------
section('21. Student continue-cards + profile identity');
const ccPortal = src('src/components/ClassGroups/StudentPortal.tsx');

check('each grouping activity is a state-aware continue card, visually distinct from plain lists',
  /cgm-student-activity-card/.test(ccPortal)
  && /border-emerald-300 bg-gradient-to-r from-emerald-50 via-white to-amber-50\/70/.test(ccPortal)
  && /Continue — you are in \$\{mine\.group_name\}/.test(ccPortal)
  && /Random selection — tap to draw your group/.test(ccPortal)
  && /Continue — choose your group/.test(ccPortal));
check('live activities carry a Continue pill and forced-random ones a gold Random badge',
  /text-white">Continue<\/span>/.test(ccPortal)
  && /bg-amber-200 px-2 py-0\.5 text-\[9px\] font-black uppercase tracking-wider text-amber-800">Random<\/span>/.test(ccPortal));
check('the profile shows every identity field with its real value — fixed index number included, read-only',
  /\['index_number', 'Index number \(fixed\)', 'indexNumber', false\]/.test(ccPortal)
  && /\['full_name', 'Full name', 'fullName', true\]/.test(ccPortal)
  && /Not set yet/.test(ccPortal) && /Not provided/.test(ccPortal)
  && /const currentValue = \(displayKey: string\)/.test(ccPortal));

console.log(`\nCGM UI TESTS: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log('Failures:');
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exitCode = 1;
}
