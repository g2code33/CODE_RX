import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, CheckCircle2, Clock3, Layers, Loader2, Lock, RefreshCw, Search, Send, ShieldCheck, Target,
  UserPlus, Users, UserX, X,
} from 'lucide-react';
import {
  cgm, CgmError,
  type ForceGetEntryInput, type ForceGetItemInput, type ForceGetRoster, type ForceGetStudent,
  type ForceGetUnregisteredRow,
} from '../../lib/cgm';

/**
 * FORCE GET — the organizer's dedicated workspace.
 *
 * A Force Get is a PROPOSAL. The organizer picks a destination for named
 * students here; nothing moves, no seat changes and no student is notified
 * until PHANTOM approves that exact version. Approval records a designation —
 * the student still samples with the activity's own method and simply lands in
 * the approved group, and a student who was already sampled keeps their group
 * until their own individual Re-choose releases it.
 *
 * Design decisions that matter on this page:
 *   • destinations are always REAL group names read from the backend — the page
 *     never assumes "Group 1/2/3" numbering;
 *   • the roster includes everybody: sampled, grouped, awaiting re-choose,
 *     never-sampled and ineligible members (ineligible rows are shown, not
 *     dropped, and the server refuses them anyway);
 *   • the preview is computed from live sizes, so a proposal that would
 *     overfill a group is flagged before it is sent and blocked on submit.
 */

const card = 'rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm shadow-emerald-950/5 sm:p-5';
const label = 'text-[10px] font-black uppercase tracking-[0.16em] text-slate-400';
const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 focus:border-emerald-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-100';

type FilterKey = 'all' | 'unsampled' | 'sampled' | 'designated' | 'rechoose' | 'ineligible' | 'unregistered';

const FILTERS: Array<[FilterKey, string]> = [
  ['all', 'Everyone on the roster'],
  ['unsampled', 'Not sampled yet'],
  ['sampled', 'Already sampled'],
  ['designated', 'Has an approved designation'],
  ['rechoose', 'Re-choose in progress'],
  ['ineligible', 'Ineligible'],
  ['unregistered', 'Not registered yet'],
];

/** One row in a preview bucket: a member OR a roster row with no identity yet. */
type BucketMember = {
  key: string; fullName: string; groupId: number | null; groupName: string | null;
  gender: Gender; unregistered: boolean;
};

type Gender = 'male' | 'female' | 'unknown';
const asGender = (value: unknown): Gender => {
  const text = String(value || '').trim().toLowerCase();
  return text === 'male' || text === 'female' ? text : 'unknown';
};

const statusChips = (student: ForceGetStudent) => {
  const chips: Array<{ text: string; tone: string }> = [];
  if (student.everAssigned && student.groupId) chips.push({ text: 'SAMPLED', tone: 'bg-sky-50 text-sky-700' });
  if (!student.everAssigned) chips.push({ text: 'NOT SAMPLED', tone: 'bg-slate-100 text-slate-500' });
  if (student.everAssigned && !student.groupId) chips.push({ text: 'AWAITING RESAMPLE', tone: 'bg-amber-50 text-amber-700' });
  if (student.rechooseStatus === 'pending') chips.push({ text: 'RE-CHOOSE PENDING', tone: 'bg-amber-50 text-amber-700' });
  if (student.rechooseStatus === 'approved' && !student.groupId) chips.push({ text: 'RE-CHOOSE APPROVED', tone: 'bg-emerald-50 text-emerald-700' });
  if (student.designation) chips.push({ text: 'DESIGNATION APPROVED', tone: 'bg-amber-50 text-amber-800' });
  if (!student.eligible) chips.push({ text: 'INELIGIBLE', tone: 'bg-red-50 text-red-600' });
  return chips;
};

export const ForceGetWorkspace = ({ activityId, onBack, onChanged }: {
  activityId: number;
  onBack: () => void;
  onChanged?: () => void;
}) => {
  const [roster, setRoster] = useState<ForceGetRoster | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [destinations, setDestinations] = useState<Record<number, number>>({});
  // Roster rows that have not registered yet are keyed by their roster entry id —
  // a different id space from student ids, so they get their own selection map.
  const [entrySelected, setEntrySelected] = useState<Set<number>>(new Set());
  const [entryDestinations, setEntryDestinations] = useState<Record<number, number>>({});
  const [bulkGroupId, setBulkGroupId] = useState<number | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [explanation, setExplanation] = useState('');
  const [preview, setPreview] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await cgm.forceGetRoster(activityId);
      setRoster(data);
      setError(null);
      // Start each row from its live group so "keep where they are" is the
      // default and the organizer only changes what they mean to change.
      const seeded: Record<number, number> = {};
      for (const student of data.students || []) {
        if (student.groupId) seeded[student.id] = Number(student.groupId);
      }
      setDestinations((current) => {
        const next: Record<number, number> = { ...seeded };
        for (const [key, value] of Object.entries(current)) {
          if (data.students?.some((student) => student.id === Number(key))) next[Number(key)] = Number(value);
        }
        return next;
      });
      // An unregistered row starts from the seat already approved for it.
      const seededEntries: Record<number, number> = {};
      for (const row of data.unregistered || []) {
        if (row.reservation?.groupId) seededEntries[row.id] = Number(row.reservation.groupId);
      }
      setEntryDestinations((current) => {
        const next: Record<number, number> = { ...seededEntries };
        for (const [key, value] of Object.entries(current)) {
          if (data.unregistered?.some((row) => row.id === Number(key))) next[Number(key)] = Number(value);
        }
        return next;
      });
    } catch (failure: any) {
      setRoster(null);
      setError(failure?.message || 'The Force Get workspace could not be loaded.');
    } finally { setLoading(false); }
  }, [activityId]);

  useEffect(() => { void load(); }, [load]);

  const groups = roster?.groups || [];
  const students = roster?.students || [];
  const unregistered = useMemo<ForceGetUnregisteredRow[]>(() => roster?.unregistered || [], [roster]);
  const groupName = useCallback((groupId: number | null | undefined) => {
    if (!groupId) return null;
    return groups.find((group) => Number(group.id) === Number(groupId))?.name || null;
  }, [groups]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return students.filter((student) => {
      if (needle && !`${student.fullName} ${student.indexNumber}`.toLowerCase().includes(needle)) return false;
      switch (filter) {
        case 'unsampled': return !student.everAssigned;
        case 'sampled': return student.everAssigned;
        case 'designated': return Boolean(student.designation);
        case 'rechoose': return Boolean(student.rechooseStatus);
        case 'ineligible': return !student.eligible;
        // These rows live in their own list below the table.
        case 'unregistered': return false;
        default: return true;
      }
    });
  }, [students, search, filter]);

  /**
   * Roster rows with no student identity yet. They are shown in the same roster
   * on purpose: an organizer must be able to place somebody who has not
   * registered, without waiting for them to sign up first.
   */
  const visibleEntries = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (filter !== 'all' && filter !== 'ineligible' && filter !== 'unregistered') return [] as ForceGetUnregisteredRow[];
    return unregistered.filter((row) => {
      if (needle && !`${row.fullName} ${row.indexNumber}`.toLowerCase().includes(needle)) return false;
      if (filter === 'ineligible') return !row.eligible;
      return true;
    });
  }, [unregistered, search, filter]);

  const selectedStudents = useMemo(() => students.filter((student) => selected.has(student.id)), [students, selected]);
  const selectedEntries = useMemo(
    () => unregistered.filter((row) => entrySelected.has(row.id)),
    [unregistered, entrySelected],
  );

  /** Preview buckets: what each destination group would hold if approved. */
  const buckets = useMemo(() => {
    const rows = new Map<number, { groupId: number; name: string; size: number; capacity: number | null; incoming: BucketMember[]; leaving: number }>();
    const push = (target: number, key: string, fullName: string, groupId: number | null, groupName: string | null, gender: Gender, unregisteredRow: boolean) => {
      const group = groups.find((entry) => Number(entry.id) === Number(target));
      if (!group) return;
      if (!rows.has(Number(group.id))) {
        rows.set(Number(group.id), {
          groupId: Number(group.id), name: group.name, size: Number(group.size),
          capacity: group.capacity === null ? null : Number(group.capacity), incoming: [], leaving: 0,
        });
      }
      rows.get(Number(group.id))!.incoming.push({ key, fullName, groupId, groupName, gender, unregistered: unregisteredRow });
    };
    for (const student of selectedStudents) {
      const target = destinations[student.id];
      if (!target) continue;
      push(target, `s${student.id}`, student.fullName, student.groupId ?? null,
        student.groupName || null, asGender(student.gender), false);
    }
    for (const row of selectedEntries) {
      const target = entryDestinations[row.id];
      if (!target) continue;
      push(target, `r${row.id}`, row.fullName, null, null, asGender(row.gender), true);
    }
    // Members leaving a group into another group free their seat there.
    for (const student of selectedStudents) {
      const target = destinations[student.id];
      if (!target || !student.groupId || Number(student.groupId) === Number(target)) continue;
      const row = rows.get(Number(student.groupId));
      if (row) row.leaving += 1;
    }
    return [...rows.values()].map((row) => {
      const net = row.incoming.filter((member) => Number(member.groupId) !== row.groupId).length - row.leaving;
      const projected = row.size + net;
      return { ...row, projected, over: row.capacity !== null && projected > row.capacity };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [selectedStudents, selectedEntries, destinations, entryDestinations, groups]);

  const readyItems: ForceGetItemInput[] = useMemo(() => selectedStudents
    .filter((student) => destinations[student.id] && student.eligible)
    .map((student) => ({ studentId: student.id, groupId: Number(destinations[student.id]) })), [selectedStudents, destinations]);

  const readyEntries: ForceGetEntryInput[] = useMemo(() => selectedEntries
    .filter((row) => entryDestinations[row.id] && row.eligible)
    .map((row) => ({ rosterEntryId: row.id, groupId: Number(entryDestinations[row.id]) })), [selectedEntries, entryDestinations]);

  const blockedIneligible = selectedStudents.filter((student) => !student.eligible).length
    + selectedEntries.filter((row) => !row.eligible).length;
  const missingDestination = selectedStudents.filter((student) => !destinations[student.id]).length
    + selectedEntries.filter((row) => !entryDestinations[row.id]).length;
  const overfilled = buckets.filter((bucket) => bucket.over);

  /**
   * GENDER PREVIEW — the same rule the server enforces, computed before the
   * request is sent: the COMPLETE composition of every destination group
   * (members + seats already reserved by approved designations + EVERY student
   * in this proposal going there at once). One student at a time is never
   * enough: two different-pool students into one empty group clash with each
   * other, and 'unknown' is a pool of its own, never a wildcard.
   */
  const genderRule = roster?.activity?.genderRule || 'none';
  const genderConflicts = useMemo(() => {
    if (genderRule !== 'separate') return [] as Array<{
      groupId: number; groupName: string; existing: Array<{ name: string; gender: Gender }>;
      proposed: Array<{ name: string; gender: Gender }>; pools: Gender[];
    }>;
    const rows: Array<{
      groupId: number; groupName: string; existing: Array<{ name: string; gender: Gender }>;
      proposed: Array<{ name: string; gender: Gender }>; pools: Gender[];
    }> = [];
    for (const bucket of buckets) {
      const group = groups.find((entry) => Number(entry.id) === Number(bucket.groupId));
      const counts = group?.genderCounts || { male: 0, female: 0, unknown: 0 };
      const pools = new Set<Gender>();
      if (counts.male) pools.add('male');
      if (counts.female) pools.add('female');
      if (counts.unknown) pools.add('unknown');
      const existing: Array<{ name: string; gender: Gender }> = [];
      if (counts.male) existing.push({ name: `${counts.male} male member(s)`, gender: 'male' });
      if (counts.female) existing.push({ name: `${counts.female} female member(s)`, gender: 'female' });
      if (counts.unknown) existing.push({ name: `${counts.unknown} member(s) with no gender recorded`, gender: 'unknown' });
      const proposed = bucket.incoming
        .filter((member) => Number(member.groupId) !== Number(bucket.groupId))
        .map((member) => ({ name: member.fullName, gender: asGender(member.gender) }));
      for (const student of proposed) pools.add(student.gender);
      if (pools.size > 1) {
        rows.push({ groupId: bucket.groupId, groupName: bucket.name, existing, proposed, pools: [...pools] });
      }
    }
    return rows;
  }, [buckets, groups, genderRule]);

  const unknownGenderSelected = [
    ...selectedStudents.map((student) => ({ name: student.fullName, gender: student.gender })),
    ...selectedEntries.map((row) => ({ name: row.fullName, gender: row.gender })),
  ].filter((row) => asGender(row.gender) === 'unknown');
  const canSubmit = (readyItems.length > 0 || readyEntries.length > 0) && !missingDestination && !blockedIneligible
    && !overfilled.length && !genderConflicts.length && !busy;

  const toggle = (studentId: number, on: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(studentId); else next.delete(studentId);
      return next;
    });
  };

  const toggleEntry = (rosterEntryId: number, on: boolean) => {
    setEntrySelected((current) => {
      const next = new Set(current);
      if (on) next.add(rosterEntryId); else next.delete(rosterEntryId);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelected(new Set(visible.map((student) => student.id)));
    setEntrySelected(new Set(visibleEntries.filter((row) => row.eligible).map((row) => row.id)));
  };
  const clearSelection = () => { setSelected(new Set()); setEntrySelected(new Set()); setPreview(false); };

  const applyBulk = () => {
    if (!bulkGroupId) return;
    setBulkBusy(true);
    setDestinations((current) => {
      const next = { ...current };
      for (const student of selectedStudents) next[student.id] = Number(bulkGroupId);
      return next;
    });
    setEntryDestinations((current) => {
      const next = { ...current };
      for (const row of selectedEntries) next[row.id] = Number(bulkGroupId);
      return next;
    });
    setBulkBusy(false);
  };

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true); setError(null); setMessage(null); setWarnings([]);
    try {
      const items = readyItems;
      const entries = readyEntries;
      const pending = roster?.pendingRequest;
      const result = pending
        ? await cgm.reviseForceGet(Number(pending.id), items, explanation.trim() || undefined, entries)
        : await cgm.submitForceGet(activityId, items, explanation.trim() || undefined, entries);
      setWarnings(Array.isArray(result?.warnings) ? result.warnings : []);
      setMessage(`Version ${result?.version} sent to PHANTOM. Nothing moves until PHANTOM approves.`);
      setSelected(new Set());
      setEntrySelected(new Set());
      setPreview(false);
      setExplanation('');
      await load();
      onChanged?.();
    } catch (failure: any) {
      const detail = failure instanceof CgmError && Array.isArray(failure.data?.errors) ? failure.data.errors.join(' ') : '';
      setError(`${failure?.message || 'The request could not be sent.'}${detail ? ` ${detail}` : ''}`);
    } finally { setBusy(false); }
  };

  const cancelPending = async () => {
    const pending = roster?.pendingRequest;
    if (!pending) return;
    setBusy(true); setError(null);
    try {
      await cgm.cancelForceGet(Number(pending.id));
      setMessage(`Version ${pending.version} was cancelled. Nothing was changed for any student.`);
      await load();
      onChanged?.();
    } catch (failure: any) {
      setError(failure?.message || 'The request could not be cancelled.');
    } finally { setBusy(false); }
  };

  const pending = roster?.pendingRequest || null;
  const history = roster?.history || [];

  return (
    <div className="space-y-4 sm:space-y-5" data-testid="cgm-force-get">
      <div className={card}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={onBack}
              className="mt-0.5 rounded-xl border border-slate-200 bg-white p-2 text-slate-500 transition hover:border-emerald-300 hover:text-emerald-700"
              aria-label="Back to groups"
              data-testid="cgm-force-get-back"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <p className={label}>Force Get</p>
              <h2 className="mt-1 flex items-center gap-2 text-lg font-black text-slate-900 sm:text-xl">
                <Target className="h-5 w-5 text-amber-500" />
                {roster?.activity?.name || 'Choose an activity'}
              </h2>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                {roster?.activity?.className || '—'}
                {roster ? ` · method: ${roster.activity.method} · eligibility: ${roster.activity.eligibility}` : ''}
              </p>
              <p className="mt-2 max-w-2xl text-[11px] font-bold leading-relaxed text-amber-700">
                <ShieldCheck className="mr-1 inline h-3.5 w-3.5" />
                Nothing moves until PHANTOM approves. Every student still samples with this activity's own method —
                your approved destination only decides where their sample lands.
              </p>
            </div>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading} className="mini-button inline-flex items-center gap-1.5" data-testid="cgm-force-get-refresh">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        {message && (
          <div className="mt-3 flex items-start gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800" data-testid="cgm-force-get-message">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> <span>{message}</span>
          </div>
        )}
        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700" data-testid="cgm-force-get-error">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> <span>{error}</span>
          </div>
        )}
        {warnings.length > 0 && (
          <ul className="mt-2 space-y-1 rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800">
            {warnings.map((warning) => <li key={warning}>• {warning}</li>)}
          </ul>
        )}

        {pending && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5" data-testid="cgm-force-get-pending">
            <div className="text-xs font-bold text-amber-900">
              <Clock3 className="mr-1 inline h-3.5 w-3.5" />
              Version {pending.version} is waiting for PHANTOM · {pending.studentCount} student(s)
              <span className="ml-2 font-semibold text-amber-700">submitted {pending.submittedAt || 'just now'}</span>
              <span className="mt-1 block font-semibold text-amber-700">
                Any change you send replaces this version and needs fresh approval.
              </span>
            </div>
            <button type="button" onClick={() => void cancelPending()} disabled={busy} className="rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-black text-amber-800 hover:bg-amber-100" data-testid="cgm-force-get-cancel">
              Cancel request
            </button>
          </div>
        )}
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="cgm-force-get-stats">
        {[
          ['Students', students.length, Users],
          ['Sampled', students.filter((student) => student.everAssigned && student.groupId).length, CheckCircle2],
          ['Not sampled', students.filter((student) => !student.everAssigned).length, Target],
          ['Designated', students.filter((student) => Boolean(student.designation)).length, ShieldCheck],
          ['Not registered', unregistered.length, UserX],
          ['Seats held', unregistered.filter((row) => Boolean(row.reservation)).length, Lock],
        ].map(([title, value, Icon]: any) => (
          <div key={String(title)} className="rounded-xl border border-slate-100 bg-white px-3 py-2.5">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              <Icon className="mr-1 inline h-3 w-3" />{title}
            </p>
            <p className="mt-0.5 text-lg font-black text-slate-900">{value}</p>
          </div>
        ))}
      </div>

      {/* Search + filters */}
      <div className={card}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300" />
            <input
              className={`${inputClass} pl-9`}
              placeholder="Search by name or index number…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search the roster"
              data-testid="cgm-force-get-search"
            />
          </div>
          <select
            className={`${inputClass} sm:w-64`}
            value={filter}
            onChange={(event) => setFilter(event.target.value as FilterKey)}
            aria-label="Filter the roster"
            data-testid="cgm-force-get-filter"
          >
            {FILTERS.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
          </select>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-600" data-testid="cgm-force-get-counts">
            {visible.length + visibleEntries.length} shown · {selected.size + selectedEntries.length} selected
          </span>
          <button type="button" className="mini-button" onClick={selectAllFiltered} data-testid="cgm-force-get-select-all">Select all shown</button>
          <button type="button" className="mini-button" onClick={clearSelection} data-testid="cgm-force-get-clear">Clear</button>
          <span className="mx-1 hidden h-4 w-px bg-slate-200 sm:block" />
          <select
            className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-black text-slate-700"
            value={bulkGroupId ?? ''}
            onChange={(event) => setBulkGroupId(Number(event.target.value) || null)}
            aria-label="Bulk destination group"
            data-testid="cgm-force-get-bulk-group"
          >
            <option value="">Send selected to…</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>{group.name} — {group.size}/{group.capacity ?? '∞'}</option>
            ))}
          </select>
          <button
            type="button"
            className="mini-button disabled:opacity-40"
            disabled={!bulkGroupId || (!selected.size && !selectedEntries.length) || bulkBusy}
            onClick={applyBulk}
            data-testid="cgm-force-get-bulk-apply"
          >
            Apply to selected
          </button>
        </div>
      </div>

      {/* Roster */}
      <div className={card}>
        <div className="flex items-center justify-between">
          <p className={label}>Roster · destination per student (registered and not registered)</p>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-slate-300" />}
        </div>
        {!loading && !visible.length && !visibleEntries.length && (
          <p className="mt-3 rounded-xl bg-slate-50 px-3 py-4 text-center text-xs font-bold text-slate-400">Nobody matches this search or filter.</p>
        )}
        <div className="-mx-1 mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] border-separate border-spacing-y-1.5 px-1 text-left">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-slate-400">
                <th className="w-8 px-2 py-1"> </th>
                <th className="px-2 py-1">Student</th>
                <th className="px-2 py-1">State</th>
                <th className="px-2 py-1">Now</th>
                <th className="px-2 py-1">Proposed destination</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((student) => {
                const destination = destinations[student.id];
                const isSelected = selected.has(student.id);
                return (
                  <tr
                    key={student.id}
                    className={`align-top ${isSelected ? 'bg-emerald-50/60' : 'bg-slate-50/60'} ${student.eligible ? '' : 'opacity-70'}`}
                    data-testid="cgm-force-get-row"
                    data-student-id={student.id}
                  >
                    <td className="rounded-l-xl px-2 py-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                        checked={isSelected}
                        disabled={!student.eligible}
                        onChange={(event) => toggle(student.id, event.target.checked)}
                        aria-label={`Select ${student.fullName}`}
                        data-testid="cgm-force-get-select"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <p className="text-xs font-black text-slate-900">{student.fullName}</p>
                      <p className="text-[10px] font-semibold text-slate-400">{student.indexNumber}</p>
                    </td>
                    <td className="px-2 py-2">
                      <span className="flex flex-wrap gap-1">
                        {statusChips(student).map((chip) => (
                          <span key={chip.text} className={`rounded-full px-1.5 py-0.5 text-[9px] font-black ${chip.tone}`}>{chip.text}</span>
                        ))}
                      </span>
                      {student.designation && (
                        <p className="mt-1 text-[10px] font-bold text-amber-800" data-testid="cgm-force-get-designation">
                          Approved → {student.designation.groupName || groupName(student.designation.groupId) || 'a group'}
                          {student.designation.approvedBy ? ` · ${student.designation.approvedBy}` : ''}
                        </p>
                      )}
                    </td>
                    <td className="px-2 py-2 text-[11px] font-bold text-slate-600">
                      {student.groupName || (student.everAssigned ? 'between groups' : '—')}
                    </td>
                    <td className="rounded-r-xl px-2 py-2">
                      <select
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-black text-slate-800 disabled:bg-slate-100"
                        value={destination ?? ''}
                        disabled={!student.eligible}
                        onChange={(event) => setDestinations((current) => ({ ...current, [student.id]: Number(event.target.value) }))}
                        aria-label={`Destination for ${student.fullName}`}
                        data-testid="cgm-force-get-group"
                      >
                        <option value="">Choose a group…</option>
                        {groups.map((group) => {
                          const incoming = Number(destination) === Number(group.id) && Number(student.groupId) !== Number(group.id);
                          return (
                            <option key={group.id} value={group.id}>
                              {`${group.name} — ${Number(group.size) + (incoming ? 1 : 0)}/${group.capacity ?? '∞'}`}
                              {group.reserved ? ` · ${group.reserved} seat(s) reserved` : ''}
                            </option>
                          );
                        })}
                      </select>
                      {!student.eligible && <p className="mt-1 text-[10px] font-black text-red-500">Not eligible for this activity — cannot be forced.</p>}
                    </td>
                  </tr>
                );
              })}
              {visibleEntries.map((row) => {
                const destination = entryDestinations[row.id];
                const isSelected = entrySelected.has(row.id);
                return (
                  <tr
                    key={`entry-${row.id}`}
                    className={`align-top ${isSelected ? 'bg-sky-50/70' : 'bg-sky-50/30'} ${row.eligible ? '' : 'opacity-70'}`}
                    data-testid="cgm-force-get-unregistered-row"
                    data-roster-entry-id={row.id}
                  >
                    <td className="rounded-l-xl px-2 py-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-sky-600"
                        checked={isSelected}
                        disabled={!row.eligible}
                        onChange={(event) => toggleEntry(row.id, event.target.checked)}
                        aria-label={`Select ${row.fullName}`}
                        data-testid="cgm-force-get-select"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <p className="text-xs font-black text-slate-900">{row.fullName}</p>
                      <p className="text-[10px] font-semibold text-slate-400">{row.indexNumber}</p>
                    </td>
                    <td className="px-2 py-2">
                      <span className="flex flex-wrap gap-1">
                        <span className="rounded-full bg-sky-100 px-1.5 py-0.5 text-[9px] font-black text-sky-700" data-testid="cgm-force-get-unregistered-chip">
                          NOT REGISTERED
                        </span>
                        {row.reservation && (
                          <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-black text-amber-800">
                            SEAT HELD
                          </span>
                        )}
                        {!row.eligible && (
                          <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-[9px] font-black text-red-600">INELIGIBLE</span>
                        )}
                      </span>
                      {row.reservation && (
                        <p className="mt-1 text-[10px] font-bold text-amber-800" data-testid="cgm-force-get-reservation">
                          Approved → {row.reservation.groupName || groupName(row.reservation.groupId) || 'a group'}
                          {row.reservation.approvedBy ? ` · ${row.reservation.approvedBy}` : ''}
                        </p>
                      )}
                      <p className="mt-1 text-[10px] font-semibold text-slate-400">
                        Placed automatically when they register.
                      </p>
                    </td>
                    <td className="px-2 py-2 text-[11px] font-bold text-slate-600">
                      {row.reservation ? 'seat held' : 'on the roster'}
                    </td>
                    <td className="rounded-r-xl px-2 py-2">
                      <select
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-black text-slate-800 disabled:bg-slate-100"
                        value={destination ?? ''}
                        disabled={!row.eligible}
                        onChange={(event) => setEntryDestinations((current) => ({ ...current, [row.id]: Number(event.target.value) }))}
                        aria-label={`Destination for ${row.fullName}`}
                        data-testid="cgm-force-get-unregistered-group"
                      >
                        <option value="">Choose a group…</option>
                        {groups.map((group) => (
                          <option key={group.id} value={group.id}>
                            {`${group.name} — ${Number(group.size)}/${group.capacity ?? '∞'}`}
                            {group.reserved ? ` · ${group.reserved} seat(s) reserved` : ''}
                          </option>
                        ))}
                      </select>
                      {!row.eligible && (
                        <p className="mt-1 text-[10px] font-black text-red-500">
                          {row.reason || 'Not eligible for this activity — cannot be forced.'}
                        </p>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {visibleEntries.length > 0 && (
          <p className="mt-2 flex items-start gap-1.5 rounded-xl bg-sky-50 px-3 py-2 text-[10px] font-bold text-sky-800" data-testid="cgm-force-get-unregistered-note">
            <UserPlus className="mt-0.5 h-3 w-3 shrink-0" />
            Rows marked NOT REGISTERED are on the class roster but have no student identity yet. A destination you send for
            them is still approved by PHANTOM and holds the seat, capacity and gender pool — it becomes their own designation
            automatically the moment they register.
          </p>
        )}
      </div>

      {/* Preview + submit */}
      <div className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className={label}>Preview &amp; send for approval</p>
          <button
            type="button"
            className="mini-button inline-flex items-center gap-1.5"
            onClick={() => setPreview((value) => !value)}
            disabled={!selectedStudents.length && !selectedEntries.length}
            data-testid="cgm-force-get-preview-toggle"
          >
            <Layers className="h-3.5 w-3.5" /> {preview ? 'Hide preview' : 'Preview'}
          </button>
        </div>

        {preview && (
          <div className="mt-3 space-y-2" data-testid="cgm-force-get-preview">
            {!buckets.length && <p className="rounded-xl bg-slate-50 px-3 py-3 text-xs font-bold text-slate-400">Pick a destination for at least one selected student.</p>}
            {buckets.map((bucket) => (
              <div
                key={bucket.groupId}
                className={`rounded-xl border px-3 py-2 ${
                  bucket.over || genderConflicts.some((row) => row.groupId === bucket.groupId)
                    ? 'border-red-200 bg-red-50' : 'border-slate-100 bg-slate-50'}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <p className="text-xs font-black text-slate-900">{bucket.name}</p>
                  <p className={`text-[11px] font-black ${bucket.over ? 'text-red-600' : 'text-slate-500'}`}>
                    {bucket.size} now → {bucket.projected}/{bucket.capacity ?? '∞'}
                    {bucket.over ? ' · over capacity' : ''}
                  </p>
                </div>
                <p className="mt-1 text-[11px] font-semibold text-slate-600">
                  {bucket.incoming.map((member) => `${member.fullName}${
                    member.unregistered ? ' (not registered yet)'
                      : member.groupName ? ` (from ${member.groupName})` : ' (not sampled yet)'}`).join(' · ')}
                </p>
                {bucket.over && <p className="mt-1 text-[10px] font-black text-red-600">Reduce this group's incoming students before submitting.</p>}
                {genderRule === 'separate' && (
                  <p className={`mt-1 text-[10px] font-black ${
                    genderConflicts.some((row) => row.groupId === bucket.groupId) ? 'text-red-600' : 'text-slate-500'}`}>
                    Gender pools held now: {(() => {
                      const group = groups.find((entry) => Number(entry.id) === Number(bucket.groupId));
                      const pools = group?.genderPools || [];
                      const counts = group?.genderCounts || { male: 0, female: 0, unknown: 0 };
                      return pools.length
                        ? pools.map((pool) => `${pool} (${counts[pool as 'male' | 'female' | 'unknown'] || 0})`).join(', ')
                        : 'empty — this group is not gender-separated yet';
                    })()}
                  </p>
                )}
              </div>
            ))}
            {missingDestination > 0 && <p className="text-[11px] font-black text-red-600">{missingDestination} selected student(s) have no destination yet.</p>}
            {blockedIneligible > 0 && <p className="text-[11px] font-black text-red-600">{blockedIneligible} selected student(s) are not eligible and will never be forced.</p>}
          </div>
        )}

        {genderConflicts.length > 0 && (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5" data-testid="cgm-force-get-gender-conflict">
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-red-700">
              <AlertTriangle className="mr-1 inline h-3.5 w-3.5" /> Gender separation — cannot be sent as it stands
            </p>
            <ul className="mt-1.5 space-y-1.5 text-[11px] font-semibold text-red-800">
              {genderConflicts.map((conflict) => (
                <li key={conflict.groupId}>
                  <span className="font-black">{conflict.groupName}</span> would hold {conflict.pools.join(' and ')} together.
                  {' '}Already there: {conflict.existing.length ? conflict.existing.map((row) => row.name).join(', ') : 'nobody'}.
                  {' '}This proposal adds: {conflict.proposed.length
                    ? conflict.proposed.map((row) => `${row.name} (${row.gender})`).join(', ')
                    : 'nobody'}.
                  {' '}{conflict.pools.includes('unknown')
                    ? 'A gender is not recorded — the separated rule cannot be verified until it is set; unknown is never assumed to be male or female.'
                    : `This activity separates gender pools, so ${conflict.groupName} can only take one of them.`}
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-[10px] font-bold text-red-700">
              Move the clashing student to another group, or ask PHANTOM to change the activity's gender rule first.
            </p>
          </div>
        )}

        {genderRule === 'separate' && unknownGenderSelected.length > 0 && (
          <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-800" data-testid="cgm-force-get-gender-unknown">
            <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
            {unknownGenderSelected.length} selected student(s) have no gender recorded. A separated activity treats
            “unknown” as its own pool — set their gender in the class roster instead of guessing.
          </p>
        )}

        <label className="mt-3 block">
          <span className={label}>Why (PHANTOM reads this)</span>
          <textarea
            className={`${inputClass} mt-1 min-h-[76px] resize-y`}
            value={explanation}
            onChange={(event) => setExplanation(event.target.value)}
            placeholder="e.g. Two students registered late and must sit with their lab partners."
            maxLength={1000}
            data-testid="cgm-force-get-explanation"
          />
        </label>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700 active:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canSubmit}
            onClick={() => void submit()}
            data-testid="cgm-force-get-submit"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {pending ? 'Replace pending version' : 'Send to PHANTOM for approval'}
          </button>
          <span className="text-[11px] font-bold text-slate-400">
            {readyItems.length + readyEntries.length} student(s) ready
            {readyEntries.length ? ` · ${readyEntries.length} not registered yet` : ''}
            {pending ? ` · replaces version ${pending.version}` : ''}
          </span>
        </div>
        <p className="mt-2 text-[10px] font-semibold text-slate-400">
          Approved designations reserve their seats but never fill them: each student is placed when they sample
          (or when their own approved re-choose lets them sample again). A seat approved for somebody who has not
          registered yet becomes their own designation the moment they do. Organizers cannot approve their own request.
        </p>
      </div>

      {/* Version history */}
      {history.length > 0 && (
        <div className={card} data-testid="cgm-force-get-history">
          <p className={label}>Request history</p>
          <ul className="mt-2 space-y-1.5">
            {history.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-600">
                <span>
                  v{row.version} · {row.studentCount} student(s) · <span className="uppercase text-slate-400">{row.status}</span>
                  {row.requesterLabel ? ` · by ${row.requesterLabel}` : ''}
                </span>
                <span className="text-slate-400">
                  {row.reviewedAt ? `${row.reviewerLabel || 'PHANTOM'} · ${row.reviewedAt}` : (row.submittedAt || '')}
                  {row.reviewReason ? <span className="ml-1 text-red-500">— {row.reviewReason}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center gap-2 pb-2">
        <button type="button" onClick={onBack} className="mini-button inline-flex items-center gap-1.5">
          <X className="h-3.5 w-3.5" /> Close Force Get
        </button>
      </div>
    </div>
  );
};

export default ForceGetWorkspace;
