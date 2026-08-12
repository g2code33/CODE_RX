import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, ChevronRight, Eye, EyeOff, LockKeyhole, ShieldAlert, Sparkles } from 'lucide-react';
import { db } from '../lib/cloudflare';

export const CodenameBallot = ({ onClaimed, codenamePath = 'member' }: { onClaimed: (codename: string) => void; codenamePath?: 'member' | 'custom_founding' | 'direct_founding' | null }) => {
  const [revealed, setRevealed] = useState(false);
  const [choices, setChoices] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [availability, setAvailability] = useState<any | null>(null);
  const [passesUsed, setPassesUsed] = useState(0);
  const [ballotTitle, setBallotTitle] = useState(codenamePath === 'custom_founding' ? 'Founding Codename Ballot' : 'Member Codename Ballot');
  const [pool, setPool] = useState<'member' | 'founding'>(codenamePath === 'custom_founding' ? 'founding' : 'member');
  const [exhaustedPrompt, setExhaustedPrompt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'info'; text: string } | null>(null);

  const reviewBallot = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const ballot = await db.codenames.ballot();
      if (ballot.completed) {
        onClaimed(ballot.codename);
        return;
      }
      setChoices(ballot.choices || []);
      setPassesUsed(Number(ballot.passesUsed || 0));
      setBallotTitle(ballot.ballotTitle || (ballot.pool === 'founding' ? 'Founding Codename Ballot' : 'Member Codename Ballot'));
      setPool(ballot.pool === 'founding' ? 'founding' : 'member');
      setExhaustedPrompt(ballot.exhaustedPrompt || null);
      setSelected(null);
      setAvailability(null);
      setRevealed(true);
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.message || 'Could not open the protected ballot.' });
    } finally {
      setLoading(false);
    }
  };

  const coverBallot = (preserveMessage = false) => {
    setRevealed(false);
    setSelected(null);
    setAvailability(null);
    if (!preserveMessage) setMessage(null);
  };

  const select = async (choice: any) => {
    setLoading(true);
    setSelected(choice);
    setAvailability(null);
    setMessage(null);
    try {
      const result = await db.codenames.check(choice.id);
      setAvailability(result);
      setPassesUsed(Number(result.attemptsUsed || 0));
      if (!result.available) {
        setMessage({ type: 'error', text: `${result.message} This did not use a successful selection. The ballot is covered again; tap Review ballot to continue.` });
        coverBallot(true);
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.message || 'Could not check this codename.' });
    } finally {
      setLoading(false);
    }
  };

  const chooseAnother = async () => {
    if (!selected) return;
    setLoading(true);
    try {
      const result = await db.codenames.pass(selected.id);
      setPassesUsed(Number(result.attemptsUsed || passesUsed + 1));
      setChoices((current) => current.filter((choice) => choice.id !== selected.id));
      setMessage({ type: 'info', text: `${result.message} The ballot is covered again; tap Review ballot for your next selection.` });
      coverBallot(true);
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.message || 'Could not pass this codename.' });
    } finally {
      setLoading(false);
    }
  };

  const claim = async () => {
    if (!selected) return;
    setLoading(true);
    try {
      const result = await db.codenames.claim(selected.id);
      onClaimed(result.codename);
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.message || 'This codename could not be claimed.' });
      coverBallot(true);
    } finally {
      setLoading(false);
    }
  };

  const attemptsRemaining = Math.max(0, 3 - passesUsed);
  return <section className="relative overflow-hidden rounded-3xl border border-emerald-100 bg-gradient-to-br from-[#fbfffc] via-[#effaf3] to-[#e1f5e9] p-6 text-slate-800 shadow-xl shadow-emerald-950/5 sm:p-9">
    <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-emerald-300/25 blur-3xl" />
    <div className="relative"><div className="flex items-start justify-between gap-4"><div><p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-emerald-700"><Sparkles className="h-3.5 w-3.5" /> Code Rx identity protocol</p><h2 className="mt-3 text-2xl font-black tracking-tight text-slate-800 sm:text-3xl">CHOOSE YOUR CODENAME</h2><p className="mt-2 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">{pool === 'founding' ? 'Founding identity pool' : 'Member codename pool'}</p><p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">The ballot stays covered until you deliberately review it. You have up to <strong className="text-slate-800">3 successful selections</strong>; unavailable names never consume a chance.</p></div><div className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-right shadow-sm"><p className="text-[9px] font-black uppercase tracking-widest text-emerald-700">Selections used</p><p className="mt-1 text-xl font-black text-slate-800">{passesUsed}/3</p></div></div>
      {!revealed ? <div className="mt-8 rounded-2xl border border-emerald-200 bg-white/90 p-6 text-center shadow-sm"><div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-700"><LockKeyhole className="h-5 w-5" /></div><h3 className="mt-4 text-lg font-black text-slate-800">Ballot covered</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">Tap Review ballot when you are ready to inspect a codename. You can re-open it while successful selections remain.</p><button type="button" disabled={loading || attemptsRemaining === 0} onClick={() => void reviewBallot()} className="mt-5 inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-xs font-black uppercase tracking-wider text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"><Eye className="h-4 w-4" />{loading ? 'Opening ballot…' : 'Review ballot'}</button>{attemptsRemaining === 0 && <p className="mt-4 text-xs font-bold text-amber-700">Your successful selections are complete. Claim the final available identity to finish.</p>}</div> : <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-8"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm font-bold text-slate-700">{ballotTitle} · Review one codename at a time.</p><button type="button" onClick={() => coverBallot()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-50"><EyeOff className="h-4 w-4" />Cover ballot</button></div>{selected && availability?.available ? <div className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">Available</p><h3 className="mt-1 text-3xl font-black text-slate-800">{selected.display_name}</h3><p className="mt-2 text-sm text-slate-600">This identity is available right now. Claim it, or use one successful selection to review another covered ballot.</p><div className="mt-5 flex flex-col gap-3 sm:flex-row"><button disabled={loading} onClick={() => void claim()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-xs font-black uppercase tracking-wider text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"><Check className="h-4 w-4" />{loading ? 'Claiming…' : 'Claim this codename'}</button>{passesUsed < 2 && <button disabled={loading} onClick={() => void chooseAnother()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-xs font-black uppercase tracking-wider text-slate-700 hover:bg-slate-50 disabled:opacity-60">Choose another <ChevronRight className="h-4 w-4" /></button>}</div>{passesUsed >= 2 && <p className="mt-4 text-xs font-bold text-amber-700">This is your final successful selection. Claim it to complete your identity.</p>}</div> : choices.length ? <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{choices.map((choice) => <button key={choice.id} type="button" disabled={loading} onClick={() => void select(choice)} className="group flex items-center justify-between rounded-xl border border-emerald-100 bg-white px-4 py-3 text-left shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50 disabled:opacity-50"><span className="text-sm font-black text-slate-800">{choice.display_name}</span><ChevronRight className="h-4 w-4 text-emerald-600 transition group-hover:translate-x-0.5" /></button>)}</div> : <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">{exhaustedPrompt || (pool === 'founding' ? 'All founding codenames are currently unavailable. Ask PHANTOM to add or release a founding identity.' : 'No member codenames are currently in the ballot. Ask PHANTOM to add more.')}</div>}</motion.div>}
      {message && <div className={`mt-5 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${message.type === 'error' ? 'border-red-100 bg-red-50 text-red-700' : 'border-emerald-100 bg-emerald-50 text-emerald-800'}`}><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /><span>{message.text}</span>{message.type === 'error' && revealed && <button onClick={() => coverBallot()} className="ml-auto shrink-0 text-xs font-black text-red-700 underline">Cover</button>}</div>}</div></section>;
};
