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
const css = src('src/index.css');

// ===========================================================================
section('1. The dedicated navigation entry exists exactly once');
check('the navbar carries the dedicated Class & Groups door to #class-groups',
  /href="#class-groups"/.test(navbar) && /Classes &amp; Groups|Classes & Groups/.test(navbar));
check('the door appears on desktop and in the mobile dropdown',
  (navbar.match(/href="#class-groups"/g) || []).length === 2);
check('the door is titled with the full module name',
  /title="CODE Rx — Class & Group Management"/.test(navbar));

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
check('the import flow validates first, then imports', /Validate file/.test(workspace) && /Import roster/.test(workspace));
check('invitations show the code and QR exactly once at creation',
  /shown only now/.test(workspace) && /QRCode|toDataURL/.test(workspace));
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

console.log(`\nCGM UI TESTS: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log('Failures:');
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exitCode = 1;
}
