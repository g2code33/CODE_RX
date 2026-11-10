import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, Dices, Hourglass, Sparkles, Trophy, Users, Volume2, VolumeX, Zap } from 'lucide-react';
import {
  newRequestId, readSpinKey, samplingTeam, writeSpinKey,
  type SpinResult, type TeamGameBundle,
} from '../../lib/sampling';

/**
 * CODE Rx — Sampling: the team stage.
 *
 * One phone, one team, one turn. The link in the address is the whole
 * credential: no sign-in, no token in storage, nothing organizer-shaped on the
 * screen.
 *
 * The number is never chosen here. SPIN asks the server, the server draws and
 * persists, and the carousel is only the reveal of an answer that already
 * exists — so a dropped connection can never change what a team drew.
 */

const POLL_WAIT_MS = 2500;
const POLL_IDLE_MS = 6000;
const REVEAL_HOLD_MS = 2600;

type Phase = 'loading' | 'error' | 'waiting' | 'mine' | 'spinning' | 'revealed' | 'paused' | 'completed' | 'ended';

const reducedMotion = (): boolean => {
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
  } catch { return false; }
};

// ---------------------------------------------------------------------------
// Sound (off by default, only ever after a tap)
// ---------------------------------------------------------------------------
const useChime = () => {
  const [enabled, setEnabled] = useState(() => {
    try { return localStorage.getItem('codeRx_samplingSound') === 'on'; } catch { return false; }
  });
  const context = useRef<AudioContext | null>(null);

  const tone = useCallback((frequencies: number[], duration = 0.16, force = false) => {
    if (!enabled && !force) return;
    try {
      const AudioCtor = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtor) return;
      context.current ||= new AudioCtor();
      const audio = context.current;
      if (!audio) return;
      frequencies.forEach((frequency, index) => {
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;
        const start = audio.currentTime + index * 0.09;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.12, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        oscillator.connect(gain).connect(audio.destination);
        oscillator.start(start);
        oscillator.stop(start + duration + 0.02);
      });
    } catch { /* sound is a bonus, never a failure */ }
  }, [enabled]);

  const toggle = useCallback(() => {
    setEnabled((current) => {
      const next = !current;
      try { localStorage.setItem('codeRx_samplingSound', next ? 'on' : 'off'); } catch { /* private mode */ }
      if (next) {
        // A tap is the gesture browsers require before audio may start.
        window.setTimeout(() => tone([660, 880], 0.16, true), 30);
      }
      return next;
    });
  }, [tone]);

  return { enabled, toggle, tone };
};

// ---------------------------------------------------------------------------
// Confetti
// ---------------------------------------------------------------------------
const CONFETTI_COLORS = ['#fbbf24', '#f59e0b', '#34d399', '#10b981', '#fde68a', '#ffffff'];
const Confetti = ({ burst }: { burst: number }) => {
  const pieces = useMemo(
    () => Array.from({ length: 26 }, (_, index) => ({
      key: index,
      left: `${(index * 37 + 11) % 100}%`,
      delay: `${(index % 9) * 0.075}s`,
      drift: `${((index % 7) - 3) * 26}px`,
      color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
      height: index % 3 === 0 ? '18px' : '12px',
    })),
    [],
  );
  if (!burst) return null;
  return (
    <div className="sampling-confetti" aria-hidden="true" key={burst}>
      {pieces.map((piece) => (
        <i
          key={`${burst}-${piece.key}`}
          style={{
            left: piece.left,
            animationDelay: piece.delay,
            background: piece.color,
            height: piece.height,
            transform: `translate3d(${piece.drift}, 0, 0)`,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ['--drift' as any]: piece.drift,
          }}
        />
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// The team page
// ---------------------------------------------------------------------------

export const SamplingTeam = ({ token, onExit }: { token: string; onExit: () => void }) => {
  const [bundle, setBundle] = useState<TeamGameBundle | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [display, setDisplay] = useState<string>('?');
  const [rolling, setRolling] = useState(false);
  const [won, setWon] = useState(false);
  const [burst, setBurst] = useState(0);
  const [lastDraw, setLastDraw] = useState<SpinResult['draw'] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [skipAnimation, setSkipAnimation] = useState(() => {
    try { return localStorage.getItem('codeRx_samplingSkipAnimation') === 'on'; } catch { return false; }
  });

  const { enabled: soundOn, toggle: toggleSound, tone } = useChime();
  const frame = useRef<number | null>(null);
  const revealTimer = useRef<number | null>(null);
  const spinning = useRef(false);
  const mounted = useRef(true);
  const previousTurn = useRef<boolean | null>(null);

  useEffect(() => () => {
    mounted.current = false;
    if (frame.current) cancelAnimationFrame(frame.current);
    if (revealTimer.current) window.clearTimeout(revealTimer.current);
  }, []);

  const applyBundle = useCallback((next: TeamGameBundle) => {
    setBundle(next);
    setError(null);
    if (spinning.current) {
      setPhase('spinning');
      return;
    }
    const status = next.game.status;
    if (status === 'completed') setPhase('completed');
    else if (status === 'ended') setPhase('ended');
    else if (status === 'paused') setPhase('paused');
    else if (status === 'draft') setPhase('waiting');
    else setPhase(next.isMyTurn ? 'mine' : 'waiting');
    // A team that has just become active gets a soft chime (if sound is on).
    if (previousTurn.current === false && next.isMyTurn) tone([784, 1046]);
    previousTurn.current = next.isMyTurn;
  }, [tone]);

  // Keep the current bundle reachable from the poll without re-creating it.
  const bundleRef = useRef<TeamGameBundle | null>(null);

  const load = useCallback(async (quiet = true) => {
    try {
      const next = await samplingTeam.view(token);
      if (!mounted.current) return;
      applyBundle(next);
    } catch (failure: any) {
      if (!mounted.current) return;
      if (!quiet || !bundleRef.current) {
        setError(failure?.message || 'This team link could not be opened.');
        setPhase('error');
      }
    }
  }, [token, applyBundle]);

  bundleRef.current = bundle;

  useEffect(() => { void load(false); }, [load]);

  // Live updates: the phone learns about its turn without being refreshed.
  const isMyTurn = bundle?.isMyTurn;
  const status = bundle?.game.status;
  useEffect(() => {
    if (spinning.current) return undefined;
    const delay = isMyTurn ? POLL_IDLE_MS : POLL_WAIT_MS;
    const timer = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      if (spinning.current) return;
      void load(true);
    }, delay);
    return () => window.clearInterval(timer);
  }, [isMyTurn, status, load]);

  // Re-check the moment the phone comes back to the app.
  useEffect(() => {
    const onVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible' && !spinning.current) void load(true);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  const available = useMemo(() => {
    if (!bundle) return [] as number[];
    const taken = new Set<number>();
    for (const team of bundle.teams) for (const number of team.draws) taken.add(Number(number));
    return Array.from({ length: bundle.game.totalNumbers }, (_, index) => index + 1).filter((number) => !taken.has(number));
  }, [bundle]);

  /** The visual reveal only: the server has already chosen and stored this. */
  const rollTo = useCallback((target: number) => new Promise<void>((resolve) => {
    const instant = skipAnimation || reducedMotion();
    if (instant || !mounted.current) {
      setDisplay(String(target));
      setRolling(false);
      setWon(true);
      setBurst((value) => value + 1);
      resolve();
      return;
    }
    setRolling(true);
    setWon(false);
    const duration = 1750;
    const start = performance.now();
    let lastStep = -1;
    // A stride through the pool: it looks like a reel tumbling, without any
    // randomness in the browser (the number is already decided server-side).
    const pool = available.length ? available : [target];
    const stride = Math.max(1, Math.floor(pool.length / 7));
    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(1, elapsed / duration);
      // Frames get further apart as the reel slows — no flicker, no jank.
      const interval = 42 + Math.pow(progress, 2.4) * 220;
      const step = Math.floor(elapsed / interval);
      if (step !== lastStep) {
        lastStep = step;
        const pick = pool[(step * stride + 3) % pool.length] ?? target;
        setDisplay(String(pick));
      }
      if (progress < 1) {
        frame.current = requestAnimationFrame(tick);
      } else {
        setDisplay(String(target));
        setRolling(false);
        setWon(true);
        setBurst((value) => value + 1);
        resolve();
      }
    };
    frame.current = requestAnimationFrame(tick);
  }), [available, skipAnimation]);

  const spin = async () => {
    if (!bundle || spinning.current || !bundle.isMyTurn) return;
    spinning.current = true;
    setNotice(null);
    setLastDraw(null);
    setWon(false);
    setPhase('spinning');
    setRolling(true);
    tone([392, 523, 659]);

    // One key per attempt: a retry after a dropped connection asks the server
    // for the SAME draw, never a second one.
    const key = readSpinKey(token) || newRequestId();
    writeSpinKey(token, key);

    try {
      const result = await samplingTeam.spin(token, key);
      writeSpinKey(token, null);
      if (!mounted.current) return;
      setBundle(result);
      setLastDraw(result.draw);
      await rollTo(Number(result.draw.number));
      tone([523, 659, 784, 1046]);
      if (!mounted.current) return;
      setPhase('revealed');
      if (revealTimer.current) window.clearTimeout(revealTimer.current);
      revealTimer.current = window.setTimeout(() => {
        if (!mounted.current) return;
        spinning.current = false;
        void load(true);
      }, REVEAL_HOLD_MS);
    } catch (failure: any) {
      if (!mounted.current) return;
      const code = failure?.code;
      const network = !failure?.status || code === 'offline' || code === 'timeout';
      // Keep the key ONLY for a transport failure — that is the retry case.
      if (!network) writeSpinKey(token, null);
      setRolling(false);
      spinning.current = false;
      setPhase('mine');
      setNotice(
        network
          ? 'The connection dropped. Tap SPIN again — you will get the same number, never two.'
          : (failure?.message || 'That draw did not go through. Try again.'),
      );
      void load(true);
    }
  };

  const toggleSkipAnimation = () => {
    setSkipAnimation((current) => {
      const next = !current;
      try { localStorage.setItem('codeRx_samplingSkipAnimation', next ? 'on' : 'off'); } catch { /* private mode */ }
      return next;
    });
  };

  // -------------------------------------------------------------------------
  // Screen
  // -------------------------------------------------------------------------

  if (phase === 'loading') {
    return (
      <div className="sampling-stage" data-testid="sampling-team-page" data-phase="loading">
        <main className="sampling-stage-body justify-center">
          <div className="sampling-stage-card text-center">
            <Dices className="mx-auto h-8 w-8 animate-pulse text-emerald-300" />
            <p className="mt-3 text-sm font-black">Opening your team link…</p>
          </div>
        </main>
      </div>
    );
  }

  if (phase === 'error' || !bundle) {
    return (
      <div className="sampling-stage" data-testid="sampling-team-page" data-phase="error">
        <main className="sampling-stage-body justify-center">
          <div className="sampling-stage-card text-center" data-testid="sampling-team-error">
            <p className="sampling-reveal-title">This link cannot be used</p>
            <p className="sampling-stage-note mt-1">
              {error || 'Ask the organizer for a fresh team link.'}
            </p>
            <button type="button" className="sampling-button sampling-button--on-dark mt-4" onClick={onExit}>
              <ArrowLeft className="h-3.5 w-3.5" /> Leave this page
            </button>
          </div>
        </main>
      </div>
    );
  }

  const game = bundle.game;
  const team = bundle.team;
  const finished = phase === 'completed' || phase === 'ended';
  const myTurn = phase === 'mine' || phase === 'spinning';
  const paused = phase === 'paused';
  // After a draw the server already points at the team that is up next, so the
  // reveal and the "next up" line always name the same team.
  const upNext = game.currentTeamName || null;
  const idleReel = !rolling && !won && display === '?';

  return (
    <div className="sampling-stage" data-testid="sampling-team-page" data-phase={phase} data-team={team.name}>
      <Confetti burst={burst} />
      <div className="sampling-stage-top">
        <button type="button" className="sampling-sound" onClick={toggleSound} aria-pressed={soundOn} data-testid="sampling-sound">
          {soundOn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
          Sound {soundOn ? 'on' : 'off'}
        </button>
        <button type="button" className="sampling-sound" onClick={toggleSkipAnimation} aria-pressed={skipAnimation} data-testid="sampling-skip-animation">
          <Zap className="h-3.5 w-3.5" />
          {skipAnimation ? 'Animation off' : 'Skip animation'}
        </button>
      </div>

      <main className="sampling-stage-body">
        <div>
          <span className="sampling-stage-team" data-testid="sampling-team-name">{team.name}</span>
          <h1 className="sampling-stage-title" data-testid="sampling-game-title">{game.title}</h1>
          {game.instructions && <p className="sampling-stage-instructions">{game.instructions}</p>}
        </div>

        {/* Turn state — the one thing a team looks at. */}
        {finished ? (
          <div className="sampling-turn-banner sampling-turn-banner--mine" data-testid="sampling-team-status" data-status={phase}>
            <strong>{phase === 'completed' ? 'Game completed' : 'Game ended'}</strong>
            {phase === 'completed'
              ? `Every number has been drawn. ${team.drawCount} of them are yours.`
              : 'The organizer ended this game. Your numbers are safe.'}
          </div>
        ) : paused ? (
          <div className="sampling-turn-banner" data-testid="sampling-team-status" data-status="paused">
            <strong>Paused</strong>
            The organizer paused the game. Hold tight — this screen updates by itself.
          </div>
        ) : myTurn ? (
          <div className="sampling-turn-banner sampling-turn-banner--mine" data-testid="sampling-team-status" data-status="mine" aria-live="polite">
            <strong>It’s your turn!</strong>
            {phase === 'spinning' ? 'Drawing your number…' : 'Tap SPIN to draw your number.'}
          </div>
        ) : (
          <div className="sampling-turn-banner sampling-turn-banner--waiting" data-testid="sampling-team-status" data-status="waiting" aria-live="polite">
            <strong>Wait for your turn</strong>
            {game.currentTeamName ? `${game.currentTeamName} is playing now.` : 'The game has not started yet.'}
          </div>
        )}

        <div className="sampling-reel" data-testid="sampling-reel">
          <span className="sampling-reel-label">
            {phase === 'spinning' ? 'Drawing…' : won ? 'Your number' : finished ? 'Your last number' : 'Number'}
          </span>
          <span
            className={`sampling-reel-number ${rolling ? 'sampling-reel-number--rolling' : ''} ${won ? 'sampling-reel-number--won' : ''} ${idleReel ? 'sampling-reel-number--idle' : ''}`}
            data-testid="sampling-reel-number"
            aria-live="polite"
          >
            {display}
          </span>
          <span className="sampling-reel-hint" data-testid="sampling-reel-hint">
            {finished
              ? `${game.drawnCount} of ${game.totalNumbers} numbers drawn in all`
              : `${game.drawnCount} drawn · ${game.remaining} still in the pool`}
          </span>
        </div>

        {notice && (
          <p className="rounded-xl bg-amber-400/15 px-3 py-2 text-center text-xs font-bold text-amber-100" role="status" data-testid="sampling-notice">
            {notice}
          </p>
        )}

        {phase === 'revealed' && lastDraw && (
          <div className="sampling-stage-card text-center" data-testid="sampling-reveal">
            <p className="sampling-reveal-title">You drew {lastDraw.number}</p>
            <p className="sampling-stage-note mt-0.5" data-testid="sampling-next">
              {upNext ? `Next up: ${upNext}` : 'That was the last number.'}
            </p>
          </div>
        )}

        {myTurn && !finished ? (
          <button
            type="button"
            className="sampling-spin"
            onClick={() => void spin()}
            disabled={phase === 'spinning'}
            data-testid="sampling-spin"
            aria-disabled={phase === 'spinning'}
          >
            {phase === 'spinning' ? 'Drawing…' : 'SPIN'}
          </button>
        ) : finished ? (
          <button type="button" className="sampling-spin sampling-spin--quiet" onClick={onExit} data-testid="sampling-team-done">
            <Check className="mr-1 inline h-4 w-4" /> All done — leave this page
          </button>
        ) : (
          <div className="sampling-stage-card text-center" data-testid="sampling-waiting">
            <Hourglass className="mx-auto h-5 w-5 text-amber-200" />
            <p className="sampling-waiting-title">You are in the queue</p>
            <p className="sampling-stage-note mt-0.5">
              This page switches to yours on its own — keep it open.
            </p>
          </div>
        )}

        <div className="sampling-stage-card">
          <h2>Your numbers</h2>
          <div className="sampling-mine" data-testid="sampling-mine">
            {team.numbers.length ? team.numbers.map((number) => (
              <span key={number} className="sampling-chip sampling-chip--gold">{number}</span>
            )) : <span className="sampling-stage-empty">Nothing yet — your first draw is coming.</span>}
          </div>
        </div>

        <div className="sampling-stage-card">
          <h2>Board</h2>
          <div className="sampling-stage-stat"><span>Numbers drawn</span><b>{game.drawnCount} / {game.totalNumbers}</b></div>
          <div className="sampling-stage-stat"><span>Still in the pool</span><b>{game.remaining}</b></div>
          <div className="sampling-stage-stat"><span>Teams</span><b>{game.teamCount}</b></div>
          <div className="sampling-stage-stat"><span>Turn</span><b>{game.status === 'draft' ? '—' : game.turnNumber}</b></div>
          {finished && (
            <div className="mt-2 border-t border-white/10 pt-2">
              {[...bundle.teams].sort((a, b) => b.drawCount - a.drawCount).map((entry) => (
                <div key={entry.id} className="sampling-stage-stat">
                  <span className="truncate">{entry.id === team.id ? `${entry.name} (you)` : entry.name}</span>
                  <b>{entry.drawCount}</b>
                </div>
              ))}
            </div>
          )}
        </div>

        {!finished && bundle.teams.length > 1 && (
          <div className="sampling-stage-card">
            <h2><Users className="mr-1 inline h-3 w-3" /> Teams in this game</h2>
            {bundle.teams.map((entry) => (
              <div key={entry.id} className="sampling-stage-stat">
                <span className={`truncate ${entry.id === game.currentTeamId ? 'sampling-stage-active-team' : ''}`}>
                  {entry.id === team.id ? `${entry.name} (you)` : entry.name}
                </span>
                <b>{entry.drawCount}</b>
              </div>
            ))}
          </div>
        )}

        {finished && (
          <div className="sampling-complete" data-testid="sampling-team-complete">
            <span className="sampling-kicker bg-white/40 text-amber-900"><Trophy className="h-3 w-3" /> Finished</span>
            <h2>GAME COMPLETED!</h2>
            <p>{game.drawnCount} numbers drawn by {game.teamCount} team{game.teamCount === 1 ? '' : 's'}</p>
          </div>
        )}

        <p className="text-center text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-200/40">
          <Sparkles className="mr-1 inline h-3 w-3" /> CODE Rx Sampling
        </p>
      </main>
    </div>
  );
};

export default SamplingTeam;
