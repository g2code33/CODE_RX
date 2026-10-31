import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, Archive, Bell, CalendarDays, ClipboardList, GraduationCap, KeyRound, Layers, ListChecks,
  Megaphone, Plus, RefreshCw, Settings, ShieldCheck, UserCheck, Users, Vote, FileText, X,
} from 'lucide-react';
import * as QRCode from 'qrcode';
import {
  cgm, downloadReport, downloadRosterTemplate, importRosterFile, previewRosterFile,
} from '../../lib/cgm';
import { appDialog } from '../AppDialog';
import { ConnectionBanner } from './ConnectionBanner';

/**
 * CODE Rx — Class & Group Management (organizer workspace).
 *
 * One workspace for every class a member organizes; every class keeps its own
 * permissions, roster, activities, groups, elections, attendance and history.
 * Navigation shows only what the caller's server-verified permissions allow.
 */

type Area =
  | 'overview' | 'classes' | 'students' | 'invitations' | 'activities' | 'groups' | 'elections'
  | 'leadership' | 'attendance' | 'calendar' | 'announcements' | 'notifications' | 'reports'
  | 'templates' | 'approvals' | 'permissions' | 'archives' | 'settings';

const AREAS: Array<[Area, string, any]> = [
  ['overview', 'Overview', Activity],
  ['classes', 'My Classes', GraduationCap],
  ['students', 'Students', Users],
  ['invitations', 'Class Invitations', KeyRound],
  ['activities', 'Grouping Activities', Layers],
  ['groups', 'Groups', Users],
  ['elections', 'Elections', Vote],
  ['leadership', 'Leadership', ShieldCheck],
  ['attendance', 'Attendance', ClipboardList],
  ['calendar', 'Calendar', CalendarDays],
  ['announcements', 'Announcements', Megaphone],
  ['notifications', 'Notifications', Bell],
  ['reports', 'Reports', FileText],
  ['templates', 'Templates', Layers],
  ['approvals', 'Approvals', ListChecks],
  ['permissions', 'Permissions', ShieldCheck],
  ['archives', 'Archives', Archive],
  ['settings', 'Settings', Settings],
];

const card = 'rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm shadow-emerald-950/5';
const label = 'text-[10px] font-black uppercase tracking-[0.16em] text-slate-400';
const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 focus:border-emerald-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-100';

const formatDate = (value: unknown) => {
  if (!value) return '—';
  const date = new Date(String(value).replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

export const ClassGroupsWorkspace = ({ onExit }: { onExit: () => void }) => {
  const [status, setStatus] = useState<any>(null);
  const [classes, setClasses] = useState<any[]>([]);
  const [activeClassId, setActiveClassId] = useState<number | null>(null);
  const [area, setArea] = useState<Area>('overview');
  const [loading, setLoading] = useState(true);
  const [navOpen, setNavOpen] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [organizerStatus, myClasses] = await Promise.all([cgm.organizerStatus(), cgm.myClasses()]);
      // The client unwraps `data`, so myClasses() resolves to the row array
      // itself (older wrapped shape tolerated defensively).
      const myClassRows: any[] = Array.isArray(myClasses) ? myClasses : (myClasses?.classes || []);
      setStatus(organizerStatus);
      setClasses(myClassRows);
      setActiveClassId((current) => {
        if (current && myClassRows.some((entry: any) => Number(entry.id) === current)) return current;
        return myClassRows[0] ? Number(myClassRows[0].id) : null;
      });
    } catch {
      setStatus(null);
      setClasses([]);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const activeClass = classes.find((entry) => Number(entry.id) === activeClassId) || null;
  const permissions = new Set<string>(activeClass?.permissions || []);
  const delegated = activeClass ? (status?.delegatedClassIds || []).map(Number).includes(Number(activeClass.id)) : false;
  const can = (permission: string) => !activeClass || activeClass.role === 'primary' || activeClass.role === 'phantom' || permissions.has(permission);
  // Registration approvals also open for members PHANTOM delegated to this class.
  const canApprovals = can('approve_registrations') || can('approve_memberships') || can('review_profile_changes') || delegated;

  const visibleAreas = useMemo(() => AREAS.filter(([key]) => {
    if (['overview', 'classes', 'templates', 'notifications'].includes(key)) return true;
    if (!activeClass) return false;
    switch (key) {
      case 'students': return can('view_roster');
      case 'invitations': return can('manage_invitations');
      case 'activities': case 'groups': return can('manage_activities') || can('generate_groups');
      case 'elections': return can('manage_elections');
      case 'leadership': return can('appoint_leaders') || can('manage_elections');
      case 'attendance': return can('manage_attendance');
      case 'calendar': return true;
      case 'announcements': return can('manage_announcements');
      case 'reports': return can('generate_reports') || can('view_roster');
      case 'approvals': return canApprovals;
      case 'permissions': return can('manage_class_settings');
      case 'archives': return can('archive_activities') || can('view_roster');
      case 'settings': return can('manage_class_settings');
      default: return true;
    }
  }), [activeClassId, activeClass]);

  if (loading) {
    return <div className="cgm-auth-wrap"><div className={card}><p className="text-sm font-semibold text-slate-400">Loading Class &amp; Group Management…</p></div></div>;
  }

  const application = status?.application;
  const showApplication = !classes.length && (!application || !['approved'].includes(String(application.status)));

  return (
    <div className="cgm-shell">
      <ConnectionBanner />
      <header className="cgm-topbar">
        <div className="flex items-center gap-3">
          <button type="button" className="cgm-nav-toggle" onClick={() => setNavOpen((open) => !open)} aria-expanded={navOpen} aria-label="Toggle navigation">
            <Users className="h-4 w-4" />
          </button>
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-600 text-white"><GraduationCap className="h-5 w-5" /></span>
          <div>
            <p className="text-sm font-black text-slate-900">CODE Rx — Class &amp; Group Management</p>
            <p className="text-[11px] font-semibold text-slate-400">
              {activeClass ? `${activeClass.name} · ${activeClass.code}` : 'Organizer workspace'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activeClass && (
            <select
              className="mini-button max-w-44 truncate"
              value={activeClassId ?? ''}
              onChange={(event) => setActiveClassId(Number(event.target.value) || null)}
              aria-label="Switch class"
            >
              {classes.map((entry) => <option key={entry.id} value={Number(entry.id)}>{entry.name}</option>)}
            </select>
          )}
          <button type="button" className="mini-button" onClick={() => { void refresh(); }} aria-label="Refresh"><RefreshCw className="h-3.5 w-3.5" /></button>
          <button type="button" className="mini-button" onClick={onExit}>Exit</button>
        </div>
      </header>

      <div className="cgm-body">
        <nav className={`cgm-sidenav ${navOpen ? 'cgm-sidenav--open' : ''}`} aria-label="Workspace navigation">
          {visibleAreas.map(([key, text, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => { setArea(key as Area); setNavOpen(false); }}
              aria-current={area === key ? 'page' : undefined}
              className={`cgm-side-link ${area === key ? 'cgm-side-link--active' : ''}`}
            >
              <Icon className="h-4 w-4" />
              <span className="flex-1 text-left">{text}</span>
              {key === 'approvals' && activeClass && Number(activeClass.pendingRegistrations || 0) + Number(activeClass.pendingMemberships || 0) > 0 && (
                <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-black text-white">
                  {Number(activeClass.pendingRegistrations || 0) + Number(activeClass.pendingMemberships || 0)}
                </span>
              )}
            </button>
          ))}
          {!application || application.status !== 'approved' ? (
            <button type="button" onClick={() => setApplyOpen(true)} className="cgm-side-link mt-2 border-t border-emerald-100 pt-3">
              <UserCheck className="h-4 w-4" />
              <span className="flex-1 text-left">Organizer application</span>
            </button>
          ) : null}
        </nav>

        <main className="cgm-main">
          {applyOpen && <OrganizerApplication status={status} onClose={() => setApplyOpen(false)} onDone={() => { setApplyOpen(false); void refresh(); }} />}

          {!activeClass && !showApplication && area === 'overview' && (
            <NoClassView classes={classes} onCreated={() => void refresh()} />
          )}
          {!activeClass && !showApplication && area === 'classes' && (
            classes.length
              ? <ClassesArea classes={classes} activeClassId={activeClassId} onSwitch={setActiveClassId} onCreated={() => void refresh()} />
              : <NoClassView classes={classes} onCreated={() => void refresh()} />
          )}
          {!activeClass && !showApplication && area !== 'overview' && area !== 'classes' && (
            <NoClassPane area={area} onOverview={() => setArea('overview')} />
          )}
          {showApplication && <OrganizerApplication status={status} embedded onDone={() => void refresh()} />}

          {activeClass && area === 'overview' && <OverviewArea classEntry={activeClass} onGo={setArea} />}
          {activeClass && area === 'classes' && <ClassesArea classes={classes} activeClassId={activeClassId} onSwitch={setActiveClassId} onCreated={() => void refresh()} />}
          {activeClass && area === 'students' && can('view_roster') && <StudentsArea classId={Number(activeClass.id)} canEdit={can('edit_roster')} canImport={can('import_roster')} sensitive={activeClass.role === 'primary' || activeClass.role === 'phantom' || permissions.has('view_sensitive_profiles')} onChanged={() => void refresh()} />}
          {activeClass && area === 'invitations' && can('manage_invitations') && <InvitationsArea classId={Number(activeClass.id)} />}
          {activeClass && area === 'activities' && <ActivitiesArea classId={activeClass.id} onChanged={() => void refresh()} />}
          {activeClass && area === 'groups' && <GroupsArea classId={Number(activeClass.id)} canGenerate={can('generate_groups')} canMove={can('move_students')} canRemove={can('remove_students')} canManageWhatsapp={can('manage_whatsapp')} onChanged={() => void refresh()} />}
          {activeClass && area === 'elections' && can('manage_elections') && <ElectionsArea classId={activeClass.id} onChanged={() => void refresh()} />}
          {activeClass && area === 'leadership' && <LeadershipArea classId={activeClass.id} canAppoint={can('appoint_leaders')} onChanged={() => void refresh()} />}
          {activeClass && area === 'attendance' && can('manage_attendance') && <AttendanceArea classId={activeClass.id} onChanged={() => void refresh()} />}
          {activeClass && area === 'calendar' && <CalendarArea classId={activeClass.id} />}
          {activeClass && area === 'announcements' && can('manage_announcements') && <AnnouncementsArea classId={activeClass.id} onChanged={() => void refresh()} />}
          {activeClass && area === 'notifications' && <NotificationsArea classId={activeClass.id} />}
          {activeClass && area === 'reports' && <ReportsArea classId={activeClass.id} />}
          {activeClass && area === 'templates' && <TemplatesArea classId={activeClass.id} onChanged={() => void refresh()} />}
          {activeClass && area === 'approvals' && <ApprovalsArea classId={Number(activeClass.id)} canRegistrations={can('approve_registrations') || delegated} canMemberships={can('approve_memberships')} canProfiles={can('review_profile_changes')} delegated={delegated} onChanged={() => void refresh()} />}
          {activeClass && area === 'permissions' && <PermissionsArea classId={activeClass.id} onChanged={() => void refresh()} />}
          {activeClass && area === 'archives' && <ArchivesArea classId={Number(activeClass.id)} />}
          {activeClass && area === 'settings' && <SettingsArea classId={activeClass.id} onChanged={() => void refresh()} />}
        </main>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

const Banner = ({ tone, children }: { tone: 'success' | 'error' | 'info'; children: React.ReactNode }) => (
  <p role={tone === 'error' ? 'alert' : 'status'} className={`rounded-xl px-4 py-3 text-sm font-semibold ${tone === 'success' ? 'bg-emerald-50 text-emerald-700' : tone === 'error' ? 'bg-red-50 text-red-600' : 'bg-sky-50 text-sky-700'}`}>{children}</p>
);

const EmptyArea = ({ icon: Icon, title, text }: { icon: any; title: string; text: string }) => (
  <div className={`${card} text-center`}>
    <Icon className="mx-auto h-6 w-6 text-emerald-500" />
    <p className="mt-3 text-sm font-black text-slate-800">{title}</p>
    <p className="mt-1 text-xs font-medium text-slate-500">{text}</p>
  </div>
);

const OrganizerApplication = ({ status, embedded, onClose, onDone }: { status: any; embedded?: boolean; onClose?: () => void; onDone?: () => void }) => {
  const [institution, setInstitution] = useState('');
  const [motivation, setMotivation] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const application = status?.application;

  return (
    <div className={`${card} ${embedded ? '' : 'mb-5'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={label}>Organizer application</p>
          <h3 className="mt-1 text-lg font-black text-slate-900">Organize classes through CODE Rx</h3>
        </div>
        {!embedded && onClose && <button type="button" className="mini-button" onClick={onClose} aria-label="Close"><X className="h-3.5 w-3.5" /></button>}
      </div>

      {application && (
        <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm">
          <p className="font-bold text-slate-700">Current application: <span className="uppercase text-emerald-700">{String(application.status).replace('_', ' ')}</span></p>
          {application.institution && <p className="mt-1 text-xs text-slate-500">{application.institution}</p>}
          {application.reviewReason && <p className="mt-1 text-xs font-semibold text-slate-500">PHANTOM: {application.reviewReason}</p>}
          {!application.emailVerified && application.status === 'pending' && (
            <div className="mt-2">
              <p className="text-xs font-bold text-amber-600">Verify your email — use the verification link we emailed you when applying. It expires; resend a fresh one any time.</p>
              <button
                type="button"
                disabled={busy}
                className="mini-button mt-2"
                onClick={async () => {
                  setBusy(true); setError(null); setMessage(null);
                  try {
                    const result: any = await cgm.resendOrganizerVerification();
                    setMessage(String(result?.message || 'Verification email sent.'));
                  } catch (failure: any) { setError(failure?.message || 'Could not resend the verification email.'); }
                  finally { setBusy(false); }
                }}
              >
                Resend verification email
              </button>
            </div>
          )}
        </div>
      )}

      {(!application || ['rejected', 'correction', 'revoked'].includes(String(application.status))) && (
        <form
          className="mt-4 space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true); setError(null); setMessage(null);
            try {
              const result = await cgm.applyOrganizer({ institution, motivation: motivation || undefined });
              setMessage(String((result as any)?.message || 'Application received.'));
              onDone?.();
            } catch (failure: any) { setError(failure?.message || 'The application failed.'); }
            finally { setBusy(false); }
          }}
        >
          <div>
            <label className={label} htmlFor="cgm-apply-institution">Institution</label>
            <input id="cgm-apply-institution" required className={`${inputClass} mt-1`} value={institution} onChange={(event) => setInstitution(event.target.value)} />
          </div>
          <div>
            <label className={label} htmlFor="cgm-apply-motivation">Why do you want to organize? (optional)</label>
            <textarea id="cgm-apply-motivation" className={`${inputClass} mt-1 min-h-20`} value={motivation} onChange={(event) => setMotivation(event.target.value)} />
          </div>
          <button type="submit" disabled={busy} className="cgm-primary-button">{busy ? 'Submitting…' : 'Submit application'}</button>
          {message && <Banner tone="info">{message}</Banner>}
          {error && <Banner tone="error">{error}</Banner>}
        </form>
      )}
    </div>
  );
};

/**
 * Shown when a sidebar area needs a class but none exists yet. Every door the
 * user can click must open SOMETHING — never a frozen pane.
 */
const NoClassPane = ({ area, onOverview }: { area: Area; onOverview: () => void }) => {
  const areaLabel = AREAS.find(([key]) => key === area)?.[1] || 'This area';
  const guidance: Partial<Record<Area, string>> = {
    notifications: 'Organizer notifications arrive per class — registration decisions, queue news and PHANTOM messages land here once your first class exists.',
    templates: 'Templates store an activity’s configuration so you can reuse it in one click. They live inside a class, so create your first class first.',
  };
  return (
    <div className={card}>
      <p className={label}>Nothing here yet</p>
      <h2 className="mt-1 text-xl font-black text-slate-900">{areaLabel}</h2>
      <p className="mt-2 max-w-xl text-sm font-medium text-slate-500">
        {guidance[area] || `${areaLabel} works inside one of your classes. Create your first class — once PHANTOM approves it, this area unlocks with everything in its place.`}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="cgm-primary-button" onClick={onOverview}>Create your first class</button>
      </div>
    </div>
  );
};

// Shared draft-creation form — reachable both from the empty state and from
// My Classes, so an organizer with classes can still create new ones.
const CreateClassForm = ({ onCreated, idPrefix = 'cgm-new', defaultOpen = false }: { onCreated: () => void; idPrefix?: string; defaultOpen?: boolean }) => {
  const [open, setOpen] = useState(defaultOpen);
  const [form, setForm] = useState({ name: '', institution: '', department: '', academicYear: '', level: '', description: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button type="button" onClick={() => setOpen((value) => !value)} className="cgm-primary-button mt-4">
        <Plus className="mr-1 inline h-4 w-4" /> {open ? 'Hide form' : 'Create a class draft'}
      </button>
      {open && (
        <form
          className={`${card} space-y-3 mt-4`}
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true); setError(null);
            try {
              await cgm.createClass(form);
              setOpen(false);
              setForm({ name: '', institution: '', department: '', academicYear: '', level: '', description: '' });
              onCreated();
            } catch (failure: any) { setError(failure?.message || 'The class could not be created.'); }
            finally { setBusy(false); }
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className={label} htmlFor={`${idPrefix}-name`}>Class name *</label><input id={`${idPrefix}-name`} required className={`${inputClass} mt-1`} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div>
            <div><label className={label} htmlFor={`${idPrefix}-institution`}>Institution *</label><input id={`${idPrefix}-institution`} required className={`${inputClass} mt-1`} value={form.institution} onChange={(event) => setForm({ ...form, institution: event.target.value })} /></div>
            <div><label className={label} htmlFor={`${idPrefix}-dept`}>Department</label><input id={`${idPrefix}-dept`} className={`${inputClass} mt-1`} value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} /></div>
            <div><label className={label} htmlFor={`${idPrefix}-year`}>Academic year</label><input id={`${idPrefix}-year`} className={`${inputClass} mt-1`} value={form.academicYear} onChange={(event) => setForm({ ...form, academicYear: event.target.value })} placeholder="2026/2027" /></div>
            <div><label className={label} htmlFor={`${idPrefix}-level`}>Level</label><input id={`${idPrefix}-level`} className={`${inputClass} mt-1`} value={form.level} onChange={(event) => setForm({ ...form, level: event.target.value })} placeholder="Year 2 / Level 300" /></div>
          </div>
          <div><label className={label} htmlFor={`${idPrefix}-desc`}>Description</label><textarea id={`${idPrefix}-desc`} className={`${inputClass} mt-1 min-h-20`} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></div>
          <button type="submit" disabled={busy} className="cgm-primary-button">{busy ? 'Creating…' : 'Create draft'}</button>
          {error && <Banner tone="error">{error}</Banner>}
        </form>
      )}
    </>
  );
};

const NoClassView = ({ classes, onCreated }: { classes: any[]; onCreated: () => void }) => (
  <div className={card}>
    <p className={label}>My classes</p>
    <h2 className="mt-1 text-xl font-black text-slate-900">{classes.length ? 'Choose a class' : 'Create your first class'}</h2>
    {classes.length ? (
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {classes.map((entry) => (
          <div key={entry.id} className="rounded-xl border border-slate-100 px-4 py-3">
            <p className="font-black text-slate-900">{entry.name}</p>
            <p className="mt-0.5 text-xs font-semibold text-slate-500">{entry.code} · {entry.status} · {entry.role.replace('_', ' ')}</p>
          </div>
        ))}
      </div>
    ) : (
      <p className="mt-2 text-sm font-medium text-slate-500">A class starts as a draft. PHANTOM approves it before students can join.</p>
    )}
    <CreateClassForm onCreated={onCreated} />
  </div>
);

const OverviewArea = ({ classEntry, onGo }: { classEntry: any; onGo: (area: Area) => void }) => (
  <div className="space-y-5">
    <div className={card}>
      <p className={label}>{classEntry.code}</p>
      <h2 className="mt-1 text-xl font-black text-slate-900">{classEntry.name}</h2>
      <p className="mt-1 text-xs font-semibold text-slate-500">{classEntry.institution} · {classEntry.status} · your role: {String(classEntry.role).replace('_', ' ')}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <div className="rounded-xl bg-emerald-50 p-4"><p className={label}>Members</p><p className="mt-1 text-2xl font-black text-emerald-800">{classEntry.memberCount}</p></div>
        <div className="rounded-xl bg-slate-50 p-4"><p className={label}>Live activities</p><p className="mt-1 text-2xl font-black text-slate-800">{classEntry.activeActivities}</p></div>
        <div className="rounded-xl bg-amber-50 p-4"><p className={label}>Registrations</p><p className="mt-1 text-2xl font-black text-amber-800">{classEntry.pendingRegistrations}</p></div>
        <div className="rounded-xl bg-amber-50 p-4"><p className={label}>Join requests</p><p className="mt-1 text-2xl font-black text-amber-800">{classEntry.pendingMemberships}</p></div>
      </div>
    </div>
    <div className="grid gap-3 sm:grid-cols-3">
      {[['approvals', 'Review approvals', ListChecks], ['activities', 'Grouping activities', Layers], ['invitations', 'Invitations', KeyRound]].map(([key, text, Icon]) => (
        <button key={String(key)} type="button" onClick={() => onGo(key as Area)} className={`${card} text-left transition hover:border-emerald-300`}>
          <Icon className="h-5 w-5 text-emerald-600" />
          <p className="mt-2 text-sm font-black text-slate-800">{text as string}</p>
        </button>
      ))}
    </div>
  </div>
);

const ClassesArea = ({ classes, activeClassId, onSwitch, onCreated }: { classes: any[]; activeClassId: number | null; onSwitch: (id: number) => void; onCreated: () => void }) => {
  const [detail, setDetail] = useState<any>(null);
  useEffect(() => {
    if (activeClassId) void cgm.classDetail(activeClassId).then(setDetail).catch(() => setDetail(null));
  }, [activeClassId]);
  const [creating, setCreating] = useState(false);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className={label}>My classes — tap a card to open it</p>
        {!creating && <button type="button" className="mini-button" onClick={() => setCreating(true)}><Plus className="mr-1 inline h-3.5 w-3.5" />New class</button>}
      </div>
      {creating && <CreateClassForm onCreated={() => { setCreating(false); onCreated(); }} idPrefix="cgm-new-2" defaultOpen />}
      <div className="grid gap-3 sm:grid-cols-2">
        {classes.map((entry) => (
          <button key={entry.id} type="button" onClick={() => onSwitch(Number(entry.id))} className={`${card} text-left transition ${Number(entry.id) === activeClassId ? 'border-emerald-400' : 'hover:border-emerald-300'}`}>
            <p className="font-black text-slate-900">{entry.name}</p>
            <p className="mt-0.5 text-xs font-semibold text-slate-500">{entry.code} · {entry.status}</p>
            <p className="mt-2 text-[11px] font-bold uppercase tracking-wider text-emerald-600">{entry.memberCount} members · {entry.activeActivities} live activities</p>
          </button>
        ))}
      </div>
      {detail && (
        <div className={card}>
          <p className={label}>Class record</p>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl bg-slate-50 px-4 py-3"><dt className={label}>Status</dt><dd className="mt-0.5 text-sm font-bold text-slate-800">{detail.class.status}{detail.class.reviewReason ? ` — ${detail.class.reviewReason}` : ''}</dd></div>
            <div className="rounded-xl bg-slate-50 px-4 py-3"><dt className={label}>Entry password</dt><dd className="mt-0.5 text-sm font-bold text-slate-800">{detail.class.entryPasswordSet ? 'set' : 'not set yet'}</dd></div>
          </dl>
          {detail.class.status === 'draft' && (
            <button
              type="button"
              className="cgm-primary-button mt-4"
              onClick={async () => { try { await cgm.submitClass(Number(detail.class.id)); onCreated(); } catch (failure: any) { /* surfaced by PHANTOM view */ } }}
            >
              Submit for PHANTOM approval
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Students: roster + import
// ---------------------------------------------------------------------------

const StudentsArea = ({ classId, canEdit, canImport, sensitive, onChanged }: { classId: number; canEdit: boolean; canImport: boolean; sensitive: boolean; onChanged: () => void }) => {
  const [tab, setTab] = useState<'roster' | 'members'>('roster');
  const [rows, setRows] = useState<any[] | null>(null);
  const [members, setMembers] = useState<any[] | null>(null);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const rosterData = await cgm.roster(classId, search);
      setRows(rosterData.data || rosterData);
      const memberData = await cgm.members(classId);
      setMembers(memberData.data || memberData);
    } catch (failure: any) { setError(failure?.message || 'The roster could not be loaded.'); }
  }, [classId, search]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {(['roster', 'members'] as const).map((key) => (
          <button key={key} type="button" onClick={() => setTab(key)} className={`rounded-full px-4 py-2 text-xs font-black uppercase tracking-wider transition ${tab === key ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700'}`}>
            {key === 'roster' ? 'Roster' : 'Members'}
          </button>
        ))}
        <div className="ml-auto flex gap-2">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, index, ID, phone…" className={`${inputClass} max-w-56`} aria-label="Search roster" />
          {canImport && <button type="button" className="mini-button" onClick={() => setImportOpen((value) => !value)}>Import file</button>}
        </div>
      </div>

      {message && <Banner tone="success">{message}</Banner>}
      {error && <Banner tone="error">{error}</Banner>}
      {importOpen && canImport && (
        <RosterImport classId={classId} onDone={async (result) => {
          setImportOpen(false);
          setMessage(result ? `Import complete: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped, ${result.invalidRows} invalid.` : null);
          await load(); onChanged();
        }} />
      )}

      {tab === 'roster' && (
        rows === null ? <p className="text-sm font-semibold text-slate-400">Loading…</p> : rows.length === 0
          ? <EmptyArea icon={Users} title="The roster is empty" text="Import an Excel, CSV or JSON file, or add students manually." />
          : <RosterTable rows={rows} sensitive={sensitive} canEdit={canEdit} classId={classId} onChanged={load} />
      )}

      {tab === 'members' && (
        members === null ? <p className="text-sm font-semibold text-slate-400">Loading…</p> : members.length === 0
          ? <EmptyArea icon={UserCheck} title="No members yet" text="Approved registrations and join requests appear here." />
          : (
            <div className={card}>
              <ul className="divide-y divide-slate-100">
                {members.map((member) => (
                  <li key={member.memberId} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div>
                      <p className="text-sm font-black text-slate-800">{member.fullName} <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-black uppercase text-slate-500">{member.gender}</span></p>
                      <p className="text-[11px] font-semibold text-slate-400">{member.indexNumber}{member.phone && sensitive ? ` · ${member.phone}` : ''} · via {member.addedVia}</p>
                    </div>
                    <div className="flex gap-2">
                      {member.status === 'suspended' && <button type="button" className="mini-button" onClick={async () => { await cgm.memberAction(classId, Number(member.memberId), 'restore'); await load(); }}>Restore</button>}
                      <button type="button" className="mini-button" onClick={async () => { await cgm.memberAction(classId, Number(member.memberId), 'suspend'); await load(); }}>Suspend</button>
                      {canEdit && <button type="button" className="mini-button text-red-600" onClick={async () => { await cgm.memberAction(classId, Number(member.memberId), 'remove', 'Removed by organizer'); await load(); }}>Remove</button>}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )
      )}
    </div>
  );
};

const RosterTable = ({ rows, sensitive, canEdit, classId, onChanged }: { rows: any[]; sensitive: boolean; canEdit: boolean; classId: number; onChanged: () => void }) => (
  <div className={card}>
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-[10px] font-black uppercase tracking-wider text-slate-400">
            <th className="py-2 pr-3">Full name</th><th className="py-2 pr-3">Index number</th>
            {sensitive && <th className="py-2 pr-3">University ID</th>}
            {sensitive && <th className="py-2 pr-3">Phone</th>}
            <th className="py-2 pr-3">Gender</th><th className="py-2 pr-3">Status</th>
            {canEdit && <th className="py-2" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="py-2.5 pr-3 font-bold text-slate-800">{row.fullName}</td>
              <td className="py-2.5 pr-3 font-mono text-xs text-slate-600">{row.indexNumber}</td>
              {sensitive && <td className="py-2.5 pr-3 text-slate-500">{row.universityId || '—'}</td>}
              {sensitive && <td className="py-2.5 pr-3 text-slate-500">{row.phone || '—'}</td>}
              <td className="py-2.5 pr-3"><span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-black uppercase text-slate-500">{row.gender}</span></td>
              <td className="py-2.5 pr-3 text-xs font-bold uppercase text-emerald-700">{row.status}</td>
              {canEdit && (
                <td className="py-2.5">
                  {row.status === 'unregistered' && (
                    <button type="button" className="mini-button text-red-600" onClick={async () => { try { await cgm.deleteRosterEntry(classId, Number(row.id)); } catch { /* row already gone */ } onChanged(); }} title="Delete roster row">Delete</button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const RosterImport = ({ classId, onDone }: { classId: number; onDone: (result: any) => void }) => {
  const [file, setFile] = useState<File | null>(null);
  const [policy, setPolicy] = useState('skip');
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [info, setInfo] = useState<any>(null);
  const [preview, setPreview] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fields: Array<[string, string]> = [
    ['full_name', 'Full name'], ['index_number', 'Index number'],
    ['university_id', 'University ID'], ['phone', 'Phone'],
    ['gender', 'Gender'], ['email', 'Email'],
  ];
  const headers: string[] = info?.headers || [];
  const peek: Record<string, string> = info?.columnPeek || {};
  const suggested: Record<string, string> = info?.suggestedMapping || {};
  // Which columns must be linked before an import is allowed — declared by
  // the server's file inspection.
  const requiredFields: string[] = info?.requiredFields || ['full_name', 'index_number'];
  const missingRequired = fields.filter(([field]) => requiredFields.includes(field) && !mapping[field]);

  // Inspecting the file is automatic: the moment a file is chosen it is read,
  // the first 4 rows appear as a reference table, and the columns are linked
  // to their fields from the header names.
  const inspect = async (chosen: File) => {
    setBusy(true); setError(null); setPreview(null); setInfo(null);
    try {
      const result = await previewRosterFile(classId, chosen);
      setInfo(result);
      setMapping({ ...(result.suggestedMapping || {}) });
    } catch (failure: any) { setError(failure?.message || 'The file could not be read.'); }
    finally { setBusy(false); }
  };

  const runPreview = async () => {
    if (!file) return;
    setBusy(true); setError(null);
    try {
      const result = await importRosterFile(classId, file, mapping, policy, true);
      setPreview(result);
      setError('File checked — review the summary below, then import.');
    } catch (failure: any) { setError(failure?.message || 'The file could not be checked.'); }
    finally { setBusy(false); }
  };

  return (
    <div className={card}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={label}>Import roster</p>
        <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
          Sample template:
          {(['csv', 'xlsx', 'json'] as const).map((format) => (
            <button
              key={format}
              type="button"
              className="mini-button"
              onClick={() => void downloadRosterTemplate(format).catch(() => {})}
              aria-label={`Download sample roster template (${format.toUpperCase()})`}
            >
              {format.toUpperCase()}
            </button>
          ))}
        </span>
      </div>
      <p className="mt-1 text-xs font-medium text-slate-500">Excel .xlsx, CSV .csv or JSON .json — pick a file and it is read immediately: the first four rows appear below and the columns are linked to their fields automatically.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="file"
          accept=".xlsx,.xls,.csv,.json"
          onChange={(event) => { const chosen = event.target.files?.[0] || null; setFile(chosen); void inspect(chosen as File); }}
          className="text-xs"
          aria-label="Roster file"
        />
        <select value={policy} onChange={(event) => setPolicy(event.target.value)} className="mini-button" aria-label="Duplicate policy">
          <option value="skip">Skip duplicates</option>
          <option value="update">Update existing rows</option>
          <option value="flag">Flag for review</option>
        </select>
        {file && <button type="button" disabled={busy} onClick={() => void inspect(file)} className="mini-button">{busy ? 'Reading…' : 'Re-read file'}</button>}
        {file && headers.length > 0 && <button type="button" disabled={busy} onClick={() => void runPreview()} className="mini-button">Check rows for problems</button>}
      </div>

      {file && (
        <p className="mt-2 text-xs font-bold text-emerald-700">
          {info ? `${info.fileName} · ${String(info.format).toUpperCase()} · ${info.totalRows} rows detected` : busy ? 'Reading the file…' : ''}
        </p>
      )}

      {headers.length > 0 && (
        <>
          <div className="mt-4">
            <p className={label}>First {Math.min(4, (info?.sampleRows || []).length)} rows of your file — for reference while you link the columns</p>
            <div className="mt-2 overflow-x-auto rounded-xl border border-amber-200">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-amber-50 text-[10px] font-black uppercase tracking-wider text-amber-700">
                    <th className="px-2 py-2">#</th>
                    {headers.map((header) => <th key={header} className="px-2 py-2 whitespace-nowrap">{header}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                  {(info?.sampleRows || []).map((row: Record<string, unknown>, index: number) => (
                    <tr key={index}>
                      <td className="px-2 py-1.5 text-slate-400">{index + 1}</td>
                      {headers.map((header) => <td key={header} className="px-2 py-1.5 whitespace-nowrap">{String(row[header] ?? '').slice(0, 32) || <span className="text-slate-300">—</span>}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4">
            <p className={label}>Link the columns — chosen from your file, with a peek at the data inside</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {fields.map(([field, text]) => {
                const required = requiredFields.includes(field);
                const isSuggested = Boolean(suggested[field]);
                return (
                  <div key={field}>
                    <label className={label} htmlFor={`map-${field}`}>
                      {text}{required && <span className="ml-1 text-amber-600">*</span>}
                      {required && !mapping[field] && <span className="ml-1 text-red-500">— required</span>}
                    </label>
                    <select
                      id={`map-${field}`}
                      className={`${inputClass} mt-1`}
                      value={mapping[field] || ''}
                      onChange={(event) => setMapping((current) => {
                        const next = { ...current };
                        if (event.target.value) next[field] = event.target.value; else delete next[field];
                        return next;
                      })}
                    >
                      <option value="">— not mapped —</option>
                      {headers.map((header) => (
                        <option key={header} value={header}>
                          {header}{suggested[field] === header ? '  ✓ suggested' : ''}{peek[header] ? `  · e.g. ${String(peek[header]).slice(0, 18)}` : ''}
                        </option>
                      ))}
                    </select>
                    {isSuggested && mapping[field] === suggested[field] && <p className="mt-0.5 text-[10px] font-bold text-emerald-600">Linked automatically from your file</p>}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {preview && (
        <div className="mt-4 rounded-xl bg-slate-50 p-4 text-xs font-semibold text-slate-600">
          <p>{preview.summary.totalRows} rows · {preview.summary.validRows} valid · {preview.summary.invalidRows} invalid · {preview.summary.duplicateRows} duplicates</p>
          {preview.errors?.length > 0 && <p className="mt-1 text-amber-600">First problems: {preview.errors.slice(0, 3).map((row: any) => `row ${row.row}: ${row.error}`).join(' · ')}</p>}
        </div>
      )}

      {error && <div className="mt-3"><Banner tone={preview ? 'info' : (headers.length ? 'info' : 'error')}>{error}</Banner></div>}

      <button
        type="button"
        disabled={!file || busy || missingRequired.length > 0}
        className="cgm-primary-button mt-4"
        onClick={async () => {
          setBusy(true); setError(null);
          try {
            const result = await importRosterFile(classId, file as File, mapping, policy, false);
            onDone(result);
          } catch (failure: any) { setError(failure?.message || 'The import failed.'); }
          finally { setBusy(false); }
        }}
      >
        {busy ? 'Importing…' : missingRequired.length ? `Map ${missingRequired.map(([, text]) => text).join(' & ')} to import` : `Import ${info?.totalRows ?? ''} rows`}
      </button>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------

const InvitationsArea = ({ classId }: { classId: number }) => {
  const [rows, setRows] = useState<any[] | null>(null);
  const [kind, setKind] = useState<'general' | 'individual'>('general');
  const [expiresAt, setExpiresAt] = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<any>(null);
  const [issuedQr, setIssuedQr] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const roster = cgm.roster(classId);
  const [rosterRows, setRosterRows] = useState<any[]>([]);
  const [boundEntryId, setBoundEntryId] = useState('');

  const load = useCallback(async () => { setRows(await cgm.invitations(classId).catch(() => [])); }, [classId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void roster.then((data) => setRosterRows((data.data || data) as any[])).catch(() => setRosterRows([])); }, [roster]);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <div className="space-y-5">
      <div className={card}>
        <p className={label}>Create an invitation</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(['general', 'individual'] as const).map((key) => (
            <button key={key} type="button" onClick={() => setKind(key)} className={`rounded-full px-4 py-2 text-xs font-black uppercase tracking-wider transition ${kind === key ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700'}`}>
              {key === 'general' ? 'General class link' : 'Individual'}
            </button>
          ))}
        </div>
        <form
          className="mt-3 flex flex-wrap items-end gap-2"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true); setMessage(null);
            try {
              const body: Record<string, unknown> = { kind };
              if (expiresAt) body.expiresAt = new Date(expiresAt).toISOString();
              if (maxUses) body.maxUses = Number(maxUses);
              if (kind === 'individual' && boundEntryId) body.rosterEntryId = Number(boundEntryId);
              const result = await cgm.createInvitation(classId, body);
              setIssued(result);
              setIssuedQr(await QRCode.toDataURL(`${origin}/#class-invite/${result.code || ''}`, { width: 256, margin: 1 }).catch(() => null));
              await load();
            } catch (failure: any) { setMessage(failure?.message || 'The invitation failed.'); }
            finally { setBusy(false); }
          }}
        >
          {kind === 'individual' && (
            <select value={boundEntryId} onChange={(event) => setBoundEntryId(event.target.value)} className={`${inputClass} max-w-64`} aria-label="Bind to roster entry" required>
              <option value="">Bind to roster entry…</option>
              {rosterRows.filter((row) => row.status === 'unregistered').map((row) => (
                <option key={row.id} value={row.id}>{row.fullName} · {row.indexNumber}</option>
              ))}
            </select>
          )}
          <div><label className={label} htmlFor="cgm-inv-exp">Expires</label><input id="cgm-inv-exp" type="date" className={`${inputClass} mt-1`} value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></div>
          {kind === 'general' && <div><label className={label} htmlFor="cgm-inv-max">Max uses</label><input id="cgm-inv-max" type="number" min="1" className={`${inputClass} mt-1 w-28`} value={maxUses} onChange={(event) => setMaxUses(event.target.value)} /></div>}
          <button type="submit" disabled={busy} className="cgm-primary-button">{busy ? 'Creating…' : 'Create'}</button>
        </form>
        {message && <div className="mt-3"><Banner tone="error">{message}</Banner></div>}
        {issued && (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
            <p className="text-xs font-black uppercase tracking-wider text-emerald-700">Invitation created — the token is shown only now</p>
            {issued.code && <p className="mt-2 font-mono text-sm font-black text-slate-800">{issued.code}</p>}
            <p className="mt-1 break-all font-mono text-[11px] text-slate-500">{issued.link}</p>
            <div className="mt-3 inline-block rounded-xl bg-white p-2">
              {issuedQr
                ? <img src={issuedQr} alt={`QR code linking to the invitation ${issued.code || ''}`} className="h-32 w-32" />
                : <p className="text-[11px] text-slate-400">QR unavailable offline.</p>}
            </div>
            <p className="mt-2 text-[11px] font-medium text-slate-400">Store it now: only a hash is kept on the server. Regenerate if it leaks.</p>
          </div>
        )}
      </div>

      <div className={card}>
        <p className={label}>Existing invitations</p>
        {(rows || []).length === 0 && <p className="mt-2 text-xs font-medium text-slate-400">None yet.</p>}
        <ul className="mt-3 divide-y divide-slate-100">
          {(rows || []).map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div>
                <p className="text-sm font-black text-slate-800">{row.code || `#${row.id}`}</p>
                <p className="text-[11px] font-semibold text-slate-400">
                  {row.kind} · {row.useCount}{row.maxUses ? `/${row.maxUses}` : ''} used · {row.expiresAt ? `expires ${formatDate(row.expiresAt)}` : 'no expiry'}
                  {row.revoked ? ' · revoked' : row.disabled ? ' · disabled' : ''}
                  {row.boundStudent ? ` · for ${row.boundStudent}` : ''}
                </p>
              </div>
              <div className="flex gap-2">
                {row.disabled && <button type="button" className="mini-button" onClick={async () => { await cgm.invitationAction(Number(row.id), 'enable'); await load(); }}>Enable</button>}
                {!row.revoked && !row.disabled && <button type="button" className="mini-button" onClick={async () => { await cgm.invitationAction(Number(row.id), 'disable'); await load(); }}>Disable</button>}
                {!row.revoked && <button type="button" className="mini-button" onClick={async () => { await cgm.invitationAction(Number(row.id), 'revoke'); await load(); }}>Revoke</button>}
                {!row.revoked && <button type="button" className="mini-button" onClick={async () => { const result = await cgm.invitationAction(Number(row.id), 'regenerate'); setIssued(result); await load(); }}>Regenerate</button>}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Activities + groups + elections
// ---------------------------------------------------------------------------

const ActivitiesArea = ({ classId, onChanged }: { classId: number; onChanged: () => void }) => {
  const [rows, setRows] = useState<any[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [templates, setTemplates] = useState<any[]>([]);
  const [form, setForm] = useState({
    name: '', type: 'tutorial', description: '',
    method: 'automatic', groupCount: '', targetGroupSize: '', capacity: '',
    genderRule: 'none', repeatRule: 'random', leaderMethod: 'appointment', overflow: 'block',
    selfDeadline: '', announcementMode: 'direct', whatsappEnabled: true, attendanceEnabled: true,
    electionAnonymity: 'anonymous', allowVoteChange: false, tieBreak: 'random', eligibility: 'all',
  });

  const load = useCallback(async () => {
    setRows(await cgm.activities(classId).catch(() => []));
    setTemplates(await cgm.templates(classId).catch(() => []));
  }, [classId]);
  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className={card + ' flex-1'}><p className={label}>Grouping activities</p><p className="mt-1 text-xs font-medium text-slate-500">Each activity keeps its own groups, rules and history.</p></div>
        <button type="button" className="cgm-primary-button ml-3" onClick={() => setOpen((value) => !value)}><Plus className="mr-1 inline h-4 w-4" /> {open ? 'Hide' : 'New activity'}</button>
      </div>

      {open && (
        <form
          className={`${card} space-y-3`}
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true); setError(null);
            try {
              const config: Record<string, unknown> = {
                method: form.method, genderRule: form.genderRule, repeatRule: form.repeatRule,
                leaderMethod: form.leaderMethod, overflow: form.overflow,
                announcementMode: form.announcementMode, whatsappEnabled: form.whatsappEnabled,
                attendanceEnabled: form.attendanceEnabled, electionAnonymity: form.electionAnonymity,
                allowVoteChange: form.allowVoteChange, tieBreak: form.tieBreak, eligibility: form.eligibility,
              };
              if (form.groupCount) config.groupCount = Number(form.groupCount);
              if (form.targetGroupSize) config.targetGroupSize = Number(form.targetGroupSize);
              if (form.capacity) config.capacity = Number(form.capacity);
              if (form.selfDeadline) config.selfDeadline = new Date(form.selfDeadline).toISOString();
              await cgm.createActivity(classId, { name: form.name, type: form.type, description: form.description, config });
              setOpen(false); await load(); onChanged();
            } catch (failure: any) { setError(failure?.message || 'The activity failed.'); }
            finally { setBusy(false); }
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className={label} htmlFor="cgm-act-name">Name *</label><input id="cgm-act-name" required className={`${inputClass} mt-1`} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div>
            <div><label className={label} htmlFor="cgm-act-type">Type</label>
              <select id="cgm-act-type" className={`${inputClass} mt-1`} value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>
                {['tutorial', 'practical', 'presentation', 'research', 'seminar', 'project', 'custom'].map((key) => <option key={key} value={key}>{key}</option>)}
              </select>
            </div>
            <div><label className={label} htmlFor="cgm-act-method">Assignment method</label>
              <select id="cgm-act-method" className={`${inputClass} mt-1`} value={form.method} onChange={(event) => setForm({ ...form, method: event.target.value })}>
                <option value="automatic">Organizer assigns automatically</option>
                <option value="self">Students assign themselves</option>
                <option value="hybrid">Hybrid (self first, organizer finishes)</option>
              </select>
            </div>
            <div><label className={label} htmlFor="cgm-act-groups">Number of groups</label><input id="cgm-act-groups" type="number" min="2" max="50" className={`${inputClass} mt-1`} value={form.groupCount} onChange={(event) => setForm({ ...form, groupCount: event.target.value })} /></div>
            <div><label className={label} htmlFor="cgm-act-size">…or target group size</label><input id="cgm-act-size" type="number" min="2" className={`${inputClass} mt-1`} value={form.targetGroupSize} onChange={(event) => setForm({ ...form, targetGroupSize: event.target.value })} /></div>
            <div><label className={label} htmlFor="cgm-act-cap">Group capacity (hard limit)</label><input id="cgm-act-cap" type="number" min="1" className={`${inputClass} mt-1`} value={form.capacity} onChange={(event) => setForm({ ...form, capacity: event.target.value })} /></div>
            <div><label className={label} htmlFor="cgm-act-gender">Gender rule</label>
              <select id="cgm-act-gender" className={`${inputClass} mt-1`} value={form.genderRule} onChange={(event) => setForm({ ...form, genderRule: event.target.value })}>
                <option value="none">No gender consideration</option>
                <option value="balanced">Balanced distribution</option>
                <option value="separate">Separate male/female groups</option>
              </select>
            </div>
            <div><label className={label} htmlFor="cgm-act-repeat">Repeat classmates</label>
              <select id="cgm-act-repeat" className={`${inputClass} mt-1`} value={form.repeatRule} onChange={(event) => setForm({ ...form, repeatRule: event.target.value })}>
                <option value="random">Randomize independently</option>
                <option value="avoid">Minimize repeats from earlier activities</option>
              </select>
            </div>
            <div><label className={label} htmlFor="cgm-act-overflow">When a group is full</label>
              <select id="cgm-act-overflow" className={`${inputClass} mt-1`} value={form.overflow} onChange={(event) => setForm({ ...form, overflow: event.target.value })}>
                <option value="block">Block further assignment</option>
                <option value="waitlist">Waiting list</option>
                <option value="organizer">Organizer intervenes</option>
              </select>
            </div>
            <div><label className={label} htmlFor="cgm-act-leader">Leader selection</label>
              <select id="cgm-act-leader" className={`${inputClass} mt-1`} value={form.leaderMethod} onChange={(event) => setForm({ ...form, leaderMethod: event.target.value })}>
                <option value="appointment">Organizer appoints</option>
                <option value="election">Student election</option>
                <option value="automatic">Automatic selection</option>
              </select>
            </div>
            {form.method !== 'automatic' && (
              <div><label className={label} htmlFor="cgm-act-deadline">Self-assignment deadline</label><input id="cgm-act-deadline" type="datetime-local" className={`${inputClass} mt-1`} value={form.selfDeadline} onChange={(event) => setForm({ ...form, selfDeadline: event.target.value })} /></div>
            )}
            <div><label className={label} htmlFor="cgm-act-anon">Election voting</label>
              <select id="cgm-act-anon" className={`${inputClass} mt-1`} value={form.electionAnonymity} onChange={(event) => setForm({ ...form, electionAnonymity: event.target.value })}>
                <option value="anonymous">Anonymous</option>
                <option value="public">Public</option>
              </select>
            </div>
            <div><label className={label} htmlFor="cgm-act-elig">Eligible students</label>
              <select id="cgm-act-elig" className={`${inputClass} mt-1`} value={form.eligibility} onChange={(event) => setForm({ ...form, eligibility: event.target.value })}>
                <option value="all">All active class members</option>
                <option value="selected">Selected list (configure after creating)</option>
              </select>
            </div>
          </div>
          <div><label className={label} htmlFor="cgm-act-desc">Description</label><textarea id="cgm-act-desc" className={`${inputClass} mt-1 min-h-16`} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></div>
          <button type="submit" disabled={busy} className="cgm-primary-button">{busy ? 'Creating…' : 'Create activity (draft)'}</button>
          {error && <Banner tone="error">{error}</Banner>}
        </form>
      )}

      {message && <Banner tone="success">{message}</Banner>}
      {rows === null && <p className="text-sm font-semibold text-slate-400">Loading…</p>}
      {rows?.length === 0 && <EmptyArea icon={Layers} title="No activities yet" text="Tutorial groups, practicals, presentations — each one is independent." />}
      {rows && rows.length > 0 && (
        <div className={card}>
          <ul className="divide-y divide-slate-100">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <p className="text-sm font-black text-slate-800">{row.name}</p>
                  <p className="text-[11px] font-semibold text-slate-400">{row.type} · {row.status} · {row.assignedCount} assigned in {row.groupCount} groups · {row.config.method}</p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {['open', 'published', 'active'].includes(String(row.status)) && row.config?.selfDeadline && (
                    <button
                      type="button"
                      className="mini-button"
                      title="Notify every student who has not been placed yet (once per student per deadline)"
                      onClick={async () => {
                        try {
                          const result = await cgm.remindActivity(Number(row.id));
                          setMessage(`Reminders sent to ${(result as any).sent} student(s)${(result as any).skipped ? ` — ${(result as any).skipped} already reminded for this deadline.` : '.'}`);
                        } catch (failure: any) { setMessage(failure?.message || 'Reminders failed.'); }
                      }}
                    >
                      Remind
                    </button>
                  )}
                  <ActivityLifecycleButtons activity={row} onChanged={async () => { await load(); onChanged(); }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {templates.length > 0 && (
        <div className={card}>
          <p className={label}>Templates (configuration only — never assignments or votes)</p>
          <ul className="mt-3 space-y-2">
            {templates.map((template) => (
              <li key={template.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2.5 text-sm">
                <span className="font-bold text-slate-700">{template.name}</span>
                <button type="button" className="mini-button text-red-600" onClick={async () => { await cgm.deleteTemplate(Number(template.id)); await load(); }}>Delete</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

const ActivityLifecycleButtons = ({ activity, onChanged }: { activity: any; onChanged: () => void }) => {
  const actions: Array<[string, string]> = [];
  const status = String(activity.status);
  if (['draft', 'paused'].includes(status)) actions.push(['open', 'Open']);
  if (['draft', 'open'].includes(status)) actions.push(['publish', 'Publish']);
  if (['open', 'published', 'active'].includes(status)) actions.push(['pause', 'Pause']);
  if (status === 'paused') actions.push(['resume', 'Resume']);
  if (['open', 'published', 'active', 'paused'].includes(status)) actions.push(['complete', 'Complete']);
  if (status === 'completed') actions.push(['archive', 'Archive']);
  if (status === 'completed') actions.push(['reopen', 'Reopen']);
  if (!['completed', 'archived'].includes(status)) actions.push(['cancel', 'Cancel']);
  if (['archived', 'cancelled'].includes(status)) actions.push(['restore', 'Restore']);
  return (
    <div className="flex flex-wrap gap-1.5">
      {actions.slice(0, 3).map(([action, text]) => (
        <button
          key={action}
          type="button"
          className="mini-button"
          onClick={async () => {
            let reason: string | undefined;
            if (action === 'cancel') {
              reason = (await appDialog.prompt({
                title: 'Cancel this activity?',
                message: `${activity.name} keeps its history. Students are told why it is cancelled.`,
                label: 'Reason for cancelling', multiline: true, confirmLabel: 'Cancel activity',
              })) || undefined;
              if (!reason) return;
            }
            try { await cgm.activityLifecycle(Number(activity.id), action, reason); onChanged(); } catch { /* surfaced elsewhere */ }
          }}
        >
          {text}
        </button>
      ))}
      {actions.length > 3 && (
        <button type="button" className="mini-button" onClick={async () => { await cgm.duplicateActivity(Number(activity.id)); onChanged(); }} title="Duplicate configuration">Duplicate</button>
      )}
    </div>
  );
};

const GroupsArea = ({ classId, canGenerate, canMove, canRemove, canManageWhatsapp, onChanged }: { classId: number; canGenerate: boolean; canMove: boolean; canRemove: boolean; canManageWhatsapp: boolean; onChanged: () => void }) => {
  const [activities, setActivities] = useState<any[]>([]);
  const [activityId, setActivityId] = useState<number | null>(null);
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [genCount, setGenCount] = useState('');
  const [genSize, setGenSize] = useState('');

  useEffect(() => { void cgm.activities(classId).then((rows) => { setActivities(rows as any[]); }).catch(() => setActivities([])); }, [classId]);

  const load = useCallback(async (id: number) => {
    try { setData(await cgm.activityDetail(id)); setError(null); }
    catch (failure: any) { setError(failure?.message || 'This activity could not be loaded.'); setData(null); }
  }, []);

  useEffect(() => { if (activityId) void load(activityId); else setData(null); }, [activityId, load]);

  const run = async (work: () => Promise<any>) => {
    setBusy(true); setMessage(null); setError(null);
    try { const result = await work(); if (activityId) await load(activityId); onChanged(); return result; }
    catch (failure: any) { setError(failure?.message || 'That did not work.'); return null; }
    finally { setBusy(false); }
  };

  const [qrByGroup, setQrByGroup] = useState<Record<number, string>>({});

  const setWhatsapp = async (groupId: number, url: string) => {
    await run(() => cgm.setWhatsApp(groupId, url));
    setMessage(url ? 'WhatsApp link saved — only group members can open it.' : 'WhatsApp link revoked.');
  };

  const whatsappAction = async (groupId: number, action: 'disable' | 'enable' | 'revoke') => {
    await run(() => cgm.whatsappAction(groupId, action));
    setMessage(`WhatsApp link ${action}d.`);
  };

  const showWhatsappQr = async (groupId: number, url: string) => {
    const dataUrl = await QRCode.toDataURL(url, { width: 256, margin: 1 }).catch(() => null);
    setQrByGroup((current) => ({ ...current, [groupId]: dataUrl || '' }));
  };

  return (
    <div className="space-y-5">
      <div className={card}>
        <p className={label}>Groups</p>
        <select className={`${inputClass} mt-3`} value={activityId ?? ''} onChange={(event) => setActivityId(Number(event.target.value) || null)} aria-label="Choose activity">
          <option value="">Choose an activity…</option>
          {activities.map((entry) => <option key={entry.id} value={Number(entry.id)}>{entry.name} ({entry.status})</option>)}
        </select>
        {message && <div className="mt-3"><Banner tone="success">{message}</Banner></div>}
        {error && <div className="mt-3"><Banner tone="error">{error}</Banner></div>}
      </div>

      {data && (
        <>
          {canGenerate && (
            <div className={card}>
              <p className={label}>Automatic assignment</p>
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <div><label className={label} htmlFor="cgm-gen-count">Number of groups</label><input id="cgm-gen-count" type="number" min="2" className={`${inputClass} mt-1 w-40`} value={genCount} onChange={(event) => setGenCount(event.target.value)} placeholder={String(data.config.groupCount || 'auto')} /></div>
                <div><label className={label} htmlFor="cgm-gen-size">…or target size</label><input id="cgm-gen-size" type="number" min="2" className={`${inputClass} mt-1 w-40`} value={genSize} onChange={(event) => setGenSize(event.target.value)} placeholder={String(data.config.targetGroupSize || 'auto')} /></div>
                <button
                  type="button"
                  disabled={busy}
                  className="cgm-primary-button"
                  onClick={() => void run(async () => {
                    const result = await cgm.generateGroups(Number(activityId), {
                      ...(genCount ? { groupCount: Number(genCount) } : {}),
                      ...(genSize ? { targetSize: Number(genSize) } : {}),
                    });
                    const warnings = (result as any)?.warnings || [];
                    setMessage(`Placed ${(result as any)?.placed} student(s).${(result as any)?.unplaced ? ` ${(result as any)?.unplaced} could not fit.` : ''}${warnings.length ? ` ${warnings.join(' ')}` : ''}`);
                    return result;
                  })}
                >
                  {busy ? 'Working…' : 'Assign students'}
                </button>
                {data.config.method !== 'automatic' && (
                  <button type="button" disabled={busy} className="mini-button" onClick={() => void run(async () => { const result = await cgm.assignRemaining(Number(activityId)); setMessage(`Placed ${(result as any)?.placed} remaining, promoted ${(result as any)?.promoted} from the waiting list.`); return result; })}>
                    Assign remaining (hybrid)
                  </button>
                )}
              </div>
              <p className="mt-2 text-[11px] font-medium text-slate-400">Balanced sizes, hard capacity limits, and the gender/repeat rules configured for this activity. Published assignments are never reshuffled.</p>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(data.groups || []).map((group: any) => (
              <div key={group.id} className={card}>
                <div className="flex items-center justify-between">
                  <p className="font-black text-slate-900">{group.name}</p>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-500">{group.size}{group.capacity ? `/${group.capacity}` : ''}</span>
                </div>
                <ul className="mt-2 space-y-1.5">
                  {(data.members || []).filter((member: any) => Number(member.group_id) === Number(group.id)).map((member: any) => (
                    <li key={member.student_id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-xs">
                      <span className="font-bold text-slate-600">{member.full_name}</span>
                      <span className="flex gap-1">
                        {canMove && (
                          <select
                            className="rounded border border-slate-200 bg-white px-1 py-0.5 text-[10px]"
                            value=""
                            aria-label={`Move ${member.full_name}`}
                            onChange={(event) => { const target = Number(event.target.value); if (target) void run(() => cgm.assignStudent(Number(activityId), Number(member.student_id), target)); }}
                          >
                            <option value="">Move…</option>
                            {(data.groups || []).filter((other: any) => Number(other.id) !== Number(group.id)).map((other: any) => (
                              <option key={other.id} value={other.id}>{other.name}</option>
                            ))}
                          </select>
                        )}
                        {canRemove && (
                          <button type="button" className="rounded px-1.5 text-[10px] font-black text-red-500 hover:bg-red-50" onClick={() => { void run(async () => { const assignment = (data.assignmentsFlat || []).find((row: any) => Number(row.student_id) === Number(member.student_id)); if (assignment) await cgm.removeAssignment(Number(assignment.id)); }); }} title="Remove from activity">✕</button>
                        )}
                      </span>
                    </li>
                  ))}
                  {!((data.members || []).some((member: any) => Number(member.group_id) === Number(group.id))) && <li className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-400">Empty</li>}
                </ul>
                {canManageWhatsapp && (
                  <div className="mt-3 border-t border-slate-100 pt-3">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">WhatsApp group</p>
                    {(data.whatsapp || []).filter((link: any) => Number(link.groupId) === Number(group.id)).slice(0, 1).map((link: any) => (
                      <div key={link.id} className="mt-1.5">
                        <p className="break-all text-[11px] font-semibold {link.status === 'active' ? 'text-slate-600' : 'text-slate-400 line-through'}">{link.url}</p>
                        <p className="text-[10px] font-bold uppercase text-slate-400">{link.status} · {link.clickCount} click(s){link.clickCount ? ' — clicks are not proof of joining' : ''}</p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {link.status === 'active' && (
                            <>
                              <button type="button" className="mini-button" onClick={() => void showWhatsappQr(Number(group.id), String(link.url))}>QR</button>
                              <button type="button" className="mini-button" onClick={() => void whatsappAction(Number(group.id), 'disable')}>Disable</button>
                              <button type="button" className="mini-button text-red-600" onClick={() => void whatsappAction(Number(group.id), 'revoke')}>Revoke</button>
                            </>
                          )}
                          {link.status === 'disabled' && <button type="button" className="mini-button" onClick={() => void whatsappAction(Number(group.id), 'enable')}>Enable</button>}
                          <button type="button" className="mini-button" onClick={async () => {
                            const url = await appDialog.prompt({ title: 'Replace the WhatsApp link', label: 'Paste the new https://chat.whatsapp.com/… link', confirmLabel: 'Replace' });
                            if (url) await setWhatsapp(Number(group.id), url);
                          }}>Replace</button>
                        </div>
                        {qrByGroup[Number(group.id)] && (
                          <div className="mt-2 inline-block rounded-xl bg-white p-2 ring-1 ring-slate-100">
                            <img src={qrByGroup[Number(group.id)]} alt={`WhatsApp QR for ${group.name}`} className="h-28 w-28" />
                          </div>
                        )}
                      </div>
                    ))}
                    {!(data.whatsapp || []).some((link: any) => Number(link.groupId) === Number(group.id)) && (
                      <button type="button" className="mini-button mt-1.5" onClick={async () => {
                        const url = await appDialog.prompt({ title: `Add the WhatsApp group link for ${group.name}`, label: 'Paste the https://chat.whatsapp.com/… invite link', confirmLabel: 'Save' });
                        if (url) await setWhatsapp(Number(group.id), url);
                      }}>Paste link…</button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className={card}>
              <p className={label}>Unassigned students ({(data.unassigned || []).length})</p>
              <ul className="mt-2 space-y-1">
                {(data.unassigned || []).slice(0, 20).map((student: any) => (
                  <li key={student.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-xs">
                    <span className="font-bold text-slate-600">{student.full_name}</span>
                    {canMove && data.groups.length > 0 && (
                      <select className="rounded border border-slate-200 bg-white px-1 py-0.5 text-[10px]" value="" aria-label={`Place ${student.full_name}`} onChange={(event) => { const target = Number(event.target.value); if (target) void run(() => cgm.assignStudent(Number(activityId), Number(student.id), target)); }}>
                        <option value="">Place…</option>
                        {data.groups.map((group: any) => <option key={group.id} value={group.id}>{group.name}</option>)}
                      </select>
                    )}
                  </li>
                ))}
                {!(data.unassigned || []).length && <li className="text-[11px] text-slate-400">Everyone is placed.</li>}
              </ul>
            </div>
            <div className={card}>
              <p className={label}>Group change requests</p>
              <ul className="mt-2 space-y-1">
                {(data.changeRequests || []).slice(0, 10).map((request: any) => (
                  <li key={request.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-xs">
                    <span className="font-bold text-slate-600">{request.full_name} → group #{request.to_group_id} <span className="ml-1 uppercase text-slate-400">{request.status}</span></span>
                    {request.status === 'pending' && (
                      <span className="flex gap-1">
                        <button type="button" className="rounded px-1.5 py-0.5 text-[10px] font-black text-emerald-600 hover:bg-emerald-50" onClick={() => void run(() => cgm.reviewChangeRequest(Number(activityId), Number(request.id), 'approve'))}>Approve</button>
                        <button type="button" className="rounded px-1.5 py-0.5 text-[10px] font-black text-red-500 hover:bg-red-50" onClick={() => void run(() => cgm.reviewChangeRequest(Number(activityId), Number(request.id), 'reject'))}>Reject</button>
                      </span>
                    )}
                  </li>
                ))}
                {!(data.changeRequests || []).length && <li className="text-[11px] text-slate-400">No requests.</li>}
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const ElectionsArea = ({ classId, onChanged }: { classId: number; onChanged: () => void }) => {
  const [activities, setActivities] = useState<any[]>([]);
  const [activityId, setActivityId] = useState<number | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [elections, setElections] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => { void cgm.activities(classId).then((rows) => setActivities(rows as any[])).catch(() => setActivities([])); }, [classId]);

  const loadGroups = useCallback(async (id: number) => {
    const data = await cgm.activityDetail(id).catch(() => null);
    setDetail(data);
  }, []);
  useEffect(() => { if (activityId) void loadGroups(activityId); else { setDetail(null); setElections([]); } }, [activityId, loadGroups]);

  return (
    <div className="space-y-5">
      <div className={card}>
        <p className={label}>Elections</p>
        <select className={`${inputClass} mt-3`} value={activityId ?? ''} onChange={(event) => setActivityId(Number(event.target.value) || null)} aria-label="Choose activity">
          <option value="">Choose an activity…</option>
          {activities.map((entry) => <option key={entry.id} value={Number(entry.id)}>{entry.name} ({entry.status})</option>)}
        </select>
        {message && <div className="mt-3"><Banner tone="success">{message}</Banner></div>}
      </div>

      {detail && (
        <div className={card}>
          <p className={label}>Create an election</p>
          <form
            className="mt-3 grid gap-2 sm:grid-cols-4"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = event.target as HTMLFormElement;
              const groupId = Number((form.elements.namedItem('groupId') as HTMLSelectElement).value);
              if (!groupId) return;
              setBusy(true);
              try {
                const windowValue = (name: string) => {
                  const raw = String((form.elements.namedItem(name) as HTMLInputElement).value || '');
                  return raw ? new Date(raw).toISOString() : undefined;
                };
                await cgm.createElection(groupId, {
                  title: String((form.elements.namedItem('title') as HTMLInputElement).value || `Group leadership election`),
                  role: String((form.elements.namedItem('role') as HTMLSelectElement).value),
                  anonymity: String((form.elements.namedItem('anonymity') as HTMLSelectElement).value),
                  visibility: String((form.elements.namedItem('visibility') as HTMLSelectElement).value),
                  allowVoteChange: ((form.elements.namedItem('allowChange') as HTMLSelectElement).value) === 'yes',
                  tieBreak: String((form.elements.namedItem('tieBreak') as HTMLSelectElement).value),
                  ...(windowValue('nominationOpenAt') ? { nominationOpenAt: windowValue('nominationOpenAt') } : {}),
                  ...(windowValue('nominationCloseAt') ? { nominationCloseAt: windowValue('nominationCloseAt') } : {}),
                  ...(windowValue('votingOpenAt') ? { votingOpenAt: windowValue('votingOpenAt') } : {}),
                  ...(windowValue('votingCloseAt') ? { votingCloseAt: windowValue('votingCloseAt') } : {}),
                });
                setMessage('Election created — the group has been notified.');
                await loadGroups(Number(activityId));
              } catch (failure: any) { setMessage(failure?.message || 'The election failed.'); }
              finally { setBusy(false); }
            }}
          >
            <select name="groupId" required className={inputClass} aria-label="Group">
              <option value="">Group…</option>
              {(detail.groups || []).map((group: any) => <option key={group.id} value={group.id}>{group.name}</option>)}
            </select>
            <select name="role" className={inputClass} aria-label="Role"><option value="leader">Leader</option><option value="assistant">Assistant</option></select>
            <select name="anonymity" className={inputClass} aria-label="Anonymity"><option value="anonymous">Anonymous</option><option value="public">Public</option></select>
            <select name="visibility" className={inputClass} aria-label="Results visibility"><option value="group">Group</option><option value="class">Class</option><option value="private">Private</option></select>
            <select name="allowChange" className={inputClass} aria-label="Vote changes"><option value="no">Votes locked</option><option value="yes">Changeable until close</option></select>
            <select name="tieBreak" className={inputClass} aria-label="Tie-break"><option value="random">Tie → secure random</option><option value="runoff">Tie → runoff</option><option value="appointment">Tie → appointment</option><option value="manual">Tie → manual</option></select>
            <div><label className="label-cgm text-[10px] font-black uppercase tracking-wider text-slate-400" htmlFor="cgm-nom-open">Nominations open</label>
              <input id="cgm-nom-open" name="nominationOpenAt" type="datetime-local" className={inputClass} aria-label="Nominations open" /></div>
            <div><label className="text-[10px] font-black uppercase tracking-wider text-slate-400" htmlFor="cgm-nom-close">Nominations close</label>
              <input id="cgm-nom-close" name="nominationCloseAt" type="datetime-local" className={inputClass} aria-label="Nominations close" /></div>
            <div><label className="text-[10px] font-black uppercase tracking-wider text-slate-400" htmlFor="cgm-vote-open">Voting opens</label>
              <input id="cgm-vote-open" name="votingOpenAt" type="datetime-local" className={inputClass} aria-label="Voting opens" /></div>
            <div><label className="text-[10px] font-black uppercase tracking-wider text-slate-400" htmlFor="cgm-vote-close">Voting closes</label>
              <input id="cgm-vote-close" name="votingCloseAt" type="datetime-local" className={inputClass} aria-label="Voting closes" /></div>
            <input name="title" className={inputClass} placeholder="Title (optional)" />
            <button type="submit" disabled={busy} className="cgm-primary-button">Create</button>
          </form>
        </div>
      )}

      <div className={card}>
        <p className={label}>Election records</p>
        <p className="mt-1 text-[11px] font-medium text-slate-400">Open voting, close it, resolve ties, and announce the winner. Anonymous ballots are never shown per voter — the organizer only ever sees counts.</p>
      </div>
      {elections.map((entry) => (
        <ElectionManager key={entry.election.id} data={entry} onAction={async (action, extra) => {
          setBusy(true);
          try {
            if (action === 'resolve') await cgm.resolveTie(Number(entry.election.id), Number(extra?.winner), extra?.reason);
            else await cgm.electionAction(Number(entry.election.id), action as any, extra?.reason);
            const refreshed = await cgm.electionDetail(Number(entry.election.id));
            setElections((current) => current.map((item) => (Number(item.election.id) === Number(entry.election.id) ? refreshed : item)));
            onChanged();
          } catch (failure: any) { setMessage(failure?.message || 'That did not work.'); }
          finally { setBusy(false); }
        }} busy={busy} />
      ))}
    </div>
  );
};

const ElectionManager = ({ data, onAction, busy }: { data: any; onAction: (action: string, extra?: { winner?: number; reason?: string }) => Promise<void>; busy: boolean }) => {
  const { election, candidates, participation } = data;
  const hasTie = Boolean(election.results?.outcome?.tie) && !election.results?.outcome?.resolved;
  const tiedIds: number[] = election.results?.outcome?.tiedCandidateIds || [];
  return (
    <div className={card}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-black text-slate-900">{election.title}</p>
          <p className="text-[11px] font-semibold text-slate-400">{election.groupName} · {election.role} · {election.status} · {election.anonymity} · turnout {participation?.turnout ?? 0}% ({participation?.voted ?? 0}/{participation?.groupSize ?? 0})</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {election.status === 'nominating' && <button type="button" disabled={busy} className="mini-button" onClick={() => void onAction('open-voting')}>Open voting</button>}
          {election.status === 'voting' && <button type="button" disabled={busy} className="mini-button" onClick={() => void onAction('close')}>Close</button>}
          {election.status === 'closed' && hasTie && (
            <button type="button" disabled={busy} className="mini-button" onClick={async () => {
              const winner = await appDialog.prompt({
                title: 'Resolve the tie',
                message: `Tied candidates: ${tiedIds.join(', ')}. Enter the candidate id the tie-break lands on.`,
                label: 'Winning candidate id', confirmLabel: 'Resolve',
              });
              if (winner) await onAction('resolve', { winner: Number(winner), reason: 'Tie resolved by organizer' });
            }}>Resolve tie</button>
          )}
          {election.status === 'closed' && election.results?.outcome?.winner && !election.results?.outcome?.announced && (
            <button type="button" disabled={busy} className="cgm-primary-button" onClick={() => void onAction('announce')}>Announce winner</button>
          )}
          {['nominating', 'voting'].includes(election.status) && (
            <button type="button" disabled={busy} className="mini-button text-red-600" onClick={async () => {
              const reason = await appDialog.prompt({ title: 'Cancel this election?', label: 'Reason for cancelling', multiline: true, confirmLabel: 'Cancel election' });
              if (reason) await onAction('cancel', { reason });
            }}>Cancel</button>
          )}
        </div>
      </div>
      <ul className="mt-3 space-y-1">
        {candidates.map((candidate: any) => (
          <li key={candidate.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-xs">
            <span className="font-bold text-slate-600">{candidate.fullName} <span className="ml-1 uppercase text-slate-400">{candidate.status}</span></span>
            <span className="font-black text-slate-500">{candidate.votes} vote(s)</span>
          </li>
        ))}
        {!candidates.length && <li className="text-[11px] text-slate-400">No candidates yet.</li>}
      </ul>
    </div>
  );
};

const LeadershipArea = ({ classId, canAppoint, onChanged }: { classId: number; canAppoint: boolean; onChanged: () => void }) => {
  const [activities, setActivities] = useState<any[]>([]);
  const [activityId, setActivityId] = useState<number | null>(null);
  const [data, setData] = useState<any>(null);
  const [detail, setDetail] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => { void cgm.activities(classId).then((rows) => setActivities(rows as any[])).catch(() => setActivities([])); }, [classId]);
  const load = useCallback(async (id: number) => {
    const [leadership, activityDetail] = await Promise.all([
      cgm.leadership(id).catch(() => null),
      cgm.activityDetail(id).catch(() => null),
    ]);
    setData(leadership); setDetail(activityDetail);
  }, []);
  useEffect(() => { if (activityId) void load(activityId); else { setData(null); setDetail(null); } }, [activityId, load]);

  return (
    <div className="space-y-5">
      <div className={card}>
        <p className={label}>Leadership</p>
        <select className={`${inputClass} mt-3`} value={activityId ?? ''} onChange={(event) => setActivityId(Number(event.target.value) || null)} aria-label="Choose activity">
          <option value="">Choose an activity…</option>
          {activities.map((entry) => <option key={entry.id} value={Number(entry.id)}>{entry.name} ({entry.status})</option>)}
        </select>
        {message && <div className="mt-3"><Banner tone="success">{message}</Banner></div>}
      </div>

      {data && detail && (
        <>
          {(data.groupsWithoutLeaders || []).length > 0 && (
            <div className={card}>
              <p className={label}>Groups missing a leader — plan the succession</p>
              <p className="mt-1 text-[11px] font-medium text-slate-500">Automatic promotes the most senior assistant; Appointment names anyone in the group; Fresh election opens an anonymous vote for the group.</p>
              <ul className="mt-2 space-y-2">
                {data.groupsWithoutLeaders.map((group: any) => (
                  <li key={group.id} className="rounded-lg bg-amber-50 px-3 py-2 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-amber-800">{group.name}</span>
                      {canAppoint && (
                        <select disabled={busy} className="rounded border border-amber-200 bg-white px-1 py-0.5 text-[10px]" value="" aria-label={`Appoint leader for ${group.name}`} onChange={async (event) => {
                          const studentId = Number(event.target.value);
                          if (!studentId) return;
                          setBusy(true);
                          try { await cgm.appointLeader(Number(group.id), { studentId, role: 'leader' }); setMessage('Leader appointed.'); await load(Number(activityId)); onChanged(); }
                          catch (failure: any) { setMessage(failure?.message || 'That did not work.'); }
                          finally { setBusy(false); }
                        }}>
                          <option value="">Appoint directly…</option>
                          {(detail.members || []).filter((member: any) => Number(member.group_id) === Number(group.id)).map((member: any) => (
                            <option key={member.student_id} value={member.student_id}>{member.full_name}</option>
                          ))}
                        </select>
                      )}
                    </div>
                    {canAppoint && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <button type="button" disabled={busy} className="rounded bg-white px-2 py-1 text-[10px] font-black uppercase text-emerald-700 ring-1 ring-emerald-200 disabled:opacity-50"
                          onClick={async () => {
                            setBusy(true);
                            try { await cgm.planSuccession(Number(group.id), { method: 'automatic' }); setMessage('The most senior assistant was promoted.'); await load(Number(activityId)); onChanged(); }
                            catch (failure: any) { setMessage(failure?.message || 'Automatic succession needs an active assistant.'); }
                            finally { setBusy(false); }
                          }}>Auto (senior assistant)</button>
                        <button type="button" disabled={busy} className="rounded bg-white px-2 py-1 text-[10px] font-black uppercase text-emerald-700 ring-1 ring-emerald-200 disabled:opacity-50"
                          onClick={async () => {
                            setBusy(true);
                            try { const result = await cgm.planSuccession(Number(group.id), { method: 'election' }); setMessage(`Fresh election opened (#${(result as any).electionId}) — the group was notified.`); await load(Number(activityId)); onChanged(); }
                            catch (failure: any) { setMessage(failure?.message || 'That did not work.'); }
                            finally { setBusy(false); }
                          }}>Fresh election</button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className={card}>
            <p className={label}>Appointments</p>
            <ul className="mt-3 divide-y divide-slate-100">
              {(data.appointments || []).map((appointment: any) => (
                <li key={appointment.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <p className="text-sm font-bold text-slate-800">{appointment.fullName} <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-black uppercase ${appointment.role === 'leader' ? 'bg-emerald-100 text-emerald-700' : 'bg-sky-100 text-sky-700'}`}>{appointment.role}</span></p>
                    <p className="text-[11px] font-semibold text-slate-400">{appointment.groupName} · {appointment.method} · {appointment.status}{appointment.endReason ? ` (${appointment.endReason})` : ''}</p>
                  </div>
                  {canAppoint && appointment.status === 'active' && (
                    <div className="flex gap-2">
                      <button type="button" className="mini-button" onClick={async () => { await cgm.updateLeaderPermissions(Number(appointment.id), ['view_members', 'coordinate']); setMessage('Permissions narrowed.'); }}>Narrow permissions</button>
                      <button type="button" className="mini-button text-red-600" onClick={async () => { await cgm.endLeadership(Number(appointment.id), 'Ended by organizer'); await load(Number(activityId)); }}>End</button>
                    </div>
                  )}
                </li>
              ))}
              {!(data.appointments || []).length && <li className="py-4 text-center text-xs font-medium text-slate-400">No appointments yet.</li>}
            </ul>
          </div>
        </>
      )}
    </div>
  );
};

const AttendanceArea = ({ classId, onChanged }: { classId: number; onChanged: () => void }) => {
  const [activities, setActivities] = useState<any[]>([]);
  const [activityId, setActivityId] = useState<number | null>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [openSession, setOpenSession] = useState<any>(null);
  const [records, setRecords] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({ title: '', sessionDate: new Date().toISOString().slice(0, 10), groupId: '' });

  useEffect(() => { void cgm.activities(classId).then((rows) => setActivities(rows as any[])).catch(() => setActivities([])); }, [classId]);

  const loadSessions = useCallback(async (id: number) => {
    const summary = await cgm.attendanceSummary(id).catch(() => null);
    setSessions(summary?.sessions || []);
  }, []);
  useEffect(() => { if (activityId) void loadSessions(activityId); else setSessions([]); }, [activityId, loadSessions]);

  const openDetail = async (sessionId: number) => {
    const detail = await cgm.attendanceSession(sessionId).catch(() => null);
    if (!detail) return;
    setOpenSession(detail);
    const initial: Record<number, string> = {};
    for (const student of detail.students || []) if (student.status) initial[Number(student.studentId)] = student.status;
    setRecords(initial);
  };

  return (
    <div className="space-y-5">
      <div className={card}>
        <p className={label}>Attendance</p>
        <select className={`${inputClass} mt-3`} value={activityId ?? ''} onChange={(event) => setActivityId(Number(event.target.value) || null)} aria-label="Choose activity">
          <option value="">Choose an activity…</option>
          {activities.map((entry) => <option key={entry.id} value={Number(entry.id)}>{entry.name} ({entry.status})</option>)}
        </select>
        {activityId && (
          <form
            className="mt-3 flex flex-wrap items-end gap-2"
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              try { await cgm.createAttendanceSession(Number(activityId), { title: form.title, sessionDate: form.sessionDate }); setForm({ ...form, title: '' }); await loadSessions(Number(activityId)); }
              catch (failure: any) { setMessage(failure?.message || 'The session failed.'); }
              finally { setBusy(false); }
            }}
          >
            <div><label className={label} htmlFor="cgm-att-title">Session title</label><input id="cgm-att-title" required className={`${inputClass} mt-1`} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></div>
            <div><label className={label} htmlFor="cgm-att-date">Date</label><input id="cgm-att-date" required type="date" className={`${inputClass} mt-1`} value={form.sessionDate} onChange={(event) => setForm({ ...form, sessionDate: event.target.value })} /></div>
            <button type="submit" disabled={busy} className="cgm-primary-button">Create session</button>
          </form>
        )}
        {message && <div className="mt-3"><Banner tone="error">{message}</Banner></div>}
      </div>

      {sessions.length > 0 && (
        <div className={card}>
          <p className={label}>Sessions</p>
          <ul className="mt-3 divide-y divide-slate-100">
            {sessions.map((session) => (
              <li key={session.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <p className="text-sm font-bold text-slate-800">{session.title}</p>
                  <p className="text-[11px] font-semibold text-slate-400">{formatDate(session.date)} · {session.status}</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" className="mini-button" onClick={() => void openDetail(Number(session.id))}>Open</button>
                  {session.status === 'open' && (
                    <button type="button" className="mini-button" onClick={async () => { await cgm.closeAttendanceSession(Number(session.id)); await loadSessions(Number(activityId as number)); }}>Close</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {openSession && (
        <div className={card}>
          <div className="flex items-center justify-between">
            <p className={label}>{openSession.session.title} — {openSession.session.sessionDate}</p>
            <button type="button" className="mini-button" onClick={() => setOpenSession(null)}><X className="mr-1 inline h-3.5 w-3.5" /> Close panel</button>
          </div>
          <ul className="mt-3 space-y-1.5">
            {(openSession.students || []).map((student: any) => (
              <li key={student.studentId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                <span className="text-sm font-bold text-slate-700">{student.fullName}</span>
                <div className="flex gap-1">
                  {['present', 'late', 'absent', 'excused'].map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setRecords((current) => ({ ...current, [Number(student.studentId)]: status }))}
                      className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider transition ${records[Number(student.studentId)] === status ? 'bg-emerald-600 text-white' : 'bg-white text-slate-500 ring-1 ring-slate-200'}`}
                    >
                      {status.slice(0, 1)}
                      <span className="sr-only">{status}</span>
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={busy || !Object.keys(records).length}
            className="cgm-primary-button mt-4"
            onClick={async () => {
              setBusy(true);
              try {
                await cgm.saveAttendance(Number(openSession.session.id), Object.entries(records).map(([studentId, status]) => ({ studentId: Number(studentId), status })));
                setMessage('Attendance saved.');
                await openDetail(Number(openSession.session.id));
                onChanged();
              } catch (failure: any) { setMessage(failure?.message || 'Saving failed.'); }
              finally { setBusy(false); }
            }}
          >
            {busy ? 'Saving…' : 'Save attendance'}
          </button>
        </div>
      )}
    </div>
  );
};

const CalendarArea = ({ classId }: { classId: number }) => {
  const [detail, setDetail] = useState<any>(null);
  useEffect(() => { void cgm.activities(classId).then(setDetail as any).catch(() => setDetail(null)); }, [classId]);
  const rows: any[] = detail || [];
  const events: any[] = [];
  for (const activity of rows) {
    if (activity.config?.selfDeadline) events.push({ at: activity.config.selfDeadline, title: `${activity.name} — self-assignment deadline` });
    if (activity.config?.closesAt) events.push({ at: activity.config.closesAt, title: `${activity.name} closes` });
  }
  events.sort((a, b) => String(a.at).localeCompare(String(b.at)));
  return (
    <div className={card}>
      <p className={label}>Class calendar</p>
      {events.length ? (
        <ul className="mt-3 space-y-2">
          {events.map((event, index) => (
            <li key={index} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-sm">
              <span className="font-bold text-slate-700">{event.title}</span>
              <span className="text-xs font-black text-slate-400">{formatDate(event.at)}</span>
            </li>
          ))}
        </ul>
      ) : <p className="mt-3 text-xs font-medium text-slate-400">No upcoming deadlines configured.</p>}
    </div>
  );
};

const AnnouncementsArea = ({ classId, onChanged }: { classId: number; onChanged: () => void }) => {
  const [data, setData] = useState<any>(null);
  const [form, setForm] = useState({ title: '', body: '', pinned: false });
  const [attachment, setAttachment] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => { setData(await cgm.announcements(classId).catch(() => null)); }, [classId]);
  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-5">
      <div className={card}>
        <p className={label}>Publish an announcement</p>
        <form
          className="mt-3 space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            try {
              await cgm.createAnnouncement(classId, form, attachment);
              setForm({ title: '', body: '', pinned: false }); setAttachment(null);
              await load(); onChanged();
            }
            catch (failure: any) { setMessage(failure?.message || 'Publishing failed.'); }
            finally { setBusy(false); }
          }}
        >
          <input required className={inputClass} placeholder="Title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} aria-label="Title" />
          <textarea required className={`${inputClass} min-h-24`} placeholder="Message" value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} aria-label="Message" />
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
              <input type="checkbox" checked={form.pinned} onChange={(event) => setForm({ ...form, pinned: event.target.checked })} /> Pin to the top
            </label>
            <label className="text-xs font-bold text-slate-600">
              Attachment (optional, max 5 MB):{' '}
              <input type="file" className="ml-2 text-xs" onChange={(event) => setAttachment(event.target.files?.[0] || null)} aria-label="Attachment" />
            </label>
          </div>
          <button type="submit" disabled={busy} className="cgm-primary-button">{busy ? 'Publishing…' : 'Publish'}</button>
        </form>
        {message && <div className="mt-3"><Banner tone="error">{message}</Banner></div>}
      </div>

      {data?.reports?.length > 0 && (
        <div className={card}>
          <p className={label}>Open reports</p>
          <ul className="mt-3 space-y-2">
            {data.reports.map((report: any) => (
              <li key={report.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm">
                <span className="font-bold text-amber-800">“{report.title}” — {report.reason}</span>
                <button type="button" className="mini-button" onClick={async () => { await cgm.moderateAnnouncement(Number(report.announcementId), 'resolve-report'); await load(); }}>Resolve</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={card}>
        <p className={label}>Published &amp; pending</p>
        <ul className="mt-3 space-y-2">
          {(data?.announcements || []).map((row: any) => (
            <li key={row.id} className={`rounded-xl border px-4 py-3 ${row.pinned ? 'border-amber-200 bg-amber-50/40' : 'border-slate-100'}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-black text-slate-800">{row.pinned ? '📌 ' : ''}{row.title} <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-black uppercase ${row.status === 'published' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{row.status}</span></p>
                <div className="flex gap-1.5">
                  <button type="button" className="mini-button" onClick={async () => { await cgm.pinAnnouncement(Number(row.id)); await load(); }}>{row.pinned ? 'Unpin' : 'Pin'}</button>
                  {row.status === 'pending' && <button type="button" className="mini-button" onClick={async () => { await cgm.moderateAnnouncement(Number(row.id), 'approve'); await load(); }}>Approve</button>}
                  <button type="button" className="mini-button text-red-600" onClick={async () => { await cgm.deleteAnnouncement(Number(row.id)); await load(); }}>Delete</button>
                </div>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{row.body}</p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <p className="text-[11px] font-semibold text-slate-400">{row.authorLabel} · {formatWhen(row.createdAt)}</p>
                {row.attachmentName && (
                  <a href={`${row.attachmentUrl}`} className="text-[11px] font-black text-emerald-700 underline" download>
                    📎 {row.attachmentName}
                  </a>
                )}
                {row.status === 'published' && (
                  <button
                    type="button"
                    className="text-[11px] font-black uppercase tracking-wider text-slate-500 hover:text-emerald-700"
                    onClick={async () => {
                      try {
                        const reads = await cgm.announcementReads(Number(row.id));
                        const names = (reads.readers || []).map((reader: any) => reader.fullName).join(', ');
                        await appDialog.alert({
                          title: `Seen by ${reads.count} student${reads.count === 1 ? '' : 's'}`,
                          message: names || 'No read receipts yet.',
                        });
                      } catch { /* the viewer failed silently */ }
                    }}
                  >
                    Seen by {row.readCount ?? 0}
                  </button>
                )}
              </div>
            </li>
          ))}
          {!(data?.announcements || []).length && <li className="py-4 text-center text-xs font-medium text-slate-400">Nothing published yet.</li>}
        </ul>
      </div>
    </div>
  );
};

const formatWhen = (value: unknown) => {
  if (!value) return '—';
  const date = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return String(value);
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const NotificationsArea = ({ classId }: { classId: number }) => <ApprovalsArea classId={classId} canRegistrations={false} canMemberships={false} canProfiles={false} onChanged={() => {}} compact />;

const ReportsArea = ({ classId }: { classId: number }) => {
  const [format, setFormat] = useState<'csv' | 'xlsx' | 'pdf'>('csv');
  const reports: Array<[string, string]> = [
    ['roster', 'Class roster'], ['activities', 'Activities overview'], ['assignments', 'Group assignments'], ['movements', 'Group movements'],
    ['leadership', 'Leadership appointments'], ['elections', 'Elections'], ['turnout', 'Election turnout'],
    ['attendance', 'Attendance'], ['pending', 'Pending requests'], ['organizer-actions', 'Organizer actions'],
  ];
  return (
    <div className={card}>
      <p className={label}>Reports &amp; exports</p>
      <p className="mt-1 text-xs font-medium text-slate-500">Downloads respect your permissions — sensitive columns only appear with the sensitive-data permission.</p>
      <div className="mt-3 flex gap-1.5" role="radiogroup" aria-label="Export format">
        {(['csv', 'xlsx', 'pdf'] as const).map((key) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={format === key}
            onClick={() => setFormat(key)}
            className={`rounded-full px-3.5 py-1.5 text-[10px] font-black uppercase tracking-wider transition ${format === key ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700'}`}
          >
            {key === 'xlsx' ? 'Excel' : key.toUpperCase()}
          </button>
        ))}
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {reports.map(([kind, text]) => (
          <button key={kind} type="button" className="mini-button justify-start" onClick={() => void downloadReport(classId, kind, format).catch(() => {})}>
            <FileText className="mr-1.5 inline h-3.5 w-3.5" /> {text}
          </button>
        ))}
      </div>
    </div>
  );
};

const TemplatesArea = ({ classId, onChanged }: { classId: number; onChanged: () => void }) => {
  const [templates, setTemplates] = useState<any[]>([]);
  const load = useCallback(async () => { setTemplates(await cgm.templates(classId).catch(() => [])); }, [classId]);
  useEffect(() => { void load(); }, [load]);
  return (
    <div className={card}>
      <p className={label}>Activity templates</p>
      <p className="mt-1 text-xs font-medium text-slate-500">Save an activity&apos;s configuration from its row in Grouping Activities. Templates copy settings only — never students, votes or attendance.</p>
      <ul className="mt-3 space-y-2">
        {templates.map((template) => (
          <li key={template.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2.5 text-sm">
            <div>
              <p className="font-bold text-slate-700">{template.name}</p>
              <p className="text-[11px] text-slate-400">{template.config.method} · groups of {template.config.targetGroupSize || template.config.groupCount || '—'} · {template.config.genderRule}</p>
            </div>
            <button type="button" className="mini-button text-red-600" onClick={async () => { await cgm.deleteTemplate(Number(template.id)); await load(); onChanged(); }}>Delete</button>
          </li>
        ))}
        {!templates.length && <li className="py-4 text-center text-xs font-medium text-slate-400">No templates saved yet.</li>}
      </ul>
    </div>
  );
};

const ApprovalsArea = ({ classId, canRegistrations, canMemberships, canProfiles, onChanged, compact, delegated }: { classId: number; canRegistrations: boolean; canMemberships: boolean; canProfiles: boolean; onChanged: () => void; compact?: boolean; delegated?: boolean }) => {
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [memberships, setMemberships] = useState<any[]>([]);
  const [profileChanges, setProfileChanges] = useState<any[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [issuedPasskeys, setIssuedPasskeys] = useState<Array<{ name: string; passkey: string }>>([]);

  const load = useCallback(async () => {
    if (canRegistrations) setRegistrations(await cgm.registrations(classId).catch(() => []));
    if (canMemberships) setMemberships(await cgm.membershipRequests(classId).catch(() => []));
    if (canProfiles) setProfileChanges(await cgm.profileChanges(classId).catch(() => []));
  }, [classId, canRegistrations, canMemberships, canProfiles]);
  useEffect(() => { if (!compact) void load(); }, [load, compact]);

  if (compact) {
    return (
      <div className={card}>
        <p className={label}>Approvals inbox</p>
        <p className="mt-2 text-xs font-medium text-slate-500">Registration, membership and profile-change requests collect in Approvals, and in your member notifications.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {delegated && (
        <Banner tone="info">PHANTOM delegated registration approvals for this class to you — the registration queue below works even though you hold no other permissions here.</Banner>
      )}
      {issuedPasskeys.length > 0 && (
        <div className={`${card} border-emerald-300 bg-emerald-50/60`}>
          <p className={label}>Passkeys issued just now — shown once</p>
          <ul className="mt-2 space-y-1">
            {issuedPasskeys.map((entry) => (
              <li key={entry.passkey} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm">
                <span className="font-bold text-slate-700">{entry.name}</span>
                <span className="font-mono font-black text-emerald-700">{entry.passkey}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] font-medium text-slate-500">The student sees theirs too. Only a PBKDF2 verifier is stored — this raw value cannot be recovered later.</p>
        </div>
      )}
      {message && <Banner tone="error">{message}</Banner>}

      {canRegistrations && (
        <div className={card}>
          <p className={label}>Student registrations ({registrations.length})</p>
          <ul className="mt-3 divide-y divide-slate-100">
            {registrations.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <p className="text-sm font-black text-slate-800">{row.fullName}</p>
                  <p className="text-[11px] font-semibold text-slate-400">{row.indexNumber}{row.universityId ? ` · ${row.universityId}` : ''} · requested {formatWhen(row.createdAt)}</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" className="cgm-primary-button" onClick={async () => {
                    try {
                      const result = await cgm.approveRegistration(classId, Number(row.id));
                      if ((result as any)?.passkey) setIssuedPasskeys((current) => [...current, { name: row.fullName, passkey: (result as any).passkey }]);
                      await load(); onChanged();
                    } catch (failure: any) { setMessage(failure?.message || 'Approval failed.'); }
                  }}>Approve</button>
                  <button type="button" className="mini-button text-red-600" onClick={async () => {
                    try { await cgm.rejectRegistration(classId, Number(row.id), 'Rejected by organizer'); await load(); onChanged(); }
                    catch (failure: any) { setMessage(failure?.message || 'Rejection failed.'); }
                  }}>Reject</button>
                </div>
              </li>
            ))}
            {!registrations.length && <li className="py-4 text-center text-xs font-medium text-slate-400">No pending registrations.</li>}
          </ul>
        </div>
      )}

      {canMemberships && (
        <div className={card}>
          <p className={label}>Membership requests ({memberships.length})</p>
          <ul className="mt-3 divide-y divide-slate-100">
            {memberships.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <p className="text-sm font-black text-slate-800">{row.fullName}</p>
                  <p className="text-[11px] font-semibold text-slate-400">{row.indexNumber} · {formatWhen(row.createdAt)}{row.reason ? ` · ${row.reason}` : ''}</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" className="cgm-primary-button" onClick={async () => { await cgm.reviewMembership(classId, Number(row.id), true); await load(); onChanged(); }}>Approve</button>
                  <button type="button" className="mini-button text-red-600" onClick={async () => { await cgm.reviewMembership(classId, Number(row.id), false, 'Declined by organizer'); await load(); }}>Decline</button>
                </div>
              </li>
            ))}
            {!memberships.length && <li className="py-4 text-center text-xs font-medium text-slate-400">No pending requests.</li>}
          </ul>
        </div>
      )}

      {canProfiles && (
        <div className={card}>
          <p className={label}>Profile change requests ({profileChanges.length})</p>
          <ul className="mt-3 divide-y divide-slate-100">
            {profileChanges.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <p className="text-sm font-black text-slate-800">{row.fullName} — {String(row.field).replace(/_/g, ' ')}</p>
                  <p className="text-[11px] font-semibold text-slate-400">
                    <span className="line-through">{row.oldValue || '—'}</span> → <span className="text-emerald-700">{row.newValue}</span>
                    {row.reason ? ` · “${row.reason}”` : ''}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button type="button" className="cgm-primary-button" onClick={async () => { await cgm.reviewProfileChange(classId, Number(row.id), true); await load(); onChanged(); }}>Approve</button>
                  <button type="button" className="mini-button text-red-600" onClick={async () => { await cgm.reviewProfileChange(classId, Number(row.id), false, 'Declined by organizer'); await load(); }}>Decline</button>
                </div>
              </li>
            ))}
            {!profileChanges.length && <li className="py-4 text-center text-xs font-medium text-slate-400">No pending change requests.</li>}
          </ul>
        </div>
      )}
    </div>
  );
};

const PermissionsArea = ({ classId, onChanged }: { classId: number; onChanged: () => void }) => {
  const [detail, setDetail] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('co_organizer');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const ALL_PERMISSIONS: Array<[string, string]> = [
    ['view_roster', 'View roster'], ['import_roster', 'Import roster'], ['edit_roster', 'Edit roster'],
    ['approve_registrations', 'Approve registrations'], ['approve_memberships', 'Approve memberships'],
    ['review_profile_changes', 'Review profile changes'], ['manage_activities', 'Create activities'],
    ['generate_groups', 'Generate groups'], ['move_students', 'Move students'], ['remove_students', 'Remove students'],
    ['manage_elections', 'Manage elections'], ['appoint_leaders', 'Appoint leaders'],
    ['manage_announcements', 'Announcements'], ['manage_attendance', 'Attendance'],
    ['manage_whatsapp', 'WhatsApp links'], ['generate_reports', 'Reports'], ['archive_activities', 'Archive'],
    ['manage_invitations', 'Invitations'], ['view_sensitive_profiles', 'Sensitive student data'],
    ['manage_class_settings', 'Class settings'],
  ];

  const load = useCallback(async () => { setDetail(await cgm.classDetail(classId).catch(() => null)); }, [classId]);
  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-5">
      <div className={card}>
        <p className={label}>Class team</p>
        <form
          className="mt-3 flex flex-wrap items-end gap-2"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            try { await cgm.addTeamMember(classId, { email, role, permissions: [...selected] }); setEmail(''); setSelected(new Set()); await load(); onChanged(); }
            catch (failure: any) { setMessage(failure?.message || 'Could not add the member.'); }
            finally { setBusy(false); }
          }}
        >
          <div><label className={label} htmlFor="cgm-team-email">Member email</label><input id="cgm-team-email" required type="email" className={`${inputClass} mt-1`} value={email} onChange={(event) => setEmail(event.target.value)} /></div>
          <div><label className={label} htmlFor="cgm-team-role">Role</label>
            <select id="cgm-team-role" className={`${inputClass} mt-1`} value={role} onChange={(event) => setRole(event.target.value)}>
              <option value="co_organizer">Co-organizer</option>
              <option value="assistant">Assistant (task-scoped)</option>
            </select>
          </div>
          <button type="submit" disabled={busy} className="cgm-primary-button">Add</button>
        </form>
        {message && <div className="mt-3"><Banner tone="error">{message}</Banner></div>}
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-black uppercase tracking-wider text-emerald-700">Choose granular permissions</summary>
          <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {ALL_PERMISSIONS.map(([key, text]) => (
              <label key={key} className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                <input
                  type="checkbox"
                  checked={selected.has(key)}
                  onChange={(event) => setSelected((current) => {
                    const next = new Set(current);
                    if (event.target.checked) next.add(key); else next.delete(key);
                    return next;
                  })}
                />
                {text}
              </label>
            ))}
          </div>
        </details>
      </div>

      {detail && (
        <div className={card}>
          <p className={label}>Current team</p>
          <ul className="mt-3 divide-y divide-slate-100">
            {detail.team.map((member: any) => (
              <li key={member.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <p className="text-sm font-black text-slate-800">{member.name} <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-black uppercase text-slate-500">{member.role.replace('_', ' ')}</span></p>
                  <p className="text-[11px] font-semibold text-slate-400">{member.email} · {member.status === 'active' ? `${member.permissions.length} permissions` : 'revoked'}</p>
                </div>
                {member.role !== 'primary' && member.status === 'active' && (
                  <button type="button" className="mini-button text-red-600" onClick={async () => { await cgm.updateTeamMember(classId, Number(member.id), { revoke: true }); await load(); onChanged(); }}>Revoke</button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

const ArchivesArea = ({ classId }: { classId: number }) => {
  const [data, setData] = useState<any>(null);
  const load = useCallback(async () => { setData(await cgm.archives(classId).catch(() => null)); }, [classId]);
  useEffect(() => { void load(); }, [load]);
  return (
    <div className="space-y-5">
      <div className={card}>
        <p className={label}>Archives</p>
        <p className="mt-1 text-xs font-medium text-slate-500">Completed, cancelled and archived activities with their publication, completion and archive snapshots.</p>
      </div>
      {data?.activities?.length ? (
        <div className={card}>
          <ul className="divide-y divide-slate-100">
            {data.activities.map((row: any) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <p className="text-sm font-black text-slate-800">{row.name}</p>
                  <p className="text-[11px] font-semibold text-slate-400">{row.status} · {row.assignedCount} assigned · {row.cancelledReason || ''}</p>
                </div>
                <span className="text-xs font-bold text-slate-400">{formatDate(row.completedAt || row.archivedAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : <EmptyArea icon={Archive} title="Nothing archived" text="Completed activities land here with their snapshots." />}
      {data?.snapshots?.length ? (
        <div className={card}>
          <p className={label}>Snapshots</p>
          <ul className="mt-3 space-y-2">
            {data.snapshots.slice(0, 20).map((row: any) => (
              <li key={row.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2.5 text-xs">
                <span className="font-bold text-slate-600">Activity #{row.activityId} · {row.kind}</span>
                <span className="text-slate-400">{formatDate(row.createdAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
};

const SettingsArea = ({ classId, onChanged }: { classId: number; onChanged: () => void }) => {
  const [detail, setDetail] = useState<any>(null);
  const [entryPassword, setEntryPassword] = useState('');
  const [visibleFields, setVisibleFields] = useState<Set<string>>(new Set());
  const [approvalRequired, setApprovalRequired] = useState(true);
  const [identifiers, setIdentifiers] = useState<Set<string>>(new Set(['index_number']));
  const [allowChange, setAllowChange] = useState(false);
  const [passkeyPrefix, setPasskeyPrefix] = useState('rx30');
  const [prefixDraft, setPrefixDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const data = await cgm.classDetail(classId).catch(() => null);
    setDetail(data);
    setPasskeyPrefix(String(data?.class?.passkeyPrefix || 'rx30'));
    if (data?.settings) {
      setVisibleFields(new Set(data.settings.studentVisibleFields || []));
      setApprovalRequired(data.settings.membershipApprovalRequired !== false);
      setIdentifiers(new Set(data.settings.loginFormat?.identifiers || ['index_number']));
      setAllowChange(Boolean(data.settings.loginFormat?.allowStudentPasskeyChange));
    }
  }, [classId]);
  useEffect(() => { void load(); }, [load]);

  if (!detail) return <p className="text-sm font-semibold text-slate-400">Loading settings…</p>;
  const pending = detail.settings?.pendingLoginFormat;

  return (
    <div className="space-y-5">
      {message && <Banner tone="success">{message}</Banner>}

      <div className={card}>
        <p className={label}>Class entry password</p>
        <p className="mt-1 text-xs font-medium text-slate-500">Used once, at registration, together with the index number. Stored only as a secure verifier; rotating it invalidates the old value.</p>
        <form
          className="mt-3 flex flex-wrap items-end gap-2"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            try { await cgm.rotateEntryPassword(classId, entryPassword); setEntryPassword(''); setMessage('Entry password updated.'); await load(); }
            catch (failure: any) { setMessage(failure?.message || 'The update failed.'); }
            finally { setBusy(false); }
          }}
        >
          <div><label className={label} htmlFor="cgm-entry-pw">New password (min 6)</label><input id="cgm-entry-pw" required minLength={6} type="password" className={`${inputClass} mt-1`} value={entryPassword} onChange={(event) => setEntryPassword(event.target.value)} /></div>
          <button type="submit" disabled={busy} className="cgm-primary-button">Save &amp; rotate</button>
          <span className="text-[11px] font-bold uppercase text-slate-400">{detail.class.entryPasswordSet ? 'currently set' : 'not set — required before submission'}</span>
        </form>
      </div>

      <div className={card}>
        <p className={label}>Passkey mark for this class</p>
        <p className="mt-1 text-xs font-medium text-slate-500">
          New students approved through this class get passkeys that start with your mark. The default is <strong>rx30</strong>; the letters after the mark stay globally unique forever, so two classes can even share a mark without colliding. Students who already have a passkey keep theirs — nothing is ever rewritten.
        </p>
        <form
          className="mt-3 flex flex-wrap items-end gap-2"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            try {
              const result: any = await cgm.setPasskeyPrefix(classId, prefixDraft);
              setMessage(String(result?.message || 'Passkey mark updated.'));
              setPrefixDraft('');
              await load();
            } catch (failure: any) { setMessage(failure?.message || 'The update failed.'); }
            finally { setBusy(false); }
          }}
        >
          <div>
            <label className={label} htmlFor="cgm-passkey-prefix">New mark (2–10 lowercase letters/digits, empty = default rx30)</label>
            <input
              id="cgm-passkey-prefix"
              className={`${inputClass} mt-1 font-mono`}
              value={prefixDraft}
              onChange={(event) => setPrefixDraft(event.target.value)}
              placeholder={`currently ${passkeyPrefix}`}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <button type="submit" disabled={busy} className="cgm-primary-button">Save passkey mark</button>
          <span className="text-[11px] font-bold uppercase text-slate-400">current: {passkeyPrefix}</span>
        </form>
      </div>

      <div className={card}>
        <p className={label}>Student login format</p>
        <p className="mt-1 text-xs font-medium text-slate-500">The passkey is always required. Choose the confirming identifier and whether students may change their own passkey. Changes follow propose → notify → activate.</p>
        <div className="mt-3 flex flex-wrap gap-3">
          {['index_number', 'university_id', 'phone'].map((key) => (
            <label key={key} className="flex items-center gap-2 text-xs font-bold text-slate-600">
              <input
                type="checkbox"
                checked={identifiers.has(key)}
                onChange={(event) => setIdentifiers((current) => {
                  const next = new Set(current);
                  if (event.target.checked) next.add(key);
                  else if (next.size > 1) next.delete(key);
                  return next;
                })}
              />
              {key === 'index_number' ? 'Index number' : key === 'university_id' ? 'University ID' : 'Phone'}
            </label>
          ))}
          <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
            <input type="checkbox" checked={allowChange} onChange={(event) => setAllowChange(event.target.checked)} /> Students may change passkeys
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="mini-button"
            onClick={async () => {
              try { await cgm.proposeLoginFormat(classId, { identifiers: [...identifiers], allowStudentPasskeyChange: allowChange }); setMessage('Proposed — students have been notified.'); await load(); }
              catch (failure: any) { setMessage(failure?.message || 'Failed.'); }
            }}
          >
            Propose change
          </button>
          {pending && (
            <>
              <button type="button" className="cgm-primary-button" onClick={async () => { await cgm.activateLoginFormat(classId); setMessage('New login format is active.'); await load(); onChanged(); }}>Activate now</button>
              <button type="button" className="mini-button" onClick={async () => { await cgm.cancelLoginFormat(classId); await load(); }}>Cancel proposal</button>
            </>
          )}
        </div>
        {pending && <p className="mt-2 text-[11px] font-bold text-amber-600">Pending: passkey + {pending.identifiers.join(' / ')} (proposed {formatWhen(pending.proposedAt)})</p>}
      </div>

      <div className={card}>
        <p className={label}>Privacy &amp; approvals</p>
        <p className="mt-1 text-xs font-medium text-slate-500">Choose what classmates may see. Names are always visible; contact fields are further limited per activity to the group or the class. Index numbers, university IDs and gender are never shown to classmates — the index number is half of a sign-in credential, and sensitive data additionally needs the organizer permission.</p>
        <div className="mt-3 flex flex-wrap gap-3">
          {['full_name', 'phone', 'email'].map((key) => (
            <label key={key} className="flex items-center gap-2 text-xs font-bold text-slate-600">
              <input
                type="checkbox"
                checked={visibleFields.has(key)}
                onChange={(event) => setVisibleFields((current) => {
                  const next = new Set(current);
                  if (event.target.checked) next.add(key);
                  else if (key !== 'full_name') next.delete(key);
                  return next;
                })}
              />
              {key.replace('_', ' ')}
            </label>
          ))}
        </div>
        <label className="mt-3 flex items-center gap-2 text-xs font-bold text-slate-600">
          <input type="checkbox" checked={approvalRequired} onChange={(event) => setApprovalRequired(event.target.checked)} />
          Membership requests need organizer approval
        </label>
        <button
          type="button"
          className="cgm-primary-button mt-3"
          onClick={async () => {
            try {
              await cgm.updateSettings(classId, {
                studentVisibleFields: [...visibleFields],
                membershipApprovalRequired: approvalRequired,
                loginFormat: { identifiers: [...identifiers], allowStudentPasskeyChange: allowChange },
              });
              setMessage('Settings saved.');
              await load();
            } catch (failure: any) { setMessage(failure?.message || 'Failed.'); }
          }}
        >
          Save settings
        </button>
      </div>
    </div>
  );
};
