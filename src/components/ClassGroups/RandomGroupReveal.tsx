import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, Users, X } from 'lucide-react';

/**
 * CODE Rx — Random Group Selection reveal.
 *
 * A full-screen, premium reveal experience: golden orbital carousel of group
 * cards, dark-emerald status panel, white congratulations panel with confetti
 * and the three-stage progress track — closely following the design reference
 * (emerald + gold + ivory over an atmospheric blue-white backdrop; premium
 * and professional — appropriate for a university setting).
 *
 * IMPORTANT: the backend has ALREADY chosen and persisted the winning group
 * before this component mounts (`winnerId` comes from the random-draw API
 * response). This screen is pure theatre — skipping it or losing animation
 * frames can never change the outcome.
 */

interface RevealGroup { id: number; name: string }

const SPIN_MS = 3400;
const SETTLE_MS = 320;

const easeOutQuart = (p: number) => 1 - Math.pow(1 - p, 4);

const cardWidth = () => {
  if (typeof window === 'undefined') return 124;
  return Math.round(Math.min(148, Math.max(96, window.innerWidth * 0.235)));
};

export const RandomGroupReveal = ({
  groups,
  winnerId,
  activityName,
  onClose,
}: {
  groups: RevealGroup[];
  winnerId: number;
  activityName?: string;
  onClose: () => void;
}) => {
  const [phase, setPhase] = useState<'spinning' | 'revealed'>('spinning');
  const [eased, setEased] = useState(0);
  const [sound, setSound] = useState(false); // OFF by default, always
  const [cardW, setCardW] = useState(cardWidth);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef(0);
  const tickRef = useRef(-1);
  const audioRef = useRef<AudioContext | null>(null);

  const safeGroups = groups.length ? groups : [{ id: winnerId, name: 'Your group' }];
  const winnerIndex = Math.max(0, safeGroups.findIndex((group) => Number(group.id) === Number(winnerId)));
  const winner = safeGroups[winnerIndex] || safeGroups[0];

  // The strip: several full passes, then the round that ends on the winner,
  // then one more round so the right side never runs empty.
  const sequence = useMemo(() => {
    const passes = Math.max(2, Math.ceil(12 / safeGroups.length));
    const strip: Array<{ group: RevealGroup; key: string }> = [];
    for (let round = 0; round < passes + 2; round += 1) {
      for (let i = 0; i < safeGroups.length; i += 1) {
        strip.push({ group: safeGroups[i], key: `c${round}-${i}` });
      }
    }
    return strip;
  }, [safeGroups]);

  const landingIndex = sequence.length - 2 * safeGroups.length + winnerIndex;

  // Reduced motion: skip straight to the (already final) result.
  useEffect(() => {
    const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) setPhase('revealed');
  }, []);

  // The spin: rAF-driven ease-out; the strip always lands with the winning
  // card exactly under the golden centre ring.
  useEffect(() => {
    if (phase !== 'spinning') return;
    const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { setPhase('revealed'); return; }
    let cancelled = false;
    const step = (now: number) => {
      if (cancelled) return;
      if (startRef.current === null) startRef.current = now;
      const p = Math.min(1, (now - startRef.current) / SPIN_MS);
      const e = easeOutQuart(p);
      setEased(e);
      const crossing = Math.floor(e * landingIndex);
      if (crossing !== tickRef.current) {
        tickRef.current = crossing;
        if (sound) chime(620 + (crossing % 4) * 40, 0.03, 0.05);
      }
      if (p < 1) rafRef.current = requestAnimationFrame(step);
      else window.setTimeout(() => { if (!cancelled) { setPhase('revealed'); if (sound) { chime(660, 0.12, 0.14); chime(880, 0.16, 0.22); } } }, SETTLE_MS);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => { cancelled = true; cancelAnimationFrame(rafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, landingIndex]);

  useEffect(() => {
    const onResize = () => setCardW(cardWidth());
    window.addEventListener('resize', onResize);
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('resize', onResize); window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  // Tiny WebAudio synth — nothing loads, nothing plays unless enabled.
  const chime = (frequency: number, duration: number, gainValue: number) => {
    try {
      audioRef.current ??= new (window.AudioContext || (window as any).webkitAudioContext)();
      const ctx = audioRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(gainValue, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration + 0.05);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration + 0.06);
    } catch { /* audio unavailable — silence is fine */ }
  };

  const skip = useCallback(() => { setPhase('revealed'); }, []);

  const confetti = useMemo(() => Array.from({ length: 36 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 1.6,
    duration: 2.6 + Math.random() * 2.2,
    drift: (Math.random() - 0.5) * 220,
    size: 8 + Math.random() * 8,
    color: [' #f59e0b', '#fbbf24', '#059669', '#10b981', '#fef3c7'][i % 5],
    round: i % 3 === 0,
  })), []);

  const sparkles = useMemo(() => Array.from({ length: 16 }, (_, i) => ({
    id: i,
    top: 6 + Math.random() * 84,
    left: Math.random() * 96,
    delay: Math.random() * 2.4,
    size: 10 + Math.random() * 14,
    gold: i % 2 === 0,
  })), []);

  const stage = phase === 'revealed' ? 2 : (eased < 0.08 ? 0 : 1);
  const stageDone = (index: number) => stage > index || (stage === index && phase === 'revealed');
  const stageActive = (index: number) => stage === index && phase !== 'revealed';

  const gap = 18;
  const stripWidth = sequence.length * (cardW + gap);
  const finalOffset = landingIndex * (cardW + gap) + cardW / 2;
  const offset = phase === 'revealed' ? finalOffset : eased * finalOffset;

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto" role="dialog" aria-modal="true" aria-label="Random group selection" data-testid="cgm-random-reveal">
      {/* Atmospheric backdrop over the blurred app */}
      <div className="absolute inset-0 bg-gradient-to-b from-sky-100/95 via-blue-50/95 to-emerald-50/95 backdrop-blur-xl" />
      {/* Floating sparkles */}
      {sparkles.map((sparkle) => (
        <span
          key={sparkle.id}
          aria-hidden
          className={`pointer-events-none absolute select-none cgm-reveal-anim ${sparkle.gold ? 'text-amber-400' : 'text-emerald-400'}`}
          style={{ top: `${sparkle.top}%`, left: `${sparkle.left}%`, fontSize: sparkle.size, animation: `cgmSparkle 2.6s ease-in-out ${sparkle.delay}s infinite` }}
        >✦</span>
      ))}
      {/* Celebration confetti on reveal */}
      {phase === 'revealed' && confetti.map((piece) => (
        <span
          key={piece.id}
          aria-hidden
          className="pointer-events-none absolute top-0"
          style={{
            left: `${piece.left}%`,
            width: piece.size,
            height: piece.round ? piece.size : piece.size * 0.45,
            background: piece.color,
            borderRadius: piece.round ? '9999px' : '2px',
            ['--drift' as any]: `${piece.drift}px`,
            animation: `cgmConfetti ${piece.duration}s linear ${piece.delay}s 1 forwards`,
          }}
        />
      ))}

      <div className="relative mx-auto flex min-h-full w-full max-w-3xl flex-col items-center px-3 py-5 sm:py-8">
        {/* A. Top title panel */}
        <div className="relative w-full rounded-3xl border-[3px] border-emerald-500/80 bg-white/95 px-4 py-4 shadow-[0_18px_50px_-12px_rgba(6,95,70,0.45)] sm:px-8">
          <button
            type="button"
            aria-label="Close random selection"
            className="absolute -right-2 -top-2 flex h-9 w-9 items-center justify-center rounded-full border-2 border-emerald-200 bg-white text-emerald-700 shadow-md transition hover:bg-emerald-50"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-center justify-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-inner">
              <Users className="h-6 w-6" />
            </span>
            <div className="min-w-0 text-center sm:text-left">
              <h1 className="text-lg font-black uppercase tracking-tight text-emerald-900 sm:text-2xl">Random Group Selection</h1>
              <p className="text-[11px] font-semibold italic text-slate-500 sm:text-sm">All groups have an equal chance of being selected</p>
            </div>
          </div>
        </div>

        {/* C. The golden orbital carousel */}
        <div className="relative mt-7 w-full">
          {/* Orbit halos behind the strip */}
          <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[62%] w-[130%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-2 border-amber-300/60 blur-[1px] cgm-reveal-anim" style={{ animation: 'cgmOrbit 7s linear infinite' }} />
          <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[48%] w-[112%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border border-amber-200/70 cgm-reveal-anim" style={{ animation: 'cgmOrbit 11s linear infinite reverse' }} />
          {/* Light rays bursting from the centre */}
          <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 opacity-40 cgm-reveal-anim" style={{ background: 'conic-gradient(from 0deg, rgba(251,191,36,0) 0deg, rgba(251,191,36,.55) 12deg, rgba(251,191,36,0) 24deg, rgba(251,191,36,0) 90deg, rgba(251,191,36,.45) 102deg, rgba(251,191,36,0) 114deg, rgba(251,191,36,0) 180deg, rgba(251,191,36,.55) 192deg, rgba(251,191,36,0) 204deg, rgba(251,191,36,0) 270deg, rgba(251,191,36,.45) 282deg, rgba(251,191,36,0) 294deg)', borderRadius: '9999px', filter: 'blur(6px)', animation: 'cgmRay 14s linear infinite' }} />

          <div className="relative overflow-hidden py-6" style={{ maskImage: 'linear-gradient(90deg, transparent, black 12%, black 88%, transparent)', WebkitMaskImage: 'linear-gradient(90deg, transparent, black 12%, black 88%, transparent)' }}>
            {/* The centre selection ring sits above the cards */}
            <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 z-20 h-[calc(100%-8px)] w-28 -translate-x-1/2 -translate-y-1/2 rounded-2xl border-[3px] border-amber-400 bg-amber-200/10 shadow-[0_0_38px_10px_rgba(251,191,36,0.55)] sm:w-32" />
            <div
              className="flex will-change-transform"
              style={{ gap, transform: `translateX(calc(50vw - ${offset}px + ${(cardW / 2) * 0}px))`, transition: phase === 'revealed' ? 'transform 240ms ease-out' : 'none' }}
            >
              {sequence.map((entry, index) => {
                const isWinnerCard = phase === 'revealed' && index === landingIndex;
                return (
                  <div
                    key={entry.key}
                    className={`flex shrink-0 flex-col items-center justify-center rounded-2xl border-2 bg-white px-3 py-4 shadow-[0_10px_24px_-8px_rgba(15,23,42,0.25)] transition-all duration-300 ${isWinnerCard ? 'z-10 scale-110 border-amber-400 shadow-[0_0_34px_6px_rgba(251,191,36,0.6)]' : 'border-slate-100'}`}
                    style={{ width: cardW, minHeight: 108 }}
                  >
                    <span className={`flex h-10 w-10 items-center justify-center rounded-xl text-white shadow ${isWinnerCard ? 'bg-amber-400' : ['bg-emerald-500', 'bg-sky-500', 'bg-purple-500', 'bg-teal-500'][index % 4]}`}>
                      <Users className="h-5 w-5" />
                    </span>
                    <span className={`mt-2 max-w-[9.5rem] truncate text-center text-xs font-black ${isWinnerCard ? 'text-amber-600' : 'text-slate-700'}`}>{entry.group.name}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* D. Selection status panel / E. Result announcement */}
        {phase === 'spinning' ? (
          <div className="mt-4 flex w-full max-w-xl items-center gap-3 rounded-full border border-amber-300/80 bg-gradient-to-r from-emerald-800 to-emerald-950 px-5 py-3.5 shadow-[0_14px_36px_-10px_rgba(6,78,59,0.65)] ring-1 ring-amber-300/40" data-testid="cgm-random-status">
            <RefreshCw className="h-5 w-5 shrink-0 animate-spin text-amber-300" />
            <div className="min-w-0">
              <p className="text-sm font-black text-white">Selecting your group…</p>
              <p className="truncate text-[11px] font-medium italic text-emerald-200/90">Please wait while we make a random selection…</p>
            </div>
          </div>
        ) : (
          <div className="cgm-reveal-anim mt-4 w-full max-w-xl rounded-3xl border-2 border-amber-300 bg-gradient-to-b from-white to-amber-50/70 px-5 py-6 text-center shadow-[0_24px_60px_-16px_rgba(180,83,9,0.45)]" style={{ animation: 'cgmPop 460ms ease-out both' }} data-testid="cgm-random-result">
            <p className="text-base font-black uppercase tracking-wide text-emerald-600">Congratulations!</p>
            <p className="mt-1 text-2xl font-black text-emerald-900 sm:text-3xl">You are assigned to</p>
            <span className="mt-3 inline-block max-w-full break-words rounded-full bg-gradient-to-r from-emerald-600 to-emerald-500 px-8 py-2.5 text-2xl font-black text-white shadow-[0_10px_26px_-8px_rgba(5,150,105,0.8)] sm:text-3xl">{winner?.name}</span>
            <p aria-hidden className="mt-3 select-none text-2xl">🎉<span className="mx-2 text-amber-400">✦</span>🎊</p>
            {activityName && <p className="mt-1 text-[11px] font-semibold text-slate-400">{activityName}</p>}
            <button type="button" className="cgm-primary-button mt-4 w-full sm:w-auto" onClick={onClose}>Continue</button>
          </div>
        )}

        {/* F. Three-stage progress indicator */}
        <div className="mt-6 flex w-full max-w-xl items-center" data-testid="cgm-random-progress">
          {['Processing…', 'Random Selection…', 'Complete!'].map((label, index) => (
            <div key={label} className={`flex items-center ${index < 2 ? 'flex-1' : ''}`}>
              <div className="flex flex-col items-center gap-1">
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full border-2 text-[10px] font-black transition-all duration-300 ${stageDone(index) ? 'border-emerald-500 bg-emerald-500 text-white' : stageActive(index) ? 'border-amber-400 bg-amber-100 text-amber-600' : 'border-slate-300 bg-white text-slate-400'}`}
                >
                  {stageDone(index) ? '✓' : index + 1}
                </span>
                <span className={`whitespace-nowrap text-[10px] font-black uppercase tracking-wide ${stageDone(index) ? 'text-emerald-600' : stageActive(index) ? 'text-amber-600' : 'text-slate-400'}`}>{label}</span>
              </div>
              {index < 2 && <div className={`mx-1 mb-4 h-0.5 flex-1 rounded transition-all duration-500 ${stage > index ? 'bg-emerald-500' : 'bg-slate-200'}`} />}
            </div>
          ))}
        </div>

        {/* Controls: skip, sound (off by default) — never blocking navigation */}
        <div className="mt-6 flex w-full max-w-xl items-center justify-between pb-4">
          <button
            type="button"
            className="rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-[11px] font-black uppercase tracking-wider text-slate-500 transition hover:bg-white"
            onClick={() => setSound((value) => { const next = !value; if (next) chime(700, 0.06, 0.08); return next; })}
            aria-pressed={sound}
          >
            {sound ? '🔊 Sound on' : '🔇 Sound off'}
          </button>
          {phase === 'spinning' && (
            <button type="button" className="mini-button" onClick={skip} data-testid="cgm-random-skip">Skip animation</button>
          )}
        </div>
      </div>
    </div>
  );
};
