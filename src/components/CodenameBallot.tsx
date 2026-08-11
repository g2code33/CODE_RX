import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronRight, Eye, LockKeyhole, RefreshCw, ShieldAlert, Sparkles } from 'lucide-react';
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

  const reveal = async () => {
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
      setRevealed(true);
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.message || 'Could not reveal the ballot.' });
    } finally {
      setLoading(false);
    }
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
      if (!result.available) setMessage({ type: 'error', text: `${result.message} Attempts used: ${result.attemptsUsed || 0}/3` });
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
      setSelected(null);
      setAvailability(null);
      setMessage({ type: 'info', text: result.message });
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
      setAvailability(null);
      setSelected(null);
      // The backend is the source of truth after a concurrent claim.
      const ballot = await db.codenames.ballot().catch(() => null);
      if (ballot) {
        setChoices(ballot.choices || []);
        setPassesUsed(Number(ballot.passesUsed || passesUsed));
        setBallotTitle(ballot.ballotTitle || (ballot.pool === 'founding' ? 'Founding Codename Ballot' : 'Member Codename Ballot'));
        setPool(ballot.pool === 'founding' ? 'founding' : 'member');
        setExhaustedPrompt(ballot.exhaustedPrompt || null);
      }
    } finally {
      setLoading(false);
    }
  };

  return <section className="relative overflow-hidden rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-950 via-[#073a29] to-slate-950 p-6 text-white shadow-2xl sm:p-9"><div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-emerald-400/15 blur-3xl" /><div className="relative"><div className="flex items-start justify-between gap-4"><div><p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-emerald-300"><Sparkles className="h-3.5 w-3.5" /> Code Rx identity protocol</p><h2 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">CHOOSE YOUR CODE NAME</h2><p className="mt-2 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-300">{pool === 'founding' ? 'Founding identity pool' : 'Member codename pool'}</p><p className="mt-3 max-w-xl text-sm leading-6 text-emerald-50/75">Your Code Rx identity is chosen here. You have up to <strong className="text-white">3 successful selections</strong>. Unavailable names do not use an attempt.</p></div><div className="rounded-xl border border-emerald-300/25 bg-white/10 px-3 py-2 text-right"><p className="text-[9px] font-black uppercase tracking-widest text-emerald-200">Successful selections</p><p className="mt-1 text-xl font-black">{passesUsed}/3</p></div></div>
      {!revealed ? <div className="mt-8"><button type="button" disabled={loading} onClick={reveal} className="inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-5 py-3 text-xs font-black uppercase tracking-wider text-emerald-950 transition hover:bg-emerald-300 disabled:opacity-60">{loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}REVEAL CODE NAME BALLOT</button><p className="mt-4 flex items-center gap-2 text-xs text-emerald-100/60"><LockKeyhole className="h-3.5 w-3.5" />The ballot remains private until you choose to reveal it.</p></div> : <><AnimatePresence mode="wait">{selected && availability?.available ? <motion.div key="decision" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="mt-8 rounded-2xl border border-emerald-300/30 bg-emerald-400/10 p-5"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-200">Available</p><h3 className="mt-1 text-3xl font-black">{selected.display_name}</h3><p className="mt-2 text-sm text-emerald-50/80">This identity is available right now. Claim it, or pass it permanently and continue.</p><div className="mt-5 flex flex-col gap-3 sm:flex-row"><button disabled={loading} onClick={claim} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-400 px-5 py-3 text-xs font-black uppercase tracking-wider text-emerald-950 disabled:opacity-60"><Check className="h-4 w-4" />CLAIM THIS CODENAME</button>{passesUsed < 2 && <button disabled={loading} onClick={chooseAnother} className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200/30 bg-white/5 px-5 py-3 text-xs font-black uppercase tracking-wider text-white disabled:opacity-60">CHOOSE ANOTHER <ChevronRight className="h-4 w-4" /></button>}</div>{passesUsed >= 2 && <p className="mt-4 text-xs font-bold text-emerald-100">This is your third successful selection. Claim it to complete your identity.</p>}</motion.div> : <motion.div key="ballot" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-8"><div className="mb-4 flex items-center justify-between"><p className="text-sm font-bold text-emerald-50">{ballotTitle} · Select one codename to check availability.</p><button type="button" onClick={reveal} disabled={loading} className="text-xs font-bold text-emerald-200 hover:text-white">Refresh ballot</button></div>{choices.length ? <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{choices.map((choice) => <button key={choice.id} type="button" disabled={loading} onClick={() => select(choice)} className="group flex items-center justify-between rounded-xl border border-emerald-200/15 bg-white/5 px-4 py-3 text-left transition hover:border-emerald-300/60 hover:bg-emerald-400/15 disabled:opacity-50"><span className="text-sm font-black">{choice.display_name}</span><ChevronRight className="h-4 w-4 text-emerald-300 transition group-hover:translate-x-0.5" /></button>)}</div> : <div className="rounded-xl border border-emerald-200/20 bg-white/5 p-5 text-sm text-emerald-100">{exhaustedPrompt || (pool === 'founding' ? 'All founding codenames are currently unavailable. Ask PHANTOM to create or release a custom founding codename.' : 'No member codenames are currently in the ballot. Ask PHANTOM to add more.')}</div>}</motion.div>}</AnimatePresence></>}
      {message && <div className={`mt-5 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${message.type === 'error' ? 'border-red-300/30 bg-red-500/15 text-red-100' : 'border-emerald-200/20 bg-white/5 text-emerald-100'}`}>{message.type === 'error' ? <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /> : <Check className="mt-0.5 h-4 w-4 shrink-0" />}<span>{message.text}</span></div>}</div></section>;
};
