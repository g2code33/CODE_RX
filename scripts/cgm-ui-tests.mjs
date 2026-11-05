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
  /href="#class-groups"/.test(classGroupsEntry) && /CGP\.jpg/.test(classGroupsEntry)
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
check('the Request-a-group-change card carries a SMALL idea icon that reveals the expectation note and folds back on any click',
  /cgm-group-change-tip-toggle/.test(studentPortal) && /data-testid="cgm-group-change-tip"/.test(studentPortal)
  && studentPortal.includes('kindly accept your group and work in harmony')
  && studentPortal.includes("onClick={() => setOpen(true)}")
  && studentPortal.includes("onClick={() => setOpen(false)}")
  && /!open && \(/.test(studentPortal));
check('the student group page shows the group topic + agenda BEFORE Request a group change',
  /cgm-student-topic-agenda/.test(studentPortal) && /Our topic &amp; agenda/.test(studentPortal)
  && studentPortal.indexOf('cgm-student-topic-agenda') < studentPortal.indexOf('Request a group change')
  && /myGroup\.topic/.test(studentPortal) && /myGroup\.agenda/.test(studentPortal));
check('the CGP logo replaces the icon everywhere: navbar door, organizer topbar, student header',
  /CGP\.jpg/.test(classGroupsEntry) && !/Users className/.test(classGroupsEntry)
  && (workspace.match(/CGP\.jpg/g) || []).length >= 1
  && (studentPortal.match(/CGP\.jpg/g) || []).length >= 1
  && !/bg-emerald-600 text-white"><GraduationCap className="h-5 w-5"/.test(workspace)
  && !/bg-emerald-600 text-white"><GraduationCap className="h-5 w-5"/.test(studentPortal));
check('zooming is prevented inside Class & Group: viewport guard hook + touch-action pan-y',
  /useCgmNoZoom/.test(workspace) && /useCgmNoZoom/.test(studentPortal)
  && /user-scalable=no/.test(src('src/components/ClassGroups/noZoom.ts'))
  && /touch-action: pan-y/.test(src('src/index.css')));
check('student class doors are unique navigation cards (stable accent + monogram + Open affordance) and the welcome board has a Continue-to-groups CTA',
  /ClassNavCard/.test(studentPortal) && /accentForClass/.test(studentPortal) && /monogramOf/.test(studentPortal)
  && /cgm-continue-groups/.test(studentPortal) && /Continue to choose group/.test(studentPortal)
  && /onOpenGroups/.test(studentPortal));
check('the passkey card is request-based: current passkey to ask, organizer approves, Generate is system-issued',
  /cgm-student-passkey-card/.test(studentPortal) && /requestPasskeyChange/.test(studentPortal)
  && /generatePasskey/.test(studentPortal) && /cgm-passkey-generate/.test(studentPortal)
  && /never type your own new passkey|never type your own new passkey/i.test(studentPortal)
  && !/newPasskey \(rx30…\)/.test(studentPortal));
check('the organizer sees passkey change requests with approve-and-notify / decline',
  /cgm-passkey-requests/.test(workspace) && /decidePasskeyRequest/.test(workspace)
  && /Approve &amp; notify/.test(workspace) && /Passkey change requests/.test(workspace));
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
  phantomCenter.includes("'classgroups'") && phantomCenter.includes('<PhantomClassGroups embedded'));
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
  '/api/cgm/student/passkey/request', '/api/cgm/student/passkey/generate',
  '/api/cgm/classes/:id/passkey-requests', '/api/cgm/classes/:id/passkey-requests/:requestId/approve',
  '/api/cgm/classes/:id/passkey-requests/:requestId/decline', '/api/cgm/classes', '/api/cgm/classes/:id/roster/import',
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
  /QrBlock/.test(workspace) && /click_count} member click\(s\)/.test(workspace) && /clicks are not proof of joining/.test(workspace));
check('the group cards carry NO WhatsApp editor — the group workspace owns it',
  !/Paste link…/.test(workspace) && !/qrByGroup/.test(workspace) && /data-testid="cgm-groups-board"/.test(workspace));

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
  (studentRoutes.match(/insertAssignmentRespectingDesignations/g) || []).length >= 3
  && (backend.match(/insertAssignmentRespectingDesignations/g) || []).length >= 4
  && /insertAssignmentGuarded/.test(service));
check('a lost move restores the student\'s original seat instead of leaving them seatless',
  /restoreAssignment/.test(service) && /keeps their current group/.test(backend));
check('the vote ledger commits participation and ballot together with a clean 409 on double votes',
  /cgm_election_participation[\s\S]*cgm_election_ballots/.test(studentRoutes.match(/DB\.batch\(\[[\s\S]*?\]\);/)?.[0] || '')
  && /You have already voted in this election\.', 409/.test(studentRoutes));
check('the service worker keeps caching the shell only', /CACHE = 'code-rx-v\d+'/.test(src('public/sw.js')));

// ===========================================================================
section('15. Step-9 security sweep: verifiable credential rotation, lockout model');
check('passkey generation verifies the current passkey and rotates verifier + sequence + suffix together (system-issued)',
  /passkey_sequence = \?, passkey_suffix = \?/.test(studentRoutes)
  && /allocateStudentPasskey/.test(studentRoutes)
  && /Your current passkey did not match/.test(studentRoutes));
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
  /\{resolved\.name\}/.test(reveal) && !/Group C/.test(reveal) && /resolveRevealWinner\(/.test(reveal));
check('the winner id is validated against the renderable groups — a stale list NEVER promotes the first card',
  /known: false/.test(reveal) && !/Math\.max\(0, safeGroups\.findIndex/.test(reveal)
  && /groupName\?:/.test(reveal) && /resolved\.name/.test(reveal));
check('the carousel is centred on the MEASURED lane, never viewport units (desktop drift fixed)',
  /laneRef/.test(reveal) && /getBoundingClientRect/.test(reveal)
  && /laneTransform\(laneW, cardW, gap, landingIndex, progress\)/.test(reveal) && !/50vw/.test(reveal));
check('sound state syncs through a live ref — enabling sound mid-animation is heard',
  /soundRef\.current = next/.test(reveal) && /soundRef\.current\) chime/.test(reveal)
  && /soundRef\.current\) \{ chime\(660/.test(reveal));
check('the confetti palette is clean and reduced motion skips the confetti field',
  /'\#f59e0b', '\#fbbf24', '\#059669'/.test(reveal) && !/' \#f59e0b'/.test(reveal)
  && /!reducedMotion && confetti\.map/.test(reveal));
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
check('random mode shows ONLY the fair finisher — no place-all button that could bypass the draw, no staging button',
  /cgm-create-empty-groups/.test(forcedWorkspace) === false
  && /data\.config\.method === 'automatic' && \(/.test(forcedWorkspace)
  && /the groups above already exist for the draw/.test(forcedWorkspace));
check('students get a dedicated WhatsApp join page (QR, copy link, open chat, Join button) right after placement',
  /cgm-student-whatsapp-page/.test(forcedPortal) && /cgm-student-join-whatsapp/.test(forcedPortal)
  && /Copy link/.test(forcedPortal) && /Open chat/.test(forcedPortal)
  && /setWaPage\(true\)/.test(forcedPortal) && /cgm-student-whatsapp-empty/.test(forcedPortal)
  && /cgm-student-whatsapp-open-page/.test(forcedPortal));
check('group naming is decided in the activity form: numbered / lettered / custom list',
  /cgm-act-naming/.test(forcedWorkspace) && /Numbered — Group 1, Group 2, Group 3…/.test(forcedWorkspace)
  && /Lettered — Group A, Group B, Group C…/.test(forcedWorkspace) && /cgm-act-names/.test(forcedWorkspace));
check('the Groups page shows a read-only planned strip and routes plan changes to the activity settings',
  /cgm-planned-groups/.test(forcedWorkspace) && /cgm-edit-activity-settings/.test(forcedWorkspace)
  && /Change in activity settings/.test(forcedWorkspace) && /cgm-gen-count/.test(forcedWorkspace) === false);
check('the activity form edits exactly the planned groups one by one (per-group name editor + will-be-created preview)',
  /cgm-group-name-editor/.test(forcedWorkspace) && /Name of group \$\{index \+ 1\}/.test(forcedWorkspace)
  && /Will be created as/.test(forcedWorkspace));
check('the plan is honestly labelled editable-until-placed and saving re-syncs the groups',
  /can change any time until the first student is placed/.test(forcedWorkspace)
  && /Groups now match the plan/.test(forcedWorkspace));
// Swapping is a people operation, so it lives INSIDE the group workspace
// (Members section) — the board itself only reports seat counts.
check('every member row inside the group workspace carries a Swap… control fed from the other groups\' members',
  /aria-label=\{`Swap \$\{row\.full_name\}`\}/.test(forcedWorkspace)
  && /cgm\.swapStudents\(Number\(activityId\), Number\(row\.id\), partner\)/.test(forcedWorkspace)
  && /Swap…<\/option>/.test(forcedWorkspace)
  && /detail\.otherMembers\.map/.test(forcedWorkspace));
check('the client library exposes the PHANTOM-regulated swap endpoint',
  /swapStudents: \(activityId: number, studentIdA: number, studentIdB: number\)/.test(forcedClient)
  && /swap-students/.test(forcedClient));
check('forced random mode gives students ONLY the fair draw — no pick grid, no auto button',
  /const forcedRandom = data\.activity\.config\?\.method === 'random'/.test(forcedPortal)
  && /Your organizer set this activity to random selection — every group has an exactly equal chance/.test(forcedPortal)
  && (forcedPortal.match(/!forcedRandom && /g) || []).length >= 2);
check('every group card opens a full per-group workspace covering everything about that group',
  /cgm-open-group/.test(forcedWorkspace) && /const GroupDetail = /.test(forcedWorkspace)
  && /cgm-group-workspace/.test(forcedWorkspace) && /Save topic/.test(forcedWorkspace)
  && /Notify members directly/.test(forcedWorkspace) && /Open chat ↗/.test(forcedWorkspace)
  && /Save capacity/.test(forcedWorkspace) && /Recent history/.test(forcedWorkspace));
check('the workspace manages THIS group only — dossier, sibling members for swaps, group-scoped announcements',
  /groupDetail: \(groupId: number\)/.test(forcedClient) && /notifyGroup: \(groupId: number, body/.test(forcedClient)
  && /updateGroup: \(groupId: number, body/.test(forcedClient)
  && /createAnnouncement\(Number\(classId\), \{ title: announceTitle, body: announceBody, pinned: announcePinned, activityId: Number\(activityId\), groupId \}/.test(forcedWorkspace.replace(/\s+/g, ' ')));
check('the main nav is a collapsible hamburger: entering a group collapses it, the sections drawer leads from the left',
  /cgm-sidenav--collapsed/.test(workspace) && /onGroupFocus/.test(workspace)
  && /setNavCollapsed\(open\)/.test(workspace)
  && /inset-y-0 left-0 z-50 w-80/.test(workspace) && !/inset-y-0 right-0/.test(workspace));
check('the member sheet prints/downloads customizable PNG/PDF with featured topic + AOB and header/title',
  /cgm-member-sheet/.test(forcedWorkspace) && /cgm-member-sheet-panel/.test(forcedWorkspace)
  && /downloadGroupSheetPng/.test(forcedWorkspace) && /downloadGroupSheetPdf/.test(forcedWorkspace)
  && /printGroupSheet/.test(forcedWorkspace) && /cgm-sheet-topic-toggle/.test(forcedWorkspace)
  && /AOB \/ other business/.test(forcedWorkspace)
  && /Joined via/.test(forcedWorkspace));
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

// ---------------------------------------------------------------------------
// 22. Dialogs inside standalone workspaces, the compact groups board, and
//     every hamburger closing when you click anywhere else.
// ---------------------------------------------------------------------------
section('22. Standalone dialog host, compact board, dismissable hamburgers');
const appSrc = src('src/App.tsx');
const boardWs = src('src/components/ClassGroups/ClassGroupsWorkspace.tsx');

// The CGM workspaces return BEFORE the app shell, so they used to render with
// no <AppDialogHost/> — every appDialog.prompt() there waited forever and the
// buttons looked broken (Re-choose, cancel election, resolve tie, PHANTOM).
check('the standalone Class & Groups, Student and PHANTOM workspaces mount the dialog host themselves',
  /const withDialogs = \(node: React\.ReactNode\) => \(<>\{node\}<AppDialogHost \/><\/>\)/.test(appSrc)
  && /return withDialogs\(<StudentPortal/.test(appSrc)
  && /return withDialogs\(<PhantomClassGroups/.test(appSrc)
  && /return withDialogs\(<ClassGroupsWorkspace/.test(appSrc));
check('the PHANTOM Vault early return also carries the dialog host',
  /<AdminPanel siteContent=\{siteContent\}[^\n]*\/><AppDialogHost \/><\/>/.test(appSrc));
check('Re-choose is driven by a real dialog, so it now resolves instead of hanging',
  /const reason = await appDialog\.prompt\(\{\s*title: `Ask \$\{memberName\} to choose again\?`/.test(boardWs));

// The Groups board is a status board: names + counts, nothing else.
const groupsAreaSrc = boardWs.slice(boardWs.indexOf('const GroupsArea = ('), boardWs.indexOf('const ElectionsArea =', boardWs.indexOf('const GroupsArea = (')));
const boardOnly = groupsAreaSrc.slice(groupsAreaSrc.indexOf('cgm-groups-board'), groupsAreaSrc.indexOf('Unassigned students'));
check('the groups board shows only the group name and its filled seats — no member lists, no Move/Swap',
  /data-testid="cgm-groups-board"/.test(groupsAreaSrc)
  && /\{size\}\/\{capacity \?\? '∞'\}/.test(boardOnly)
  && !/member\.full_name/.test(boardOnly) && !/Move…<\/option>/.test(boardOnly)
  && !/Swap…<\/option>/.test(boardOnly) && !/RechooseControl/.test(boardOnly));
check('opening a group card is how you reach the members',
  /data-testid="cgm-open-group"/.test(boardOnly) && /setOpenGroupId/.test(boardOnly));

// Every hamburger closes when you click anywhere else.
const dismissHook = src('src/lib/useOutsideDismiss.ts');
check('one shared hook closes a menu on any outside pointer or Escape',
  /export const useOutsideDismiss/.test(dismissHook)
  && /addEventListener\('pointerdown', onPointer, true\)/.test(dismissHook)
  && /addEventListener\('keydown', onKey\)/.test(dismissHook)
  && /event\.key === 'Escape'/.test(dismissHook));
check('the student portal closes its navigation on any outside click',
  /useOutsideDismiss\(navOpen, \(\) => setNavOpen\(false\), '\.cgm-sidenav, \.cgm-nav-toggle'\)/.test(src('src/components/ClassGroups/StudentPortal.tsx')));
check('the class & groups workspace closes its navigation and its sections drawer on any outside click',
  /useOutsideDismiss\(navOpen, \(\) => setNavOpen\(false\), '\.cgm-sidenav, \.cgm-nav-toggle'\)/.test(boardWs)
  && /useOutsideDismiss\(menuOpen, \(\) => setMenuOpen\(false\), '\[data-testid="cgm-workspace-drawer"\]/.test(boardWs));
check('the PHANTOM console gained a working navigation toggle that also dismisses',
  /data-testid="phantom-nav-toggle"/.test(src('src/components/ClassGroups/PhantomClasses.tsx'))
  && /useOutsideDismiss\(navOpen/.test(src('src/components/ClassGroups/PhantomClasses.tsx')));
check('Community, the public navbar, the identity ballot and the client room dismiss the same way',
  /useOutsideDismiss\(menuOpen/.test(src('src/components/CommunityHub.tsx'))
  && /useOutsideDismiss\(isOpen/.test(src('src/components/Navbar.tsx'))
  && /useOutsideDismiss\(navOpen/.test(src('src/components/CodenameBallot.tsx'))
  && /useOutsideDismiss\(\s*sectionsOpen/.test(src('src/components/ClientProjectRoom.tsx')));

check('a PHANTOM-approved re-choice is shown inside the group instead of the row vanishing',
  /data-testid="cgm-rechoose-approved"/.test(boardWs) && /PHANTOM approved a fresh choice/.test(boardWs)
  && /rechooseApproved/.test(boardWs));
check('the add-student picker falls back to the class roster when eligibility is ALL',
  /config\.eligibility === 'selected'/.test(src('functions/lib/cgm/routes-activities.ts'))
  && /config\?\.eligibility === 'selected'/.test(src('functions/lib/cgm/routes-activities.ts'))
  && /FROM cgm_class_members cm JOIN cgm_students s ON s\.id = cm\.student_id/.test(src('functions/lib/cgm/routes-activities.ts')));

section('23. Force Get — organizer proposal, PHANTOM approval, real destinations');

const forceGetWs = src('src/components/ClassGroups/ForceGetWorkspace.tsx');
const clientLib = src('src/lib/cgm.ts');
const routesActivities = src('functions/lib/cgm/routes-activities.ts');
const forceGetLib = src('functions/lib/cgm/forceGet.ts');

check('the Force Get button sits immediately beside Assign Remaining, emerald + gold, target icon',
  /data-testid="cgm-force-get-open"[\s\S]{0,1200}?<Target className="h-4 w-4 text-amber-300"/.test(workspace)
  && workspace.indexOf('Assign remaining') < workspace.indexOf('cgm-force-get-open')
  && /bg-emerald-600/.test(workspace.slice(workspace.indexOf('cgm-force-get-open') - 400, workspace.indexOf('cgm-force-get-open') + 900))
  && /hover:bg-emerald-700/.test(workspace) && /active:bg-emerald-800/.test(workspace)
  && /disabled:cursor-not-allowed disabled:opacity-50/.test(workspace));
check('the Force Get button is gated by the generate_groups permission and needs real groups',
  /disabled=\{busy \|\| !\(data\.groups \|\| \[\]\)\.length\}/.test(workspace)
  && workspace.indexOf("canGenerate && (") < workspace.indexOf('cgm-force-get-open'));
check('clicking it opens a dedicated FULL-PAGE workspace (returns a page, not a popup/dialog)',
  /if \(forceGetOpen && activityId\) \{\s*return \(\s*<ForceGetWorkspace/.test(workspace)
  && !/modal|dialog/i.test(forceGetWs.slice(0, 4000)));
check('the workspace lists every state: sampled, unsampled, re-choose and ineligible',
  /SAMPLED/.test(forceGetWs) && /NOT SAMPLED/.test(forceGetWs) && /AWAITING RESAMPLE/.test(forceGetWs)
  && /RE-CHOOSE PENDING/.test(forceGetWs) && /INELIGIBLE/.test(forceGetWs) && /DESIGNATION APPROVED/.test(forceGetWs));
check('destinations come from the real group names returned by the backend (never assumed numbering)',
  /groups\.map\(\(group\) => \(/.test(forceGetWs) && /group\.name/.test(forceGetWs)
  && /cgm-force-get-group/.test(forceGetWs));
check('selection supports single, multi, select-all-filtered and clear',
  /data-testid="cgm-force-get-select"/.test(forceGetWs) && /selectAllFiltered/.test(forceGetWs)
  && /data-testid="cgm-force-get-select-all"/.test(forceGetWs) && /data-testid="cgm-force-get-clear"/.test(forceGetWs));
check('bulk destination assignment exists for the selected rows',
  /data-testid="cgm-force-get-bulk-group"/.test(forceGetWs) && /data-testid="cgm-force-get-bulk-apply"/.test(forceGetWs)
  && /applyBulk/.test(forceGetWs));
check('a live preview shows current vs projected capacity and blocks over-capacity proposals',
  /data-testid="cgm-force-get-preview"/.test(forceGetWs) && /projected/.test(forceGetWs)
  && /over capacity/.test(forceGetWs)
  && /const canSubmit = \(readyItems\.length > 0 \|\| readyEntries\.length > 0\) && !missingDestination && !blockedIneligible[\s\S]{0,140}?!overfilled\.length[\s\S]{0,140}?!genderConflicts\.length/.test(forceGetWs));
check('the workspace states that nothing moves until PHANTOM approves',
  /Nothing moves until PHANTOM approves/.test(forceGetWs));
check('a pending version can be revised or cancelled from the workspace',
  /data-testid="cgm-force-get-pending"/.test(forceGetWs) && /reviseForceGet/.test(forceGetWs)
  && /data-testid="cgm-force-get-cancel"/.test(forceGetWs));
check('PHANTOM has a Force Get Requests tab with full detail, approve and reject-with-reason',
  /'force-get', 'Force Get Requests'/.test(phantom)
  && /data-testid="cgm-phantom-force-get-panel"/.test(phantom)
  && /cgm-phantom-approve-force-get/.test(phantom) && /cgm-phantom-reject-force-get/.test(phantom)
  && /A rejection needs a reason/.test(phantom));
check('the PHANTOM detail shows distribution, current vs proposed, sampling/re-choose state and capacity impact',
  /bucket\.size/.test(phantom) && /bucket\.projected/.test(phantom) && /sampled \? 'sampled' : 'not sampled yet'/.test(phantom)
  && /re-choose \{student\.rechooseState\}/.test(phantom) && /conflicts/.test(phantom));
check('the board count renders n/capacity with the bracketed forced number in red plus a legend',
  /data-testid="cgm-group-forced-count"/.test(workspace) && /text-red-600/.test(workspace)
  && /data-testid="cgm-groups-legend"/.test(workspace) && /organizer-forced members/.test(workspace)
  && /\{size\}\//.test(workspace) && /\?\? '∞'/.test(workspace));
check('group members carry FORCED / SAMPLED / AWAITING RESAMPLE / DESIGNATION APPROVED badges',
  /cgm-member-forced/.test(workspace) && /cgm-member-sampled/.test(workspace)
  && /cgm-member-awaiting/.test(workspace) && /cgm-member-designated/.test(workspace)
  && /designation\.approvedBy/.test(workspace) && /designation\.designatedAt/.test(workspace)
  && /designation\.applied/.test(workspace));
check('the group workspace summarises approved designations without exposing the organizer reasoning',
  /data-testid="cgm-group-force-get"/.test(workspace) && /students never see them here/.test(workspace));
check('the client library exposes the Force Get surface with typed responses and existing auth helpers',
  /forceGetRoster: \(activityId: number\) =>\s*memberCall<ForceGetRoster>/.test(clientLib)
  && /submitForceGet: \(activityId: number, items: ForceGetItemInput\[\]/.test(clientLib)
  && /reviseForceGet: \(requestId: number/.test(clientLib) && /cancelForceGet: \(requestId: number/.test(clientLib)
  && /phantomForceGetRequests: \(status = 'all'\)/.test(clientLib)
  && /phantomDecideForceGet: \(id: number, decision: 'approve' \| 'reject'/.test(clientLib));
check('the backend keeps designation separate from assignment and applies it exactly once',
  /status = 'active'/.test(forceGetLib) && /markDesignationApplied/.test(forceGetLib)
  && /WHERE id = \? AND status = 'active'/.test(forceGetLib)
  && /insertAssignmentRespectingDesignations/.test(forceGetLib));
check('sampling honours the designation on both the draw and the self-assignment path',
  /claimDesignatedSeat/.test(src('functions/lib/cgm/routes-student.ts'))
  && /placeByDesignation/.test(src('functions/lib/cgm/routes-student.ts'))
  && (src('functions/lib/cgm/routes-student.ts').match(/placeByDesignation\(c, activity, student, config\)/g) || []).length === 2);
check('organizer planners place approved designations first, before any planning',
  /placeDesignatedStudents/.test(routesActivities)
  && (routesActivities.match(/placeDesignatedStudents\(c\.env\.DB/g) || []).length >= 2);
check('the rejection reason is stored and surfaced back to the organizer',
  /review_reason = \?/.test(routesActivities) && /reviewReason/.test(forceGetWs));

check('the organizer preview names the destination group, its current composition and the proposed additions when genders clash',
  /data-testid="cgm-force-get-gender-conflict"/.test(forceGetWs)
  && /Already there:/.test(forceGetWs) && /This proposal adds:/.test(forceGetWs)
  && /Gender pools held now:/.test(forceGetWs)
  && /unknown is never assumed to be male or female/.test(forceGetWs));
check('the preview judges the COMPLETE composition (members + reservations + every student added at once)',
  /counts\.male|counts\.female/.test(forceGetWs) && /for \(const \w+ of proposed\) pools\.add\(\w+\.gender\)/.test(forceGetWs)
  && /\.groupId\) !== Number\(bucket\.groupId\)/.test(forceGetWs));
check('an unknown gender is surfaced separately and never silently treated as male/female',
  /data-testid="cgm-force-get-gender-unknown"/.test(forceGetWs) && /const asGender =/.test(forceGetWs));
check('PHANTOM sees which group, which students, which pools and where the clash comes from BEFORE approving',
  /data-testid="cgm-phantom-force-get-conflict"/.test(phantom)
  && /in this proposal/.test(phantom) && /holds a reserved approved seat here/.test(phantom)
  && /already a member of this group/.test(phantom)
  && /Approving is refused until the conflict is gone/.test(phantom));
check('the shared evaluator is the single source of truth for both preview and enforcement',
  /export const evaluateComposition/.test(src('functions/lib/cgm/groupComposition.ts'))
  && /forceGetComposition/.test(routesActivities)
  && /forceGetComposition/.test(forceGetLib)
  && /evaluateComposition/.test(forceGetLib));
check('the atomic seat claim re-checks the gender pool inside the INSERT (members AND reservations)',
  /enforceGenderPools/.test(forceGetLib)
  && (forceGetLib.match(/FROM cgm_force_get_designations dm/g) || []).length >= 1
  && /groupHoldsOtherPool/.test(forceGetLib));
check('the activity settings document that the separated rule has no Force Get exception',
  /data-testid="cgm-act-gender-note"/.test(workspace) && /Force Get\s+proposals\/revisions\/approvals/.test(workspace));
check('revisions, sampling and Re-choose all route through the same pool guard',
  /enforceGenderPools: separated/.test(src('functions/lib/cgm/routes-student.ts'))
  && /enforceGenderPools: enforcePools/.test(routesActivities)
  && /placeByDesignation/.test(src('functions/lib/cgm/routes-student.ts')));

section('24. Forgot passkey from the sign-in page');

const routesStudent = src('functions/lib/cgm/routes-student.ts');
const routesOrganizer = src('functions/lib/cgm/routes-organizer.ts');
check('the reset control sits beside the Sign in button on the login form',
  /data-testid="cgm-student-passkey-reset-open"/.test(studentPortal)
  && studentPortal.indexOf('type="submit" disabled={busy} className="cgm-primary-button flex-1"')
     < studentPortal.indexOf('cgm-student-passkey-reset-open')
  && /Reset passkey/.test(studentPortal));
check('the reset panel asks for the identifier only (never the forgotten passkey) and names the organizer step',
  /data-testid="cgm-passkey-reset-identifier"/.test(studentPortal)
  && /data-testid="cgm-passkey-reset-send"/.test(studentPortal)
  && /organizer approves it/i.test(studentPortal)
  && /data-testid="cgm-passkey-reset\/identifier-type|data-testid="cgm-passkey-reset-identifier-type"/.test(studentPortal));
check('after approval the SAME page generates the passkey and shows it once',
  /data-testid="cgm-passkey-reset-generate"/.test(studentPortal)
  && /data-testid="cgm-passkey-reset-issued"/.test(studentPortal)
  && /shown only on this page/.test(studentPortal)
  && /data-testid="cgm-passkey-reset-signin"/.test(studentPortal));
check('the reset code is kept in this browser so a returning student can collect the passkey',
  /codeRx_passkeyReset/.test(studentPortal) && /localStorage/.test(studentPortal)
  && /data-testid="cgm-passkey-reset-continue"/.test(studentPortal));
check('the client exposes session-less reset methods on the student auth helper',
  /resetPasskeyRequest: \(body: \{ identifier: string/.test(client)
  && /resetPasskeyGenerate: \(claimCode: string\)/.test(client)
  && /\/api\/cgm\/student\/passkey\/reset\/request/.test(client)
  && /\/api\/cgm\/student\/passkey\/reset\/generate/.test(client));
check('the backend route needs NO session and answers identically for unknown identifiers',
  /app\.post\('\/api\/cgm\/student\/passkey\/reset\/request'/.test(routesStudent)
  && !/app\.post\('\/api\/cgm\/student\/passkey\/reset\/request',[\s\S]{0,200}?requireStudent/.test(routesStudent)
  && /your request is now with your class organizer/.test(routesStudent)
  && /studentByIdentifier/.test(routesStudent));
check('the claim code is one-time, hashed at rest, and burned when the passkey is issued',
  /claim_token_hash/.test(routesStudent) && /claimHash/.test(routesStudent)
  && /cgm-passkey-reset:\$\{normaliseClaim\(raw\)\}/.test(routesStudent)
  && /claim_token_hash = NULL WHERE id = \? AND status = 'approved'/.test(routesStudent));
check('generation is refused before approval and after a decline, with distinct reasons',
  /reset_pending/.test(routesStudent) && /reset_declined/.test(routesStudent)
  && /reset_code_invalid/.test(routesStudent) && /reset_used/.test(routesStudent));
check('issuing the new passkey revokes the old sessions and audits the login-page source',
  /revokeStudentSessions\(c\.env\.DB, Number\(request\.student_id\)\)/.test(routesStudent)
  && /source: 'login'/.test(routesStudent)
  && /cgm\.passkey\.reset_requested/.test(routesStudent));
check('the organizer queue marks sign-in requests as unproven and shows what the student typed',
  /data-testid="cgm-passkey-request-login-source"/.test(workspace)
  && /from sign-in/.test(workspace)
  && /could not prove their current passkey/.test(workspace)
  && /requestedIdentifier/.test(routesOrganizer));
check('the organizer notification warns that the request carries no passkey proof',
  /could not prove their current passkey/.test(routesStudent)
  && /verify this student before approving/.test(routesStudent));

section('25. Force Get works on the WHOLE roster, including students who have not registered');

const forceGet = src('src/components/ClassGroups/ForceGetWorkspace.tsx');
check('the workspace lists the unregistered roster rows in the same table as the members',
  /data-testid="cgm-force-get-unregistered-row"/.test(forceGet)
  && /roster\.unregistered|unregistered\b/.test(forceGet)
  && /data-testid="cgm-force-get-unregistered-chip"/.test(forceGet)
  && /NOT REGISTERED/.test(forceGet));
check('an unregistered row still gets a destination picker and a checkbox',
  /data-testid="cgm-force-get-unregistered-group"/.test(forceGet)
  && /data-testid="cgm-force-get-select"/.test(forceGet)
  && /toggleEntry\(/.test(forceGet));
check('the page explains that the seat is held and becomes theirs when they register',
  /becomes their own designation/.test(forceGet)
  && /Placed automatically when they register/.test(forceGet)
  && /data-testid="cgm-force-get-unregistered-note"/.test(forceGet));
check('the held seat is visible per row, and the summary counts unregistered students and held seats',
  /data-testid="cgm-force-get-reservation"/.test(forceGet)
  && /'Not registered'/.test(forceGet) && /'Seats held'/.test(forceGet)
  && /SEAT HELD/.test(forceGet));
check('the roster filter can isolate the rows that have not registered',
  /\['unregistered', 'Not registered yet'\]/.test(forceGet)
  && /case 'unregistered': return false;/.test(forceGet));
check('the preview, the gender check and the submit all include the unregistered rows',
  /selectedEntries/.test(forceGet)
  && /readyEntries/.test(forceGet)
  && /not registered yet\)/.test(forceGet)
  && /readyItems\.length \+ readyEntries\.length/.test(forceGet));
check('submitting sends them as their own list, separate from the student items',
  /submitForceGet\(activityId, items, explanation\.trim\(\) \|\| undefined, entries\)/.test(forceGet)
  && /reviseForceGet\(Number\(pending\.id\), items, explanation\.trim\(\) \|\| undefined, entries\)/.test(forceGet));
const fgClientLib = src('src/lib/cgm.ts');
check('the client types the unregistered rows and the entry input',
  /export interface ForceGetUnregisteredRow/.test(fgClientLib)
  && /export interface ForceGetEntryInput \{ rosterEntryId: number; groupId: number \}/.test(fgClientLib)
  && /unregistered\?: ForceGetUnregisteredRow\[\]/.test(fgClientLib));
const activitiesRoute = src('functions/lib/cgm/routes-activities.ts');
check('the backend roster returns every unregistered roster row of the class',
  /re\.status = 'unregistered' AND re\.student_id IS NULL/.test(activitiesRoute)
  && /unregisteredCount: unregistered\.length/.test(activitiesRoute)
  && /reservation: reservation \?/.test(activitiesRoute));
check('a roster row cannot be forced twice, or forced after it registered',
  /appears twice in the same request/.test(activitiesRoute)
  && /already be registered; choose that student from Members instead/.test(activitiesRoute)
  && /Every unregistered row needs a roster entry/.test(activitiesRoute));
check('a selected-only activity shows the rows but refuses to force them',
  /eligible: config\.eligibility !== 'selected'/.test(activitiesRoute)
  && /was never selected/.test(activitiesRoute)
  && /this activity only includes selected students/.test(activitiesRoute));
check('approval holds a seat instead of inventing a student identity',
  /reserveRosterEntry\(c\.env\.DB/.test(activitiesRoute)
  && /cgm\.force_get\.reserved_roster_row/.test(activitiesRoute));
const fgLib = src('functions/lib/cgm/forceGet.ts');
check('the held seat competes for capacity and gender exactly like a designation',
  /cgm_force_get_reservations/.test(fgLib)
  && /seats held for students who are on the roster/.test(fgLib)
  && /export const reserveRosterEntry/.test(fgLib)
  && /export const convertReservationsForEntry/.test(fgLib));
check('registering converts the held seat into that student\'s own designation',
  /convertReservationsForEntry\(c\.env\.DB/.test(src('functions/lib/cgm/routes-student.ts'))
  && /convertReservationsForEntry\(c\.env\.DB/.test(src('functions/lib/cgm/routes-organizer.ts'))
  && /cgm\.force_get\.reservation_converted/.test(fgLib));
check('PHANTOM sees the unregistered row in the destination group it was proposed for',
  /unregistered: true/.test(activitiesRoute)
  && /cgm-phantom-force-get-unregistered/.test(phantom)
  && /the seat is held and becomes theirs when they register/.test(phantom));

section('26. PHANTOM attention: a number on every tab, cleared when PHANTOM looks');

const phantomPanel = src('src/components/ClassGroups/PhantomClasses.tsx');
check('the panel asks the server for its attention board and reloads it on refresh',
  /cgm\.phantomAttention\(\)/.test(phantomPanel)
  && /const loadAttention = useCallback/.test(phantomPanel)
  && /void loadOverview\(\); void loadAttention\(\);/.test(phantomPanel)
  && /void loadOverview\(\); void loadTab\(tab\); void loadAttention\(\);/.test(phantomPanel));
check('opening a section marks it seen, so its number clears',
  /cgm\.phantomAttentionSeen\(which\)/.test(phantomPanel)
  && /void markSeen\(tab\);/.test(phantomPanel)
  && /I have looked at this section/.test(phantomPanel));
check('the embedded pill row (the Classes view) shows the per-tab number',
  /phantom-tab-badge-/.test(phantomPanel)
  && /phantom-tab-\$\{key\}/.test(phantomPanel)
  && /const badge = tabBadge\(attention, key\);/.test(phantomPanel)
  && /data-testid=\{`phantom-tab-badge-/.test(phantomPanel));
check('the sidenav shows the same number for every section, not five hard-coded ones',
  /data-testid=\{`phantom-nav-badge-\$\{key\}`\}/.test(phantomPanel)
  && !/overview\?\.queues\?\.rechoose/.test(phantomPanel)
  && !/overview\?\.queues\?\.disputes/.test(phantomPanel));
check('the number is new arrivals only, and undecided work keeps a dot instead',
  /badge && Boolean\(badge\.unseen\)/.test(phantomPanel)
  && /phantom-tab-waiting-/.test(phantomPanel)
  && /phantom-nav-waiting-/.test(phantomPanel)
  && /new since you last opened this/.test(phantomPanel)
  && /still waiting \(nothing new\)/.test(phantomPanel));
const attentionClient = src('src/lib/cgm.ts');
check('the client exposes the attention board and the mark-seen call',
  /phantomAttention: \(\) => memberCall\('\/api\/cgm\/phantom\/attention'\)/.test(attentionClient)
  && /phantomAttentionSeen: \(tab: string\) =>/.test(attentionClient)
  && /\/api\/cgm\/phantom\/attention\/\$\{encodeURIComponent\(tab\)\}\/seen/.test(attentionClient));
check('the server serves the board and clears one section at a time',
  /app\.get\('\/api\/cgm\/phantom\/attention'/.test(activitiesRoute)
  && /app\.post\('\/api\/cgm\/phantom\/attention\/:tab\/seen'/.test(activitiesRoute)
  && /markPhantomTabSeen\(c\.env\.DB/.test(activitiesRoute)
  && /requireCgmPhantom\(c\)/.test(activitiesRoute.split("'/api/cgm/phantom/attention'")[1]?.slice(0, 400) || ''));
check('the Overview keeps the live backlog, since the tab numbers clear on view',
  /Waiting on you/.test(phantomPanel)
  && /phantom-overview-queue-/.test(phantomPanel)
  && /nothing waiting can go unseen/.test(phantomPanel)
  && /attention\?\.totalPending/.test(phantomPanel));
const attentionLib = src('functions/lib/cgm/attention.ts');
const attentionLib2 = src('functions/lib/cgm/attention.ts');
const moveWorkspace = src('src/components/ClassGroups/ClassGroupsWorkspace.tsx');
check('every oversight section is described once, with where its number comes from',
  /PHANTOM_ATTENTION_TABS/.test(attentionLib)
  && ['overview', 'policies', 'applications', 'classes', 'sensitive', 'rechoose', 'moves', 'force-get', 'delegation', 'disputes', 'organizers', 'audit']
    .every((key) => new RegExp(`key: '${key}'`).test(attentionLib))
  && /queue: true/.test(attentionLib) && /queue: false/.test(attentionLib));
check('the seen watermark is per PHANTOM account and per tab (row ids, not timestamps)',
  /PRIMARY KEY\(member_profile_id, tab_key\)/.test(attentionLib)
  && /last_seen_id/.test(attentionLib)
  && /ON CONFLICT\(member_profile_id, tab_key\) DO UPDATE SET/.test(attentionLib));
const communityHub = src('src/components/CommunityHub.tsx');
check('the PHANTOM inbox lists the Class & Groups stream like every other channel',
  /\['class_groups', '🏛️ Class & Groups'\]/.test(communityHub)
  && (communityHub.match(/class_groups/g) || []).length >= 2);
check('Class & Groups is a real inbox channel, so PHANTOM is notified as well as badged',
  /key: 'class_groups'/.test(src('functions/lib/phantom-inbox.ts'))
  && /channel: 'class_groups'/.test(activitiesRoute)
  && /recordPhantomInboxItem\(c\.env\.DB/.test(activitiesRoute));
check('a re-choose request, a sensitive change and a dispute each raise a PHANTOM notice',
  /source: 'cgm_rechoose'/.test(activitiesRoute)
  && /source: 'cgm_profile_change'/.test(src('functions/lib/cgm/routes-student.ts'))
  && /source: 'cgm_report'/.test(src('functions/lib/cgm/routes-student.ts')));
check('the class & group table count is pinned for the attention watermark',
  /cgm_phantom_attention/.test(src('functions/lib/cgm/schema.ts'))
  && /code-rx29-phantom-attention/.test(src('functions/lib/schema.ts')));

section("27. Moves & swaps: PHANTOM decides, and a decision stays visible");

check('the oversight panel has a Moves & swaps tab that lists the queue',
  /\['moves', 'Moves & swaps'\]/.test(phantomPanel)
  && /moves: \(\) => cgm\.phantomMoveRequests\(\)/.test(phantomPanel)
  && /tab === 'moves'/.test(phantomPanel)
  && /data-testid="cgm-phantom-approve-move"/.test(phantomPanel)
  && /data-testid="cgm-phantom-reject-move"/.test(phantomPanel));
check('an approved move says so — with who approved it and when it was applied',
  /Approved\{row\.reviewerLabel/.test(phantomPanel)
  && /applied \$\{formatWhen\(row\.appliedAt\)\}/.test(phantomPanel)
  && /the change is live/.test(phantomPanel)
  && /Nobody moved\./.test(phantomPanel));
check('a swap shows both members and both groups before PHANTOM decides',
  /swapping with \$\{row\.partnerName\}/.test(phantomPanel)
  && /partnerFromGroupName/.test(phantomPanel));
check('the module settings expose moving & swapping as a process PHANTOM controls',
  /key: 'move_approval_mode'/.test(phantomPanel)
  && /Moving & swapping members/.test(phantomPanel)
  && /Wait for PHANTOM approval/.test(phantomPanel)
  && /Apply immediately/.test(phantomPanel));
check('the client can queue and decide moves',
  /phantomMoveRequests: \(status = 'all'\)/.test(attentionClient)
  && /phantomDecideMove: \(id: number, decision: 'approve' \| 'reject'/.test(attentionClient)
  && /\/api\/cgm\/phantom\/move-requests\/\$\{id\}\/\$\{decision\}/.test(attentionClient));
check('the decided queues are read in full, so an approval never vanishes',
  /phantomForceGetRequests: \(status = 'all'\)/.test(attentionClient)
  && /phantomRechooseRequests: \(status = 'all'\)/.test(attentionClient)
  && /phantomSensitiveChanges: \(status = 'all'\)/.test(attentionClient));
check('the server lists decided rows first-class, pending work ordered first',
  /WHERE \(\? = 'all' OR r\.status = \?\)/.test(activitiesRoute)
  && /CASE WHEN r\.status = 'pending' THEN 0 ELSE 1 END/.test(activitiesRoute)
  && /WHERE \(\? = 'all' OR pcr\.status = \?\)/.test(activitiesRoute));
check('every decided row carries its verdict, reviewer and moment',
  /toUpperCase\(\)\}\{row\.reviewerLabel/.test(phantomPanel)
  && /row\.reviewedAt/.test(phantomPanel)
  && /Approved\{row\.reviewerLabel \? ` by \$\{row\.reviewerLabel\}` : ''\}/.test(phantomPanel));
check('the server never applies an organizer move or swap without PHANTOM',
  /move_approval_mode/.test(activitiesRoute)
  && /!member\.isPhantom && await modulePolicy\(c\.env\.DB, 'move_approval_mode'\) === 'approval'/.test(activitiesRoute)
  && (activitiesRoute.match(/queueMoveRequest\(c, \{/g) || []).length >= 2
  && /applyMemberMove\(c, member, activity, studentId, groupId\)/.test(activitiesRoute)
  && /applyMemberSwap\(c, member, activity, studentAId, studentBId\)/.test(activitiesRoute));
check('an approved request is applied through exactly the same code path',
  /decideMoveRequest/.test(activitiesRoute)
  && /\/api\/cgm\/phantom\/move-requests\/\:id\/approve/.test(activitiesRoute)
  && /await applyMemberSwap\(c, member, activity, Number\(request\.student_id\)/.test(activitiesRoute)
  && /await applyMemberMove\(c, member, activity, Number\(request\.student_id\)/.test(activitiesRoute));
check('a queued move tells PHANTOM through the notice system and the attention badge',
  /source: 'cgm_move'/.test(activitiesRoute)
  && /key: 'moves', label: 'Moves & swaps', queue: true/.test(attentionLib2));
check('the workspace reports the server\'s answer instead of claiming the member moved',
  /const moveNotice = \(result: any, applied: string\)/.test(moveWorkspace)
  && /moveNotice\(result, 'Member moved\.'\)/.test(moveWorkspace)
  && /moveNotice\(result, 'Members swapped\.'\)/.test(moveWorkspace)
  && /the member stays where they are until PHANTOM approves the move/.test(activitiesRoute));

section('28. One listing rule: the latest five, then "view more"');

const recentItems = src('src/components/RecentItems.tsx');
check('one shared primitive owns the rule, and its preview is five',
  /export const LIST_PREVIEW = 5;/.test(recentItems)
  && /limit = LIST_PREVIEW/.test(recentItems)
  && /View more — \$\{remaining\} more/.test(recentItems)
  && /aria-expanded=\{expanded\}/.test(recentItems)
  && /data-testid=\{testId\}/.test(recentItems));
check('every oversight list uses it — no list dumps every row',
  /<RecentItems\s/.test(phantomPanel)
  && /items=\{rows \|\| \[\]\}/.test(phantomPanel)
  && !/\{\(rows \|\| \[\]\)\.map\(/.test(phantomPanel));
const listSurfaces = [
  ['src/components/CommunityHub.tsx', 5],
  ['src/components/ClassGroups/ClassGroupsWorkspace.tsx', 1],
  ['src/components/ClassGroups/StudentPortal.tsx', 4],
  ['src/components/ClientAccessCenter.tsx', 2],
  ['src/components/AdminPanel.tsx', 1],
  ['src/components/NotificationCenter.tsx', 1],
  ['src/components/PhantomControlCenter.tsx', 4],
];
for (const [file, minimum] of listSurfaces) {
  const body = src(file);
  check(`${file.split('/').pop()} lists through the shared rule`, (body.match(/<RecentItems/g) || []).length >= minimum,
    `${(body.match(/<RecentItems/g) || []).length} < ${minimum}`);
}
check('the recycle bin is not exempt — it follows the same rule',
  !/limit=\{items\.length\}/.test(src('src/components/PhantomControlCenter.tsx')));
check('the copy no longer promises "three" anywhere it used to',
  !/newest three/i.test(src('src/components/PhantomControlCenter.tsx'))
  && !/Three recent notifications/i.test(src('src/components/NotificationCenter.tsx')));

section('29. The audit trail shows real facts, never dashes');

check('the audit list reads the fields the API actually returns',
  /const auditActor = \(row: any\) => row\.actor \|\| row\.actor_label/.test(phantomPanel)
  && /row\.entityType \|\| row\.entity_type/.test(phantomPanel)
  && /row\.createdAt \|\| row\.created_at/.test(phantomPanel));
check('every row names the actor, the target and the moment',
  /\{auditActor\(row\)\} · \{auditTarget\(row\)\}/.test(phantomPanel)
  && /formatWhen\(auditWhen\(row\)\)/.test(phantomPanel));
check('a row with no entity still says what it was about instead of "—"',
  /module-wide/.test(phantomPanel)
  && !/target \{row\.entity_type \|\| '—'\}/.test(phantomPanel));
check('the audit API returns camelCase that matches it',
  /actorType: row\.actor_type, actor: row\.actor_label/.test(activitiesRoute)
  && /entityType: row\.entity_type, entityId: row\.entity_id/.test(activitiesRoute)
  && /createdAt: row\.created_at/.test(activitiesRoute));

section('30. Removals are PHANTOM decisions, decisions are race-safe, organizers hear back');

check('removal goes through the same queue and the same apply path',
  /if \(!member\.isPhantom && await modulePolicy\(c\.env\.DB, 'move_approval_mode'\) === 'approval'\) \{\n      const activity = await activityCore/.test(activitiesRoute)
  && /applyMemberRemoval\(c, member, live\[0\], request\.reason\)/.test(activitiesRoute)
  && /kind: 'remove'/.test(activitiesRoute)
  && /kind IN \('move','swap','remove'\)/.test(src('functions/lib/cgm/schema.ts')));
check('a decision is claimed before it is applied, and released if the roster refuses it',
  /UPDATE cgm_move_requests SET status = 'approved'[\s\S]{0,200}WHERE id = \? AND status = 'pending'/.test(activitiesRoute)
  && /SET status = 'pending', reviewer_label = NULL[\s\S]{0,160}applied_at IS NULL/.test(activitiesRoute)
  && /Somebody already decided this request\./.test(activitiesRoute));
check('the organizer who asked is told the outcome',
  /const notifyMoveRequester = async/.test(activitiesRoute)
  && /Your \$\{request\.kind\} request was approved/.test(activitiesRoute)
  && /Your \$\{request\.kind\} request was not approved/.test(activitiesRoute));
check('the member row shows the pending request in place',
  /moveStatus: row\.move_status \|\| null/.test(activitiesRoute)
  && /data-testid="cgm-member-move-pending"/.test(moveWorkspace)
  && /awaiting PHANTOM/.test(moveWorkspace));
check('the attention board is one statement, not one query per tab',
  /const BOARD_SQL =/.test(attentionLib2)
  && /SELECT\\n  \$\{columns\.join/.test(attentionLib2)
  && /BOARD_SQL\.match\(\/\\\?\/g\)/.test(attentionLib2));
// D1 refuses a compound SELECT with more than five terms, so the board must not
// be built as a UNION ALL chain — that is what silently zeroed every badge.
check('the board avoids a compound SELECT D1 would reject',
  !/UNION ALL\\n/.test(attentionLib2) && !/'\\n  UNION ALL/.test(attentionLib2)
  && /\$\{tab\.key\}_unseen/.test(attentionLib2)
  && /FROM cgm_phantom_attention WHERE member_profile_id = \? AND tab_key/.test(attentionLib2));
check('badges carry a screen-reader label',
  /aria-label=\{`\$\{badge\.unseen\} new \$\{badge\.unseen === 1 \? 'item' : 'items'\} in \$\{text\}`\}/.test(phantomPanel));
check('the test helper refuses a reused index number instead of lying',
  /reuses the taken index number/.test(src('scripts/cgm-tests.mjs')));

section('31. A crowded panel keeps one honest number instead of a wall of chips');

check('the section strip scrolls sideways instead of stacking twelve chips',
  /data-testid="phantom-tabstrip"/.test(phantomPanel)
  && /overflow-x-auto/.test(phantomPanel)
  && /md:flex-wrap/.test(phantomPanel)
  && /role="tablist"/.test(phantomPanel));
check('one chip carries the work still waiting across every queue',
  /data-testid="phantom-queue-chip"/.test(phantomPanel)
  && /Queues \(\{queueWaiting\}\)/.test(phantomPanel)
  && /const queueWaiting = tabQueueTotal\(attention\)/.test(phantomPanel)
  && /const QUEUE_TABS: Tab\[\] = \['applications', 'classes', 'sensitive', 'rechoose', 'moves', 'force-get', 'disputes'\]/.test(phantomPanel));
check('the chip opens the first queue that has something waiting',
  /const openFirstQueue = \(\) => \{/.test(phantomPanel)
  && /QUEUE_TABS\.find\(\(key\) => Number\(tabBadge\(attention, key\)\?\.pending \|\| 0\) > 0\)/.test(phantomPanel)
  && /setTab\(waiting \|\| QUEUE_TABS\[0\]\)/.test(phantomPanel)
  && /onClick=\{openFirstQueue\}/.test(phantomPanel));
check('the chip and the strip announce themselves to a screen reader',
  /aria-label=\{queueWaiting/.test(phantomPanel)
  && /aria-label="PHANTOM sections"/.test(phantomPanel));

section('32. The control-center navigation carries the same numbers');

const controlCenter = src('src/components/PhantomControlCenter.tsx');
const navAttentionLib = src('functions/lib/phantom-attention.ts');

check('every navigation tab can show what arrived since PHANTOM last opened it',
  /data-testid=\{`phantom-nav-badge-\$\{id\}`\}/.test(controlCenter)
  && /data-testid=\{`phantom-nav-waiting-\$\{id\}`\}/.test(controlCenter)
  && /aria-label=\{unseen \? `\$\{label\} — \$\{unseen\} new` : label\}/.test(controlCenter));
check('opening a tab is what clears its number — not scrolling past it',
  /const openTab = async \(target: Tab\) => \{/.test(controlCenter)
  && /db\.phantom\.markNavAttentionSeen\(target\)/.test(controlCenter)
  && /if \(!section\?\.markable\) return;/.test(controlCenter));
check('Class Groups is the sum of its sections and Overview the grand total',
  /\{ key: 'classgroups', label: 'Class Groups', derive: 'class-groups' \}/.test(navAttentionLib)
  && /unseen\.set\('classgroups', Number\(board\.totalUnseen \|\| 0\)\)/.test(navAttentionLib)
  && /if \(overview\) overview\.unseen = totalUnseen;/.test(navAttentionLib));
check('the navigation counts are one statement, never a compound SELECT',
  /const NAV_SQL =/.test(navAttentionLib)
  && !/UNION ALL\n/.test(navAttentionLib)
  && /NAV_WATERMARK_PREFIX = 'nav:'/.test(navAttentionLib)
  && /cgm_phantom_attention WHERE member_profile_id = \? AND tab_key/.test(navAttentionLib));
check('the badge API is wired through the client and refuses a derived tab',
  /navAttention: async \(\) =>/.test(src('src/lib/cloudflare.ts'))
  && /markNavAttentionSeen: async \(key: string\)/.test(src('src/lib/cloudflare.ts'))
  && /app\.post\('\/api\/phantom\/attention\/:key\/seen'/.test(src('functions/[[path]].ts'))
  && /code: 'UNKNOWN_SECTION'/.test(src('functions/[[path]].ts')));
check('the class-groups panel tells the control center when a section is opened',
  /onAttentionChange\?: \(\) => void/.test(phantomPanel)
  && /onAttentionChange\?\.\(\);/.test(phantomPanel)
  && /onAttentionChange=\{loadNavAttention\}/.test(controlCenter));

section('33. Elections use every member, and every delete can be reversed');

const recycleLib = src('functions/lib/cgm/recycle.ts');
const organizerRoutes = src('functions/lib/cgm/routes-organizer.ts');

check('ALL puts the whole group on the ballot instead of waiting for volunteers',
  /const seeded = eligibleMode === 'all' \? await seedAllCandidates\(c\.env\.DB, newElectionId, groupId\) : 0;/.test(activitiesRoute)
  && /if \(Number\(candidates\[0\]\?\.c \|\| 0\) === 0 && String\(election\.eligible_mode \|\| 'all'\) === 'all'\)/.test(activitiesRoute)
  && /INSERT INTO cgm_candidates \(election_id, student_id, statement\) VALUES \(\?, \?, NULL\)/.test(activitiesRoute)
  && /const seedAllCandidates = async/.test(activitiesRoute)
  && /candidatesSeeded: seeded/.test(activitiesRoute));
check('the form states what will actually happen, with real counts',
  /ALL — \$\{groupMembers\.length\} active member\(s\) of this group will be placed on the ballot/.test(workspace)
  && /CUSTOMIZE — only the \$\{chosenIds\.size\} member\(s\) you ticked may stand/.test(workspace)
  && /CUSTOMIZE — tick exactly who may stand as a candidate\. Nothing is placed on the ballot for you\./.test(workspace));
check('hand-picked members are cleared when the group changes',
  /setChosenIds\(new Set\(\)\);\n    if \(!selectedGroupId\)/.test(workspace));
check('the ALL choice says what it does, in the form itself',
  /ALL puts every current member of the chosen group on the ballot the moment you create the election/.test(workspace)
  && /every group member goes on the ballot/.test(workspace)
  && /all \$\{seeded\} member\(s\) of the group are on the ballot/.test(workspace));
check('an election record can be deleted from the page, with a reason',
  /data-testid=\{`cgm-election-delete-\$\{election\.id\}`\}/.test(workspace)
  && /Delete election/.test(workspace)
  && /cgm\.deleteElection\(Number\(entry\.election\.id\), String\(extra\?\.reason/.test(workspace));
check('Close and Cancel stay exactly where they were',
  /onAction\('close'\)/.test(workspace) && /onAction\('cancel', \{ reason \}\)/.test(workspace));
check('the delete route snapshots the whole record before removing it',
  /app\.delete\('\/api\/cgm\/elections\/:id',/.test(activitiesRoute)
  && /\{ table: 'cgm_elections', where: 'id = \?', params: \[electionId\] \}/.test(activitiesRoute)
  && /\{ table: 'cgm_election_ballots', where: 'election_id = \?', params: \[electionId\] \}/.test(activitiesRoute)
  && /Record a reason when deleting an election\./.test(activitiesRoute));
check('the Recycle Bin reverses roster rows, members, announcements and templates too',
  /entityType: 'roster_entry'/.test(organizerRoutes)
  && /entityType: 'membership'/.test(organizerRoutes)
  && /entityType: 'announcement'/.test(activitiesRoute)
  && /entityType: 'template'/.test(activitiesRoute)
  && /entityType: 'assignment'/.test(activitiesRoute));
check('restoring is a re-insert of the snapshotted rows, once',
  /INSERT OR REPLACE INTO \$\{group\.table\}/.test(recycleLib)
  && /RESTORABLE_TABLES/.test(recycleLib)
  && /That change was already reversed\./.test(recycleLib)
  && /app\.post\('\/api\/cgm\/recycle-bin\/:id\/restore',/.test(activitiesRoute));
check('the Recycle Bin is its own page in the organizer navigation',
  /\['recycle', 'Recycle Bin', Recycle\]/.test(workspace)
  && /<RecycleArea classId=\{Number\(activeClass\.id\)\} \/>/.test(workspace)
  && /data-testid="cgm-recycle-area"/.test(workspace)
  && /data-testid=\{`cgm-recycle-restore-\$\{item\.id\}`\}/.test(workspace));
check('its list obeys the one listing rule',
  /<RecentItems\s+items=\{items\}\s+label="deleted items"\s+testId="cgm-recycle-list"/.test(workspace));

console.log(`\nCGM UI TESTS: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log('Failures:');
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exitCode = 1;
}
