import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, Bell, Calendar, CheckCircle2, ChevronRight, ClipboardList, Clock, Compass, GraduationCap,
  LayoutDashboard, LogOut, User as UserIcon, Users, Vote,
} from 'lucide-react';
import { cgmStudent, CgmError, downloadMyRecords, studentSession, type CgmStudentSession } from '../../lib/cgm';
import { RandomGroupReveal } from './RandomGroupReveal';
import { ConnectionBanner } from './ConnectionBanner';
import { QrBlock } from './ClassGroupsWorkspace';

/**
 * CODE Rx — Student Portal.
 *
 * The dedicated student experience of Class & Group Management: registration
 * through a roster identity and the shared class entry password, sign-in that
 * always requires the permanent rx30 passkey, and the class, group, election,
 * attendance, calendar, profile and notification views. Students never see
 * organizer or PHANTOM controls.
 */

type Section = 'home' | 'classes' | 'groups' | 'elections' | 'attendance' | 'calendar' | 'notifications' | 'profile' | 'history';

const SECTIONS: Array<[Section, string, any]> = [
  ['home', 'Overview', LayoutDashboard],
  ['classes', 'My Classes', GraduationCap],
  ['groups', 'My Groups', Users],
  ['elections', 'My Elections', Vote],
  ['attendance', 'My Attendance', ClipboardList],
  ['calendar', 'My Calendar', Calendar],
  ['notifications', 'Notifications', Bell],
  ['profile', 'My Profile', UserIcon],
  ['history', 'Activity History', Clock],
];

const card = 'rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm shadow-emerald-950/5';
const label = 'text-[10px] font-black uppercase tracking-[0.16em] text-slate-400';
const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 focus:border-emerald-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-100';

const formatDate = (value: unknown) => {
  if (!value) return '—';
  const date = new Date(String(value).replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
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

// ---------------------------------------------------------------------------
// Registration & sign-in
// ---------------------------------------------------------------------------

const AuthScreen = ({ inviteCode, onAuthenticated }: { inviteCode: string | null; onAuthenticated: (session: CgmStudentSession) => void }) => {
  const [mode, setMode] = useState<'register' | 'login' | 'join'>(inviteCode ? 'join' : 'login');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [issuedPasskey, setIssuedPasskey] = useState<string | null>(null);
  // Everything on file for the just-registered student, shown together with
  // the one-time passkey so they can confirm what the school recorded.
  const [revealDetails, setRevealDetails] = useState<any>(null);

  // register fields
  const [classCode, setClassCode] = useState('');
  const [indexNumber, setIndexNumber] = useState('');
  const [entryPassword, setEntryPassword] = useState('');
  // login fields
  const [identifierType, setIdentifierType] = useState('index_number');
  const [identifier, setIdentifier] = useState('');
  const [passkey, setPasskey] = useState('');
  // join fields
  const [joinCode, setJoinCode] = useState(inviteCode || '');
  // Invitation continuation: the class an open invitation points at, and a
  // session awaiting the one-time passkey confirmation.
  const [invite, setInvite] = useState<any>(null);
  const [inviteProblem, setInviteProblem] = useState<string | null>(null);
  const [pendingSession, setPendingSession] = useState<CgmStudentSession | null>(null);

  useEffect(() => {
    if (!inviteCode) return;
    // An individual invitation token (64 hex chars) has no public landing —
    // it is claimed the moment its student authenticates.
    if (/^[0-9a-f]{64}$/i.test(inviteCode.trim())) { setMode('login'); return; }
    let alive = true;
    cgmStudent.invitationInfo(inviteCode.trim()).then((info: any) => {
      if (!alive) return;
      setInvite(info);
      // Guide the (typically new) invited student straight into registration
      // with the class code prefilled — the entry password is still required.
      setClassCode(String(info?.class?.code || ''));
      setMode('register');
    }).catch((failure: any) => {
      if (!alive) return;
      setInviteProblem(failure?.message || 'This invitation is not available right now.');
      setMode('login');
    });
    return () => { alive = false; };
  }, [inviteCode]);

  const identifierLabels: Record<string, string> = {
    index_number: 'Index number',
    phone: 'Telephone number',
  };

  const run = async (work: () => Promise<void>) => {
    setBusy(true); setError(null); setMessage(null);
    try { await work(); }
    catch (failure: any) { setError(failure?.message || 'Something went wrong. Try again.'); }
    finally { setBusy(false); }
  };

  // The passkey reveal is its own page: it replaces the registration form
  // completely, shows the permanent passkey once and lists every detail the
  // school has on file for this student.
  if (issuedPasskey) {
    const details = revealDetails || {};
    const detailRows: Array<[string, string]> = [
      ['Full name', String(details.fullName || '').trim() || '—'],
      ['Index number', String(details.indexNumber || indexNumber || '').trim() || '—'],
      ['Telephone', details.phone ? String(details.phone) : 'Not provided'],
      ['Email', details.email ? String(details.email) : 'Not provided'],
      ['Gender', details.gender && details.gender !== 'unknown' ? String(details.gender) : 'Not set'],
      ['Class', [details.className, details.institution].filter(Boolean).join(' · ') || classCode || '—'],
    ];
    return (
      <div className="cgm-auth-wrap" data-testid="cgm-passkey-reveal">
        <p className="text-center text-[10px] font-black uppercase tracking-[0.24em] text-emerald-700">CODE Rx Student Portal</p>
        <div className={`${card} mt-4 border-2 border-amber-300 bg-amber-50/50`}>
          <p className={label}>Passkey issued — shown only on this page</p>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900">Your permanent passkey</h1>
          <p className="mt-1 text-sm font-medium text-slate-600">Write it down now. It is never shown again and it cannot be re-issued.</p>
          <p className="mt-4 select-all rounded-2xl border-2 border-amber-400 bg-white px-4 py-5 text-center font-mono text-3xl font-black tracking-[0.16em] text-amber-900 sm:text-4xl">{issuedPasskey}</p>
          <div className="mt-5 rounded-2xl border border-slate-200 bg-white px-4 py-4">
            <p className={label}>Your details on file</p>
            <dl className="mt-2 divide-y divide-slate-100">
              {detailRows.map(([key, value]) => (
                <div key={key} className="flex items-baseline justify-between gap-3 py-1.5">
                  <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{key}</dt>
                  <dd className="text-right text-sm font-bold text-slate-800">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-[11px] font-medium text-slate-400">If anything here is wrong, tell your organizer — index numbers can only be corrected by them.</p>
          </div>
          <p className="mt-3 text-[11px] font-semibold text-slate-500">Sign-in needs this passkey together with your index number{details.phone ? ' or telephone number' : ''}.</p>
          {pendingSession ? (
            <button type="button" className="cgm-primary-button mt-4 w-full" onClick={() => onAuthenticated(pendingSession)}>
              I have saved my passkey — continue
            </button>
          ) : (
            <button type="button" className="cgm-primary-button mt-4 w-full" onClick={() => { setIssuedPasskey(null); setMode('login'); }}>
              Go to sign in
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="cgm-auth-wrap">
      <div className={card}>
        <p className={label}>CODE Rx Society</p>
        <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900">Class &amp; Group Management</h1>
        <p className="mt-1 text-sm font-medium text-slate-500">
          Students sign in with a permanent passkey that looks like <strong>rx30a</strong>, <strong>rx30b</strong> … issued once your registration is approved.
        </p>

        {inviteCode && (
          <div className={`mt-4 rounded-xl border px-4 py-3 ${inviteProblem ? 'border-amber-300 bg-amber-50' : 'border-emerald-200 bg-emerald-50/70'}`} role="status">
            {inviteProblem ? (
              <p className="text-xs font-bold text-amber-700">{inviteProblem} You can still sign in or register below{inviteProblem.includes('expired') || inviteProblem.includes('available') ? ' — ask your organizer for a fresh invitation.' : '.'}</p>
            ) : (
              <>
                <p className="text-xs font-black uppercase tracking-wider text-emerald-700">You are invited</p>
                <p className="mt-0.5 text-sm font-bold text-slate-800">{invite?.class?.name || 'A class'}{invite?.class?.institution ? ` · ${invite.class.institution}` : ''}</p>
                <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
                  {invite?.class?.code ? `Class code ${invite.class.code} · ` : ''}
                  {invite?.invitation?.remainingUses != null ? `${invite.invitation.remainingUses} places left · ` : ''}
                  New here? Register below — your invitation continues automatically after you sign in.
                </p>
              </>
            )}
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2" role="tablist" aria-label="Choose an action">
          {([['login', 'Sign in'], ['register', 'Register'], ['join', 'Join a class']] as const).map(([key, text]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={mode === key}
              onClick={() => { setMode(key); setError(null); setMessage(null); }}
              className={`rounded-full px-4 py-2 text-xs font-black uppercase tracking-wider transition ${mode === key ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
            >
              {text}
            </button>
          ))}
        </div>

        {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">{error}</p>}
        {message && <p role="status" className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{message}</p>}

        {mode === 'login' && (
          <form
            className="mt-5 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                const data = await cgmStudent.login({ identifierType, identifier, passkey });
                onAuthenticated(data.session);
              });
            }}
          >
            <div>
              <label className={label} htmlFor="cgm-identifier-type">Sign in with</label>
              <select id="cgm-identifier-type" className={`${inputClass} mt-1`} value={identifierType} onChange={(event) => setIdentifierType(event.target.value)}>
                {Object.entries(identifierLabels).map(([key, text]) => <option key={key} value={key}>{text}</option>)}
              </select>
            </div>
            <div>
              <label className={label} htmlFor="cgm-identifier">{identifierLabels[identifierType]}</label>
              <input
                id="cgm-identifier"
                required
                className={`${inputClass} mt-1`}
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                placeholder={identifierType === 'index_number' ? 'PH/PHA/24/0292' : '024 000 0001'}
                autoComplete="username"
              />
              {identifierType === 'index_number' && (
                <p className="mt-1 text-[11px] font-medium text-slate-400">Format trend: <span className="font-mono font-bold text-slate-500">PH/PHA/24/0292</span> — capitals or small letters, with slashes, dashes, dots or spaces all work.</p>
              )}
            </div>
            <div>
              <label className={label} htmlFor="cgm-passkey">Permanent passkey</label>
              <input id="cgm-passkey" required className={`${inputClass} mt-1 font-mono`} value={passkey} onChange={(event) => setPasskey(event.target.value)} placeholder="rx30a" autoComplete="current-password" />
            </div>
            <button type="submit" disabled={busy} className="cgm-primary-button w-full">
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        )}

        {mode === 'register' && (
          <form
            className="mt-5 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                const data = await cgmStudent.register({ classCode, indexNumber, entryPassword });
                if ((data as any)?.passkey) {
                  setIssuedPasskey(String((data as any).passkey));
                  setRevealDetails((data as any)?.student || { indexNumber });
                }
                if ((data as any)?.session) {
                  // Automatic approval: authenticated at once. If a passkey was
                  // just issued we stay here until the student confirms they
                  // saved it — it is never shown again.
                  const session = (data as any).session as CgmStudentSession;
                  if ((data as any)?.passkey) setPendingSession(session);
                  else onAuthenticated(session);
                  setMessage(String((data as any)?.message || 'You are in.'));
                  return;
                }
                setMessage(`${String((data as any)?.message || 'Registration received.')} Once it is approved, sign in and any invitation you opened continues automatically.`);
              });
            }}
          >
            <div>
              <label className={label} htmlFor="cgm-class-code">Class code</label>
              <input id="cgm-class-code" required className={`${inputClass} mt-1 font-mono`} value={classCode} onChange={(event) => setClassCode(event.target.value)} placeholder="CRX-CLS-0001" />
            </div>
            <div>
              <label className={label} htmlFor="cgm-index">Your index number</label>
              <input id="cgm-index" required className={`${inputClass} mt-1`} value={indexNumber} onChange={(event) => setIndexNumber(event.target.value)} placeholder="PH/PHA/24/0292" />
              <p className="mt-1 text-[11px] font-medium text-slate-400">Format trend: <span className="font-mono font-bold text-slate-500">PH/PHA/24/0292</span> — capitals or small letters, with slashes, dashes, dots or spaces all work.</p>
            </div>
            <div>
              <label className={label} htmlFor="cgm-entry">Shared class entry password</label>
              <input id="cgm-entry" required type="password" className={`${inputClass} mt-1`} value={entryPassword} onChange={(event) => setEntryPassword(event.target.value)} />
              <p className="mt-1 text-[11px] font-medium text-slate-400">From your organizer. It is only for registration — never your login.</p>
            </div>
            <button type="submit" disabled={busy} className="cgm-primary-button w-full">
              {busy ? 'Submitting…' : 'Submit registration'}
            </button>
            <p className="text-[11px] font-medium text-slate-400">Depending on the class settings, your organizer reviews registrations or they are approved automatically. Approved students receive a permanent passkey on its own page, shown once.</p>
          </form>
        )}

        {mode === 'join' && (
          <form
            className="mt-5 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                const session = studentSession.read();
                if (!session) {
                  const info = await cgmStudent.invitationInfo(joinCode.trim()).catch(() => null);
                  if (!info) throw new CgmError('This invitation is not available. Ask your organizer for a fresh one.', 404);
                  setInvite(info);
                  setClassCode(String(info?.class?.code || ''));
                  setMessage(`Invitation for ${info.class?.name || 'a class'} is valid. Register (or sign in) below — the invitation continues automatically.`);
                  setMode('register');
                  return;
                }
                const data = await cgmStudent.claimInvitation(joinCode.trim());
                setMessage(String((data as any)?.message || 'Done.'));
              });
            }}
          >
            <div>
              <label className={label} htmlFor="cgm-join-code">Invitation code</label>
              <input id="cgm-join-code" required className={`${inputClass} mt-1 font-mono`} value={joinCode} onChange={(event) => setJoinCode(event.target.value)} />
            </div>
            <button type="submit" disabled={busy} className="cgm-primary-button w-full">{busy ? 'Checking…' : 'Use invitation'}</button>
          </form>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Student shell + views
// ---------------------------------------------------------------------------

// Short-lived invitation continuation. GENERAL codes (shareable, not secret)
// may ride through sessionStorage so a page refresh or an approval wait keeps
// the context; INDIVIDUAL tokens are identity-bound secrets and live in
// memory only. Cleared on completion, cancellation, sign-out or expiry.
const INVITE_CONTINUATION_KEY = 'codeRx_cgmInviteContinuation';
const INVITE_CONTINUATION_TTL_MS = 10 * 60_000;
type InviteContinuation = { code: string; individual: boolean; expiresAt: number };
const toContinuation = (rawCode: string): InviteContinuation => {
  const code = String(rawCode || '').trim();
  return { code, individual: /^[0-9a-f]{64}$/i.test(code), expiresAt: Date.now() + INVITE_CONTINUATION_TTL_MS };
};
const readContinuation = (): InviteContinuation | null => {
  try {
    const raw = sessionStorage.getItem(INVITE_CONTINUATION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as InviteContinuation;
    if (!parsed?.code || Number(parsed.expiresAt) <= Date.now()) {
      sessionStorage.removeItem(INVITE_CONTINUATION_KEY);
      return null;
    }
    return parsed;
  } catch { return null; }
};
const clearContinuation = () => { try { sessionStorage.removeItem(INVITE_CONTINUATION_KEY); } catch { /* private mode */ } };

export const StudentPortal = ({ inviteCode, voteTarget, leaderTarget, onExit }: { inviteCode: string | null; voteTarget?: number | null; leaderTarget?: number | null; onExit: () => void }) => {
  const [session, setSession] = useState<CgmStudentSession | null>(() => studentSession.read());
  const [me, setMe] = useState<any>(null);
  const [section, setSection] = useState<Section>('home');
  const [openClassId, setOpenClassId] = useState<number | null>(null);
  const [openActivityId, setOpenActivityId] = useState<number | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pendingInvite, setPendingInvite] = useState<InviteContinuation | null>(() => (inviteCode ? toContinuation(inviteCode) : readContinuation()));
  const [inviteNotice, setInviteNotice] = useState<string | null>(null);
  const claimedInvites = useRef(new Set<string>());

  // General codes survive a refresh via a short-lived sessionStorage entry;
  // individual tokens never touch storage.
  useEffect(() => {
    if (!pendingInvite) { clearContinuation(); return; }
    if (pendingInvite.individual) return;
    try { sessionStorage.setItem(INVITE_CONTINUATION_KEY, JSON.stringify(pendingInvite)); } catch { /* private mode */ }
  }, [pendingInvite]);



  const refreshMe = useCallback(async () => {
    try {
      const data = await cgmStudent.me();
      setMe(data);
    } catch (failure: any) {
      if (failure?.status === 401) { studentSession.clear(); setSession(null); }
    } finally { setLoading(false); }
  }, []);

  const continueInvite = useCallback(async (session: CgmStudentSession | null) => {
    if (!session || !pendingInvite || claimedInvites.current.has(pendingInvite.code)) return;
    claimedInvites.current.add(pendingInvite.code);
    try {
      const result: any = await cgmStudent.claimInvitation(pendingInvite.code);
      const state = String((result as any)?.state || '');
      setInviteNotice(
        state === 'joined' ? String((result as any)?.message || 'You joined the class.')
          : state === 'requested' ? String((result as any)?.message || 'Request sent.') + ' You will see the class once the organizer approves it.'
          : String((result as any)?.message || 'Invitation used.'),
      );
    } catch (failure: any) {
      setInviteNotice(failure?.message || 'The invitation could not be used.');
    } finally {
      setPendingInvite(null);
      // Token comparison (object identity would never match a fresh parse):
      // the dashboard must show the joined class without a manual reload.
      if (session?.token && session.token === studentSession.read()?.token) void refreshMe();
    }
  }, [pendingInvite, refreshMe]);

  useEffect(() => { if (session) void refreshMe(); else setLoading(false); }, [session, refreshMe]);
  // An organizer's voting link sends the student straight to the election
  // after sign-in.
  // The focus can be cleared locally without touching the link that opened us.
  const [voteFocus, setVoteFocus] = useState<number | 'cleared' | null>(null);
  const [leaderFocus, setLeaderFocus] = useState<number | 'cleared' | null>(null);
  const effectiveVoteFocus = voteFocus === 'cleared' ? null : (voteFocus ?? voteTarget ?? null);
  const effectiveLeaderFocus = leaderFocus === 'cleared' ? null : (leaderFocus ?? leaderTarget ?? null);
  useEffect(() => { if (voteTarget) setSection('elections'); }, [voteTarget]);
  useEffect(() => { if (leaderTarget) setSection('elections'); }, [leaderTarget]);

  if (!session) {
    return <AuthScreen inviteCode={inviteCode} onAuthenticated={(next) => { setSession(next); void refreshMe(); void continueInvite(next); }} />;
  }

  const unread = Number(me?.unreadNotifications || 0);

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
            <p className="text-sm font-black text-slate-900">CODE Rx Student Portal</p>
            <p className="text-[11px] font-semibold text-slate-400">{me?.student?.fullName || '…'} · {me?.student?.indexNumber || ''}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="mini-button" onClick={() => { void cgmStudent.logout(); studentSession.clear(); clearContinuation(); setPendingInvite(null); setSession(null); setMe(null); }}>
            <LogOut className="mr-1 inline h-3.5 w-3.5" /> Sign out
          </button>
          <button type="button" className="mini-button" onClick={onExit}>Exit</button>
        </div>
      </header>
      {inviteNotice && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <p className="text-sm font-bold text-emerald-800">{inviteNotice}</p>
          <button type="button" className="mini-button" onClick={() => setInviteNotice(null)}>Dismiss</button>
        </div>
      )}


      <div className="cgm-body">
        <nav className={`cgm-sidenav ${navOpen ? 'cgm-sidenav--open' : ''}`} aria-label="Student navigation">
          {SECTIONS.map(([key, text, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => { setSection(key); setOpenClassId(null); setOpenActivityId(null); setNavOpen(false); }}
              aria-current={section === key ? 'page' : undefined}
              className={`cgm-side-link ${section === key ? 'cgm-side-link--active' : ''}`}
            >
              <Icon className="h-4 w-4" />
              <span className="flex-1 text-left">{text}</span>
              {key === 'notifications' && unread > 0 && (
                <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-black text-white">{unread}</span>
              )}
            </button>
          ))}
        </nav>

        <main className="cgm-main">
          {loading && <p className="text-sm font-semibold text-slate-400">Loading your portal…</p>}
          {!loading && section === 'home' && (
            <StudentHome
              me={me}
              onOpenClass={(id) => { setOpenClassId(id); setSection('classes'); }}
              onOpenGroups={() => { setOpenActivityId(null); setSection('groups'); }}
            />
          )}
          {!loading && section === 'classes' && (openClassId
            ? <ClassDetailView classId={openClassId} onBack={() => setOpenClassId(null)} onOpenActivity={(id) => { setOpenActivityId(id); setSection('groups'); }} me={me} onGenderSet={refreshMe} />
            : <MyClassesView me={me} onOpen={(id) => setOpenClassId(id)} onRefresh={refreshMe} inviteCode={inviteCode} />)}
          {!loading && section === 'groups' && <MyGroupsView me={me} openActivityId={openActivityId} onOpenActivity={setOpenActivityId} onChanged={refreshMe} />}
          {!loading && section === 'elections' && (
            <MyElectionsView
              focusElectionId={effectiveVoteFocus}
              onClearFocus={() => setVoteFocus('cleared')}
              leaderElectionId={effectiveLeaderFocus}
              onClearLeader={() => setLeaderFocus('cleared')}
            />
          )}
          {!loading && section === 'attendance' && <AttendanceView />}
          {!loading && section === 'calendar' && <CalendarView />}
          {!loading && section === 'notifications' && <NotificationsView onChanged={refreshMe} />}
          {!loading && section === 'profile' && <ProfileView me={me} onChanged={refreshMe} />}
          {!loading && section === 'history' && <HistoryView me={me} />}
        </main>
      </div>
    </div>
  );
};

const Empty = ({ icon: Icon, title, text }: { icon: any; title: string; text: string }) => (
  <div className={ `${card} text-center` }>
    <Icon className="mx-auto h-6 w-6 text-emerald-500" />
    <p className="mt-3 text-sm font-black text-slate-800">{title}</p>
    <p className="mt-1 text-xs font-medium text-slate-500">{text}</p>
  </div>
);

/** Every class door gets its OWN stable colour + monogram, so students
 * recognise where each button leads at a glance — navigation by sight. */
const CLASS_ACCENTS = [
  { tile: 'bg-emerald-600', bar: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700', ring: 'hover:border-emerald-300' },
  { tile: 'bg-sky-600', bar: 'bg-sky-500', chip: 'bg-sky-50 text-sky-700', ring: 'hover:border-sky-300' },
  { tile: 'bg-violet-600', bar: 'bg-violet-500', chip: 'bg-violet-50 text-violet-700', ring: 'hover:border-violet-300' },
  { tile: 'bg-amber-500', bar: 'bg-amber-400', chip: 'bg-amber-50 text-amber-700', ring: 'hover:border-amber-300' },
  { tile: 'bg-rose-600', bar: 'bg-rose-500', chip: 'bg-rose-50 text-rose-700', ring: 'hover:border-rose-300' },
  { tile: 'bg-teal-600', bar: 'bg-teal-500', chip: 'bg-teal-50 text-teal-700', ring: 'hover:border-teal-300' },
];
const accentForClass = (code: string) => CLASS_ACCENTS[
  [...String(code || '?')].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % CLASS_ACCENTS.length
];
const monogramOf = (name: string) => (
  String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join('').toUpperCase() || '?'
);

const ClassNavCard = ({ entry, onOpen, detail }: { entry: any; onOpen: () => void; detail?: string }) => {
  const accent = accentForClass(entry.code);
  return (
    <button
      type="button"
      data-testid="cgm-class-nav-card"
      onClick={onOpen}
      aria-label={`Open ${entry.name}`}
      className={`${card} group relative overflow-hidden text-left transition hover:-translate-y-0.5 hover:shadow-lg ${accent.ring}`}
    >
      <span className={`absolute inset-y-0 left-0 w-1.5 ${accent.bar}`} aria-hidden="true" />
      <div className="flex items-start gap-3 pl-2.5">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl text-sm font-black text-white ${accent.tile}`} aria-hidden="true">
          {monogramOf(entry.name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span className="truncate font-black text-slate-900">{entry.name}</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-emerald-500" />
          </span>
          <span className="mt-0.5 block truncate text-xs font-semibold text-slate-500">
            {entry.code} · {detail || entry.institution || '—'}
          </span>
          <span className="mt-2 flex items-center justify-between gap-2">
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${entry.member_status === 'active' ? accent.chip : 'bg-red-50 text-red-600'}`}>
              {entry.member_status === 'active' ? 'Active member' : 'Suspended'}
            </span>
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600">Open →</span>
          </span>
        </span>
      </div>
    </button>
  );
};

const StudentHome = ({ me, onOpenClass, onOpenGroups }: { me: any; onOpenClass: (id: number) => void; onOpenGroups: () => void }) => {
  const classes: any[] = me?.classes || [];
  const pending = [...(me?.pendingMemberships || []), ...(me?.pendingRegistrations || [])];
  return (
    <div className="space-y-5">
      <div className={card}>
        <p className={label}>Welcome back</p>
        <h2 className="mt-1 text-xl font-black text-slate-900">{me?.student?.fullName}</h2>
        <p className="mt-1 text-xs font-medium text-slate-500">
          {classes.length ? `You are an active member of ${classes.length} class${classes.length === 1 ? '' : 'es'}.` : 'You are not in any class yet. Use an invitation code under Join a class.'}
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-emerald-50 p-4"><p className={label}>Active classes</p><p className="mt-1 text-2xl font-black text-emerald-800">{classes.length}</p></div>
          <div className="rounded-xl bg-slate-50 p-4"><p className={label}>Pending requests</p><p className="mt-1 text-2xl font-black text-slate-800">{pending.length}</p></div>
          <div className="rounded-xl bg-amber-50 p-4"><p className={label}>Unread notices</p><p className="mt-1 text-2xl font-black text-amber-800">{Number(me?.unreadNotifications || 0)}</p></div>
        </div>
      </div>

      {classes.length > 0 && (
        <button
          type="button"
          data-testid="cgm-continue-groups"
          onClick={onOpenGroups}
          className="flex w-full items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 px-5 py-4 text-left text-white shadow-lg shadow-emerald-600/25 transition hover:from-emerald-500 hover:to-teal-400"
        >
          <span>
            <span className="block text-sm font-black uppercase tracking-wider">Continue to choose group</span>
            <span className="mt-0.5 block text-[11px] font-semibold text-emerald-50">Pick your group straight away — open My Groups.</span>
          </span>
          <Compass className="h-6 w-6 shrink-0" aria-hidden="true" />
        </button>
      )}

      {classes.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {classes.map((entry) => (
            <ClassNavCard key={entry.class_id} entry={entry} onOpen={() => onOpenClass(Number(entry.class_id))} />
          ))}
        </div>
      )}

      {pending.length > 0 && (
        <div className={card}>
          <p className={label}>Awaiting review</p>
          <ul className="mt-3 space-y-2">
            {pending.map((row: any) => (
              <li key={`${row.id}`} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-sm">
                <span className="font-bold text-slate-700">{row.class_name || row.name}</span>
                <span className="inline-flex items-center gap-1 text-xs font-black uppercase tracking-wider text-amber-600"><Clock className="h-3.5 w-3.5" /> Pending</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

const MyClassesView = ({ me, onOpen, onRefresh, inviteCode }: { me: any; onOpen: (id: number) => void; onRefresh: () => void; inviteCode: string | null }) => {
  const [code, setCode] = useState(inviteCode || '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const classes: any[] = me?.classes || [];

  return (
    <div className="space-y-5">
      <div className={card}>
        <p className={label}>Join a class</p>
        <form
          className="mt-3 flex flex-wrap gap-2"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true); setMessage(null);
            try {
              const data = await cgmStudent.joinClass(code.trim());
              setMessage(String((data as any)?.message || 'Request sent.'));
              onRefresh();
            } catch (failure: any) { setMessage(failure?.message || 'That code did not work.'); }
            finally { setBusy(false); }
          }}
        >
          <input required value={code} onChange={(event) => setCode(event.target.value)} placeholder="Invitation code" className={`${inputClass} max-w-xs flex-1 font-mono`} aria-label="Invitation code" />
          <button type="submit" disabled={busy} className="cgm-primary-button">{busy ? 'Sending…' : 'Request to join'}</button>
        </form>
        {message && <p role="status" className="mt-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{message}</p>}
      </div>

      {classes.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {classes.map((entry) => (
            <ClassNavCard
              key={entry.class_id}
              entry={entry}
              onOpen={() => onOpen(Number(entry.class_id))}
              detail={`${entry.department || entry.institution || '—'}${entry.academic_year ? ` · ${entry.academic_year}` : ''}`}
            />
          ))}
        </div>
      ) : (
        <Empty icon={GraduationCap} title="No classes yet" text="Ask your organizer for an invitation code or link." />
      )}
    </div>
  );
};

const ClassDetailView = ({ classId, onBack, onOpenActivity, me, onGenderSet }: { classId: number; onBack: () => void; onOpenActivity: (id: number) => void; me?: any; onGenderSet?: () => void }) => {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [genderBusy, setGenderBusy] = useState(false);
  const [genderNote, setGenderNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setData(await cgmStudent.classDashboard(classId)); }
    catch (failure: any) { setError(failure?.message || 'This class could not be loaded.'); }
  }, [classId]);

  useEffect(() => { void load(); }, [load]);

  if (error) return <div className={card}><p className="text-sm font-bold text-red-600">{error}</p><button type="button" onClick={onBack} className="mini-button mt-3">Back</button></div>;
  if (!data) return <p className="text-sm font-semibold text-slate-400">Loading class…</p>;

  const attendance = (data.attendanceSummary || []).reduce((acc: any, row: any) => ({ ...acc, [row.status]: Number(row.c) }), {} as Record<string, number>);
  // Gender self-service: gender-balanced activities need it, and only the
  // organizer can set it once a value exists.
  const genderNeeded = (data.activities || []).some((activity: any) => activity.config?.genderRule && activity.config.genderRule !== 'none');
  const genderUnknown = String(me?.student?.gender || 'unknown') === 'unknown';

  const setMyGender = async (gender: string) => {
    setGenderBusy(true); setGenderNote(null);
    try {
      const result = await cgmStudent.setGender(gender);
      setGenderNote(String(result?.message || 'Your gender was saved.'));
      await load();
      onGenderSet?.();
    } catch (failure: any) {
      setGenderNote(failure?.message || 'Could not save your gender.');
    } finally { setGenderBusy(false); }
  };

  return (
    <div className="space-y-5">
      <button type="button" onClick={onBack} className="mini-button"><ArrowLeft className="mr-1 inline h-3.5 w-3.5" /> All classes</button>
      <div className={card}>
        <p className={label}>{data.class.code}</p>
        <h2 className="mt-1 text-xl font-black text-slate-900">{data.class.name}</h2>
        <p className="mt-1 text-xs font-medium text-slate-500">
          {[data.class.institution, data.class.department, data.class.academic_year, data.class.level].filter(Boolean).join(' · ')}
        </p>
        {data.class.description && <p className="mt-3 text-sm font-medium text-slate-600">{data.class.description}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          {(data.organizers || []).map((row: any, index: number) => (
            <span key={index} className="rounded-full bg-emerald-50 px-3 py-1.5 text-[11px] font-black text-emerald-700">
              {row.role === 'primary' ? 'Primary organizer' : row.role === 'co_organizer' ? 'Co-organizer' : 'Assistant'} · {row.name}
            </span>
          ))}
        </div>
      </div>

      {genderNeeded && genderUnknown && (
        <div className={`${card} border-amber-200 bg-amber-50/40`} data-testid="cgm-gender-prompt">
          <p className={label}>Set your gender</p>
          <p className="mt-1 text-sm font-medium text-slate-600">A grouping activity in this class balances groups by gender, and your organizer has not recorded one for you. Choose below before you pick a group — you cannot change it afterwards.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={genderBusy} className="cgm-primary-button" onClick={() => void setMyGender('male')}>Male</button>
            <button type="button" disabled={genderBusy} className="cgm-primary-button" onClick={() => void setMyGender('female')}>Female</button>
          </div>
          {genderNote && <p role="status" className="mt-3 rounded-xl bg-white px-3 py-2 text-xs font-bold text-emerald-700">{genderNote}</p>}
        </div>
      )}

      {(data.classmates || []).length > 0 && (
        <div className={card}>
          <p className={label}>Classmates ({(data.classmates || []).length})</p>
          <p className="mt-1 text-xs font-medium text-slate-500">Contact details appear only for fields your organizer made visible to classmates.</p>
          <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
            {(data.classmates || []).map((member: any) => (
              <li key={member.studentId} className="rounded-xl bg-slate-50 px-4 py-2.5">
                <p className="text-sm font-bold text-slate-700">{member.fullName}</p>
                {(member.phone || member.email) && (
                  <p className="text-[11px] font-semibold text-slate-400">{[member.phone, member.email].filter(Boolean).join(' · ')}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(data.activities || []).length > 0 && (
        <div className={card}>
          <p className={label}>Grouping activities</p>
          <div className="mt-3 space-y-2">
            {data.activities.map((activity: any) => {
              const live = ['open', 'published', 'active'].includes(String(activity.status));
              const forced = activity.config?.method === 'random';
              const mine = (data.myGroups || []).find((row: any) => Number(row.activity_id) === Number(activity.id));
              const hint = mine
                ? `Continue — you are in ${mine.group_name}`
                : !live ? 'Not open right now'
                : forced ? 'Random selection — tap to draw your group'
                : 'Continue — choose your group';
              return (
                <button key={activity.id} type="button" data-testid="cgm-student-activity-card" onClick={() => onOpenActivity(Number(activity.id))} className={`group flex w-full items-center gap-3 rounded-2xl border-2 px-4 py-3.5 text-left transition ${live ? 'border-emerald-300 bg-gradient-to-r from-emerald-50 via-white to-amber-50/70 hover:border-emerald-400 hover:shadow-[0_10px_24px_-12px_rgba(16,185,129,0.5)]' : 'border-slate-100 bg-slate-50/60'}`}>
                  <span aria-hidden="true" className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg ${live ? 'bg-emerald-600 text-white shadow-[0_6px_14px_-6px_rgba(5,150,105,0.7)]' : 'bg-slate-200 text-slate-500'}`}>{live ? (forced ? '✨' : '👥') : '🗂'}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-sm font-black text-slate-900">{activity.name}</span>
                      {live && <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-white">Continue</span>}
                      {live && forced && <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-800">Random</span>}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] font-bold text-slate-500">{hint}</span>
                    <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">{activity.type} · {activity.status}</span>
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-emerald-600 transition group-hover:translate-x-0.5" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className={card}>
          <p className={label}>Attendance summary</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            {['present', 'late', 'absent', 'excused'].map((key) => (
              <div key={key} className="rounded-xl bg-slate-50 px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{key}</p>
                <p className="mt-0.5 text-lg font-black text-slate-800">{attendance[key] || 0}</p>
              </div>
            ))}
          </div>
        </div>
        <div className={card}>
          <p className={label}>Leadership in my groups</p>
          {(data.leaders || []).length ? (
            <ul className="mt-3 space-y-2">
              {data.leaders.map((row: any) => (
                <li key={`${row.group_id}-${row.student_id}`} className="rounded-xl bg-slate-50 px-4 py-2.5 text-sm">
                  <span className="font-bold text-slate-700">{row.full_name}</span>
                  <span className="ml-2 text-[10px] font-black uppercase tracking-wider text-emerald-600">{row.role}</span>
                </li>
              ))}
            </ul>
          ) : <p className="mt-3 text-xs font-medium text-slate-400">No leaders appointed in your groups yet.</p>}
        </div>
      </div>

      <div className={card}>
        <p className={label}>Announcements</p>
        {(data.announcements || []).length ? (
          <ul className="mt-3 space-y-2">
            {data.announcements.map((row: any) => (
              <li key={row.id} className={`rounded-xl border px-4 py-3 ${row.pinned ? 'border-amber-200 bg-amber-50/50' : 'border-slate-100'}`}>
                <p className="text-sm font-black text-slate-800">{row.pinned ? '📌 ' : ''}{row.title}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{row.body}</p>
                <p className="mt-2 text-[11px] font-semibold text-slate-400">
                  {row.author_label || row.authorLabel} · {formatWhen(row.created_at || row.createdAt)}
                  {row.attachment_name || row.attachmentName ? (
                    <a
                      href={row.attachment_url || row.attachmentUrl}
                      className="ml-2 font-black text-emerald-700 underline"
                      download
                    >
                      📎 {row.attachment_name || row.attachmentName}
                    </a>
                  ) : null}
                </p>
              </li>
            ))}
          </ul>
        ) : <p className="mt-3 text-xs font-medium text-slate-400">No announcements yet.</p>}
      </div>
    </div>
  );
};

const MyGroupsView = ({ me, openActivityId, onOpenActivity, onChanged }: { me: any; openActivityId: number | null; onOpenActivity: (id: number | null) => void; onChanged: () => void }) => {
  const [activityId, setActivityId] = useState<number | null>(openActivityId);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Random Group Selection: the SERVER draws and persists first, the reveal
  // overlay then plays over the already-final answer.
  const [reveal, setReveal] = useState<null | { groups: Array<{ id: number; name: string }>; winnerId: number; groupName: string }>(null);
  const [drawBusy, setDrawBusy] = useState(false);
  const [drawError, setDrawError] = useState<string | null>(null);
  // The WhatsApp join page: the moment a student HAS a group — chosen,
  // auto-placed, or drawn — a full page offers the QR, copy link, open chat
  // and the one-tap Join WhatsApp group button.
  const [waPage, setWaPage] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => { setActivityId(openActivityId); }, [openActivityId]);

  const load = useCallback(async (id: number) => {
    try { setData(await cgmStudent.activity(id)); setError(null); }
    catch (failure: any) { setError(failure?.message || 'This activity could not be loaded.'); setData(null); }
  }, []);

  useEffect(() => { if (activityId) void load(activityId); else setData(null); }, [activityId, load]);

  const classes: any[] = me?.classes || [];
  const [pickerClassId, setPickerClassId] = useState<number | null>(classes[0]?.class_id ? Number(classes[0].class_id) : null);
  const [activities, setActivities] = useState<any[]>([]);
  useEffect(() => {
    const run = async () => {
      if (!pickerClassId) { setActivities([]); return; }
      try {
        const detail = await cgmStudent.classDashboard(Number(pickerClassId));
        setActivities(detail.activities || []);
      } catch { setActivities([]); }
    };
    void run();
  }, [pickerClassId]);

  const runAction = async (work: () => Promise<string | undefined>, after?: () => void) => {
    setBusy(true); setMessage(null);
    try {
      const text = await work();
      if (text) setMessage(text);
      if (activityId) await load(activityId);
      onChanged(); after?.();
    } catch (failure: any) { setMessage(failure?.message || 'That did not work.'); }
    finally { setBusy(false); }
  };

  if (!activityId) {
    return (
      <div className="space-y-5">
        <div className={card}>
          <p className={label}>Open an activity</p>
          {classes.length ? (
            <>
              <select className={`${inputClass} mt-3`} value={pickerClassId ?? ''} onChange={(event) => setPickerClassId(Number(event.target.value) || null)} aria-label="Class">
                {classes.map((entry) => <option key={entry.class_id} value={Number(entry.class_id)}>{entry.name}</option>)}
              </select>
              <div className="mt-3 space-y-2">
                {activities.filter((activity) => ['open', 'published', 'active', 'completed'].includes(activity.status)).map((activity) => (
                  <button key={activity.id} type="button" onClick={() => onOpenActivity(Number(activity.id))} className="flex w-full items-center justify-between rounded-xl border border-slate-100 px-4 py-3 text-left transition hover:border-emerald-200">
                    <div>
                      <p className="text-sm font-black text-slate-800">{activity.name}</p>
                      <p className="text-[11px] font-semibold text-slate-400">{activity.status}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-emerald-500" />
                  </button>
                ))}
                {!activities.length && <p className="text-xs font-medium text-slate-400">No activities in this class yet.</p>}
              </div>
            </>
          ) : <p className="mt-2 text-xs font-medium text-slate-400">Join a class first.</p>}
        </div>
      </div>
    );
  }

  if (error) return <div className={card}><p className="text-sm font-bold text-red-600">{error}</p><button type="button" onClick={() => onOpenActivity(null)} className="mini-button mt-3">Back</button></div>;
  if (!data) return <p className="text-sm font-semibold text-slate-400">Loading activity…</p>;

  const myGroup = data.myAssignment;
  const canSelfAssign = ['open', 'published', 'active'].includes(data.activity.status) && data.activity.config.method !== 'automatic' && data.eligible && !myGroup;
  // Forced random mode: the organizer has set this activity to 'random' —
  // students cannot pick or auto-place; the fair server draw is the only way in.
  const forcedRandom = data.activity.config?.method === 'random';

  const copyWhatsappLink = async () => {
    const url = String(data.whatsapp?.url || '');
    if (!url) return;
    try { await navigator.clipboard.writeText(url); }
    catch {
      const input = window.document.createElement('textarea');
      input.value = url;
      window.document.body.appendChild(input);
      input.select();
      try { window.document.execCommand('copy'); } catch { /* clipboard blocked */ }
      input.remove();
    }
    setLinkCopied(true);
    window.setTimeout(() => setLinkCopied(false), 2000);
  };

  // The dedicated JOIN page — shown immediately after the student gets the
  // group (choice, auto-placement or the random draw) and from the group card.
  if (myGroup && waPage) {
    const groupName = String(myGroup.group_name || `Group ${myGroup.position}`);
    return (
      <div className="space-y-5">
        <button type="button" className="mini-button" onClick={() => setWaPage(false)}><ArrowLeft className="mr-1 inline h-3.5 w-3.5" /> Back to my group</button>
        <div className={`${card} mx-auto max-w-md border-emerald-200 text-center`} data-testid="cgm-student-whatsapp-page">
          <p className={label}>{data.class.name} · {data.activity.name}</p>
          <h2 className="mt-1 text-xl font-black text-emerald-900">{groupName}</h2>
          <p className="mt-1 text-xs font-bold uppercase tracking-wider text-emerald-600">You’re in — join the group’s WhatsApp</p>
          {data.whatsapp ? (
            <>
              <div className="mt-4 flex justify-center">
                <QrBlock
                  url={String(data.whatsapp.url)}
                  headerText={groupName}
                  footerText="WhatsApp group invite"
                  downloadName={`${groupName.replace(/[^A-Za-z0-9-]+/g, '-').toLowerCase()}-whatsapp-qr.png`}
                  downloadable
                />
              </div>
              <p className="mt-3 break-all rounded-xl bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-500">{String(data.whatsapp.url)}</p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                <button type="button" className="mini-button" onClick={() => void copyWhatsappLink()}>{linkCopied ? 'Copied ✓' : 'Copy link'}</button>
                <a className="mini-button" href={String(data.whatsapp.url)} target="_blank" rel="noopener noreferrer">Open chat ↗</a>
              </div>
              <button
                type="button"
                data-testid="cgm-student-join-whatsapp"
                disabled={busy}
                onClick={() => void runAction(async () => {
                  const result = await cgmStudent.whatsappClick(Number(data.whatsapp.id));
                  window.open(String((result as any)?.url || data.whatsapp.url), '_blank', 'noopener');
                  return 'Opening WhatsApp…';
                })}
                className="cgm-primary-button mt-4 w-full"
              >
                Join WhatsApp group
              </button>
              <p className="mt-2 text-[10px] font-medium text-slate-400">Opening the link records your click — your organizer can see the count, but only real attendance proves you joined.</p>
            </>
          ) : (
            <div className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-xs font-bold text-amber-700" data-testid="cgm-student-whatsapp-empty">
              Your organizer has not added the WhatsApp link for this group yet. This page will show the QR code and the join button the moment the link is saved.
            </div>
          )}
          <div className="mt-4 border-t border-slate-100 pt-3 text-left">
            <p className={label}>Your group mates</p>
            <div className="mt-2 space-y-1.5">
              {(data.members || []).filter((member: any) => Number(member.group_id) === Number(myGroup.group_id)).map((member: any) => (
                <div key={member.student_id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
                  <span className="font-bold text-slate-700">
                    {member.full_name}{Number(member.student_id) === Number(me.student.id) ? ' (you)' : ''}
                  </span>
                  {member.leader_role && <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-black uppercase text-white">{member.leader_role}</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <button type="button" className="mini-button" onClick={() => onOpenActivity(null)}><ArrowLeft className="mr-1 inline h-3.5 w-3.5" /> Activities</button>
      <div className={card}>
        <p className={label}>{data.class.name}</p>
        <h2 className="mt-1 text-xl font-black text-slate-900">{data.activity.name}</h2>
        <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-emerald-600">{data.activity.status} · {data.activity.config.method} assignment</p>
        {data.activity.description && <p className="mt-2 text-sm text-slate-600">{data.activity.description}</p>}
        {message && <p role="status" className="mt-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{message}</p>}
      </div>

      {myGroup ? (
        <div className={`${card} border-emerald-200 bg-emerald-50/40`}>
          <p className={label}>My group</p>
          <h3 className="mt-1 text-lg font-black text-emerald-900">{myGroup.group_name || `Group ${myGroup.position}`}</h3>
          <div className="mt-3 space-y-1.5">
            {(data.members || []).filter((member: any) => Number(member.group_id) === Number(myGroup.group_id)).map((member: any) => (
              <div key={member.student_id} className="flex items-center justify-between rounded-xl bg-white px-4 py-2.5 text-sm">
                <span className="font-bold text-slate-700">
                  {member.full_name}{Number(member.student_id) === Number(me.student.id) ? ' (you)' : ''}
                  {(member.phone || member.email) && Number(member.student_id) !== Number(me.student.id) && (
                    <span className="ml-2 text-[11px] font-semibold text-slate-400">
                      {[member.phone, member.email].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </span>
                {member.leader_role && <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-black uppercase text-white">{member.leader_role}</span>}
              </div>
            ))}
          </div>
          {data.whatsapp && (
            <>
              <button
                type="button"
                data-testid="cgm-student-whatsapp-open-page"
                onClick={() => setWaPage(true)}
                className="cgm-primary-button mt-4"
              >
                Join WhatsApp group
              </button>
              <p className="mt-1 text-[10px] font-medium text-slate-400">Opens your group's WhatsApp page — QR code, copy link and one-tap join.</p>
            </>
          )}
        </div>
      ) : data.waitlisted ? (
        <div className={card}><p className="text-sm font-bold text-amber-700">You are on the waiting list for this activity.</p></div>
      ) : canSelfAssign ? (
        <div className={card}>
          <p className={label}>{forcedRandom ? 'Random selection' : 'Choose your group'}</p>
          {forcedRandom ? (
            <p className="mt-1 text-xs font-medium text-slate-500">Your organizer set this activity to random selection — every group has an exactly equal chance. Tap the button and the system fairly picks your group.</p>
          ) : (
            <p className="mt-1 text-xs font-medium text-slate-500">The server places you in a group with room — tap Assign me, or pick one.</p>
          )}
          {!forcedRandom && <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {(data.groups || []).map((group: any) => (
              <button
                key={group.id}
                type="button"
                disabled={busy || group.full}
                onClick={() => void runAction(async () => {
                  await cgmStudent.selfAssign(Number(data.activity.id), Number(group.id));
                  setWaPage(true);
                  return 'You joined the group.';
                })}
                className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left text-sm transition ${group.full ? 'border-slate-100 opacity-50' : 'border-emerald-200 bg-emerald-50/40 hover:border-emerald-300'}`}
              >
                <span className="font-black text-slate-800">{group.name}</span>
                <span className="text-[11px] font-bold text-slate-400">{group.size}{group.capacity ? ` / ${group.capacity}` : ''}{group.full ? ' · full' : ''}</span>
              </button>
            ))}
          </div>}
          <div className="mt-3 flex flex-wrap gap-2">
            {!forcedRandom && <button type="button" disabled={busy} onClick={() => void runAction(async () => { await cgmStudent.selfAssign(Number(data.activity.id)); setWaPage(true); return 'You have been placed in a group.'; })} className="cgm-primary-button">
              Assign me automatically
            </button>}
            <button
              type="button"
              disabled={busy || drawBusy}
              data-testid="cgm-random-open"
              onClick={() => {
                setDrawBusy(true); setDrawError(null);
                cgmStudent.randomDraw(Number(data.activity.id))
                  .then((result: any) => {
                    // The draw is FINAL on the server before the reveal opens.
                    setReveal({
                      groups: (data.groups || []).map((group: any) => ({ id: Number(group.id), name: String(group.name) })),
                      winnerId: Number(result.groupId),
                      groupName: String(result.groupName || ''),
                    });
                  })
                  .catch((failure: any) => setDrawError(failure?.message || 'The random draw failed. Try again.'))
                  .finally(() => setDrawBusy(false));
              }}
              className="rounded-xl border-2 border-amber-300 bg-gradient-to-b from-amber-50 to-white px-5 py-2.5 text-sm font-black text-amber-700 shadow-[0_8px_20px_-6px_rgba(251,191,36,0.55)] transition hover:from-amber-100 disabled:opacity-50"
            >
              {drawBusy ? 'Drawing…' : '✨ Random selection — let the system pick'}
            </button>
          </div>
          {drawError && <p role="alert" className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-600">{drawError}</p>}
        </div>
      ) : null}

      {(data.elections || []).length > 0 && (
        <div className={card}>
          <p className={label}>Elections in my groups</p>
          <div className="mt-3 space-y-2">
            {data.elections.map((election: any) => (
              <ElectionRow key={election.id} election={election} candidates={data.candidates.filter((row: any) => Number(row.election_id) === Number(election.id))} voted={data.myVotedElectionIds.includes(Number(election.id))} busy={busy} onContest={(statement) => runAction(async () => { await cgmStudent.contest(Number(data.activity.id), statement); return 'You are contesting.'; })} onVote={(candidateId) => runAction(async () => { const result = await cgmStudent.vote(Number(election.id), candidateId); return String((result as any)?.message || 'Vote recorded.'); })} onRefresh={() => activityId && load(activityId)} />
            ))}
          </div>
        </div>
      )}

      {myGroup && (
        <div className={`${card} border-emerald-100`} data-testid="cgm-student-topic-agenda">
          <p className={label}>Our topic &amp; agenda</p>
          <div className="mt-3 rounded-xl bg-amber-50 px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-wider text-amber-700">Group topic</p>
            <p className="mt-1 text-sm font-bold text-slate-800">{String(myGroup.topic || '') || 'No topic yet — your organizer sets it in the group workspace.'}</p>
          </div>
          <div className="mt-2 rounded-xl bg-emerald-50 px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Agenda</p>
            <p className="mt-1 whitespace-pre-wrap text-sm font-semibold text-slate-700">{String(myGroup.agenda || '') || 'No agenda yet — it will appear here once your organizer saves one.'}</p>
          </div>
        </div>
      )}

      {myGroup && (
        <div className={card}>
          <p className={label}>Request a group change</p>
          <MoveRequestCard groups={(data.groups || []).filter((group: any) => Number(group.id) !== Number(myGroup.group_id))} busy={busy} onSubmit={(toGroupId, reason) => runAction(async () => { const result = await cgmStudent.requestMove(Number(myGroup.group_id), toGroupId, reason); return String((result as any)?.message || 'Request sent.'); })} />
        </div>
      )}

      {reveal && (
        <RandomGroupReveal
          groups={reveal.groups}
          winnerId={reveal.winnerId}
          activityName={data?.activity?.name}
          onClose={() => { setReveal(null); if (activityId) void load(activityId); onChanged(); setWaPage(true); }}
        />
      )}
    </div>
  );
};

const MoveRequestCard = ({ groups, busy, onSubmit }: { groups: any[]; busy: boolean; onSubmit: (toGroupId: number, reason?: string) => Promise<void> }) => {
  const [target, setTarget] = useState('');
  const [reason, setReason] = useState('');
  if (!groups.length) return <p className="mt-2 text-xs font-medium text-slate-400">No other group to move to.</p>;
  return (
    <form
      className="mt-3 space-y-2"
      onSubmit={async (event) => { event.preventDefault(); await onSubmit(Number(target), reason || undefined); setReason(''); }}
    >
      <select required value={target} onChange={(event) => setTarget(event.target.value)} className={inputClass} aria-label="Destination group">
        <option value="">Choose a group…</option>
        {groups.map((group: any) => <option key={group.id} value={group.id}>{group.name}{group.full ? ' (full)' : ` · ${group.size}${group.capacity ? `/${group.capacity}` : ''}`}</option>)}
      </select>
      <textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why do you want to move? (optional)" className={`${inputClass} min-h-16`} />
      <button type="submit" disabled={busy || !target} className="mini-button">Send request</button>
    </form>
  );
};

const ElectionRow = ({ election, candidates, voted, busy, onContest, onVote, onRefresh }: {
  election: any; candidates: any[]; voted: boolean; busy: boolean;
  onContest: (statement?: string) => Promise<void>; onVote: (candidateId: number) => Promise<void>; onRefresh: () => void;
}) => {
  const [statement, setStatement] = useState('');
  const [contesting, setContesting] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const nominationOpen = election.status === 'nominating';

  useEffect(() => {
    if (election.status === 'closed') {
      void cgmStudent.election(Number(election.id)).then((data) => setDetail(data)).catch(() => setDetail(null));
    }
  }, [election.status, election.id]);

  return (
    <div className="rounded-xl border border-slate-100 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-black text-slate-800">{election.title}</p>
          <p className="text-[11px] font-semibold text-slate-400">
            {election.role} · {election.status} · {election.anonymity === 'anonymous' ? 'anonymous' : 'public'} voting
          </p>
        </div>
        {nominationOpen && !contesting && (
          <button type="button" className="mini-button" onClick={() => setContesting(true)}>Contest for {election.role}</button>
        )}
      </div>

      {contesting && (
        <form className="mt-3 space-y-2" onSubmit={async (event) => { event.preventDefault(); await onContest(statement || undefined); setContesting(false); setStatement(''); onRefresh(); }}>
          <textarea value={statement} onChange={(event) => setStatement(event.target.value)} placeholder="Short candidate statement (optional)" className={`${inputClass} min-h-16`} />
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="cgm-primary-button">Submit candidacy</button>
            <button type="button" className="mini-button" onClick={() => setContesting(false)}>Cancel</button>
          </div>
        </form>
      )}

      {election.status === 'voting' && candidates.length > 0 && (
        <div className="mt-3 space-y-2">
          {candidates.map((candidate: any) => (
            <button key={candidate.id} type="button" disabled={busy} onClick={() => void onVote(Number(candidate.id)).then(onRefresh)} className="flex w-full items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/40 px-4 py-2.5 text-left text-sm transition hover:border-emerald-300 disabled:opacity-60">
              <span className="font-bold text-slate-800">{candidate.full_name}</span>
              <Vote className="h-4 w-4 text-emerald-600" />
            </button>
          ))}
          {voted && <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">You voted{election.anonymity === 'anonymous' ? ' — your choice stays secret' : ''}.</p>}
        </div>
      )}

      {election.status === 'closed' && detail?.results && (
        <div className="mt-3">
          {(detail.results.tally || []).length ? (
            <ul className="space-y-1">
              {detail.results.tally.map((row: any) => {
                const candidate = (detail.candidates || []).find((entry: any) => Number(entry.id) === Number(row.candidate_id));
                return <li key={row.candidate_id} className="flex justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-600"><span>{candidate?.full_name || 'Candidate'}</span><span>{row.votes} vote(s)</span></li>;
              })}
            </ul>
          ) : <p className="text-xs font-medium text-slate-400">No votes were cast.</p>}
        </div>
      )}
    </div>
  );
};

// Leader self-nomination: a student who opened an organizer's "stand as
// leader" link reads the election and volunteers as a candidate in one step.
const LeaderApplyView = ({ electionId, onClear }: { electionId: number; onClear?: () => void }) => {
  const [detail, setDetail] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [statement, setStatement] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { setDetail(await cgmStudent.election(electionId)); setError(null); }
    catch (failure: any) { setError(failure?.message || 'This leadership link could not be opened.'); }
  }, [electionId]);
  useEffect(() => { void load(); }, [load]);
  if (error) {
    return (
      <div className={card}>
        <p className="text-sm font-bold text-red-600">{error}</p>
        {onClear && <button type="button" className="mini-button mt-3" onClick={onClear}>Back to all my elections</button>}
      </div>
    );
  }
  if (!detail) return <div className={card}><p className="text-sm font-semibold text-slate-400">Opening the leadership form…</p></div>;
  const election = detail.election || {};
  const stand = async () => {
    setBusy(true); setMessage(null);
    try {
      const result = await cgmStudent.contest(Number(election.activityId), statement.trim() || undefined);
      setMessage(String(result?.message || 'You are contesting for group leader.'));
      await load();
    } catch (failure: any) { setMessage(failure?.message || 'Could not record your candidacy.'); }
    finally { setBusy(false); }
  };
  const isCandidate = (detail.candidates || []).length >= 0 && detail.myCandidate === true;
  return (
    <div className={`${card} border-emerald-300 ring-2 ring-emerald-100`} data-testid="cgm-leader-apply">
      <p className="mb-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">You opened a stand-as-leader link — volunteer to lead your group here.</p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-black text-slate-900">{election.title || 'Group leader election'}</p>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-500">{election.status}</span>
      </div>
      <p className="mt-1 text-[11px] font-semibold text-slate-400">{election.role === 'leader' ? 'Group leader' : election.role} · nominations {election.status === 'nominating' ? 'are open' : `are ${election.status === 'voting' || election.status === 'closed' ? 'closed' : 'not open yet'}`}</p>
      {detail.canContest ? (
        <div className="mt-3">
          <label className={label} htmlFor="cgm-leader-statement">Why you? (optional)</label>
          <textarea id="cgm-leader-statement" rows={2} className={`${inputClass} mt-1`} value={statement} onChange={(event) => setStatement(event.target.value)} placeholder="A short promise to your group…" maxLength={500} />
          <button type="button" disabled={busy} className="cgm-primary-button mt-2" onClick={() => void stand()}>
            {busy ? 'Recording…' : 'Stand for group leader'}
          </button>
          <p className="mt-1 text-[11px] font-medium text-slate-400">Standing twice is safe — your candidacy is recorded once and stays on the ballot.</p>
        </div>
      ) : (
        <p className="mt-3 text-xs font-semibold text-slate-500">
          {election.status !== 'nominating'
            ? 'The nomination window for this election is not open right now. Check back when your organizer opens nominations.'
            : 'Only students already placed in this election’s group can stand. Join the group for this activity first, then open this link again.'}
        </p>
      )}
      {message && <p role="status" className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">{message}</p>}
      {onClear && <button type="button" className="mini-button mt-3" onClick={onClear}>Back to all my elections</button>}
    </div>
  );
};

const ElectionVoteCard = ({ electionId, focused }: { electionId: number; focused?: boolean }) => {
  const [detail, setDetail] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { setDetail(await cgmStudent.election(electionId)); setError(null); }
    catch (failure: any) { setError(failure?.message || 'This election could not be opened.'); }
  }, [electionId]);
  useEffect(() => { void load(); }, [load]);
  if (error) return <div className={card}><p className="text-sm font-bold text-red-600">{error}</p></div>;
  if (!detail) return <div className={card}><p className="text-sm font-semibold text-slate-400">Opening the ballot…</p></div>;
  const election = detail.election || {};
  const candidates: any[] = detail.candidates || [];
  return (
    <div className={`${card} ${focused ? 'border-emerald-300 ring-2 ring-emerald-100' : ''}`}>
      {focused && <p className="mb-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">You opened a voting link — this is the ballot. Pick one candidate below.</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-black text-slate-900">{election.title || 'Election'}</p>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-500">{election.status}</span>
      </div>
      <p className="mt-1 text-[11px] font-semibold text-slate-400">
        {election.role} · {election.anonymity === 'anonymous' ? 'Anonymous ballot' : 'Public roll'}{detail.voted ? ' · you have voted' : ''}
      </p>
      {message && <p role="status" className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">{message}</p>}
      {election.status === 'closed' && detail.results && (
        <p className="mt-2 text-xs font-semibold text-slate-500">Voting closed — results appear in your activity once announced.</p>
      )}
      <ul className="mt-3 space-y-2">
        {candidates.map((candidate: any) => (
          <li key={candidate.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 px-4 py-2.5">
            <span className="text-sm font-bold text-slate-700">{candidate.fullName}{candidate.statement ? <span className="ml-2 text-[11px] font-medium text-slate-400">{candidate.statement}</span> : null}</span>
            {election.status === 'voting' && detail.canVote && (
              <button
                type="button"
                disabled={busy || detail.voted}
                className="cgm-primary-button !px-3 !py-1.5 text-[11px]"
                onClick={async () => {
                  setBusy(true); setMessage(null);
                  try { const result: any = await cgmStudent.vote(electionId, Number(candidate.id)); setMessage(String(result?.message || 'Vote recorded.')); await load(); }
                  catch (failure: any) { setMessage(failure?.message || 'The vote failed.'); }
                  finally { setBusy(false); }
                }}
              >
                {detail.voted ? 'Voted' : 'Vote'}
              </button>
            )}
          </li>
        ))}
        {!candidates.length && <li className="text-xs font-medium text-slate-400">No candidates yet.</li>}
      </ul>
      {!detail.canVote && election.status === 'voting' && <p className="mt-2 text-[11px] font-medium text-slate-400">Voting is open, but this ballot is scoped to its group members.</p>}
    </div>
  );
};

const MyElectionsView = ({ focusElectionId, onClearFocus, leaderElectionId, onClearLeader }: { focusElectionId?: number | null; onClearFocus?: () => void; leaderElectionId?: number | null; onClearLeader?: () => void }) => {
  const [rows, setRows] = useState<any[] | null>(null);
  const [openId, setOpenId] = useState<number | null>(focusElectionId || null);
  useEffect(() => { void cgmStudent.electionsList().then((data: any) => setRows((data.data || data) as any[])).catch(() => setRows([])); }, []);
  return (
    <div className="space-y-4">
      {leaderElectionId ? (
        <LeaderApplyView electionId={Number(leaderElectionId)} onClear={onClearLeader} />
      ) : null}
      {focusElectionId ? (
        <div>
          <ElectionVoteCard electionId={Number(focusElectionId)} focused />
          {onClearFocus && <button type="button" className="mini-button mt-2" onClick={onClearFocus}>Back to all my elections</button>}
        </div>
      ) : null}
      <div className={card}>
        <p className={label}>My elections</p>
        {rows === null && <p className="mt-2 text-xs font-semibold text-slate-400">Loading…</p>}
        {rows?.length === 0 && <p className="mt-2 text-xs font-medium text-slate-500">No elections yet — they appear here the moment your organizer opens one.</p>}
        <ul className="mt-3 divide-y divide-slate-100">
          {(rows || []).filter((row) => Number(row.id) !== Number(focusElectionId)).map((row) => (
            <li key={row.id} className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-black text-slate-800">{row.title || 'Election'}</p>
                  <p className="text-[11px] font-semibold text-slate-400">{row.className} · {row.activityName} · {row.role}</p>
                </div>
                <div className="flex items-center gap-2">
                  {row.voted && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase text-emerald-700">voted</span>}
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${row.status === 'voting' ? 'bg-emerald-600 text-white' : row.status === 'nominating' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>{row.status}</span>
                  <button type="button" className="mini-button" onClick={() => setOpenId(openId === Number(row.id) ? null : Number(row.id))}>
                    {row.status === 'voting' && !row.voted ? 'Vote now' : openId === Number(row.id) ? 'Hide' : 'Open'}
                  </button>
                </div>
              </div>
              {openId === Number(row.id) && <div className="mt-3"><ElectionVoteCard electionId={Number(row.id)} /></div>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

const AttendanceView = () => {
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => { void cgmStudent.attendance().then(setRows).catch(() => setRows([])); }, []);
  return (
    <div className="space-y-4">
      <div className={card}><p className={label}>My attendance</p></div>
      {rows === null && <p className="text-sm font-semibold text-slate-400">Loading…</p>}
      {rows?.length === 0 && <Empty icon={ClipboardList} title="No attendance yet" text="Sessions appear here once your organizer records them." />}
      {rows && rows.length > 0 && (
        <div className={card}>
          <ul className="divide-y divide-slate-100">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <p className="text-sm font-bold text-slate-800">{row.title}</p>
                  <p className="text-[11px] font-semibold text-slate-400">{row.activity_name} · {formatDate(row.session_date)}{row.corrected_at ? ' · corrected' : ''}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider ring-1 ${row.status === 'present' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : row.status === 'late' ? 'bg-amber-50 text-amber-700 ring-amber-200' : row.status === 'excused' ? 'bg-sky-50 text-sky-700 ring-sky-200' : 'bg-red-50 text-red-600 ring-red-200'}`}>{row.status}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

const CalendarView = () => {
  const [events, setEvents] = useState<any[] | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [monthCursor, setMonthCursor] = useState(() => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), 1); });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  useEffect(() => { void cgmStudent.calendar().then(setEvents).catch(() => setEvents([])); }, []);
  const visible = (events || []).filter((event) => filter === 'all' || event.type === filter);

  const dayKey = (value: unknown) => {
    const date = new Date(String(value).replace(' ', 'T'));
    return Number.isNaN(date.getTime()) ? '' : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };
  const monthLabel = monthCursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const firstWeekday = (monthCursor.getDay() + 6) % 7; // Monday-first grid
  const daysInMonth = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0).getDate();
  const eventsByDay = new Map<string, any[]>();
  for (const event of visible) {
    const key = dayKey(event.at);
    if (!key) continue;
    eventsByDay.set(key, [...(eventsByDay.get(key) || []), event]);
  }
  const todayKey = dayKey(new Date().toISOString());
  const selectedEvents = selectedDay ? (eventsByDay.get(selectedDay) || []) : null;

  return (
    <div className="space-y-4">
      <div className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className={label}>My calendar</p>
          <div className="flex gap-1.5">
            {['all', 'activity', 'election', 'attendance'].map((key) => (
              <button key={key} type="button" onClick={() => setFilter(key)} className={`rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-wider transition ${filter === key ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700'}`}>{key === 'all' ? 'All' : key}</button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between">
            <button type="button" className="mini-button" onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1))} aria-label="Previous month">‹</button>
            <p className="text-sm font-black text-slate-800">{monthLabel}</p>
            <button type="button" className="mini-button" onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1))} aria-label="Next month">›</button>
          </div>
          <div className="mt-3 grid grid-cols-7 gap-1 text-center">
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => (
              <p key={`${day}-${index}`} className="text-[10px] font-black uppercase text-slate-400">{day}</p>
            ))}
            {Array.from({ length: firstWeekday }, (_, index) => <span key={`pad-${index}`} />)}
            {Array.from({ length: daysInMonth }, (_, index) => {
              const date = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), index + 1);
              const key = dayKey(date.toISOString());
              const dayEvents = eventsByDay.get(key) || [];
              const isSelected = selectedDay === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedDay(isSelected ? null : key)}
                  aria-label={`${date.toLocaleDateString()} — ${dayEvents.length} event(s)`}
                  aria-pressed={isSelected}
                  className={`relative rounded-lg py-1.5 text-xs font-bold transition ${isSelected ? 'bg-emerald-600 text-white' : key === todayKey ? 'bg-emerald-100 text-emerald-800' : dayEvents.length ? 'bg-slate-100 text-slate-700 hover:bg-emerald-50' : 'text-slate-400 hover:bg-slate-50'}`}
                >
                  {index + 1}
                  {dayEvents.length > 0 && (
                    <span className={`absolute inset-x-0 bottom-0.5 mx-auto h-1 w-1 rounded-full ${isSelected ? 'bg-white' : 'bg-emerald-500'}`} />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {selectedEvents && (
          <div className="mt-4">
            <p className={label}>{selectedDay && new Date(`${selectedDay}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
            <ul className="mt-2 space-y-2">
              {selectedEvents.map((event, index) => (
                <li key={index} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                  <div>
                    <p className="text-sm font-bold text-slate-800">{event.title}</p>
                    <p className="text-[11px] font-semibold text-slate-400">{event.type}</p>
                  </div>
                  <span className="text-xs font-black text-slate-500">{String(event.at).slice(11, 16) || '—'}</span>
                </li>
              ))}
              {!selectedEvents.length && <li className="py-3 text-center text-xs font-medium text-slate-400">Nothing on this day.</li>}
            </ul>
          </div>
        )}
      </div>

      <div className={card}>
        <p className={label}>All upcoming</p>
        <ul className="mt-3 space-y-2">
          {visible.map((event, index) => (
            <li key={index} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
              <div>
                <p className="text-sm font-bold text-slate-800">{event.title}</p>
                <p className="text-[11px] font-semibold text-slate-400">{event.type}</p>
              </div>
              <span className="text-xs font-black text-slate-500">{formatDate(event.at)}</span>
            </li>
          ))}
          {events && !visible.length && <li className="py-6 text-center text-xs font-medium text-slate-400">Nothing scheduled.</li>}
        </ul>
      </div>
    </div>
  );
};

const NotificationsView = ({ onChanged }: { onChanged: () => void }) => {
  const [rows, setRows] = useState<any[] | null>(null);
  const [prefs, setPrefs] = useState<any | null>(null);
  const [prefBusy, setPrefBusy] = useState<string | null>(null);
  const load = useCallback(async () => { setRows(await cgmStudent.notifications().catch(() => [])); }, []);
  useEffect(() => { void load(); void cgmStudent.notificationPrefs().then((next) => setPrefs(next?.data || null)).catch(() => setPrefs(null)); }, [load]);
  const togglePref = async (category: string, muted: boolean) => {
    setPrefBusy(category);
    try {
      await cgmStudent.saveNotificationPrefs([{ category, muted }]);
      setPrefs((current: any) => current ? ({
        ...current,
        prefs: current.prefs.map((entry: any) => (entry.category === category ? { ...entry, muted } : entry)),
      }) : current);
    } finally { setPrefBusy(null); }
  };
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className={card + ' flex-1'}><p className={label}>Notifications</p></div>
        <button type="button" className="mini-button ml-3" onClick={async () => { await cgmStudent.markRead({ all: true }); await load(); onChanged(); }}>Mark all read</button>
      </div>
      {prefs && (
        <div className={card}>
          <p className={label}>Email & notice preferences</p>
          <p className="mt-1 text-xs font-medium text-slate-500">Choose which everyday notices you receive. Security and registration decisions always arrive — they cannot be turned off.</p>
          <ul className="mt-3 space-y-1.5">
            {prefs.prefs.map((entry: any) => (
              <li key={entry.category} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2.5">
                <span className="text-sm font-bold capitalize text-slate-700">{entry.category}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={entry.muted}
                  disabled={prefBusy === entry.category}
                  onClick={() => void togglePref(entry.category, !entry.muted)}
                  className={`relative h-5 w-9 rounded-full transition ${entry.muted ? 'bg-slate-300' : 'bg-emerald-600'}`}
                  aria-label={`${entry.muted ? 'Unmute' : 'Mute'} ${entry.category} notifications`}
                >
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${entry.muted ? 'left-0.5' : 'left-[18px]'}`} />
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] font-semibold text-slate-400">Always on: {(prefs.critical || []).join(', ')}.</p>
        </div>
      )}
      <div className={card}>
        <p className={label}>My records</p>
        <p className="mt-1 text-xs font-medium text-slate-500">Download your own attendance, group and leadership history as a spreadsheet-ready CSV. Your records survive leaving a class or an activity being archived.</p>
        <button type="button" className="mini-button mt-3" onClick={() => void downloadMyRecords().catch(() => {})}>Download my records (CSV)</button>
      </div>
      {rows === null && <p className="text-sm font-semibold text-slate-400">Loading…</p>}
      {rows?.length === 0 && <Empty icon={Bell} title="No notifications" text="Approvals, assignments and election news arrive here." />}
      {rows && rows.length > 0 && (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.id} className={`${card} ${row.read_at ? 'opacity-70' : 'border-emerald-200'}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-slate-800">{row.title}</p>
                  <p className="mt-1 text-sm text-slate-600">{row.body}</p>
                  <p className="mt-2 text-[11px] font-semibold text-slate-400">{formatWhen(row.created_at)}</p>
                </div>
                {!row.read_at && (
                  <button type="button" className="mini-button shrink-0" onClick={async () => { await cgmStudent.markRead({ ids: [Number(row.id)] }); await load(); onChanged(); }}>
                    <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" /> Read
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

// [change-request field (server vocabulary), label, key on /student/me
// (camelCase — publicStudent projects fullName/indexNumber), changeable]
const PROFILE_FIELDS: Array<[string, string, string, boolean]> = [
  ['full_name', 'Full name', 'fullName', true],
  ['phone', 'Telephone number', 'phone', true],
  ['gender', 'Gender', 'gender', true],
  ['email', 'Email address', 'email', true],
  ['index_number', 'Index number (fixed)', 'indexNumber', false],
];

const ProfileView = ({ me, onChanged }: { me: any; onChanged: () => void }) => {
  const [field, setField] = useState('full_name');
  const [newValue, setNewValue] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Passkey change REQUEST flow — the passkey is always system-generated:
  // prove the current one, the organizer approves, then Generate allocates
  // the next unique passkey (shown once, never chosen by the student).
  const [pkCurrent, setPkCurrent] = useState('');
  const [pkClassId, setPkClassId] = useState<number | null>(null);
  const [passkeyReq, setPasskeyReq] = useState<any>(null);
  const [issuedPasskey, setIssuedPasskey] = useState<string | null>(null);
  const activeClasses: any[] = (me?.classes || []).filter((entry: any) => (entry.member_status || entry.status) === 'active');
  const loadPasskeyRequest = async () => {
    try { const result: any = await cgmStudent.myPasskeyRequest(); setPasskeyReq(result?.data ?? null); }
    catch { setPasskeyReq(null); }
  };
  useEffect(() => { void loadPasskeyRequest(); }, []);

  const student = me?.student || {};
  // Fixed identity fields are SHOWN (read-only) so students always know what
  // is on file — only the change-request form treats them as locked.
  const currentValue = (displayKey: string) => {
    if (displayKey === 'gender') return student.gender && student.gender !== 'unknown' ? student.gender : 'Not set yet';
    const value = (student as any)[displayKey];
    return value ? String(value) : 'Not provided';
  };

  return (
    <div className="space-y-5">
      <div className={card}>
        <p className={label}>My profile</p>
        <h2 className="mt-1 text-xl font-black text-slate-900">{student.fullName}</h2>
        <dl className="mt-4 grid gap-2 sm:grid-cols-2">
          {PROFILE_FIELDS.map(([key, text, displayKey]) => (
            <div key={key} className="rounded-xl bg-slate-50 px-4 py-3">
              <dt className={label}>{text}</dt>
              <dd className="mt-0.5 text-sm font-bold text-slate-800">{currentValue(displayKey)}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-[11px] font-medium text-slate-400">Every change needs organizer approval. Index numbers can only be corrected by your organizer.</p>
      </div>

      <div className={card}>
        <p className={label}>Request a change</p>
        <form
          className="mt-3 space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true); setMessage(null); setError(null);
            try {
              const result = await cgmStudent.requestProfileChange({ field, newValue, reason: reason || undefined });
              setMessage(String((result as any)?.message || 'Request submitted.'));
              setNewValue(''); setReason(''); onChanged();
            } catch (failure: any) { setError(failure?.message || 'The request failed.'); }
            finally { setBusy(false); }
          }}
        >
          <select className={inputClass} value={field} onChange={(event) => setField(event.target.value)} aria-label="Field to change">
            {PROFILE_FIELDS.filter(([key]) => key !== 'index_number').map(([key, text]) => <option key={key} value={key}>{text}</option>)}
          </select>
          {field === 'gender' ? (
            <select className={inputClass} value={newValue} onChange={(event) => setNewValue(event.target.value)} aria-label="New value">
              <option value="">Choose…</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="unknown">Prefer not to say / correct to unknown</option>
            </select>
          ) : (
            <input required className={inputClass} value={newValue} onChange={(event) => setNewValue(event.target.value)} placeholder="New value" aria-label="New value" />
          )}
          <textarea className={`${inputClass} min-h-16`} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why is this change needed? (optional)" aria-label="Reason" />
          <button type="submit" disabled={busy} className="cgm-primary-button">{busy ? 'Sending…' : 'Submit for approval'}</button>
          {message && <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{message}</p>}
          {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">{error}</p>}
        </form>
      </div>

      <div className={card} data-testid="cgm-student-passkey-card">
        <p className={label}>Change my passkey — system-generated</p>
        <p className="mt-1 text-[11px] font-medium text-slate-400">
          You never type your own new passkey: the system generates it so it can never clash with another student&rsquo;s key.
          Prove who you are with your <span className="font-bold">current passkey</span> to ask your organizer; when they approve
          (or send you the link), a <span className="font-bold">Generate new passkey</span> button appears here.
        </p>
        {issuedPasskey && (
          <div className="mt-3 rounded-xl bg-emerald-50 px-4 py-3" role="alert">
            <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Your new passkey — shown only once, save it now</p>
            <p className="mt-1 font-mono text-lg font-black tracking-wider text-emerald-900">{issuedPasskey}</p>
          </div>
        )}
        {passkeyReq?.status === 'pending' && (
          <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-xs font-bold text-amber-700" data-testid="cgm-passkey-request-pending">
            Request sent {passkeyReq.requestedAt ? `on ${new Date(passkeyReq.requestedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} ` : ''}— waiting for your organizer to approve it.
          </p>
        )}
        {passkeyReq?.status === 'approved' && (
          <div className="mt-3">
            <button
              type="button"
              data-testid="cgm-passkey-generate"
              disabled={busy}
              onClick={async () => {
                setBusy(true); setMessage(null); setError(null);
                try {
                  const result: any = await cgmStudent.generatePasskey();
                  setIssuedPasskey(String(result?.passkey || ''));
                  setPasskeyReq(null);
                  setMessage(String(result?.message || 'New passkey generated.'));
                  onChanged();
                } catch (failure: any) { setError(failure?.message || 'The generation failed.'); }
                finally { setBusy(false); void loadPasskeyRequest(); }
              }}
              className="cgm-primary-button"
            >
              {busy ? 'Generating…' : '🔑 Generate new passkey'}
            </button>
            <p className="mt-1 text-[10px] font-medium text-slate-400">Approved by your organizer — the system picks the next unique passkey.</p>
          </div>
        )}
        {passkeyReq?.status === 'declined' && (
          <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-xs font-bold text-red-600">
            {passkeyReq.handledLabel ? `${passkeyReq.handledLabel} declined your request.` : 'Your request was declined.'} You can ask again below.
          </p>
        )}
        {passkeyReq?.status !== 'pending' && passkeyReq?.status !== 'approved' && (
          <form
            className="mt-3 grid gap-2 sm:grid-cols-2"
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true); setMessage(null); setError(null);
              try {
                const result: any = await cgmStudent.requestPasskeyChange(pkClassId, pkCurrent);
                setMessage(String((result as any)?.message || 'Request sent.'));
                setPkCurrent('');
                await loadPasskeyRequest();
                onChanged();
              } catch (failure: any) { setError(failure?.message || 'The request failed.'); }
              finally { setBusy(false); }
            }}
          >
            {activeClasses.length > 1 && (
              <select className={inputClass} value={pkClassId ?? ''} onChange={(event) => setPkClassId(Number(event.target.value) || null)} aria-label="Class for the passkey request">
                <option value="">Choose class…</option>
                {activeClasses.map((entry: any) => <option key={entry.class_id} value={Number(entry.class_id)}>{entry.class_name || entry.name || `Class ${entry.class_id}`}</option>)}
              </select>
            )}
            <input required type="password" className={inputClass} value={pkCurrent} onChange={(event) => setPkCurrent(event.target.value)} placeholder="Current passkey (proves it is you)" autoComplete="current-password" />
            <button type="submit" disabled={busy} className="cgm-primary-button sm:col-span-2" data-testid="cgm-passkey-request-submit">{busy ? 'Sending…' : 'Request passkey change from my organizer'}</button>
          </form>
        )}
        {message && <p role="status" className="mt-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{message}</p>}
        {error && <p role="alert" className="mt-2 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">{error}</p>}
      </div>
    </div>
  );
};

const HistoryView = ({ me }: { me: any }) => {
  const classes: any[] = me?.classes || [];
  const [archive, setArchive] = useState<any[] | null>(null);
  useEffect(() => {
    const run = async () => {
      try {
        const lists = await Promise.all(classes.map((entry) => cgmStudent.classDashboard(Number(entry.class_id)).catch(() => null)));
        const completed = lists.flatMap((detail) => (detail?.activities || []).filter((activity: any) => ['completed', 'archived'].includes(activity.status)));
        setArchive(completed);
      } catch { setArchive([]); }
    };
    void run();
  }, [classes.length]);
  return (
    <div className="space-y-4">
      <div className={card}><p className={label}>Activity history</p></div>
      {archive === null && <p className="text-sm font-semibold text-slate-400">Loading…</p>}
      {archive?.length === 0 && <Empty icon={Clock} title="Nothing completed yet" text="Completed and archived activities are preserved here." />}
      {archive && archive.length > 0 && (
        <ul className="space-y-2">
          {archive.map((activity: any) => (
            <li key={activity.id} className={`${card} flex items-center justify-between`}>
              <div>
                <p className="text-sm font-black text-slate-800">{activity.name}</p>
                <p className="text-[11px] font-semibold text-slate-400">{activity.type} · {activity.status}</p>
              </div>
              <span className="text-xs font-bold text-slate-400">{formatDate(activity.completedAt || activity.publishedAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
