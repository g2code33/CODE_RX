import { useCallback, useEffect, useState } from 'react';
import {
  Bell, CalendarClock, CheckCircle2, ChevronLeft, ClipboardCheck, Megaphone, MessageSquarePlus,
  Settings2, ShieldCheck, UserPlus, UserMinus, Lightbulb, AlertTriangle, KeyRound,
} from 'lucide-react';
import { cgmStudent } from '../../lib/cgm';

/**
 * CODE Rx — the GROUP LEADER console.
 *
 * Appointing a leader gives that student real tools for THEIR group: the topic
 * and agenda, announcements, messages, meetings, attendance, membership
 * requests and a line to the organizer. Nothing here is a client-side promise —
 * each panel renders only when the seat's permissions include the capability,
 * and the server re-checks it on every call. When a capability is missing the
 * console says so plainly instead of hiding the work that needs doing.
 */

const card = 'rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm shadow-emerald-950/5';
const label = 'text-[10px] font-black uppercase tracking-[0.16em] text-slate-400';
const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 focus:border-emerald-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-100';
const miniButton = 'rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-black uppercase tracking-wide text-slate-700 transition hover:border-emerald-200 hover:text-emerald-700 disabled:opacity-50';

type Panel = 'plan' | 'announce' | 'notify' | 'meetings' | 'attendance' | 'members' | 'requests';

const formatWhen = (value: unknown) => {
  if (!value) return '—';
  const date = new Date(String(value).replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? String(value)
    : date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const toLocalInput = (date: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const LeaderConsole = ({ groupId, onBack, onChanged }: { groupId: number; onBack: () => void; onChanged?: () => void }) => {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<Panel>('plan');

  // Form state
  const [topic, setTopic] = useState('');
  const [agenda, setAgenda] = useState('');
  const [announceTitle, setAnnounceTitle] = useState('');
  const [announceBody, setAnnounceBody] = useState('');
  const [notifyBody, setNotifyBody] = useState('');
  const [meetingTitle, setMeetingTitle] = useState('');
  const [meetingAgenda, setMeetingAgenda] = useState('');
  const [meetingWhen, setMeetingWhen] = useState(() => toLocalInput(new Date(Date.now() + 24 * 3600_000)));
  const [meetingWhere, setMeetingWhere] = useState('');
  const [marks, setMarks] = useState<Record<number, string>>({});
  const [sessionTitle, setSessionTitle] = useState('');
  const [sessionDate, setSessionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [requestKind, setRequestKind] = useState<'access' | 'issue' | 'add_member' | 'remove_member'>('access');
  // The capability the leader is asking to have opened.
  const [requestTool, setRequestTool] = useState('');
  const [requestTarget, setRequestTarget] = useState('');
  const [requestTitle, setRequestTitle] = useState('');
  const [requestReason, setRequestReason] = useState('');

  const load = useCallback(async () => {
    try {
      const next = await cgmStudent.leaderGroup(groupId);
      setData(next);
      setTopic(String((next as any)?.group?.topic || ''));
      setAgenda(String((next as any)?.group?.agenda || ''));
      setError(null);
    } catch (failure: any) {
      setError(failure?.message || 'Your group could not be loaded.');
    }
  }, [groupId]);

  useEffect(() => { void load(); }, [load]);

  const has = (permission: string) => Boolean(data?.seat?.permissions?.includes(permission));
  const run = async (work: () => Promise<unknown>, note: string) => {
    setBusy(true); setMessage(null);
    try {
      const result: any = await work();
      // An offline-safe write answers with `queued` instead of the server's
      // reply: say so plainly, and do not reload (there is nothing new to read).
      if (result && (result as any).queued) {
        setMessage(String((result as any).message || 'Saved on this device — it will send itself when you are back online.'));
        return;
      }
      setMessage(note);
      await load();
      onChanged?.();
    } catch (failure: any) {
      setMessage(failure?.message || 'That did not work.');
    } finally { setBusy(false); }
  };

  if (error) {
    return (
      <div className={card} data-testid="cgm-leader-console-error">
        <p className="text-sm font-bold text-red-600">{error}</p>
        <button type="button" className={`${miniButton} mt-3`} onClick={onBack}><ChevronLeft className="mr-1 inline h-3.5 w-3.5" /> Back</button>
      </div>
    );
  }
  if (!data) return <p className="text-sm font-semibold text-slate-400">Loading your leader console…</p>;

  const members: any[] = data.members || [];
  const panels: Array<{ key: Panel; text: string; icon: any; allowed: boolean }> = [
    { key: 'plan', text: 'Topic & agenda', icon: Lightbulb, allowed: has('edit_topic') },
    { key: 'announce', text: 'Announce', icon: Megaphone, allowed: has('send_announcements') },
    { key: 'notify', text: 'Message members', icon: Bell, allowed: has('notify_members') },
    { key: 'meetings', text: 'Meetings', icon: CalendarClock, allowed: has('coordinate') },
    { key: 'attendance', text: 'Attendance', icon: ClipboardCheck, allowed: has('view_attendance') || has('assist_attendance') },
    { key: 'members', text: 'Members', icon: UserPlus, allowed: has('view_members') },
    // ALWAYS available: a leader with no tools at all must still be able to ask
    // for them — that request is the only way the seat gets opened.
    { key: 'requests', text: 'Ask the organizer', icon: MessageSquarePlus, allowed: true },
  ];
  const active = panels.find((entry) => entry.key === panel && entry.allowed) ? panel : (panels.find((entry) => entry.allowed)?.key || 'members');

  return (
    <div className="space-y-4" data-testid="cgm-leader-console">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" className={miniButton} onClick={onBack}><ChevronLeft className="mr-1 inline h-3.5 w-3.5" /> Back</button>
        <span className="rounded-full bg-emerald-600 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-white" data-testid="cgm-leader-role">
          {data.seat.role === 'leader' ? 'Group leader' : 'Assistant leader'}
        </span>
      </div>

      <div className={`${card} border-emerald-200 bg-gradient-to-br from-emerald-50 to-white`}>
        <p className={label}>{data.class.name} · {data.activity.name}</p>
        <h2 className="mt-1 text-xl font-black text-emerald-900" data-testid="cgm-leader-group-name">{data.group.name}</h2>
        <p className="mt-1 text-xs font-semibold text-slate-500">{data.group.size} member{data.group.size === 1 ? '' : 's'}{data.group.capacity ? ` of ${data.group.capacity}` : ''} · you lead this group</p>
        <div className="mt-3 flex flex-wrap gap-1.5" data-testid="cgm-leader-capabilities">
          {(data.seat.permissionLabels || []).map((entry: any) => (
            <span key={entry.key} title={entry.hint} className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-800">{entry.label}</span>
          ))}
          {!(data.seat.permissionLabels || []).length && (
            <span className="text-[11px] font-semibold text-amber-700">Your organizer has not granted any tools yet — ask them to open your permissions.</span>
          )}
        </div>
        {(data.seat.withheld || []).length > 0 && (
          <details className="mt-3" data-testid="cgm-leader-withheld">
            <summary className="cursor-pointer text-[11px] font-bold text-slate-500">Not granted to you ({data.seat.withheld.length}) — ask for any of these</summary>
            <ul className="mt-2 space-y-1">
              {data.seat.withheld.map((entry: any) => (
                <li key={entry.key} className="text-[11px] font-medium text-slate-500"><span className="font-bold text-slate-600">{entry.label}</span> — {entry.hint}</li>
              ))}
            </ul>
          </details>
        )}
      </div>

      {message && (
        <div role="status" aria-live="polite" aria-atomic="true" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800" data-testid="cgm-leader-message">{message}</div>
      )}

      <div className="flex flex-wrap gap-1.5" data-testid="cgm-leader-tabs">
        {panels.filter((entry) => entry.allowed).map((entry) => {
          const Icon = entry.icon;
          return (
            <button
              key={entry.key}
              type="button"
              onClick={() => { setPanel(entry.key); setMessage(null); }}
              aria-pressed={active === entry.key}
              data-testid={`cgm-leader-tab-${entry.key}`}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-[11px] font-black uppercase tracking-wide transition ${active === entry.key ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
            >
              <Icon className="h-3.5 w-3.5" /> {entry.text}
            </button>
          );
        })}
      </div>

      {active === 'plan' && (
        <form
          className={`${card} space-y-3`}
          data-testid="cgm-leader-plan-form"
          onSubmit={(event) => { event.preventDefault(); void run(() => cgmStudent.leaderSaveTopic(groupId, { topic, agenda }), 'Saved — your group sees it straight away.'); }}
        >
          <p className={label}>The plan for your group</p>
          <div><label className={label} htmlFor="cgm-leader-topic">Topic</label>
            <input id="cgm-leader-topic" className={`${inputClass} mt-1`} value={topic} maxLength={200} onChange={(event) => setTopic(event.target.value)} placeholder="What this group is working on" /></div>
          <div><label className={label} htmlFor="cgm-leader-agenda">Agenda — one line per step</label>
            <textarea id="cgm-leader-agenda" className={`${inputClass} mt-1 min-h-28`} value={agenda} maxLength={2000} onChange={(event) => setAgenda(event.target.value)} placeholder={'1. Read the practical sheet\n2. Assign roles\n3. Run the titration'} /></div>
          <p className="text-[11px] font-medium text-slate-500">Students see the topic, then this agenda, under the group name — exactly where your organizer’s agenda appears.</p>
          <button type="submit" disabled={busy} className="cgm-primary-button">{busy ? 'Saving…' : 'Save topic & agenda'}</button>
        </form>
      )}

      {active === 'announce' && (
        <form
          className={`${card} space-y-3`}
          data-testid="cgm-leader-announce-form"
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              const result: any = await cgmStudent.leaderAnnounce(groupId, { title: announceTitle, body: announceBody });
              setAnnounceTitle(''); setAnnounceBody('');
              return result;
            }, data.activity.announcementMode === 'direct' ? 'Posted to your group.' : 'Sent to your organizer for approval.');
          }}
        >
          <p className={label}>Announce to your group</p>
          <p className="text-[11px] font-medium text-slate-500">
            {data.activity.announcementMode === 'direct'
              ? 'Your organizer allows direct announcements — this posts immediately to your group only.'
              : 'Your organizer reviews group announcements first. Yours stays private until they approve it.'}
          </p>
          <input className={inputClass} value={announceTitle} maxLength={180} onChange={(event) => setAnnounceTitle(event.target.value)} placeholder="Title" aria-label="Announcement title" required />
          <textarea className={`${inputClass} min-h-24`} value={announceBody} maxLength={5000} onChange={(event) => setAnnounceBody(event.target.value)} placeholder="What does the group need to know?" aria-label="Announcement message" required />
          <button type="submit" disabled={busy} className="cgm-primary-button">{busy ? 'Sending…' : 'Post announcement'}</button>
          <ul className="divide-y divide-slate-100 pt-2" data-testid="cgm-leader-announcements">
            {(data.announcements || []).map((row: any) => (
              <li key={row.id} className="py-2">
                <p className="text-sm font-bold text-slate-800">{row.title}
                  <span className={`ml-2 rounded px-1.5 py-0.5 text-[9px] font-black uppercase ${row.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{row.status}</span>
                </p>
                <p className="text-[11px] font-semibold text-slate-400">{row.authorLabel} · {formatWhen(row.createdAt)}</p>
                <p className="mt-1 whitespace-pre-wrap text-xs font-medium text-slate-600">{row.body}</p>
              </li>
            ))}
            {!(data.announcements || []).length && <li className="py-2 text-[11px] text-slate-400">No announcements for this group yet.</li>}
          </ul>
        </form>
      )}

      {active === 'notify' && (
        <form
          className={`${card} space-y-3`}
          data-testid="cgm-leader-notify-form"
          onSubmit={(event) => { event.preventDefault(); void run(async () => { const result: any = await cgmStudent.leaderNotify(groupId, { message: notifyBody }); if (!result?.queued) setNotifyBody(''); return result; }, 'Sent to every member.'); }}
        >
          <p className={label}>Message every member</p>
          <p className="text-[11px] font-medium text-slate-500">A short push notification — for a reminder or a change of plan, not for a formal announcement.</p>
          <textarea className={`${inputClass} min-h-20`} value={notifyBody} maxLength={600} onChange={(event) => setNotifyBody(event.target.value)} placeholder="Meet at the lab door at 10:15." aria-label="Message to members" required />
          <button type="submit" disabled={busy} className="cgm-primary-button">{busy ? 'Sending…' : 'Notify my group'}</button>
        </form>
      )}

      {active === 'meetings' && (
        <div className="space-y-4">
          <form
            className={`${card} space-y-3`}
            data-testid="cgm-leader-meeting-form"
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                await cgmStudent.leaderScheduleMeeting(groupId, {
                  title: meetingTitle, agenda: meetingAgenda || undefined,
                  startsAt: new Date(meetingWhen).toISOString(),
                  location: meetingWhere || undefined,
                });
                setMeetingTitle(''); setMeetingAgenda(''); setMeetingWhere('');
              }, 'Meeting booked — every member was notified and it is on their calendar.');
            }}
          >
            <p className={label}>Book a group meeting</p>
            <input className={inputClass} value={meetingTitle} maxLength={160} onChange={(event) => setMeetingTitle(event.target.value)} placeholder="Pre-practical briefing" aria-label="Meeting title" required />
            <div className="grid gap-2 sm:grid-cols-2">
              <input type="datetime-local" className={inputClass} value={meetingWhen} onChange={(event) => setMeetingWhen(event.target.value)} aria-label="Meeting start" required />
              <input className={inputClass} value={meetingWhere} maxLength={160} onChange={(event) => setMeetingWhere(event.target.value)} placeholder="Where (optional)" aria-label="Meeting location" />
            </div>
            <textarea className={`${inputClass} min-h-16`} value={meetingAgenda} maxLength={1000} onChange={(event) => setMeetingAgenda(event.target.value)} placeholder="What you will cover (optional)" aria-label="Meeting agenda" />
            <button type="submit" disabled={busy} className="cgm-primary-button">{busy ? 'Booking…' : 'Schedule meeting'}</button>
          </form>
          <div className={card}>
            <p className={label}>Scheduled</p>
            <ul className="mt-2 divide-y divide-slate-100" data-testid="cgm-leader-meetings">
              {(data.meetings || []).map((row: any) => (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div>
                    <p className="text-sm font-bold text-slate-800">{row.title}</p>
                    <p className="text-[11px] font-semibold text-slate-400">{formatWhen(row.startsAt)} · {row.durationMinutes} min{row.location ? ` · ${row.location}` : ''}{row.status !== 'scheduled' ? ` · ${row.status}` : ''}</p>
                  </div>
                  {row.status === 'scheduled' && (
                    <button type="button" className={miniButton} disabled={busy} onClick={() => void run(() => cgmStudent.leaderCancelMeeting(row.id, 'Called off by the group leader'), 'Meeting cancelled and the group told.')}>Cancel</button>
                  )}
                </li>
              ))}
              {!(data.meetings || []).length && <li className="py-2 text-[11px] text-slate-400">No meetings booked yet.</li>}
            </ul>
          </div>
        </div>
      )}

      {active === 'attendance' && (
        <div className="space-y-4" data-testid="cgm-leader-attendance">
          <div className={card}>
            <p className={label}>Your group’s attendance</p>
            <ul className="mt-2 divide-y divide-slate-100">
              {(data.attendance || []).map((row: any) => (
                <li key={row.sessionId} className="py-2">
                  <p className="text-sm font-bold text-slate-800">{row.title} <span className="ml-1 text-[10px] font-black uppercase text-slate-400">{row.sessionDate}</span></p>
                  <p className="text-[11px] font-semibold text-slate-500">{row.present} present · {row.late} late · {row.absent} absent · {row.excused} excused</p>
                </li>
              ))}
              {!(data.attendance || []).length && <li className="py-2 text-[11px] text-slate-400">No attendance recorded for this group yet.</li>}
            </ul>
          </div>
          {has('assist_attendance') && (
            <form
              className={`${card} space-y-3`}
              data-testid="cgm-leader-mark-form"
              onSubmit={(event) => {
                event.preventDefault();
                const records = members
                  .filter((member) => marks[Number(member.studentId)])
                  .map((member) => ({ studentId: Number(member.studentId), status: marks[Number(member.studentId)] }));
                if (!records.length) { setMessage('Mark at least one member first.'); return; }
                void run(async () => {
                  await cgmStudent.leaderMarkAttendance(groupId, { title: sessionTitle || undefined, sessionDate, records });
                  setMarks({}); setSessionTitle('');
                }, 'Attendance saved for your group only.');
              }}
            >
              <p className={label}>Mark this group</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <input className={inputClass} value={sessionTitle} maxLength={160} onChange={(event) => setSessionTitle(event.target.value)} placeholder="Session title (optional)" aria-label="Session title" />
                <input type="date" className={inputClass} value={sessionDate} onChange={(event) => setSessionDate(event.target.value)} aria-label="Session date" />
              </div>
              <ul className="divide-y divide-slate-100" data-testid="cgm-leader-mark-list">
                {members.map((member: any) => (
                  <li key={member.studentId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="text-sm font-bold text-slate-700">{member.fullName}{member.isMe ? ' (you)' : ''}</span>
                    <select className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-bold" value={marks[Number(member.studentId)] || ''} aria-label={`Attendance for ${member.fullName}`} onChange={(event) => setMarks((current) => ({ ...current, [Number(member.studentId)]: event.target.value }))}>
                      <option value="">—</option>
                      {['present', 'late', 'absent', 'excused'].map((status) => <option key={status} value={status}>{status}</option>)}
                    </select>
                  </li>
                ))}
              </ul>
              <button type="submit" disabled={busy} className="cgm-primary-button">{busy ? 'Saving…' : 'Save attendance'}</button>
              <p className="text-[11px] font-medium text-slate-500">You can only mark members of your own group, and the organizer sees every record you save.</p>
            </form>
          )}
        </div>
      )}

      {active === 'members' && (
        <div className="space-y-4" data-testid="cgm-leader-members">
          <div className={card}>
            <p className={label}>Your group</p>
            <ul className="mt-2 divide-y divide-slate-100">
              {members.map((member: any) => (
                <li key={member.studentId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div>
                    <p className="text-sm font-bold text-slate-800">{member.fullName}{member.isMe ? ' (you)' : ''}
                      {member.roles?.includes('leader') && <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-black uppercase text-emerald-700">Leader</span>}
                      {member.roles?.includes('assistant') && <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-[9px] font-black uppercase text-sky-700">Assistant</span>}
                    </p>
                    {(member.phone || member.email) && <p className="text-[11px] font-semibold text-slate-400">{[member.phone, member.email].filter(Boolean).join(' · ')}</p>}
                  </div>
                  {!member.isMe && (has('remove_members') || has('request_member_removals')) && (
                    <button
                      type="button"
                      className={miniButton}
                      disabled={busy}
                      onClick={() => void run(
                        () => cgmStudent.leaderRemoveMember(groupId, Number(member.studentId), 'Removed by the group leader'),
                        has('remove_members') ? `${member.fullName} was removed — the organizer can restore them from the Recycle Bin.` : `Asked your organizer to remove ${member.fullName}.`,
                      )}
                    >
                      <UserMinus className="mr-1 inline h-3.5 w-3.5" /> {has('remove_members') ? 'Remove' : 'Request removal'}
                    </button>
                  )}
                </li>
              ))}
              {!members.length && <li className="py-2 text-[11px] text-slate-400">Nobody in this group yet.</li>}
            </ul>
          </div>
          {(has('add_members') || has('request_member_additions')) && (
            <form
              className={`${card} space-y-3`}
              data-testid="cgm-leader-add-form"
              onSubmit={(event) => {
                event.preventDefault();
                const studentId = Number(requestTarget);
                if (!studentId) { setMessage('Choose a classmate first.'); return; }
                const chosen = (data.candidates || []).find((entry: any) => Number(entry.studentId) === studentId);
                void run(
                  () => cgmStudent.leaderAddMember(groupId, studentId, 'Added by the group leader'),
                  has('add_members')
                    ? `${chosen?.fullName || 'The student'} was added to your group.`
                    : `Asked your organizer to add ${chosen?.fullName || 'that student'}.`,
                );
              }}
            >
              <p className={label}>{has('add_members') ? 'Add an unassigned classmate' : 'Ask for a classmate to be added'}</p>
              <select className={inputClass} value={requestTarget} onChange={(event) => setRequestTarget(event.target.value)} aria-label="Classmate to add">
                <option value="">Choose a classmate…</option>
                {(data.candidates || []).map((entry: any) => <option key={entry.studentId} value={entry.studentId}>{entry.fullName}</option>)}
              </select>
              <button type="submit" disabled={busy} className="cgm-primary-button">{busy ? 'Working…' : has('add_members') ? 'Add to my group' : 'Request addition'}</button>
              <p className="text-[11px] font-medium text-slate-500">Only classmates with no group in this activity can be added{has('add_members') ? ', and only while the group has space' : '; your organizer makes the final call'}.</p>
            </form>
          )}
        </div>
      )}

      {active === 'requests' && (
        <div className="space-y-4">
          <form
            className={`${card} space-y-3`}
            data-testid="cgm-leader-request-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (requestKind === 'access' && !requestTool) { setMessage('Choose the tool you are asking for.'); return; }
              void run(async () => {
                const result: any = await cgmStudent.leaderRequest(groupId, {
                  kind: requestKind,
                  permission: requestKind === 'access' ? requestTool : undefined,
                  studentId: requestKind === 'issue' || requestKind === 'access' ? undefined : Number(requestTarget) || undefined,
                  title: requestTitle || undefined,
                  reason: requestReason || undefined,
                });
                setRequestTitle(''); setRequestReason(''); setRequestTarget(''); setRequestTool('');
                return String(result?.message || '');
              }, 'Sent — your organizers have it.');
            }}
          >
            <p className={label}>Raise it with your organizer</p>
            <select className={inputClass} value={requestKind} aria-label="Request type" data-testid="cgm-leader-request-kind" onChange={(event) => setRequestKind(event.target.value as any)}>
              <option value="access">Ask for a tool to be opened</option>
              {has('report_issues') && <option value="issue">Report an issue</option>}
              {has('request_member_additions') && <option value="add_member">Ask for a member to be added</option>}
              {has('request_member_removals') && <option value="remove_member">Ask for a member to be removed</option>}
            </select>
            {requestKind === 'access' && (
              <div data-testid="cgm-leader-request-tool">
                <p className="text-[11px] font-medium text-slate-500">Pick the tool you need. Your organizer sees exactly what it does before they approve, and it opens for you the moment they do.</p>
                <select className={`${inputClass} mt-1.5`} value={requestTool} aria-label="Tool to request" onChange={(event) => setRequestTool(event.target.value)}>
                  <option value="">Choose a tool…</option>
                  {(data.seat.withheld || []).map((entry: any) => (
                    <option key={entry.key} value={entry.key}>{entry.label}</option>
                  ))}
                </select>
                {requestTool && (
                  <p className="mt-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-800">
                    {(data.seat.withheld || []).find((entry: any) => entry.key === requestTool)?.hint}
                  </p>
                )}
                {!(data.seat.withheld || []).length && (
                  <p className="mt-1 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] font-bold text-amber-800">You already hold every tool for this group.</p>
                )}
              </div>
            )}
            {requestKind !== 'issue' && requestKind !== 'access' && (
              <select className={inputClass} value={requestTarget} aria-label="Student this request is about" onChange={(event) => setRequestTarget(event.target.value)}>
                <option value="">Choose the student…</option>
                {(requestKind === 'add_member' ? (data.candidates || []) : members).map((entry: any) => (
                  <option key={entry.studentId} value={entry.studentId}>{entry.fullName}</option>
                ))}
              </select>
            )}
            <input className={inputClass} value={requestTitle} maxLength={160} onChange={(event) => setRequestTitle(event.target.value)} placeholder="Short title" aria-label="Request title" />
            <textarea className={`${inputClass} min-h-20`} value={requestReason} maxLength={1000} onChange={(event) => setRequestReason(event.target.value)} placeholder="What is happening, and what do you need?" aria-label="Request detail" />
            <button type="submit" disabled={busy} className="cgm-primary-button">{busy ? 'Sending…' : 'Send to organizer'}</button>
          </form>
          <div className={card}>
            <p className={label}>Your requests</p>
            <ul className="mt-2 divide-y divide-slate-100" data-testid="cgm-leader-requests">
              {(data.requests || []).map((row: any) => (
                <li key={row.id} className="py-2">
                  <p className="text-sm font-bold text-slate-800">
                    {row.kind === 'issue' ? <AlertTriangle className="mr-1 inline h-3.5 w-3.5 text-amber-500" />
                      : row.kind === 'access' ? <KeyRound className="mr-1 inline h-3.5 w-3.5 text-emerald-600" />
                      : row.kind === 'add_member' ? <UserPlus className="mr-1 inline h-3.5 w-3.5 text-emerald-600" />
                      : <UserMinus className="mr-1 inline h-3.5 w-3.5 text-red-500" />}
                    {row.title}
                    <span className={`ml-2 rounded px-1.5 py-0.5 text-[9px] font-black uppercase ${row.status === 'pending' ? 'bg-amber-100 text-amber-700' : row.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{row.status}</span>
                  </p>
                  <p className="text-[11px] font-semibold text-slate-400">{formatWhen(row.createdAt)}{row.targetName ? ` · ${row.targetName}` : ''}{row.reviewerLabel ? ` · ${row.reviewerLabel}` : ''}</p>
                  {row.reason && <p className="mt-0.5 text-xs font-medium text-slate-600">{row.reason}</p>}
                  {row.reviewReason && <p className="mt-0.5 text-[11px] font-semibold text-slate-500">Organizer: {row.reviewReason}</p>}
                </li>
              ))}
              {!(data.requests || []).length && <li className="py-2 text-[11px] text-slate-400">Nothing raised yet.</li>}
            </ul>
          </div>
        </div>
      )}

      <div className={`${card} flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold text-slate-500`}>
        <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> Every action here is limited to {data.group.name} and recorded for your organizer.</span>
        <span className="inline-flex items-center gap-1.5"><Settings2 className="h-3.5 w-3.5 text-slate-400" /> Missing a tool? Ask your organizer to change your permissions.</span>
      </div>
    </div>
  );
};

/** The portal tile that opens a leader's console — one per seat held. */
export const LeaderSeatList = ({ onOpen, onChanged }: { onOpen: (groupId: number) => void; onChanged?: () => void }) => {
  const [seats, setSeats] = useState<any[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result: any = await cgmStudent.myLeadership();
      setSeats(result.seats || []);
    } catch (failure: any) {
      setSeats([]);
      setMessage(failure?.message || 'Your leadership seats could not be loaded.');
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (seats === null) return <p className="text-sm font-semibold text-slate-400">Loading your leadership…</p>;
  if (!seats.length) {
    return (
      <div className={card} data-testid="cgm-leader-empty">
        <p className={label}>My group (leader)</p>
        <p className="mt-2 text-sm font-semibold text-slate-500">You are not leading a group right now. When your organizer appoints you — or your group elects you — this page becomes your console for that group.</p>
        <button type="button" className={`${miniButton} mt-3`} onClick={() => { void load(); onChanged?.(); }}>Refresh</button>
      </div>
    );
  }
  return (
    <div className="space-y-3" data-testid="cgm-leader-seats">
      <div className={card}>
        <p className={label}>My group (leader)</p>
        <p className="mt-1 text-xs font-medium text-slate-500">You hold {seats.length} leadership seat{seats.length === 1 ? '' : 's'}. Open one to run that group.</p>
      </div>
      {message && <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">{message}</div>}
      {seats.map((seat) => (
        <button
          key={`${seat.groupId}-${seat.activityId}`}
          type="button"
          onClick={() => onOpen(Number(seat.groupId))}
          data-testid={`cgm-leader-seat-${seat.groupId}`}
          className={`${card} flex w-full items-center justify-between gap-3 text-left transition hover:border-emerald-300`}
        >
          <div>
            <p className="text-sm font-black text-slate-800">{seat.groupName} <span className="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-black uppercase text-emerald-700">{seat.role}</span></p>
            <p className="text-[11px] font-semibold text-slate-400">{seat.activityName} · {seat.className} · {seat.size} member{seat.size === 1 ? '' : 's'} · {seat.permissionCount} tool{seat.permissionCount === 1 ? '' : 's'}{seat.pendingRequests ? ` · ${seat.pendingRequests} request awaiting the organizer` : ''}</p>
          </div>
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        </button>
      ))}
    </div>
  );
};
