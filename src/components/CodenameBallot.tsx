import { useEffect, useState } from 'react';
import { Check, ChevronRight, Eye, LockKeyhole, Menu, ShieldAlert, Sparkles, X } from 'lucide-react';
import { db } from '../lib/cloudflare';

type BallotPool = 'member' | 'founding';

export const CodenameBallot = ({ onClaimed, codenamePath = 'member' }: { onClaimed: (codename: string) => void; codenamePath?: 'member' | 'custom_founding' | 'direct_founding' | null }) => {
  const [ballot, setBallot] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'info'; text: string } | null>(null);
  const fallbackPool: BallotPool = codenamePath === 'custom_founding' ? 'founding' : 'member';
  const pool: BallotPool = ballot?.pool === 'founding' ? 'founding' : fallbackPool;
  const revealedChoices = ballot?.revealedChoices || [];
  const reviewTarget = Number(ballot?.reviewTarget || 0);
  const revealCount = Number(ballot?.revealCount ?? revealedChoices.length ?? 0);
  const remaining = Math.max(0, reviewTarget - revealCount);

  const loadBallot = async () => {
    setLoading(true);
    try {
      const result = await db.codenames.ballot();
      setBallot(result);
      setMessage(null);
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.message || 'Could not open the protected codename ballot.' });
    } finally { setLoading(false); }
  };

  useEffect(() => { void loadBallot(); }, []);

  const reveal = async (slot: number) => {
    setLoading(true);
    setMessage(null);
    try {
      const result = await db.codenames.reveal(slot);
      setBallot((current: any) => ({ ...current, ...result }));
      if (result.message) setMessage({ type: 'info', text: result.message });
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.message || 'That covered choice could not be opened. Choose another cover.' });
    } finally { setLoading(false); }
  };

  const claim = async (choice: any) => {
    setLoading(true);
    setMessage(null);
    try {
      const result = await db.codenames.claim(choice.id);
      onClaimed(result.codename);
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.message || 'This codename could not be claimed. Choose another revealed option if one is available.' });
      await loadBallot();
    } finally { setLoading(false); }
  };

  if (ballot?.completed) {
    return <main className="min-h-screen bg-[#f7faf8] px-4 py-8 sm:px-8"><section className="mx-auto max-w-4xl rounded-3xl border border-emerald-100 bg-white p-8 text-center shadow-xl shadow-emerald-950/5"><img src="/logo.png" alt="Code Rx Society" className="mx-auto h-16 w-16 object-contain" /><p className="mt-5 text-[10px] font-black uppercase tracking-[0.22em] text-emerald-700">Code Rx identity confirmed</p><h1 className="mt-2 text-3xl font-black text-slate-900">{ballot.codename}</h1></section></main>;
  }

  return <main className="min-h-screen bg-[#f7faf8] text-slate-900">
    <header className="sticky top-0 z-40 border-b border-emerald-100 bg-white/95 px-4 py-3 backdrop-blur sm:px-7">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4"><div className="flex min-w-0 items-center gap-3"><img src="/logo.png" alt="Code Rx Society" className="h-11 w-11 shrink-0 object-contain" /><div><p className="text-sm font-black tracking-wide text-slate-900">CODE <span className="text-emerald-600">Rx</span> SOCIETY</p><p className="text-[9px] font-black uppercase tracking-[0.18em] text-emerald-700">Protected identity ballot</p></div></div><button onClick={() => setNavOpen((current) => !current)} className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800 transition hover:bg-emerald-100" aria-expanded={navOpen}><Menu className="h-4 w-4" />Menu</button></div>
      {navOpen && <div className="mx-auto mt-3 max-w-[1600px] rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-950"><div className="flex items-start justify-between gap-4"><div><p className="font-black">How this ballot works</p><p className="mt-1 max-w-2xl leading-6 text-emerald-800">Every available codename is covered with the Code Rx logo. Open {reviewTarget || 3} covers, compare the revealed choices, then claim one. Your unfinished ballot stays protected and will open again when you sign in.</p></div><button onClick={() => setNavOpen(false)} className="rounded-lg p-2 text-emerald-700 hover:bg-white" aria-label="Close ballot help"><X className="h-4 w-4" /></button></div></div>}
    </header>

    <section className="mx-auto w-full max-w-[1600px] px-4 py-8 sm:px-7 lg:px-10 lg:py-12">
      <div className="relative overflow-hidden rounded-3xl border border-emerald-100 bg-gradient-to-br from-[#fbfffc] via-[#effaf3] to-[#e1f5e9] p-6 shadow-xl shadow-emerald-950/5 sm:p-10"><div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-emerald-300/25 blur-3xl" /><div className="relative flex flex-wrap items-start justify-between gap-5"><div className="max-w-3xl"><p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-emerald-700"><Sparkles className="h-3.5 w-3.5" /> Code Rx identity protocol</p><h1 className="mt-3 text-3xl font-black tracking-tight text-slate-800 sm:text-5xl">{pool === 'founding' ? 'CHOOSE YOUR FOUNDING NAME' : 'CHOOSE YOUR CODE NAME'}</h1><p className="mt-3 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">{pool === 'founding' ? 'Founding Name Pool' : 'Member Code Name Pool'}</p><p className="mt-4 text-sm leading-7 text-slate-600">All names stay covered until you open a card. Reveal your full comparison group first, then choose the one identity you want to claim.</p></div><div className="rounded-2xl border border-emerald-200 bg-white px-5 py-4 text-right shadow-sm"><p className="text-[9px] font-black uppercase tracking-widest text-emerald-700">Choices revealed</p><p className="mt-1 text-2xl font-black text-slate-800">{revealCount}/{reviewTarget || '—'}</p></div></div>

        {loading && !ballot ? <div className="grid min-h-72 place-items-center"><p className="rounded-xl border border-emerald-100 bg-white px-4 py-3 text-sm font-bold text-emerald-700">Opening your protected ballot…</p></div> : ballot?.exhausted ? <div className="relative mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center text-amber-900"><LockKeyhole className="mx-auto h-7 w-7" /><h2 className="mt-3 text-xl font-black">No covered choices are available</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6">{ballot.exhaustedPrompt || 'PHANTOM needs to add another codename before this ballot can continue.'}</p><button onClick={() => void loadBallot()} className="mt-5 rounded-xl border border-amber-200 bg-white px-4 py-2 text-xs font-black text-amber-800">Check again</button></div> : <>
          <div className="relative mt-8 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-black text-slate-800">Covered choices</h2><p className="mt-1 text-sm text-slate-500">{ballot?.readyToChoose ? 'Your comparison group is ready below.' : remaining ? `Open ${remaining} more covered ${remaining === 1 ? 'card' : 'cards'} to reveal all choices.` : 'Preparing your comparison group…'}</p></div>{!ballot?.readyToChoose && <span className="rounded-full border border-emerald-100 bg-white px-3 py-1.5 text-xs font-black text-emerald-700">Tap a logo cover to reveal</span>}</div>
          <div className="relative mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">{(ballot?.slots || []).map((slot: any) => {
            const revealed = slot.state === 'revealed';
            const unavailable = slot.state === 'unavailable';
            const canReveal = slot.state === 'covered' && !ballot?.readyToChoose && !loading;
            return <button key={slot.slot} disabled={!canReveal} onClick={() => void reveal(slot.slot)} className={`group min-h-44 rounded-2xl border p-4 text-left transition sm:min-h-52 ${revealed ? 'border-emerald-400 bg-white shadow-md shadow-emerald-950/5' : unavailable ? 'cursor-not-allowed border-slate-200 bg-slate-100 opacity-50' : canReveal ? 'border-emerald-200 bg-white hover:-translate-y-1 hover:border-emerald-500 hover:shadow-lg hover:shadow-emerald-950/10' : 'cursor-not-allowed border-emerald-100 bg-white/70'}`}>
              {revealed ? <div className="flex h-full flex-col justify-between"><div className="flex items-center justify-between"><span className="rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-emerald-700">Revealed</span><Eye className="h-4 w-4 text-emerald-600" /></div><div><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Choice {slot.slot}</p><h3 className="mt-2 break-words text-2xl font-black tracking-tight text-slate-800">{slot.codename.display_name}</h3></div></div> : unavailable ? <div className="flex h-full flex-col justify-between"><LockKeyhole className="h-5 w-5 text-slate-400" /><p className="text-xs font-bold text-slate-500">Unavailable</p></div> : <div className="flex h-full flex-col items-center justify-center text-center"><img src="/logo.png" alt="Covered Code Rx codename" className="h-16 w-16 object-contain transition group-hover:scale-105" /><p className="mt-3 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-700">Covered choice</p><p className="mt-1 text-xs text-slate-500">Tap to reveal</p></div>}
            </button>;
          })}</div>

          {ballot?.readyToChoose && <section className="relative mt-9 rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-700">Comparison complete</p><h2 className="mt-2 text-2xl font-black text-slate-900">Choose your permanent Code Rx identity</h2><p className="mt-2 text-sm leading-6 text-slate-600">Compare the revealed codenames and claim one. Your choice is permanent.</p></div><Check className="h-7 w-7 text-emerald-600" /></div><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{revealedChoices.map((choice: any) => <button key={choice.id} disabled={loading} onClick={() => void claim(choice)} className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-left transition hover:border-emerald-500 hover:bg-emerald-100 disabled:opacity-60"><p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">{pool === 'founding' ? 'Claim Founding Name' : 'Claim Code Name'}</p><p className="mt-1 text-xl font-black text-slate-900">{choice.display_name}</p><span className="mt-3 inline-flex items-center gap-1 text-xs font-black text-emerald-700">Choose this identity <ChevronRight className="h-3.5 w-3.5" /></span></button>)}</div></section>}
        </>}
        {message && <div role="status" className={`relative mt-6 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${message.type === 'error' ? 'border-red-100 bg-red-50 text-red-700' : 'border-emerald-100 bg-emerald-50 text-emerald-800'}`}><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /><span>{message.text}</span></div>}
      </div>
    </section>
  </main>;
};
