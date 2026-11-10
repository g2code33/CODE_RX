import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, Check, Copy, Crown, Dices, FileDown, Flag, Link2, Pause, Play, Plus, RefreshCw,
  RotateCcw, Share2, ShieldOff, Sparkles, Trophy, Users,
} from 'lucide-react';
import { appDialog } from '../AppDialog';
import {
  copyText, downloadText, goToSampling, sampling, shareLink,
  type OrganizerGameBundle, type SamplingGameSummary, type SamplingTeamSummary, type SamplingWorkspace as WorkspaceData,
} from '../../lib/sampling';
import { SamplingSetup } from './SamplingSetup';

/**
 * CODE Rx — SAMPLING workspace.
 *
 * A workspace of its own, not a tab inside Class & Groups: its own header, its
 * own home, its own game monitoring and its own link desk. The organizer lands
 * here from the Sampling button on the Class & Groups console and goes back
 * the same way; the game they were watching stays where it was.
 */

const dateTime = (value: string | null | undefined): string => {
  if (!value) return '—';
  const date = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const STATUS_TONE: Record<string, string> = {
  draft: 'sampling-pill--draft',
  active: 'sampling-pill--active',
  paused: 'sampling-pill--paused',
  completed: 'sampling-pill--completed',
  ended: 'sampling-pill--ended',
};

// Two characters that actually tell teams apart on the board: "Red Team"
// reads RE, while the default pair reads TA / TB rather than two "T"s.
const initials = (name: string): string => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return 'T';
  const generic = new Set(['team', 'teams', 'group', 'squad', 'side']);
  if (words.length > 1 && generic.has(words[1].toLowerCase())) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return words.slice(0, 2).map((part) => part[0] || '').join('').toUpperCase();
};

const ProgressBar = ({ value, label }: { value: number; label: string }) => (
  <div className="sampling-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} aria-label={label}>
    <i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
  </div>
);

const StatusPill = ({ status, label }: { status: string; label: string }) => (
  <span className={`sampling-pill ${STATUS_TONE[status] || ''}`} data-status={status}>{label}</span>
);

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

const SamplingHeader = ({ organizer, onExit, right }: {
  organizer?: string;
  onExit: () => void;
  right?: React.ReactNode;
}) => (
  <header className="sampling-topbar" data-testid="sampling-topbar">
    <div className="sampling-brand">
      <span className="sampling-brand-mark" aria-hidden="true"><Dices className="h-5 w-5" /></span>
      <span className="sampling-brand-text">
        <strong>Sampling</strong>
        <span>Turn-based number drawing{organizer ? ` · ${organizer}` : ''}</span>
      </span>
    </div>
    <div className="ml-auto flex flex-wrap items-center gap-1.5">
      {right}
      <button type="button" className="sampling-button sampling-button--ghost" onClick={onExit} data-testid="sampling-back-to-classes">
        <ArrowLeft className="h-3.5 w-3.5" /> Class &amp; Groups
      </button>
    </div>
  </header>
);

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------

const GameCard = ({ game, onOpen }: { game: SamplingGameSummary; onOpen: () => void }) => (
  <button type="button" className="sampling-game-card" onClick={onOpen} data-testid={`sampling-game-${game.id}`} data-status={game.status}>
    <div className="sampling-row">
      <span className="min-w-0">
        <span className="block truncate text-sm font-black text-slate-900">{game.title}</span>
        <span className="block text-[11px] font-semibold text-slate-500">
          {game.totalNumbers} numbers · {game.teamCount} team{game.teamCount === 1 ? '' : 's'}
          {game.status === 'completed' || game.status === 'ended'
            ? ` · ${game.drawnCount} drawn`
            : game.currentTeamName ? ` · ${game.currentTeamName} up` : ''}
        </span>
      </span>
      <StatusPill status={game.status} label={game.statusLabel} />
    </div>
    <div className="mt-2.5">
      <ProgressBar value={game.progress} label={`${game.drawnCount} of ${game.totalNumbers} numbers drawn`} />
      <div className="mt-1.5 flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-slate-400">
        <span>{game.drawnCount} drawn · {game.remaining} left</span>
        <span>{game.updatedAt ? dateTime(game.updatedAt) : ''}</span>
      </div>
    </div>
  </button>
);

const HomeView = ({ data, loading, error, onCreate, onOpen, onRetry }: {
  data: WorkspaceData | null;
  loading: boolean;
  error: string | null;
  onCreate: () => void;
  onOpen: (id: number) => void;
  onRetry: () => void;
}) => (
  <>
    <section className="sampling-hero">
      <span className="sampling-kicker"><Sparkles className="h-3 w-3" /> CODE Rx Sampling</span>
      <h1>One pool. One turn at a time.</h1>
      <p>
        Every team gets its own link, draws from the same shared numbers and waits for its turn.
        The first team plays, then the next — automatically — until every number is gone.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="sampling-button sampling-button--gold" onClick={onCreate} data-testid="sampling-create-new">
          <Plus className="h-4 w-4" /> Create new game
        </button>
        <button type="button" className="sampling-button sampling-button--ghost text-emerald-50 hover:bg-white/10" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>
    </section>

    {error && (
      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800" data-testid="sampling-error">
        {error}
      </div>
    )}

    <div className="sampling-section-title"><Play className="h-3.5 w-3.5" /> Active games</div>
    {loading && !data ? (
      <div className="sampling-card text-sm font-semibold text-slate-500">Loading your games…</div>
    ) : (data?.active?.length ? (
      <div className="sampling-grid sampling-grid--two">
        {data.active.map((game) => <GameCard key={game.id} game={game} onOpen={() => onOpen(game.id)} />)}
      </div>
    ) : (
      <div className="sampling-card" data-testid="sampling-empty-active">
        <p className="text-sm font-black text-slate-800">No game is running.</p>
        <p className="mt-1 text-xs font-semibold text-slate-500">
          Create a game, hand each team its link, and the turns take care of themselves.
        </p>
      </div>
    ))}

    <div className="sampling-section-title"><Trophy className="h-3.5 w-3.5" /> Previous games</div>
    {data?.previous?.length ? (
      <div className="sampling-grid sampling-grid--two">
        {data.previous.map((game) => <GameCard key={game.id} game={game} onOpen={() => onOpen(game.id)} />)}
      </div>
    ) : (
      <div className="sampling-card" data-testid="sampling-empty-previous">
        <p className="text-sm font-semibold text-slate-500">Finished games will be filed here, with their results kept.</p>
      </div>
    )}
  </>
);

// ---------------------------------------------------------------------------
// Link desk
// ---------------------------------------------------------------------------

const LinkRow = ({ team, gameId, onFlash, onReload }: {
  team: SamplingTeamSummary;
  gameId: number;
  onFlash: (message: string) => void;
  onReload: (bundle?: OrganizerGameBundle) => void;
}) => {
  const [working, setWorking] = useState(false);
  const link = team.link || '';

  const copy = async () => {
    if (!link) return;
    const copied = await copyText(link);
    onFlash(copied ? `${team.name}'s link copied.` : 'Copy failed — long-press the link to copy it.');
  };

  const share = async () => {
    if (!link) return;
    const result = await shareLink(`Sampling — ${team.name}`, `Your team link for the number draw (${team.name}):`, link);
    if (result === 'unsupported') {
      const copied = await copyText(link);
      onFlash(copied ? 'Sharing is not available here — the link is copied instead.' : 'Sharing is not available in this browser.');
    }
  };

  const regenerate = async () => {
    const confirmed = await appDialog.confirm({
      title: `New link for ${team.name}?`,
      message: 'The current link stops working immediately. Share the new one with the team.',
      confirmLabel: 'Issue a new link',
      tone: 'warning',
    });
    if (!confirmed) return;
    setWorking(true);
    try {
      const result = await sampling.regenerate(gameId, team.id);
      onReload(result.bundle);
      onFlash(`New link issued for ${team.name}.`);
    } catch (failure: any) {
      onFlash(failure?.message || 'The link could not be regenerated.');
    } finally { setWorking(false); }
  };

  const revoke = async () => {
    const confirmed = await appDialog.confirm({
      title: `Revoke ${team.name}'s link?`,
      message: 'That team will not be able to open its interface until you issue a new link.',
      confirmLabel: 'Revoke link',
      tone: 'danger',
    });
    if (!confirmed) return;
    setWorking(true);
    try {
      const bundle = await sampling.revoke(gameId, team.id);
      onReload(bundle);
      onFlash(`${team.name}'s link revoked.`);
    } catch (failure: any) {
      onFlash(failure?.message || 'The link could not be revoked.');
    } finally { setWorking(false); }
  };

  const restore = async () => {
    setWorking(true);
    try {
      const result = await sampling.restore(gameId, team.id);
      onReload(result.bundle);
      onFlash(`New link issued for ${team.name}.`);
    } catch (failure: any) {
      onFlash(failure?.message || 'The link could not be restored.');
    } finally { setWorking(false); }
  };

  return (
    <div className={`sampling-link-row ${team.status === 'revoked' ? 'opacity-60' : ''}`} data-testid={`sampling-team-link-${team.id}`}>
      <div className="sampling-row">
        <span className="flex min-w-0 items-center gap-2">
          <span className="sampling-avatar">{team.position}</span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-black text-slate-900">{team.name}</span>
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {team.status === 'revoked' ? 'Link revoked' : `${team.drawCount} drawn`}
              {team.tokenHint ? ` · ${team.tokenHint}` : ''}
            </span>
          </span>
        </span>
        <span className="flex flex-wrap gap-1.5">
          {link ? (
            <>
              <button type="button" className="sampling-button" onClick={copy} data-testid={`sampling-copy-${team.id}`}>
                <Copy className="h-3.5 w-3.5" /> Copy
              </button>
              <button type="button" className="sampling-button" onClick={share} data-testid={`sampling-share-${team.id}`}>
                <Share2 className="h-3.5 w-3.5" /> Share
              </button>
            </>
          ) : null}
          <button type="button" className="sampling-button sampling-button--ghost" onClick={regenerate} disabled={working} data-testid={`sampling-regenerate-${team.id}`} title="Issue a new link for this team">
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          {team.status === 'revoked' ? (
            <button type="button" className="sampling-button" onClick={restore} disabled={working} data-testid={`sampling-restore-${team.id}`}>
              <Check className="h-3.5 w-3.5" /> Restore
            </button>
          ) : (
            <button type="button" className="sampling-button sampling-button--danger" onClick={revoke} disabled={working} data-testid={`sampling-revoke-${team.id}`} title="Revoke this team's link">
              <ShieldOff className="h-3.5 w-3.5" />
            </button>
          )}
        </span>
      </div>
      {link ? (
        <p className="sampling-link-url mt-2">{link}</p>
      ) : (
        <p className="mt-2 text-[11px] font-bold text-amber-700">
          This link cannot be re-displayed. Issue a new one — the team's draws are never lost.
        </p>
      )}
    </div>
  );
};

const LinkDesk = ({ bundle, onFlash, onReload }: {
  bundle: OrganizerGameBundle;
  onFlash: (message: string) => void;
  onReload: (bundle?: OrganizerGameBundle) => void;
}) => {
  const copyAll = async () => {
    const text = bundle.teams
      .map((team) => `${team.name}: ${team.link || '(no link — issue a new one)'}`)
      .join('\n');
    const copied = await copyText(`${bundle.game.title}\n\n${text}`);
    onFlash(copied ? 'All team links copied.' : 'Copy failed — copy each link below.');
  };

  const shareAll = async () => {
    const text = bundle.teams.map((team) => `${team.name}: ${team.link || ''}`).join('\n');
    const result = await shareLink(bundle.game.title, text, bundle.teams[0]?.link || window.location.href);
    if (result === 'unsupported') onFlash('Sharing is not available here — use Copy all links instead.');
  };

  return (
    <section className="sampling-card" data-testid="sampling-link-desk">
      <div className="sampling-row">
        <div>
          <p className="text-sm font-black text-slate-900">Team links</p>
          <p className="text-[11px] font-semibold text-slate-500">
            Each link opens that team's own screen. Send them anywhere — they work on any network.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className="sampling-button" onClick={copyAll} data-testid="sampling-copy-all">
            <Link2 className="h-3.5 w-3.5" /> Copy all
          </button>
          <button type="button" className="sampling-button sampling-button--ghost" onClick={shareAll}>
            <Share2 className="h-3.5 w-3.5" /> Share
          </button>
        </div>
      </div>
      <div className="mt-3 grid gap-2">
        {bundle.teams.map((team) => (
          <LinkRow key={team.id} team={team} gameId={bundle.game.id} onFlash={onFlash} onReload={onReload} />
        ))}
      </div>
    </section>
  );
};

// ---------------------------------------------------------------------------
// Game monitor
// ---------------------------------------------------------------------------

const TeamProgress = ({ team, active }: { team: SamplingTeamSummary; active: boolean }) => (
  <div className={`sampling-team-row ${active ? 'sampling-team-row--active' : ''} ${team.status === 'revoked' ? 'sampling-team-row--revoked' : ''}`}
    data-testid={`sampling-progress-${team.id}`}>
    <span className={`sampling-avatar ${active ? 'sampling-avatar--gold' : ''}`}>{active ? <Crown className="h-4 w-4" /> : initials(team.name)}</span>
    <div className="min-w-0 flex-1">
      <div className="sampling-row">
        <span className="truncate text-sm font-black text-slate-900">{team.name}</span>
        <span className="text-[11px] font-black text-emerald-700">{team.drawCount} drawn</span>
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        {team.numbers.length ? team.numbers.slice(-12).map((number) => (
          <span key={number} className={`sampling-chip ${active ? 'sampling-chip--gold' : ''}`}>{number}</span>
        )) : <span className="text-[11px] font-semibold text-slate-400">No numbers yet</span>}
      </div>
      <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
        {active ? 'Playing now' : team.lastDrawAt ? `Last draw ${dateTime(team.lastDrawAt)}` : 'Waiting'}
      </p>
    </div>
  </div>
);

const GameView = ({ gameId, onBack, onOpenNew }: { gameId: number; onBack: () => void; onOpenNew: () => void }) => {
  const [bundle, setBundle] = useState<OrganizerGameBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  const flash = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4200);
  }, []);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const next = await sampling.game(gameId);
      setBundle(next);
      setError(null);
    } catch (failure: any) {
      if (!quiet) setError(failure?.message || 'The game could not be loaded.');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [gameId]);

  useEffect(() => { void load(); }, [load]);

  // Live board: a slow poll keeps the organizer's screen true to the teams'
  // without touching the game state itself.
  const status = bundle?.game.status;
  useEffect(() => {
    if (!status || !['active', 'paused', 'draft'].includes(status)) return undefined;
    const timer = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void load(true);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [status, load]);

  const run = async (name: string, action: () => Promise<OrganizerGameBundle>, success: string) => {
    setBusy(name);
    try {
      const next = await action();
      setBundle(next);
      flash(success);
    } catch (failure: any) {
      flash(failure?.message || 'That action could not be completed.');
    } finally { setBusy(null); }
  };

  const skipTurn = async () => {
    if (!bundle) return;
    const team = bundle.game.currentTeamName || 'the current team';
    const confirmed = await appDialog.confirm({
      title: `Skip ${team}'s turn?`,
      message: 'The turn moves to the next team immediately. No number is drawn, and the skip is recorded in the game history.',
      confirmLabel: 'Skip this turn',
      tone: 'warning',
    });
    if (!confirmed) return;
    const reason = await appDialog.prompt({
      title: `Why is ${team} being skipped?`,
      message: 'This reason is kept in the audit record.',
      label: 'Reason',
      placeholder: 'Team is offline',
      requiredMessage: 'Give a reason — a skip is never silent.',
      confirmLabel: 'Skip turn',
    });
    if (reason === null) return;
    await run('skip', () => sampling.skip(bundle.game.id, bundle.game.turn, reason), `${team}'s turn was skipped and recorded.`);
  };

  const endGame = async () => {
    if (!bundle) return;
    const confirmed = await appDialog.confirm({
      title: 'End this game?',
      message: 'The game closes with the numbers drawn so far. Everything is kept for the record, and nothing can be un-ended.',
      confirmLabel: 'End the game',
      tone: 'danger',
    });
    if (!confirmed) return;
    await run('end', () => sampling.end(bundle.game.id), 'The game was ended and the results kept.');
  };

  const exportResults = async () => {
    if (!bundle) return;
    setBusy('export');
    try {
      const csv = await sampling.exportCsv(bundle.game.id);
      const safe = bundle.game.title.replace(/[^A-Za-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'sampling-game';
      downloadText(`${safe}-results.csv`, csv);
      flash('Results exported.');
    } catch (failure: any) {
      flash(failure?.message || 'The results could not be exported.');
    } finally { setBusy(null); }
  };

  const shareResults = async () => {
    if (!bundle) return;
    const lines = bundle.teams
      .map((team) => `${team.name}: ${team.numbers.join(', ') || 'no numbers'}`)
      .join('\n');
    const result = await shareLink(
      `${bundle.game.title} — results`,
      `${bundle.game.drawnCount} of ${bundle.game.totalNumbers} numbers drawn\n${lines}`,
      window.location.href,
    );
    if (result === 'unsupported') {
      const copied = await copyText(`${bundle.game.title}\n${lines}`);
      flash(copied ? 'Sharing is not available — the results are copied instead.' : 'Copy failed.');
    }
  };

  if (loading && !bundle) {
    return (
      <div className="sampling-card mt-4 text-sm font-semibold text-slate-500" data-testid="sampling-game-loading">
        Loading the game…
      </div>
    );
  }

  if (!bundle) {
    return (
      <div className="mt-4">
        <div className="sampling-card" data-testid="sampling-game-error">
          <p className="text-sm font-black text-slate-900">{error || 'That game could not be opened.'}</p>
          <button type="button" className="sampling-button mt-3" onClick={onBack}><ArrowLeft className="h-3.5 w-3.5" /> Back to Sampling</button>
        </div>
      </div>
    );
  }

  const game = bundle.game;
  const finished = game.status === 'completed' || game.status === 'ended';
  const canSkip = game.status === 'active' && Boolean(game.currentTeamName);

  return (
    <div data-testid="sampling-game" data-status={game.status} data-game-id={game.id}>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <button type="button" className="sampling-button sampling-button--ghost" onClick={onBack} data-testid="sampling-game-back">
          <ArrowLeft className="h-3.5 w-3.5" /> All games
        </button>
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusPill status={game.status} label={game.statusLabel} />
          {game.status === 'draft' && (
            <button type="button" className="sampling-button sampling-button--primary" disabled={busy === 'start'}
              onClick={() => void run('start', () => sampling.start(game.id), 'The game has started. Team links are live.')}
              data-testid="sampling-start">
              <Play className="h-3.5 w-3.5" /> {busy === 'start' ? 'Starting…' : 'Start game'}
            </button>
          )}
          {game.status === 'active' && (
            <button type="button" className="sampling-button" disabled={busy === 'pause'}
              onClick={() => void run('pause', () => sampling.pause(game.id), 'Game paused — teams are told to hold tight.')}
              data-testid="sampling-pause">
              <Pause className="h-3.5 w-3.5" /> Pause
            </button>
          )}
          {game.status === 'paused' && (
            <button type="button" className="sampling-button sampling-button--primary" disabled={busy === 'resume'}
              onClick={() => void run('resume', () => sampling.resume(game.id), 'Game resumed.')}
              data-testid="sampling-resume">
              <Play className="h-3.5 w-3.5" /> Resume
            </button>
          )}
          {canSkip && (
            <button type="button" className="sampling-button sampling-button--gold" disabled={busy === 'skip'} onClick={skipTurn} data-testid="sampling-skip">
              <Flag className="h-3.5 w-3.5" /> Skip turn
            </button>
          )}
          {!finished && (
            <button type="button" className="sampling-button sampling-button--danger" disabled={busy === 'end'} onClick={endGame} data-testid="sampling-end">
              End game
            </button>
          )}
          <button type="button" className="sampling-button" disabled={busy === 'export'} onClick={exportResults} data-testid="sampling-export">
            <FileDown className="h-3.5 w-3.5" /> Export
          </button>
          <button type="button" className="sampling-button sampling-button--ghost" onClick={() => void load()} aria-label="Refresh this game" data-testid="sampling-game-refresh">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <section className={`sampling-hero mt-3 ${finished ? 'sampling-hero--done' : ''}`}>
        <span className="sampling-kicker"><Dices className="h-3 w-3" /> {game.teamCount} team{game.teamCount === 1 ? '' : 's'} · 1–{game.totalNumbers}</span>
        <h1>{game.title}</h1>
        <p>{game.instructions || 'One number per turn, in order, until the pool is empty.'}</p>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-xl bg-white/10 px-3 py-2">
            <span className="block text-[9px] font-black uppercase tracking-widest text-emerald-100/80">Drawn</span>
            <strong className="block text-xl font-black text-white">{game.drawnCount}</strong>
          </div>
          <div className="rounded-xl bg-white/10 px-3 py-2">
            <span className="block text-[9px] font-black uppercase tracking-widest text-emerald-100/80">Remaining</span>
            <strong className="block text-xl font-black text-white">{game.remaining}</strong>
          </div>
          <div className="rounded-xl bg-white/10 px-3 py-2">
            <span className="block text-[9px] font-black uppercase tracking-widest text-emerald-100/80">Turn</span>
            <strong className="block text-xl font-black text-white" data-testid="sampling-turn">{game.status === 'draft' ? '—' : finished ? 'Final' : game.turnNumber}</strong>
          </div>
          <div className="rounded-xl bg-white/10 px-3 py-2">
            <span className="block text-[9px] font-black uppercase tracking-widest text-emerald-100/80">Up now</span>
            <strong className="block truncate text-base font-black text-amber-200" data-testid="sampling-up-now">
              {finished ? (game.status === 'completed' ? 'Complete' : 'Ended') : (game.currentTeamName || '—')}
            </strong>
          </div>
        </div>
        <div className="mt-3">
          <ProgressBar value={game.progress} label={`${game.drawnCount} of ${game.totalNumbers} numbers drawn`} />
        </div>
      </section>

      {toast && <div className="sampling-toast" role="status" data-testid="sampling-toast">{toast}</div>}

      {game.status === 'draft' && (
        <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800" data-testid="sampling-draft-note">
          Ready. Share the links below, then press Start game — the first team can draw the moment you do.
        </p>
      )}
      {game.status === 'paused' && (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
          Paused. Teams see “hold tight”; no draws are accepted until you resume.
        </p>
      )}

      {finished && (
        <section className="sampling-complete mt-3" data-testid="sampling-complete">
          <span className="sampling-kicker bg-white/40 text-amber-900"><Trophy className="h-3 w-3" /> {game.status === 'completed' ? 'Game completed' : 'Game ended early'}</span>
          <h2>GAME COMPLETED!</h2>
          <p>
            {game.drawnCount} of {game.totalNumbers} numbers drawn by {game.teamCount} team{game.teamCount === 1 ? '' : 's'}
            {game.completedAt ? ` · ${dateTime(game.completedAt)}` : game.endedAt ? ` · ended ${dateTime(game.endedAt)}` : ''}
          </p>
          <div className="mt-3 grid gap-1.5 text-left">
            {[...bundle.teams].sort((a, b) => b.drawCount - a.drawCount).map((team) => (
              <div key={team.id} className="rounded-lg bg-white/55 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-black text-amber-950">{team.name}</span>
                  <span className="text-xs font-black text-amber-900">{team.drawCount} number{team.drawCount === 1 ? '' : 's'}</span>
                </div>
                {team.numbers.length > 0 && (
                  <p className="mt-0.5 text-[11px] font-semibold text-amber-900/80">{team.numbers.join(', ')}</p>
                )}
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <button type="button" className="sampling-button bg-white/80 text-amber-900" onClick={exportResults} disabled={busy === 'export'}>
              <FileDown className="h-3.5 w-3.5" /> Export results
            </button>
            <button type="button" className="sampling-button bg-white/80 text-amber-900" onClick={shareResults}>
              <Share2 className="h-3.5 w-3.5" /> Share results
            </button>
            <button type="button" className="sampling-button bg-amber-900 text-amber-50" onClick={onOpenNew}>
              <Plus className="h-3.5 w-3.5" /> New game
            </button>
          </div>
        </section>
      )}

      <div className="sampling-section-title"><Users className="h-3.5 w-3.5" /> Team progress</div>
      <div className="sampling-grid sampling-grid--two">
        <div className="grid gap-2">
          {bundle.teams.map((team) => (
            <TeamProgress
              key={team.id}
              team={team}
              active={!finished && team.id === game.currentTeamId}
            />
          ))}
        </div>
        <div className="sampling-card">
          <div className="sampling-row">
            <p className="text-sm font-black text-slate-900">Latest numbers</p>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">{bundle.draws.length} so far</span>
          </div>
          {bundle.draws.length ? (
            <div className="mt-2 grid gap-1.5">
              {[...bundle.draws].reverse().slice(0, 10).map((draw) => (
                <div key={`${draw.turn}-${draw.number}`} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5">
                  <span className="truncate text-xs font-bold text-slate-700">{draw.teamName}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">turn {draw.turn}</span>
                    <span className="sampling-chip sampling-chip--gold">{draw.number}</span>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs font-semibold text-slate-500">No numbers drawn yet.</p>
          )}
        </div>
      </div>

      <div className="sampling-section-title"><Link2 className="h-3.5 w-3.5" /> Team links</div>
      <LinkDesk bundle={bundle} onFlash={flash} onReload={(next) => { if (next) setBundle(next); else void load(true); }} />

      <div className="sampling-section-title"><Sparkles className="h-3.5 w-3.5" /> Game history</div>
      <section className="sampling-card" data-testid="sampling-history">
        {bundle.events.length ? bundle.events.slice(0, 40).map((event) => (
          <div key={event.id} className="sampling-event">
            <span className="min-w-0 flex-1">
              <strong>{event.action.replace(/_/g, ' ')}</strong>
              <span> · {event.actor}</span>
              {typeof event.detail?.reason === 'string' && event.detail.reason ? <span> · “{String(event.detail.reason)}”</span> : null}
              {typeof event.detail?.teamName === 'string' && event.detail.teamName ? <span> · {String(event.detail.teamName)}</span> : null}
            </span>
            <span className="shrink-0 text-slate-400">{dateTime(event.at)}</span>
          </div>
        )) : <p className="text-xs font-semibold text-slate-500">Nothing has happened yet.</p>}
      </section>
    </div>
  );
};

// ---------------------------------------------------------------------------
// The workspace
// ---------------------------------------------------------------------------

export const SamplingWorkspace = ({ route, onExit }: {
  route: { page: 'home' } | { page: 'game'; id: number };
  onExit: () => void;
}) => {
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settingUp, setSettingUp] = useState(false);
  const [signedOut, setSignedOut] = useState(false);

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    try {
      const next = await sampling.workspace();
      setData(next);
      setError(null);
      setSignedOut(false);
    } catch (failure: any) {
      if (failure?.status === 401) setSignedOut(true);
      else setError(failure?.message || 'Sampling could not be loaded.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadWorkspace(); }, [loadWorkspace]);

  // Returning to the workspace (or to a game) refreshes the list behind it.
  useEffect(() => {
    if (route.page === 'game') setSettingUp(false);
  }, [route]);

  const openGame = useCallback((id: number) => { goToSampling({ page: 'game', id }); }, []);

  const header = (
    <SamplingHeader organizer={data?.organizer} onExit={onExit} right={
      <button type="button" className="sampling-button" onClick={() => void loadWorkspace()} aria-label="Refresh the game list">
        <RefreshCw className="h-3.5 w-3.5" />
      </button>
    } />
  );

  if (signedOut) {
    return (
      <div className="sampling-shell" data-testid="sampling-workspace">
        {header}
        <main className="sampling-main">
          <div className="sampling-card" data-testid="sampling-signin">
            <p className="text-sm font-black text-slate-900">Sampling is for organizers.</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              Open Class &amp; Groups and sign in, then press Sampling again. Teams do not need an account — their link is enough.
            </p>
            <button type="button" className="sampling-button sampling-button--primary mt-3" onClick={onExit}>
              <ArrowLeft className="h-3.5 w-3.5" /> Go to Class &amp; Groups
            </button>
          </div>
        </main>
      </div>
    );
  }

  if (settingUp) {
    return (
      <div className="sampling-shell" data-testid="sampling-workspace">
        {header}
        <main className="sampling-main">
          <SamplingSetup
            onCancel={() => setSettingUp(false)}
            onCreated={(bundle) => {
              setSettingUp(false);
              void loadWorkspace();
              goToSampling({ page: 'game', id: bundle.game.id });
            }}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="sampling-shell" data-testid="sampling-workspace">
      {header}
      <main className="sampling-main">
        {route.page === 'game' ? (
          <GameView
            gameId={route.id}
            onBack={() => goToSampling({ page: 'home' })}
            onOpenNew={() => { goToSampling({ page: 'home' }); setSettingUp(true); }}
          />
        ) : (
          <HomeView
            data={data}
            loading={loading}
            error={error}
            onCreate={() => setSettingUp(true)}
            onOpen={openGame}
            onRetry={() => void loadWorkspace()}
          />
        )}
      </main>
    </div>
  );
};

export default SamplingWorkspace;
