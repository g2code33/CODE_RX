import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, ChevronDown, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { cgm } from '../../lib/cgm';

/**
 * The class-wide organizer audit view.
 *
 * Until now the trail existed but could only leave the app as a CSV. This puts
 * it on the screen: every recorded action for the class, filterable by area and
 * by who/what, with runs of the same action collapsed into a count so the one
 * membership approval is not buried under a hundred sign-ins.
 *
 * It never claims more than the server stored: an entry appears only because an
 * audit row exists, and the sentence is built from that row.
 */

const card = 'rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm shadow-emerald-950/5';
const label = 'text-[10px] font-black uppercase tracking-[0.16em] text-slate-400';

const AREAS: Array<[string, string]> = [
  ['all', 'Everything'],
  ['members', 'Members & approvals'],
  ['roster', 'Roster'],
  ['grouping', 'Grouping'],
  ['leadership', 'Leadership'],
  ['elections', 'Elections'],
  ['attendance', 'Attendance'],
  ['announcements', 'Announcements'],
  ['setup', 'Class setup'],
  ['reports', 'Reports & archives'],
  ['signins', 'Sign-ins'],
  ['other', 'Other'],
];

const ACTION_WORDS: Record<string, string> = {
  'cgm.class.created': 'created the class',
  'cgm.class.updated': 'updated the class details',
  'cgm.class.submitted': 'submitted the class for approval',
  'cgm.class.settings_updated': 'changed the class settings',
  'cgm.registration.requested': 'asked to join the class',
  'cgm.registration.approved': 'approved a registration',
  'cgm.registration.rejected': 'rejected a registration',
  'cgm.registration.auto_approved': 'were approved automatically',
  'cgm.membership.requested': 'asked to join a group',
  'cgm.membership.approved': 'approved a membership request',
  'cgm.roster.entry_added': 'added a roster entry',
  'cgm.roster.entry_updated': 'edited a roster entry',
  'cgm.roster.entry_removed': 'removed a roster entry',
  'cgm.roster.imported': 'imported the roster',
  'cgm.assignment.generated': 'generated groups',
  'cgm.assignment.swapped': 'swapped two members',
  'cgm.assignment.removed': 'removed a member from a group',
  'cgm.force_get.requested': 'requested a forced placement',
  'cgm.force_get.approved': 'approved a forced placement',
  'cgm.force_get.rejected': 'rejected a forced placement',
  'cgm.leader.topic_updated': 'set the group topic & agenda',
  'cgm.leader.announcement_created': 'posted a group announcement',
  'cgm.leader.members_notified': 'messaged the group',
  'cgm.leader.meeting_scheduled': 'scheduled a meeting',
  'cgm.leadership.permissions_changed': 'changed a leader’s capabilities',
  'cgm.leadership.requested': 'requested leadership',
  'cgm.election.created': 'created an election',
  'cgm.election.vote': 'voted',
  'cgm.attendance.recorded': 'recorded attendance',
  'cgm.announcement.created': 'posted an announcement',
  'cgm.report.exported': 'exported a report',
  'cgm.student.login': 'signed in',
  'cgm.student.logout': 'signed out',
  'cgm.student.push_subscribed': 'turned on phone notifications',
};

/** A plain sentence for a row, falling back to the raw action verb. */
const sentenceFor = (entry: any): string => {
  const known = ACTION_WORDS[entry.action];
  if (known) return known;
  const tail = String(entry.action || '').replace(/^cgm\./, '').replace(/[._]/g, ' ');
  return tail || 'did something';
};

const whenLabel = (value: string): string => {
  if (!value) return '—';
  // SQLite gives "YYYY-MM-DD HH:MM:SS" in UTC.
  const iso = /Z$|[+-]\d\d:?\d\d$/.test(value) ? value : `${value.replace(' ', 'T')}Z`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return value;
  const diff = Date.now() - date.getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 8) return `${days} day${days === 1 ? '' : 's'} ago`;
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

export const AuditArea = ({ classId }: { classId: number }) => {
  const [area, setArea] = useState('all');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [entries, setEntries] = useState<any[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [before, setBefore] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (options: { append?: boolean } = {}) => {
    setLoading(true);
    setError(null);
    try {
      const data: any = await cgm.classAudit(classId, {
        area: area === 'all' ? undefined : area,
        q: query || undefined,
        limit: 100,
        before: options.append && before ? before : undefined,
      });
      const next = data?.entries || [];
      setEntries((current) => (options.append ? [...current, ...next] : next));
      setCounts(data?.areas || {});
      setBefore(data?.nextBefore ?? null);
      setHasMore(Boolean(data?.hasMore));
    } catch (failure: any) {
      setError(failure?.message || 'The audit trail could not be read.');
      if (!options.append) setEntries([]);
    } finally { setLoading(false); }
  }, [classId, area, query, before]);

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [classId, area, query]);

  const total = useMemo(() => Object.values(counts).reduce((sum, value) => sum + Number(value || 0), 0), [counts]);

  return (
    <div className="space-y-4" data-testid="cgm-audit-area">
      <div className={card}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className={label}>Class activity trail</p>
            <p className="mt-1 text-sm font-bold text-slate-700">
              Everything recorded in this class, in the order it happened
            </p>
            <p className="mt-1 text-[11px] font-medium text-slate-500">
              Read-only. Runs of the same action by the same person are counted together.
            </p>
          </div>
          <button type="button" className="mini-button" data-testid="cgm-audit-refresh" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-1.5 inline h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        <form
          className="mt-4 flex flex-wrap gap-2"
          data-testid="cgm-audit-search-form"
          onSubmit={(event) => { event.preventDefault(); setQuery(search.trim()); }}
        >
          <input
            className="cgm-input min-w-0 flex-1"
            data-testid="cgm-audit-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search an action, a person or a record"
            aria-label="Search the audit trail"
            maxLength={80}
          />
          <button type="submit" className="mini-button" data-testid="cgm-audit-search-go">
            <Search className="mr-1.5 inline h-3.5 w-3.5" /> Search
          </button>
          {query && (
            <button type="button" className="mini-button" data-testid="cgm-audit-search-clear" onClick={() => { setSearch(''); setQuery(''); }}>
              Clear
            </button>
          )}
        </form>

        <div className="mt-3 flex flex-wrap gap-1.5" data-testid="cgm-audit-areas">
          {AREAS.map(([key, text]) => {
            const count = key === 'all' ? total : Number(counts[key] || 0);
            if (key !== 'all' && !count) return null;
            return (
              <button
                key={key}
                type="button"
                data-testid={`cgm-audit-area-${key}`}
                aria-pressed={area === key}
                onClick={() => setArea(key)}
                className={`rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-wider transition ${
                  area === key ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                }`}
              >
                {text}{count ? ` · ${count}` : ''}
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div className={card} data-testid="cgm-audit-error">
          <p className="text-sm font-bold text-red-600">{error}</p>
          <button type="button" className="mini-button mt-3" onClick={() => void load()}>Try again</button>
        </div>
      )}

      {!error && !loading && !entries.length && (
        <div className={card} data-testid="cgm-audit-empty">
          <p className="flex items-center gap-2 text-sm font-bold text-slate-600">
            <Activity className="h-4 w-4 text-slate-400" />
            {query || area !== 'all' ? 'Nothing matches that filter yet.' : 'Nothing has been recorded in this class yet.'}
          </p>
          <p className="mt-1 text-[11px] font-medium text-slate-400">
            The trail fills as organizers, leaders and students act — nothing here is generated.
          </p>
        </div>
      )}

      {!!entries.length && (
        <ol className={`${card} space-y-0 divide-y divide-slate-100`} data-testid="cgm-audit-list">
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-start gap-3 py-3" data-testid={`cgm-audit-entry-${entry.id}`}>
              <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                entry.actorType === 'student' ? 'bg-sky-50 text-sky-600'
                  : entry.actorType === 'phantom' ? 'bg-slate-900 text-white'
                  : entry.actorType === 'system' ? 'bg-slate-100 text-slate-500'
                  : 'bg-emerald-50 text-emerald-700'
              }`} aria-hidden="true">
                <ShieldCheck className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold leading-snug text-slate-700">
                  <span data-testid="cgm-audit-actor">{entry.actor || entry.actorType}</span>{' '}
                  <span className="font-medium text-slate-600">{sentenceFor(entry)}</span>
                  {entry.entity && <span className="font-medium text-slate-400"> · {entry.entity}</span>}
                </p>
                {entry.detail && (
                  <p className="mt-0.5 truncate text-[11px] font-medium text-slate-500" data-testid="cgm-audit-detail">{entry.detail}</p>
                )}
                <p className="mt-0.5 text-[10px] font-black uppercase tracking-wider text-slate-400">
                  <span data-testid="cgm-audit-when">{whenLabel(entry.createdAt)}</span>
                  <span className="mx-1.5 text-slate-300">·</span>
                  {entry.area}
                  {entry.count > 1 && (
                    <>
                      <span className="mx-1.5 text-slate-300">·</span>
                      <span className="text-emerald-700">{entry.count}× in a row</span>
                    </>
                  )}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}

      {hasMore && (
        <button
          type="button"
          className="mini-button w-full justify-center"
          data-testid="cgm-audit-more"
          disabled={loading}
          onClick={() => void load({ append: true })}
        >
          <ChevronDown className="mr-1.5 inline h-3.5 w-3.5" /> Show older entries
        </button>
      )}
    </div>
  );
};

export default AuditArea;
