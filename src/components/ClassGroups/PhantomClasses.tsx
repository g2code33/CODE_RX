import { useCallback, useEffect, useState } from 'react';
import { ClipboardList, FileText, RefreshCw, ShieldCheck, Users } from 'lucide-react';
import { cgm } from '../../lib/cgm';
import { ConnectionBanner } from './ConnectionBanner';
import { appDialog } from '../AppDialog';

/**
 * CODE Rx — PHANTOM Control Center (Class & Group Management oversight).
 *
 * Server-verified PHANTOM-only area: organizer applications, class approvals,
 * sensitive profile changes, registration-approval delegation, disputes,
 * organizer activity, the module flag and the audit trail. Every action is
 * re-checked server-side and audited; the UI never decides anything.
 */

const card = 'rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm shadow-emerald-950/5';
const label = 'text-[10px] font-black uppercase tracking-[0.16em] text-slate-400';
const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 focus:border-emerald-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-100';

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

type Tab = 'overview' | 'applications' | 'classes' | 'sensitive' | 'delegation' | 'disputes' | 'organizers' | 'audit';

const TABS: Array<[Tab, string]> = [
  ['overview', 'Overview'],
  ['applications', 'Organizer applications'],
  ['classes', 'Class approvals'],
  ['sensitive', 'Sensitive changes'],
  ['delegation', 'Registration delegation'],
  ['disputes', 'Disputes'],
  ['organizers', 'Organizer activity'],
  ['audit', 'Audit trail'],
];

type PhantomRows = Record<Tab, any[] | undefined>;

export const PhantomClassGroups = ({ onExit, embedded }: { onExit?: () => void; embedded?: boolean }) => {
  const [tab, setTab] = useState<Tab>('overview');
  const [overview, setOverview] = useState<any>(null);
  const [rows, setRows] = useState<PhantomRows>({} as PhantomRows);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadOverview = useCallback(async () => { setOverview(await cgm.phantomOverview().catch(() => null)); }, []);
  const loadTab = useCallback(async (which: Tab) => {
    const loaders: Partial<Record<Tab, () => Promise<unknown>>> = {
      applications: () => cgm.phantomOrganizerApplications(),
      classes: () => cgm.phantomClasses(),
      sensitive: () => cgm.phantomSensitiveChanges(),
      delegation: () => cgm.phantomDelegations(),
      disputes: () => cgm.phantomDisputes(),
      organizers: () => cgm.phantomOrganizerActivity(),
      audit: () => cgm.phantomAudit(),
    };
    const load: (() => Promise<any>) | undefined = loaders[which];
    if (!load) { setRows((current) => ({ ...current, [which]: [] })); return; }
    const data = await load().catch(() => null);
    setRows((current) => ({ ...current, [which]: (Array.isArray(data) ? data : data?.data || []) as any[] }));
  }, []);

  useEffect(() => { void loadOverview(); }, [loadOverview]);
  useEffect(() => { void loadTab(tab); }, [tab, loadTab]);

  const act = async (work: () => Promise<unknown>, note: string) => {
    setBusy(true); setMessage(null);
    try { await work(); setMessage(note); await Promise.all([loadOverview(), loadTab(tab)]); }
    catch (failure: any) { setMessage(failure?.message || 'That did not work.'); }
    finally { setBusy(false); }
  };

  const body = (
    <>
          {message && <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{message}</p>}

          {tab === 'overview' && overview && (
            <>
              <div className={card}>
                <p className={label}>Module</p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-slate-900">Class &amp; Group Management is {overview.moduleEnabled ? 'enabled' : 'disabled'}</p>
                    <p className="text-xs font-medium text-slate-500">Disabling hides student and organizer entry points; all data is preserved.</p>
                  </div>
                  <button type="button" disabled={busy} className={overview.moduleEnabled ? 'mini-button text-red-600' : 'cgm-primary-button'} onClick={() => void act(() => cgm.phantomModule(!overview.moduleEnabled), overview.moduleEnabled ? 'Module disabled.' : 'Module enabled.')}>
                    {overview.moduleEnabled ? 'Disable module' : 'Enable module'}
                  </button>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {[
                  ['Classes', (overview.counters?.classes_active || 0) + (overview.counters?.classes_blocked || 0)],
                  ['Members', overview.counters?.students_active],
                  ['Live activities', overview.counters?.activities_live],
                  ['Applications', overview.counters?.organizer_apps],
                  ['Audit (7d)', overview.counters?.audit_week],
                  ['Open queues', Number(overview.queues?.applications || 0) + Number(overview.queues?.classes || 0) + Number(overview.queues?.sensitiveChanges || 0) + Number(overview.queues?.disputes || 0)],
                ].map(([text, value]) => (
                  <div key={String(text)} className="rounded-xl bg-slate-50 p-4">
                    <p className={label}>{text as string}</p>
                    <p className="mt-1 text-2xl font-black text-slate-800">{Number(value || 0)}</p>
                  </div>
                ))}
              </div>
            </>
          )}

          {tab === 'applications' && (
            <ListBlock title="Organizer applications" rows={rows.applications} emptyText="No applications await review."
              render={(row) => (
                <>
                  <div>
                    <p className="text-sm font-black text-slate-800">{row.name} <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-black uppercase text-slate-500">{String(row.status).replace('_', ' ')}</span></p>
                    <p className="text-[11px] font-semibold text-slate-400">{row.institution} · {row.email} · {formatWhen(row.createdAt)}{row.emailVerified ? ' · email verified' : ' · email NOT verified'}</p>
                    {row.motivation && <p className="mt-1 text-xs text-slate-500">“{row.motivation}”</p>}
                    {row.reviewReason && <p className="mt-1 text-xs font-semibold text-amber-600">PHANTOM: {row.reviewReason}</p>}
                  </div>
                  {['pending', 'email_verified'].includes(String(row.status)) && (
                    <div className="flex flex-wrap gap-1.5">
                      <button type="button" disabled={busy} className="cgm-primary-button" onClick={() => void act(() => cgm.phantomOrganizerAction(Number(row.id), 'approve'), `${row.name} approved as organizer.`)}>Approve</button>
                      <button type="button" disabled={busy} className="mini-button" onClick={async () => { const reason = await appDialog.prompt({ title: 'Request a correction', label: 'What must the applicant fix?', multiline: true, confirmLabel: 'Send' }); if (reason) await act(() => cgm.phantomOrganizerAction(Number(row.id), 'correction', reason), 'Correction requested.'); }}>Correction</button>
                      <button type="button" disabled={busy} className="mini-button text-red-600" onClick={async () => { const reason = await appDialog.prompt({ title: 'Reject this application', label: 'Rejection reason', multiline: true, confirmLabel: 'Reject' }); if (reason) await act(() => cgm.phantomOrganizerAction(Number(row.id), 'reject', reason), 'Application rejected.'); }}>Reject</button>
                    </div>
                  )}
                  {row.status === 'approved' && (
                    <div className="flex flex-wrap gap-1.5">
                      <button type="button" disabled={busy} className="mini-button text-amber-600" onClick={async () => { const reason = await appDialog.prompt({ title: 'Suspend this organizer', label: 'Suspension reason', multiline: true, confirmLabel: 'Suspend' }); if (reason) await act(() => cgm.phantomOrganizerAction(Number(row.id), 'suspend', reason), 'Organizer suspended.'); }}>Suspend</button>
                      <button type="button" disabled={busy} className="mini-button text-red-600" onClick={async () => { const reason = await appDialog.prompt({ title: 'Revoke the organizer role', label: 'Revocation reason', multiline: true, confirmLabel: 'Revoke' }); if (reason) await act(() => cgm.phantomOrganizerAction(Number(row.id), 'revoke', reason), 'Organizer role revoked.'); }}>Revoke</button>
                    </div>
                  )}
                  {['suspended', 'correction'].includes(String(row.status)) && (
                    <div className="flex flex-wrap gap-1.5">
                      {row.status === 'suspended' && <button type="button" disabled={busy} className="mini-button" onClick={() => void act(() => cgm.phantomOrganizerAction(Number(row.id), 'reinstate'), 'Organizer reinstated.')}>Reinstate</button>}
                      {row.status === 'correction' && <button type="button" disabled={busy} className="mini-button" onClick={() => void act(() => cgm.phantomOrganizerAction(Number(row.id), 'approve'), 'Application approved.')}>Approve now</button>}
                    </div>
                  )}
                </>
              )}
            />
          )}

          {tab === 'classes' && (
            <ListBlock title="Class approvals" rows={rows.classes} emptyText="No classes await review."
              render={(row) => (
                <>
                  <div>
                    <p className="text-sm font-black text-slate-800">{row.name} <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-black uppercase text-slate-500">{row.status}</span></p>
                    <p className="text-[11px] font-semibold text-slate-400">{row.code} · {row.institution} · organizer {row.createdBy || '—'} · {row.memberCount} members · {formatWhen(row.createdAt)}</p>
                    {row.reviewReason && <p className="mt-1 text-xs font-semibold text-amber-600">Last review: {row.reviewReason}</p>}
                  </div>
                  {row.status === 'pending' && (
                    <div className="flex flex-wrap gap-1.5">
                      <button type="button" disabled={busy} className="cgm-primary-button" onClick={() => void act(() => cgm.phantomClassAction(Number(row.id), 'approve'), `${row.name} approved — invitations can go live.`)}>Approve</button>
                      <button type="button" disabled={busy} className="mini-button" onClick={async () => { const reason = await appDialog.prompt({ title: 'Request a correction', label: 'What must the organizer fix before resubmitting?', multiline: true, confirmLabel: 'Send' }); if (reason) await act(() => cgm.phantomClassAction(Number(row.id), 'correction', reason), 'Correction requested — the class returns to draft.'); }}>Correction</button>
                      <button type="button" disabled={busy} className="mini-button text-red-600" onClick={async () => { const reason = await appDialog.prompt({ title: 'Reject this class', label: 'Rejection reason', multiline: true, confirmLabel: 'Reject' }); if (reason) await act(() => cgm.phantomClassAction(Number(row.id), 'reject', reason), 'Class rejected.'); }}>Reject</button>
                    </div>
                  )}
                  {row.status === 'active' && (
                    <div className="flex flex-wrap gap-1.5">
                      <button type="button" disabled={busy} className="mini-button text-amber-600" onClick={async () => { const reason = await appDialog.prompt({ title: 'Suspend this class', label: 'Suspension reason', multiline: true, confirmLabel: 'Suspend' }); if (reason) await act(() => cgm.phantomClassAction(Number(row.id), 'suspend', reason), 'Class suspended.'); }}>Suspend</button>
                      <button type="button" disabled={busy} className="mini-button text-red-600" onClick={() => void act(() => cgm.phantomClassAction(Number(row.id), 'archive'), 'Class archived.')}>Archive</button>
                    </div>
                  )}
                  {row.status === 'suspended' && (
                    <button type="button" disabled={busy} className="mini-button" onClick={() => void act(() => cgm.phantomClassAction(Number(row.id), 'reinstate'), 'Class reinstated.')}>Reinstate</button>
                  )}
                </>
              )}
            />
          )}

          {tab === 'sensitive' && (
            <ListBlock title="Sensitive profile changes" rows={rows.sensitive} emptyText="No sensitive changes await review."
              render={(row) => (
                <>
                  <div>
                    <p className="text-sm font-black text-slate-800">{row.studentName} — {String(row.field).replace(/_/g, ' ')}</p>
                    <p className="text-[11px] font-semibold text-slate-400"><span className="line-through">{row.oldValue || '—'}</span> → <span className="text-emerald-700">{row.newValue}</span> · index {row.indexNumber} · {formatWhen(row.createdAt)}</p>
                    {row.reason && <p className="mt-1 text-xs text-slate-500">“{row.reason}”</p>}
                  </div>
                  {row.status === 'pending' && (
                    <div className="flex flex-wrap gap-1.5">
                      <button type="button" disabled={busy} className="cgm-primary-button" onClick={() => void act(() => cgm.phantomDecideSensitiveChange(Number(row.id), 'approve'), 'Change applied to the permanent identity.')}>Approve</button>
                      <button type="button" disabled={busy} className="mini-button text-red-600" onClick={async () => { const reason = await appDialog.prompt({ title: 'Reject this change', label: 'Rejection reason', multiline: true, confirmLabel: 'Reject' }); if (reason) await act(() => cgm.phantomDecideSensitiveChange(Number(row.id), 'reject', reason), 'Change rejected.'); }}>Reject</button>
                    </div>
                  )}
                </>
              )}
            />
          )}

          {tab === 'delegation' && <DelegationTab rows={rows.delegation} act={act} busy={busy} />}

          {tab === 'disputes' && (
            <ListBlock title="Reported announcements" rows={rows.disputes} emptyText="No open disputes."
              render={(row) => (
                <>
                  <div>
                    <p className="text-sm font-black text-slate-800">{row.title}</p>
                    <p className="text-[11px] font-semibold text-slate-400">{row.className} · reported {formatWhen(row.createdAt)} · <span className="uppercase">{row.status}</span></p>
                    {row.excerpt && <p className="mt-1 text-xs text-slate-500">“{row.excerpt}”</p>}
                    {row.reason && <p className="mt-1 text-xs font-semibold text-amber-600">Reason: {row.reason}</p>}
                  </div>
                  {row.status === 'open' && (
                    <div className="flex flex-wrap gap-1.5">
                      <button type="button" disabled={busy} className="mini-button" onClick={() => void act(() => cgm.phantomResolveDispute(Number(row.id), 'dismiss'), 'Report dismissed.')}>Dismiss</button>
                      <button type="button" disabled={busy} className="mini-button text-red-600" onClick={() => void act(() => cgm.phantomResolveDispute(Number(row.id), 'remove'), 'Announcement removed and report resolved.')}>Remove post</button>
                    </div>
                  )}
                </>
              )}
            />
          )}

          {tab === 'organizers' && (
            <ListBlock title="Organizer activity" rows={rows.organizers} emptyText="No organizer activity yet."
              render={(row) => (
                <div className="flex w-full flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-black text-slate-800">{row.name}</p>
                    <p className="text-[11px] font-semibold text-slate-400">{row.email} · {row.classesOrganized} class(es) · {row.studentsManaged} students · last action {formatWhen(row.lastActionAt)}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${row.status === 'active' || row.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{String(row.status).replace('_', ' ')}</span>
                </div>
              )}
            />
          )}

          {tab === 'audit' && (
            <ListBlock title="Audit trail" rows={rows.audit} emptyText="No class & group events recorded yet."
              render={(row) => (
                <div className="flex w-full flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-slate-700">{String(row.action).replace(/[._]/g, ' ')}</p>
                    <p className="text-[11px] font-semibold text-slate-400">{row.actor_label} · target {row.entity_type || '—'} #{row.entity_id ?? '—'}{row.class_id ? ` · class #${row.class_id}` : ''}</p>
                  </div>
                  <span className="text-xs font-bold text-slate-400">{formatWhen(row.created_at)}</span>
                </div>
              )}
            />
          )}
    </>
  );

  if (embedded) {
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-black text-slate-900">Class &amp; Group Management oversight</p>
          <div className="flex flex-wrap gap-1.5">
            {TABS.map(([key, text]) => (
              <button key={key} type="button" onClick={() => setTab(key)} className={`rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-wider transition ${tab === key ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700'}`}>{text}</button>
            ))}
          </div>
        </div>
        {body}
      </div>
    );
  }

  return (
    <div className="cgm-shell">
      <ConnectionBanner />
      <header className="cgm-topbar">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-900 text-white"><ShieldCheck className="h-5 w-5" /></span>
          <div>
            <p className="text-sm font-black text-slate-900">PHANTOM — Class &amp; Group Oversight</p>
            <p className="text-[11px] font-semibold text-slate-400">Every decision is re-verified server-side and audited</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="mini-button" onClick={() => { void loadOverview(); void loadTab(tab); }} aria-label="Refresh"><RefreshCw className="h-3.5 w-3.5" /></button>
          <button type="button" className="mini-button" onClick={onExit}>Exit</button>
        </div>
      </header>

      <div className="cgm-body">
        <nav className="cgm-sidenav" aria-label="PHANTOM sections">
          {TABS.map(([key, text]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              aria-current={tab === key ? 'page' : undefined}
              className={`cgm-side-link ${tab === key ? 'cgm-side-link--active' : ''}`}
            >
              {key === 'overview' ? <ShieldCheck className="h-4 w-4" /> : key === 'audit' ? <FileText className="h-4 w-4" /> : key === 'organizers' ? <Users className="h-4 w-4" /> : <ClipboardList className="h-4 w-4" />}
              <span className="flex-1 text-left">{text}</span>
              {key === 'applications' && Number(overview?.queues?.applications || 0) > 0 && <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-black text-white">{overview.queues.applications}</span>}
              {key === 'classes' && Number(overview?.queues?.classes || 0) > 0 && <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-black text-white">{overview.queues.classes}</span>}
              {key === 'sensitive' && Number(overview?.queues?.sensitiveChanges || 0) > 0 && <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-black text-white">{overview.queues.sensitiveChanges}</span>}
              {key === 'disputes' && Number(overview?.queues?.disputes || 0) > 0 && <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-black text-white">{overview.queues.disputes}</span>}
            </button>
          ))}
        </nav>

        <main className="cgm-main space-y-5">{body}</main>
      </div>
    </div>
  );
};

const ListBlock = ({ title, rows, emptyText, render }: { title: string; rows?: any[]; emptyText: string; render: (row: any) => React.ReactNode }) => (
  <div className={card}>
    <p className={label}>{title}</p>
    {rows === undefined && <p className="mt-2 text-sm font-semibold text-slate-400">Loading…</p>}
    {rows !== undefined && rows.length === 0 && <p className="mt-2 text-xs font-medium text-slate-400">{emptyText}</p>}
    <ul className="divide-y divide-slate-100">
      {(rows || []).map((row, index) => (
        <li key={row.id ?? index} className="flex flex-wrap items-center justify-between gap-3 py-3.5">{render(row)}</li>
      ))}
    </ul>
  </div>
);

const DelegationTab = ({ rows, act, busy }: { rows?: any[]; act: (work: () => Promise<unknown>, note: string) => Promise<void>; busy: boolean }) => {
  const [memberId, setMemberId] = useState('');
  const [classId, setClassId] = useState('');
  const [maxBatch, setMaxBatch] = useState('');
  return (
    <>
      <div className={card}>
        <p className={label}>Delegate registration approvals</p>
        <p className="mt-1 text-xs font-medium text-slate-500">Let a trusted member approve student registrations for one class. Optional per-batch cap. Revocation is immediate; every delegated approval is audited.</p>
        <form
          className="mt-3 flex flex-wrap items-end gap-2"
          onSubmit={async (event) => {
            event.preventDefault();
            await act(() => cgm.phantomGrantDelegation({
              memberId: Number(memberId),
              classId: Number(classId),
              ...(maxBatch ? { maxBatch: Number(maxBatch) } : {}),
            }), 'Delegation granted.');
            setMemberId(''); setClassId(''); setMaxBatch('');
          }}
        >
          <div><label className={label} htmlFor="cgm-del-member">Member id</label><input id="cgm-del-member" required type="number" min="1" className={`${inputClass} mt-1 w-32`} value={memberId} onChange={(event) => setMemberId(event.target.value)} /></div>
          <div><label className={label} htmlFor="cgm-del-class">Class id</label><input id="cgm-del-class" required type="number" min="1" className={`${inputClass} mt-1 w-32`} value={classId} onChange={(event) => setClassId(event.target.value)} /></div>
          <div><label className={label} htmlFor="cgm-del-max">Max approvals (optional)</label><input id="cgm-del-max" type="number" min="1" className={`${inputClass} mt-1 w-40`} value={maxBatch} onChange={(event) => setMaxBatch(event.target.value)} /></div>
          <button type="submit" disabled={busy} className="cgm-primary-button">Grant</button>
        </form>
      </div>
      <ListBlock title="Delegations" rows={rows} emptyText="No delegations granted."
        render={(row) => (
          <>
            <div>
              <p className="text-sm font-black text-slate-800">{row.memberName || `Member #${row.memberId}`} → {row.className || `Class #${row.classId}`}</p>
              <p className="text-[11px] font-semibold text-slate-400">{row.maxBatch ? `max ${row.maxBatch} approvals` : 'unlimited approvals'} · {row.approvalsUsed} used · granted {formatWhen(row.createdAt)}{row.status !== 'active' ? ` · ${row.status}` : ''}</p>
            </div>
            {row.status === 'active' && (
              <button type="button" disabled={busy} className="mini-button text-red-600" onClick={() => void act(() => cgm.phantomRevokeDelegation(Number(row.id)), 'Delegation revoked.')}>Revoke</button>
            )}
          </>
        )}
      />
    </>
  );
};
